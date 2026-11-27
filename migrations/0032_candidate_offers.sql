-- Add job offer details columns to candidates
ALTER TABLE candidates ADD COLUMN offer_start_date TEXT;
ALTER TABLE candidates ADD COLUMN offer_expires_at TEXT;
ALTER TABLE candidates ADD COLUMN offer_notes TEXT;
