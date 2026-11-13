-- Migration 0013: record how each payroll exception was resolved
ALTER TABLE payroll_exceptions ADD COLUMN resolution_code TEXT;
ALTER TABLE payroll_exceptions ADD COLUMN resolution_note TEXT;
