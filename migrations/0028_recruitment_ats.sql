-- Recruitment / ATS & Onboarding module
CREATE TABLE IF NOT EXISTS job_openings (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  department_id TEXT,
  branch_id TEXT,
  employment_type TEXT NOT NULL DEFAULT 'PKWTT',
  headcount INTEGER NOT NULL DEFAULT 1,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_by TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS candidates (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES job_openings(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  stage TEXT NOT NULL DEFAULT 'applied',
  resume_key TEXT,
  resume_name TEXT,
  interview_notes TEXT,
  rating INTEGER DEFAULT 0,
  offered_salary REAL DEFAULT 0,
  hired_employee_id TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS onboarding_tasks (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  title TEXT NOT NULL,
  owner_role TEXT DEFAULT 'HR',
  is_completed INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_candidates_job_stage ON candidates(job_id, stage);
CREATE INDEX IF NOT EXISTS idx_onboarding_emp ON onboarding_tasks(employee_id);
