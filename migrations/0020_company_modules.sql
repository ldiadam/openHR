-- Add per-company modular feature toggles configuration
ALTER TABLE companies ADD COLUMN modules_json TEXT;
