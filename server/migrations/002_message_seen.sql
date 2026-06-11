-- Migration 002: per-user seen status for group messages
-- Run: psql -U postgres -d chatdb -f migrations/002_message_seen.sql

-- Track which users have seen each group message (WhatsApp-style double-tick for groups)
CREATE TABLE IF NOT EXISTS message_seen (
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (message_id, user_id)
);

-- Fast lookup: "which messages has this user seen?"
CREATE INDEX IF NOT EXISTS idx_message_seen_user
  ON message_seen (user_id);

-- Fast lookup: "who has seen this message?"
CREATE INDEX IF NOT EXISTS idx_message_seen_message
  ON message_seen (message_id);
