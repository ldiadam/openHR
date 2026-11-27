CREATE TABLE IF NOT EXISTS refresh_sessions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  device_label TEXT,
  expires_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_refresh_sessions_user ON refresh_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_sessions_hash ON refresh_sessions(token_hash);
