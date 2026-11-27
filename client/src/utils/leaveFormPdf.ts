import { jsPDF } from 'jspdf';
import {
  DEFAULT_LEAVE_FORM_TEMPLATE,
  LeaveFormTemplateConfig,
  parseLeaveFormTemplate,
} from '../../../shared/formTemplates';

/**
 * Printable leave application, laid out like the paper form it replaces.
 *
 * The letterhead is passed in from the server (resolved from the companies
 * table) — this file never contains an organisation name, address or number.
 */

export interface LeaveFormLetterhead {
  name: string;
  address: string;
  email: string;
  phone: string;
  regNo: string;
  logoUrl?: string | null;
}

export interface LeaveFormApplication {
  reference_no?: string | null;
  submission_date?: string | null;
  submission_date_display?: string | null;
  full_name?: string | null;
  nik?: string | null;
  department_label?: string | null;
  leave_type_label?: string | null;
  leave_type_other_note?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  total_days?: number | null;
  reason?: string | null;

  applicant_signature?: string | null;
  applicant_signed_at?: string | null;

  admin_clash_checks?: string | null;
  admin_other_reason?: string | null;
  admin_checked_at?: string | null;

  dept_head_issues?: string | null;
  dept_head_decision?: string | null;
  dept_head_decided_at?: string | null;

  management_decision?: string | null;
  management_signature?: string | null;
  management_signed_at?: string | null;

  status?: string | null;
}

export interface LeaveFormOptions {
  application: LeaveFormApplication;
  letterhead: LeaveFormLetterhead;
  adminFlags: readonly string[];
  deptHeadFlags: readonly string[];
  /** Department names shown as checkboxes; defaults to the application's own. */
  departments?: string[];
  /** Leave type names shown as checkboxes; defaults to the application's own. */
  leaveTypes?: string[];
  /** Rendered at the bottom of the page. */
  policyNotes?: string[];
  /** Customizable PDF layout/labels template from /api/templates/leave_form. */
  template?: Partial<LeaveFormTemplateConfig> | null;
}

function hexToRgb(hex: string): [number, number, number] {
  const cleaned = (hex || '#141414').replace(/^#/, '');
  if (!/^[0-9A-Fa-f]{6}$/.test(cleaned)) return [20, 20, 20];
  return [
    parseInt(cleaned.slice(0, 2), 16),
    parseInt(cleaned.slice(2, 4), 16),
    parseInt(cleaned.slice(4, 6), 16),
  ];
}

/**
 * Draws one checkbox and its label, advancing across the line.
 *
 * The boxes are vector shapes rather than the ☐/☑ characters: jsPDF's built-in
 * Helvetica is WinAnsi-encoded and has no glyphs for those code points, so
 * measuring them returns the wrong width and neighbouring options overlap.
 * Returns the next x position.
 */
function drawCheckItem(
  doc: jsPDF,
  x: number,
  y: number,
  label: string,
  checked: boolean
): number {
  const boxSize = 2.6;

  doc.setDrawColor(checked ? 30 : 120, checked ? 30 : 120, checked ? 30 : 120);
  doc.setLineWidth(checked ? 0.35 : 0.2);
  doc.rect(x, y - 2.1, boxSize, boxSize);

  if (checked) {
    // A simple tick, drawn so it needs no font support.
    doc.setLineWidth(0.45);
    doc.line(x + 0.55, y - 0.9, x + 1.1, y - 0.35);
    doc.line(x + 1.1, y - 0.35, x + 2.1, y - 1.7);
  }

  doc.setFont('helvetica', checked ? 'bold' : 'normal');
  doc.setFontSize(7.2);
  doc.setTextColor(checked ? 20 : 80, checked ? 20 : 80, checked ? 20 : 80);
  doc.text(label, x + boxSize + 1.4, y);

  return x + boxSize + 1.4 + doc.getTextWidth(label);
}

/**
 * Lays out a wrapped list of checkbox options and returns the y of the last
 * line drawn, so the caller can continue below it.
 */
function drawOptionLines(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  options: readonly string[],
  selected: string | null | undefined
): number {
  let cursorX = x;
  let cursorY = y;

  options.forEach((option) => {
    const checked = option === selected;
    doc.setFont('helvetica', checked ? 'bold' : 'normal');
    doc.setFontSize(7.2);
    const needed = 2.6 + 1.4 + doc.getTextWidth(option);

    if (cursorX > x && cursorX + needed > x + width) {
      cursorX = x;
      cursorY += 4.4;
    }

    const next = drawCheckItem(doc, cursorX, cursorY, option, checked);
    cursorX = next + 4.2;
  });

  return cursorY;
}

/** Draws one full-width row of checkbox options, wrapping as needed. */
function drawCheckboxRow(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  options: readonly string[],
  selected: readonly string[]
) {
  let cursorX = x;
  let cursorY = y;

  options.forEach((option) => {
    const checked = selected.includes(option);
    doc.setFont('helvetica', checked ? 'bold' : 'normal');
    doc.setFontSize(7.2);
    const needed = 2.6 + 1.4 + doc.getTextWidth(option);

    if (cursorX > x && cursorX + needed > x + width) {
      cursorX = x;
      cursorY += 4.6;
    }

    const next = drawCheckItem(doc, cursorX, cursorY, option, checked);
    cursorX = next + 4.2;
  });

  return cursorY;
}

function parseFlagList(raw: unknown): string[] {
  if (typeof raw !== 'string' || !raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function formatDDMMYY(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value.length <= 10 ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getUTCDate())} ${pad(date.getUTCMonth() + 1)} ${String(date.getUTCFullYear()).slice(-2)}`;
}

/** Draws the DD MM YY boxes the paper form uses. */
function drawDateBoxes(doc: jsPDF, x: number, y: number, label: string, iso?: string | null) {
  const parts = formatDDMMYY(iso).split(' ').filter(Boolean);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(60, 60, 60);
  doc.text(label, x, y);

  const startX = x + doc.getTextWidth(label) + 2;
  ['DD', 'MM', 'YY'].forEach((hint, index) => {
    const boxX = startX + index * 8;
    doc.setDrawColor(140, 140, 140);
    doc.setLineWidth(0.2);
    doc.rect(boxX, y - 3.6, 6.6, 5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(20, 20, 20);
    doc.text(parts[index] || '', boxX + 3.3, y, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(4.6);
    doc.setTextColor(150, 150, 150);
    doc.text(hint, boxX + 3.3, y + 2.4, { align: 'center' });
  });
}

export async function generateLeaveFormPdf(options: LeaveFormOptions): Promise<void> {
  const { application: app, letterhead } = options;
  const tpl = options.template ? parseLeaveFormTemplate(options.template as any) : DEFAULT_LEAVE_FORM_TEMPLATE;
  const [ar, ag, ab] = hexToRgb(tpl.accentColor);
  const doc = new jsPDF({ unit: 'mm', format: tpl.paperSize });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  /* ---------- letterhead ---------- */
  if (tpl.showLogo && letterhead.logoUrl) {
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = letterhead.logoUrl as string;
      });
      const maxHeight = 14;
      const ratio = image.width / image.height;
      doc.addImage(image, 'PNG', pageWidth - margin - maxHeight * ratio, y, maxHeight * ratio, maxHeight);
    } catch {
      // A missing logo must never stop the form from printing.
    }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(ar, ag, ab);
  doc.text(letterhead.name || ' ', margin, y + 5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.6);
  doc.setTextColor(90, 90, 90);
  let headerY = y + 9.5;
  if (letterhead.address) {
    doc.text(letterhead.address, margin, headerY);
    headerY += 3.6;
  }
  const contact = [letterhead.email, letterhead.phone].filter(Boolean).join('  |  ');
  if (contact) {
    doc.text(contact, margin, headerY);
    headerY += 3.6;
  }
  if (tpl.showRegNo && letterhead.regNo) {
    doc.text(`Reg. No.: ${letterhead.regNo}`, margin, headerY);
    headerY += 3.6;
  }

  y = Math.max(headerY, 24) + 2;

  doc.setDrawColor(ar, ag, ab);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(ar, ag, ab);
  doc.text(tpl.formTitle, pageWidth / 2, y, { align: 'center' });
  y += 7;

  /* ---------- reference / date ---------- */
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.6);
  doc.setTextColor(30, 30, 30);
  doc.text(`${tpl.referenceLabel} ${app.reference_no || '-'}`, margin, y);
  drawDateBoxes(doc, pageWidth - margin - 55, y, tpl.dateLabel, app.submission_date || app.submission_date_display);
  y += 7;

  /* ---------- applicant ---------- */
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.2);
  doc.line(margin, y - 3, pageWidth - margin, y - 3);

  const nameLine = `${tpl.applicantNameLabel} ${app.full_name || '-'}${app.nik ? `   (${app.nik})` : ''}`;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.2);
  doc.text(nameLine, margin, y + 1);
  y += 7;

  drawDateBoxes(doc, margin, y + 1, tpl.leaveFromLabel, app.start_date);
  drawDateBoxes(doc, margin + 70, y + 1, tpl.leaveToLabel, app.end_date);
  y += 8;

  /* ---------- department ---------- */
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.6);
  doc.setTextColor(40, 40, 40);
  if (tpl.departmentDisplay === 'text') {
    doc.text(`${tpl.departmentLabel} ${app.department_label || '-'}`, margin, y);
    y += 6;
  } else {
    doc.text(tpl.departmentLabel, margin, y);
    const departments = options.departments?.length
      ? options.departments
      : ([app.department_label].filter(Boolean) as string[]);
    y = drawOptionLines(doc, margin, y + 4.2, pageWidth - margin * 2, departments, app.department_label);
    y += 4;
  }

  /* ---------- leave type ---------- */
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.6);
  doc.setTextColor(40, 40, 40);
  if (tpl.leaveTypeDisplay === 'text') {
    doc.text(`${tpl.leaveTypeLabel} ${app.leave_type_label || '-'}`, margin, y);
    y += 5;
  } else {
    doc.text(tpl.leaveTypeLabel, margin, y);
    const leaveTypes = options.leaveTypes?.length
      ? options.leaveTypes
      : ([app.leave_type_label].filter(Boolean) as string[]);
    y = drawOptionLines(doc, margin, y + 4.2, pageWidth - margin * 2, leaveTypes, app.leave_type_label);
    y += 3;
  }

  if (app.leave_type_other_note) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.2);
    doc.setTextColor(90, 90, 90);
    doc.text(`Others: ${app.leave_type_other_note}`, margin, y + 2);
    y += 5;
  }

  if (app.reason) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.4);
    doc.setTextColor(70, 70, 70);
    const reason = doc.splitTextToSize(`${tpl.reasonLabel} ${app.reason}`, contentWidth);
    doc.text(reason, margin, y + 3);
    y += reason.length * 3.6 + 2;
  }

  /* ---------- signature ---------- */
  y += 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(120, 120, 120);
  doc.text(tpl.applicantSignatureLabel, margin, y);

  if (app.applicant_signature) {
    try {
      doc.addImage(app.applicant_signature, 'PNG', margin + 38, y - 9, 40, 15);
    } catch {
      // Ignore an unreadable signature rather than failing the export.
    }
  }
  doc.setDrawColor(160, 160, 160);
  doc.setLineWidth(0.2);
  doc.line(margin + 38, y + 7, margin + 78, y + 7);
  y += 14;

  /* ---------- section 2 header ---------- */
  if (tpl.showAdminCheck || tpl.showDeptHead || tpl.showManagement) {
    y += 2;
    doc.setDrawColor(ar, ag, ab);
    doc.setLineWidth(0.35);
    doc.line(margin, y, pageWidth - margin, y);
    y += 5;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(ar, ag, ab);
    doc.text(tpl.adminSectionTitle, margin, y);
    y += 5.5;
  }

  /* ---------- stage 2 ---------- */
  if (tpl.showAdminCheck) {
    doc.setFontSize(7.4);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(40, 40, 40);
    doc.text(tpl.adminCheckHeading, margin, y);
    y += 4;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.9);
    doc.setTextColor(90, 90, 90);
    doc.text(tpl.adminCheckPrompt, margin, y);
    y += 4;

    const adminFlags = options.adminFlags?.length ? options.adminFlags : tpl.adminClashFlags;
    const adminSelected = parseFlagList(app.admin_clash_checks);
    y = drawCheckboxRow(doc, margin, y, contentWidth, adminFlags, adminSelected);
    y += 4;

    if (app.admin_other_reason) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7);
      doc.setTextColor(90, 90, 90);
      doc.text(`Other reason: ${app.admin_other_reason}`, margin, y);
      y += 4;
    }

    drawDateBoxes(doc, margin, y + 1, tpl.adminCheckedDateLabel, app.admin_checked_at);
    y += 8;
  }

  /* ---------- stage 3 ---------- */
  if (tpl.showDeptHead) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.4);
    doc.setTextColor(40, 40, 40);
    doc.text(tpl.deptHeadHeading, margin, y);
    y += 4;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.9);
    doc.setTextColor(90, 90, 90);
    doc.text(tpl.deptHeadPrompt, margin, y);
    y += 4;

    const deptFlags = options.deptHeadFlags?.length ? options.deptHeadFlags : tpl.deptHeadFlags;
    const headSelected = parseFlagList(app.dept_head_issues);
    y = drawCheckboxRow(doc, margin, y, contentWidth, deptFlags, headSelected);
    y += 4;

    const decisionRendered = String(app.dept_head_decision || '').toUpperCase();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.4);
    const decisionX = drawCheckItem(doc, margin, y, tpl.approvedLabel, decisionRendered === 'APPROVED') + 8;
    drawCheckItem(doc, decisionX, y, tpl.notApprovedLabel, decisionRendered === 'NOT_APPROVED');

    drawDateBoxes(doc, pageWidth - margin - 52, y, tpl.dateLabel, app.dept_head_decided_at);
    y += 9;
  }

  /* ---------- stage 4 ---------- */
  if (tpl.showManagement) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.4);
    doc.setTextColor(40, 40, 40);
    doc.text(tpl.managementHeading, margin, y);
    y += 4;

    const mgmt = String(app.management_decision || '').toUpperCase();
    const mgmtX = drawCheckItem(doc, margin, y, tpl.approvedLabel, mgmt === 'APPROVED') + 8;
    drawCheckItem(doc, mgmtX, y, tpl.notApprovedLabel, mgmt === 'NOT_APPROVED');
    y += 8;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    doc.text(tpl.managementSignatureLabel, margin, y);

    if (app.management_signature) {
      try {
        doc.addImage(app.management_signature, 'PNG', margin + 38, y - 9, 40, 15);
      } catch {
        // Same tolerance as the applicant signature.
      }
    }
    doc.setDrawColor(160, 160, 160);
    doc.line(margin + 38, y + 7, margin + 78, y + 7);

    drawDateBoxes(doc, pageWidth - margin - 52, y, tpl.dateLabel, app.management_signed_at);
    y += 14;
  }

  /* ---------- policy notes ---------- */
  const notes = options.policyNotes !== undefined ? options.policyNotes : tpl.policyNotes;
  if (notes.length > 0) {
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.2);
    doc.line(margin, y, pageWidth - margin, y);
    y += 4;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    doc.setTextColor(60, 60, 60);
    doc.text(tpl.notesHeading, margin, y);
    y += 3.4;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.2);
    doc.setTextColor(90, 90, 90);
    notes.forEach((note, index) => {
      const lines = doc.splitTextToSize(`${index + 1}. ${note}`, contentWidth);
      // Guard against overflowing the page.
      if (y + lines.length * 2.8 > doc.internal.pageSize.getHeight() - margin) return;
      doc.text(lines, margin, y);
      y += lines.length * 2.8 + 0.8;
    });
  }

  const reference = String(app.reference_no || 'LEAVE').replace(/[^a-zA-Z0-9_-]/g, '');
  doc.save(`Leave_Application_${reference}.pdf`);
}

export async function previewSampleLeaveFormPdf(
  template: LeaveFormTemplateConfig,
  letterhead: LeaveFormLetterhead,
  departments: string[] = ['Operations', 'Engineering', 'Finance', 'Human Resources'],
  leaveTypes: string[] = ['Annual Leave', 'Medical Leave', 'Unpaid Leave']
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  await generateLeaveFormPdf({
    application: {
      reference_no: 'LV-2026-SAMPLE',
      submission_date: today,
      full_name: 'Budi Santoso',
      nik: 'EMP001',
      department_label: departments[0] || 'Operations',
      leave_type_label: leaveTypes[0] || 'Annual Leave',
      start_date: today,
      end_date: today,
      total_days: 1,
      reason: 'Sample annual leave request for template layout preview.',
      admin_clash_checks: JSON.stringify(template.adminClashFlags.slice(0, 1)),
      admin_checked_at: today,
      dept_head_issues: JSON.stringify([]),
      dept_head_decision: 'APPROVED',
      dept_head_decided_at: today,
      management_decision: 'APPROVED',
      management_signed_at: today,
      status: 'approved',
    },
    letterhead,
    adminFlags: template.adminClashFlags,
    deptHeadFlags: template.deptHeadFlags,
    departments,
    leaveTypes,
    template,
    policyNotes: template.policyNotes,
  });
}
