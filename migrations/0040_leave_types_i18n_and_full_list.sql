-- Bilingual (ID + EN) leave types + full standard Indonesian/HR leave catalog
-- Note: SQLite ALTER TABLE ADD COLUMN does not support IF NOT EXISTS; safe for clean sequential migration.

ALTER TABLE leave_types ADD COLUMN name_en TEXT;
ALTER TABLE leave_types ADD COLUMN name_id TEXT;
ALTER TABLE leave_types ADD COLUMN description TEXT;
ALTER TABLE leave_types ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;
ALTER TABLE leave_types ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 100;

-- Backfill existing seeded leave types with bilingual names & ordering
UPDATE leave_types SET name_id = 'Cuti Tahunan', name_en = 'Annual Leave', sort_order = 10, description = 'Hak cuti tahunan reguler (12 hari/tahun sesuai UU Ketenagakerjaan)' WHERE code = 'annual';
UPDATE leave_types SET name_id = 'Cuti Sakit', name_en = 'Sick Leave', sort_order = 20, description = 'Cuti karena sakit (lampirkan surat dokter)' WHERE code = 'sick';
UPDATE leave_types SET name_id = 'Izin Pribadi / Mendesak', name_en = 'Personal / Urgent Leave', sort_order = 30, description = 'Izin keperluan pribadi atau mendesak' WHERE code = 'permission';
UPDATE leave_types SET name_id = 'Cuti Tidak Berbayar', name_en = 'Unpaid Leave', sort_order = 40, description = 'Cuti di luar tanggungan perusahaan (potong gaji proporsional)' WHERE code = 'unpaid';
UPDATE leave_types SET name_id = 'Cuti Menikah', name_en = 'Marriage Leave', sort_order = 50, description = 'Cuti menikah karyawan (3 hari dibayar)' WHERE code = 'marriage';
UPDATE leave_types SET name_id = 'Cuti Melahirkan', name_en = 'Maternity Leave', sort_order = 60, description = 'Cuti melahirkan karyawan perempuan (3 bulan / 90 hari dibayar)' WHERE code = 'maternity';

-- Ensure any custom rows already in leave_types have non-null bilingual fallbacks
UPDATE leave_types SET name_id = COALESCE(name_id, name), name_en = COALESCE(name_en, name) WHERE name_id IS NULL OR name_en IS NULL;

-- Seed full standard HR & Indonesian statutory leave types (without overwriting existing customizations)
INSERT OR IGNORE INTO leave_types (id, tenant_id, code, name, name_id, name_en, description, default_days, requires_attachment, is_paid, is_active, sort_order) VALUES
('lt-annual', 'default', 'annual', 'Cuti Tahunan', 'Cuti Tahunan', 'Annual Leave', 'Hak cuti tahunan reguler (12 hari/tahun)', 12, 0, 1, 1, 10),
('lt-sick', 'default', 'sick', 'Cuti Sakit', 'Cuti Sakit', 'Sick Leave', 'Cuti karena sakit (lampirkan surat keterangan dokter)', 14, 1, 1, 1, 20),
('lt-permission', 'default', 'permission', 'Izin Pribadi / Mendesak', 'Izin Pribadi / Mendesak', 'Personal / Urgent Leave', 'Izin keperluan pribadi atau keluarga mendesak', 3, 0, 1, 1, 30),
('lt-unpaid', 'default', 'unpaid', 'Cuti Tidak Berbayar', 'Cuti Tidak Berbayar', 'Unpaid Leave', 'Cuti di luar tanggungan perusahaan (tidak dibayar)', 0, 0, 0, 1, 40),
('lt-marriage', 'default', 'marriage', 'Cuti Menikah', 'Cuti Menikah', 'Marriage Leave', 'Karyawan menikah (3 hari dibayar)', 3, 1, 1, 1, 50),
('lt-child-marriage', 'default', 'child_marriage', 'Cuti Menikahkan Anak', 'Cuti Menikahkan Anak', 'Child Marriage Leave', 'Menikahkan anak karyawan (2 hari dibayar)', 2, 1, 1, 1, 55),
('lt-circumcision', 'default', 'circumcision_baptism', 'Cuti Khitanan / Baptis Anak', 'Cuti Khitanan / Baptis Anak', 'Child Circumcision / Baptism Leave', 'Mengkhitankan atau membaptiskan anak (2 hari dibayar)', 2, 1, 1, 1, 58),
('lt-maternity', 'default', 'maternity', 'Cuti Melahirkan', 'Cuti Melahirkan', 'Maternity Leave', 'Cuti melahirkan karyawan perempuan (90 hari dibayar)', 90, 1, 1, 1, 60),
('lt-paternity', 'default', 'paternity', 'Cuti Istri Melahirkan', 'Cuti Istri Melahirkan', 'Paternity Leave', 'Istri melahirkan atau mengalami keguguran (2 hari dibayar)', 2, 1, 1, 1, 65),
('lt-miscarriage', 'default', 'miscarriage', 'Cuti Keguguran', 'Cuti Keguguran', 'Miscarriage Leave', 'Karyawan perempuan mengalami keguguran (45 hari dibayar)', 45, 1, 1, 1, 68),
('lt-bereavement', 'default', 'bereavement', 'Cuti Duka Keluarga Inti', 'Cuti Duka Keluarga Inti', 'Bereavement Leave (Immediate Family)', 'Kematian suami/istri, orang tua/mertua, anak/menantu (2 hari dibayar)', 2, 0, 1, 1, 70),
('lt-bereavement-household', 'default', 'bereavement_household', 'Cuti Duka Anggota Serumah', 'Cuti Duka Anggota Serumah', 'Bereavement Leave (Household Member)', 'Kematian anggota keluarga dalam satu rumah (1 hari dibayar)', 1, 0, 1, 1, 75),
('lt-menstrual', 'default', 'menstrual', 'Cuti Haid', 'Cuti Haid', 'Menstrual Leave', 'Cuti haid hari pertama & kedua bila terasa sakit (2 hari/bulan)', 2, 0, 1, 1, 80),
('lt-hajj', 'default', 'hajj_pilgrimage', 'Cuti Ibadah Haji / Keagamaan', 'Cuti Ibadah Haji / Keagamaan', 'Religious Pilgrimage / Hajj Leave', 'Menunaikan ibadah keagamaan yang diwajibkan (1x selama bekerja)', 40, 1, 1, 1, 85),
('lt-study', 'default', 'study_exam', 'Cuti Ujian / Pendidikan', 'Cuti Ujian / Pendidikan', 'Study / Exam Leave', 'Izin mengikuti ujian akademik atau sertifikasi resmi', 3, 1, 1, 1, 90),
('lt-comp-off', 'default', 'compensatory', 'Cuti Pengganti Lembur (Off in Lieu)', 'Cuti Pengganti Lembur (Off in Lieu)', 'Compensatory / Off-in-Lieu Leave', 'Pengganti kerja di hari libur / akhir pekan', 0, 0, 1, 1, 95),
('lt-other', 'default', 'other', 'Lainnya', 'Lainnya', 'Others', 'Jenis cuti atau izin lainnya (wajib isi keterangan)', 0, 0, 1, 1, 999);
