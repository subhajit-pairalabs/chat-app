-- Run once against your PostgreSQL database
-- psql -U postgres -d chatdb -f migrations/001_init.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Users ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Groups ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS groups (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  -- created_by may be NULL if creator account was deleted (ON DELETE SET NULL requires nullable col)
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Group members ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS group_members (
  group_id   UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (group_id, user_id)
);

-- ── Messages ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id           UUID PRIMARY KEY,
  sender_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id  UUID REFERENCES users(id) ON DELETE CASCADE,    -- NULL for group msgs
  group_id     UUID REFERENCES groups(id) ON DELETE CASCADE,   -- NULL for private msgs
  content      TEXT NOT NULL,
  type         TEXT NOT NULL CHECK (type IN ('private', 'group')),
  status       TEXT NOT NULL DEFAULT 'sent'
               CHECK (status IN ('sent', 'delivered', 'read')),
  deleted_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_messages_private
  ON messages (sender_id, receiver_id, created_at)
  WHERE type = 'private';

CREATE INDEX IF NOT EXISTS idx_messages_group
  ON messages (group_id, created_at)
  WHERE type = 'group';

CREATE INDEX IF NOT EXISTS idx_messages_undelivered
  ON messages (receiver_id, status, created_at)
  WHERE status = 'sent';

-- Index for group member lookups by user (for offline sync and conversation listing)
CREATE INDEX IF NOT EXISTS idx_group_members_user_id
  ON group_members (user_id);

-- Index for username search
CREATE INDEX IF NOT EXISTS idx_users_username_lower
  ON users (LOWER(username));
