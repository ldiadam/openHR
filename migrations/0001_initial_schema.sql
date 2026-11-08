-- Migration: 0001_initial_schema.sql
-- All tables contain tenant_id for multi-tenant readiness

CREATE TABLE IF NOT EXISTS companies (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    name TEXT NOT NULL,
    legal_name TEXT,
    npwp TEXT,
    bpjs_kesehatan_code TEXT,
    bpjs_tk_code TEXT,
    address TEXT,
    phone TEXT,
    email TEXT,
    logo_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS branches (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    company_id TEXT NOT NULL,
    name TEXT NOT NULL,
    address TEXT,
    latitude REAL NOT NULL DEFAULT -6.2088,
    longitude REAL NOT NULL DEFAULT 106.8456,
    radius_meters INTEGER NOT NULL DEFAULT 100,
    umk_amount REAL NOT NULL DEFAULT 5067381,
    timezone TEXT NOT NULL DEFAULT 'Asia/Jakarta',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS departments (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    company_id TEXT NOT NULL,
    name TEXT NOT NULL,
    code TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('owner_admin', 'manager', 'finance', 'employee')),
    employee_id TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    last_login_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS password_resets (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    user_id TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    used_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS invitations (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    employee_id TEXT NOT NULL,
    email TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'expired')),
    purelymail_created INTEGER NOT NULL DEFAULT 0,
    purelymail_notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS employees (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    company_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    department_id TEXT NOT NULL,
    manager_id TEXT,
    
    -- Identity
    nik TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    ktp_number TEXT NOT NULL,
    npwp_number TEXT,
    date_of_birth TEXT NOT NULL,
    place_of_birth TEXT NOT NULL,
    gender TEXT NOT NULL CHECK(gender IN ('male', 'female')),
    religion TEXT NOT NULL,
    marital_status TEXT NOT NULL CHECK(marital_status IN ('single', 'married', 'widowed', 'divorced')),
    ptkp_status TEXT NOT NULL CHECK(ptkp_status IN ('TK/0', 'TK/1', 'TK/2', 'TK/3', 'K/0', 'K/1', 'K/2', 'K/3')),
    address TEXT NOT NULL,
    phone TEXT NOT NULL,
    personal_email TEXT NOT NULL,
    company_email TEXT,
    
    -- Employment
    employment_status TEXT NOT NULL CHECK(employment_status IN ('PKWTT', 'PKWT', 'probation', 'intern')),
    lifecycle_status TEXT NOT NULL DEFAULT 'active' CHECK(lifecycle_status IN ('probation', 'active', 'on_leave', 'resigned', 'terminated')),
    join_date TEXT NOT NULL,
    contract_start_date TEXT,
    contract_end_date TEXT,
    resignation_date TEXT,
    last_working_date TEXT,
    job_title TEXT NOT NULL,
    shift_pattern_id TEXT,
    
    -- Payroll
    base_salary REAL NOT NULL DEFAULT 0,
    fixed_allowances REAL NOT NULL DEFAULT 0,
    fixed_allowances_detail TEXT DEFAULT '[]', -- JSON string of [{name, amount}]
    bank_name TEXT NOT NULL DEFAULT 'BCA',
    bank_account_number TEXT NOT NULL DEFAULT '',
    bank_account_holder TEXT NOT NULL DEFAULT '',
    bpjs_kesehatan_number TEXT,
    bpjs_tk_number TEXT,
    bpjs_wage_basis REAL, -- if different from salary
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (company_id) REFERENCES companies(id),
    FOREIGN KEY (branch_id) REFERENCES branches(id),
    FOREIGN KEY (department_id) REFERENCES departments(id)
);

CREATE TABLE IF NOT EXISTS employee_documents (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    employee_id TEXT NOT NULL,
    document_type TEXT NOT NULL CHECK(document_type IN ('ktp', 'npwp', 'kk', 'contract', 'certificate', 'other')),
    file_name TEXT NOT NULL,
    file_key TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    mime_type TEXT NOT NULL,
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS holidays (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    name TEXT NOT NULL,
    date TEXT NOT NULL, -- YYYY-MM-DD
    type TEXT NOT NULL CHECK(type IN ('national', 'cuti_bersama', 'company')),
    branch_id TEXT, -- NULL for all branches
    year INTEGER NOT NULL,
    is_cuti_bersama_deducts_leave INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS shift_patterns (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    name TEXT NOT NULL,
    code TEXT NOT NULL, -- pagi, siang, malam, normal
    start_time TEXT NOT NULL, -- HH:MM
    end_time TEXT NOT NULL, -- HH:MM
    break_minutes INTEGER NOT NULL DEFAULT 60,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS employee_rosters (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    employee_id TEXT NOT NULL,
    date TEXT NOT NULL, -- YYYY-MM-DD
    shift_pattern_id TEXT,
    is_off INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    FOREIGN KEY (shift_pattern_id) REFERENCES shift_patterns(id)
);

CREATE TABLE IF NOT EXISTS attendance (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    employee_id TEXT NOT NULL,
    date TEXT NOT NULL, -- YYYY-MM-DD
    clock_in_time TEXT, -- ISO or HH:MM:SS
    clock_out_time TEXT,
    clock_in_lat REAL,
    clock_in_lng REAL,
    clock_in_photo_key TEXT,
    clock_in_distance_meters REAL,
    clock_in_status TEXT DEFAULT 'in_geofence',
    clock_out_lat REAL,
    clock_out_lng REAL,
    clock_out_photo_key TEXT,
    clock_out_distance_meters REAL,
    clock_out_status TEXT DEFAULT 'in_geofence',
    status TEXT NOT NULL CHECK(status IN ('present', 'late', 'early_leave', 'absent', 'on_leave', 'sick', 'holiday', 'day_off')),
    late_minutes INTEGER NOT NULL DEFAULT 0,
    early_minutes INTEGER NOT NULL DEFAULT 0,
    actual_work_minutes INTEGER NOT NULL DEFAULT 0,
    is_offline_sync INTEGER NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'mobile' CHECK(source IN ('mobile', 'fingerprint', 'manual')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS attendance_corrections (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    attendance_id TEXT,
    employee_id TEXT NOT NULL,
    correction_date TEXT NOT NULL,
    requested_clock_in TEXT,
    requested_clock_out TEXT,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
    reviewed_by TEXT,
    reviewed_at DATETIME,
    reviewer_note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS leave_types (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    default_days INTEGER NOT NULL DEFAULT 12,
    requires_attachment INTEGER NOT NULL DEFAULT 0,
    is_paid INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS leave_balances (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    employee_id TEXT NOT NULL,
    leave_type_id TEXT NOT NULL,
    year INTEGER NOT NULL,
    total_entitled REAL NOT NULL DEFAULT 12,
    used_days REAL NOT NULL DEFAULT 0,
    remaining_days REAL NOT NULL DEFAULT 12,
    adjusted_days REAL NOT NULL DEFAULT 0,
    adjustment_reason TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    FOREIGN KEY (leave_type_id) REFERENCES leave_types(id)
);

CREATE TABLE IF NOT EXISTS leave_requests (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    employee_id TEXT NOT NULL,
    leave_type_id TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    total_days REAL NOT NULL,
    reason TEXT NOT NULL,
    attachment_key TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
    approved_by TEXT,
    approved_at DATETIME,
    rejection_note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    FOREIGN KEY (leave_type_id) REFERENCES leave_types(id)
);

CREATE TABLE IF NOT EXISTS overtime_requests (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    employee_id TEXT NOT NULL,
    date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    planned_hours REAL NOT NULL,
    actual_hours REAL NOT NULL,
    reason TEXT NOT NULL,
    is_holiday_or_rest_day INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
    approved_by TEXT,
    approved_at DATETIME,
    rejection_note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS kasbon (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    employee_id TEXT NOT NULL,
    amount REAL NOT NULL,
    reason TEXT NOT NULL,
    total_instalments INTEGER NOT NULL DEFAULT 1,
    remaining_amount REAL NOT NULL,
    instalment_amount REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'paid_off')),
    approved_by TEXT,
    approved_at DATETIME,
    rejection_note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS kasbon_instalments (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    kasbon_id TEXT NOT NULL,
    payroll_run_id TEXT,
    instalment_no INTEGER NOT NULL,
    amount REAL NOT NULL,
    deducted_at DATETIME,
    FOREIGN KEY (kasbon_id) REFERENCES kasbon(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reimbursements (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    employee_id TEXT NOT NULL,
    category TEXT NOT NULL,
    amount REAL NOT NULL,
    description TEXT NOT NULL,
    receipt_photo_key TEXT,
    payment_method TEXT NOT NULL DEFAULT 'payroll' CHECK(payment_method IN ('payroll', 'separate')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'paid')),
    approved_by TEXT,
    approved_at DATETIME,
    rejection_note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS payroll_runs (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    period_start TEXT NOT NULL,
    period_end TEXT NOT NULL,
    payment_date TEXT NOT NULL,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'inputs_pulled', 'calculating', 'calculated', 'locked', 'paid')),
    total_gross REAL NOT NULL DEFAULT 0,
    total_deductions REAL NOT NULL DEFAULT 0,
    total_take_home REAL NOT NULL DEFAULT 0,
    total_employer_cost REAL NOT NULL DEFAULT 0,
    employee_count INTEGER NOT NULL DEFAULT 0,
    locked_by TEXT,
    locked_at DATETIME,
    paid_by TEXT,
    paid_at DATETIME,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payroll_items (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    payroll_run_id TEXT NOT NULL,
    employee_id TEXT NOT NULL,
    
    -- Snapshot fields for immutable payslip record
    employee_nik TEXT NOT NULL,
    employee_name TEXT NOT NULL,
    job_title TEXT NOT NULL,
    department_name TEXT NOT NULL,
    ptkp_status TEXT NOT NULL,
    bank_name TEXT NOT NULL,
    bank_account_number TEXT NOT NULL,
    
    -- Fixed earnings
    base_salary REAL NOT NULL DEFAULT 0,
    fixed_allowance REAL NOT NULL DEFAULT 0,
    prorated_salary REAL NOT NULL DEFAULT 0,
    days_worked INTEGER NOT NULL DEFAULT 0,
    expected_working_days INTEGER NOT NULL DEFAULT 0,
    
    -- Variable earnings
    overtime_hours REAL NOT NULL DEFAULT 0,
    overtime_pay REAL NOT NULL DEFAULT 0,
    attendance_bonus REAL NOT NULL DEFAULT 0,
    commission_bonus REAL NOT NULL DEFAULT 0,
    reimbursement_amount REAL NOT NULL DEFAULT 0,
    gross_earnings REAL NOT NULL DEFAULT 0,
    
    -- Deductions
    late_deduction REAL NOT NULL DEFAULT 0,
    unpaid_leave_deduction REAL NOT NULL DEFAULT 0,
    kasbon_deduction REAL NOT NULL DEFAULT 0,
    other_deductions REAL NOT NULL DEFAULT 0,
    other_deductions_reason TEXT,
    
    -- Statutory employee share
    bpjs_kes_employee REAL NOT NULL DEFAULT 0,
    bpjs_jht_employee REAL NOT NULL DEFAULT 0,
    bpjs_jp_employee REAL NOT NULL DEFAULT 0,
    pph21_amount REAL NOT NULL DEFAULT 0,
    pph21_method TEXT NOT NULL DEFAULT 'TER',
    
    total_deductions REAL NOT NULL DEFAULT 0,
    take_home_pay REAL NOT NULL DEFAULT 0,
    
    -- Employer cost (shown on slip for transparency, not deducted)
    bpjs_kes_employer REAL NOT NULL DEFAULT 0,
    bpjs_jht_employer REAL NOT NULL DEFAULT 0,
    bpjs_jp_employer REAL NOT NULL DEFAULT 0,
    bpjs_jkk_employer REAL NOT NULL DEFAULT 0,
    bpjs_jkm_employer REAL NOT NULL DEFAULT 0,
    total_employer_cost REAL NOT NULL DEFAULT 0,
    
    payslip_pdf_key TEXT,
    is_locked INTEGER NOT NULL DEFAULT 0,
    
    FOREIGN KEY (payroll_run_id) REFERENCES payroll_runs(id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id) REFERENCES employees(id)
);

CREATE TABLE IF NOT EXISTS payroll_exceptions (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    payroll_run_id TEXT NOT NULL,
    employee_id TEXT NOT NULL,
    exception_type TEXT NOT NULL CHECK(exception_type IN ('missing_attendance', 'unapproved_overtime', 'new_joiner', 'resignation', 'salary_change', 'below_umk')),
    severity TEXT NOT NULL DEFAULT 'warning' CHECK(severity IN ('warning', 'blocker')),
    description TEXT NOT NULL,
    resolved INTEGER NOT NULL DEFAULT 0,
    resolved_by TEXT,
    resolved_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (payroll_run_id) REFERENCES payroll_runs(id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id) REFERENCES employees(id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    user_id TEXT,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    old_values TEXT, -- JSON
    new_values TEXT, -- JSON
    ip_address TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notifications_outbox (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    to_email TEXT NOT NULL,
    subject TEXT NOT NULL,
    body_text TEXT NOT NULL,
    body_html TEXT NOT NULL,
    notification_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'sent', 'failed')),
    error_message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    sent_at DATETIME
);

-- Indices for performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_employees_nik ON employees(nik);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);
CREATE INDEX IF NOT EXISTS idx_attendance_emp_date ON attendance(employee_id, date);
CREATE INDEX IF NOT EXISTS idx_leave_emp ON leave_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_payroll_run ON payroll_items(payroll_run_id);
