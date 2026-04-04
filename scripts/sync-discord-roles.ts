/**
 * Daily role sync: checks every Discord-linked user against the guild and updates
 * their role if their membership or guild roles have changed.
 *
 * - Members who left the guild are set to "pending"
 * - Members who lost the member role are downgraded to "friend"
 * - Officers and admins are never downgraded
 *
 * Run manually from the boop-site directory:
 *   bun run ../scripts/sync-discord-roles.ts
 *
 * Scheduled via pm2 (run from repo root):
 *   pm2 start "bun run scripts/sync-discord-roles.ts" --name sync-discord-roles --cron "0 0 * * *" --no-autorestart
 *
 * Requires DATABASE_URL, DISCORD_BOT_TOKEN, and DISCORD_GUILD_ID in environment.
 */

import postgres from "postgres";

const BOT_TOKEN    = process.env.DISCORD_BOT_TOKEN;
const DB_URL       = process.env.DATABASE_URL;
const GUILD_ID     = process.env.DISCORD_GUILD_ID;
const MEMBER_ROLE  = process.env.DISCORD_MEMBER_ROLE_ID;

if (!BOT_TOKEN) { console.error("DISCORD_BOT_TOKEN not set"); process.exit(1); }
if (!DB_URL)    { console.error("DATABASE_URL not set");      process.exit(1); }
if (!GUILD_ID)  { console.error("DISCORD_GUILD_ID not set");  process.exit(1); }

const sql = postgres(DB_URL, { max: 3 });
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function fetchGuildMember(discordId: string): Promise<{ roles: string[] } | null | "not_in_guild"> {
  const res = await fetch(`https://discord.com/api/v10/guilds/${GUILD_ID}/members/${discordId}`, {
    headers: { Authorization: `Bot ${BOT_TOKEN}` },
  });
  if (res.status === 429) {
    const retry = Number((await res.json() as any).retry_after ?? 1);
    console.log(`  Rate limited — waiting ${retry}s`);
    await sleep(retry * 1000 + 100);
    return fetchGuildMember(discordId);
  }
  if (res.status === 404) return "not_in_guild";
  if (!res.ok) {
    console.warn(`  Discord API ${res.status} for member ${discordId}`);
    return null;
  }
  return res.json() as Promise<{ roles: string[] }>;
}

async function main() {
  const users = await sql<{ id: string; discord_id: string; username: string; role: string }[]>`
    SELECT id, discord_id, username, role
    FROM users
    WHERE discord_id IS NOT NULL
      AND role NOT IN ('officer', 'admin')
    ORDER BY username ASC
  `;

  console.log(`Syncing ${users.length} Discord-linked users...\n`);

  let updated = 0;
  let unchanged = 0;
  let skipped = 0;

  for (const user of users) {
    process.stdout.write(`[${user.username}] (${user.role}) → `);

    const member = await fetchGuildMember(user.discord_id);

    if (member === null) {
      console.log("skip (API error)");
      skipped++;
      await sleep(300);
      continue;
    }

    let newRole: string;
    if (member === "not_in_guild") {
      newRole = "pending";
    } else {
      newRole = (!MEMBER_ROLE || member.roles.includes(MEMBER_ROLE)) ? "member" : "friend";
    }

    if (newRole === user.role) {
      console.log(`unchanged (${user.role})`);
      unchanged++;
    } else {
      await sql`UPDATE users SET role = ${newRole}, updated_at = NOW() WHERE id = ${user.id}`;
      console.log(`${user.role} → ${newRole}`);
      updated++;
    }

    await sleep(300);
  }

  console.log(`\nDone. Updated: ${updated}, Unchanged: ${unchanged}, Skipped: ${skipped}`);
  await sql.end();
}

main().catch(e => { console.error(e); process.exit(1); });
