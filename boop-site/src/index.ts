import { serve } from "bun";
import { join } from "path";
import { unlink } from "fs/promises";
import index from "./index.html";

import sql from "./lib/db";
import {
  createSession,
  deleteSession,
  authenticate,
  requireRole,
} from "./lib/auth-server";

const UPLOAD_DIR = join(import.meta.dir, "../../uploads");
const CACHE_DIR  = join(import.meta.dir, "..", "cache");

// ── Helpers ──────────────────────────────────────────────────────────────────

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}
function err(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

const ALLOWED_IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "gif", "webp"]);

function safeImageExt(filename: string): string | null {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return ALLOWED_IMAGE_EXTS.has(ext) ? ext : null;
}

// Prevent path traversal: resolve the joined path and ensure it stays under the base dir
function safeJoin(base: string, ...parts: string[]): string | null {
  const resolved = join(base, ...parts);
  return resolved.startsWith(base + "/") || resolved === base ? resolved : null;
}

// ── Server ───────────────────────────────────────────────────────────────────

const server = serve({
  routes: {
    // Serve uploaded files (images, etc.)
    "/uploads/*": async req => {
      const url = new URL(req.url);
      const filePath = safeJoin(UPLOAD_DIR, url.pathname.replace("/uploads/", ""));
      if (!filePath) return new Response("Not found", { status: 404 });
      const file = Bun.file(filePath);
      if (!(await file.exists())) return new Response("Not found", { status: 404 });
      return new Response(file);
    },

    // Serve @3d-dice/dice-box dist assets for the 3D dice roller
    "/dice-box/*": async req => {
      const DICE_BOX_DIST = join(import.meta.dir, "../node_modules/@3d-dice/dice-box/dist");
      const url = new URL(req.url);
      const filePath = safeJoin(DICE_BOX_DIST, url.pathname.replace("/dice-box/", ""));
      if (!filePath) return new Response("Not found", { status: 404 });
      const file = Bun.file(filePath);
      if (!(await file.exists())) return new Response("Not found", { status: 404 });
      return new Response(file);
    },

    // ── Auth ────────────────────────────────────────────────────────────────

    "/api/auth/logout": {
      async POST(req) {
        const auth = req.headers.get("Authorization");
        const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
        if (token) await deleteSession(token);
        return json({ ok: true });
      },
    },

    // ── Discord OAuth ────────────────────────────────────────────────────────

    "/auth/discord": {
      async GET(_req) {
        const clientId    = process.env.DISCORD_CLIENT_ID;
        const siteUrl     = process.env.SITE_URL ?? "https://boop.fish";
        const redirectUri = encodeURIComponent(`${siteUrl}/auth/discord/callback`);
        if (!clientId) return err("Discord OAuth not configured", 500);
        const url = `https://discord.com/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=identify%20guilds%20guilds.members.read`;
        return Response.redirect(url, 302);
      },
    },

    "/auth/discord/callback": {
      async GET(req) {
        const siteUrl      = process.env.SITE_URL ?? "https://boop.fish";
        const clientId     = process.env.DISCORD_CLIENT_ID!;
        const clientSecret = process.env.DISCORD_CLIENT_SECRET!;
        const guildId      = process.env.DISCORD_GUILD_ID;
        const redirectUri  = `${siteUrl}/auth/discord/callback`;

        const url  = new URL(req.url);
        const code = url.searchParams.get("code");
        if (!code) return Response.redirect(`${siteUrl}/#/auth?discord_error=missing_code`, 302);

        // Exchange code for access token
        const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id:     clientId,
            client_secret: clientSecret,
            grant_type:    "authorization_code",
            code,
            redirect_uri:  redirectUri,
          }),
        });
        if (!tokenRes.ok) return Response.redirect(`${siteUrl}/#/auth?discord_error=token_exchange`, 302);
        const { access_token } = await tokenRes.json() as { access_token: string };

        // Fetch Discord user profile
        const discordUser = await fetch("https://discord.com/api/users/@me", {
          headers: { Authorization: `Bearer ${access_token}` },
        }).then(r => r.json()) as { id: string; username: string; avatar: string | null };

        const discordId       = discordUser.id;
        const discordUsername = discordUser.username;
        const discordAvatar   = discordUser.avatar
          ? `https://cdn.discordapp.com/avatars/${discordId}/${discordUser.avatar}.png`
          : null;

        // Check guild membership and determine role from Discord server roles
        let discordRole: "member" | "friend" = "friend";
        if (guildId) {
          const memberRes = await fetch(`https://discord.com/api/users/@me/guilds/${guildId}/member`, {
            headers: { Authorization: `Bearer ${access_token}` },
          });
          if (!memberRes.ok) {
            return Response.redirect(`${siteUrl}/#/auth?discord_error=not_in_guild`, 302);
          }
          const memberData = await memberRes.json() as { roles: string[] };
          const memberRoleId = process.env.DISCORD_MEMBER_ROLE_ID;
          // If no member role configured, everyone in the guild is a member
          discordRole = (!memberRoleId || memberData.roles.includes(memberRoleId)) ? "member" : "friend";
        }

        // Find existing user by discord_id, or auto-link by matching username
        let [user] = await sql`SELECT id, role FROM users WHERE discord_id = ${discordId}`;

        if (!user) {
          // Try to link to an existing account with the same username (covers bootstrap admin)
          const [existing] = await sql`SELECT id, role FROM users WHERE username = ${discordUsername} AND discord_id IS NULL`;
          if (existing) {
            // Only update role if it won't downgrade an officer/admin
            const updatedRole = (existing.role === "officer" || existing.role === "admin")
              ? existing.role : discordRole;
            await sql`
              UPDATE users SET discord_id = ${discordId}, discord_username = ${discordUsername},
                               discord_avatar = ${discordAvatar}, role = ${updatedRole}, updated_at = NOW()
              WHERE id = ${existing.id}
            `;
            user = existing;
          } else {
            // Create a new account — first user ever becomes admin automatically
            let username = discordUsername;
            const taken = await sql`SELECT id FROM users WHERE username = ${username}`;
            if (taken.length) username = `${discordUsername}_${discordId.slice(-4)}`;

            const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM users`;
            const roleToAssign = count === 0 ? "admin" : discordRole;

            const [newUser] = await sql`
              INSERT INTO users (username, password_hash, role, discord_id, discord_username, discord_avatar, discord_name)
              VALUES (${username}, '', ${roleToAssign}, ${discordId}, ${discordUsername}, ${discordAvatar}, ${discordUsername})
              RETURNING id, role
            `;
            user = newUser;
          }
        } else {
          // Sync Discord profile info; re-evaluate role on each login but never downgrade officers/admins
          const updatedRole = (user.role === "officer" || user.role === "admin")
            ? user.role : discordRole;
          await sql`
            UPDATE users SET discord_username = ${discordUsername}, discord_avatar = ${discordAvatar},
                             discord_name = ${discordUsername}, role = ${updatedRole}, updated_at = NOW()
            WHERE id = ${user.id}
          `;
        }

        const sessionToken = await createSession(user.id);
        return Response.redirect(`${siteUrl}/#/auth?token=${sessionToken}`, 302);
      },
    },

    "/api/auth/me": {
      async GET(req) {
        const user = await authenticate(req);
        if (!user) return err("Unauthorized", 401);
        const [full] = await sql`
          SELECT id, username, email, role, character_name, family_name, discord_name,
                 discord_id, discord_username, discord_avatar, ribbit_count, bdo_class,
                 alt_class, gear_ap, gear_aap, gear_dp, timezone
          FROM users WHERE id = ${user.id}
        `;
        return json(full);
      },
    },

    "/api/auth/profile": {
      async PATCH(req) {
        const user = await authenticate(req);
        if (!user) return err("Unauthorized", 401);

        const { family_name, email: newEmail, timezone, bdo_class, alt_class, gear_ap, gear_aap, gear_dp } = await req.json();

        const parsedAp  = gear_ap  != null ? parseInt(gear_ap)  : null;
        const parsedAap = gear_aap != null ? parseInt(gear_aap) : null;
        const parsedDp  = gear_dp  != null ? parseInt(gear_dp)  : null;
        if ((parsedAp  != null && isNaN(parsedAp))  ||
            (parsedAap != null && isNaN(parsedAap)) ||
            (parsedDp  != null && isNaN(parsedDp)))  return err("gear values must be numbers");

        // Check email uniqueness if changing it
        if (newEmail && newEmail !== user.email) {
          const taken = await sql`SELECT id FROM users WHERE email = ${newEmail} AND id != ${user.id}`;
          if (taken.length) return err("That email is already in use.", 409);
        }

        const [updated] = await sql`
          UPDATE users SET
            family_name    = ${family_name ?? null},
            email          = ${newEmail ?? null},
            timezone       = ${timezone ?? null},
            bdo_class      = ${bdo_class ?? null},
            alt_class      = ${alt_class ?? null},
            gear_ap        = ${parsedAp},
            gear_aap       = ${parsedAap},
            gear_dp        = ${parsedDp}
          WHERE id = ${user.id}
          RETURNING id, username, email, role, character_name, family_name, discord_name,
                    discord_id, discord_username, discord_avatar,
                    ribbit_count, bdo_class, alt_class, gear_ap, gear_aap, gear_dp, timezone
        `;

        // Keep shrine signup in sync if one exists
        await sql`
          UPDATE shrine_signups SET
            bdo_class = ${bdo_class ?? null},
            ap        = ${parsedAp},
            aap       = ${parsedAap},
            dp        = ${parsedDp}
          WHERE user_id = ${user.id}
        `;

        return json({ user: updated });
      },
    },

    // ── Ribbits ──────────────────────────────────────────────────────────────

    "/api/ribbits": {
      async POST(req) {
        const user = await authenticate(req);
        if (!user) return err("Unauthorized", 401);

        const { delta } = await req.json();
        if (typeof delta !== "number" || delta <= 0 || !Number.isInteger(delta)) return err("delta must be a positive integer");
        // Cap delta to prevent API abuse — legitimate 15-second sync bursts are well under this
        if (delta > 500) return err("delta too large", 400);

        const FRIEND_CAP = 300;
        if (user.role === "friend" && user.ribbit_count >= FRIEND_CAP) {
          return json({ ribbit_count: user.ribbit_count, capped: true });
        }

        const [updated] = await sql`
          UPDATE users SET ribbit_count = LEAST(
            ribbit_count + ${delta},
            CASE WHEN role = 'friend' THEN ${FRIEND_CAP} ELSE 2147483647 END
          )
          WHERE id = ${user.id}
          RETURNING ribbit_count
        `;
        return json({ ribbit_count: updated.ribbit_count });
      },
    },

    // ── Announcements ────────────────────────────────────────────────────────

    "/api/announcements": {
      async GET(_req) {
        const rows = await sql`
          SELECT a.id, a.title, a.body, a.pinned, a.created_at,
                 u.username AS author
          FROM announcements a
          LEFT JOIN users u ON u.id = a.created_by
          ORDER BY a.pinned DESC, a.created_at DESC
        `;
        return json(rows);
      },
      async POST(req) {
        const user = await authenticate(req);
        if (!requireRole(user, "officer")) return err("Forbidden", 403);
        const { title, body, pinned } = await req.json();
        if (!title?.trim()) return err("title is required");
        const [row] = await sql`
          INSERT INTO announcements (title, body, pinned, created_by)
          VALUES (${title.trim()}, ${body ?? null}, ${pinned ?? false}, ${user!.id})
          RETURNING id, title, body, pinned, created_at
        `;
        return json(row, 201);
      },
    },

    "/api/announcements/:id": {
      async DELETE(req) {
        const user = await authenticate(req);
        if (!requireRole(user, "officer")) return err("Forbidden", 403);
        await sql`DELETE FROM announcements WHERE id = ${req.params.id}`;
        return json({ ok: true });
      },
      async PATCH(req) {
        const user = await authenticate(req);
        if (!requireRole(user, "officer")) return err("Forbidden", 403);
        const { title, body, pinned } = await req.json();
        const [row] = await sql`
          UPDATE announcements SET
            title   = COALESCE(${title ?? null}, title),
            body    = COALESCE(${body ?? null}, body),
            pinned  = COALESCE(${pinned ?? null}, pinned),
            updated_at = NOW()
          WHERE id = ${req.params.id}
          RETURNING id, title, body, pinned, created_at
        `;
        if (!row) return err("Not found", 404);
        return json(row);
      },
    },

    // ── Wall of Shame ─────────────────────────────────────────────────────────

    "/api/wall": {
      async GET(_req) {
        const rows = await sql`
          SELECT w.id, w.title, w.description, w.image_path, w.created_at,
                 u.username AS author
          FROM wall_of_shame w
          LEFT JOIN users u ON u.id = w.submitted_by
          ORDER BY w.created_at DESC
        `;
        return json(rows);
      },
      async POST(req) {
        const user = await authenticate(req);
        // Any logged-in non-pending member can submit
        if (!user || user.role === "pending") return err("Forbidden", 403);

        const form = await req.formData();
        const title       = form.get("title") as string | null;
        const description = form.get("description") as string | null;
        const imageFile   = form.get("image") as File | null;

        if (!title?.trim()) return err("title is required");

        let image_path: string | null = null;
        if (imageFile && imageFile.size > 0) {
          const ext = safeImageExt(imageFile.name);
          if (!ext) return err("Only image files are allowed (jpg, jpeg, png, gif, webp)");
          const filename = `${crypto.randomUUID()}.${ext}`;
          await Bun.write(join(UPLOAD_DIR, "shame", filename), imageFile);
          image_path = `/uploads/shame/${filename}`;
        }

        const [row] = await sql`
          INSERT INTO wall_of_shame (title, description, image_path, submitted_by)
          VALUES (${title.trim()}, ${description ?? null}, ${image_path}, ${user.id})
          RETURNING id, title, description, image_path, created_at
        `;
        return json(row, 201);
      },
    },

    "/api/wall/:id": {
      async DELETE(req) {
        const user = await authenticate(req);
        if (!requireRole(user, "officer")) return err("Forbidden", 403);
        const [row] = await sql`SELECT image_path FROM wall_of_shame WHERE id = ${req.params.id}`;
        await sql`DELETE FROM wall_of_shame WHERE id = ${req.params.id}`;
        if (row?.image_path) {
          const filePath = join(UPLOAD_DIR, row.image_path.replace("/uploads/", ""));
          await unlink(filePath).catch(() => {});
        }
        return json({ ok: true });
      },
    },

    // ── Members ──────────────────────────────────────────────────────────────

    "/api/members": {
      async GET(req) {
        const user = await authenticate(req);
        if (!requireRole(user, "officer")) return err("Forbidden", 403);

        const members = await sql`
          SELECT id, username, email, role, character_name, family_name, ribbit_count, created_at
          FROM users
          ORDER BY
            CASE role WHEN 'admin' THEN 0 WHEN 'officer' THEN 1 ELSE 2 END,
            username ASC
        `;
        return json(members);
      },
    },

    "/api/members/ribbits/reset-all": {
      async POST(req) {
        const actor = await authenticate(req);
        if (!requireRole(actor, "officer")) return err("Forbidden", 403);
        await sql`UPDATE users SET ribbit_count = 0`;
        return json({ ok: true });
      },
    },

    "/api/members/:id/ribbits/reset": {
      async POST(req) {
        const actor = await authenticate(req);
        if (!requireRole(actor, "officer")) return err("Forbidden", 403);
        const [updated] = await sql`
          UPDATE users SET ribbit_count = 0 WHERE id = ${req.params.id}
          RETURNING id, username, ribbit_count
        `;
        if (!updated) return err("User not found", 404);
        return json(updated);
      },
    },

    "/api/members/:id": {
      async DELETE(req) {
        const actor = await authenticate(req);
        if (actor?.role !== "admin") return err("Forbidden", 403);
        if (req.params.id === actor.id) return err("Cannot delete your own account", 400);
        const [target] = await sql`SELECT id FROM users WHERE id = ${req.params.id}`;
        if (!target) return err("User not found", 404);
        await sql`DELETE FROM users WHERE id = ${req.params.id}`;
        return json({ ok: true });
      },
    },

    "/api/members/:id/role": {
      async PATCH(req) {
        const actor = await authenticate(req);
        if (!requireRole(actor, "officer")) return err("Forbidden", 403);

        const { role } = await req.json();
        if (!["pending", "friend", "member", "officer", "admin"].includes(role)) return err("Invalid role");

        // Only admins can assign the admin role
        if (role === "admin" && actor!.role !== "admin") return err("Forbidden", 403);

        // Officers can only manage pending/member accounts — only admins can touch officers/admins
        const [target] = await sql`SELECT role FROM users WHERE id = ${req.params.id}`;
        if (!target) return err("User not found", 404);
        if (!["pending", "member"].includes(target.role) && actor!.role !== "admin") return err("Forbidden", 403);

        const [updated] = await sql`
          UPDATE users SET role = ${role} WHERE id = ${req.params.id}
          RETURNING id, username, role
        `;
        return json(updated);
      },
    },

    // ── Guild directory (member-visible) ─────────────────────────────────────

    "/api/guild-members": {
      async GET(req) {
        const user = await authenticate(req);
        if (!user || user.role === "pending" || user.role === "friend") return err("Forbidden", 403);
        const rows = await sql`
          SELECT username, family_name, discord_name, bdo_class, alt_class,
                 gear_ap, gear_aap, gear_dp,
                 ROUND(GREATEST(COALESCE(gear_ap, 0), COALESCE(gear_aap, 0)) + COALESCE(gear_dp, 0)) AS gs,
                 timezone, ribbit_count, play_status, guild_rank, role
          FROM users
          WHERE role NOT IN ('pending', 'friend')
          ORDER BY
            CASE role WHEN 'admin' THEN 0 WHEN 'officer' THEN 1 ELSE 2 END,
            username ASC
        `;
        return json(rows);
      },
    },

    // ── Roster ───────────────────────────────────────────────────────────────

    "/api/roster": {
      async GET(req) {
        const user = await authenticate(req);
        if (!requireRole(user, "officer")) return err("Forbidden", 403);
        const rows = await sql`
          SELECT id, username, family_name, discord_name, guild_rank, play_status, timezone, roster_notes, role, created_at
          FROM users
          ORDER BY
            CASE role WHEN 'admin' THEN 0 WHEN 'officer' THEN 1 ELSE 2 END,
            username ASC
        `;
        return json(rows);
      },
    },

    "/api/roster/:id": {
      async PATCH(req) {
        const user = await authenticate(req);
        if (!requireRole(user, "officer")) return err("Forbidden", 403);
        const body = await req.json();
        const { family_name, discord_name, guild_rank, play_status, roster_notes } = body;
        const [updated] = await sql`
          UPDATE users SET
            family_name   = COALESCE(${family_name  ?? null}, family_name),
            discord_name  = COALESCE(${discord_name ?? null}, discord_name),
            guild_rank    = COALESCE(${guild_rank   ?? null}, guild_rank),
            play_status   = COALESCE(${play_status  ?? null}, play_status),
            roster_notes  = ${roster_notes ?? null}
          WHERE id = ${req.params.id}
          RETURNING id, family_name, discord_name, guild_rank, play_status, roster_notes
        `;
        if (!updated) return err("User not found", 404);

        // Gear fields: admin-only, only update when all three are explicitly included in the body
        if ("gear_ap" in body && "gear_aap" in body && "gear_dp" in body) {
          if (!requireRole(user, "admin")) return err("Forbidden", 403);
          const ap  = body.gear_ap  != null ? parseInt(body.gear_ap)  : null;
          const aap = body.gear_aap != null ? parseInt(body.gear_aap) : null;
          const dp  = body.gear_dp  != null ? parseInt(body.gear_dp)  : null;
          if ((ap  != null && (isNaN(ap)  || ap  < 0)) ||
              (aap != null && (isNaN(aap) || aap < 0)) ||
              (dp  != null && (isNaN(dp)  || dp  < 0))) return err("gear values must be non-negative numbers");
          await sql`
            UPDATE users SET gear_ap = ${ap}, gear_aap = ${aap}, gear_dp = ${dp}
            WHERE id = ${req.params.id}
          `;
        }

        return json(updated);
      },
    },

    // ── Payout tracker ───────────────────────────────────────────────────────

    "/api/payout": {
      async GET(req) {
        const user = await authenticate(req);
        if (!requireRole(user, "officer")) return err("Forbidden", 403);
        const members = await sql`
          SELECT u.id, u.username, u.discord_name, u.family_name, u.payout_tier, u.ribbit_count,
                 ph.old_tier    AS last_old_tier,
                 ph.new_tier    AS last_new_tier,
                 ph.reason      AS last_reason,
                 ph.created_at  AS last_changed_at,
                 cu.username    AS last_changed_by
          FROM users u
          LEFT JOIN LATERAL (
            SELECT * FROM payout_history WHERE user_id = u.id ORDER BY created_at DESC LIMIT 1
          ) ph ON true
          LEFT JOIN users cu ON ph.changed_by = cu.id
          WHERE u.role != 'pending'
          ORDER BY u.payout_tier DESC, u.username ASC
        `;
        return json(members);
      },

      async PATCH(req) {
        const user = await authenticate(req);
        if (!requireRole(user, "officer")) return err("Forbidden", 403);
        const { user_ids, delta, set_tier, reason } = await req.json();
        if (!Array.isArray(user_ids) || !user_ids.length) return err("user_ids required");

        const results: { id: string; payout_tier: number }[] = [];
        for (const uid of user_ids) {
          const [current] = await sql`SELECT payout_tier FROM users WHERE id = ${uid} AND role != 'pending'`;
          if (!current) continue;

          let newTier: number;
          if (set_tier != null) {
            newTier = Math.max(1, Math.min(10, Number(set_tier)));
          } else if (delta != null) {
            newTier = Math.max(1, Math.min(10, current.payout_tier + Number(delta)));
          } else continue;

          if (newTier !== current.payout_tier) {
            await sql`UPDATE users SET payout_tier = ${newTier} WHERE id = ${uid}`;
            await sql`
              INSERT INTO payout_history (user_id, changed_by, old_tier, new_tier, reason)
              VALUES (${uid}, ${user!.id}, ${current.payout_tier}, ${newTier}, ${reason ?? null})
            `;
          }
          results.push({ id: uid, payout_tier: newTier });
        }
        return json(results);
      },
    },

    "/api/payout/history/:id": {
      async GET(req) {
        const user = await authenticate(req);
        if (!requireRole(user, "officer")) return err("Forbidden", 403);
        const history = await sql`
          SELECT ph.id, ph.old_tier, ph.new_tier, ph.reason, ph.created_at,
                 cu.username AS changed_by_name
          FROM payout_history ph
          LEFT JOIN users cu ON ph.changed_by = cu.id
          WHERE ph.user_id = ${req.params.id}
          ORDER BY ph.created_at DESC
          LIMIT 50
        `;
        return json(history);
      },
    },

    // ── Leaderboard ──────────────────────────────────────────────────────────

    "/api/leaderboard": {
      async GET(req) {
        const user = await authenticate(req);
        if (!user || user.role === "pending") return err("Forbidden", 403);

        const url = new URL(req.url);
        const showAll = url.searchParams.get("all") === "true";

        const botToken = process.env.DISCORD_BOT_TOKEN;
        const guildId  = process.env.DISCORD_GUILD_ID;
        const memberRoleId = process.env.GUILD_MEMBER_ROLE_ID;

        // Fetch all guild members with the member role in one paginated batch
        // (skipped when ?all=true is requested)
        let guildMemberIds: Set<string> | null = null;
        if (!showAll && botToken && guildId && memberRoleId) {
          guildMemberIds = new Set<string>();
          let after = "0";
          while (true) {
            const res = await fetch(
              `https://discord.com/api/v10/guilds/${guildId}/members?limit=1000&after=${after}`,
              { headers: { Authorization: `Bot ${botToken}` } }
            );
            if (!res.ok) break;
            const members: any[] = await res.json();
            if (members.length === 0) break;
            for (const m of members) {
              if (m.roles.includes(memberRoleId)) {
                guildMemberIds.add(m.user.id);
              }
            }
            if (members.length < 1000) break;
            after = members[members.length - 1].user.id;
          }
        }

        const ribbits = await sql`
          SELECT username, family_name, ribbit_count
          FROM users
          WHERE role != 'pending' AND ribbit_count > 0
          ORDER BY ribbit_count DESC
          LIMIT 10
        `;
        const gearRows = showAll
          ? await sql`
              SELECT id,
                COALESCE(NULLIF(discord_username, ''), username) AS username,
                family_name, bdo_class, alt_class, gear_ap, gear_aap, gear_dp, discord_id,
                ROUND(GREATEST(COALESCE(gear_ap, 0), COALESCE(gear_aap, 0)) + COALESCE(gear_dp, 0)) AS gs
              FROM users
              WHERE role != 'pending'
                AND (gear_ap IS NOT NULL OR gear_aap IS NOT NULL OR gear_dp IS NOT NULL)
              ORDER BY gs DESC
            `
          : await sql`
              SELECT id,
                COALESCE(NULLIF(discord_username, ''), username) AS username,
                family_name, bdo_class, alt_class, gear_ap, gear_aap, gear_dp, discord_id,
                ROUND(GREATEST(COALESCE(gear_ap, 0), COALESCE(gear_aap, 0)) + COALESCE(gear_dp, 0)) AS gs
              FROM users
              WHERE role IN ('member', 'officer', 'admin')
                AND (gear_ap IS NOT NULL OR gear_aap IS NOT NULL OR gear_dp IS NOT NULL)
              ORDER BY gs DESC
            `;

        // Filter to only current guild members (by role), then strip discord_id from response
        const gear = gearRows
          .filter(r => !guildMemberIds || (r.discord_id && guildMemberIds.has(r.discord_id)))
          .map(({ discord_id, ...rest }) => rest);

        return json({ ribbits, gear });
      },
    },

    // ── Discord scheduled events (read-only, proxied to avoid exposing bot token) ──
    "/api/discord-events": {
      async GET() {
        const botToken = process.env.DISCORD_BOT_TOKEN;
        const guildId  = process.env.DISCORD_GUILD_ID;
        if (!botToken || !guildId) return json([]);

        const res = await fetch(
          `https://discord.com/api/v10/guilds/${guildId}/scheduled-events?with_user_count=true`,
          { headers: { Authorization: `Bot ${botToken}` } }
        );
        if (!res.ok) return json([]);

        const events: any[] = await res.json();
        // Only return scheduled (1) or active (2) events; normalise to calendar shape
        const normalized = events
          .filter(e => e.status === 1 || e.status === 2)
          .map(e => {
            const start = new Date(e.scheduled_start_time);
            return {
              id:          `discord-${e.id}`,
              title:       e.name,
              description: e.description || null,
              date:        start.toISOString().slice(0, 10),
              event_time:  start.toISOString().slice(11, 16), // HH:MM UTC
              event_timezone: "UTC",
              discord:     true,
              user_count:  e.user_count ?? null,
              url:         `https://discord.com/events/${guildId}/${e.id}`,
            };
          });
        return json(normalized);
      },
    },

    // ── Calendar ─────────────────────────────────────────────────────────────

    "/api/calendar": {
      async GET(req) {
        const user = await authenticate(req);
        let events;
        if (user) {
          events = await sql`
            SELECT
              ce.id, ce.title, ce.description, ce.event_date::text,
              ce.event_time::text, ce.event_timezone, ce.created_at,
              COUNT(cei.user_id)::int AS interested_count,
              COALESCE(BOOL_OR(cei.user_id = ${user.id}::uuid), false) AS viewer_interested
            FROM calendar_events ce
            LEFT JOIN calendar_event_interests cei ON cei.event_id = ce.id
            GROUP BY ce.id
            ORDER BY ce.event_date ASC, ce.event_time ASC NULLS LAST
          `;
        } else {
          events = await sql`
            SELECT
              ce.id, ce.title, ce.description, ce.event_date::text,
              ce.event_time::text, ce.event_timezone, ce.created_at,
              COUNT(cei.user_id)::int AS interested_count,
              false AS viewer_interested
            FROM calendar_events ce
            LEFT JOIN calendar_event_interests cei ON cei.event_id = ce.id
            GROUP BY ce.id
            ORDER BY ce.event_date ASC, ce.event_time ASC NULLS LAST
          `;
        }
        return json(events);
      },

      async POST(req) {
        const user = await authenticate(req);
        if (!requireRole(user, "officer")) return err("Forbidden", 403);

        const { title, description, event_date, event_time, event_timezone } = await req.json();
        if (!title || !event_date) return err("title and event_date are required");

        const [event] = await sql`
          INSERT INTO calendar_events (title, description, event_date, event_time, event_timezone, created_by)
          VALUES (
            ${title}, ${description ?? null}, ${event_date},
            ${event_time ?? null}, ${event_timezone ?? null},
            ${user!.id}
          )
          RETURNING id, title, description, event_date::text, event_time::text, event_timezone, created_at
        `;
        return json(event, 201);
      },
    },

    "/api/calendar/:id": {
      async PATCH(req) {
        const user = await authenticate(req);
        if (!requireRole(user, "officer")) return err("Forbidden", 403);

        const { title, description, event_date, event_time, event_timezone } = await req.json();
        if (!title || !event_date) return err("title and event_date are required");

        const [event] = await sql`
          UPDATE calendar_events
          SET title        = ${title},
              description  = ${description ?? null},
              event_date   = ${event_date},
              event_time   = ${event_time ?? null},
              event_timezone = ${event_timezone ?? null}
          WHERE id = ${req.params.id}
          RETURNING id, title, description, event_date::text, event_time::text, event_timezone, created_at
        `;
        if (!event) return err("Not found", 404);
        return json(event);
      },

      async DELETE(req) {
        const user = await authenticate(req);
        if (!requireRole(user, "officer")) return err("Forbidden", 403);

        await sql`DELETE FROM calendar_events WHERE id = ${req.params.id}`;
        return json({ ok: true });
      },
    },

    "/api/calendar/:id/interest": {
      async POST(req) {
        const user = await authenticate(req);
        if (!user) return err("Unauthorized", 401);

        const eventId = req.params.id;
        const [existing] = await sql`
          SELECT 1 FROM calendar_event_interests
          WHERE event_id = ${eventId} AND user_id = ${user.id}
        `;
        if (existing) {
          await sql`
            DELETE FROM calendar_event_interests
            WHERE event_id = ${eventId} AND user_id = ${user.id}
          `;
          return json({ interested: false });
        } else {
          await sql`
            INSERT INTO calendar_event_interests (event_id, user_id)
            VALUES (${eventId}, ${user.id})
            ON CONFLICT DO NOTHING
          `;
          return json({ interested: true });
        }
      },
    },

    // ── Nodewar ──────────────────────────────────────────────────────────────

    "/api/nodewar": {
      async GET(req) {
        // Members and above only
        const user = await authenticate(req);
        if (!user || user.role === "pending") return err("Forbidden", 403);

        const entries = await sql`
          SELECT
            ne.id, ne.title, ne.node_name, ne.event_date, ne.result, ne.notes, ne.created_at,
            COALESCE(
              json_agg(ni.image_path ORDER BY ni.created_at)
              FILTER (WHERE ni.id IS NOT NULL), '[]'
            ) AS images
          FROM nodewar_entries ne
          LEFT JOIN nodewar_images ni ON ni.entry_id = ne.id
          GROUP BY ne.id
          ORDER BY ne.event_date DESC
        `;
        return json(entries);
      },

      async POST(req) {
        const user = await authenticate(req);
        if (!requireRole(user, "officer")) return err("Forbidden", 403);

        const form = await req.formData();
        const title      = form.get("title") as string | null;
        const node_name  = form.get("node_name") as string | null;
        const event_date = form.get("event_date") as string;
        const result     = form.get("result") as string | null;
        const notes      = form.get("notes") as string | null;
        const imageFiles = form.getAll("images") as File[];

        if (!event_date) return err("event_date is required");

        // Reuse existing entry for this date if one exists, otherwise create
        let entry;
        const [existing] = await sql`
          SELECT id FROM nodewar_entries WHERE event_date = ${event_date}
        `;
        if (existing) {
          entry = existing;
          // Update metadata if provided
          if (title || node_name || result || notes) {
            await sql`
              UPDATE nodewar_entries SET
                title      = COALESCE(${title ?? null}, title),
                node_name  = COALESCE(${node_name ?? null}, node_name),
                result     = COALESCE(${result ?? null}, result),
                notes      = COALESCE(${notes ?? null}, notes)
              WHERE id = ${entry.id}
            `;
          }
        } else {
          [entry] = await sql`
            INSERT INTO nodewar_entries (title, node_name, event_date, result, notes, uploaded_by)
            VALUES (${title ?? null}, ${node_name ?? null}, ${event_date}, ${result ?? null}, ${notes ?? null}, ${user!.id})
            RETURNING id
          `;
        }

        // Save each image file
        for (const file of imageFiles) {
          if (!file || file.size === 0) continue;
          const ext = safeImageExt(file.name);
          if (!ext) continue; // skip non-image files silently
          const filename = `${crypto.randomUUID()}.${ext}`;
          await Bun.write(join(UPLOAD_DIR, "nodewar", filename), file);
          const image_path = `/uploads/nodewar/${filename}`;
          await sql`
            INSERT INTO nodewar_images (entry_id, image_path)
            VALUES (${entry.id}, ${image_path})
          `;
        }

        return json({ ok: true, id: entry.id }, 201);
      },
    },

    // ── Employee Awards ──────────────────────────────────────────────────────

    "/api/awards": {
      async GET(_req) {
        const awards = await sql`
          SELECT id, award_type, display_name, user_id, reason, image_path, award_date, created_at
          FROM employee_awards
          ORDER BY award_date DESC, created_at DESC
        `;
        return json(awards);
      },

      async POST(req) {
        const user = await authenticate(req);
        if (!requireRole(user, "officer")) return err("Forbidden", 403);

        const form = await req.formData();
        const award_type   = form.get("award_type")   as string | null;
        const display_name = form.get("display_name") as string | null;
        const user_id      = form.get("user_id")      as string | null;
        const reason       = form.get("reason")       as string | null;
        const award_date   = form.get("award_date")   as string | null;
        const imageFile    = form.get("image")        as File | null;

        if (!award_type || !display_name || !award_date) return err("award_type, display_name, and award_date are required");

        let image_path: string | null = null;
        if (imageFile && imageFile.size > 0) {
          const ext = safeImageExt(imageFile.name);
          if (!ext) return err("Only image files are allowed (jpg, jpeg, png, gif, webp)");
          const filename = `${crypto.randomUUID()}.${ext}`;
          await Bun.write(join(UPLOAD_DIR, "awards", filename), imageFile);
          image_path = `/uploads/awards/${filename}`;
        }

        const [award] = await sql`
          INSERT INTO employee_awards (award_type, display_name, user_id, reason, image_path, award_date, awarded_by)
          VALUES (${award_type}, ${display_name}, ${user_id ?? null}, ${reason ?? null}, ${image_path}, ${award_date}, ${user!.id})
          RETURNING *
        `;
        return json(award, 201);
      },
    },

    // ── Black Shrine Sign-ups ─────────────────────────────────────────────────

    "/api/shrine": {
      async GET(req) {
        const user = await authenticate(req);
        if (!user || user.role === "pending") return err("Forbidden", 403);
        const rows = await sql`
          SELECT ss.id, ss.user_id, u.username, u.character_name,
                 ss.bdo_class, ss.ap, ss.aap, ss.dp, ss.note, ss.signed_up_at
          FROM shrine_signups ss
          JOIN users u ON u.id = ss.user_id
          ORDER BY ss.signed_up_at ASC
        `;
        return json(rows);
      },
      async POST(req) {
        const user = await authenticate(req);
        if (!user || user.role === "pending") return err("Forbidden", 403);
        const { note, bdo_class, ap, aap, dp } = await req.json();

        // Persist gear profile back to user record
        await sql`
          UPDATE users SET
            bdo_class = COALESCE(${bdo_class ?? null}, bdo_class),
            gear_ap   = COALESCE(${ap   ?? null}, gear_ap),
            gear_aap  = COALESCE(${aap  ?? null}, gear_aap),
            gear_dp   = COALESCE(${dp   ?? null}, gear_dp)
          WHERE id = ${user.id}
        `;

        const [row] = await sql`
          INSERT INTO shrine_signups (user_id, character_name, bdo_class, ap, aap, dp, note)
          VALUES (
            ${user.id}, ${user.character_name ?? null},
            ${bdo_class ?? null}, ${ap ?? null}, ${aap ?? null}, ${dp ?? null},
            ${note ?? null}
          )
          ON CONFLICT (user_id) DO UPDATE SET
            bdo_class   = EXCLUDED.bdo_class,
            ap          = EXCLUDED.ap,
            aap         = EXCLUDED.aap,
            dp          = EXCLUDED.dp,
            note        = EXCLUDED.note,
            signed_up_at = NOW()
          RETURNING id
        `;
        return json(row, 201);
      },
    },

    "/api/shrine/me": {
      async DELETE(req) {
        const user = await authenticate(req);
        if (!user || user.role === "pending") return err("Forbidden", 403);
        await sql`DELETE FROM shrine_signups WHERE user_id = ${user.id}`;
        return json({ ok: true });
      },
    },

    "/api/shrine/clear": {
      async POST(req) {
        const user = await authenticate(req);
        if (!requireRole(user, "officer")) return err("Forbidden", 403);
        await sql`DELETE FROM shrine_signups`;
        return json({ ok: true });
      },
    },

    "/api/shrine/teams": {
      async GET(req) {
        const user = await authenticate(req);
        if (!user || user.role === "pending") return err("Forbidden", 403);
        const rows = await sql`
          SELECT
            st.id, st.name, st.created_at,
            COALESCE(
              json_agg(
                json_build_object(
                  'signup_id',      stm.signup_id,
                  'username',       u.username,
                  'character_name', ss.character_name,
                  'bdo_class',      ss.bdo_class,
                  'ap',             ss.ap,
                  'aap',            ss.aap,
                  'dp',             ss.dp
                ) ORDER BY stm.added_at
              ) FILTER (WHERE stm.id IS NOT NULL),
              '[]'::json
            ) AS members
          FROM shrine_teams st
          LEFT JOIN shrine_team_members stm ON stm.team_id = st.id
          LEFT JOIN shrine_signups ss       ON ss.id = stm.signup_id
          LEFT JOIN users u                 ON u.id  = ss.user_id
          GROUP BY st.id
          ORDER BY st.created_at
        `;
        return json(rows);
      },
      async POST(req) {
        const user = await authenticate(req);
        if (!requireRole(user, "officer")) return err("Forbidden", 403);
        const { name } = await req.json();
        const [team] = await sql`
          INSERT INTO shrine_teams (name)
          VALUES (${name ?? "New Team"})
          RETURNING id, name, created_at
        `;
        return json(team, 201);
      },
    },

    "/api/shrine/teams/assignments": {
      async PATCH(req) {
        const user = await authenticate(req);
        if (!requireRole(user, "officer")) return err("Forbidden", 403);
        const { signup_id, team_id } = await req.json();
        if (!signup_id) return err("signup_id is required");

        // Remove from any current team first
        await sql`DELETE FROM shrine_team_members WHERE signup_id = ${signup_id}`;

        if (team_id) {
          const countRes = await sql`
            SELECT COUNT(*)::int AS count FROM shrine_team_members WHERE team_id = ${team_id}
          `;
          if ((countRes[0]?.count ?? 0) >= 5) return err("Team is full (max 5 players)", 400);
          await sql`
            INSERT INTO shrine_team_members (team_id, signup_id)
            VALUES (${team_id}, ${signup_id})
          `;
        }
        return json({ ok: true });
      },
    },

    "/api/shrine/teams/:id": {
      async PATCH(req) {
        const user = await authenticate(req);
        if (!requireRole(user, "officer")) return err("Forbidden", 403);
        const { name } = await req.json();
        if (!name?.trim()) return err("name is required");
        const [team] = await sql`
          UPDATE shrine_teams SET name = ${name.trim()} WHERE id = ${req.params.id}
          RETURNING id, name
        `;
        if (!team) return err("Not found", 404);
        return json(team);
      },
      async DELETE(req) {
        const user = await authenticate(req);
        if (!requireRole(user, "officer")) return err("Forbidden", 403);
        await sql`DELETE FROM shrine_teams WHERE id = ${req.params.id}`;
        return json({ ok: true });
      },
    },

    "/api/shrine/availability": {
      async GET(req) {
        const user = await authenticate(req);
        if (!user || user.role === "pending") return err("Forbidden", 403);

        const mine    = await sql`SELECT utc_slot FROM shrine_availability WHERE user_id = ${user.id}`;
        const members = await sql`
          SELECT u.id,
                 COALESCE(u.character_name, u.username) AS display_name,
                 array_agg(sa.utc_slot ORDER BY sa.utc_slot) AS slots
          FROM   shrine_availability sa
          JOIN   users u ON u.id = sa.user_id
          WHERE  sa.user_id != ${user.id}
          GROUP  BY u.id, u.character_name, u.username
          ORDER  BY display_name
        `;

        return json({
          mine: mine.map(r => r.utc_slot),
          members: members.map(r => ({ id: r.id, display_name: r.display_name, slots: r.slots })),
        });
      },

      async PUT(req) {
        const user = await authenticate(req);
        if (!user || user.role === "pending") return err("Forbidden", 403);

        const body = await req.json().catch(() => null);
        if (!body || !Array.isArray(body.slots)) return err("slots array required");

        const valid = (body.slots as unknown[])
          .filter((s): s is number => Number.isInteger(s) && (s as number) >= 0 && (s as number) < 168);

        await sql`DELETE FROM shrine_availability WHERE user_id = ${user.id}`;
        if (valid.length > 0) {
          await sql`
            INSERT INTO shrine_availability (user_id, utc_slot)
            SELECT ${user.id}::uuid, unnest(${valid}::smallint[])
            ON CONFLICT DO NOTHING
          `;
        }

        return json({ ok: true });
      },
    },

    "/api/shrine/:id": {
      async DELETE(req) {
        const user = await authenticate(req);
        if (!requireRole(user, "officer")) return err("Forbidden", 403);
        await sql`DELETE FROM shrine_signups WHERE id = ${req.params.id}`;
        return json({ ok: true });
      },
    },

    // ── Events ───────────────────────────────────────────────────────────────

    "/api/events": {
      async GET(req) {
        const user = await authenticate(req);
        if (!user || user.role === "pending") return err("Forbidden", 403);
        const rows = await sql`
          SELECT e.*, u.username AS created_by_name,
            COUNT(es.id) FILTER (WHERE es.status = 'accepted')  AS accepted_count,
            COUNT(es.id) FILTER (WHERE es.status = 'bench')     AS bench_count,
            COUNT(es.id) FILTER (WHERE es.status = 'tentative') AS tentative_count,
            COUNT(es.id) FILTER (WHERE es.status = 'absent')    AS absent_count
          FROM events e
          LEFT JOIN users u ON u.id = e.created_by
          LEFT JOIN event_signups es ON es.event_id = e.id
          GROUP BY e.id, u.username
          ORDER BY e.event_date DESC, e.event_time DESC
        `;
        return json(rows);
      },
      async POST(req) {
        const user = await authenticate(req);
        if (!requireRole(user, "officer")) return err("Forbidden", 403);
        const { title, description, event_date, event_time, event_timezone, total_cap, channel_id, status, roles, ping_role_ids, enable_ping, enable_reminder_ping } = await req.json();
        if (!title?.trim() || !event_date || !event_time) return err("title, event_date, and event_time are required");
        const eventStatus = status === "active" ? "active" : "draft";
        const [event] = await sql`
          INSERT INTO events (title, description, event_date, event_time, event_timezone, total_cap, channel_id, status, created_by, ping_role_ids, enable_ping, enable_reminder_ping)
          VALUES (${title.trim()}, ${description ?? null}, ${event_date}, ${event_time},
                  ${event_timezone ?? null}, ${total_cap ?? null}, ${channel_id ?? null}, ${eventStatus}, ${user!.id},
                  ${ping_role_ids ?? []}, ${enable_ping ?? true}, ${enable_reminder_ping ?? true})
          RETURNING *
        `;
        if (Array.isArray(roles)) {
          for (let i = 0; i < roles.length; i++) {
            const r = roles[i];
            await sql`
              INSERT INTO event_roles (event_id, name, emoji, soft_cap, display_order)
              VALUES (${event.id}, ${r.name}, ${r.emoji ?? null}, ${r.soft_cap ?? null}, ${i})
            `;
          }
        }
        // Create a linked calendar event for reminders
        const [calEvent] = await sql`
          INSERT INTO calendar_events (title, description, event_date, event_time, event_timezone, created_by)
          VALUES (${title.trim()}, ${description ?? null}, ${event_date}, ${event_time ?? null}, ${event_timezone ?? null}, ${user!.id})
          RETURNING id
        `;
        await sql`UPDATE events SET calendar_event_id = ${calEvent.id} WHERE id = ${event.id}`;
        if (eventStatus === "active") {
          await sql`SELECT pg_notify('event_updated', ${event.id}::text)`;
        }
        return json(event, 201);
      },
    },

    "/api/events/bot-pending": {
      async GET(req) {
        if (req.headers.get("Authorization") !== `Bot ${process.env.DISCORD_BOT_TOKEN}`) return err("Forbidden", 403);
        const rows = await sql`
          SELECT e.*,
            COALESCE(json_agg(json_build_object(
              'id', er.id, 'name', er.name, 'emoji', er.emoji,
              'soft_cap', er.soft_cap, 'display_order', er.display_order
            ) ORDER BY er.display_order) FILTER (WHERE er.id IS NOT NULL), '[]') AS roles
          FROM events e
          LEFT JOIN event_roles er ON er.event_id = e.id
          WHERE e.status = 'active' AND e.message_id IS NULL
          GROUP BY e.id
        `;
        return json(rows);
      },
    },

    "/api/events/:id": {
      async GET(req) {
        const user = await authenticate(req);
        if (!user || user.role === "pending") return err("Forbidden", 403);
        const [event] = await sql`
          SELECT e.*, u.username AS created_by_name
          FROM events e LEFT JOIN users u ON u.id = e.created_by
          WHERE e.id = ${req.params.id}
        `;
        if (!event) return err("Not found", 404);
        const roles   = await sql`SELECT * FROM event_roles WHERE event_id = ${event.id} ORDER BY display_order`;
        const signups = await sql`
          SELECT es.*, u.gear_ap, u.gear_aap, u.gear_dp
          FROM event_signups es
          LEFT JOIN users u ON u.discord_id = es.discord_id
          WHERE es.event_id = ${event.id}
          ORDER BY es.signup_order
        `;
        return json({ ...event, roles, signups });
      },
      async PATCH(req) {
        const isBot = req.headers.get("Authorization") === `Bot ${process.env.DISCORD_BOT_TOKEN}`;
        const user  = isBot ? null : await authenticate(req);
        if (!isBot && !requireRole(user, "officer")) return err("Forbidden", 403);
        const body = await req.json();
        if (isBot && body.message_id !== undefined) {
          await sql`UPDATE events SET message_id = ${body.message_id}, updated_at = NOW() WHERE id = ${req.params.id}`;
          return json({ ok: true });
        }
        const { title, description, event_date, event_time, event_timezone, total_cap, channel_id, status, roles, ping_role_ids, enable_ping, enable_reminder_ping } = body;
        await sql`
          UPDATE events SET
            title                = COALESCE(${title                ?? null}, title),
            description          = COALESCE(${description          ?? null}, description),
            event_date           = COALESCE(${event_date           ?? null}::date, event_date),
            event_time           = COALESCE(${event_time           ?? null}::time, event_time),
            event_timezone       = COALESCE(${event_timezone       ?? null}, event_timezone),
            total_cap            = COALESCE(${total_cap            ?? null}, total_cap),
            channel_id           = COALESCE(${channel_id           ?? null}, channel_id),
            status               = COALESCE(${status               ?? null}, status),
            ping_role_ids        = COALESCE(${ping_role_ids        ?? null}, ping_role_ids),
            enable_ping          = COALESCE(${enable_ping          ?? null}, enable_ping),
            enable_reminder_ping = COALESCE(${enable_reminder_ping ?? null}, enable_reminder_ping),
            updated_at           = NOW()
          WHERE id = ${req.params.id}
        `;
        if (Array.isArray(roles)) {
          await sql`DELETE FROM event_roles WHERE event_id = ${req.params.id}`;
          for (let i = 0; i < roles.length; i++) {
            const r = roles[i];
            await sql`
              INSERT INTO event_roles (event_id, name, emoji, soft_cap, display_order)
              VALUES (${req.params.id}, ${r.name}, ${r.emoji ?? null}, ${r.soft_cap ?? null}, ${i})
            `;
          }
        }
        // Keep linked calendar event in sync
        await sql`
          UPDATE calendar_events SET
            title          = COALESCE(${title ?? null}, title),
            description    = COALESCE(${description ?? null}, description),
            event_date     = COALESCE(${event_date ?? null}::date, event_date),
            event_time     = COALESCE(${event_time ?? null}::time, event_time),
            event_timezone = COALESCE(${event_timezone ?? null}, event_timezone),
            updated_at     = NOW()
          WHERE id = (SELECT calendar_event_id FROM events WHERE id = ${req.params.id})
        `;
        await sql`SELECT pg_notify('event_updated', ${req.params.id}::text)`;
        return json({ ok: true });
      },
      async DELETE(req) {
        const user = await authenticate(req);
        if (!requireRole(user, "officer")) return err("Forbidden", 403);
        const [evRow] = await sql`SELECT calendar_event_id FROM events WHERE id = ${req.params.id}`;
        await sql`DELETE FROM events WHERE id = ${req.params.id}`;
        if (evRow?.calendar_event_id) {
          await sql`DELETE FROM calendar_events WHERE id = ${evRow.calendar_event_id}`;
        }
        return json({ ok: true });
      },
    },

    "/api/events/:id/signups": {
      async GET(req) {
        const user = await authenticate(req);
        if (!user || user.role === "pending") return err("Forbidden", 403);
        const rows = await sql`SELECT * FROM event_signups WHERE event_id = ${req.params.id} ORDER BY signup_order`;
        return json(rows);
      },
    },

    "/api/events/:id/bot-signup": {
      async POST(req) {
        if (req.headers.get("Authorization") !== `Bot ${process.env.DISCORD_BOT_TOKEN}`) return err("Forbidden", 403);
        const { discord_id, discord_name, role_id, role_name, bdo_class, status } = await req.json();
        let resolvedStatus = status;
        await sql.begin(async sql => {
          const [evRow] = await sql`SELECT id, total_cap FROM events WHERE id = ${req.params.id} FOR UPDATE`;

          if (resolvedStatus === "accepted") {
            const [{ total_accepted }] = await sql`
              SELECT COUNT(*)::int AS total_accepted FROM event_signups
              WHERE event_id = ${req.params.id} AND status = 'accepted' AND discord_id != ${discord_id}
            `;
            if (evRow.total_cap && total_accepted >= evRow.total_cap) resolvedStatus = "bench";
          }

          if (resolvedStatus === "accepted" && role_id) {
            const [roleRow] = await sql`SELECT soft_cap FROM event_roles WHERE id = ${role_id}`;
            if (roleRow?.soft_cap != null) {
              const [{ role_accepted }] = await sql`
                SELECT COUNT(*)::int AS role_accepted FROM event_signups
                WHERE event_id = ${req.params.id} AND role_id = ${role_id} AND status = 'accepted' AND discord_id != ${discord_id}
              `;
              if (role_accepted >= roleRow.soft_cap) resolvedStatus = "bench";
            }
          }

          const existing = await sql`SELECT id, role_id, signup_order FROM event_signups WHERE event_id = ${req.params.id} AND discord_id = ${discord_id}`;
          if (existing.length > 0) {
            // Switching roles moves the user to the back of the queue
            const roleChanged = (existing[0].role_id ?? null) !== (role_id ?? null);
            let newOrder = existing[0].signup_order;
            if (roleChanged) {
              const [{ next_order }] = await sql`SELECT COALESCE(MAX(signup_order), 0) + 1 AS next_order FROM event_signups WHERE event_id = ${req.params.id}`;
              newOrder = next_order;
            }
            await sql`
              UPDATE event_signups SET role_id = ${role_id}, role_name = ${role_name},
                bdo_class = ${bdo_class}, status = ${resolvedStatus}, signup_order = ${newOrder}
              WHERE event_id = ${req.params.id} AND discord_id = ${discord_id}
            `;
          } else {
            const [{ next_order }] = await sql`
              SELECT COALESCE(MAX(signup_order), 0) + 1 AS next_order FROM event_signups WHERE event_id = ${req.params.id}
            `;
            await sql`
              INSERT INTO event_signups (event_id, discord_id, discord_name, role_id, role_name, bdo_class, signup_order, status)
              VALUES (${req.params.id}, ${discord_id}, ${discord_name}, ${role_id}, ${role_name}, ${bdo_class}, ${next_order}, ${resolvedStatus})
            `;
          }
          await sql`UPDATE events SET updated_at = NOW() WHERE id = ${req.params.id}`;
        });
        // Sync calendar interest
        const [evRowSignup] = await sql`SELECT calendar_event_id FROM events WHERE id = ${req.params.id}`;
        if (evRowSignup?.calendar_event_id) {
          const [uRow] = await sql`SELECT id FROM users WHERE discord_id = ${discord_id}`;
          if (uRow) {
            if (resolvedStatus !== 'absent') {
              await sql`INSERT INTO calendar_event_interests (event_id, user_id) VALUES (${evRowSignup.calendar_event_id}, ${uRow.id}) ON CONFLICT DO NOTHING`;
            } else {
              await sql`DELETE FROM calendar_event_interests WHERE event_id = ${evRowSignup.calendar_event_id} AND user_id = ${uRow.id}`;
            }
          }
        }
        return json({ ok: true });
      },
    },

    "/api/events/:id/bot-withdraw": {
      async DELETE(req) {
        if (req.headers.get("Authorization") !== `Bot ${process.env.DISCORD_BOT_TOKEN}`) return err("Forbidden", 403);
        const { discord_id } = await req.json();
        await sql`DELETE FROM event_signups WHERE event_id = ${req.params.id} AND discord_id = ${discord_id}`;
        await sql`UPDATE events SET updated_at = NOW() WHERE id = ${req.params.id}`;
        // Remove calendar interest on withdraw
        const [evRowWd] = await sql`SELECT calendar_event_id FROM events WHERE id = ${req.params.id}`;
        if (evRowWd?.calendar_event_id) {
          const [uRowWd] = await sql`SELECT id FROM users WHERE discord_id = ${discord_id}`;
          if (uRowWd) {
            await sql`DELETE FROM calendar_event_interests WHERE event_id = ${evRowWd.calendar_event_id} AND user_id = ${uRowWd.id}`;
          }
        }
        return json({ ok: true });
      },
    },

    "/api/events/:id/signups/:signupId": {
      async PATCH(req) {
        const isBot = req.headers.get("Authorization") === `Bot ${process.env.DISCORD_BOT_TOKEN}`;
        const user  = isBot ? null : await authenticate(req);
        if (!isBot && !requireRole(user, "officer")) return err("Forbidden", 403);
        const { role_id, role_name, bdo_class, status, attended, attended_role, attended_class } = await req.json();
        const [oldSignup] = await sql`SELECT discord_id, status, role_name FROM event_signups WHERE id = ${req.params.signupId}`;
        const [evForDm]   = await sql`SELECT title FROM events WHERE id = ${req.params.id}`;
        await sql`
          UPDATE event_signups SET
            role_id        = COALESCE(${role_id        ?? null}, role_id),
            role_name      = COALESCE(${role_name      ?? null}, role_name),
            bdo_class      = COALESCE(${bdo_class      ?? null}, bdo_class),
            status         = COALESCE(${status         ?? null}, status),
            attended       = COALESCE(${attended       ?? null}, attended),
            attended_role  = COALESCE(${attended_role  ?? null}, attended_role),
            attended_class = COALESCE(${attended_class ?? null}, attended_class)
          WHERE id = ${req.params.signupId} AND event_id = ${req.params.id}
        `;
        await sql`UPDATE events SET updated_at = NOW() WHERE id = ${req.params.id}`;
        await sql`SELECT pg_notify('event_updated', ${req.params.id}::text)`;
        if (!isBot && user && oldSignup && evForDm) {
          const isSelfChange = user.discord_id === oldSignup.discord_id;
          const statusChanged = status != null && status !== oldSignup.status;
          const roleChanged   = role_name != null && role_name !== oldSignup.role_name;
          if ((statusChanged || roleChanged) && !isSelfChange) {
            const payload = JSON.stringify({
              event_id:               req.params.id,
              event_title:            evForDm.title,
              discord_id:             oldSignup.discord_id,
              old_status:             oldSignup.status,
              new_status:             status ?? oldSignup.status,
              old_role:               oldSignup.role_name,
              new_role:               role_name ?? oldSignup.role_name,
              changed_by_discord_id:  user.discord_id,
            });
            await sql`SELECT pg_notify('signup_changed', ${payload})`;
          }
        }
        return json({ ok: true });
      },
      async DELETE(req) {
        const isBot = req.headers.get("Authorization") === `Bot ${process.env.DISCORD_BOT_TOKEN}`;
        const user  = isBot ? null : await authenticate(req);
        if (!isBot && !requireRole(user, "officer")) return err("Forbidden", 403);
        await sql`DELETE FROM event_signups WHERE id = ${req.params.signupId} AND event_id = ${req.params.id}`;
        await sql`UPDATE events SET updated_at = NOW() WHERE id = ${req.params.id}`;
        await sql`SELECT pg_notify('event_updated', ${req.params.id}::text)`;
        return json({ ok: true });
      },
    },

    "/api/events/:id/signups/:signupId/move": {
      async PATCH(req) {
        const user = await authenticate(req);
        if (!requireRole(user, "officer")) return err("Forbidden", 403);
        const { role_id, role_name, status } = await req.json();
        const [oldSignupMv] = await sql`SELECT discord_id, status, role_name FROM event_signups WHERE id = ${req.params.signupId}`;
        const [evForDmMv]   = await sql`SELECT title FROM events WHERE id = ${req.params.id}`;
        await sql`
          UPDATE event_signups SET
            role_id   = ${role_id   ?? null},
            role_name = ${role_name ?? null},
            status    = ${status}
          WHERE id = ${req.params.signupId} AND event_id = ${req.params.id}
        `;
        await sql`UPDATE events SET updated_at = NOW() WHERE id = ${req.params.id}`;
        await sql`SELECT pg_notify('event_updated', ${req.params.id}::text)`;
        if (user && oldSignupMv && evForDmMv) {
          const isSelfChange = user.discord_id === oldSignupMv.discord_id;
          if (!isSelfChange) {
            const payload = JSON.stringify({
              event_id:              req.params.id,
              event_title:           evForDmMv.title,
              discord_id:            oldSignupMv.discord_id,
              old_status:            oldSignupMv.status,
              new_status:            status,
              old_role:              oldSignupMv.role_name,
              new_role:              role_name ?? null,
              changed_by_discord_id: user.discord_id,
            });
            await sql`SELECT pg_notify('signup_changed', ${payload})`;
          }
        }
        return json({ ok: true });
      },
    },

    "/api/attendance": {
      async GET(req) {
        const user = await authenticate(req);
        if (!user || user.role === "pending") return err("Forbidden", 403);
        // Return all closed events with signup attendance per member
        const events = await sql`
          SELECT id, title, event_date, event_time, event_timezone, status
          FROM events
          WHERE status IN ('closed', 'active')
          ORDER BY event_date DESC, event_time DESC
        `;
        const signups = events.length === 0 ? [] : await sql`
          SELECT es.event_id, es.discord_id, es.discord_name,
                 es.status, es.role_name, es.bdo_class,
                 u.discord_avatar AS avatar_url, u.username
          FROM event_signups es
          LEFT JOIN users u ON u.discord_id = es.discord_id
          WHERE es.event_id = ANY(${events.map((e: any) => e.id)})
            AND es.status IN ('accepted', 'absent', 'bench', 'tentative')
          ORDER BY es.discord_name
        `;
        return json({ events, signups });
      },
    },

    "/api/event-templates": {
      async GET(req) {
        const user = await authenticate(req);
        if (!requireRole(user, "officer")) return err("Forbidden", 403);
        const rows = await sql`SELECT * FROM event_templates ORDER BY name`;
        return json(rows.map(r => ({
          ...r,
          roles: Array.isArray(r.roles) ? r.roles : (r.roles ? JSON.parse(r.roles as string) : []),
        })));
      },
      async POST(req) {
        const user = await authenticate(req);
        if (!requireRole(user, "officer")) return err("Forbidden", 403);
        const { name, description, event_time, event_timezone, total_cap, channel_id, roles, ping_role_ids, enable_ping, enable_reminder_ping } = await req.json();
        if (!name?.trim()) return err("name required");
        const [t] = await sql`
          INSERT INTO event_templates (name, description, event_time, event_timezone, total_cap, channel_id, roles, created_by, ping_role_ids, enable_ping, enable_reminder_ping)
          VALUES (${name.trim()}, ${description ?? null}, ${event_time ?? null}, ${event_timezone ?? null}, ${total_cap ?? null},
                  ${channel_id ?? null}, ${JSON.stringify(roles ?? [])}::jsonb, ${user!.id}, ${ping_role_ids ?? []}, ${enable_ping ?? true}, ${enable_reminder_ping ?? true})
          RETURNING *
        `;
        return json({ ...t, roles: Array.isArray(t.roles) ? t.roles : (t.roles ? JSON.parse(t.roles as string) : []) }, 201);
      },
    },

    "/api/event-templates/:id": {
      async PATCH(req) {
        const user = await authenticate(req);
        if (!requireRole(user, "officer")) return err("Forbidden", 403);
        const { name, description, event_time, event_timezone, total_cap, channel_id, roles, ping_role_ids, enable_ping, enable_reminder_ping } = await req.json();
        const [updated] = await sql`
          UPDATE event_templates SET
            name                 = COALESCE(${name        ?? null}, name),
            description          = ${description    ?? null},
            event_time           = ${event_time     ?? null},
            event_timezone       = ${event_timezone ?? null},
            channel_id           = ${channel_id     ?? null},
            roles                = COALESCE(${roles ? JSON.stringify(roles) : null}::jsonb, roles),
            ping_role_ids        = COALESCE(${ping_role_ids        ?? null}, ping_role_ids),
            enable_ping          = COALESCE(${enable_ping          ?? null}, enable_ping),
            enable_reminder_ping = COALESCE(${enable_reminder_ping ?? null}, enable_reminder_ping),
            updated_at           = NOW()
          WHERE id = ${req.params.id}
          RETURNING *
        `;
        return json({ ...updated, roles: Array.isArray(updated.roles) ? updated.roles : (updated.roles ? JSON.parse(updated.roles as string) : []) });
      },
      async DELETE(req) {
        const user = await authenticate(req);
        if (!requireRole(user, "officer")) return err("Forbidden", 403);
        await sql`DELETE FROM event_templates WHERE id = ${req.params.id}`;
        return json({ ok: true });
      },
    },

    // ── Recurring Events ─────────────────────────────────────────────────────────

    "/api/recurring": {
      async GET(req) {
        const user = await authenticate(req);
        if (!requireRole(user, "officer")) return err("Forbidden", 403);
        const rows = await sql`
          SELECT r.*, u.username AS created_by_name
          FROM recurring_events r
          LEFT JOIN users u ON u.id = r.created_by
          ORDER BY r.created_at DESC
        `;
        return json(rows.map(r => ({
          ...r,
          roles: Array.isArray(r.roles) ? r.roles : (r.roles ? JSON.parse(r.roles as string) : []),
          skip_dates: (r.skip_dates ?? []).map((d: any) => String(d).slice(0, 10)),
        })));
      },
      async POST(req) {
        const user = await authenticate(req);
        if (!requireRole(user, "officer")) return err("Forbidden", 403);
        const { title, description, weekdays, event_time, event_timezone, total_cap, channel_id, advance_minutes, roles, start_date, end_date, ping_role_ids, enable_ping, enable_reminder_ping } = await req.json();
        if (!title?.trim()) return err("title is required");
        if (!Array.isArray(weekdays) || weekdays.length === 0) return err("at least one weekday required");
        if (!event_time) return err("event_time is required");
        if (!start_date) return err("start_date is required");
        const [row] = await sql`
          INSERT INTO recurring_events
            (title, description, weekdays, event_time, event_timezone, total_cap, channel_id,
             advance_minutes, roles, start_date, end_date, created_by, ping_role_ids, enable_ping, enable_reminder_ping)
          VALUES (
            ${title.trim()}, ${description ?? null}, ${weekdays}, ${event_time},
            ${event_timezone ?? "America/New_York"}, ${total_cap ?? null}, ${channel_id ?? null},
            ${advance_minutes ?? 2880}, ${JSON.stringify(roles ?? [])}::jsonb,
            ${start_date}, ${end_date ?? null}, ${user!.id}, ${ping_role_ids ?? []}, ${enable_ping ?? true}, ${enable_reminder_ping ?? true}
          )
          RETURNING *
        `;
        await sql`SELECT pg_notify('recurring_updated', ${row.id}::text)`;
        return json({ ...row, roles: Array.isArray(row.roles) ? row.roles : [], skip_dates: [] }, 201);
      },
    },

    "/api/recurring/:id": {
      async GET(req) {
        const user = await authenticate(req);
        if (!requireRole(user, "officer")) return err("Forbidden", 403);
        const [row] = await sql`SELECT * FROM recurring_events WHERE id = ${req.params.id}`;
        if (!row) return err("Not found", 404);
        const recent = await sql`
          SELECT id, title, event_date::text, status
          FROM events WHERE recurring_id = ${req.params.id}
          ORDER BY event_date DESC LIMIT 10
        `;
        return json({
          ...row,
          roles: Array.isArray(row.roles) ? row.roles : (row.roles ? JSON.parse(row.roles as string) : []),
          skip_dates: (row.skip_dates ?? []).map((d: any) => String(d).slice(0, 10)),
          recent_events: recent,
        });
      },
      async PATCH(req) {
        const user = await authenticate(req);
        if (!requireRole(user, "officer")) return err("Forbidden", 403);
        const body = await req.json();
        const { title, description, weekdays, event_time, event_timezone, total_cap, channel_id,
                advance_minutes, roles, start_date, end_date, update_future_events, ping_role_ids, enable_ping, enable_reminder_ping } = body;
        const [updated] = await sql`
          UPDATE recurring_events SET
            title                = COALESCE(${title ?? null}, title),
            description          = ${description ?? null},
            weekdays             = COALESCE(${weekdays ?? null}, weekdays),
            event_time           = COALESCE(${event_time ?? null}::time, event_time),
            event_timezone       = COALESCE(${event_timezone ?? null}, event_timezone),
            total_cap            = COALESCE(${total_cap ?? null}, total_cap),
            channel_id           = ${channel_id ?? null},
            advance_minutes      = COALESCE(${advance_minutes ?? null}, advance_minutes),
            roles                = COALESCE(${roles ? JSON.stringify(roles) : null}::jsonb, roles),
            start_date           = COALESCE(${start_date ?? null}::date, start_date),
            end_date             = ${end_date ?? null},
            ping_role_ids        = COALESCE(${ping_role_ids        ?? null}, ping_role_ids),
            enable_ping          = COALESCE(${enable_ping          ?? null}, enable_ping),
            enable_reminder_ping = COALESCE(${enable_reminder_ping ?? null}, enable_reminder_ping),
            updated_at           = NOW()
          WHERE id = ${req.params.id}
          RETURNING *
        `;
        if (!updated) return err("Not found", 404);

        if (update_future_events) {
          const futureEvents = await sql`
            SELECT id FROM events
            WHERE recurring_id = ${req.params.id}
              AND event_date >= CURRENT_DATE
              AND status != 'closed'
          `;
          for (const ev of futureEvents) {
            await sql`
              UPDATE events SET
                title          = COALESCE(${title ?? null}, title),
                description    = ${description ?? null},
                event_time     = COALESCE(${event_time ?? null}::time, event_time),
                event_timezone = COALESCE(${event_timezone ?? null}, event_timezone),
                total_cap      = COALESCE(${total_cap ?? null}, total_cap),
                channel_id     = COALESCE(${channel_id ?? null}, channel_id),
                ping_role_ids        = COALESCE(${ping_role_ids        ?? null}, ping_role_ids),
                enable_ping          = COALESCE(${enable_ping          ?? null}, enable_ping),
                enable_reminder_ping = COALESCE(${enable_reminder_ping ?? null}, enable_reminder_ping),
                updated_at           = NOW()
              WHERE id = ${ev.id}
            `;
            await sql`
              UPDATE calendar_events SET
                title          = COALESCE(${title ?? null}, title),
                description    = ${description ?? null},
                event_time     = COALESCE(${event_time ?? null}::time, event_time),
                event_timezone = COALESCE(${event_timezone ?? null}, event_timezone),
                updated_at     = NOW()
              WHERE id = (SELECT calendar_event_id FROM events WHERE id = ${ev.id})
            `;
            if (Array.isArray(roles)) {
              await sql`DELETE FROM event_roles WHERE event_id = ${ev.id}`;
              for (let i = 0; i < roles.length; i++) {
                const r = roles[i];
                if (!r.name) continue;
                await sql`
                  INSERT INTO event_roles (event_id, name, emoji, soft_cap, display_order)
                  VALUES (${ev.id}, ${r.name}, ${r.emoji ?? null}, ${r.soft_cap ?? null}, ${i})
                `;
              }
            }
            await sql`SELECT pg_notify('event_updated', ${ev.id}::text)`;
          }
        }

        await sql`SELECT pg_notify('recurring_updated', ${req.params.id}::text)`;
        return json({
          ...updated,
          roles: Array.isArray(updated.roles) ? updated.roles : [],
          skip_dates: (updated.skip_dates ?? []).map((d: any) => String(d).slice(0, 10)),
        });
      },
      async DELETE(req) {
        const user = await authenticate(req);
        if (!requireRole(user, "officer")) return err("Forbidden", 403);
        const sid = req.params.id;
        await sql`DELETE FROM recurring_events WHERE id = ${sid}`;
        await sql`SELECT pg_notify('recurring_updated', ${sid}::text)`;
        return json({ ok: true });
      },
    },

    "/api/recurring/:id/skip": {
      async POST(req) {
        const user = await authenticate(req);
        if (!requireRole(user, "officer")) return err("Forbidden", 403);
        const { date } = await req.json();
        if (!date) return err("date is required");
        await sql`
          UPDATE recurring_events
          SET skip_dates = array_append(skip_dates, ${date}::date), updated_at = NOW()
          WHERE id = ${req.params.id}
        `;
        await sql`SELECT pg_notify('recurring_updated', ${req.params.id}::text)`;
        return json({ ok: true });
      },
    },

    "/api/recurring/:id/skip/:date": {
      async DELETE(req) {
        const user = await authenticate(req);
        if (!requireRole(user, "officer")) return err("Forbidden", 403);
        await sql`
          UPDATE recurring_events
          SET skip_dates = array_remove(skip_dates, ${req.params.date}::date), updated_at = NOW()
          WHERE id = ${req.params.id}
        `;
        await sql`SELECT pg_notify('recurring_updated', ${req.params.id}::text)`;
        return json({ ok: true });
      },
    },

    "/api/class-emojis": {
      async GET(req) {
        const user = await authenticate(req);
        if (!user || user.role === "pending") return err("Forbidden", 403);
        const rows = await sql`SELECT class_name, emoji_id, emoji_name, animated FROM class_emojis`;
        const result: Record<string, string> = {};
        for (const r of rows) {
          if (r.emoji_id && r.emoji_name) {
            result[r.class_name] = `<${r.animated ? "a" : ""}:${r.emoji_name}:${r.emoji_id}>`;
          } else if (r.emoji_name) {
            result[r.class_name] = r.emoji_name;
          }
        }
        return json(result);
      },
      async PUT(req) {
        const user = await authenticate(req);
        if (!requireRole(user, "officer")) return err("Forbidden", 403);
        const emojis: Record<string, string> = await req.json();
        for (const [className, value] of Object.entries(emojis)) {
          if (!value?.trim()) {
            await sql`DELETE FROM class_emojis WHERE class_name = ${className}`;
            continue;
          }
          // Parse <a:name:id> or <:name:id> or plain emoji/text
          const match = value.trim().match(/^<(a)?:([^:]+):(\d+)>$/);
          if (match) {
            const animated = !!match[1], name = match[2], id = match[3];
            await sql`
              INSERT INTO class_emojis (class_name, emoji_id, emoji_name, animated)
              VALUES (${className}, ${id}, ${name}, ${animated})
              ON CONFLICT (class_name) DO UPDATE SET
                emoji_id = ${id}, emoji_name = ${name}, animated = ${animated}, updated_at = NOW()
            `;
          } else {
            await sql`
              INSERT INTO class_emojis (class_name, emoji_id, emoji_name, animated)
              VALUES (${className}, NULL, ${value.trim()}, false)
              ON CONFLICT (class_name) DO UPDATE SET
                emoji_id = NULL, emoji_name = ${value.trim()}, animated = false, updated_at = NOW()
            `;
          }
        }
        return json({ ok: true });
      },
    },

    "/api/discord/channels": {
      async GET(req) {
        const user = await authenticate(req);
        if (!requireRole(user, "officer")) return err("Forbidden", 403);
        const guildId = process.env.DISCORD_GUILD_ID;
        const token   = process.env.DISCORD_BOT_TOKEN;
        if (!guildId || !token) return err("Discord bot token not configured", 500);
        const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
          headers: { Authorization: `Bot ${token}` },
        });
        if (!res.ok) return err("Failed to fetch Discord channels", 502);
        const all = await res.json() as Array<{ id: string; name: string; type: number }>;
        return json(all.filter(c => c.type === 0).map(c => ({ id: c.id, name: c.name })).sort((a, b) => a.name.localeCompare(b.name)));
      },
    },

    "/api/discord/roles": {
      async GET(req) {
        const user = await authenticate(req);
        if (!requireRole(user, "officer")) return err("Forbidden", 403);
        const guildId = process.env.DISCORD_GUILD_ID;
        const token   = process.env.DISCORD_BOT_TOKEN;
        if (!guildId || !token) return err("Discord bot token not configured", 500);
        const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}/roles`, {
          headers: { Authorization: `Bot ${token}` },
        });
        if (!res.ok) return err("Failed to fetch Discord roles", 502);
        const all = await res.json() as Array<{ id: string; name: string; color: number; position: number; managed: boolean }>;
        return json(
          all
            .filter(r => r.name !== "@everyone" && !r.managed)
            .sort((a, b) => b.position - a.position)
            .map(r => ({ id: r.id, name: r.name, color: r.color }))
        );
      },
    },

    "/api/discord/emojis": {
      async GET(req) {
        const user = await authenticate(req);
        if (!requireRole(user, "officer")) return err("Forbidden", 403);
        const guildId = process.env.DISCORD_CLASS_EMOJI_GUILD_ID ?? process.env.DISCORD_GUILD_ID;
        const token   = process.env.DISCORD_BOT_TOKEN;
        if (!guildId || !token) return err("Discord bot token not configured", 500);
        const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}/emojis`, {
          headers: { Authorization: `Bot ${token}` },
        });
        if (!res.ok) return err("Failed to fetch Discord emojis", 502);
        return json(await res.json());
      },
    },

    "/api/discord/emoji-image/:id": {
      async GET(req) {
        const token = process.env.DISCORD_BOT_TOKEN;
        if (!token) return err("Not configured", 500);
        const animated = new URL(req.url).searchParams.get("animated") === "1";
        const discordUrl = animated
          ? `https://cdn.discordapp.com/emojis/${req.params.id}.webp?size=64&animated=true`
          : `https://cdn.discordapp.com/emojis/${req.params.id}.webp?size=64`;
        const upstream = await fetch(discordUrl, {
          headers: { Authorization: `Bot ${token}` },
        });
        if (!upstream.ok) return new Response(null, { status: 404 });
        return new Response(upstream.body, {
          headers: {
            "Content-Type": upstream.headers.get("Content-Type") ?? "image/webp",
            "Cache-Control": "public, max-age=604800",
          },
        });
      },
    },

    // ── Quotes ───────────────────────────────────────────────────────────────

    "/api/quotes/keywords": {
      async GET(req) {
        const user = await authenticate(req);
        if (!user) return err("Unauthorized", 401);
        const rows = await sql`
          SELECT keyword, COUNT(*)::int AS count
          FROM quotes
          GROUP BY keyword
          ORDER BY keyword ASC
        `;
        return json(rows);
      },
    },

    "/api/discord/resolve-users": {
      async POST(req) {
        const user = await authenticate(req);
        if (!user) return err("Unauthorized", 401);

        const { ids } = await req.json() as { ids: string[] };
        if (!Array.isArray(ids) || ids.length === 0) return json({});

        const result: Record<string, string> = {};

        // Check our own users table first
        const known = await sql`
          SELECT discord_id, COALESCE(NULLIF(discord_username, ''), username) AS display_name
          FROM users
          WHERE discord_id = ANY(${ids})
        `;
        for (const row of known) result[row.discord_id] = row.display_name;

        // Fetch remaining IDs from Discord guild members API
        const missing = ids.filter(id => !result[id]);
        const botToken = process.env.DISCORD_BOT_TOKEN;
        const guildId  = process.env.DISCORD_GUILD_ID;

        if (missing.length && botToken && guildId) {
          await Promise.all(missing.map(async id => {
            try {
              const res = await fetch(
                `https://discord.com/api/v10/guilds/${guildId}/members/${id}`,
                { headers: { Authorization: `Bot ${botToken}` } }
              );
              if (!res.ok) return;
              const member = await res.json() as { nick?: string; user: { username: string; global_name?: string } };
              result[id] = member.nick ?? member.user.global_name ?? member.user.username;
            } catch { /* leave unresolved */ }
          }));
        }

        return json(result);
      },
    },

    "/api/quotes/refresh-urls": {
      async POST(req) {
        const user = await authenticate(req);
        if (!user) return err("Unauthorized", 401);

        const { urls } = await req.json() as { urls: string[] };
        if (!Array.isArray(urls) || urls.length === 0) return json({});

        const botToken = process.env.DISCORD_BOT_TOKEN;
        if (!botToken) return json({});

        // Discord accepts up to 50 URLs per request
        const map: Record<string, string> = {};
        for (let i = 0; i < urls.length; i += 50) {
          const batch = urls.slice(i, i + 50);
          try {
            const res = await fetch("https://discord.com/api/v10/attachments/refresh-urls", {
              method: "POST",
              headers: {
                Authorization: `Bot ${botToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ attachment_urls: batch }),
            });
            if (!res.ok) continue;
            const data = await res.json() as { refreshed_urls: { original: string; refreshed: string }[] };
            for (const { original, refreshed } of data.refreshed_urls) {
              map[original] = refreshed;
            }
          } catch {
            // partial failure is fine — unmapped URLs fall back to original
          }
        }
        return json(map);
      },
    },

    "/api/quotes/search": {
      async GET(req) {
        const user = await authenticate(req);
        if (!user) return err("Unauthorized", 401);

        const q = new URL(req.url).searchParams.get("q")?.trim();
        if (!q) return json([]);

        const pattern = `%${q}%`;

        // Find discord IDs whose username matches the query (for mention resolution)
        const matchingUsers = await sql`
          SELECT discord_id FROM users
          WHERE discord_id IS NOT NULL
            AND (discord_username ILIKE ${pattern} OR username ILIKE ${pattern})
        `;
        const matchingIds = matchingUsers.map((r: { discord_id: string }) => r.discord_id);

        const rows = matchingIds.length > 0
          ? await sql`
              SELECT keyword, id, nadeko_id, author_name, text
              FROM quotes
              WHERE keyword ILIKE ${pattern}
                 OR text ILIKE ${pattern}
                 OR author_name ILIKE ${pattern}
                 OR text ~ ${`<@!?(${matchingIds.join("|")})>`}
              ORDER BY keyword ASC, created_at ASC
            `
          : await sql`
              SELECT keyword, id, nadeko_id, author_name, text
              FROM quotes
              WHERE keyword ILIKE ${pattern}
                 OR text ILIKE ${pattern}
                 OR author_name ILIKE ${pattern}
              ORDER BY keyword ASC, created_at ASC
            `;

        // Group by keyword
        const groups: Record<string, { keyword: string; quotes: typeof rows }> = {};
        for (const row of rows) {
          if (!groups[row.keyword]) groups[row.keyword] = { keyword: row.keyword, quotes: [] };
          groups[row.keyword].quotes.push(row);
        }

        return json(Object.values(groups));
      },
    },

    "/api/quotes/keyword/:keyword": {
      async GET(req) {
        const user = await authenticate(req);
        if (!user) return err("Unauthorized", 401);
        const rows = await sql`
          SELECT id, nadeko_id, author_name, text
          FROM quotes
          WHERE keyword = ${req.params.keyword}
          ORDER BY created_at ASC
        `;
        return json(rows);
      },
    },

    // Serve public sound files
    "/sounds/*": async req => {
      const url = new URL(req.url);
      const filename = url.pathname.replace("/sounds/", "");
      if (!filename || filename.includes("..") || filename.includes("/")) {
        return new Response("Not found", { status: 404 });
      }
      const file = Bun.file(join(import.meta.dir, "../public/sounds", filename));
      if (!(await file.exists())) return new Response("Not found", { status: 404 });
      const ext = filename.split(".").pop()?.toLowerCase();
      const mime = ext === "ogg" ? "audio/ogg" : "audio/mpeg";
      return new Response(file, {
        headers: { "Content-Type": mime, "Cache-Control": "public, max-age=86400" },
      });
    },

    // Serve cached static assets
    "/assets/class-sprite.png": async _req => {
      const file = Bun.file(join(CACHE_DIR, "class-sprite.png"));
      if (!(await file.exists())) return new Response("Not found", { status: 404 });
      return new Response(file, {
        headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" },
      });
    },

    // Fallback: serve the React app for all other routes
    "/*": index,
  },

  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

// Ensure upload directories exist
await Bun.write(join(UPLOAD_DIR, "nodewar", ".gitkeep"), "");

// ── Cache class sprite ────────────────────────────────────────────────────────
async function syncClassSprite() {
  const SPRITE_REMOTE = "https://s1.pearlcdn.com/NAEU/contents/img/portal/gameinfo/classes_symbol_spr.png";
  const spritePath = join(CACHE_DIR, "class-sprite.png");
  const etagPath   = join(CACHE_DIR, "class-sprite.etag");

  await Bun.write(join(CACHE_DIR, ".gitkeep"), ""); // ensure dir exists

  const headers: Record<string, string> = {};
  const etagFile = Bun.file(etagPath);
  if (await etagFile.exists()) {
    const stored = (await etagFile.text()).trim();
    if (stored) headers["If-None-Match"] = stored;
  }

  try {
    const res = await fetch(SPRITE_REMOTE, { headers });
    if (res.status === 304) {
      console.log("✅ Class sprite is up to date");
    } else if (res.ok) {
      await Bun.write(spritePath, await res.arrayBuffer());
      const etag = res.headers.get("etag") ?? "";
      if (etag) await Bun.write(etagPath, etag);
      console.log("✅ Class sprite downloaded/updated");
    } else {
      console.warn(`⚠️  Could not fetch class sprite: HTTP ${res.status}`);
    }
  } catch (e) {
    console.warn("⚠️  Could not fetch class sprite:", e);
  }
}
await syncClassSprite();

// ── Cleanup expired sessions on startup ──────────────────────────────────────
await sql`DELETE FROM sessions WHERE expires_at < NOW()`;

console.log(`🚀 Server running at ${server.url}`);
