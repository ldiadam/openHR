-- Migration: 0012_reimbursement_payroll_link.sql
-- Tracks which payroll run included an approved reimbursement
ALTER TABLE reimbursements ADD COLUMN payroll_run_id TEXT;
CREATE INDEX IF NOT EXISTS idx_reimbursements_payroll_run ON reimbursements(payroll_run_id);
