import { jsPDF } from 'jspdf';

const num = (value: any) => Number(value) || 0;
const rp = (value: any) => `Rp ${Math.round(num(value)).toLocaleString('id-ID')}`;
const safe = (value: any) =>
  value === undefined || value === null || value === '' ? '-' : String(value);

const DARK: [number, number, number] = [15, 23, 42];
const SLATE: [number, number, number] = [51, 65, 85];
const GRAY: [number, number, number] = [100, 116, 139];
const MUTED: [number, number, number] = [148, 163, 184];
const LINE: [number, number, number] = [226, 232, 240];
const LIGHT: [number, number, number] = [248, 250, 252];

interface PdfRow {
  label: string;
  amount: number;
}

function drawSection(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  title: string,
  rows: PdfRow[],
  emptyLabel: string,
  totalLabel: string,
  total: number,
  options?: { totalBaseline?: number }
): number {
  doc.setFillColor(...DARK);
  doc.rect(x, y, width, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(255, 255, 255);
  doc.text(title.toUpperCase(), x + 3, y + 4.6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(203, 213, 225);
  doc.text('Rupiah', x + width - 3, y + 4.6, { align: 'right' });

  let cursor = y + 7;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.4);

  if (rows.length === 0) {
    doc.setTextColor(...MUTED);
    doc.setFont('helvetica', 'italic');
    doc.text(emptyLabel, x + 3, cursor + 4);
    doc.setFont('helvetica', 'normal');
    cursor += 8;
  } else {
    rows.forEach((row) => {
      const lines = doc.splitTextToSize(row.label, width - 36) as string[];
      const height = Math.max(5.4, lines.length * 3.2 + 2.2);

      doc.setTextColor(...SLATE);
      doc.text(lines, x + 3, cursor + 4);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 41, 59);
      doc.text(rp(row.amount), x + width - 3, cursor + 4, { align: 'right' });
      doc.setFont('helvetica', 'normal');

      doc.setDrawColor(...LINE);
      doc.setLineWidth(0.1);
      doc.line(x, cursor + height, x + width, cursor + height);
      cursor += height;
    });
  }

  // When both columns must share a bottom edge, the shorter one is padded down
  // to the taller one's total-row baseline.
  const totalY = options?.totalBaseline ?? cursor;

  if (options?.totalBaseline !== undefined && totalY > cursor) {
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.1);
    doc.line(x, cursor, x + width, cursor);
  }

  doc.setDrawColor(...DARK);
  doc.setLineWidth(0.5);
  doc.line(x, totalY, x + width, totalY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.4);
  doc.setTextColor(...DARK);
  doc.text(totalLabel, x + 3, totalY + 4.4);
  doc.text(rp(total), x + width - 3, totalY + 4.4, { align: 'right' });

  return totalY + 6;
}

async function loadLogoAsPng(url?: string | null): Promise<{ dataUrl: string; width: number; height: number } | null> {
  if (!url) return null;
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.crossOrigin = 'anonymous';
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Failed to load logo'));
      el.src = url;
    });
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) return null;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    return { dataUrl: canvas.toDataURL('image/png'), width: w, height: h };
  } catch {
    return null;
  }
}

export async function downloadPayslipPdf(payslip: any) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;

  const companyName = safe(payslip.company_name || 'PT Nusantara Digital Kreasi');
  const companyAddress = safe(
    payslip.company_address || 'Jl. Jend. Sudirman Kav. 52-53, Jakarta Selatan'
  );
  const runTitle = safe(payslip.run_title);
  const periodStart = safe(payslip.period_start);
  const periodEnd = safe(payslip.period_end);
  const paymentDate = safe(payslip.payment_date || payslip.period_end);

  const logoAsset = await loadLogoAsPng(payslip.company_logo_url);
  let headerOffsetY = 0;

  if (logoAsset) {
    const maxH = 8.5;
    const maxW = 50;
    const ratio = logoAsset.width / logoAsset.height;
    let drawH = maxH;
    let drawW = drawH * ratio;
    if (drawW > maxW) {
      drawW = maxW;
      drawH = drawW / ratio;
    }
    doc.addImage(logoAsset.dataUrl, 'PNG', margin, 9, drawW, drawH);
    headerOffsetY = drawH + 2;
  }

  // Letterhead
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.4);
  doc.setTextColor(...GRAY);
  doc.text('SLIP GAJI KARYAWAN', margin, 13.5 + headerOffsetY);

  doc.setFontSize(13);
  doc.setTextColor(...DARK);
  doc.text(companyName, margin, 19 + headerOffsetY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.1);
  doc.setTextColor(...GRAY);
  doc.text(companyAddress, margin, 23.5 + headerOffsetY);
  if (payslip.company_npwp) doc.text(`NPWP: ${payslip.company_npwp}`, margin, 27.5 + headerOffsetY);

  doc.setFillColor(...DARK);
  doc.rect(pageWidth - margin - 25, 10.5, 25, 5.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.2);
  doc.setTextColor(255, 255, 255);
  doc.text('RAHASIA', pageWidth - margin - 12.5, 14.2, { align: 'center' });

  doc.setFontSize(7.6);
  doc.setTextColor(...DARK);
  doc.text(runTitle, pageWidth - margin, 21.5, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(...GRAY);
  doc.text(`Periode: ${periodStart} - ${periodEnd}`, pageWidth - margin, 25.5, { align: 'right' });
  doc.text(`Tanggal Bayar: ${paymentDate}`, pageWidth - margin, 29, { align: 'right' });

  const dividerY = Math.max(33, 31 + headerOffsetY);
  const yShift = dividerY - 33;
  doc.setDrawColor(...DARK);
  doc.setLineWidth(0.6);
  doc.line(margin, dividerY, pageWidth - margin, dividerY);

  // Employee data
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...DARK);
  doc.text('DATA KARYAWAN', margin, 39 + yShift);

  doc.setFillColor(...LIGHT);
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.2);
  doc.rect(margin, 41 + yShift, contentWidth, 25, 'FD');

  const infoItems: Array<[string, string]> = [
    ['Nama Karyawan', safe(payslip.employee_name)],
    ['NIK / ID', safe(payslip.employee_nik)],
    ['Jabatan', safe(payslip.job_title)],
    ['Departemen', safe(payslip.department_name)],
    ['Status PTKP', safe(payslip.ptkp_status)],
    [
      'Rekening Bank',
      payslip.bank_account_number
        ? `${safe(payslip.bank_name)} ${safe(payslip.bank_account_number)}`
        : `${safe(payslip.bank_name)} - belum diisi`,
    ],
    [
      'Hari Kerja',
      `${safe(payslip.days_worked)} / ${safe(payslip.expected_working_days)} hari`,
    ],
    ['Lembur Disetujui', `${safe(payslip.overtime_hours)} jam`],
    ['Metode Pajak', safe(payslip.pph21_method)],
  ];

  const colWidth = contentWidth / 3;
  infoItems.forEach(([label, value], index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    const x = margin + 4 + col * colWidth;
    const y = 46 + yShift + row * 7.6;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.2);
    doc.setTextColor(...MUTED);
    doc.text(label.toUpperCase(), x, y);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.4);
    doc.setTextColor(15, 23, 42);
    const truncated = (doc.splitTextToSize(value, colWidth - 8) as string[])[0] || '-';
    doc.text(truncated, x, y + 3.4);
  });

  // Earnings / deductions rows
  const prorationDelta = num(payslip.prorated_salary) - num(payslip.base_salary);
  const earnings: PdfRow[] = [
    { label: 'Gaji Pokok', amount: num(payslip.base_salary) },
    ...(prorationDelta !== 0
      ? [
          {
            label: `Penyesuaian Prorata (${safe(payslip.days_worked)}/${safe(payslip.expected_working_days)} hari)`,
            amount: prorationDelta,
          },
        ]
      : []),
    { label: 'Tunjangan Tetap', amount: num(payslip.fixed_allowance) },
    ...(num(payslip.thr_amount) > 0
      ? [{ label: 'THR (Tunjangan Hari Raya)', amount: num(payslip.thr_amount) }]
      : []),
    ...(num(payslip.overtime_pay) > 0
      ? [{ label: `Upah Lembur (${safe(payslip.overtime_hours)} jam)`, amount: num(payslip.overtime_pay) }]
      : []),
    ...(num(payslip.attendance_bonus) > 0
      ? [{ label: 'Bonus Kehadiran', amount: num(payslip.attendance_bonus) }]
      : []),
    ...(num(payslip.commission_bonus) > 0
      ? [{ label: 'Komisi / Bonus', amount: num(payslip.commission_bonus) }]
      : []),
  ];

  const earningsTotal = earnings.reduce((sum, row) => sum + row.amount, 0);
  const grossEarningsDisplay =
    num(payslip.reimbursement_amount) > 0 &&
    num(payslip.gross_earnings) === earningsTotal + num(payslip.reimbursement_amount)
      ? earningsTotal
      : num(payslip.gross_earnings);

  const deductions: PdfRow[] = [
    ...(num(payslip.bpjs_kes_employee) > 0
      ? [{ label: 'BPJS Kesehatan (1%)', amount: num(payslip.bpjs_kes_employee) }]
      : []),
    ...(num(payslip.bpjs_jht_employee) > 0
      ? [{ label: 'BPJS JHT (2%)', amount: num(payslip.bpjs_jht_employee) }]
      : []),
    ...(num(payslip.bpjs_jp_employee) > 0
      ? [{ label: 'BPJS JP (1%)', amount: num(payslip.bpjs_jp_employee) }]
      : []),
    ...(num(payslip.pph21_amount) > 0
      ? [{ label: `PPh 21 (${safe(payslip.pph21_method)})`, amount: num(payslip.pph21_amount) }]
      : []),
    ...(num(payslip.kasbon_deduction) > 0
      ? [{ label: 'Cicilan Kasbon', amount: num(payslip.kasbon_deduction) }]
      : []),
    ...(num(payslip.late_deduction) > 0
      ? [{ label: 'Potongan Terlambat', amount: num(payslip.late_deduction) }]
      : []),
    ...(num(payslip.unpaid_leave_deduction) > 0
      ? [{ label: 'Cuti Tidak Berbayar', amount: num(payslip.unpaid_leave_deduction) }]
      : []),
    ...(num(payslip.alpha_deduction) > 0
      ? [
          {
            label: [
              `Alpa / Tanpa Keterangan`,
              `${rp(num(payslip.alpha_daily_rate_exact))} x ${safe(payslip.alpha_days)}`,
            ].join('\n'),
            amount: num(payslip.alpha_deduction),
          },
        ]
      : []),
    ...(num(payslip.other_deductions) > 0
      ? [{ label: `Lain-lain (${safe(payslip.other_deductions_reason || 'Koreksi')})`, amount: num(payslip.other_deductions) }]
      : []),
  ];

  const columnWidth = (contentWidth - 6) / 2;
  const sectionY = 72 + yShift;

  // Measure each column first so both can end on the same baseline.
  const measureSection = (rows: PdfRow[], emptyLabel: string): number => {
    let height = sectionY + 7;
    if (rows.length === 0) {
      height += 8;
    } else {
      rows.forEach((row) => {
        const lines = doc.splitTextToSize(row.label, columnWidth - 36) as string[];
        height += Math.max(5.4, lines.length * 3.2 + 2.2);
      });
    }
    return height;
  };

  const sharedBaseline = Math.max(
    measureSection(earnings, '-'),
    measureSection(deductions, 'Tidak ada potongan')
  );

  drawSection(
    doc,
    margin,
    sectionY,
    columnWidth,
    'Penghasilan',
    earnings,
    '-',
    'Total Penghasilan Bruto',
    grossEarningsDisplay,
    { totalBaseline: sharedBaseline }
  );
  drawSection(
    doc,
    margin + columnWidth + 6,
    sectionY,
    columnWidth,
    'Potongan',
    deductions,
    'Tidak ada potongan',
    'Total Potongan',
    num(payslip.total_deductions),
    { totalBaseline: sharedBaseline }
  );

  let cursor = sharedBaseline + 6;

  // Non-earning reimbursement row (added to take-home pay, excluded from gross earnings)
  if (num(payslip.reimbursement_amount) > 0) {
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.2);
    doc.rect(margin, cursor, contentWidth, 8, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.2);
    doc.setTextColor(...DARK);
    doc.text('Reimbursement (Penggantian Biaya - Bukan Penghasilan)', margin + 3, cursor + 5.2);
    doc.text(`+${rp(payslip.reimbursement_amount)}`, pageWidth - margin - 3, cursor + 5.2, { align: 'right' });
    cursor += 11;
  }

  // Net pay band
  doc.setFillColor(...DARK);
  doc.rect(margin, cursor, contentWidth, 16, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.setTextColor(203, 213, 225);
  doc.text('GAJI BERSIH DITERIMA', margin + 4, cursor + 5.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.6);
  doc.setTextColor(...MUTED);
  doc.text(
    payslip.bank_account_number
      ? `Ditransfer ke ${safe(payslip.bank_name)} - ${safe(payslip.bank_account_number)}`
      : 'Nomor rekening bank belum diisi',
    margin + 4,
    cursor + 10.5
  );
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  doc.text(rp(payslip.take_home_pay), pageWidth - margin - 4, cursor + 10, { align: 'right' });

  cursor += 22;

  // Employer contributions
  const employerRows: PdfRow[] = [
    { label: 'BPJS Kesehatan (4%)', amount: num(payslip.bpjs_kes_employer) },
    { label: 'BPJS JHT (3.7%)', amount: num(payslip.bpjs_jht_employer) },
    { label: 'BPJS JP (2%)', amount: num(payslip.bpjs_jp_employer) },
    { label: 'BPJS JKK (0.24%)', amount: num(payslip.bpjs_jkk_employer) },
    { label: 'BPJS JKM (0.3%)', amount: num(payslip.bpjs_jkm_employer) },
  ].filter((row) => row.amount > 0);

  if (employerRows.length > 0) {
    const rowsCount = Math.ceil(employerRows.length / 3);
    const boxHeight = 10 + rowsCount * 5 + 5;

    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.2);
    doc.rect(margin, cursor, contentWidth, boxHeight, 'D');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.2);
    doc.setTextColor(...GRAY);
    doc.text('KONTRIBUSI PERUSAHAAN (BUKAN POTONGAN GAJI)', margin + 3, cursor + 4.5);

    doc.setFontSize(6.8);
    employerRows.forEach((row, index) => {
      const col = index % 3;
      const line = Math.floor(index / 3);
      const x = margin + 3 + col * (contentWidth / 3);
      const y = cursor + 9 + line * 5;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...GRAY);
      doc.text(row.label, x, y);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...DARK);
      doc.text(rp(row.amount), x, y + 3);
    });

    cursor += boxHeight + 3;

    doc.setDrawColor(...LINE);
    doc.line(margin + 3, cursor, pageWidth - margin - 3, cursor);
    cursor += 4;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    doc.setTextColor(...DARK);
    doc.text('Total Beban Perusahaan', margin + 3, cursor);
    doc.text(rp(payslip.total_employer_cost), pageWidth - margin - 3, cursor, { align: 'right' });
    cursor += 6;
  }

  // Signatures
  const signatureY = Math.max(cursor + 14, 246);
  const leftX = margin + 10;
  const rightX = pageWidth - margin - 65;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...GRAY);
  doc.text('Diterima oleh', leftX, signatureY);
  doc.text('Disahkan oleh', rightX, signatureY);

  doc.setDrawColor(...MUTED);
  doc.setLineWidth(0.2);
  doc.setLineDashPattern([1, 1], 0);
  doc.line(leftX, signatureY + 15, leftX + 52, signatureY + 15);
  doc.line(rightX, signatureY + 15, rightX + 52, signatureY + 15);
  doc.setLineDashPattern([], 0);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.4);
  doc.setTextColor(...DARK);
  doc.text(safe(payslip.employee_name), leftX, signatureY + 19);
  doc.text(
    safe(payslip.approver_name || payslip.company_name || 'HR / Finance'),
    rightX,
    signatureY + 19
  );

  // Approver title (manager/director) or an explicit company marker
  const approverTitle = payslip.approver_name
    ? safe(payslip.approver_title || '')
    : 'Perusahaan';
  if (approverTitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.2);
    doc.setTextColor(...GRAY);
    doc.text(approverTitle, rightX, signatureY + 22.5);
  }

  // Footer
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.4);
  doc.setTextColor(...MUTED);
  doc.text(
    'Dokumen ini bersifat rahasia dan dihasilkan otomatis oleh sistem penggajian. Tidak memerlukan tanda tangan basah.',
    pageWidth / 2,
    pageHeight - 10,
    { align: 'center' }
  );

  const nik = String(payslip.employee_nik || 'EMP').replace(/[^a-zA-Z0-9_-]/g, '');
  const periodName = String(runTitle || 'Periode').replace(/[^a-zA-Z0-9_-]/g, '_');
  doc.save(`Slip_Gaji_${nik}_${periodName}.pdf`);
}
