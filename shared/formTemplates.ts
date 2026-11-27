export type FormTemplateKey = 'claim_sheet' | 'leave_form';
export type FormTemplateMode = 'builder' | 'custom_xlsx';

export type ClaimColumnType =
  | 'seq'
  | 'date'
  | 'description'
  | 'category_bucket'
  | 'unpaid_salary'
  | 'row_total'
  | 'other_bucket'
  | 'cost_centre'
  | 'project_ref'
  | 'remarks'
  | 'category_label'
  | 'amount';

export interface ClaimSheetColumn {
  id: string;
  header: string;
  type: ClaimColumnType;
  visible: boolean;
  width: number;
  align?: 'left' | 'center' | 'right';
  keywords?: string[];
}

export type ClaimSignatureSource = 'applicant' | 'manager' | 'director' | 'custom';

export interface ClaimSheetSignature {
  id: string;
  label: string;
  source: ClaimSignatureSource;
  customName?: string;
}

export interface ClaimSheetTemplateConfig {
  sheetName: string;
  titlePattern: string;
  subtitleLabel: string;
  currencyLabel: string;
  currencySymbol: string;
  numberFormat: string;
  headerFillColor: string;
  headerFontColor: string;
  totalFillColor: string;
  totalFontColor: string;
  dataFontColor: string;
  totalSumLabel: string;
  grandTotalLabel: string;
  includeSalaryRow: boolean;
  salaryDescriptionPattern: string;
  includeAttendanceSheet: boolean;
  attendanceSheetName: string;
  columns: ClaimSheetColumn[];
  signatures: ClaimSheetSignature[];
}

export interface LeaveFormTemplateConfig {
  paperSize: 'a4' | 'letter';
  accentColor: string;
  showLogo: boolean;
  showRegNo: boolean;
  formTitle: string;
  referenceLabel: string;
  dateLabel: string;
  applicantNameLabel: string;
  leaveFromLabel: string;
  leaveToLabel: string;
  departmentLabel: string;
  departmentDisplay: 'checkboxes' | 'text';
  leaveTypeLabel: string;
  leaveTypeDisplay: 'checkboxes' | 'text';
  reasonLabel: string;
  applicantSignatureLabel: string;
  adminSectionTitle: string;
  showAdminCheck: boolean;
  adminCheckHeading: string;
  adminCheckPrompt: string;
  adminCheckedDateLabel: string;
  adminClashFlags: string[];
  showDeptHead: boolean;
  deptHeadHeading: string;
  deptHeadPrompt: string;
  deptHeadFlags: string[];
  approvedLabel: string;
  notApprovedLabel: string;
  showManagement: boolean;
  managementHeading: string;
  managementSignatureLabel: string;
  notesHeading: string;
  policyNotes: string[];
}

export const DEFAULT_ADMIN_CLASH_FLAGS: string[] = [
  'Approved Annual Leave',
  'Reservist Training',
  'Medical Leave',
  'Service Time Off',
  'Unauthorized Application',
  'Excess Quota',
  'Other reason',
];

export const DEFAULT_DEPT_HEAD_FLAGS: string[] = [
  'Shortage of Manpower',
  'Important / Urgent Schedule due for completion',
  'Clashes with another colleague leave approval',
];

export const DEFAULT_LEAVE_POLICY_NOTES: string[] = [
  'This form must be signed by the applicant before it is processed.',
  "Copies of this form may not be duplicated without the Administrator's permission.",
  'The administrative check must be completed before the Department Head reviews.',
  'The Department Head cannot approve before the administrative check is complete.',
  'The applicant must be notified of the final outcome within 1 working day.',
  'Management may cancel or override any departmental decision.',
  'Leave is not officially confirmed until Management approval is complete.',
];

export const DEFAULT_CLAIM_SHEET_COLUMNS: ClaimSheetColumn[] = [
  { id: 'col_no', header: 'No', type: 'seq', visible: true, width: 5, align: 'center' },
  { id: 'col_date', header: 'DATE', type: 'date', visible: true, width: 13, align: 'left' },
  { id: 'col_desc', header: 'DESCRIPTION', type: 'description', visible: true, width: 36, align: 'left' },
  {
    id: 'col_transport',
    header: 'Transport',
    type: 'category_bucket',
    visible: true,
    width: 16,
    align: 'left',
    keywords: ['transport', 'bensin', 'tiket', 'ferry', 'travel'],
  },
  {
    id: 'col_food',
    header: 'Food',
    type: 'category_bucket',
    visible: true,
    width: 16,
    align: 'left',
    keywords: ['food', 'makan', 'meal', 'konsumsi'],
  },
  {
    id: 'col_hotel',
    header: 'Hotel',
    type: 'category_bucket',
    visible: true,
    width: 16,
    align: 'left',
    keywords: ['hotel', 'lodging', 'penginapan'],
  },
  {
    id: 'col_unpaid',
    header: 'UNPAID',
    type: 'unpaid_salary',
    visible: true,
    width: 15,
    align: 'left',
    keywords: ['unpaid', 'salary', 'gaji'],
  },
  { id: 'col_total', header: 'TOTAL', type: 'row_total', visible: true, width: 18, align: 'left' },
  { id: 'col_others', header: 'OTHERS ', type: 'other_bucket', visible: true, width: 16, align: 'left' },
  { id: 'col_cc', header: 'COST CENTRE', type: 'cost_centre', visible: true, width: 17, align: 'left' },
  { id: 'col_proj', header: 'PROJECT REF', type: 'project_ref', visible: true, width: 16, align: 'left' },
  { id: 'col_rem', header: 'REMARKS', type: 'remarks', visible: true, width: 53, align: 'left' },
];

export const DEFAULT_CLAIM_SHEET_TEMPLATE: ClaimSheetTemplateConfig = {
  sheetName: 'Claim_1',
  titlePattern: '{{company_name}} {{year}} {{month_name}} EXPENSES.',
  subtitleLabel: 'CLAIMS',
  currencyLabel: 'Currency : IDR',
  currencySymbol: 'Rp',
  numberFormat: '_-[$Rp-3809]* #,##0_-;\\-[$Rp-3809]* #,##0_-;_-[$Rp-3809]* "-"??_-;_-@_-',
  headerFillColor: 'FFFF00',
  headerFontColor: '002060',
  totalFillColor: 'FFFF00',
  totalFontColor: '003366',
  dataFontColor: '003366',
  totalSumLabel: 'Total Sum',
  grandTotalLabel: 'Grand total',
  includeSalaryRow: true,
  salaryDescriptionPattern: 'Salary {{employee_name}}',
  includeAttendanceSheet: true,
  attendanceSheetName: 'Attendance',
  columns: DEFAULT_CLAIM_SHEET_COLUMNS.map((c) => ({ ...c, keywords: c.keywords ? [...c.keywords] : undefined })),
  signatures: [
    { id: 'sig_prepared', label: 'PREPARED BY', source: 'applicant' },
    { id: 'sig_checked', label: 'CHECKED BY', source: 'manager' },
    { id: 'sig_approved', label: 'APPROVED BY', source: 'director' },
  ],
};

export const DEFAULT_LEAVE_FORM_TEMPLATE: LeaveFormTemplateConfig = {
  paperSize: 'a4',
  accentColor: '#141414',
  showLogo: true,
  showRegNo: true,
  formTitle: 'LEAVE APPLICATION FORM',
  referenceLabel: 'Application Reference No.:',
  dateLabel: 'Date:',
  applicantNameLabel: 'Applicant Name:',
  leaveFromLabel: 'Apply Leave Date From:',
  leaveToLabel: 'To:',
  departmentLabel: 'Department:',
  departmentDisplay: 'checkboxes',
  leaveTypeLabel: 'Type of Leave:',
  leaveTypeDisplay: 'checkboxes',
  reasonLabel: 'Reason:',
  applicantSignatureLabel: "Applicant's Signature:",
  adminSectionTitle: 'For Administrative / Approval Use',
  showAdminCheck: true,
  adminCheckHeading: 'Administrative Check',
  adminCheckPrompt: 'Please tick if there is any clashes with colleagues:',
  adminCheckedDateLabel: 'Checked by Administrator on:',
  adminClashFlags: [...DEFAULT_ADMIN_CLASH_FLAGS],
  showDeptHead: true,
  deptHeadHeading: 'Department Head',
  deptHeadPrompt: 'Please check if there is Issue with:',
  deptHeadFlags: [...DEFAULT_DEPT_HEAD_FLAGS],
  approvedLabel: 'Approved',
  notApprovedLabel: 'Not Approved',
  showManagement: true,
  managementHeading: 'Management',
  managementSignatureLabel: 'Management Signature:',
  notesHeading: 'Notes:',
  policyNotes: [...DEFAULT_LEAVE_POLICY_NOTES],
};

export const CLAIM_TEMPLATE_PLACEHOLDERS = [
  '{{company_name}}',
  '{{year}}',
  '{{month}}',
  '{{month_name}}',
  '{{period_label}}',
  '{{employee_name}}',
  '{{employee_nik}}',
  '{{job_title}}',
  '{{department}}',
  '{{prepared_by}}',
  '{{checked_by}}',
  '{{approved_by}}',
  '{{claim_count}}',
  '{{grand_total}}',
  '{{#claims}}',
  '{{no}}',
  '{{date}}',
  '{{description}}',
  '{{category}}',
  '{{amount}}',
  '{{cat:transport}}',
  '{{cat:food}}',
  '{{cat:hotel}}',
  '{{cat:unpaid}}',
  '{{cat:others}}',
  '{{cost_centre}}',
  '{{project_ref}}',
  '{{remarks}}',
] as const;

function sanitizeHex6(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  const cleaned = raw.trim().replace(/^#/, '').toUpperCase();
  return /^[0-9A-F]{6}$/.test(cleaned) ? cleaned : fallback;
}

function sanitizeHexHash(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  const cleaned = raw.trim().replace(/^#/, '');
  return /^[0-9A-Fa-f]{6}$/.test(cleaned) ? `#${cleaned.toUpperCase()}` : fallback;
}

function sanitizeStr(raw: unknown, fallback: string, maxLen = 120): string {
  if (typeof raw !== 'string') return fallback;
  const trimmed = raw.trim();
  return trimmed ? trimmed.slice(0, maxLen) : fallback;
}

function sanitizeRawStr(raw: unknown, fallback: string, maxLen = 120): string {
  if (typeof raw !== 'string') return fallback;
  return raw.length > 0 ? raw.slice(0, maxLen) : fallback;
}

function sanitizeSheetName(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  const cleaned = raw.replace(/[\\/?*[\]:]/g, '').trim().slice(0, 31);
  return cleaned || fallback;
}

const VALID_COLUMN_TYPES = new Set<ClaimColumnType>([
  'seq',
  'date',
  'description',
  'category_bucket',
  'unpaid_salary',
  'row_total',
  'other_bucket',
  'cost_centre',
  'project_ref',
  'remarks',
  'category_label',
  'amount',
]);

export function buildCurrencyNumberFormat(symbol: string): string {
  const safe = (symbol || 'Rp').replace(/["$]/g, '').trim() || 'Rp';
  if (safe === 'Rp') return DEFAULT_CLAIM_SHEET_TEMPLATE.numberFormat;
  return `"${safe}" #,##0;-"${safe}" #,##0;"-"`;
}

export function parseClaimSheetTemplate(
  raw?: string | Record<string, unknown> | null,
  legacyModules?: {
    template_currency_symbol?: string;
    template_prepared_by?: string;
    template_checked_by?: string;
    template_approved_by?: string;
  }
): ClaimSheetTemplateConfig {
  const base = structuredClone(DEFAULT_CLAIM_SHEET_TEMPLATE);
  if (legacyModules) {
    if (legacyModules.template_currency_symbol?.trim()) {
      const sym = legacyModules.template_currency_symbol.trim().slice(0, 12);
      base.currencySymbol = sym;
      if (sym !== 'Rp') {
        base.currencyLabel = `Currency : ${sym}`;
        base.numberFormat = buildCurrencyNumberFormat(sym);
      }
    }
    if (legacyModules.template_prepared_by?.trim()) {
      base.signatures[0].label = legacyModules.template_prepared_by.trim().slice(0, 40);
    }
    if (legacyModules.template_checked_by?.trim()) {
      base.signatures[1].label = legacyModules.template_checked_by.trim().slice(0, 40);
    }
    if (legacyModules.template_approved_by?.trim()) {
      base.signatures[2].label = legacyModules.template_approved_by.trim().slice(0, 40);
    }
  }

  if (!raw) return base;
  let parsed: any = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return base;
    }
  }
  if (!parsed || typeof parsed !== 'object') return base;

  const columns: ClaimSheetColumn[] = Array.isArray(parsed.columns)
    ? parsed.columns
        .map((c: any, idx: number): ClaimSheetColumn | null => {
          if (!c || typeof c !== 'object') return null;
          const type: ClaimColumnType = VALID_COLUMN_TYPES.has(c.type) ? c.type : 'remarks';
          const widthNum = Number(c.width);
          const align = c.align === 'center' || c.align === 'right' ? c.align : 'left';
          const keywords = Array.isArray(c.keywords)
            ? c.keywords.map((k: any) => String(k || '').trim().toLowerCase()).filter(Boolean).slice(0, 20)
            : undefined;
          return {
            id: sanitizeStr(c.id, `col_${idx + 1}`, 40),
            header: sanitizeRawStr(c.header, `Column ${idx + 1}`, 40),
            type,
            visible: c.visible !== false,
            width: Number.isFinite(widthNum) ? Math.min(80, Math.max(4, Math.round(widthNum))) : 16,
            align,
            ...(keywords ? { keywords } : {}),
          };
        })
        .filter((c: ClaimSheetColumn | null): c is ClaimSheetColumn => Boolean(c))
        .slice(0, 24)
    : [];

  const signatures: ClaimSheetSignature[] = Array.isArray(parsed.signatures)
    ? parsed.signatures
        .map((s: any, idx: number): ClaimSheetSignature | null => {
          if (!s || typeof s !== 'object') return null;
          const source: ClaimSignatureSource =
            s.source === 'applicant' || s.source === 'manager' || s.source === 'director' || s.source === 'custom'
              ? s.source
              : 'custom';
          return {
            id: sanitizeStr(s.id, `sig_${idx + 1}`, 40),
            label: sanitizeStr(s.label, `SIGNATURE ${idx + 1}`, 40),
            source,
            ...(source === 'custom' && typeof s.customName === 'string'
              ? { customName: s.customName.trim().slice(0, 80) }
              : {}),
          };
        })
        .filter((s: ClaimSheetSignature | null): s is ClaimSheetSignature => Boolean(s))
        .slice(0, 8)
    : [];

  const sym = sanitizeStr(parsed.currencySymbol, base.currencySymbol, 12);

  return {
    sheetName: sanitizeSheetName(parsed.sheetName, base.sheetName),
    titlePattern: sanitizeStr(parsed.titlePattern, base.titlePattern, 160),
    subtitleLabel: sanitizeStr(parsed.subtitleLabel, base.subtitleLabel, 40),
    currencyLabel: sanitizeStr(parsed.currencyLabel, base.currencyLabel, 40),
    currencySymbol: sym,
    numberFormat: sanitizeStr(parsed.numberFormat, base.numberFormat, 120),
    headerFillColor: sanitizeHex6(parsed.headerFillColor, base.headerFillColor),
    headerFontColor: sanitizeHex6(parsed.headerFontColor, base.headerFontColor),
    totalFillColor: sanitizeHex6(parsed.totalFillColor, base.totalFillColor),
    totalFontColor: sanitizeHex6(parsed.totalFontColor, base.totalFontColor),
    dataFontColor: sanitizeHex6(parsed.dataFontColor, base.dataFontColor),
    totalSumLabel: sanitizeStr(parsed.totalSumLabel, base.totalSumLabel, 40),
    grandTotalLabel: sanitizeStr(parsed.grandTotalLabel, base.grandTotalLabel, 40),
    includeSalaryRow: parsed.includeSalaryRow !== false,
    salaryDescriptionPattern: sanitizeStr(parsed.salaryDescriptionPattern, base.salaryDescriptionPattern, 120),
    includeAttendanceSheet: parsed.includeAttendanceSheet !== false,
    attendanceSheetName: sanitizeSheetName(parsed.attendanceSheetName, base.attendanceSheetName),
    columns: columns.length > 0 ? columns : base.columns,
    signatures: signatures.length > 0 ? signatures : base.signatures,
  };
}

function sanitizeStringList(raw: unknown, fallback: string[], maxItems = 20, maxLen = 200): string[] {
  if (!Array.isArray(raw)) return [...fallback];
  const cleaned = raw
    .map((item) => (typeof item === 'string' ? item.trim().slice(0, maxLen) : ''))
    .filter(Boolean)
    .slice(0, maxItems);
  return cleaned;
}

export function parseLeaveFormTemplate(raw?: string | Record<string, unknown> | null): LeaveFormTemplateConfig {
  const base = structuredClone(DEFAULT_LEAVE_FORM_TEMPLATE);
  if (!raw) return base;
  let parsed: any = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return base;
    }
  }
  if (!parsed || typeof parsed !== 'object') return base;

  return {
    paperSize: parsed.paperSize === 'letter' ? 'letter' : 'a4',
    accentColor: sanitizeHexHash(parsed.accentColor, base.accentColor),
    showLogo: parsed.showLogo !== false,
    showRegNo: parsed.showRegNo !== false,
    formTitle: sanitizeStr(parsed.formTitle, base.formTitle, 100),
    referenceLabel: sanitizeStr(parsed.referenceLabel, base.referenceLabel, 80),
    dateLabel: sanitizeStr(parsed.dateLabel, base.dateLabel, 40),
    applicantNameLabel: sanitizeStr(parsed.applicantNameLabel, base.applicantNameLabel, 60),
    leaveFromLabel: sanitizeStr(parsed.leaveFromLabel, base.leaveFromLabel, 60),
    leaveToLabel: sanitizeStr(parsed.leaveToLabel, base.leaveToLabel, 40),
    departmentLabel: sanitizeStr(parsed.departmentLabel, base.departmentLabel, 60),
    departmentDisplay: parsed.departmentDisplay === 'text' ? 'text' : 'checkboxes',
    leaveTypeLabel: sanitizeStr(parsed.leaveTypeLabel, base.leaveTypeLabel, 60),
    leaveTypeDisplay: parsed.leaveTypeDisplay === 'text' ? 'text' : 'checkboxes',
    reasonLabel: sanitizeStr(parsed.reasonLabel, base.reasonLabel, 60),
    applicantSignatureLabel: sanitizeStr(parsed.applicantSignatureLabel, base.applicantSignatureLabel, 60),
    adminSectionTitle: sanitizeStr(parsed.adminSectionTitle, base.adminSectionTitle, 80),
    showAdminCheck: parsed.showAdminCheck !== false,
    adminCheckHeading: sanitizeStr(parsed.adminCheckHeading, base.adminCheckHeading, 60),
    adminCheckPrompt: sanitizeStr(parsed.adminCheckPrompt, base.adminCheckPrompt, 120),
    adminCheckedDateLabel: sanitizeStr(parsed.adminCheckedDateLabel, base.adminCheckedDateLabel, 80),
    adminClashFlags: sanitizeStringList(parsed.adminClashFlags, base.adminClashFlags, 20, 80),
    showDeptHead: parsed.showDeptHead !== false,
    deptHeadHeading: sanitizeStr(parsed.deptHeadHeading, base.deptHeadHeading, 60),
    deptHeadPrompt: sanitizeStr(parsed.deptHeadPrompt, base.deptHeadPrompt, 120),
    deptHeadFlags: sanitizeStringList(parsed.deptHeadFlags, base.deptHeadFlags, 20, 100),
    approvedLabel: sanitizeStr(parsed.approvedLabel, base.approvedLabel, 40),
    notApprovedLabel: sanitizeStr(parsed.notApprovedLabel, base.notApprovedLabel, 40),
    showManagement: parsed.showManagement !== false,
    managementHeading: sanitizeStr(parsed.managementHeading, base.managementHeading, 60),
    managementSignatureLabel: sanitizeStr(parsed.managementSignatureLabel, base.managementSignatureLabel, 60),
    notesHeading: sanitizeStr(parsed.notesHeading, base.notesHeading, 40),
    policyNotes: Array.isArray(parsed.policyNotes)
      ? sanitizeStringList(parsed.policyNotes, [], 15, 240)
      : [...base.policyNotes],
  };
}
