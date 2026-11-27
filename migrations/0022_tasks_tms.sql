-- Task Management System (TMS) module tables
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  reference_no TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'adhoc',
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'open',
  assignor_id TEXT NOT NULL,
  assignee_id TEXT NOT NULL,
  watchers_json TEXT DEFAULT '[]',
  reference_meta_json TEXT DEFAULT '{}',
  due_at TEXT NOT NULL,
  reminder_minutes INTEGER DEFAULT 30,
  alert1_minutes INTEGER DEFAULT 30,
  alert2_minutes INTEGER DEFAULT 45,
  warning_minutes INTEGER DEFAULT 60,
  remarks TEXT,
  completed_at TEXT,
  completed_by TEXT,
  completion_remarks TEXT,
  approved_at TEXT,
  approved_by TEXT,
  approval_remarks TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tasks_assignee_status ON tasks(assignee_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_assignor_status ON tasks(assignor_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_at ON tasks(due_at);

CREATE TABLE IF NOT EXISTS task_activities (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  action_type TEXT NOT NULL,
  status_after TEXT,
  note TEXT,
  meta_json TEXT DEFAULT '{}',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_task_activities_task_id ON task_activities(task_id, created_at);

CREATE TABLE IF NOT EXISTS task_attachments (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  activity_id TEXT,
  uploaded_by TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  file_size INTEGER,
  file_key TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_task_attachments_task_id ON task_attachments(task_id);
