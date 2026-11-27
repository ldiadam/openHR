-- Add realistic structured details to job_openings
ALTER TABLE job_openings ADD COLUMN work_mode TEXT NOT NULL DEFAULT 'onsite';
ALTER TABLE job_openings ADD COLUMN experience_level TEXT DEFAULT 'mid';
ALTER TABLE job_openings ADD COLUMN salary_min REAL DEFAULT 0;
ALTER TABLE job_openings ADD COLUMN salary_max REAL DEFAULT 0;
ALTER TABLE job_openings ADD COLUMN show_salary INTEGER NOT NULL DEFAULT 0;
ALTER TABLE job_openings ADD COLUMN requirements TEXT;
ALTER TABLE job_openings ADD COLUMN closing_date TEXT;
