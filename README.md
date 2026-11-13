# openHR - Sistem HR & Penggajian UKM Indonesia

Sistem HR dan Penggajian (Payroll) mandiri, ringan, dan mobile-first yang dibangun khusus untuk Usaha Kecil dan Menengah (UKM/SME) di Indonesia (10–200 karyawan).

Dibangun di atas **Cloudflare Free Tier (tanpa layanan berbayar)** menggunakan:
- **Cloudflare Workers + Hono (TypeScript)** untuk backend API.
- **Cloudflare D1 (SQLite)** untuk basis data relasional dengan skema `tenant_id` siap *multi-tenant*.
- **Cloudflare R2** untuk penyimpanan dokumen aman (KTP, NPWP, KK, kontrak kerja, dan foto presensi/nota).
- **Cloudflare Workers Static Assets** untuk aplikasi web antarmuka pengguna (React 19 + Vite + Tailwind CSS + Lucide Icons).
- **Integrasi Purelymail**: Penyediaan kotak surat resmi (*mailbox provisioning*) melalui Purelymail API v0 dan pengiriman email undangan/notifikasi via Purelymail SMTP (`smtp.purelymail.com:587`).

---

## 9 Modul Utama

1. **Kepegawaian (Employment)**: Master data lengkap (NIK, KTP 16 digit, NPWP, PTKP TK/0–K/3, nomor BPJS Kesehatan & Ketenagakerjaan, status PKWT/PKWTT/Probation, alert kontrak habis H-30 & H-7, struktur organisasi datar Company-Branch-Department, unggah dokumen, serta impor massal Excel dengan validasi kesalahan per baris).
2. **Presensi (Attendance)**: Presensi masuk/pulang berbasis ponsel dengan koordinat GPS, validasi *geofence* radius cabang, dan foto *selfie*; penentuan status otomatis (*present*, *late*, *early_leave*, *on_leave*, *sick*, *absent*); pengajuan koreksi presensi dengan persetujuan manajer; antrean luring (*offline sync queue*); dan impor CSV mesin sidik jari (*fingerprint*).
3. **Cuti & Izin (Leave)**: Hak cuti tahunan 12 hari, cuti bersama, sakit (dengan bukti surat dokter), izin, cuti tanpa gaji, penyesuaian saldo cuti oleh HR, alur persetujuan bertingkat, dan kalender libur nasional Indonesia.
4. **Shift & Lembur (Shifts & Overtime)**: Manajemen pola jam kerja (pagi, siang, malam, normal), jadwal mingguan (*roster*), pengajuan lembur terverifikasi presensi, dan kalkulasi upah lembur resmi (1/173 x upah, tier 1.5x/2x/3x/4x).
5. **Penggajian (Payroll - 6-Step Locked Run)**: Alur penggajian 6 langkah yang terkunci secara permanen:
   1. *Buka Periode*
   2. *Tarik Data Otomatis* (presensi, lembur disetujui, cuti, kasbon, klaim)
   3. *Review Pengecualian & UMK Guard* (wajib diselesaikan sebelum dikunci)
   4. *Hitung & Penyesuaian Per Karyawan* (BPJS & PPh 21 TER / Pasal 17 Desember)
   5. *Kunci Permanen (Lock)* (tidak dapat disunting kembali, kesalahan disesuaikan pada periode berikutnya)
   6. *Output Slip Gaji PDF, Rekap Excel, & File Transfer Bank BCA / Mandiri*
6. **Layanan Mandiri Karyawan (Employee Self-Service)**: Tampilan *mobile-first* (5 aksi 1 jempol): tombol Clock In/Out dengan kamera & GPS, ringkasan presensi bulan berjalan, sisa saldo cuti, slip gaji terbaru, serta pengajuan cuti, lembur, kasbon, dan reimbursement.
7. **Kasbon & Reimbursement**: Pengajuan pinjaman gaji (*salary advance*) dengan cicilan otomatis memotong gaji pada periode payroll aktif; serta klaim reimbursement dengan foto struk nota.
8. **Laporan & Ekspor (Reports)**: Rekap presensi bulanan (Excel .xlsx), rekap penggajian (Excel .xlsx), laporan headcount karyawan, ekspor data pajak PPh 21 (Form 1721) & BPJS untuk pelaporan Disnaker, serta pencadangan data lengkap (*Full JSON Backup*).
9. **Hak Akses & Keamanan (Admin & RBAC)**: Peran *Owner / Admin HR*, *Manager*, *Finance*, dan *Employee*. Bidang data gaji (*salary fields*) disembunyikan di tingkat API berdasarkan peran, bukan sekadar di layar UI. Jejak audit (*Audit Log*) mencatat perubahan gaji, koreksi presensi, dan penguncian payroll.

---

## Aturan Penggajian Indonesia (Tersimpan di D1 Settings Table, Tidak Pernah Di-hardcode)

Semua tarif, batas upah (*caps*), dan tabel tarif efektif disimpan di tabel `payroll_settings` dan dapat diubah langsung oleh HR melalui menu **Pengaturan**:

| Komponen | Beban Perusahaan (Employer) | Potongan Karyawan (Employee) | Dasar Regulasi & Ketentuan |
|---|---|---|---|
| **BPJS Kesehatan** | 4.0% | 1.0% | Batas maksimal upah: **Rp 12.000.000 / bulan** |
| **BPJS Ketenagakerjaan - JHT** | 3.7% | 2.0% | Dari upah pokok + tunjangan tetap (tanpa batas) |
| **BPJS Ketenagakerjaan - JP (Pensiun)** | 2.0% | 1.0% | Batas maksimal upah 2026: **Rp 10.042.300 / bulan** |
| **BPJS Ketenagakerjaan - JKK** | 0.24% | - | Kelompok risiko standar I (kantor/administrasi) |
| **BPJS Ketenagakerjaan - JKM** | 0.30% | - | Jaminan Kematian |
| **PPh 21 Bulanan (Jan–Nov)** | - | Sesuai Tabel TER | **PP 58/2023 & PMK 168/2023**:<br>• **Kategori TER A**: TK/0, TK/1, K/0<br>• **Kategori TER B**: TK/2, TK/3, K/1, K/2<br>• **Kategori TER C**: K/3 |
| **PPh 21 Desember (Recalculation)** | - | Tarif Pasal 17 ayat (1) | Tarif progresif (5%, 15%, 25%, 30%, 35%) atas Penghasilan Neto Tahunan setelah dikurangi Biaya Jabatan (5% maks Rp 6.000.000/tahun), iuran pensiun/JHT, dan PTKP, dikurangi kredit pajak yang telah dipotong Jan–Nov. |
| **Upah Lembur** | - | - | Upah Sejam = **Upah Bulanan / 173** (PP 35/2021)<br>• Hari kerja: 1.5x jam pertama, 2.0x jam berikutnya<br>• Hari libur: 2.0x (1–8 jam), 3.0x (jam ke-9), 4.0x (jam ke-10+) |
| **Prorata Gaji** | - | - | `(Hari Bekerja / Hari Kerja Sebulan) x Gaji Pokok` |
| **UMK Guard** | - | - | Peringatan otomatis (*warning exception*) bila gaji pokok berada di bawah UMK cabang penempatan (contoh: Jakarta Rp 5.067.381, Bandung Rp 4.209.309). |

---

## Integrasi Onboarding Purelymail

1. **Penyediaan Kotak Surat (*Mailbox Provisioning*)**:
   - Memanggil endpoint resmi Purelymail API v0:
     `POST https://purelymail.com/api/v0/createUser`
   - Header autentikasi: `Purelymail-Api-Token: <token>`
   - Parameter JSON: `{ userName, domainName, password, enablePasswordReset: true, recoveryEmail, ... }`
2. **Pengiriman Email Undangan via SMTP**:
   - Dikirim melalui `smtp.purelymail.com:587` (dengan STARTTLS) menggunakan *App Password* Purelymail.
   - Digunakan pula untuk reset kata sandi, status persetujuan cuti, dan notifikasi slip gaji terbit.
3. **Toleransi & Fallback Tanpa Kegagalan**:
   - Jika kredensial Purelymail belum diatur (di lingkungan lokal / dev), onboarding **tetap berhasil 100%**. Sistem mencatat email ke tabel `notifications_outbox`, mencetak tautan undangan ke konsol, dan menampilkan tautan aktivasi langsung di antarmuka HR.
4. **Email API (opsional, direkomendasikan di production)**:
   - Pengiriman dapat dialihkan dari SMTP ke HTTP email API tanpa mengubah kode. Bila salah satu kredensial berikut ada, API dipakai otomatis; jika tidak, SMTP Purelymail tetap menjadi fallback.
   - Provider yang didukung: **Resend** (`RESEND_API_KEY`), **SendGrid** (`SENDGRID_API_KEY`), **Brevo** (`BREVO_API_KEY`), **Mailgun** (`MAILGUN_API_KEY` + `MAILGUN_DOMAIN`), atau binding Cloudflare **`send_email`** bernama `EMAIL`.
   - Gunakan `EMAIL_API_PROVIDER` untuk memaksa provider tertentu (`resend|sendgrid|brevo|mailgun|cloudflare`).
   - Pengiriman tetap fire-and-forget melalui `ctx.waitUntil`, dan status setiap email tercatat di `notifications_outbox`.

---

## Akun Demo & Data Awal (Seed Data)

Semua akun pengujian di bawah ini telah disiapkan dalam migrasi dengan kata sandi default:
```
Password123!
```

| NIK | Nama Karyawan | Email Login | Peran (Role) | Status PTKP | Gaji Pokok | Cabang |
|---|---|---|---|---|---|---|
| `EMP001` | **Budi Santoso** | `budi.santoso@nusantara.id` | `owner_admin` | TK/0 | Rp 18.000.000 | Jakarta Pusat |
| `EMP002` | **Siti Rahmawati** | `siti.rahma@nusantara.id` | `manager` | K/1 | Rp 12.000.000 | Jakarta Pusat |
| `EMP003` | **Dewi Lestari** | `dewi.lestari@nusantara.id` | `finance` | TK/1 | Rp 9.000.000 | Jakarta Pusat |
| `EMP004` | **Agus Setiawan** | `agus.setiawan@nusantara.id` | `employee` | K/2 | Rp 14.000.000 | Jakarta Pusat |
| `EMP005` | **Rina Wijaya** | `rina.wijaya@nusantara.id` | `employee` | TK/0 | Rp 5.500.000 | Bandung (PKWT) |

*Tersedia tombol **1-Click Demo Login** di halaman masuk `/login` untuk berpindah peran secara cepat saat demonstrasi.*

---

## Cara Menjalankan Secara Lokal

### Prasyarat
- Node.js v20+ atau v22+
- **pnpm** (`corepack enable && pnpm -v`)

### 1. Pasang Dependensi
```bash
pnpm install
```

### 2. Terapkan Migrasi Basis Data D1 Lokal
```bash
pnpm migrate:local
```

### 3. Bangun Antarmuka Frontend
```bash
pnpm build
```

### 4. Jalankan Server Dev Cloudflare Workers
```bash
pnpm dev
```
Aplikasi akan aktif di `http://localhost:8787`. Buka browser untuk mengakses antarmuka lengkap.

Untuk menjalankan dev server frontend Vite secara terpisah dengan hot-reloading:
```bash
pnpm dev:frontend
```

---

## Menjalankan Pengujian Kriteria Penerimaan (All 7 Acceptance Criteria)

Seluruh 7 kriteria penerimaan dari spesifikasi diverifikasi secara otomatis melalui suite pengujian bawaan:

```bash
pnpm test
```

### Rekap Verifikasi 7 Acceptance Criteria:
- [x] **AC1**: HR dapat mengimpor 50 karyawan sekaligus dari Excel (`/api/employees/bulk-import`) dan seluruh 50 karyawan dapat melakukan presensi ponsel pada hari yang sama.
- [x] **AC2**: Presensi terlambat, cuti disetujui, dan lembur disetujui secara otomatis mengubah hasil kalkulasi penggajian bulanan tanpa perlu input ulang manual.
- [x] **AC3**: Perhitungan BPJS dan PPh 21 TER untuk kategori TK/0, K/1, dan K/2 cocok presisi dengan lembar kerja terverifikasi.
- [x] **AC4**: Periode penggajian yang telah dikunci (*locked*) tidak dapat disunting kembali; perbaikan dilakukan sebagai penyesuaian pada periode berikutnya.
- [x] **AC5**: Karyawan hanya dapat melihat dan mengunduh slip gaji miliknya sendiri dan mendapatkan respons *403 Forbidden* jika mencoba membuka slip gaji orang lain.
- [x] **AC6**: Kasbon yang disetujui pada bulan berjalan otomatis dipotongkan pada periode penggajian bulan tersebut.
- [x] **AC7**: Rekapitulasi presensi dan penggajian dapat langsung diekspor ke file Excel (.xlsx) siap pakai untuk bagian keuangan dan Disnaker.

---

## Panduan Penerapan ke Cloudflare (Free Tier Production Deployment)

### 1. Buat Basis Data D1 di Cloudflare
```bash
pnpm wrangler d1 create openhr-db
```
Salin `database_id` yang dihasilkan ke dalam berkas `wrangler.jsonc`.

### 2. Buat Bucket R2 di Cloudflare
```bash
pnpm wrangler r2 bucket create openhr-uploads
```

### 3. Terapkan Migrasi ke Basis Data Remote
```bash
pnpm wrangler d1 migrations apply DB --remote
```

### 4. Simpan Kredensial Rahasia Purelymail via Cloudflare Secrets
*(Jangan pernah menyimpan kredensial di kode atau berkas repositori git!)*
```bash
pnpm wrangler secret put PURELYMAIL_API_TOKEN
# Masukkan token API dari Purelymail panel > Account > API

pnpm wrangler secret put PURELYMAIL_SMTP_PASS
# Masukkan App Password SMTP Purelymail

# Opsional: alihkan pengiriman email ke HTTP API (contoh Resend)
pnpm wrangler secret put RESEND_API_KEY
# Masukkan API key dari dashboard Resend

pnpm wrangler secret put JWT_SECRET
# Masukkan kunci rahasia minimal 32 karakter untuk penandatanganan JWT
```

### 5. Bangun & Terapkan
```bash
pnpm deploy
```
Aplikasi openHR akan langsung aktif di subdomain `https://openhr.<subdomain>.workers.dev`.

---

## Analisis Batasan Cloudflare Free Tier

Aplikasi dirancang agar selalu berada di dalam koridor gratis Cloudflare:
- **Cloudflare Workers**: Ukuran *bundle* terkompresi hanya **~172 KiB** (batas gratis: 1 MB). Batas kuota gratis: 100.000 permintaan/hari.
- **Cloudflare D1**: Batas kuota gratis: 5.000.000 pembacaan/hari, 100.000 penulisan/hari, dan 5 GB penyimpanan (skema UKM 10–200 karyawan menggunakan < 50 MB/tahun).
- **Cloudflare R2**: Batas kuota gratis: 10 GB penyimpanan berkas, 1.000.000 operasi Class A/bulan, 10.000.000 operasi Class B/bulan.
- **Static Assets / Pages**: Permintaan aset statis tidak terbatas (*unlimited free requests*).
- **Hasil**: Tidak ada batasan free-tier yang terlampaui.

---

## Integrasi Tanda Tangan Elektronik (DocuSeal)

Modul e-signature memakai **DocuSeal self-hosted** sebagai penyedia tanda tangan. Semua kredensial hanya ada di sisi server.

### Konfigurasi (server-side only)

```bash
DOCUSEAL_URL=https://sign.example.com
DOCUSEAL_API_TOKEN=...            # header X-Auth-Token
DOCUSEAL_WEBHOOK_SECRET=whsec_... # HMAC secret untuk webhook
HR_APP_URL=https://hr.example.com # redirect & tautan dokumen
```

Tambahkan ke `.dev.vars` (lokal) atau `wrangler secret put` (produksi). **Jangan** pernah memakai prefix `VITE_` untuk nilai ini — bundle klien tidak boleh memuatnya.

### 1. Mendaftarkan template dokumen

Template HR wajib **versioned**. Setiap versi baru membuat template DocuSeal baru (fork ini tidak melakukan upsert berdasarkan `external_id`, jadi id disimpan sendiri di `hr_document_templates`).

Lewat API (Admin HR / `owner_admin`):

```bash
curl -X POST https://hr.example.com/api/hr/document-templates \
  -H "Authorization: Bearer $TOKEN" \
  -F code=offer_letter \
  -F name="Offer Letter" \
  -F file=@offer-letter.pdf
```

Atau lewat CLI:

```bash
pnpm docuseal:register:template -- --code offer_letter --name "Offer Letter" --file ./offer-letter.pdf --version 2 --remote
```

- Kode contoh: `offer_letter`, `nda`, `handbook_ack`, `policy_ack`, `offboarding_clearance`, `pip_warning`, `salary_change`.
- Template yang masih dipakai pengajuan berjalan (`sent`/`partially_signed`) **tidak boleh diubah** — buat versi baru (endpoint akan menolak dengan 409).
- Definisi field PDF: koordinat `x, y, w, h` ternormalisasi `0..1`, origin kiri-atas, `page` berbasis 1. DOCX memakai tag `{{Signature;type=signature;role=Employee}}`.
- Role konsisten: `Employee`, `Manager`, `HR`.

### 2. Membuat pengajuan tanda tangan

```bash
curl -X POST https://hr.example.com/api/hr/signing-requests \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{
    "employeeId": "emp_123",
    "templateCode": "offer_letter",
    "templateVersion": 3,
    "signers": [
      { "role": "Employee", "email": "jane@example.com", "name": "Jane" },
      { "role": "HR", "email": "hr@example.com", "name": "HR Team" }
    ],
    "order": "preserved",
    "dueAt": "2026-12-31T17:00:00Z",
    "sendEmail": false,
    "prefill": { "Position": "Engineer" },
    "idempotencyKey": "offer-emp_123-v3"
  }'
```

- `idempotencyKey` mengembalikan pengajuan yang sama bila diulang (tanpa submission DocuSeal kedua).
- URL tanda tangan diambil dari `embed_src` DocuSeal — jangan menyusun `/s/:slug` sendiri.
- Jika pembuatan submission gagal, pengajuan ditandai `failed` dan dapat diulang tanpa membuat template duplikat.

Endpoint lain:

| Method | Path | Keterangan |
|---|---|---|
| GET | `/api/hr/signing-requests` | daftar (RBAC-scoped) |
| GET | `/api/hr/signing-requests/:id` | detail + signer + dokumen |
| POST | `/api/hr/signing-requests/:id/resend` | perbarui tautan tanda tangan |
| POST | `/api/hr/signing-requests/:id/supersede` | tandai digantikan (re-sign) |
| POST | `/api/hr/signing-requests/bulk-policy-ack` | buat massal per departemen/cabang |
| GET | `/api/hr/signing-requests/ack-status?code=policy_ack` | siapa sudah/belum |
| GET | `/api/hr/document-templates` | daftar template & versi |
| POST | `/api/hr/document-templates/:id/deactivate` | nonaktifkan versi |
| GET | `/api/hr/employees/:id/documents` | dokumen milik karyawan |
| GET | `/api/hr/signing-documents/:id/download` | unduhan terotorisasi |

UI tersedia di menu **Dokumen & Tanda Tangan** (`/documents`) untuk `owner_admin`, `finance`, dan `manager`.

### 3. Webhook

Daftarkan di DocuSeal: `https://hr.example.com/webhooks/docuseal`

- Header `X-Docuseal-Signature: <timestamp>.<hex_hmac_sha256>`
- HMAC input: `<timestamp>.<raw_body>`, secret `DOCUSEAL_WEBHOOK_SECRET`
- Toleransi timestamp **5 menit**, perbandingan constant-time, ditolak dengan **401**.
- Event yang ditangani: `submission.completed`, `submission.expired`, `submission.archived`, `submission.declined`, `form.completed`, `form.declined`.
- Pada `submission.completed` sistem **mengambil submission dari API** lalu langsung mengunduh PDF bertanda tangan + audit trail (URL DocuSeal kedaluwarsa), menyimpannya ke R2, memperbarui status, dan menandai pengajuan `completed`.
- Retry menghasilkan `{"ok":true,"duplicate":true}` tanpa dokumen/status ganda (dedupe `docuseal_webhook_events`).

### 4. Penyimpanan & retensi

- Objek disimpan di R2 dengan kunci `signed/<signingRequestId>/<kind>-<submitterId>.pdf` (tanpa nama/email).
- Tiap dokumen mencatat `sha256`, `byte_size`, `content_type`, dan `downloaded_at`.
- **Audit trail** selalu disimpan bersama PDF sebagai bukti.
- Retensi default 60 bulan per template (`hr_document_templates.retention_months`); jalankan `pnpm docuseal:purge` (tidak dijadwalkan otomatis).
- Unduhan hanya lewat endpoint terotorisasi; URL DocuSeal tidak pernah menjadi satu-satunya salinan.

### 5. RBAC

| Peran aplikasi | Padanan | Hak |
|---|---|---|
| `owner_admin` | HR_ADMIN | kelola template, semua pengajuan, semua dokumen |
| `finance` | HR_OPERATOR | buat pengajuan, lihat dokumen karyawan |
| `manager` | MANAGER | hanya bawahan langsung |
| `employee` | EMPLOYEE | hanya dokumen sendiri |

Workflow `pip_warning` dan `salary_change` dibatasi ke HR admin dan rantai manajemen karyawan.

### 6. Catatan kepatuhan

- Cocok untuk dokumen internal: offer letter, NDA, acknowledgment kebijakan, PIP, exit clearance, surat perubahan gaji.
- **Tidak** untuk dokumen yang membutuhkan tanda tangan basah, notarisasi, meterai fisik, atau portal pemerintah.
- Sertifikat self-signed hanya untuk dokumen berisiko rendah; kontrak kerja berisiko tinggi sebaiknya memakai sertifikat PSrE/terpercaya (unggah PKCS#12 di DocuSeal).
- Sertakan pemberitahuan privasi/consent serta kebijakan retensi & penghapusan. Kepatuhan UU ITE / PP 71/2019 (ID) dan ETA (SG) perlu ditinjau bersama penasihat hukum.

### 7. Batasan yang diketahui

- Fork ini **tidak** menyediakan konversi HTML→PDF di sisi server, endpoint submission PDF/HTML sekali pakai, atau pengiriman SMS.
- `/api/templates/html`, `/api/submissions/pdf`, dan `/api/submissions/html` tidak didukung dan tidak dipanggil.
- Setiap `/api/templates/pdf` membuat template baru; id selalu disimpan lokal.
