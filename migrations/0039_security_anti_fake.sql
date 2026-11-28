-- Anti-fake GPS, device binding, and security audit trail
ALTER TABLE companies ADD COLUMN anti_fake_gps_mode TEXT NOT NULL DEFAULT 'block';
ALTER TABLE companies ADD COLUMN block_rooted_devices INTEGER NOT NULL DEFAULT 0;
ALTER TABLE companies ADD COLUMN enforce_device_binding INTEGER NOT NULL DEFAULT 0;
ALTER TABLE companies ADD COLUMN max_travel_speed_kmh INTEGER NOT NULL DEFAULT 250;

ALTER TABLE employees ADD COLUMN bound_device_id TEXT;
ALTER TABLE employees ADD COLUMN bound_device_label TEXT;
ALTER TABLE employees ADD COLUMN bound_device_at TEXT;

ALTER TABLE attendance ADD COLUMN security_flags_json TEXT;
ALTER TABLE attendance ADD COLUMN device_id TEXT;

CREATE TABLE IF NOT EXISTS security_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  employee_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'high',
  action_taken TEXT NOT NULL DEFAULT 'flagged',
  device_id TEXT,
  device_label TEXT,
  ip_address TEXT,
  latitude REAL,
  longitude REAL,
  details_json TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_security_events_created
  ON security_events(tenant_id, created_at DESC);
