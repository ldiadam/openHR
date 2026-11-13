-- Migration 0009: Extended bank details for payroll transfers
ALTER TABLE employees ADD COLUMN bank_swift_code TEXT;
ALTER TABLE employees ADD COLUMN bank_branch_name TEXT;
ALTER TABLE employees ADD COLUMN bank_branch_code TEXT;
ALTER TABLE employees ADD COLUMN bank_branch_address TEXT;
