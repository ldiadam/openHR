-- Add application tracking code for passwordless candidate status lookup
ALTER TABLE candidates ADD COLUMN tracking_code TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_candidates_tracking_code ON candidates(tracking_code);
