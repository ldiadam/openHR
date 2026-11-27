-- Add offer letter R2 key and agreement number to candidates
ALTER TABLE candidates ADD COLUMN offer_letter_key TEXT;
ALTER TABLE candidates ADD COLUMN offer_letter_name TEXT;
ALTER TABLE candidates ADD COLUMN offer_agreement_no TEXT;
