import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import QRCode from 'qrcode';
import { getToken } from '../api';

export interface PettyCashPdfExpense {
  id: string;
  expense_date: string;
  category: string;
  description: string;
  amount: number;
  vendor?: string | null;
  notes?: string | null;
  receipts?: Array<{
    id: string;
    file_name: string;
    mime_type: string;
    url: string;
  }>;
}

export interface PettyCashPdfOptions {
  companyName: string;
  logoUrl?: string | null;
  referenceNo: string;
  purpose: string;
  departmentName?: string;
  employeeName: string;
  employeeNik?: string;
  approverName?: string;
  reviewerName?: string;
  status: string;
  createdAt?: string;
  disbursedAmount: number;
  totalRealized: number;
  variance: number;
  expenses: PettyCashPdfExpense[];
  verifyUrl?: string | null;
  templateLabels?: {
    currencySymbol?: string;
    preparedBy?: string;
    checkedBy?: string;
    approvedBy?: string;
  };
}

const CATEGORY_MAP: Record<string, string> = {
  transport: 'Transport',
  meals: 'Meals & Catering',
  office_supplies: 'Office Supplies',
  utilities: 'Utilities',
  maintenance: 'Repairs & Maintenance',
  travel: 'Business Travel',
  other: 'Other',
};

const STATUS_MAP: Record<string, string> = {
  pending: 'Awaiting Approval',
  approved: 'Cash Received',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
  report_submitted: 'Under Review',
  report_approved: 'Approved',
  report_rejected: 'Sent Back',
};

function formatRupiah(amount: number): string {
  return 'Rp ' + (amount || 0).toLocaleString('id-ID');
}

function formatDateEn(dateStr?: string | null): string {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    return d.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return String(dateStr);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });
}

export async function generatePettyCashPdf(options: PettyCashPdfOptions): Promise<void> {
  const {
    companyName = 'openHR',
    referenceNo = 'PC-2026-0001',
    purpose = 'Petty Cash',
    departmentName = '-',
    employeeName = '-',
    employeeNik = '-',
    approverName = '-',
    reviewerName = '-',
    status = 'approved',
    disbursedAmount = 0,
    totalRealized = 0,
    variance = 0,
    expenses = [],
    verifyUrl = null,
    templateLabels,
  } = options;
  const curSymbol = templateLabels?.currencySymbol || 'Rp';
  const formatAmount = (amount: number) => `${curSymbol} ${(amount || 0).toLocaleString('id-ID')}`;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;

  // ================= PAGE 1: COVER & EXPENSE REPORT SUMMARY =================
  // Header Banner
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, pageWidth, 30, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text((companyName || 'OPENHR').toUpperCase(), margin, 12);

  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(203, 213, 225); // slate-300
  doc.text(`PETTY CASH EXPENSE REPORT — ${referenceNo}`, margin, 19);

  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184); // slate-400
  const printedDate = new Date().toLocaleDateString('en-US', {
    dateStyle: 'full',
  });
  doc.text(`Printed on: ${printedDate}`, margin, 25);

  if (verifyUrl) {
    try {
      const qrDataUrl = await QRCode.toDataURL(verifyUrl, {
        width: 240,
        margin: 1,
        color: { dark: '#0f172a', light: '#ffffff' },
      });
      const qrBoxSize = 20;
      const qrBoxX = pageWidth - margin - qrBoxSize;
      const qrBoxY = 2.5;
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, 1.5, 1.5, 'F');
      doc.addImage(qrDataUrl, 'PNG', qrBoxX + 1, qrBoxY + 1, qrBoxSize - 2, qrBoxSize - 2);
      doc.link(qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, { url: verifyUrl });

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(5.5);
      doc.setTextColor(203, 213, 225);
      doc.text('SCAN TO VERIFY', qrBoxX + qrBoxSize / 2, 26.8, { align: 'center' });
    } catch (err) {
      console.warn('Failed to render QR code:', err);
    }
  }

  let curY = 36;

  // Metadata Card
  doc.setFillColor(248, 250, 252); // slate-50
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.roundedRect(margin, curY, contentWidth, 26, 2, 2, 'FD');

  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139); // slate-500
  doc.setFont('helvetica', 'normal');
  doc.text('APPLICANT', margin + 4, curY + 6);
  doc.text('EMPLOYEE ID', margin + 50, curY + 6);
  doc.text('DEPARTMENT', margin + 85, curY + 6);
  doc.text('REFERENCE NO.', margin + 130, curY + 6);

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text(employeeName || '-', margin + 4, curY + 12);
  doc.text(employeeNik || '-', margin + 50, curY + 12);
  doc.text(departmentName || '-', margin + 85, curY + 12);
  doc.text(referenceNo || '-', margin + 130, curY + 12);

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text('PURPOSE:', margin + 4, curY + 19);
  doc.text('STATUS:', margin + 130, curY + 19);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  const cleanPurpose = purpose.length > 65 ? purpose.slice(0, 63) + '..' : purpose;
  doc.text(cleanPurpose || '-', margin + 22, curY + 19);
  doc.text(STATUS_MAP[status] || status, margin + 145, curY + 19);

  curY += 31;

  // Financial Summary 3-Box Layout
  const boxWidth = (contentWidth - 6) / 3;
  const boxHeight = 16;

  // Box 1: Cash Received
  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin, curY, boxWidth, boxHeight, 1.5, 1.5, 'FD');
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text('CASH RECEIVED (FLOAT)', margin + 3, curY + 5.5);
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(formatRupiah(disbursedAmount), margin + 3, curY + 12.5);

  // Box 2: Total Realized
  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin + boxWidth + 3, curY, boxWidth, boxHeight, 1.5, 1.5, 'FD');
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text('TOTAL REALIZED (SPENT)', margin + boxWidth + 6, curY + 5.5);
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(185, 28, 28); // red-700
  doc.text(formatRupiah(totalRealized), margin + boxWidth + 6, curY + 12.5);

  // Box 3: Remaining Balance
  doc.setFillColor(variance >= 0 ? 236 : 254, variance >= 0 ? 253 : 242, variance >= 0 ? 245 : 242);
  doc.setDrawColor(variance >= 0 ? 167 : 252, variance >= 0 ? 243 : 165, variance >= 0 ? 208 : 165);
  doc.roundedRect(margin + (boxWidth + 3) * 2, curY, boxWidth, boxHeight, 1.5, 1.5, 'FD');
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(variance >= 0 ? 6 : 153, variance >= 0 ? 95 : 27, variance >= 0 ? 70 : 27);
  doc.text(variance >= 0 ? 'REMAINING BALANCE' : 'DEFICIT (OVER BUDGET)', margin + (boxWidth + 3) * 2 + 3, curY + 5.5);
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(variance >= 0 ? 4 : 185, variance >= 0 ? 120 : 28, variance >= 0 ? 87 : 28);
  doc.text(formatRupiah(Math.abs(variance)), margin + (boxWidth + 3) * 2 + 3, curY + 12.5);

  curY += boxHeight + 7;

  // Table Title
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text('EXPENSE BREAKDOWN', margin, curY);

  curY += 4;

  // Table Column Positions
  const colX = {
    no: margin,
    date: margin + 8,
    category: margin + 30,
    desc: margin + 62,
    vendor: margin + 122,
    amount: margin + 152,
    receipt: margin + 172,
  };

  const drawTableHeader = (y: number) => {
    doc.setFillColor(241, 245, 249);
    doc.rect(margin, y, contentWidth, 7, 'F');
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(51, 65, 85);

    doc.text('NO', colX.no + 1.5, y + 4.8);
    doc.text('DATE', colX.date, y + 4.8);
    doc.text('CATEGORY', colX.category, y + 4.8);
    doc.text('DESCRIPTION', colX.desc, y + 4.8);
    doc.text('STORE / VENDOR', colX.vendor, y + 4.8);
    doc.text('AMOUNT (RP)', colX.amount, y + 4.8);
    doc.text('RECEIPT', colX.receipt, y + 4.8);
  };

  drawTableHeader(curY);
  curY += 7.5;

  let totalExpenseCalc = 0;
  let receiptCount = 0;

  expenses.forEach((item, index) => {
    // Check page overflow
    if (curY > pageHeight - 45) {
      doc.addPage();
      curY = 16;
      drawTableHeader(curY);
      curY += 7.5;
    }

    const amt = Number(item.amount || 0);
    totalExpenseCalc += amt;
    const fileLen = item.receipts?.length || 0;
    const hasReceipt = fileLen > 0;
    if (hasReceipt) receiptCount += fileLen;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(30, 41, 59);

    // Zebra striping
    if (index % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, curY - 1, contentWidth, 6.2, 'F');
    }

    doc.text(String(index + 1), colX.no + 1.5, curY + 3.2);
    doc.text(formatDateEn(item.expense_date), colX.date, curY + 3.2);

    const catLabel = CATEGORY_MAP[item.category] || item.category || '-';
    doc.text(catLabel.length > 18 ? catLabel.slice(0, 16) + '..' : catLabel, colX.category, curY + 3.2);

    const desc = item.description || '-';
    doc.text(desc.length > 32 ? desc.slice(0, 30) + '..' : desc, colX.desc, curY + 3.2);

    const v = item.vendor || '-';
    doc.text(v.length > 16 ? v.slice(0, 14) + '..' : v, colX.vendor, curY + 3.2);

    const formattedAmt = amt.toLocaleString('id-ID');
    doc.text(formattedAmt, colX.amount + 15, curY + 3.2, { align: 'right' });

    if (hasReceipt) {
      doc.setTextColor(16, 185, 129); // emerald-600
      doc.text(`${fileLen} ${fileLen === 1 ? 'file' : 'files'}`, colX.receipt, curY + 3.2);
    } else {
      doc.setTextColor(148, 163, 184); // slate-400
      doc.text('None', colX.receipt, curY + 3.2);
    }

    curY += 6.2;
  });

  // Grand Total Row
  if (curY > pageHeight - 45) {
    doc.addPage();
    curY = 16;
  }

  curY += 2;
  doc.setFillColor(254, 240, 138); // yellow-200
  doc.setDrawColor(250, 204, 21); // yellow-400
  doc.rect(margin, curY, contentWidth, 7.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(113, 63, 18); // yellow-900
  doc.text('TOTAL REALIZED (GRAND TOTAL)', margin + 3, curY + 5.2);
  doc.text(`Rp ${totalExpenseCalc.toLocaleString('id-ID')}`, colX.amount + 15, curY + 5.2, { align: 'right' });
  doc.text(`${receiptCount} ${receiptCount === 1 ? 'File' : 'Files'}`, colX.receipt, curY + 5.2);

  curY += 16;

  // Signatures Section
  if (curY > pageHeight - 40) {
    doc.addPage();
    curY = 20;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);

  const sigCol1 = margin + 8;
  const sigCol2 = margin + 68;
  const sigCol3 = margin + 128;

  doc.text(`${templateLabels?.preparedBy || 'PREPARED BY'}:`, sigCol1, curY);
  doc.text(`${templateLabels?.checkedBy || 'CHECKED BY'}:`, sigCol2, curY);
  doc.text(`${templateLabels?.approvedBy || 'APPROVED BY'}:`, sigCol3, curY);

  doc.setDrawColor(203, 213, 225);
  doc.line(sigCol1, curY + 18, sigCol1 + 44, curY + 18);
  doc.line(sigCol2, curY + 18, sigCol2 + 44, curY + 18);
  doc.line(sigCol3, curY + 18, sigCol3 + 44, curY + 18);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text(employeeName || '-', sigCol1, curY + 22);
  doc.text(approverName || 'Supervisor', sigCol2, curY + 22);
  doc.text(reviewerName || 'Director / Finance', sigCol3, curY + 22);

  // Footer for Page 1
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text(`Page 1 — Official Document ${companyName}`, margin, pageHeight - 8);

  // ================= SUBSEQUENT PAGES: ATTACHED RECEIPT IMAGES (2x2 GRID) =================
  const token = getToken();
  const withAuthToken = (url: string) =>
    url.includes('token=') ? url : `${url}${url.includes('?') ? '&' : '?'}token=${token}`;
  const imageReceipts: Array<{
    expenseIndex: number;
    exp: PettyCashPdfExpense;
    receipt: NonNullable<PettyCashPdfExpense['receipts']>[number];
    imgEl: HTMLImageElement;
  }> = [];

  for (let i = 0; i < expenses.length; i++) {
    const exp = expenses[i];
    const receiptsList = exp.receipts || [];
    for (let r = 0; r < receiptsList.length; r++) {
      const receipt = receiptsList[r];
      const isImg =
        receipt.mime_type.startsWith('image/') ||
        /\.(jpe?g|png|webp|heic|heif)$/i.test(receipt.file_name);
      if (!isImg) continue;

      try {
        const fullUrl = withAuthToken(receipt.url);
        const imgEl = await loadImage(fullUrl);
        imageReceipts.push({ expenseIndex: i, exp, receipt, imgEl });
      } catch (err) {
        console.warn(`Could not render receipt ${receipt.file_name}:`, err);
      }
    }
  }

  const cols = 2;
  const rows = 2;
  const perPage = cols * rows;
  const gapX = 5;
  const gapY = 5;
  const gridTopY = 23;
  const gridBottomMargin = 13;
  const cardW = (contentWidth - gapX) / cols;
  const cardH = (pageHeight - gridTopY - gridBottomMargin - gapY) / rows;
  const cardHeaderH = 15;

  let currentPageNum = 1;

  imageReceipts.forEach((entry, idx) => {
    const slot = idx % perPage;
    if (slot === 0) {
      currentPageNum++;
      doc.addPage();

      doc.setFillColor(15, 23, 42); // slate-900
      doc.rect(0, 0, pageWidth, 18, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(255, 255, 255);
      doc.text(`RECEIPT ATTACHMENTS — ${referenceNo}`, margin, 11.5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.text(
        `Receipt Attachments ${referenceNo} — Page ${currentPageNum}`,
        margin,
        pageHeight - 7
      );
    }

    const col = slot % cols;
    const row = Math.floor(slot / cols);
    const cardX = margin + col * (cardW + gapX);
    const cardY = gridTopY + row * (cardH + gapY);

    // Card frame
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(cardX, cardY, cardW, cardH, 1.5, 1.5, 'FD');

    // Card header strip
    doc.setFillColor(241, 245, 249);
    doc.rect(cardX, cardY, cardW, cardHeaderH, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.line(cardX, cardY + cardHeaderH, cardX + cardW, cardY + cardHeaderH);

    const { expenseIndex, exp, receipt, imgEl } = entry;
    const rawTitle = `#${expenseIndex + 1}: ${exp.description || 'Expense'}`;
    const title = rawTitle.length > 42 ? rawTitle.slice(0, 40) + '..' : rawTitle;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42);
    doc.text(title, cardX + 2.5, cardY + 4.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(71, 85, 105);
    const catName = CATEGORY_MAP[exp.category] || exp.category || '-';
    const line2 = `${formatDateEn(exp.expense_date)} · ${catName} · ${formatRupiah(exp.amount)}`;
    doc.text(line2.length > 52 ? line2.slice(0, 50) + '..' : line2, cardX + 2.5, cardY + 9);

    doc.setFontSize(6);
    doc.setTextColor(100, 116, 139);
    const line3 = `${exp.vendor || '-'} · ${receipt.file_name}`;
    doc.text(line3.length > 58 ? line3.slice(0, 56) + '..' : line3, cardX + 2.5, cardY + 13);

    // Image box
    const pad = 2.5;
    const maxImgW = cardW - pad * 2;
    const maxImgH = cardH - cardHeaderH - pad * 2;

    const imgRatio = (imgEl.naturalWidth || imgEl.width) / (imgEl.naturalHeight || imgEl.height);
    let finalW = maxImgW;
    let finalH = finalW / imgRatio;
    if (finalH > maxImgH) {
      finalH = maxImgH;
      finalW = finalH * imgRatio;
    }

    const imgX = cardX + pad + (maxImgW - finalW) / 2;
    const imgY = cardY + cardHeaderH + pad + (maxImgH - finalH) / 2;

    doc.addImage(imgEl, 'JPEG', imgX, imgY, finalW, finalH, undefined, 'FAST');
  });

  // ================= SUBSEQUENT PAGES: ATTACHED EXCEL / CSV SPREADSHEETS =================
  const isExcelFile = (mime?: string, name?: string) => {
    const m = String(mime || '').toLowerCase();
    const n = String(name || '').toLowerCase();
    return (
      m.includes('spreadsheet') ||
      m.includes('excel') ||
      m.includes('csv') ||
      n.endsWith('.xlsx') ||
      n.endsWith('.xls') ||
      n.endsWith('.csv')
    );
  };

  for (let i = 0; i < expenses.length; i++) {
    const exp = expenses[i];
    const receiptsList = exp.receipts || [];

    for (let r = 0; r < receiptsList.length; r++) {
      const receipt = receiptsList[r];
      if (!isExcelFile(receipt.mime_type, receipt.file_name)) continue;

      try {
        const res = await fetch(withAuthToken(receipt.url));
        if (!res.ok) continue;
        const buf = await res.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });

        for (const sheetName of wb.SheetNames) {
          const sheet = wb.Sheets[sheetName];
          const rawRows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '' });
          const nonEmptyRows = rawRows.filter((row) =>
            Array.isArray(row) && row.some((cell) => String(cell ?? '').trim() !== '')
          );
          if (nonEmptyRows.length === 0) continue;

          // Determine active column count (capped at 8 columns for readability)
          let maxCols = 0;
          for (const row of nonEmptyRows) {
            for (let c = row.length - 1; c >= 0; c--) {
              if (String(row[c] ?? '').trim() !== '') {
                maxCols = Math.max(maxCols, c + 1);
                break;
              }
            }
          }
          const colCount = Math.min(Math.max(maxCols, 1), 8);
          const colW = contentWidth / colCount;

          const drawExcelPageHeader = (pageNum: number) => {
            doc.setFillColor(15, 23, 42);
            doc.rect(0, 0, pageWidth, 24, 'F');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10);
            doc.setTextColor(255, 255, 255);
            doc.text(
              `EXCEL ATTACHMENT #${i + 1}: ${exp.description || 'Expense'}`.slice(0, 72),
              margin,
              10
            );
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7.5);
            doc.setTextColor(203, 213, 225);
            doc.text(
              `File: ${receipt.file_name}  |  Sheet: ${sheetName}  |  Amount: ${formatRupiah(exp.amount)}`,
              margin,
              16.5
            );
            doc.setTextColor(148, 163, 184);
            doc.setFontSize(7);
            doc.text(
              `Excel Attachment ${referenceNo} — Page ${pageNum}`,
              margin,
              pageHeight - 7
            );
          };

          currentPageNum++;
          doc.addPage();
          drawExcelPageHeader(currentPageNum);

          let rowY = 29;
          const rowH = 5.8;

          nonEmptyRows.forEach((row, rowIdx) => {
            if (rowY > pageHeight - 18) {
              currentPageNum++;
              doc.addPage();
              drawExcelPageHeader(currentPageNum);
              rowY = 29;
            }

            const isHeader = rowIdx === 0;
            if (isHeader) {
              doc.setFillColor(226, 232, 240);
              doc.rect(margin, rowY, contentWidth, rowH, 'F');
              doc.setFont('helvetica', 'bold');
              doc.setFontSize(6.8);
              doc.setTextColor(15, 23, 42);
            } else {
              if (rowIdx % 2 === 0) {
                doc.setFillColor(248, 250, 252);
                doc.rect(margin, rowY, contentWidth, rowH, 'F');
              }
              doc.setFont('helvetica', 'normal');
              doc.setFontSize(6.5);
              doc.setTextColor(51, 65, 85);
            }

            const maxChars = Math.max(6, Math.floor(colW / 1.45));
            for (let c = 0; c < colCount; c++) {
              const cellStr = String(row[c] ?? '').replace(/\s+/g, ' ').trim();
              const clipped =
                cellStr.length > maxChars ? cellStr.slice(0, maxChars - 2) + '..' : cellStr;
              doc.text(clipped, margin + c * colW + 1.5, rowY + 4);
            }

            doc.setDrawColor(226, 232, 240);
            doc.line(margin, rowY + rowH, margin + contentWidth, rowY + rowH);
            rowY += rowH;
          });
        }
      } catch (err) {
        console.warn(`Could not render Excel attachment ${receipt.file_name}:`, err);
      }
    }
  }

  const sanitizedRef = referenceNo.replace(/[^a-zA-Z0-9_-]/g, '_');
  doc.save(`Petty_Cash_Report_${sanitizedRef}.pdf`);
}
