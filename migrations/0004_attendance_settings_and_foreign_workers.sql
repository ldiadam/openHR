-- Migration: 0004_attendance_settings_and_foreign_workers.sql

-- 1. Foreign worker fields for employees (WNA / TKA)
ALTER TABLE employees ADD COLUMN is_foreign_worker INTEGER NOT NULL DEFAULT 0;
ALTER TABLE employees ADD COLUMN nationality TEXT DEFAULT 'Indonesia';
ALTER TABLE employees ADD COLUMN passport_number TEXT;
ALTER TABLE employees ADD COLUMN passport_expiry_date TEXT;
ALTER TABLE employees ADD COLUMN kitas_kitap_number TEXT;
ALTER TABLE employees ADD COLUMN tax_id_type TEXT DEFAULT 'NPWP';

-- 2. Attendance configuration options in payroll_settings
ALTER TABLE payroll_settings ADD COLUMN attendance_require_selfie INTEGER NOT NULL DEFAULT 0;
ALTER TABLE payroll_settings ADD COLUMN attendance_require_location INTEGER NOT NULL DEFAULT 1;
