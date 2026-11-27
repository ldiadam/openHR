export type ToggleableModuleId =
  | 'attendance'
  | 'leave'
  | 'shifts'
  | 'payroll'
  | 'claims'
  | 'petty_cash'
  | 'tasks'
  | 'announcements'
  | 'assets'
  | 'offboarding'
  | 'performance'
  | 'recruitment'
  | 'signing'
  | 'reports';

export type LeaveWorkflowMode = 'three_stage' | 'simple';
export type TaskReferencePreset = 'none' | 'project' | 'maritime' | 'custom';

export const TASK_REFERENCE_PRESETS: Record<Exclude<TaskReferencePreset, 'custom'>, string[]> = {
  none: [],
  project: ['Client', 'Project / Job Code'],
  maritime: ['Vessel Name', 'Company Name', 'IMO', 'Call Sign'],
};

export interface ModulesConfig {
  attendance: boolean;
  leave: boolean;
  shifts: boolean;
  payroll: boolean;
  claims: boolean;
  petty_cash: boolean;
  tasks: boolean;
  announcements: boolean;
  assets: boolean;
  offboarding: boolean;
  performance: boolean;
  recruitment: boolean;
  signing: boolean;
  reports: boolean;
  leave_workflow: LeaveWorkflowMode;
  task_reference_preset: TaskReferencePreset;
  task_reference_fields: string[];
  template_currency_symbol: string;
  template_prepared_by: string;
  template_checked_by: string;
  template_approved_by: string;
}

export interface ModuleDefinition {
  id: ToggleableModuleId;
  nameId: string;
  nameEn: string;
  descId: string;
  descEn: string;
  defaultEnabled: boolean;
  requiresExternalCreds?: string;
}

export const MODULE_DEFINITIONS: ModuleDefinition[] = [
  {
    id: 'attendance',
    nameId: 'Presensi & GPS',
    nameEn: 'Attendance & GPS',
    descId: 'Clock-in/out selfie, geofence kantor, dan koreksi kehadiran.',
    descEn: 'Selfie clock-in/out, office geofencing, and attendance corrections.',
    defaultEnabled: true,
  },
  {
    id: 'leave',
    nameId: 'Cuti & Izin',
    nameEn: 'Leave & Absence',
    descId: 'Pengajuan cuti, saldo cuti tahunan, hari libur, dan persetujuan.',
    descEn: 'Leave requests, annual balances, holidays, and approvals.',
    defaultEnabled: true,
  },
  {
    id: 'shifts',
    nameId: 'Shift & Jadwal',
    nameEn: 'Shifts & Schedules',
    descId: 'Pola jam kerja dan penugasan jadwal karyawan.',
    descEn: 'Working hour patterns and employee shift assignments.',
    defaultEnabled: true,
  },
  {
    id: 'payroll',
    nameId: 'Penggajian (Payroll)',
    nameEn: 'Payroll & Payslips',
    descId: 'Kalkulasi gaji, BPJS, PPh 21 TER, THR, dan slip gaji PDF.',
    descEn: 'Salary runs, BPJS, PPh 21 TER, THR, and PDF payslips.',
    defaultEnabled: true,
  },
  {
    id: 'claims',
    nameId: 'Klaim Biaya & Kasbon',
    nameEn: 'Expense Claims & Kasbon',
    descId: 'Reimbursement, kasbon karyawan, dan ekspor Claim Sheet Excel/PDF.',
    descEn: 'Reimbursements, employee loans, and Claim Sheet Excel/PDF exports.',
    defaultEnabled: true,
  },
  {
    id: 'petty_cash',
    nameId: 'Petty Cash Bulanan',
    nameEn: 'Monthly Petty Cash',
    descId: 'Dana operasional, catat pengeluaran, lampiran Excel, dan laporan PDF + QR.',
    descEn: 'Operational float, expense tracking, Excel attachments, and QR-verified PDF.',
    defaultEnabled: true,
  },
  {
    id: 'tasks',
    nameId: 'Tugas & Alur Kerja (TMS)',
    nameEn: 'Tasks & Workflow (TMS)',
    descId: 'Penugasan tugas, serah-terima, penjadwalan ulang, eskalasi pengingat, dan persetujuan.',
    descEn: 'Task assignments, handovers, rescheduling, reminder escalations, and approvals.',
    defaultEnabled: true,
  },
  {
    id: 'announcements',
    nameId: 'Pengumuman & Kebijakan',
    nameEn: 'Announcements & Policies',
    descId: 'Memo perusahaan, dokumen SOP/kebijakan, dan pelacakan konfirmasi baca karyawan.',
    descEn: 'Company memos, SOP/policy documents, and employee read-acknowledgment tracking.',
    defaultEnabled: true,
  },
  {
    id: 'assets',
    nameId: 'Aset & Inventaris',
    nameEn: 'Asset & Inventory',
    descId: 'Pelacakan laptop, ponsel, kunci, dan perlengkapan kerja yang dipinjamkan ke karyawan.',
    descEn: 'Track company laptops, phones, access cards, and equipment assigned to staff.',
    defaultEnabled: true,
  },
  {
    id: 'offboarding',
    nameId: 'Offboarding & Clearance',
    nameEn: 'Offboarding & Clearance',
    descId: 'Alur keluar karyawan, cek pengembalian aset, tugas terbuka, kasbon, dan wawancara keluar.',
    descEn: 'Structured exit workflow checking unreturned assets, open tasks, and kasbon balance.',
    defaultEnabled: true,
  },
  {
    id: 'performance',
    nameId: 'Kinerja & Penilaian (KPI)',
    nameEn: 'Performance & Appraisals',
    descId: 'Siklus penilaian masa percobaan/tahunan, target KPI/OKR, serta evaluasi diri & manajer.',
    descEn: 'Probation/annual review cycles, KPI/OKR goals, and self & manager evaluations.',
    defaultEnabled: true,
  },
  {
    id: 'recruitment',
    nameId: 'Rekrutmen & Onboarding',
    nameEn: 'Recruitment & Onboarding',
    descId: 'Lowongan kerja, pipeline kandidat, catatan wawancara, konversi ke karyawan, dan onboarding.',
    descEn: 'Job openings, candidate pipeline, interview notes, 1-click hire, and onboarding checklist.',
    defaultEnabled: true,
  },
  {
    id: 'signing',
    nameId: 'Dokumen & Tanda Tangan',
    nameEn: 'Documents & E-Signing',
    descId: 'Template surat, kontrak kerja, dan tanda tangan digital DocuSeal (perlu kredensial eksternal).',
    descEn: 'Document templates, contracts, and DocuSeal e-signatures (requires external credentials).',
    defaultEnabled: false,
    requiresExternalCreds: 'DocuSeal (DOCUSEAL_URL & DOCUSEAL_API_TOKEN)',
  },
  {
    id: 'reports',
    nameId: 'Laporan & Ekspor',
    nameEn: 'Reports & Exports',
    descId: 'Pusat ekspor Excel rekap absensi, payroll, BPJS, dan pajak.',
    descEn: 'Centralized Excel exports for attendance, payroll, BPJS, and tax.',
    defaultEnabled: true,
  },
];

export const DEFAULT_MODULES_CONFIG: ModulesConfig = {
  attendance: true,
  leave: true,
  shifts: true,
  payroll: true,
  claims: true,
  petty_cash: true,
  tasks: true,
  announcements: true,
  assets: true,
  offboarding: true,
  performance: true,
  recruitment: true,
  signing: false,
  reports: true,
  leave_workflow: 'three_stage',
  task_reference_preset: 'none',
  task_reference_fields: [],
  template_currency_symbol: 'Rp',
  template_prepared_by: 'PREPARED BY',
  template_checked_by: 'CHECKED BY',
  template_approved_by: 'APPROVED BY',
};

function parseTaskReferenceFields(preset: TaskReferencePreset, rawFields: unknown): string[] {
  if (preset !== 'custom') {
    return [...TASK_REFERENCE_PRESETS[preset]];
  }
  if (!Array.isArray(rawFields)) return [];
  return rawFields
    .map((f) => (typeof f === 'string' ? f.trim().slice(0, 40) : ''))
    .filter(Boolean)
    .slice(0, 8);
}

export function parseModulesConfig(
  raw?: string | Record<string, unknown> | null,
  opts?: { hasDocuSealCreds?: boolean }
): ModulesConfig {
  const defaultSigning = opts?.hasDocuSealCreds === true;
  if (!raw) return { ...DEFAULT_MODULES_CONFIG, signing: defaultSigning };
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!parsed || typeof parsed !== 'object') {
      return { ...DEFAULT_MODULES_CONFIG, signing: defaultSigning };
    }
    const cleanStr = (v: unknown, fallback: string) =>
      typeof v === 'string' && v.trim() ? v.trim().slice(0, 40) : fallback;
    const rawPreset = parsed.task_reference_preset;
    const taskPreset: TaskReferencePreset =
      rawPreset === 'project' || rawPreset === 'maritime' || rawPreset === 'custom'
        ? rawPreset
        : 'none';
    return {
      attendance: parsed.attendance !== false,
      leave: parsed.leave !== false,
      shifts: parsed.shifts !== false,
      payroll: parsed.payroll !== false,
      claims: parsed.claims !== false,
      petty_cash: parsed.petty_cash !== false,
      tasks: parsed.tasks !== false,
      announcements: parsed.announcements !== false,
      assets: parsed.assets !== false,
      offboarding: parsed.offboarding !== false,
      performance: parsed.performance !== false,
      recruitment: parsed.recruitment !== false,
      signing: typeof parsed.signing === 'boolean' ? parsed.signing : defaultSigning,
      reports: parsed.reports !== false,
      leave_workflow: parsed.leave_workflow === 'simple' ? 'simple' : 'three_stage',
      task_reference_preset: taskPreset,
      task_reference_fields: parseTaskReferenceFields(taskPreset, parsed.task_reference_fields),
      template_currency_symbol: cleanStr(parsed.template_currency_symbol, 'Rp'),
      template_prepared_by: cleanStr(parsed.template_prepared_by, 'PREPARED BY'),
      template_checked_by: cleanStr(parsed.template_checked_by, 'CHECKED BY'),
      template_approved_by: cleanStr(parsed.template_approved_by, 'APPROVED BY'),
    };
  } catch {
    return { ...DEFAULT_MODULES_CONFIG, signing: defaultSigning };
  }
}
