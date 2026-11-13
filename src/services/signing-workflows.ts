import { DocumentVisibility } from '../types';

/**
 * Reusable HR signing workflows. One definition per document code so routes
 * never need bespoke logic per document type.
 */
export interface WorkflowSignerRole {
  role: 'Employee' | 'Manager' | 'HR';
  /** Resolve the signer identity relative to the employee the request is for. */
  resolve: 'employee' | 'manager' | 'company_hr';
  required: boolean;
}

export interface WorkflowDef {
  code: string;
  label: string;
  description: string;
  visibility: DocumentVisibility;
  order: 'preserved' | 'random';
  signers: WorkflowSignerRole[];
  /** Default due date offset in days from creation. */
  defaultDueDays: number;
  /** Retention override in months (falls back to the template's value). */
  retentionMonths?: number;
  completionEffect: 'onboarding_step' | 'offboarding_step' | 'acknowledged' | 'audit_only';
}

export const WORKFLOWS: Record<string, WorkflowDef> = {
  offer_letter: {
    code: 'offer_letter',
    label: 'Surat Penawaran Kerja',
    description: 'Offer letter dengan persetujuan Employee, Manager, dan HR.',
    visibility: 'standard',
    order: 'preserved',
    signers: [
      { role: 'Employee', resolve: 'employee', required: true },
      { role: 'Manager', resolve: 'manager', required: false },
      { role: 'HR', resolve: 'company_hr', required: true },
    ],
    defaultDueDays: 14,
    completionEffect: 'onboarding_step',
  },
  nda: {
    code: 'nda',
    label: 'Perjanjian Kerahasiaan (NDA / IP)',
    description: 'NDA dan pengalihan hak kekayaan intelektual.',
    visibility: 'standard',
    order: 'preserved',
    signers: [
      { role: 'Employee', resolve: 'employee', required: true },
      { role: 'HR', resolve: 'company_hr', required: true },
    ],
    defaultDueDays: 14,
    completionEffect: 'onboarding_step',
  },
  handbook_ack: {
    code: 'handbook_ack',
    label: 'Pernyataan Peraturan Perusahaan',
    description: 'Acknowledgment buku panduan / peraturan perusahaan.',
    visibility: 'standard',
    order: 'preserved',
    signers: [
      { role: 'Employee', resolve: 'employee', required: true },
      { role: 'HR', resolve: 'company_hr', required: false },
    ],
    defaultDueDays: 14,
    completionEffect: 'onboarding_step',
  },
  policy_ack: {
    code: 'policy_ack',
    label: 'Persetujuan Kebijakan',
    description: 'Acknowledgment kebijakan (dapat dibuat massal per grup/perusahaan).',
    visibility: 'standard',
    order: 'preserved',
    signers: [{ role: 'Employee', resolve: 'employee', required: true }],
    defaultDueDays: 30,
    retentionMonths: 36,
    completionEffect: 'acknowledged',
  },
  offboarding_clearance: {
    code: 'offboarding_clearance',
    label: 'Exit Clearance & Serah Terima Aset',
    description: 'Exit clearance, handover aset, dan acknowledgment settlement akhir.',
    visibility: 'standard',
    order: 'preserved',
    signers: [
      { role: 'Employee', resolve: 'employee', required: true },
      { role: 'Manager', resolve: 'manager', required: true },
      { role: 'HR', resolve: 'company_hr', required: true },
    ],
    defaultDueDays: 14,
    completionEffect: 'offboarding_step',
  },
  pip_warning: {
    code: 'pip_warning',
    label: 'PIP / Surat Peringatan',
    description: 'Performance improvement plan atau surat peringatan disiplin.',
    visibility: 'restricted',
    order: 'preserved',
    signers: [
      { role: 'Manager', resolve: 'manager', required: true },
      { role: 'Employee', resolve: 'employee', required: true },
      { role: 'HR', resolve: 'company_hr', required: true },
    ],
    defaultDueDays: 7,
    completionEffect: 'audit_only',
  },
  salary_change: {
    code: 'salary_change',
    label: 'Surat Perubahan Gaji / Promosi',
    description: 'Surat perubahan kompensasi atau promosi jabatan.',
    visibility: 'restricted',
    order: 'preserved',
    signers: [
      { role: 'HR', resolve: 'company_hr', required: true },
      { role: 'Employee', resolve: 'employee', required: true },
    ],
    defaultDueDays: 7,
    completionEffect: 'audit_only',
  },
};

export function getWorkflow(code: string | undefined | null): WorkflowDef | null {
  if (!code) return null;
  return WORKFLOWS[code] || null;
}

export function isRestrictedWorkflow(code: string | undefined | null): boolean {
  return getWorkflow(code)?.visibility === 'restricted';
}
