-- Employee Level Builder (customizable hierarchy, approvals, TMS authority, and bypass flags)
CREATE TABLE IF NOT EXISTS employee_levels (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  rank INTEGER NOT NULL DEFAULT 10,
  color TEXT NOT NULL DEFAULT '#2563EB',
  description TEXT,
  capabilities_json TEXT NOT NULL DEFAULT '{}',
  bypass_json TEXT NOT NULL DEFAULT '{}',
  is_default INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_employee_levels_tenant_rank
  ON employee_levels(tenant_id, rank ASC);

ALTER TABLE employees ADD COLUMN level_id TEXT REFERENCES employee_levels(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_employees_level_id
  ON employees(level_id);
