-- Performance Management (KPI / OKR & Appraisals) module
CREATE TABLE IF NOT EXISTS review_cycles (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  cycle_type TEXT NOT NULL DEFAULT 'annual',
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_by TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS performance_goals (
  id TEXT PRIMARY KEY,
  cycle_id TEXT NOT NULL REFERENCES review_cycles(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL,
  title TEXT NOT NULL,
  metric TEXT,
  weight REAL DEFAULT 0,
  target_value TEXT,
  actual_value TEXT,
  status TEXT NOT NULL DEFAULT 'on_track',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS performance_reviews (
  id TEXT PRIMARY KEY,
  cycle_id TEXT NOT NULL REFERENCES review_cycles(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL,
  reviewer_id TEXT,
  self_rating REAL,
  self_comments TEXT,
  manager_rating REAL,
  manager_comments TEXT,
  final_rating REAL,
  status TEXT NOT NULL DEFAULT 'pending_self',
  submitted_at TEXT,
  completed_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(cycle_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_perf_goals_cycle_emp ON performance_goals(cycle_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_perf_reviews_cycle_emp ON performance_reviews(cycle_id, employee_id);
