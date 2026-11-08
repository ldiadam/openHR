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

-- 7. Seed Single Admin Account Only (Fresh Database)
-- Password for admin: Password123!
-- SHA-256 hash: a109e36947ad56de1dca1cc49f0ef8ac9ad9a7b1aa0df41fb3c4cb73c1ff01ea

INSERT OR REPLACE INTO employees (
    id, tenant_id, company_id, branch_id, department_id, manager_id,
    nik, full_name, ktp_number, npwp_number, date_of_birth, place_of_birth, gender, religion, marital_status, ptkp_status,
    address, phone, personal_email, company_email,
    employment_status, lifecycle_status, join_date, contract_start_date, contract_end_date, job_title, shift_pattern_id,
    base_salary, fixed_allowances, fixed_allowances_detail, bank_name, bank_account_number, bank_account_holder,
    bpjs_kesehatan_number, bpjs_tk_number, bpjs_wage_basis
) VALUES (
    'emp-001', 'default', 'comp-nusantara', 'branch-jkt', 'dept-mgmt', NULL,
    'ADM001', 'Administrator', '3171010101850001', '09.123.456.7-011.000', '1985-05-15', 'Jakarta', 'male', 'Islam', 'single', 'TK/0',
    'Jl. Jend. Sudirman Kav. 52-53, Jakarta Selatan', '081200000000', 'admin@openhr.id', 'admin@openhr.id',
    'PKWTT', 'active', '2024-01-01', '2024-01-01', NULL, 'System Administrator / HR Admin', 'shift-reg',
    18000000, 2000000, '[{"name":"Tunjangan Jabatan","amount":2000000}]', 'BCA', '1234567890', 'Administrator',
    '00012345678', '99887766554', 20000000
);

INSERT OR REPLACE INTO users (
    id, tenant_id, email, password_hash, role, employee_id, is_active
) VALUES 
('usr-admin-1', 'default', 'admin@openhr.id', 'a109e36947ad56de1dca1cc49f0ef8ac9ad9a7b1aa0df41fb3c4cb73c1ff01ea', 'owner_admin', 'emp-001', 1),
('usr-admin-2', 'default', 'admin@nusantara.id', 'a109e36947ad56de1dca1cc49f0ef8ac9ad9a7b1aa0df41fb3c4cb73c1ff01ea', 'owner_admin', 'emp-001', 1),
('usr-001', 'default', 'budi.santoso@nusantara.id', 'a109e36947ad56de1dca1cc49f0ef8ac9ad9a7b1aa0df41fb3c4cb73c1ff01ea', 'owner_admin', 'emp-001', 1);

-- Seed Leave Balances for Admin
INSERT OR REPLACE INTO leave_balances (id, tenant_id, employee_id, leave_type_id, year, total_entitled, used_days, remaining_days)
VALUES 
('bal-emp-001-annual', 'default', 'emp-001', 'lt-annual', 2026, 12, 0, 12),
('bal-emp-001-sick', 'default', 'emp-001', 'lt-sick', 2026, 14, 0, 14);
