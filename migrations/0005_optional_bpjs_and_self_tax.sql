-- Migration 0005: Optional BPJS TK / BPJS Kes and Self-Tax (Pajak Mandiri)
ALTER TABLE employees ADD COLUMN has_bpjs_tk INTEGER NOT NULL DEFAULT 1;
ALTER TABLE employees ADD COLUMN has_bpjs_kes INTEGER NOT NULL DEFAULT 1;
ALTER TABLE employees ADD COLUMN pays_own_tax INTEGER NOT NULL DEFAULT 0;
ALTER TABLE employees ADD COLUMN tax_scheme TEXT NOT NULL DEFAULT 'company_withheld';
