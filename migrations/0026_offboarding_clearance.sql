-- Offboarding & Clearance module
CREATE TABLE IF NOT EXISTS offboarding_cases (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  initiated_by TEXT NOT NULL,
  resignation_date TEXT NOT NULL,
  last_working_day TEXT NOT NULL,
  reason TEXT,
  exit_interview_notes TEXT,
  status TEXT NOT NULL DEFAULT 'initiated',
  final_settlement_notes TEXT,
  completed_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS offboarding_checklist_items (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES offboarding_cases(id) ON DELETE CASCADE,
  department_label TEXT NOT NULL,
  title TEXT NOT NULL,
  owner_employee_id TEXT,
  is_completed INTEGER NOT NULL DEFAULT 0,
  completed_by TEXT,
  completed_at TEXT,
  remarks TEXT
);

CREATE INDEX IF NOT EXISTS idx_offboarding_emp ON offboarding_cases(employee_id, status);
CREATE INDEX IF NOT EXISTS idx_offboarding_items_case ON offboarding_checklist_items(case_id);
