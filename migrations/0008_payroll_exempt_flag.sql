-- Migration 0008: Exclude an employee from payroll without marking them resigned
ALTER TABLE employees ADD COLUMN exclude_from_payroll INTEGER NOT NULL DEFAULT 0;
