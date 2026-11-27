-- Add interview scheduling columns to candidates
ALTER TABLE candidates ADD COLUMN interview_at TEXT;
ALTER TABLE candidates ADD COLUMN interview_location TEXT;
ALTER TABLE candidates ADD COLUMN interviewer_name TEXT;
ALTER TABLE candidates ADD COLUMN interview_type TEXT DEFAULT 'online';
