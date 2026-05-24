# boop.fish

Guild website for **boop** — a Black Desert Online guild. Built with Bun, React, Tailwind CSS, and PostgreSQL.

## Features

**For all members**
- **Home** — guild announcements and news
- **Calendar / Events** — browse and sign up for upcoming guild events; each event has named roles with per-role class restrictions (BDO classes, custom subset, or open); recurring event series supported
- **Attendance** — confirms who showed up to past events; officers can mark presence
- **Availability** — drag-and-drop weekly grid showing when you're generally free; overlaps with other members shown as a heatmap
- **Guild Directory** — browse all members with gear, class, timezone, and frog count
- **Gear Leaderboard** — sortable gear score rankings across the guild
- **Ribbit Leaderboard** — top frog clickers
- **Wall of Shame** — guild highlight reel of disasters and funny moments
- **Black Shrine Sign-ups** — sign up for Black Shrine runs with your saved gear stats
- **Employee of the Day/Month** — officer-awarded recognition
- **Quote Archive** — search bot quotes by keyword. Essentially Nadekobot's quote system, but in BoopBot instead and way easier to manage

**Tools**
- **Class Roller** — randomly roll a BDO class
- **Party Shuffler** — split a list of names into balanced groups
- **Random Chooser** — pick a random winner from a list of entries
- **Dice Roller** — 3D dice roller with sound
- **Frogs** — click frogs to earn ribbits (minigame to auto increase payout tier bonus)

**Officer / Admin only**
- **Manage** — member roster with inline rank/status editing, member approval, ribbit resets
- **Nodewar** — syncs war score screenshots from a configured Discord channel; displays history by date
- **Payout Tracker** — track guild payout tiers (T1–T10) per member with bulk actions and full history log
- **Black Shrine team builder** — drag-and-drop sign-up list into teams of 5
- **Submit Wall of Shame** — post new wall entries
- **Event templates** — create reusable event structures for quick scheduling

## Showcase

Most of the site is gated behind Discord OAuth — here's what logged-in members and officers actually see.

### Member views

<table>
  <tr>
    <td align="center"><b>Calendar</b><br><img src="screenshots/calendar.png" alt="Calendar" width="420"></td>
    <td align="center"><b>Availability</b><br><img src="screenshots/availability.png" alt="Availability" width="420"></td>
  </tr>
  <tr>
    <td align="center"><b>Event</b><br><img src="screenshots/event.png" alt="Event" width="420"></td>
    <td align="center"><b>Event Sign-up</b><br><img src="screenshots/event-signup.png" alt="Event sign-up" width="420"></td>
  </tr>
  <tr>
    <td align="center"><b>Gear Leaderboard</b><br><img src="screenshots/gear-leaderboard.png" alt="Gear Leaderboard" width="420"></td>
    <td align="center"><b>Guild Directory</b><br><img src="screenshots/guild-directory.png" alt="Guild Directory" width="420"></td>
  </tr>
  <tr>
    <td align="center"><b>Black Shrine Sign-ups</b><br><img src="screenshots/black-shrine.png" alt="Black Shrine" width="420"></td>
    <td align="center"><b>Black Shrine Team Manager</b><br><img src="screenshots/shrine-teams.png" alt="Black Shrine Teams" width="420"></td>
  </tr>
  <tr>
    <td align="center"><b>Payout Tracker</b><br><img src="screenshots/payout-tracker.png" alt="Payout Tracker" width="420"></td>
    <td align="center"><b>Member Management</b><br><img src="screenshots/manage.png" alt="Member Management" width="420"></td>
  </tr>
  <tr>
    <td align="center"><b>Nodewar</b><br><img src="screenshots/nodewar.png" alt="Nodewar" width="420"></td>
    <td align="center"><b>Archive</b><br><img src="screenshots/archive.png" alt="Archive" width="420"></td>
  </tr>
</table>

## Stack

| Layer | Tech |
|---|---|
| Runtime | [Bun](https://bun.sh) |
| Frontend | React 19, Tailwind CSS v4 |
| Backend | Bun HTTP server (`src/index.ts`) |
| Database | PostgreSQL (`postgres` driver) |
| Auth | Discord OAuth 2.0, server-side sessions |
| Process manager | pm2 |

## Project structure

```
boop-site/
  src/
    index.ts          # Bun HTTP server + all API routes
    App.tsx           # Hash-based client router
    pages/            # One file per page/route
    components/       # Nav, shared UI
    hooks/            # useRibbits, etc.
    lib/              # auth helpers, timezone list
  build.ts            # Bundles frontend assets
db/
  schema.sql          # Full PostgreSQL schema + migration comments
scripts/
  sync-discord-roles.ts   # Daily cron: syncs Discord roles → site roles
```

## Setup

### 1. Database

```bash
psql -d <your_db> -f db/schema.sql
```

- On Mac
	- Run without starting on reboot
		- ```LC_ALL="en_US.UTF-8" /opt/homebrew/opt/postgresql@16/bin/postgres -D /opt/homebrew/var/postgresql@16```
	- Run on login
		- ```brew services start postgresql@16```
  - Login after starting db services
    - `psql postgres`
    - `\c boopfish`


### 2. Environment

Create a `.env` file (or set environment variables):

```
DATABASE_URL=postgres://user:password@localhost:5432/yourdb
ADMIN_USERNAME=youradminuser
ADMIN_PASSWORD=youradminpassword

DISCORD_CLIENT_ID=your_client_id
DISCORD_CLIENT_SECRET=your_client_secret
DISCORD_GUILD_ID=your_server_id
DISCORD_BOT_TOKEN=your_bot_token

# Optional — if set, only users with this Discord role ID are promoted to "member";
# others in the server are assigned "friend" (same access but excluded from Guild Directory)
GUILD_MEMBER_ROLE_ID=your_member_role_id

# Optional — Discord channel ID to sync war score screenshots from (enables Nodewar page)
WAR_SCORES_CHANNEL_ID=your_channel_id

# Optional — guild to pull emoji list from in Class Emojis settings (defaults to DISCORD_GUILD_ID)
DISCORD_CLASS_EMOJI_GUILD_ID=your_emoji_guild_id
```

`ADMIN_USERNAME` / `ADMIN_PASSWORD` seed an admin account on startup if it doesn't exist yet. `SITE_URL` can optionally be set (defaults to `https://boop.fish`).

Discord OAuth setup:
1. Create an app at [discord.com/developers/applications](https://discord.com/developers/applications)
2. Under **OAuth2** → copy Client ID and Client Secret; add redirect URI `https://boop.fish/auth/discord/callback`
3. Create a bot in the same app and copy the Bot Token — required for guild membership verification, role syncing, and Nodewar channel access

### 3. Install and run

```bash
cd boop-site
bun install

# Development (hot reload)
bun dev

# Production
bun start
```

### 4. Production with pm2

```bash
npm install -g pm2
pm2 start "bun run src/index.ts" --name boop-fish
pm2 save
pm2 startup
```

To restart after updates:
```bash
pm2 restart boop-fish
```

### 5. Daily role sync

A script checks all Discord-linked users against the guild once a day and updates roles automatically (members who left become `pending`, members who lost the member role become `friend`). Officers and admins are never downgraded.

Schedule it with pm2 (run from repo root):

```bash
pm2 start "bun run scripts/sync-discord-roles.ts" --name sync-discord-roles --cron "0 0 * * *" --no-autorestart
pm2 save
```

To run it manually:
```bash
cd boop-site && bun run ../scripts/sync-discord-roles.ts
```

Requires `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, and optionally `GUILD_MEMBER_ROLE_ID` in your `.env`.

## Roles

| Role | Access |
|---|---|
| `pending` | No access until approved by an officer |
| `friend` | All member-facing pages except Guild Directory; ribbit earnings are capped |
| `member` | All member-facing pages |
| `officer` | + Roster management, payout tracker, nodewar, wall of shame, shrine team builder |
| `admin` | Full access including role assignment and member deletion |

`friend` is assigned automatically to Discord users in the server who don't hold the `GUILD_MEMBER_ROLE_ID` role (or if that env var isn't set, all guild members are promoted to `member`).

## Maintenance

### Adding a new BDO class

Go to **Settings → Class Emojis → BDO Classes → "+ Add BDO Class"**, type the class name, and click Add. Then assign it a Discord emoji in the same section and click "Save Emojis".

That's it — **no code changes, no deploys needed**. The class will appear on the wheel and in Discord event signup dropdowns within 5 minutes (bot cache TTL).

`boop-site/src/lib/bdo-classes.ts` and `BoopBot/cogs/events.py` still contain a static fallback list used if the DB is unreachable. Keep these in sync when adding a class as a belt-and-suspenders safety net, but it is not required for normal operation.

### Adding custom signup options (boats, specs, etc.)

Go to **Settings → Class Emojis → Custom Entries** and add the entry name with an optional emoji.
It will immediately appear in the ClassPicker when editing a role's "Custom selection" list on any event, template, or recurring series.
