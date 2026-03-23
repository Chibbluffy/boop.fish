/**
 * One-time migration: resolve discord_<id> usernames to real Discord usernames.
 *
 * Finds all users whose username starts with "discord_" followed by a numeric
 * Discord ID, fetches the real Discord user via the bot token, and updates:
 *   - username        → Discord username (unique handle)
 *   - discord_id      → Discord user ID
 *   - discord_username→ Discord username
 *   - discord_avatar  → avatar URL (if available)
 *
 * Run from the boop-site directory:
 *   bun run ../scripts/fix-discord-usernames.ts
 *
 * Requires DATABASE_URL and DISCORD_BOT_TOKEN in environment.
 */

import postgres from "postgres";

const BOT_TOKEN  = process.env.DISCORD_BOT_TOKEN;
const DB_URL     = process.env.DATABASE_URL;

if (!BOT_TOKEN) { console.error("DISCORD_BOT_TOKEN not set"); process.exit(1); }
if (!DB_URL)    { console.error("DATABASE_URL not set");      process.exit(1); }

const sql = postgres(DB_URL, { max: 3 });

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function fetchDiscordUser(discordId: string) {
  const res = await fetch(`https://discord.com/api/v10/users/${discordId}`, {
    headers: { Authorization: `Bot ${BOT_TOKEN}` },
  });
  if (res.status === 429) {
    const retry = Number((await res.json() as any).retry_after ?? 1);
    console.log(`  Rate limited — waiting ${retry}s`);
    await sleep(retry * 1000 + 100);
    return fetchDiscordUser(discordId);
  }
  if (!res.ok) {
    console.warn(`  Discord API ${res.status} for user ${discordId}`);
    return null;
  }
  return res.json() as Promise<{ id: string; username: string; global_name: string | null; avatar: string | null }>;
}

async function main() {
  // Find all bot-migrated users
  const rows = await sql<{ id: string; username: string }[]>`
    SELECT id, username
    FROM users
    WHERE username ~ '^discord_[0-9]+$'
    ORDER BY created_at ASC
  `;

  console.log(`Found ${rows.length} discord_<id> users to resolve.\n`);

  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const discordId = row.username.replace("discord_", "");
    process.stdout.write(`[${row.username}] → `);

    const discordUser = await fetchDiscordUser(discordId);
    if (!discordUser) {
      console.log("skip (API error)");
      skipped++;
      await sleep(500);
      continue;
    }

    const newUsername    = discordUser.username;
    const discordAvatar  = discordUser.avatar
      ? `https://cdn.discordapp.com/avatars/${discordId}/${discordUser.avatar}.png`
      : null;

    // Check if the real username is already taken by a different account
    const [conflict] = await sql`
      SELECT id FROM users WHERE username = ${newUsername} AND id != ${row.id}
    `;
    if (conflict) {
      console.log(`skip — username "${newUsername}" already taken by another account`);
      skipped++;
      await sleep(300);
      continue;
    }

    await sql`
      UPDATE users SET
        username         = ${newUsername},
        discord_id       = ${discordId},
        discord_username = ${newUsername},
        discord_avatar   = ${discordAvatar},
        discord_name     = ${discordUser.global_name ?? newUsername},
        updated_at       = NOW()
      WHERE id = ${row.id}
    `;

    console.log(`${newUsername}${discordUser.global_name ? ` (${discordUser.global_name})` : ""}`);
    updated++;

    // Be polite to Discord's API — stay well under rate limits
    await sleep(300);
  }

  console.log(`\nDone. Updated: ${updated}, Skipped: ${skipped}`);
  await sql.end();
}

main().catch(e => { console.error(e); process.exit(1); });
