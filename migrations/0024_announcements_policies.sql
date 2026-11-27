-- Announcements & Company Policies module
CREATE TABLE IF NOT EXISTS announcements (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'memo',
  target_scope TEXT NOT NULL DEFAULT 'all',
  target_id TEXT,
  attachment_key TEXT,
  attachment_name TEXT,
  require_ack INTEGER NOT NULL DEFAULT 0,
  pinned INTEGER NOT NULL DEFAULT 0,
  published_by TEXT NOT NULL,
  published_at TEXT DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS announcement_acks (
  id TEXT PRIMARY KEY,
  announcement_id TEXT NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL,
  acknowledged_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(announcement_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_announcement_acks_ann ON announcement_acks(announcement_id);
CREATE INDEX IF NOT EXISTS idx_announcement_acks_emp ON announcement_acks(employee_id);
