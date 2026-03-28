import { serve } from "bun";
import { join } from "path";
import { unlink } from "fs/promises";
import index from "./index.html";

import sql from "./lib/db";
import {
  hashPassword,
  verifyPassword,
  createSession,
  deleteSession,
  authenticate,
  requireRole,
} from "./lib/auth-server";
import { sendEmail, passwordResetEmail } from "./lib/email";

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

    "/api/auth/register": {
      async POST(req) {
        const { username, password, family_name, discord_name, timezone } = await req.json();
        if (!username || !password) return err("username and password are required");
        if (!timezone) return err("timezone is required");
        if (password.length < 8) return err("Password must be at least 8 characters");

        const exists = await sql`SELECT id FROM users WHERE username = ${username}`;
        if (exists.length) return err("Username already taken", 409);

        const password_hash = await hashPassword(password);
        const [user] = await sql`
          INSERT INTO users (username, password_hash, family_name, discord_name, timezone, role)
          VALUES (${username}, ${password_hash}, ${family_name ?? null}, ${discord_name ?? null}, ${timezone}, 'member')
          RETURNING id, username, email, role, character_name, family_name, discord_name,
                    discord_id, discord_username, discord_avatar,
                    ribbit_count, bdo_class, alt_class, gear_ap, gear_aap, gear_dp, timezone
        `;
        const token = await createSession(user.id);
        return json({ token, user }, 201);
      },
    },

    "/api/auth/login": {
      async POST(req) {
        const { username, password } = await req.json();
        if (!username || !password) return err("username and password are required");

        const [user] = await sql`
          SELECT id, username, email, password_hash, role, character_name, family_name, discord_name, ribbit_count, bdo_class, alt_class, gear_ap, gear_aap, gear_dp, timezone
          FROM users WHERE username = ${username}
        `;
        if (!user || !user.password_hash) return err("Invalid username or password", 401);

        const ok = await verifyPassword(password, user.password_hash);
        if (!ok) return err("Invalid username or password", 401);

        const token = await createSession(user.id);
        const { password_hash: _, ...safeUser } = user;
        return json({ token, user: safeUser });
      },
    },

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
            // Create a new account
            let username = discordUsername;
            const taken = await sql`SELECT id FROM users WHERE username = ${username}`;
            if (taken.length) username = `${discordUsername}_${discordId.slice(-4)}`;

            const [newUser] = await sql`
              INSERT INTO users (username, password_hash, role, discord_id, discord_username, discord_avatar, discord_name)
              VALUES (${username}, '', ${discordRole}, ${discordId}, ${discordUsername}, ${discordAvatar}, ${discordUsername})
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

    "/api/auth/forgot-password": {
      async POST(req) {
        const { email } = await req.json();
        if (!email) return err("email is required");

        // Always return 200 — never reveal whether an email exists
        const [user] = await sql`SELECT id, username FROM users WHERE email = ${email}`;
        if (!user) return json({ ok: true });

        // Invalidate any existing reset tokens for this user
        await sql`DELETE FROM password_reset_tokens WHERE user_id = ${user.id}`;

        // Generate token
        const bytes = new Uint8Array(32);
        crypto.getRandomValues(bytes);
        const token = Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

        await sql`
          INSERT INTO password_reset_tokens (user_id, token, expires_at)
          VALUES (${user.id}, ${token}, ${expiresAt})
        `;

        const baseUrl = process.env.SITE_URL ?? "https://boop.fish";
        const resetUrl = `${baseUrl}/#/auth?reset=${token}`;
        const { subject, html, text } = passwordResetEmail(user.username, resetUrl);

        await sendEmail({ to: email, subject, html, text });
        return json({ ok: true });
      },
    },

    "/api/auth/reset-password": {
      async POST(req) {
        const { token, password } = await req.json();
        if (!token || !password) return err("token and password are required");
        if (password.length < 8) return err("Password must be at least 8 characters");

        const [row] = await sql`
          SELECT user_id FROM password_reset_tokens
          WHERE token = ${token} AND expires_at > NOW()
        `;
        if (!row) return err("Reset link is invalid or has expired", 400);

        const password_hash = await hashPassword(password);
        await sql`UPDATE users SET password_hash = ${password_hash} WHERE id = ${row.user_id}`;

        // Single-use: delete the token and all sessions so other devices are logged out
        await sql`DELETE FROM password_reset_tokens WHERE token = ${token}`;
        await sql`DELETE FROM sessions WHERE user_id = ${row.user_id}`;

        return json({ ok: true });
      },
    },

    "/api/auth/me": {
      async GET(req) {
        const user = await authenticate(req);
        if (!user) return err("Unauthorized", 401);
        return json({ user });
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
                 GREATEST(COALESCE(gear_ap, 0), COALESCE(gear_aap, 0)) + COALESCE(gear_dp, 0) AS gs,
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
        const { family_name, discord_name, guild_rank, play_status, roster_notes } = await req.json();
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
        const ribbits = await sql`
          SELECT username, family_name, ribbit_count
          FROM users
          WHERE role != 'pending' AND ribbit_count > 0
          ORDER BY ribbit_count DESC
          LIMIT 10
        `;
        const gear = await sql`
          SELECT username, family_name, bdo_class, alt_class, gear_ap, gear_aap, gear_dp,
            GREATEST(COALESCE(gear_ap, 0), COALESCE(gear_aap, 0)) + COALESCE(gear_dp, 0) AS gs
          FROM users
          WHERE role != 'pending'
            AND (gear_ap IS NOT NULL OR gear_aap IS NOT NULL OR gear_dp IS NOT NULL)
          ORDER BY gs DESC
        `;
        return json({ ribbits, gear });
      },
    },

    // ── Calendar ─────────────────────────────────────────────────────────────

    "/api/calendar": {
      async GET(_req) {
        const events = await sql`
          SELECT id, title, description, event_date::text,
                 event_time::text, event_timezone, created_at
          FROM calendar_events
          ORDER BY event_date ASC, event_time ASC NULLS LAST
        `;
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

    "/api/shrine/:id": {
      async DELETE(req) {
        const user = await authenticate(req);
        if (!requireRole(user, "officer")) return err("Forbidden", 403);
        await sql`DELETE FROM shrine_signups WHERE id = ${req.params.id}`;
        return json({ ok: true });
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

// ── Bootstrap admin account ───────────────────────────────────────────────────
const adminUsername = process.env.ADMIN_USERNAME?.trim();
const adminPassword = process.env.ADMIN_PASSWORD?.trim();

if (adminUsername && adminPassword) {
  const existing = await sql`SELECT id FROM users WHERE username = ${adminUsername}`;
  if (!existing.length) {
    const password_hash = await hashPassword(adminPassword);
    await sql`
      INSERT INTO users (username, password_hash, role)
      VALUES (${adminUsername}, ${password_hash}, 'admin')
    `;
    console.log(`✅ Bootstrap admin created: ${adminUsername}`);
  }
}

// ── Cleanup expired sessions and reset tokens on startup ─────────────────────
await sql`DELETE FROM sessions              WHERE expires_at < NOW()`;
await sql`DELETE FROM password_reset_tokens WHERE expires_at < NOW()`;

console.log(`🚀 Server running at ${server.url}`);
