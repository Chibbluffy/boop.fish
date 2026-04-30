-- ============================================================
-- boop.fish PostgreSQL schema
-- Run: psql -d <your_db> -f schema.sql
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- provides gen_random_uuid()

-- ============================================================
-- USERS
-- NOTE on passwords: we use bcrypt via Bun.password.hash().
-- bcrypt embeds a unique random salt into every hash output,
-- so the stored hash IS the salted hash — no separate salt
-- column is required. A hash looks like:
--   $2b$12$<22-char-salt><31-char-digest>
-- Bun.password.verify(plain, hash) handles comparison safely.
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  username      VARCHAR(50) UNIQUE NOT NULL,
  email         VARCHAR(255) UNIQUE,
  password_hash TEXT        NOT NULL,          -- bcrypt, salt embedded
  role          VARCHAR(20) NOT NULL DEFAULT 'member'
                            CHECK (role IN ('pending', 'friend', 'member', 'officer', 'admin')),
  character_name VARCHAR(100),                 -- in-game name
  ribbit_count  INTEGER     NOT NULL DEFAULT 0, -- 🐸 activity marker
  bdo_class     VARCHAR(50),                    -- saved BDO class (main)
  alt_class     VARCHAR(50),                    -- tagged / alt class
  gear_ap       INTEGER,                        -- saved AP
  gear_aap      INTEGER,                        -- saved Awakening AP
  gear_dp       INTEGER,                        -- saved DP
  gear_image_url TEXT,                          -- gear screenshot URL (set via bot or site)
  -- Roster fields
  timezone      VARCHAR(60),                    -- IANA timezone, set at registration
  family_name   VARCHAR(100),                   -- BDO family name
  discord_name  VARCHAR(100),                   -- Discord username
  guild_rank    VARCHAR(50)  DEFAULT 'Member',  -- in-guild rank (GM/Officer/Staff/etc.)
  play_status   VARCHAR(30)  DEFAULT 'Active',  -- PvP/PvE/AFK/etc.
  roster_notes  TEXT,                           -- officer-managed notes
  payout_tier   INTEGER     NOT NULL DEFAULT 1, -- guild payout tier (1-10)
  -- Discord OAuth (nullable — existing password accounts stay valid)
  discord_id       VARCHAR(20)  UNIQUE,
  discord_username VARCHAR(100),
  discord_avatar   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Migrations for existing installs:
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone        VARCHAR(60);
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS family_name     VARCHAR(100);
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS discord_name    VARCHAR(100);
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS guild_rank      VARCHAR(50) DEFAULT 'Member';
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS play_status     VARCHAR(30) DEFAULT 'Active';
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS roster_notes    TEXT;
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS alt_class       VARCHAR(50);
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS payout_tier     INTEGER NOT NULL DEFAULT 1;
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS discord_id      VARCHAR(20) UNIQUE;
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS discord_username VARCHAR(100);
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS discord_avatar  TEXT;
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS gear_image_url  TEXT;
-- ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
-- ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
-- ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('pending', 'friend', 'member', 'officer', 'admin'));
-- ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS event_time     TIME;
-- ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS event_timezone VARCHAR(60);

-- ============================================================
-- SESSIONS  (server-side, fully revocable)
-- The token is a random 32-byte hex string stored here and in
-- the client's localStorage. On every API request the client
-- sends it; we look it up and reject if expired or missing.
-- ============================================================
CREATE TABLE IF NOT EXISTS sessions (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      TEXT        UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sessions_token   ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

-- ============================================================
-- CALENDAR EVENTS
-- Officers/admins create events; all members can read.
-- ============================================================
CREATE TABLE IF NOT EXISTS calendar_events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title       VARCHAR(255) NOT NULL,
  description TEXT,
  event_date  DATE        NOT NULL,
  event_time  TIME,                            -- optional; NULL = all day
  event_timezone VARCHAR(60),                  -- IANA tz of creator; used for display conversion
  created_by  UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_calendar_event_date ON calendar_events(event_date);

-- ============================================================
-- CALENDAR EVENT INTERESTS
-- Tracks which users are interested in non-Discord calendar
-- events, mirroring Discord's native "interested" system.
-- ============================================================
CREATE TABLE IF NOT EXISTS calendar_event_interests (
  event_id   UUID NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (event_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_calendar_interests_event ON calendar_event_interests(event_id);
CREATE INDEX IF NOT EXISTS idx_calendar_interests_user  ON calendar_event_interests(user_id);
-- Migration for existing installs:
-- (run the CREATE TABLE and CREATE INDEX statements above)

-- ============================================================
-- EMPLOYEE AWARDS  (employee of the day / month)
-- display_name is stored directly so awards survive account
-- deletion.  user_id is a soft-link for profile lookups.
-- ============================================================
CREATE TABLE IF NOT EXISTS employee_awards (
  id           UUID       PRIMARY KEY DEFAULT gen_random_uuid(),
  award_type   VARCHAR(5) NOT NULL CHECK (award_type IN ('day', 'month')),
  display_name VARCHAR(100) NOT NULL,
  user_id      UUID       REFERENCES users(id) ON DELETE SET NULL,
  reason       TEXT,
  image_path   TEXT,
  award_date   DATE       NOT NULL,
  awarded_by   UUID       REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Migration for existing installs:
-- ALTER TABLE employee_awards ADD COLUMN IF NOT EXISTS image_path TEXT;
CREATE INDEX IF NOT EXISTS idx_employee_awards_date ON employee_awards(award_date);
CREATE INDEX IF NOT EXISTS idx_employee_awards_type ON employee_awards(award_type);

-- ============================================================
-- NODEWAR ENTRIES
-- Images are stored on the server filesystem under
--   /uploads/nodewar/<filename>
-- and served by Bun at /uploads/*.  Only the path is kept
-- here.  To migrate to R2/MinIO later, just change image_path
-- to a full URL — nothing else needs to change.
-- ============================================================
CREATE TABLE IF NOT EXISTS nodewar_entries (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title       VARCHAR(255),
  node_name   VARCHAR(255),
  event_date  DATE        NOT NULL,
  result      VARCHAR(5)  CHECK (result IN ('win', 'loss', 'draw')),
  image_path  TEXT,                             -- e.g. /uploads/nodewar/abc123.png
  notes       TEXT,
  uploaded_by UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_nodewar_date ON nodewar_entries(event_date);

-- ============================================================
-- NODEWAR IMAGES  (multiple images per entry)
-- ============================================================
CREATE TABLE IF NOT EXISTS nodewar_images (
  id          UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id    UUID  NOT NULL REFERENCES nodewar_entries(id) ON DELETE CASCADE,
  image_path  TEXT  NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_nodewar_images_entry ON nodewar_images(entry_id);

-- ============================================================
-- WALL OF SHAME  (troll/funny officer announcements)
-- ============================================================
CREATE TABLE IF NOT EXISTS wall_of_shame (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  title        VARCHAR(255) NOT NULL,
  description  TEXT,
  image_path   TEXT,
  submitted_by UUID         REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
-- Migration for existing installs:
-- ALTER TABLE wall_of_shame ADD COLUMN IF NOT EXISTS image_path TEXT;

-- ============================================================
-- ANNOUNCEMENTS  (homepage guild announcements)
-- ============================================================
CREATE TABLE IF NOT EXISTS announcements (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  title       VARCHAR(255) NOT NULL,
  body        TEXT,
  pinned      BOOLEAN      NOT NULL DEFAULT FALSE,
  created_by  UUID         REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_announcements_pinned ON announcements(pinned, created_at DESC);

-- ============================================================
-- AUTO-UPDATE updated_at TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_users_updated_at') THEN
    CREATE TRIGGER trg_users_updated_at
      BEFORE UPDATE ON users
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_calendar_updated_at') THEN
    CREATE TRIGGER trg_calendar_updated_at
      BEFORE UPDATE ON calendar_events
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

-- ============================================================
-- PASSWORD RESET TOKENS
-- Short-lived (1 hour), single-use.  Deleted on use or expiry.
-- Keyed by email so the user doesn't need to remember their
-- username to recover access.
-- ============================================================
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      TEXT        UNIQUE NOT NULL,  -- random 32-byte hex
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reset_tokens_token ON password_reset_tokens(token);

-- ============================================================
-- CLEANUP: run these periodically (cron or on startup)
-- DELETE FROM sessions             WHERE expires_at < NOW();
-- DELETE FROM password_reset_tokens WHERE expires_at < NOW();
-- ============================================================

-- ============================================================
-- BLACK SHRINE SIGN-UPS
-- One row per user (UNIQUE on user_id).  Officers can clear all.
-- ============================================================
CREATE TABLE IF NOT EXISTS shrine_signups (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  character_name VARCHAR(100),
  bdo_class      VARCHAR(50),
  ap             INTEGER,
  aap            INTEGER,
  dp             INTEGER,
  note           TEXT,
  signed_up_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)
);
CREATE INDEX IF NOT EXISTS idx_shrine_signups_user ON shrine_signups(user_id);

-- ============================================================
-- SHRINE TEAMS  (officer-managed, drag-and-drop team builder)
-- ============================================================
CREATE TABLE IF NOT EXISTS shrine_teams (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(100) NOT NULL DEFAULT 'New Team',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shrine_team_members (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id   UUID NOT NULL REFERENCES shrine_teams(id)   ON DELETE CASCADE,
  signup_id UUID NOT NULL REFERENCES shrine_signups(id) ON DELETE CASCADE,
  added_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (signup_id)  -- one team per player
);
CREATE INDEX IF NOT EXISTS idx_shrine_team_members_team   ON shrine_team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_shrine_team_members_signup ON shrine_team_members(signup_id);

-- ============================================================
-- SHRINE AVAILABILITY  (weekly hour-of-week slots, stored in UTC)
-- utc_slot = day_of_week_mon0 * 24 + hour  (0–167)
-- ============================================================
CREATE TABLE IF NOT EXISTS shrine_availability (
  id        UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   UUID     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  utc_slot  SMALLINT NOT NULL CHECK (utc_slot >= 0 AND utc_slot < 168),
  UNIQUE (user_id, utc_slot)
);
CREATE INDEX IF NOT EXISTS idx_shrine_availability_user ON shrine_availability(user_id);

-- ============================================================
-- PAYOUT HISTORY  (audit log for tier changes)
-- ============================================================
CREATE TABLE IF NOT EXISTS payout_history (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  changed_by  UUID        REFERENCES users(id) ON DELETE SET NULL,
  old_tier    INTEGER     NOT NULL,
  new_tier    INTEGER     NOT NULL,
  reason      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payout_history_user ON payout_history(user_id);
CREATE INDEX IF NOT EXISTS idx_payout_history_date ON payout_history(created_at DESC);

-- ============================================================
-- QUOTES  (imported from Nadeko bot export)
-- keyword   = top-level tag from the YAML (e.g. "DOTITOXIC")
-- nadeko_id = original alphanumeric id from Nadeko (unique)
-- author_discord_id stored as text — Discord snowflakes exceed int range
-- ============================================================
CREATE TABLE IF NOT EXISTS quotes (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword           VARCHAR(255) NOT NULL,
  nadeko_id         VARCHAR(20)  UNIQUE,
  author_name       VARCHAR(100),
  author_discord_id VARCHAR(20),
  text              TEXT         NOT NULL,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_quotes_keyword ON quotes(keyword);
-- Migration for existing installs:
-- CREATE TABLE IF NOT EXISTS quotes ( ... );   -- run full block above
-- CREATE INDEX IF NOT EXISTS idx_quotes_keyword ON quotes(keyword);

-- ============================================================
-- FISHING
-- ============================================================
CREATE TABLE IF NOT EXISTS fishing_profile (
  discord_id      TEXT PRIMARY KEY,
  active_rod      TEXT NOT NULL DEFAULT 'rod_starter',
  active_float    TEXT,
  active_bait     TEXT,
  mystical_active INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS fishing_inventory (
  discord_id TEXT    NOT NULL,
  item_id    TEXT    NOT NULL,
  quantity   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (discord_id, item_id)
);

CREATE TABLE IF NOT EXISTS fish_records (
  discord_id  TEXT        NOT NULL,
  fish_name   TEXT        NOT NULL,
  record_kg   REAL        NOT NULL,
  catch_count INTEGER     NOT NULL DEFAULT 0,
  caught_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (discord_id, fish_name)
);

-- ============================================================
-- GRANTS  (run as superuser; replace 'boop' with your app user)
-- ============================================================
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO boop;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO boop;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO boop;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO boop;
