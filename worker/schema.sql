CREATE TABLE IF NOT EXISTS airports (
  id         TEXT PRIMARY KEY,
  data       TEXT NOT NULL,                     -- Airport JSON
  status     TEXT NOT NULL DEFAULT 'published', -- published | pending
  source     TEXT NOT NULL DEFAULT 'manual',    -- manual | crawl | submit
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_airports_status ON airports(status);

CREATE TABLE IF NOT EXISTS stats (
  airport_id TEXT PRIMARY KEY,
  views      INTEGER NOT NULL DEFAULT 0,
  clicks     INTEGER NOT NULL DEFAULT 0
);

-- 同一 IP 哈希、同一天、同一类型只计一次，防刷
CREATE TABLE IF NOT EXISTS events (
  airport_id TEXT NOT NULL,
  kind       TEXT NOT NULL,
  ip_hash    TEXT NOT NULL,
  day        TEXT NOT NULL,
  PRIMARY KEY (airport_id, kind, ip_hash, day)
);

CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT NOT NULL,
  day TEXT NOT NULL,
  n   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (key, day)
);

CREATE TABLE IF NOT EXISTS comments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  airport_id TEXT NOT NULL,
  nickname   TEXT NOT NULL,
  content    TEXT NOT NULL,
  rating     INTEGER NOT NULL DEFAULT 0,
  status     TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  ip_hash    TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comments_airport ON comments(airport_id, status);

-- 表情回应：每个 IP 哈希对每个机场只有一个表情，再次点击同一个即取消
CREATE TABLE IF NOT EXISTS reactions (
  airport_id TEXT NOT NULL,
  ip_hash    TEXT NOT NULL,
  emoji      TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (airport_id, ip_hash)
);
CREATE INDEX IF NOT EXISTS idx_reactions_airport ON reactions(airport_id, emoji);
