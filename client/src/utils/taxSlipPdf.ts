import { jsPDF } from 'jspdf';

const rp = (value: any) => `Rp ${Math.round(Number(value) || 0).toLocaleString('id-ID')}`;

export function downloadTaxSlip1721Pdf(slip: any) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const w = doc.internal.pageSize.getWidth();
  const margin = 16;

  // Header
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, w, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('BUKTI PEMOTONGAN PAJAK PENGHASILAN PASAL 21 (1721-A1)', margin, 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(203, 213, 225);
  doc.text(`Tahun Pajak / Tax Year: ${slip.year} · Ringkasan Penghasilan & PPh 21 Tahunan`, margin, 19);

  let y = 36;
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('A. IDENTITAS PEMOTONG PAJAK (EMPLOYER)', margin, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(`Nama Perusahaan / Entitas : ${slip.company_name || '-'}`, margin, y);
  y += 5;
  doc.text(`NPWP Pemotong             : ${slip.company_npwp || '-'}`, margin, y);
  y += 5;
  doc.text(`Alamat                    : ${slip.company_address || '-'}`, margin, y);

  y += 9;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('B. IDENTITAS PENERIMA PENGHASILAN (EMPLOYEE)', margin, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(`Nama Lengkap : ${slip.full_name || '-'}`, margin, y);
  doc.text(`NIK / ID     : ${slip.nik || '-'}`, w / 2, y);
  y += 5;
  doc.text(`Jabatan      : ${slip.job_title || '-'}`, margin, y);
  doc.text(`Status PTKP  : ${slip.ptkp_status || 'TK/0'}`, w / 2, y);
  y += 5;
  doc.text(`NPWP Karyawan: ${slip.employee_npwp || '-'}`, margin, y);
  doc.text(`Masa Pajak   : ${slip.months_count || 0} Bulan`, w / 2, y);

  y += 10;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('C. RINCIAN PENGHASILAN & PEMOTONGAN PPh 21', margin, y);
  y += 4;

  const rows: Array<[string, string, boolean?]> = [
    ['1. Gaji Pokok & Tunjangan Tetap (Setahun)', rp(slip.total_base_salary)],
    ['2. Lembur & Bonus / Tunjangan Lainnya', rp(Number(slip.total_overtime || 0) + Number(slip.total_leave_allowance || 0))],
    ['3. Tunjangan Hari Raya (THR)', rp(slip.total_thr)],
    ['4. Jumlah Penghasilan Bruto (Gross Income)', rp(slip.total_gross), true],
    ['5. Iuran JHT & JP Ditanggung Karyawan', rp(slip.total_bpjs_tk_employee)],
    ['6. Iuran BPJS Kesehatan Karyawan', rp(slip.total_bpjs_kes_employee)],
    ['7. Jumlah Penghasilan Neto (Net Income)', rp(Math.max(0, Number(slip.total_gross || 0) - Number(slip.total_bpjs_tk_employee || 0))), true],
    ['8. PPh 21 Terutang & Dipotong (Withheld Tax)', rp(slip.total_pph21), true],
    ['9. Total Take Home Pay Diterima', rp(slip.total_take_home_pay)],
  ];

  rows.forEach(([label, val, bold]) => {
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, y, w - margin, y);
    y += 5.5;
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(bold ? 15 : 51, bold ? 23 : 65, bold ? 42 : 85);
    doc.text(label, margin + 2, y);
    doc.text(val, w - margin - 2, y, { align: 'right' });
    y += 2.5;
  });

  doc.setDrawColor(15, 23, 42);
  doc.line(margin, y, w - margin, y);
  y += 12;

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Dokumen ini dibuat otomatis oleh sistem openHR berdasarkan run penggajian berstatus Locked/Paid.', margin, y);

  const safeName = String(slip.nik || slip.full_name || 'employee').replace(/[^a-zA-Z0-9_-]+/g, '_');
  doc.save(`1721-A1-${slip.year}-${safeName}.pdf`);
}
