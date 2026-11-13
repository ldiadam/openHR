-- Migration 0015: per-day attendance exceptions and automatic alpha (no-show) deductions
-- One payroll exception row per missing working day, and an alpha day counter on payroll items.
ALTER TABLE payroll_exceptions ADD COLUMN exception_date TEXT;
ALTER TABLE payroll_items ADD COLUMN alpha_days INTEGER NOT NULL DEFAULT 0;
ALTER TABLE payroll_items ADD COLUMN alpha_deduction REAL NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_payroll_exceptions_date
  ON payroll_exceptions(payroll_run_id, employee_id, exception_date);
