-- Migration: 0003_seed_data.sql

-- 1. Company
INSERT OR REPLACE INTO companies (
    id, tenant_id, name, legal_name, npwp, bpjs_kesehatan_code, bpjs_tk_code, address, phone, email
) VALUES (
    'comp-nusantara', 'default',
    'PT Nusantara Digital Kreasi', 'PT Nusantara Digital Kreasi',
    '01.234.567.8-012.000', '00012345', '99887766',
    'Jl. Jend. Sudirman Kav. 52-53, Jakarta Selatan',
    '+62 21 555 1234', 'hr@nusantara.id'
);

-- 2. Branches
INSERT OR REPLACE INTO branches (
    id, tenant_id, company_id, name, address, latitude, longitude, radius_meters, umk_amount, timezone
) VALUES 
('branch-jkt', 'default', 'comp-nusantara', 'Kantor Pusat Jakarta', 'SCBD Lot 28, Jakarta Selatan', -6.2255, 106.8095, 150, 5067381, 'Asia/Jakarta'),
('branch-bdg', 'default', 'comp-nusantara', 'Kantor Operasional Bandung', 'Jl. Asia Afrika No. 100, Bandung', -6.9214, 107.6105, 150, 4209309, 'Asia/Jakarta');

-- 3. Departments
INSERT OR REPLACE INTO departments (id, tenant_id, company_id, name, code) VALUES
('dept-mgmt', 'default', 'comp-nusantara', 'Management', 'MGMT'),
('dept-eng', 'default', 'comp-nusantara', 'Engineering', 'ENG'),
('dept-hr', 'default', 'comp-nusantara', 'Human Resources', 'HR'),
('dept-fin', 'default', 'comp-nusantara', 'Finance & Accounting', 'FIN'),
('dept-ops', 'default', 'comp-nusantara', 'Operations', 'OPS');

-- 4. Leave Types
INSERT OR REPLACE INTO leave_types (id, tenant_id, code, name, default_days, requires_attachment, is_paid) VALUES
('lt-annual', 'default', 'annual', 'Cuti Tahunan', 12, 0, 1),
('lt-sick', 'default', 'sick', 'Cuti Sakit', 14, 1, 1),
('lt-permission', 'default', 'permission', 'Izin', 3, 0, 1),
('lt-unpaid', 'default', 'unpaid', 'Cuti Tidak Berbayar', 0, 0, 0),
('lt-marriage', 'default', 'marriage', 'Cuti Menikah', 3, 0, 1),
('lt-maternity', 'default', 'maternity', 'Cuti Melahirkan', 90, 0, 1);

-- 5. Shift Patterns
INSERT OR REPLACE INTO shift_patterns (id, tenant_id, name, code, start_time, end_time, break_minutes) VALUES
('shift-reg', 'default', 'Jam Kantor Normal', 'normal', '08:30', '17:30', 60),
('shift-pagi', 'default', 'Shift Pagi', 'pagi', '07:00', '15:00', 60),
('shift-siang', 'default', 'Shift Siang', 'siang', '15:00', '23:00', 60),
('shift-malam', 'default', 'Shift Malam', 'malam', '23:00', '07:00', 60);

-- 6. Indonesian National Holidays & Cuti Bersama 2026
INSERT OR REPLACE INTO holidays (id, tenant_id, name, date, type, branch_id, year, is_cuti_bersama_deducts_leave) VALUES
('hol-2026-01', 'default', 'Tahun Baru 2026 Masehi', '2026-01-01', 'national', NULL, 2026, 0),
('hol-2026-02', 'default', 'Isra Mi''raj Nabi Muhammad SAW', '2026-01-16', 'national', NULL, 2026, 0),
('hol-2026-03', 'default', 'Tahun Baru Imlek 2577 Kongzili', '2026-02-17', 'national', NULL, 2026, 0),
('hol-2026-04', 'default', 'Hari Raya Nyepi Tahun Baru Saka 1948', '2026-03-21', 'national', NULL, 2026, 0),
('hol-2026-05', 'default', 'Hari Raya Idul Fitri 1447 H (Hari 1)', '2026-03-20', 'national', NULL, 2026, 0),
('hol-2026-06', 'default', 'Hari Raya Idul Fitri 1447 H (Hari 2)', '2026-03-21', 'national', NULL, 2026, 0),
('hol-2026-07', 'default', 'Cuti Bersama Idul Fitri 1447 H', '2026-03-23', 'cuti_bersama', NULL, 2026, 1),
('hol-2026-08', 'default', 'Wafat Yesus Kristus', '2026-04-03', 'national', NULL, 2026, 0),
('hol-2026-09', 'default', 'Hari Buruh Internasional', '2026-05-01', 'national', NULL, 2026, 0),
('hol-2026-10', 'default', 'Kenaikan Yesus Kristus', '2026-05-14', 'national', NULL, 2026, 0),
('hol-2026-11', 'default', 'Hari Raya Idul Adha 1447 H', '2026-05-27', 'national', NULL, 2026, 0),
('hol-2026-12', 'default', 'Hari Raya Waisak 2570 BE', '2026-05-31', 'national', NULL, 2026, 0),
('hol-2026-13', 'default', 'Hari Lahir Pancasila', '2026-06-01', 'national', NULL, 2026, 0),
('hol-2026-14', 'default', 'Tahun Baru Islam 1448 Hijriah', '2026-06-16', 'national', NULL, 2026, 0),
('hol-2026-15', 'default', 'Hari Kemerdekaan Republik Indonesia ke-81', '2026-08-17', 'national', NULL, 2026, 0),
('hol-2026-16', 'default', 'Maulid Nabi Muhammad SAW', '2026-08-25', 'national', NULL, 2026, 0),
('hol-2026-17', 'default', 'Hari Raya Natal', '2026-12-25', 'national', NULL, 2026, 0),
('hol-2026-18', 'default', 'Cuti Bersama Hari Raya Natal', '2026-12-26', 'cuti_bersama', NULL, 2026, 1);

-- 7. Seed 5 Employees
-- Password for all seed users is: Password123!
-- SHA-256 hash: 785b376b32fed585a9df6f152d0b57112c3fbe567a1098deccbdf8be94f48480

-- Employee 1: Budi Santoso (Owner / Admin HR)
INSERT OR REPLACE INTO employees (
    id, tenant_id, company_id, branch_id, department_id, manager_id,
    nik, full_name, ktp_number, npwp_number, date_of_birth, place_of_birth, gender, religion, marital_status, ptkp_status,
    address, phone, personal_email, company_email,
    employment_status, lifecycle_status, join_date, contract_start_date, contract_end_date, job_title, shift_pattern_id,
    base_salary, fixed_allowances, fixed_allowances_detail, bank_name, bank_account_number, bank_account_holder,
    bpjs_kesehatan_number, bpjs_tk_number, bpjs_wage_basis
) VALUES (
    'emp-001', 'default', 'comp-nusantara', 'branch-jkt', 'dept-mgmt', NULL,
    'EMP001', 'Budi Santoso', '3171010101850001', '09.123.456.7-011.000', '1985-05-15', 'Jakarta', 'male', 'Islam', 'single', 'TK/0',
    'Jl. Tebet Barat No. 12, Jakarta Selatan', '081234567890', 'budi.santoso@personal.id', 'budi.santoso@nusantara.id',
    'PKWTT', 'active', '2024-01-01', '2024-01-01', NULL, 'Chief Executive Officer / HR Admin', 'shift-reg',
    18000000, 2000000, '[{"name":"Tunjangan Jabatan","amount":2000000}]', 'BCA', '1234567890', 'Budi Santoso',
    '00012345678', '99887766554', 20000000
);

INSERT OR REPLACE INTO users (
    id, tenant_id, email, password_hash, role, employee_id, is_active
) VALUES (
    'usr-001', 'default', 'budi.santoso@nusantara.id', '785b376b32fed585a9df6f152d0b57112c3fbe567a1098deccbdf8be94f48480', 'owner_admin', 'emp-001', 1
);

-- Employee 2: Siti Rahmawati (Manager)
INSERT OR REPLACE INTO employees (
    id, tenant_id, company_id, branch_id, department_id, manager_id,
    nik, full_name, ktp_number, npwp_number, date_of_birth, place_of_birth, gender, religion, marital_status, ptkp_status,
    address, phone, personal_email, company_email,
    employment_status, lifecycle_status, join_date, contract_start_date, contract_end_date, job_title, shift_pattern_id,
    base_salary, fixed_allowances, fixed_allowances_detail, bank_name, bank_account_number, bank_account_holder,
    bpjs_kesehatan_number, bpjs_tk_number, bpjs_wage_basis
) VALUES (
    'emp-002', 'default', 'comp-nusantara', 'branch-jkt', 'dept-hr', 'emp-001',
    'EMP002', 'Siti Rahmawati', '3171020202880002', '09.234.567.8-012.000', '1988-08-20', 'Bandung', 'female', 'Islam', 'married', 'K/1',
    'Jl. Kemang Raya No. 45, Jakarta Selatan', '081234567891', 'siti.rahma@personal.id', 'siti.rahma@nusantara.id',
    'PKWTT', 'active', '2024-03-01', '2024-03-01', NULL, 'HR Operations Manager', 'shift-reg',
    12000000, 1500000, '[{"name":"Tunjangan Posisi","amount":1500000}]', 'Mandiri', '1370001234567', 'Siti Rahmawati',
    '00012345679', '99887766555', 13500000
);

INSERT OR REPLACE INTO users (
    id, tenant_id, email, password_hash, role, employee_id, is_active
) VALUES (
    'usr-002', 'default', 'siti.rahma@nusantara.id', '785b376b32fed585a9df6f152d0b57112c3fbe567a1098deccbdf8be94f48480', 'manager', 'emp-002', 1
);

-- Employee 3: Dewi Lestari (Finance)
INSERT OR REPLACE INTO employees (
    id, tenant_id, company_id, branch_id, department_id, manager_id,
    nik, full_name, ktp_number, npwp_number, date_of_birth, place_of_birth, gender, religion, marital_status, ptkp_status,
    address, phone, personal_email, company_email,
    employment_status, lifecycle_status, join_date, contract_start_date, contract_end_date, job_title, shift_pattern_id,
    base_salary, fixed_allowances, fixed_allowances_detail, bank_name, bank_account_number, bank_account_holder,
    bpjs_kesehatan_number, bpjs_tk_number, bpjs_wage_basis
) VALUES (
    'emp-003', 'default', 'comp-nusantara', 'branch-jkt', 'dept-fin', 'emp-001',
    'EMP003', 'Dewi Lestari', '3171030303910003', '09.345.678.9-013.000', '1991-11-10', 'Surabaya', 'female', 'Kristen', 'single', 'TK/1',
    'Jl. Kuningan Barat No. 8, Jakarta Selatan', '081234567892', 'dewi.lestari@personal.id', 'dewi.lestari@nusantara.id',
    'PKWTT', 'active', '2024-06-01', '2024-06-01', NULL, 'Senior Finance Officer', 'shift-reg',
    9000000, 1000000, '[{"name":"Tunjangan Transportasi","amount":1000000}]', 'BCA', '4567890123', 'Dewi Lestari',
    '00012345680', '99887766556', 10000000
);

INSERT OR REPLACE INTO users (
    id, tenant_id, email, password_hash, role, employee_id, is_active
) VALUES (
    'usr-003', 'default', 'dewi.lestari@nusantara.id', '785b376b32fed585a9df6f152d0b57112c3fbe567a1098deccbdf8be94f48480', 'finance', 'emp-003', 1
);

-- Employee 4: Agus Setiawan (Employee - Senior Software Engineer, K/2)
INSERT OR REPLACE INTO employees (
    id, tenant_id, company_id, branch_id, department_id, manager_id,
    nik, full_name, ktp_number, npwp_number, date_of_birth, place_of_birth, gender, religion, marital_status, ptkp_status,
    address, phone, personal_email, company_email,
    employment_status, lifecycle_status, join_date, contract_start_date, contract_end_date, job_title, shift_pattern_id,
    base_salary, fixed_allowances, fixed_allowances_detail, bank_name, bank_account_number, bank_account_holder,
    bpjs_kesehatan_number, bpjs_tk_number, bpjs_wage_basis
) VALUES (
    'emp-004', 'default', 'comp-nusantara', 'branch-jkt', 'dept-eng', 'emp-002',
    'EMP004', 'Agus Setiawan', '3171040404900004', '09.456.789.0-014.000', '1990-03-25', 'Yogyakarta', 'male', 'Islam', 'married', 'K/2',
    'Jl. Pancoran Barat No. 19, Jakarta Selatan', '081234567893', 'agus.setiawan@personal.id', 'agus.setiawan@nusantara.id',
    'PKWTT', 'active', '2024-02-15', '2024-02-15', NULL, 'Lead Software Engineer', 'shift-reg',
    14000000, 1000000, '[{"name":"Tunjangan Komunikasi","amount":1000000}]', 'BCA', '5678901234', 'Agus Setiawan',
    '00012345681', '99887766557', 15000000
);

INSERT OR REPLACE INTO users (
    id, tenant_id, email, password_hash, role, employee_id, is_active
) VALUES (
    'usr-004', 'default', 'agus.setiawan@nusantara.id', '785b376b32fed585a9df6f152d0b57112c3fbe567a1098deccbdf8be94f48480', 'employee', 'emp-004', 1
);

-- Employee 5: Rina Wijaya (Employee - Operations Bandung, TK/0, PKWT with expiry alert test)
INSERT OR REPLACE INTO employees (
    id, tenant_id, company_id, branch_id, department_id, manager_id,
    nik, full_name, ktp_number, npwp_number, date_of_birth, place_of_birth, gender, religion, marital_status, ptkp_status,
    address, phone, personal_email, company_email,
    employment_status, lifecycle_status, join_date, contract_start_date, contract_end_date, job_title, shift_pattern_id,
    base_salary, fixed_allowances, fixed_allowances_detail, bank_name, bank_account_number, bank_account_holder,
    bpjs_kesehatan_number, bpjs_tk_number, bpjs_wage_basis
) VALUES (
    'emp-005', 'default', 'comp-nusantara', 'branch-bdg', 'dept-ops', 'emp-002',
    'EMP005', 'Rina Wijaya', '3273010101960005', '09.567.890.1-015.000', '1996-07-14', 'Bandung', 'female', 'Islam', 'single', 'TK/0',
    'Jl. Dago Atas No. 88, Bandung', '081234567894', 'rina.wijaya@personal.id', 'rina.wijaya@nusantara.id',
    'PKWT', 'active', '2025-12-01', '2025-12-01', '2026-11-30', 'Operations Associate', 'shift-pagi',
    5500000, 500000, '[{"name":"Tunjangan Makan","amount":500000}]', 'Mandiri', '1310009876543', 'Rina Wijaya',
    '00012345682', '99887766558', 6000000
);

INSERT OR REPLACE INTO users (
    id, tenant_id, email, password_hash, role, employee_id, is_active
) VALUES (
    'usr-005', 'default', 'rina.wijaya@nusantara.id', '785b376b32fed585a9df6f152d0b57112c3fbe567a1098deccbdf8be94f48480', 'employee', 'emp-005', 1
);

-- Seed Leave Balances for all 5 employees
INSERT OR REPLACE INTO leave_balances (id, tenant_id, employee_id, leave_type_id, year, total_entitled, used_days, remaining_days)
SELECT 'bal-' || e.id || '-annual', 'default', e.id, 'lt-annual', 2026, 12, 0, 12
FROM employees e;

INSERT OR REPLACE INTO leave_balances (id, tenant_id, employee_id, leave_type_id, year, total_entitled, used_days, remaining_days)
SELECT 'bal-' || e.id || '-sick', 'default', e.id, 'lt-sick', 2026, 14, 0, 14
FROM employees e;
