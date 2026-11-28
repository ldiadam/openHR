import {
  BypassKey,
  EmployeeLevelDto,
  LevelBypassFlags,
  LevelCapabilities,
  normalizeLevelBypass,
  normalizeLevelCapabilities,
} from '../../shared/levels';
import { AuthContext } from '../middleware/auth';

export type ApprovalModule = 'leave' | 'overtime' | 'claims' | 'petty_cash' | 'kasbon';

export interface ActorLevelContext {
  userId: string;
  tenantId: string;
  role: AuthContext['user']['role'];
  employeeId: string | null;
  departmentId: string | null;
  branchId: string | null;
  level: EmployeeLevelDto | null;
}

export interface TargetEmployeeScope {
  id: string;
  manager_id?: string | null;
  department_id?: string | null;
  branch_id?: string | null;
}

export function rowToEmployeeLevel(row: any): EmployeeLevelDto {
  return {
    id: row.id,
    tenant_id: row.tenant_id || 'default',
    code: row.code,
    name: row.name,
    rank: Number(row.rank ?? 10),
    color: row.color || '#2563EB',
    description: row.description ?? null,
    capabilities: normalizeLevelCapabilities(row.capabilities_json),
    bypass: normalizeLevelBypass(row.bypass_json),
    is_default: Boolean(row.is_default),
    is_active: row.is_active === undefined ? true : Boolean(row.is_active),
    employee_count: row.employee_count !== undefined ? Number(row.employee_count) : undefined,
  };
}

export async function listEmployeeLevels(db: D1Database, tenantId: string = 'default'): Promise<EmployeeLevelDto[]> {
  const rows = await db
    .prepare(
      `SELECT l.*,
              (SELECT COUNT(*) FROM employees e WHERE e.level_id = l.id AND COALESCE(e.lifecycle_status, 'active') NOT IN ('resigned', 'terminated')) AS employee_count
       FROM employee_levels l
       WHERE l.tenant_id = ?
       ORDER BY l.rank ASC, l.name ASC`
    )
    .bind(tenantId)
    .all<any>();

  return (rows.results || []).map(rowToEmployeeLevel);
}

export async function getEmployeeLevelContext(
  db: D1Database,
  user: Pick<AuthContext['user'], 'userId' | 'tenantId' | 'role' | 'employeeId'>
): Promise<ActorLevelContext> {
  const base: ActorLevelContext = {
    userId: user.userId,
    tenantId: user.tenantId || 'default',
    role: user.role,
    employeeId: user.employeeId ?? null,
    departmentId: null,
    branchId: null,
    level: null,
  };

  if (!user.employeeId) return base;

  try {
    const row = await db
      .prepare(
        `SELECT e.id, e.department_id, e.branch_id, e.level_id,
                l.id AS lvl_id, l.tenant_id AS lvl_tenant_id, l.code AS lvl_code, l.name AS lvl_name,
                l.rank AS lvl_rank, l.color AS lvl_color, l.description AS lvl_description,
                l.capabilities_json, l.bypass_json, l.is_default, l.is_active
         FROM employees e
         LEFT JOIN employee_levels l ON e.level_id = l.id AND l.is_active = 1
         WHERE e.id = ?`
      )
      .bind(user.employeeId)
      .first<any>();

    if (!row) return base;

    base.departmentId = row.department_id ?? null;
    base.branchId = row.branch_id ?? null;
    if (row.lvl_id) {
      base.level = rowToEmployeeLevel({
        id: row.lvl_id,
        tenant_id: row.lvl_tenant_id,
        code: row.lvl_code,
        name: row.lvl_name,
        rank: row.lvl_rank,
        color: row.lvl_color,
        description: row.lvl_description,
        capabilities_json: row.capabilities_json,
        bypass_json: row.bypass_json,
        is_default: row.is_default,
        is_active: row.is_active,
      });
    }
    return base;
  } catch {
    // Graceful fallback when migration 0037 hasn't been applied in an isolated unit test DB
    return base;
  }
}

export function hasBypass(ctx: ActorLevelContext, flag: BypassKey): boolean {
  if (ctx.role === 'owner_admin') return true;
  return Boolean(ctx.level?.bypass[flag]);
}

export function hasLevelBypassOnly(ctx: ActorLevelContext, flag: BypassKey): boolean {
  return Boolean(ctx.level?.bypass[flag]);
}

export function canApproveForTarget(
  approver: ActorLevelContext,
  target: TargetEmployeeScope,
  module: ApprovalModule,
  amount?: number | null
): boolean {
  if (approver.role === 'owner_admin') return true;

  // Finance keeps legacy authority for claims / petty cash / kasbon if no custom level restricts it
  if (!approver.level) {
    if (approver.role === 'finance' && (module === 'claims' || module === 'petty_cash' || module === 'kasbon')) {
      return true;
    }
    if (approver.role === 'manager') {
      return !target.manager_id || target.manager_id === approver.employeeId;
    }
    return false;
  }

  const caps = approver.level.capabilities;
  const hasModuleCap =
    (module === 'leave' && caps.can_approve_leave) ||
    (module === 'overtime' && caps.can_approve_overtime) ||
    (module === 'claims' && caps.can_approve_claims) ||
    (module === 'petty_cash' && caps.can_approve_petty_cash) ||
    (module === 'kasbon' && caps.can_approve_kasbon);

  if (!hasModuleCap) return false;

  if (typeof amount === 'number' && Number.isFinite(amount)) {
    if (module === 'claims' && caps.max_claim_approval_amount !== null && amount > caps.max_claim_approval_amount) {
      return false;
    }
    if (
      module === 'petty_cash' &&
      caps.max_petty_cash_approval_amount !== null &&
      amount > caps.max_petty_cash_approval_amount
    ) {
      return false;
    }
  }

  switch (caps.approval_scope) {
    case 'company':
      return true;
    case 'branch':
      return Boolean(approver.branchId && target.branch_id && approver.branchId === target.branch_id);
    case 'department':
      return Boolean(approver.departmentId && target.department_id && approver.departmentId === target.department_id);
    case 'direct_reports':
    default:
      return Boolean(approver.employeeId && target.manager_id === approver.employeeId);
  }
}

export function canAssignTaskToRank(
  assignor: ActorLevelContext,
  assigneeRank: number | null | undefined
): boolean {
  if (assignor.role === 'owner_admin') return true;
  if (!assignor.level) {
    return assignor.role === 'manager';
  }
  const scope = assignor.level.capabilities.can_assign_tasks_to;
  if (scope === 'all') return true;
  if (scope === 'none') return false;
  const myRank = assignor.level.rank;
  const targetRank = assigneeRank ?? 0;
  if (scope === 'same_or_lower_rank') return targetRank <= myRank;
  return targetRank < myRank;
}

export function canViewAllTasks(ctx: ActorLevelContext): boolean {
  if (ctx.role === 'owner_admin') return true;
  if (!ctx.level) return ctx.role === 'manager';
  return ctx.level.capabilities.can_view_all_tasks;
}

export function canForceCloseTask(ctx: ActorLevelContext): boolean {
  if (ctx.role === 'owner_admin') return true;
  if (!ctx.level) return ctx.role === 'manager';
  return ctx.level.capabilities.can_force_close_tasks || ctx.level.bypass.bypass_task_approval;
}

export interface SimulatedApprovalStep {
  step: string;
  label: string;
  status: 'required' | 'bypassed' | 'auto_approved';
  approverLevels: Array<{ id: string; code: string; name: string; rank: number; color: string }>;
  reason?: string;
}

export function simulateApprovalFlow(
  levels: EmployeeLevelDto[],
  requesterLevelId: string,
  module: ApprovalModule,
  amount?: number | null
): SimulatedApprovalStep[] {
  const sorted = [...levels].filter((l) => l.is_active).sort((a, b) => a.rank - b.rank);
  const requester = sorted.find((l) => l.id === requesterLevelId);
  if (!requester) return [];

  if (requester.bypass.bypass_approval_chain) {
    return [
      {
        step: 'auto_approved',
        label: 'Auto-Approved (Bypass Approval Chain)',
        status: 'auto_approved',
        approverLevels: [],
        reason: `${requester.name} has bypass_approval_chain enabled`,
      },
    ];
  }

  const eligibleApprovers = sorted.filter((lvl) => {
    if (lvl.rank <= requester.rank && lvl.capabilities.approval_scope !== 'company') {
      return false;
    }
    const caps = lvl.capabilities;
    const hasCap =
      (module === 'leave' && caps.can_approve_leave) ||
      (module === 'overtime' && caps.can_approve_overtime) ||
      (module === 'claims' && caps.can_approve_claims) ||
      (module === 'petty_cash' && caps.can_approve_petty_cash) ||
      (module === 'kasbon' && caps.can_approve_kasbon);
    if (!hasCap) return false;
    if (typeof amount === 'number' && Number.isFinite(amount)) {
      if (module === 'claims' && caps.max_claim_approval_amount !== null && amount > caps.max_claim_approval_amount) {
        return false;
      }
      if (
        module === 'petty_cash' &&
        caps.max_petty_cash_approval_amount !== null &&
        amount > caps.max_petty_cash_approval_amount
      ) {
        return false;
      }
    }
    return true;
  });

  if (module === 'leave') {
    const steps: SimulatedApprovalStep[] = [];
    steps.push({
      step: 'administrator',
      label: 'Administrative Check (HR)',
      status: requester.bypass.bypass_leave_admin_check ? 'bypassed' : 'required',
      approverLevels: eligibleApprovers.slice(0, 1).map(toSummary),
      reason: requester.bypass.bypass_leave_admin_check ? 'Skipped by bypass_leave_admin_check' : undefined,
    });
    steps.push({
      step: 'dept_head',
      label: 'Department Head Approval',
      status: requester.bypass.bypass_leave_dept_head ? 'bypassed' : 'required',
      approverLevels: eligibleApprovers.filter((l) => l.rank > requester.rank).map(toSummary),
      reason: requester.bypass.bypass_leave_dept_head ? 'Skipped by bypass_leave_dept_head' : undefined,
    });
    steps.push({
      step: 'management',
      label: 'Management Final Sign-Off',
      status: requester.bypass.bypass_leave_management ? 'bypassed' : 'required',
      approverLevels: eligibleApprovers.filter((l) => l.capabilities.approval_scope === 'company').map(toSummary),
      reason: requester.bypass.bypass_leave_management ? 'Skipped by bypass_leave_management' : undefined,
    });
    return steps;
  }

  return [
    {
      step: `${module}_approval`,
      label: `${module.replace('_', ' ').toUpperCase()} Approval`,
      status: 'required',
      approverLevels: eligibleApprovers.map(toSummary),
      reason:
        eligibleApprovers.length === 0
          ? 'No level meets the capability or amount limit (falls back to Owner/Admin)'
          : undefined,
    },
  ];
}

function toSummary(lvl: EmployeeLevelDto) {
  return { id: lvl.id, code: lvl.code, name: lvl.name, rank: lvl.rank, color: lvl.color };
}
