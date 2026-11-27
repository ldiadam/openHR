# openHR - Sistem HR, Penggajian & Operasional UKM Indonesia

Sistem HR, Penggajian (*Payroll*), dan Employee Self-Service (ESS) yang modular, ringan, dan *mobile-first* untuk Usaha Kecil dan Menengah (UKM/SME) di Indonesia (10–200 karyawan), lengkap dengan aplikasi web admin/karyawan serta aplikasi Android native (`android/`).

Dibangun di atas **Cloudflare Free Tier** menggunakan:
- **Cloudflare Workers + Hono (TypeScript)** untuk backend REST API.
- **Cloudflare D1 (SQLite)** untuk basis data relasional dengan skema `tenant_id` dan migrasi SQL (`migrations/0001`–`0036`).
- **Cloudflare R2** untuk penyimpanan berkas aman (KTP, NPWP, kontrak kerja, foto presensi, bukti klaim/petty cash, template Excel kustom, dan dokumen bertanda tangan).
- **Cloudflare Workers Static Assets** untuk antarmuka web (**React 19 + Vite + Tailwind CSS + Lucide Icons + jsPDF + SheetJS/`xlsx-js-style`**).
- **Aplikasi Android Native (`android/`)** berbasis **Kotlin + Jetpack Compose + Material 3**, terhubung ke backend lewat login kredensial atau **QR Connect** dan *refresh-token session*.

---

## Modul & Fitur Utama (Modular / Toggleable)

Seluruh modul dapat diaktifkan atau dinonaktifkan per perusahaan melalui **Pengaturan → Modul & Fitur** (`companies.modules_json`), dengan guard otomatis di UI dan API (`requireModule`):

1. **Kepegawaian (Employment)**: Master data lengkap (NIK, KTP 16 digit, NPWP, PTKP TK/0–K/3, nomor BPJS Kesehatan & Ketenagakerjaan, data TKA/paspor/KITAS, status PKWT/PKWTT/Probation, alert kontrak habis, detail bank dengan direktori kode SWIFT/cabang, struktur Company–Branch–Department, serta impor massal Excel + unduh template `.xlsx`).
2. **Presensi & GPS (Attendance)**: Clock-in/out ponsel dengan koordinat GPS, validasi *geofence* radius cabang, foto *selfie*, deteksi status otomatis (*present*, *late*, *early_leave*, *on_leave*, *sick*, *absent*), koreksi presensi, antrean luring (*offline sync queue*), dan impor log mesin sidik jari (CSV).
3. **Cuti & Izin (Leave)**: Saldo cuti tahunan & penyesuaian HR, kalender libur nasional, pilihan alur **3-Tahap Resmi + Cetak Formulir PDF** (*Applicant → Administrator → Department Head → Management* beserta tanda tangan digital) atau **1-Langkah Sederhana**.
4. **Shift & Lembur (Shifts & Overtime)**: Pola jam kerja, jadwal mingguan (*roster*), pengingat jadwal, pengajuan lembur, dan kalkulasi upah lembur resmi (1/173 x upah, tier 1.5x/2x/3x/4x).
5. **Penggajian (Payroll — 6-Step Locked Run)**:
   1. *Buka Periode*
   2. *Tarik Data Otomatis* (presensi, pengecualian harian, lembur, cuti, kasbon, reimbursement)
   3. *Review Pengecualian & UMK Guard* (termasuk resolusi kehadiran per hari)
   4. *Hitung & Penyesuaian Per Karyawan* (BPJS, PPh 21 TER / rekalkulasi Pasal 17 Desember, proration, THR)
   5. *Kunci Permanen (Lock)*
   6. *Output Slip Gaji PDF, Rekap Excel, Claim ZIP, & File Transfer Bank KlikBCA / Mandiri MCM (CSV)*
6. **Klaim Biaya & Kasbon (`claims`)**: Pinjaman gaji (*salary advance*) dengan cicilan otomatis di payroll, reimbursement berbasis periode *cutoff* (tgl 25 bulan sebelumnya → tgl 25 bulan berjalan), bundel PDF bukti struk, serta ekspor **Claim Sheet Excel (`.xlsx`)** lengkap dengan sheet kedua **Attendance Calendar & Log**.
7. **Petty Cash Bulanan & Realisasi (`petty_cash`)**: Pengajuan dana operasional, pencairan oleh Finance, pencatatan pengeluaran terperinci dengan unggah bukti gambar/PDF/Excel (`.xlsx`/`.xls`/`.csv`), pengiriman laporan realisasi & review, ekspor PDF + **verifikasi QR publik** (`/verify/petty-cash/:id`).
8. **Tugas & Alur Kerja — TMS (`tasks`)**: Penugasan tugas lintas tim, metadata referensi yang dapat dikonfigurasi (*None*, *Project*, *Maritime/Vessel*, atau *Custom*), log aktivitas, lampiran, serah-terima (*handover*), penjadwalan ulang + eskalasi pengingat, dan persetujuan penutupan.
9. **Pengumuman & Kebijakan (`announcements`)**: Pengumuman perusahaan, lampiran dokumen SOP, dan pelacakan konfirmasi baca (*acknowledgement*) karyawan.
10. **Aset & Inventaris (`assets`)**: Pencatatan aset perusahaan (laptop, ponsel, kunci, dll.), penugasan & pengembalian ke karyawan, serta cetak berita acara PDF.
11. **Offboarding & Clearance (`offboarding`)**: Alur keluar karyawan yang memeriksa aset belum kembali, tugas terbuka, dan saldo kasbon + PDF *clearance*.
12. **Kinerja & Penilaian (`performance`)**: Siklus penilaian (*probation* / tahunan), target KPI/OKR, evaluasi diri & manajer, dan ekspor PDF penilaian.
13. **Rekrutmen, ATS & Karir Publik (`recruitment`)**: Manajemen lowongan kerja, portal karir publik (`/careers`) dengan pelacakan lamaran via kode & *magic link*, catatan wawancara, pembuatan *Offer Letter PDF*, konversi 1-klik ke karyawan, dan *onboarding checklist*.
14. **Dokumen & Tanda Tangan Elektronik (`signing`)**: Template dokumen berversi & tanda tangan digital melalui **DocuSeal** (memerlukan kredensial server `DOCUSEAL_URL` & `DOCUSEAL_API_TOKEN`).
15. **Laporan & Ekspor (`reports`)**: Rekap presensi (`.xlsx`), rekap payroll (`.xlsx`), headcount (`.xlsx`), laporan pajak & BPJS (`.xlsx`), sisa cuti (`.xlsx`), Bukti Potong **1721-A1** (`.xlsx`), laporan BPJS per program 5-sheet (`.xlsx`), dan *Full JSON Backup*.
16. **Purelymail Integration (`purelymail`, Opsional / Rekomendasi)**: Modul opsional yang dapat diaktifkan/nonaktifkan di Pengaturan. Menyediakan pembuatan mailbox otomatis via **Purelymail API v0** dan pengiriman email melalui **Purelymail SMTP**.

---

## Desainer Template Formulir Dinamis (Form Templates Studio)

Tersedia di **Pengaturan → Template Formulir** (`owner_admin`):
- **Claim Sheet Excel (`claim_sheet`)**:
  - **Visual Builder**: Atur nama sheet, pola judul (`{{company_name}}`, `{{year}}`, `{{month_name}}`, dll.), simbol & format mata uang, warna header/total, urutan/visibilitas/lebar kolom, pemetaan kata kunci kategori, baris gaji, sheet *Attendance*, serta baris tanda tangan (*Prepared By*, *Checked By*, *Approved By*, atau kustom).
  - **Upload Custom `.xlsx`**: Unduh starter `.xlsx` atau unggah file `.xlsx` milik perusahaan Anda dengan token `{{employee_name}}`, `{{grand_total}}`, dan baris berulang `{{#claims}}` (disimpan di R2).
  - Tersedia tombol **Pratinjau Sample `.xlsx`** langsung dari browser.
- **Leave Application PDF (`leave_form`)**:
  - Atur ukuran kertas (`A4` / `Letter`), warna aksen, visibilitas logo & nomor registrasi, label kolom pemohon, tampilan departemen/jenis cuti (*checkbox grid* atau teks tunggal), visibilitas tiap tahap persetujuan, daftar checklist **Administrative Check** & **Department Head**, serta daftar **Footer Policy Notes**, lengkap dengan **Pratinjau Sample PDF**.

---

## Aplikasi Android ESS (`android/`)

Aplikasi Android native untuk karyawan, manajer, dan finance:
- **Autentikasi & Keamanan**: Login email/password, **QR Connect** (scan QR dari portal web), **Refresh Token Session** (`/api/auth/refresh`), dan **Biometric Lock** (`BiometricPrompt`).
- **Beranda & Presensi**: Ringkasan harian, *clock-in/out* dengan kamera selfie & peta lokasi **OpenStreetMap**, validasi *geofence*, antrean presensi offline, serta **Shift Schedule + Local Shift Reminders**.
- **Pengajuan & Workspace**: Cuti & Izin, Lembur, Klaim Biaya (dengan kamera/galeri struk), Kasbon, **Petty Cash & Realisasi** (catat pengeluaran, foto/unggah struk, kirim laporan realisasi, dan review Finance), **Tasks (TMS)**, **My Assets**, **Documents & Signing**, serta **Team Approvals** (khusus `manager`, `finance`, dan `owner_admin`).
- **Slip Gaji & Profil**: Riwayat slip gaji + ekspor PDF, edit kontak & rekening bank, mode gelap/terang, bahasa ID/EN, serta navigasi tombol *Back* bertingkat dengan dialog konfirmasi keluar aplikasi.

---

## Aturan Penggajian Indonesia (`payroll_settings`)

Semua tarif dan batas upah tersimpan di tabel `payroll_settings` dan dapat diubah lewat menu **Pengaturan**:

| Komponen | Beban Perusahaan | Potongan Karyawan | Ketentuan |
|---|---|---|---|
| **BPJS Kesehatan** | 4.0% | 1.0% | Batas upah maksimal Rp 12.000.000/bulan |
| **BPJS TK - JHT** | 3.7% | 2.0% | Dari upah pokok + tunjangan tetap |
| **BPJS TK - JP** | 2.0% | 1.0% | Batas upah maksimal berlaku |
| **BPJS TK - JKK / JKM** | 0.24% / 0.30% | - | Standar risiko kerja & kematian |
| **PPh 21 Jan–Nov** | - | Tabel TER | PP 58/2023 & PMK 168/2023 (TER A / B / C) |
| **PPh 21 Desember** | - | Pasal 17 ayat (1) | Rekalkulasi tahunan dikurangi biaya jabatan, iuran pensiun/JHT, PTKP, & kredit Jan–Nov |
| **Upah Lembur** | - | - | `Upah Bulanan / 173` (PP 35/2021) |

---

## Integrasi Email & Purelymail (Opsional)

Konfigurasi **App Domain**, **Email Delivery (SMTP)**, dan **Purelymail Mailbox API (`purelymail`)** kini dipisahkan secara independen di **Pengaturan → Perusahaan**:

1. **Web App Custom Domain**:
   - Mengatur `custom_domain` untuk tautan aktivasi karyawan, reset password, dan notifikasi slip gaji.
2. **Email Delivery (SMTP) — Independen**:
   - Berjalan mandiri dengan host/port/username SMTP yang dapat disesuaikan (`smtp_host`, `smtp_port`, `smtp_user`, `purelymail_from_address`, `purelymail_smtp_pass`) tanpa harus mengaktifkan modul Purelymail Mailbox API.
   - Mendukung uji koneksi langsung melalui tombol **Test SMTP Connection** (`POST /api/settings/test-smtp`).
   - Jika SMTP belum dikonfigurasi, email tetap dicatat ke `notifications_outbox` (mode simulasi di log/dev), atau dikirim lewat **HTTP Email API** jika dikonfigurasi.
3. **Purelymail Mailbox API (Opsional, Rekomendasi)**:
   - Modul **`purelymail`** dapat diaktifkan atau dinonaktifkan kapan saja di **Pengaturan → Perusahaan** maupun **Pengaturan → Modul & Fitur**.
   - **Saat aktif**: memanggil `POST https://purelymail.com/api/v0/createUser` saat HR mencentang pembuatan email perusahaan di form tambah karyawan, dan dapat diuji terpisah via **Test Purelymail API** (`POST /api/settings/test-purelymail-api`).
   - **Saat nonaktif (atau token belum diisi)**: pembuatan karyawan melewati provisioning mailbox Purelymail tanpa error.
4. **HTTP Email API Alternatif (Opsional)**:
   - Bila secret berikut tersedia, pengiriman otomatis memakai HTTP API: **Resend** (`RESEND_API_KEY`), **SendGrid** (`SENDGRID_API_KEY`), **Brevo** (`BREVO_API_KEY`), **Mailgun** (`MAILGUN_API_KEY` + `MAILGUN_DOMAIN`), atau binding Cloudflare **`send_email`** (`EMAIL`). Gunakan `EMAIL_API_PROVIDER` untuk memaksa provider tertentu.

---

## Akun Demo (Seed Data)

Kata sandi default seluruh akun demo: `Password123!`

| NIK | Nama Karyawan | Email Login | Peran (Role) | Cabang |
|---|---|---|---|---|
| `EMP001` | **Budi Santoso** | `budi.santoso@nusantara.id` | `owner_admin` | Jakarta Pusat |
| `EMP002` | **Siti Rahmawati** | `siti.rahma@nusantara.id` | `manager` | Jakarta Pusat |
| `EMP003` | **Dewi Lestari** | `dewi.lestari@nusantara.id` | `finance` | Jakarta Pusat |
| `EMP004` | **Agus Setiawan** | `agus.setiawan@nusantara.id` | `employee` | Jakarta Pusat |
| `EMP005` | **Rina Wijaya** | `rina.wijaya@nusantara.id` | `employee` | Bandung (PKWT) |

---

## Menjalankan Secara Lokal, Pengujian & Deployment

### Prasyarat
- Node.js v20+ / v22+
- **pnpm** (`corepack enable && pnpm -v`)
- *(Opsional untuk Android)* Android SDK + JDK 17 (`cd android && ./gradlew assembleDebug`)

### Pengembangan Lokal
```bash
pnpm install
pnpm migrate:local
pnpm build
pnpm dev          # Worker + API + Static Assets di http://localhost:8787
pnpm dev:frontend # Vite HMR dev server terpisah (opsional)
```

### Typecheck & Pengujian Otomatis
```bash
pnpm typecheck    # Verifikasi TypeScript (tsc --noEmit)
pnpm test         # Jalankan seluruh suite pengujian (node --import tsx --test test/*.test.ts)
```

### Deployment ke Cloudflare Workers
```bash
pnpm migrate:remote
pnpm wrangler secret put JWT_SECRET
# Opsional (jika mengaktifkan modul Purelymail atau HTTP Email API):
pnpm wrangler secret put PURELYMAIL_API_TOKEN
pnpm wrangler secret put PURELYMAIL_SMTP_PASS
pnpm wrangler secret put RESEND_API_KEY
# Opsional (jika mengaktifkan modul DocuSeal E-Signing):
pnpm wrangler secret put DOCUSEAL_URL
pnpm wrangler secret put DOCUSEAL_API_TOKEN
pnpm wrangler secret put DOCUSEAL_WEBHOOK_SECRET

pnpm deploy
```
