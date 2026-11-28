export type ApprovalScope = 'direct_reports' | 'department' | 'branch' | 'company';
export type TaskAssignScope = 'none' | 'lower_rank' | 'same_or_lower_rank' | 'all';

export interface LevelCapabilities {
  can_approve_leave: boolean;
  can_approve_overtime: boolean;
  can_approve_claims: boolean;
  can_approve_petty_cash: boolean;
  can_approve_kasbon: boolean;
  approval_scope: ApprovalScope;
  max_claim_approval_amount: number | null;
  max_petty_cash_approval_amount: number | null;
  can_assign_tasks_to: TaskAssignScope;
  can_view_all_tasks: boolean;
  can_reassign_tasks: boolean;
  can_force_close_tasks: boolean;
}

export interface LevelBypassFlags {
  bypass_approval_chain: boolean;
  bypass_leave_admin_check: boolean;
  bypass_leave_dept_head: boolean;
  bypass_leave_management: boolean;
  bypass_task_approval: boolean;
  bypass_geofence: boolean;
  bypass_claim_cutoff: boolean;
  bypass_petty_cash_limit: boolean;
}

export type BypassKey = keyof LevelBypassFlags;

export interface EmployeeLevelDto {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  rank: number;
  color: string;
  description: string | null;
  capabilities: LevelCapabilities;
  bypass: LevelBypassFlags;
  is_default: boolean;
  is_active: boolean;
  employee_count?: number;
}

export interface LevelPresetDefinition {
  key: string;
  name: string;
  description: string;
  levels: Array<{
    code: string;
    name: string;
    rank: number;
    color: string;
    description: string;
    is_default?: boolean;
    capabilities: Partial<LevelCapabilities>;
    bypass: Partial<LevelBypassFlags>;
  }>;
}

export const DEFAULT_LEVEL_CAPABILITIES: LevelCapabilities = {
  can_approve_leave: false,
  can_approve_overtime: false,
  can_approve_claims: false,
  can_approve_petty_cash: false,
  can_approve_kasbon: false,
  approval_scope: 'direct_reports',
  max_claim_approval_amount: null,
  max_petty_cash_approval_amount: null,
  can_assign_tasks_to: 'none',
  can_view_all_tasks: false,
  can_reassign_tasks: false,
  can_force_close_tasks: false,
};

export const DEFAULT_LEVEL_BYPASS: LevelBypassFlags = {
  bypass_approval_chain: false,
  bypass_leave_admin_check: false,
  bypass_leave_dept_head: false,
  bypass_leave_management: false,
  bypass_task_approval: false,
  bypass_geofence: false,
  bypass_claim_cutoff: false,
  bypass_petty_cash_limit: false,
};

export function normalizeLevelCapabilities(raw?: unknown): LevelCapabilities {
  const obj = parseJsonRecord(raw);
  const scope = obj.approval_scope;
  const validScope: ApprovalScope =
    scope === 'direct_reports' || scope === 'department' || scope === 'branch' || scope === 'company'
      ? scope
      : DEFAULT_LEVEL_CAPABILITIES.approval_scope;

  const assignScope = obj.can_assign_tasks_to;
  const validAssign: TaskAssignScope =
    assignScope === 'none' ||
    assignScope === 'lower_rank' ||
    assignScope === 'same_or_lower_rank' ||
    assignScope === 'all'
      ? assignScope
      : DEFAULT_LEVEL_CAPABILITIES.can_assign_tasks_to;

  return {
    can_approve_leave: Boolean(obj.can_approve_leave),
    can_approve_overtime: Boolean(obj.can_approve_overtime),
    can_approve_claims: Boolean(obj.can_approve_claims),
    can_approve_petty_cash: Boolean(obj.can_approve_petty_cash),
    can_approve_kasbon: Boolean(obj.can_approve_kasbon),
    approval_scope: validScope,
    max_claim_approval_amount: toNullablePositiveNumber(obj.max_claim_approval_amount),
    max_petty_cash_approval_amount: toNullablePositiveNumber(obj.max_petty_cash_approval_amount),
    can_assign_tasks_to: validAssign,
    can_view_all_tasks: Boolean(obj.can_view_all_tasks),
    can_reassign_tasks: Boolean(obj.can_reassign_tasks),
    can_force_close_tasks: Boolean(obj.can_force_close_tasks),
  };
}

export function normalizeLevelBypass(raw?: unknown): LevelBypassFlags {
  const obj = parseJsonRecord(raw);
  return {
    bypass_approval_chain: Boolean(obj.bypass_approval_chain),
    bypass_leave_admin_check: Boolean(obj.bypass_leave_admin_check),
    bypass_leave_dept_head: Boolean(obj.bypass_leave_dept_head),
    bypass_leave_management: Boolean(obj.bypass_leave_management),
    bypass_task_approval: Boolean(obj.bypass_task_approval),
    bypass_geofence: Boolean(obj.bypass_geofence),
    bypass_claim_cutoff: Boolean(obj.bypass_claim_cutoff),
    bypass_petty_cash_limit: Boolean(obj.bypass_petty_cash_limit),
  };
}

function parseJsonRecord(raw: unknown): Record<string, any> {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  if (typeof raw === 'object') return raw as Record<string, any>;
  return {};
}

function toNullablePositiveNumber(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  const num = Number(val);
  if (!Number.isFinite(num) || num <= 0) return null;
  return Math.round(num);
}

export const LEVEL_PRESETS: LevelPresetDefinition[] = [
  {
    key: 'sme_4_tier',
    name: 'Standard SME (4-Tier)',
    description: 'Staff → Supervisor → Manager → Director',
    levels: [
      {
        code: 'STF',
        name: 'Staff',
        rank: 10,
        color: '#64748B',
        description: 'Individual contributor / operational staff',
        is_default: true,
        capabilities: {},
        bypass: {},
      },
      {
        code: 'SPV',
        name: 'Supervisor',
        rank: 20,
        color: '#0EA5E9',
        description: 'Team lead with first-line leave, overtime & task assignment',
        capabilities: {
          can_approve_leave: true,
          can_approve_overtime: true,
          can_approve_claims: true,
          max_claim_approval_amount: 1500000,
          approval_scope: 'direct_reports',
          can_assign_tasks_to: 'lower_rank',
        },
        bypass: {},
      },
      {
        code: 'MGR',
        name: 'Manager',
        rank: 30,
        color: '#10B981',
        description: 'Department head with full department approvals & field bypass',
        capabilities: {
          can_approve_leave: true,
          can_approve_overtime: true,
          can_approve_claims: true,
          can_approve_petty_cash: true,
          can_approve_kasbon: true,
          max_claim_approval_amount: 10000000,
          max_petty_cash_approval_amount: 10000000,
          approval_scope: 'department',
          can_assign_tasks_to: 'lower_rank',
          can_reassign_tasks: true,
        },
        bypass: {
          bypass_leave_admin_check: true,
          bypass_geofence: true,
          bypass_task_approval: true,
        },
      },
      {
        code: 'DIR',
        name: 'Director / C-Level',
        rank: 100,
        color: '#7C3AED',
        description: 'Executive level with company-wide authority and full bypass',
        capabilities: {
          can_approve_leave: true,
          can_approve_overtime: true,
          can_approve_claims: true,
          can_approve_petty_cash: true,
          can_approve_kasbon: true,
          approval_scope: 'company',
          can_assign_tasks_to: 'all',
          can_view_all_tasks: true,
          can_reassign_tasks: true,
          can_force_close_tasks: true,
        },
        bypass: {
          bypass_approval_chain: true,
          bypass_leave_admin_check: true,
          bypass_leave_dept_head: true,
          bypass_leave_management: true,
          bypass_task_approval: true,
          bypass_geofence: true,
          bypass_claim_cutoff: true,
          bypass_petty_cash_limit: true,
        },
      },
    ],
  },
  {
    key: 'corporate_6_tier',
    name: 'Corporate (6-Tier)',
    description: 'Junior Staff → Senior Staff → Supervisor → Asst. Manager → Manager → VP / Director',
    levels: [
      {
        code: 'JR',
        name: 'Junior Staff',
        rank: 10,
        color: '#64748B',
        description: 'Entry-level contributor',
        is_default: true,
        capabilities: {},
        bypass: {},
      },
      {
        code: 'SR',
        name: 'Senior Staff',
        rank: 20,
        color: '#0284C7',
        description: 'Senior contributor able to assign tasks to junior staff',
        capabilities: {
          can_assign_tasks_to: 'lower_rank',
        },
        bypass: {},
      },
      {
        code: 'SPV',
        name: 'Supervisor',
        rank: 30,
        color: '#0D9488',
        description: 'Line supervisor for overtime and small claims',
        capabilities: {
          can_approve_leave: true,
          can_approve_overtime: true,
          can_approve_claims: true,
          max_claim_approval_amount: 2000000,
          approval_scope: 'direct_reports',
          can_assign_tasks_to: 'lower_rank',
        },
        bypass: {},
      },
      {
        code: 'AM',
        name: 'Assistant Manager',
        rank: 40,
        color: '#10B981',
        description: 'Supports department head with branch/dept approvals',
        capabilities: {
          can_approve_leave: true,
          can_approve_overtime: true,
          can_approve_claims: true,
          max_claim_approval_amount: 5000000,
          approval_scope: 'department',
          can_assign_tasks_to: 'lower_rank',
          can_reassign_tasks: true,
        },
        bypass: {
          bypass_task_approval: true,
        },
      },
      {
        code: 'MGR',
        name: 'Manager',
        rank: 50,
        color: '#F59E0B',
        description: 'Department head with petty cash & kasbon authority',
        capabilities: {
          can_approve_leave: true,
          can_approve_overtime: true,
          can_approve_claims: true,
          can_approve_petty_cash: true,
          can_approve_kasbon: true,
          max_claim_approval_amount: 15000000,
          max_petty_cash_approval_amount: 15000000,
          approval_scope: 'branch',
          can_assign_tasks_to: 'lower_rank',
          can_view_all_tasks: true,
          can_reassign_tasks: true,
        },
        bypass: {
          bypass_leave_admin_check: true,
          bypass_geofence: true,
          bypass_task_approval: true,
        },
      },
      {
        code: 'VP',
        name: 'VP / Director',
        rank: 100,
        color: '#7C3AED',
        description: 'Executive approval & full bypass',
        capabilities: {
          can_approve_leave: true,
          can_approve_overtime: true,
          can_approve_claims: true,
          can_approve_petty_cash: true,
          can_approve_kasbon: true,
          approval_scope: 'company',
          can_assign_tasks_to: 'all',
          can_view_all_tasks: true,
          can_reassign_tasks: true,
          can_force_close_tasks: true,
        },
        bypass: {
          bypass_approval_chain: true,
          bypass_leave_admin_check: true,
          bypass_leave_dept_head: true,
          bypass_leave_management: true,
          bypass_task_approval: true,
          bypass_geofence: true,
          bypass_claim_cutoff: true,
          bypass_petty_cash_limit: true,
        },
      },
    ],
  },
  {
    key: 'maritime_crew',
    name: 'Maritime / Vessel Operations',
    description: 'Crew → Chief Officer → Master / Captain → Superintendent',
    levels: [
      {
        code: 'CREW',
        name: 'Vessel Crew',
        rank: 10,
        color: '#0EA5E9',
        description: 'Onboard crew / rating',
        is_default: true,
        capabilities: {},
        bypass: {
          bypass_geofence: true,
        },
      },
      {
        code: 'COFF',
        name: 'Chief Officer',
        rank: 25,
        color: '#14B8A6',
        description: 'Deck & vessel operations lead',
        capabilities: {
          can_approve_overtime: true,
          can_assign_tasks_to: 'lower_rank',
          approval_scope: 'branch',
        },
        bypass: {
          bypass_geofence: true,
        },
      },
      {
        code: 'CAPT',
        name: 'Master / Captain',
        rank: 50,
        color: '#2563EB',
        description: 'Vessel command & crew leave/petty cash sign-off',
        capabilities: {
          can_approve_leave: true,
          can_approve_overtime: true,
          can_approve_claims: true,
          can_approve_petty_cash: true,
          approval_scope: 'branch',
          can_assign_tasks_to: 'lower_rank',
          can_reassign_tasks: true,
        },
        bypass: {
          bypass_geofence: true,
          bypass_task_approval: true,
        },
      },
      {
        code: 'SUPT',
        name: 'Fleet Superintendent',
        rank: 90,
        color: '#7C3AED',
        description: 'Shore-side fleet authority & full bypass',
        capabilities: {
          can_approve_leave: true,
          can_approve_overtime: true,
          can_approve_claims: true,
          can_approve_petty_cash: true,
          can_approve_kasbon: true,
          approval_scope: 'company',
          can_assign_tasks_to: 'all',
          can_view_all_tasks: true,
          can_reassign_tasks: true,
          can_force_close_tasks: true,
        },
        bypass: {
          bypass_approval_chain: true,
          bypass_leave_admin_check: true,
          bypass_geofence: true,
          bypass_task_approval: true,
        },
      },
    ],
  },
];
