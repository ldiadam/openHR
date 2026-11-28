import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { normalizeHexColor } from './themePalette';

export interface EmployeeCardLink {
  type: string;
  label: string;
  value: string;
}

export interface IdCardEmployee {
  id: string;
  nik?: string | null;
  full_name?: string | null;
  job_title?: string | null;
  department_name?: string | null;
  branch_name?: string | null;
  employment_status?: string | null;
  lifecycle_status?: string | null;
  join_date?: string | null;
  level_code?: string | null;
  level_name?: string | null;
  company_email?: string | null;
  phone?: string | null;
  photo_url?: string | null;
  card_uuid?: string | null;
  badge_token?: string | null;
  card_bio?: string | null;
  card_links?: EmployeeCardLink[];
}

export interface IdCardCompany {
  name?: string | null;
  legal_name?: string | null;
  logo_url?: string | null;
  primary_color?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
}

function hexToRgbTuple(hex: string): [number, number, number] {
  const clean = normalizeHexColor(hex).slice(1);
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

async function urlToPngDataUrl(url?: string | null): Promise<{ dataUrl: string; width: number; height: number } | null> {
  if (!url) return null;
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.crossOrigin = 'anonymous';
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Image load failed'));
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
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0);
    return { dataUrl: canvas.toDataURL('image/jpeg', 0.9), width: w, height: h };
  } catch {
    return null;
  }
}

export function buildVerifyBadgeUrl(emp: IdCardEmployee): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  if (emp.card_uuid) {
    return `${origin}/card/${encodeURIComponent(emp.card_uuid)}`;
  }
  const qs = emp.badge_token ? `?token=${encodeURIComponent(emp.badge_token)}` : '';
  return `${origin}/card/${encodeURIComponent(emp.id)}${qs}`;
}

export async function downloadEmployeeIdCardPdf(
  emp: IdCardEmployee,
  company: IdCardCompany,
  photoFetchUrl?: string | null
) {
  // Standard CR80 portrait ID badge dimensions (54mm x 85.6mm)
  const W = 54;
  const H = 85.6;
  const doc = new jsPDF({ unit: 'mm', format: [W, H] });
  const [pr, pg, pb] = hexToRgbTuple(company.primary_color);

  const verifyUrl = buildVerifyBadgeUrl(emp);
  const [qrDataUrl, photoAsset, logoAsset] = await Promise.all([
    QRCode.toDataURL(verifyUrl, { width: 220, margin: 1 }),
    urlToPngDataUrl(photoFetchUrl),
    urlToPngDataUrl(company.logo_url || null),
  ]);

  // --- PAGE 1: FRONT ---
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, W, H, 'F');

  // Header gradient-style solid brand block
  doc.setFillColor(pr, pg, pb);
  doc.rect(0, 0, W, 24, 'F');

  // Lanyard punch hole
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(W / 2 - 5, 2.5, 10, 2.2, 1.1, 1.1, 'F');

  // Company logo + name
  let textStartX = 4.5;
  if (logoAsset) {
    try {
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(4.5, 7, 7, 7, 1.5, 1.5, 'F');
      doc.addImage(logoAsset.dataUrl, 'JPEG', 5, 7.5, 6, 6);
      textStartX = 13;
    } catch {
      // ignore
    }
  }
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  const compLines = doc.splitTextToSize(company.name || 'openHR', W - textStartX - 3.5) as string[];
  doc.text(compLines.slice(0, 2), textStartX, 10.2);

  // Employee Photo Circle/Frame centered overlapping header
  const photoSize = 22;
  const photoX = (W - photoSize) / 2;
  const photoY = 15.5;
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(photoX - 1, photoY - 1, photoSize + 2, photoSize + 2, 4, 4, 'F');
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(photoX, photoY, photoSize, photoSize, 3.5, 3.5, 'F');

  if (photoAsset) {
    try {
      doc.addImage(photoAsset.dataUrl, 'JPEG', photoX, photoY, photoSize, photoSize);
    } catch {
      // fallback below
    }
  } else {
    const initials = (emp.full_name || 'U')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0])
      .join('')
      .toUpperCase();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(pr, pg, pb);
    doc.text(initials, W / 2, photoY + 13.5, { align: 'center' });
  }

  // Name & Role
  let cursorY = 43.5;
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  const nameLines = doc.splitTextToSize(emp.full_name || '-', W - 8) as string[];
  doc.text(nameLines.slice(0, 2), W / 2, cursorY, { align: 'center' });
  cursorY += Math.min(2, nameLines.length) * 3.8 + 1;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(71, 85, 105);
  const roleLines = doc.splitTextToSize(emp.job_title || 'Employee', W - 8) as string[];
  doc.text(roleLines.slice(0, 2), W / 2, cursorY, { align: 'center' });
  cursorY += Math.min(2, roleLines.length) * 3 + 2;

  // Department & NIK pill
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(6, cursorY, W - 12, 8, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(15, 23, 42);
  doc.text(`ID: ${emp.nik || '-'}`, W / 2, cursorY + 3.4, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(100, 116, 139);
  doc.text((emp.department_name || emp.branch_name || '-').slice(0, 28), W / 2, cursorY + 6.6, { align: 'center' });

  // QR Code at bottom
  doc.addImage(qrDataUrl, 'PNG', W / 2 - 8, 65, 16, 16);

  // Bottom bar
  doc.setFillColor(pr, pg, pb);
  doc.rect(0, H - 2.2, W, 2.2, 'F');

  // --- PAGE 2: BACK ---
  doc.addPage([W, H], 'portrait');
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, W, H, 'F');
  doc.setFillColor(pr, pg, pb);
  doc.rect(0, 0, W, 9, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.text('EMPLOYEE IDENTIFICATION', W / 2, 5.8, { align: 'center' });

  let by = 15;
  const fields: Array<[string, string]> = [
    ['NIK / Badge ID', emp.nik || '-'],
    ['Department', emp.department_name || '-'],
    ['Office / Branch', emp.branch_name || '-'],
    ['Status', String(emp.employment_status || 'ACTIVE').toUpperCase()],
    ['Join Date', emp.join_date || '-'],
  ];
  fields.forEach(([lbl, val]) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.5);
    doc.setTextColor(148, 163, 184);
    doc.text(lbl.toUpperCase(), 5, by);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(15, 23, 42);
    doc.text(String(val).slice(0, 32), 5, by + 3.2);
    by += 7.5;
  });

  // QR on back too
  doc.addImage(qrDataUrl, 'PNG', W / 2 - 8.5, 53, 17, 17);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5);
  doc.setTextColor(100, 116, 139);
  const footerText = company.address || company.phone || company.legal_name || company.name || '';
  if (footerText) {
    const fLines = doc.splitTextToSize(`If found, please return to ${company.name || 'Company'}. ${footerText}`, W - 10) as string[];
    doc.text(fLines.slice(0, 3), W / 2, 74, { align: 'center' });
  }

  doc.setFillColor(pr, pg, pb);
  doc.rect(0, H - 2.2, W, 2.2, 'F');

  const safeSlug = String(emp.nik || emp.full_name || 'employee').replace(/[^a-zA-Z0-9_-]+/g, '_');
  doc.save(`ID-Card-${safeSlug}.pdf`);
}
