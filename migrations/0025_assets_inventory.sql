-- Asset & Inventory Management module
CREATE TABLE IF NOT EXISTS company_assets (
  id TEXT PRIMARY KEY,
  asset_tag TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'laptop',
  serial_number TEXT,
  purchase_date TEXT,
  purchase_cost REAL DEFAULT 0,
  condition TEXT NOT NULL DEFAULT 'good',
  status TEXT NOT NULL DEFAULT 'available',
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS asset_assignments (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES company_assets(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL,
  assigned_by TEXT NOT NULL,
  assigned_at TEXT DEFAULT CURRENT_TIMESTAMP,
  expected_return_at TEXT,
  returned_at TEXT,
  condition_out TEXT DEFAULT 'good',
  condition_in TEXT,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_asset_assignments_emp ON asset_assignments(employee_id, returned_at);
CREATE INDEX IF NOT EXISTS idx_asset_assignments_asset ON asset_assignments(asset_id, returned_at);
