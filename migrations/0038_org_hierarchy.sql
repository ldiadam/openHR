-- Organization hierarchy modes: single_manager, department_head, multi_tier
ALTER TABLE companies ADD COLUMN hierarchy_mode TEXT NOT NULL DEFAULT 'department_head';
ALTER TABLE companies ADD COLUMN primary_manager_id TEXT REFERENCES employees(id) ON DELETE SET NULL;
ALTER TABLE departments ADD COLUMN manager_id TEXT REFERENCES employees(id) ON DELETE SET NULL;
