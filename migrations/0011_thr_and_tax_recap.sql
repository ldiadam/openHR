-- Migration 0011: THR run support and annual tax recap support
ALTER TABLE payroll_runs ADD COLUMN run_type TEXT NOT NULL DEFAULT 'monthly';
ALTER TABLE payroll_items ADD COLUMN thr_amount REAL NOT NULL DEFAULT 0;
