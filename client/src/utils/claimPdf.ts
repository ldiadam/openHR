import { jsPDF } from 'jspdf';

export interface ClaimItemForPdf {
  id: string;
  no: number;
  date: string;
  description: string;
  category: string;
  amount: number;
  remarks?: string;
  receipt_photo_key?: string | null;
  receipt_url?: string | null;
  receipt_photo_base64?: string | null;
  status: string;
}

export interface ClaimPdfOptions {
  companyName: string;
  periodTitle: string;
  employeeName: string;
  employeeNik?: string;
  approverName?: string;
  claims: ClaimItemForPdf[];
}

/**
 * Loads an image from a URL or base64 data and returns an HTMLImageElement with dimensions
 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error('Gagal memuat gambar bukti struk: ' + e));
    img.src = src;
  });
}

/**
 * Generates a consolidated PDF containing:
 * Page 1: Claim Summary & Metadata Table & Signatures
 * Page 2..N: Each receipt attached on its own page with description and amount header
 */
export async function generateCombinedReceiptsPdf(options: ClaimPdfOptions): Promise<void> {
  const {
    companyName = 'openHR',
    periodTitle = 'Current Period',
    employeeName = '-',
    employeeNik = '-',
    approverName = 'Director',
    claims = [],
  } = options;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 16;
  const contentWidth = pageWidth - margin * 2;

  // ================= PAGE 1: COVER & CLAIMS SUMMARY =================
  // Header Banner
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, pageWidth, 32, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text((companyName || 'openHR').toUpperCase(), margin, 13);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(203, 213, 225); // slate-300
  doc.text(`EXPENSE CLAIMS & RECEIPTS SUMMARY — ${periodTitle}`, margin, 21);

  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184); // slate-400
  doc.text(`Dicetak pada: ${new Date().toLocaleDateString('id-ID', { dateStyle: 'full' })}`, margin, 27);

  // Metadata Card
  let curY = 40;
  doc.setFillColor(248, 250, 252); // slate-50
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.roundedRect(margin, curY, contentWidth, 22, 2, 2, 'FD');

  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139); // slate-500
  doc.text('NAMA KARYAWAN', margin + 4, curY + 6);
  doc.text('NIK / ID', margin + 65, curY + 6);
  doc.text('PERIODE KLAIM', margin + 115, curY + 6);

  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text(employeeName, margin + 4, curY + 14);
  doc.text(employeeNik || '-', margin + 65, curY + 14);
  doc.text(periodTitle, margin + 115, curY + 14);

  curY += 28;

  // Table Title
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text('DAFTAR KLAIM BIAYA (APPROVED CLAIMS)', margin, curY);

  curY += 4;

  // Table Header
  const colX = {
    no: margin,
    date: margin + 10,
    desc: margin + 34,
    cat: margin + 102,
    amount: margin + 140,
    receipt: margin + 166,
  };

  doc.setFillColor(241, 245, 249); // slate-100
  doc.rect(margin, curY, contentWidth, 7, 'F');
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(51, 65, 85);

  doc.text('NO', colX.no + 2, curY + 5);
  doc.text('TANGGAL', colX.date, curY + 5);
  doc.text('DESKRIPSI', colX.desc, curY + 5);
  doc.text('KATEGORI', colX.cat, curY + 5);
  doc.text('NOMINAL (RP)', colX.amount, curY + 5);
  doc.text('STRUK', colX.receipt, curY + 5);

  curY += 8;

  let totalAmount = 0;
  let receiptCount = 0;

  claims.forEach((cl, idx) => {
    totalAmount += cl.amount || 0;
    const hasReceipt = Boolean(cl.receipt_photo_key || cl.receipt_url || cl.receipt_photo_base64);
    if (hasReceipt) receiptCount++;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(30, 41, 59);

    // Zebra striping
    if (idx % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, curY - 1, contentWidth, 6.5, 'F');
    }

    doc.text(String(idx + 1), colX.no + 2, curY + 3.5);
    doc.text(String(cl.date || '-'), colX.date, curY + 3.5);

    // Truncate description if too long
    const cleanDesc = (cl.description || '-').length > 34 ? (cl.description || '').slice(0, 32) + '..' : cl.description || '-';
    doc.text(cleanDesc, colX.desc, curY + 3.5);

    doc.text(String(cl.category || '-'), colX.cat, curY + 3.5);

    const formattedAmt = (cl.amount || 0).toLocaleString('id-ID');
    doc.text(formattedAmt, colX.amount, curY + 3.5);

    if (hasReceipt) {
      doc.setTextColor(16, 185, 129); // emerald-600
      doc.text('✓ Terlampir', colX.receipt, curY + 3.5);
    } else {
      doc.setTextColor(148, 163, 184); // slate-400
      doc.text('- Tidak ada', colX.receipt, curY + 3.5);
    }

    curY += 6.5;
  });

  // Total Summary Row
  curY += 2;
  doc.setFillColor(254, 240, 138); // yellow-200 matching template
  doc.setDrawColor(250, 204, 21); // yellow-400
  doc.rect(margin, curY, contentWidth, 8, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(113, 63, 18); // yellow-900
  doc.text('TOTAL KLAIM (GRAND TOTAL)', margin + 4, curY + 5.5);
  doc.text(`Rp ${totalAmount.toLocaleString('id-ID')}`, colX.amount - 2, curY + 5.5);
  doc.text(`${receiptCount} Struk`, colX.receipt, curY + 5.5);

  curY += 18;

  // Signatures Section
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);

  const sigY = curY;
  const sigCol1 = margin + 10;
  const sigCol2 = margin + 70;
  const sigCol3 = margin + 130;

  doc.text('Dibuat oleh (PREPARED BY):', sigCol1, sigY);
  doc.text('Diperiksa oleh (CHECKED BY):', sigCol2, sigY);
  doc.text('Disetujui oleh (APPROVED BY):', sigCol3, sigY);

  doc.setDrawColor(203, 213, 225);
  doc.line(sigCol1, sigY + 22, sigCol1 + 45, sigY + 22);
  doc.line(sigCol2, sigY + 22, sigCol2 + 45, sigY + 22);
  doc.line(sigCol3, sigY + 22, sigCol3 + 45, sigY + 22);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(employeeName, sigCol1, sigY + 26);
  doc.text('-', sigCol2, sigY + 26);
  doc.text(approverName || 'Director', sigCol3, sigY + 26);

  // Footer for Page 1
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  doc.text(`Halaman 1 — Dokumen Resmi openHR ${companyName}`, margin, pageHeight - 10);

  // ================= SUBSEQUENT PAGES: ATTACHED RECEIPT PHOTOS =================
  let receiptPageNum = 1;

  for (let i = 0; i < claims.length; i++) {
    const cl = claims[i];
    const imgSrc = cl.receipt_photo_base64 || cl.receipt_url;

    if (!imgSrc) continue;

    receiptPageNum++;
    doc.addPage();

    // Top Card for this Claim Item
    doc.setFillColor(15, 23, 42); // slate-900
    doc.rect(0, 0, pageWidth, 26, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(`BUKTI STRUK #${cl.no || i + 1} — ${cl.description || 'Klaim Biaya'}`, margin, 11);

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(203, 213, 225);
    doc.text(
      `Tanggal: ${cl.date || '-'} | Kategori: ${cl.category} | Nominal: Rp ${(cl.amount || 0).toLocaleString('id-ID')}`,
      margin,
      18
    );

    if (cl.remarks) {
      doc.setFontSize(7.5);
      doc.setTextColor(250, 204, 21); // yellow-400
      doc.text(`Catatan / Remarks: ${cl.remarks}`, margin, 23);
    }

    // Load & Render Receipt Image
    try {
      const img = await loadImage(imgSrc);

      const maxImgW = contentWidth; // 178 mm
      const maxImgH = 220; // 220 mm
      const imgAspect = img.naturalWidth / img.naturalHeight;

      let drawW = maxImgW;
      let drawH = drawW / imgAspect;

      if (drawH > maxImgH) {
        drawH = maxImgH;
        drawW = drawH * imgAspect;
      }

      const imgX = margin + (contentWidth - drawW) / 2;
      const imgY = 36 + (maxImgH - drawH) / 2;

      // Draw subtle background container for image
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(imgX - 2, imgY - 2, drawW + 4, drawH + 4, 2, 2, 'FD');

      doc.addImage(img, 'JPEG', imgX, imgY, drawW, drawH);
    } catch (err: any) {
      console.warn('Gagal memuat gambar struk:', err.message);
      doc.setTextColor(225, 29, 72);
      doc.setFontSize(10);
      doc.text('Foto struk tidak dapat dimuat atau format tidak didukung.', margin, 60);
    }

    // Page Footer
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Lampiran Struk Klaim #${cl.no || i + 1} — ${companyName} — Halaman ${receiptPageNum}`,
      margin,
      pageHeight - 10
    );
  }

  // Save the generated PDF
  const filename = `Bukti_Struk_Klaim_${periodTitle.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
  doc.save(filename);
}
