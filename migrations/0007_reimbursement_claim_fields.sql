-- Migration: 0007_reimbursement_claim_fields.sql
-- Adds detailed expense fields matching official claim sheet export requirements
ALTER TABLE reimbursements ADD COLUMN expense_date TEXT;
ALTER TABLE reimbursements ADD COLUMN cost_centre TEXT;
ALTER TABLE reimbursements ADD COLUMN project_ref TEXT;
ALTER TABLE reimbursements ADD COLUMN remarks TEXT;
