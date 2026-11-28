-- Phase 1: IP Address Attendance Validation + Client Visits
ALTER TABLE branches ADD COLUMN allowed_ips TEXT;
ALTER TABLE companies ADD COLUMN require_office_ip INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS client_visits (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    employee_id TEXT NOT NULL,
    client_name TEXT NOT NULL,
    company_name TEXT,
    purpose TEXT,
    notes TEXT,
    visit_date TEXT NOT NULL,
    check_in_time TEXT NOT NULL,
    check_out_time TEXT,
    check_in_lat REAL,
    check_in_lng REAL,
    check_out_lat REAL,
    check_out_lng REAL,
    photo_key TEXT,
    checkout_photo_key TEXT,
    status TEXT NOT NULL DEFAULT 'checked_in',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_client_visits_emp_date ON client_visits(employee_id, visit_date);
CREATE INDEX IF NOT EXISTS idx_client_visits_date ON client_visits(visit_date);

-- Phase 2: Multi NPWP, Multi Bank Disbursement, THR Progressif, Tunjangan Cuti
CREATE TABLE IF NOT EXISTS company_tax_entities (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    name TEXT NOT NULL,
    npwp TEXT NOT NULL,
    address TEXT,
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS company_bank_accounts (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    bank_name TEXT NOT NULL,
    account_number TEXT NOT NULL,
    account_holder TEXT NOT NULL,
    branch_name TEXT,
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE branches ADD COLUMN tax_entity_id TEXT;
ALTER TABLE branches ADD COLUMN bank_account_id TEXT;

ALTER TABLE payroll_runs ADD COLUMN tax_entity_id TEXT;
ALTER TABLE payroll_runs ADD COLUMN bank_account_id TEXT;

ALTER TABLE payroll_settings ADD COLUMN thr_progressive_tiers_json TEXT;
ALTER TABLE payroll_settings ADD COLUMN leave_allowance_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE payroll_settings ADD COLUMN leave_allowance_multiplier REAL NOT NULL DEFAULT 1.0;

ALTER TABLE payroll_items ADD COLUMN leave_allowance_amount REAL NOT NULL DEFAULT 0;

-- Phase 3: Android ESS Version / Auto-Update Check Metadata
ALTER TABLE companies ADD COLUMN android_latest_version_code INTEGER NOT NULL DEFAULT 1;
ALTER TABLE companies ADD COLUMN android_latest_version_name TEXT DEFAULT '1.0.0';
ALTER TABLE companies ADD COLUMN android_apk_url TEXT;
ALTER TABLE companies ADD COLUMN android_release_notes TEXT;
