# boop.fish

Guild website for **boop** — a Black Desert Online guild. Built with Bun, React, Tailwind CSS, and PostgreSQL.

## Features

**For all members**
- **Home** — guild announcements and news
- **Guild Directory** — browse all members with gear, class, timezone, and frog count
- **Calendar** — upcoming guild events with per-timezone time conversion
- **Gear Leaderboard** — sortable gear score rankings across the guild
- **Ribbit Leaderboard** — top frog clickers
- **Wall of Shame** — guild highlight reel of disasters and funny moments
- **Black Shrine Sign-ups** — sign up for Black Shrine runs with your gear stats
- **Employee of the Day/Month** — officer-awarded recognition

**Tools**
- **Class Roller** — randomly roll a BDO class
- **Party Shuffler** — split a list of names into balanced groups
- **Frogs** — click frogs to earn ribbits (100 ribbits = +1 payout tier bonus, up to +5)

**Officer / Admin only**
- **Manage** — member roster with inline rank/status editing, member approval, ribbit resets
- **Nodewar** — upload screenshots and track win/loss history
- **Payout Tracker** — track guild payout tiers (T1–T10) per member with bulk actions and full history log
- **Submit Wall of Shame** — post new wall entries

## Stack

| Layer | Tech |
|---|---|
| Runtime | [Bun](https://bun.sh) |
| Frontend | React 19, Tailwind CSS v4 |
| Backend | Bun HTTP server (`src/index.ts`) |
| Database | PostgreSQL (`postgres` driver) |
| Auth | Server-side sessions, bcrypt passwords |
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
```

## Setup

### 1. Database

```bash
psql -d <your_db> -f db/schema.sql
```

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
```

`ADMIN_USERNAME` / `ADMIN_PASSWORD` seed an admin account on startup if it doesn't exist yet. `SITE_URL` can optionally be set (defaults to `https://boop.fish`).

Discord OAuth setup:
1. Create an app at [discord.com/developers/applications](https://discord.com/developers/applications)
2. Under **OAuth2** → copy Client ID and Client Secret; add redirect URI `https://boop.fish/auth/discord/callback`
3. No bot required — membership is verified using the user's own OAuth token

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

## Roles

| Role | Access |
|---|---|
| `pending` | No access until approved by an officer |
| `member` | All member-facing pages |
| `officer` | + Roster management, payout tracker, nodewar, wall of shame |
| `admin` | Full access including role changes and member deletion |
