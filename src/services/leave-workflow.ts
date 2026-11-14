import { Bindings } from '../types';
import { makeId } from '../utils/id';

/**
 * Multi-stage leave application workflow.
 *
 * The layout of the form is modelled on a paper leave application, but nothing
 * here describes a particular organisation: company identity is read from the
 * companies table and the department / leave-type choices come from the
 * departments and leave_types tables.
 *
 * Stage order is fixed and enforced server-side:
 *   applicant -> administrative check -> department head -> management
 */

export const LEAVE_STATUSES = [
  'pending',
  'submitted',
  'pending_administrator',
  'pending_dept_head',
  'pending_management',
  'approved',
  'rejected',
  'cancelled',
] as const;

export type LeaveStatus = (typeof LEAVE_STATUSES)[number];

export type StageActor = 'applicant' | 'administrator' | 'dept_head' | 'management';

/** The only status moves this workflow allows. */
export const TRANSITIONS: Record<LeaveStatus, LeaveStatus[]> = {
  // Legacy rows sit at 'pending' and move straight to a final decision.
  pending: ['approved', 'rejected', 'cancelled'],
  submitted: ['pending_administrator', 'cancelled'],
  pending_administrator: ['pending_dept_head', 'cancelled'],
  pending_dept_head: ['pending_management', 'cancelled'],
  pending_management: ['approved', 'rejected', 'cancelled'],
  approved: ['cancelled'],
  rejected: [],
  cancelled: [],
};

/** Who is expected to act while an application sits at a given status. */
export const STAGE_ACTOR: Record<LeaveStatus, StageActor | null> = {
  pending: 'administrator',
  submitted: 'administrator',
  pending_administrator: 'administrator',
  pending_dept_head: 'dept_head',
  pending_management: 'management',
  approved: null,
  rejected: null,
  cancelled: null,
};

/** States where the applicant is still waiting for an outcome. */
export const OPEN_STATUSES: LeaveStatus[] = [
  'pending',
  'submitted',
  'pending_administrator',
  'pending_dept_head',
  'pending_management',
];

export const TERMINAL_STATUSES: LeaveStatus[] = ['approved', 'rejected', 'cancelled'];

export function isLeaveStatus(value: unknown): value is LeaveStatus {
  return typeof value === 'string' && (LEAVE_STATUSES as readonly string[]).includes(value);
}

export function canTransition(from: string, to: string): boolean {
  if (!isLeaveStatus(from) || !isLeaveStatus(to)) return false;
  return TRANSITIONS[from].includes(to);
}

export function isOpenStatus(status: string): boolean {
  return OPEN_STATUSES.includes(status as LeaveStatus);
}

/* ------------------------------------------------------------------ */
/* Form definitions — the fixed wording of the document itself         */
/* ------------------------------------------------------------------ */

/** "Please tick if there is any clashes with colleagues" */
export const ADMIN_CLASH_FLAGS = [
  'Approved Annual Leave',
  'Reservist Training',
  'Medical Leave',
  'Service Time Off',
  'Unauthorized Application',
  'Excess Quota',
  'Other reason',
] as const;

/** "Please check if there is Issue with" */
export const DEPT_HEAD_FLAGS = [
  'Shortage of Manpower',
  'Important / Urgent Schedule due for completion',
  'Clashes with another colleague leave approval',
] as const;

export type AdminClashFlag = (typeof ADMIN_CLASH_FLAGS)[number];
export type DeptHeadFlag = (typeof DEPT_HEAD_FLAGS)[number];

/** Free-text types that require the applicant to explain themselves. */
export const OTHER_LEAVE_TYPE_CODES = new Set(['other', 'others']);

export function parseFlags(raw: unknown, allowed: readonly string[]): string[] {
  let list: unknown = raw;
  if (typeof raw === 'string') {
    try {
      list = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(list)) return [];
  return list.map((item) => String(item)).filter((item) => allowed.includes(item));
}

/* ------------------------------------------------------------------ */
/* Reference numbers and dates                                         */
/* ------------------------------------------------------------------ */

/** Reference is unique and human-readable: LA-YYYY-NNNN. */
export function referenceNoFor(dateISO: string, sequence: number): string {
  const year = (dateISO || '').slice(0, 4) || String(new Date().getUTCFullYear());
  return `LA-${year}-${String(sequence).padStart(4, '0')}`;
}

/**
 * Next free sequence for the year. Counting rows is enough here because the
 * unique index on reference_no is the real guard: a race retries.
 */
export async function nextReferenceNo(env: Bindings, dateISO: string): Promise<string> {
  const year = (dateISO || '').slice(0, 4) || String(new Date().getUTCFullYear());
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM leave_requests WHERE reference_no LIKE ?`
  )
    .bind(`LA-${year}-%`)
    .first<{ n: number }>();

  const start = Number(row?.n || 0);
  for (let attempt = 1; attempt <= 50; attempt++) {
    const candidate = referenceNoFor(dateISO, start + attempt);
    const clash = await env.DB.prepare(
      `SELECT 1 AS hit FROM leave_requests WHERE reference_no = ?`
    )
      .bind(candidate)
      .first();
    if (!clash) return candidate;
  }
  // Fall back to a time-based suffix rather than failing the submission.
  return `${referenceNoFor(dateISO, start + 1)}-${Date.now().toString(36)}`;
}

/** Document date format: "03 11 26" (DD MM YY). */
export function formatDDMMYY(iso: string): string {
  if (!iso) return '';
  const date = new Date(iso.length <= 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(date.getTime())) return '';
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const year = String(date.getUTCFullYear()).slice(-2);
  return `${day} ${month} ${year}`;
}

/**
 * One working day after the submission date: skip weekends and the configured
 * holiday calendar. Returned as an ISO date string.
 */
export function workingDaySlaDueAt(fromISO: string, holidays: string[] = []): string {
  const holidaySet = new Set(holidays);
  const cursor = new Date(`${(fromISO || '').slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(cursor.getTime())) {
    return new Date(Date.now() + 86400000).toISOString();
  }

  let added = 0;
  while (added < 1) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const day = cursor.getUTCDay();
    const iso = cursor.toISOString().slice(0, 10);
    if (day === 0 || day === 6) continue;
    if (holidaySet.has(iso)) continue;
    added++;
  }
  return cursor.toISOString().slice(0, 10);
}

/** Working days between two dates, excluding weekends and holidays. */
export function countWorkingDays(fromISO: string, toISO: string, holidays: string[] = []): number {
  const holidaySet = new Set(holidays);
  const start = new Date(`${fromISO}T00:00:00Z`);
  const end = new Date(`${toISO}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;

  let days = 0;
  for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const day = cursor.getUTCDay();
    if (day === 0 || day === 6) continue;
    if (holidaySet.has(cursor.toISOString().slice(0, 10))) continue;
    days++;
  }
  return days;
}

/* ------------------------------------------------------------------ */
/* Letterhead — always resolved from the database, never literal        */
/* ------------------------------------------------------------------ */

export interface Letterhead {
  name: string;
  address: string;
  email: string;
  phone: string;
  /** The company's registered / tax number, as recorded in settings. */
  regNo: string;
  logoUrl: string | null;
}

/** Fields the printable form needs but which may be blank in settings. */
export interface LetterheadFieldStatus {
  name: boolean;
  address: boolean;
  email: boolean;
  phone: boolean;
  regNo: boolean;
}

export function resolveLetterhead(company: any): Letterhead {
  return {
    name: String(company?.legal_name || company?.name || '').trim(),
    address: String(company?.address || '').trim(),
    email: String(company?.email || '').trim(),
    phone: String(company?.phone || '').trim(),
    regNo: String(company?.npwp || '').trim(),
    logoUrl: company?.logo_url ? String(company.logo_url) : null,
  };
}

/** Which letterhead fields are still missing, so the UI can prompt settings. */
export function letterheadGaps(head: Letterhead): LetterheadFieldStatus {
  return {
    name: Boolean(head.name),
    address: Boolean(head.address),
    email: Boolean(head.email),
    phone: Boolean(head.phone),
    regNo: Boolean(head.regNo),
  };
}

export async function loadLetterhead(env: Bindings): Promise<Letterhead> {
  const company = await env.DB.prepare(
    `SELECT name, legal_name, address, phone, email, npwp, logo_url FROM companies LIMIT 1`
  ).first<any>();
  return resolveLetterhead(company);
}

/* ------------------------------------------------------------------ */
/* Approval side effects                                               */
/* ------------------------------------------------------------------ */

export interface ApprovableRequest {
  id: string;
  employee_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  total_days: number;
  status?: string;
  side_effects_applied_at?: string | null;
}

/**
 * Applies the consequences of a leave being approved: deduct the balance and
 * mark attendance for the covered working days.
 *
 * Runs at most once per application. The management decision, an override and
 * the legacy single-step review all funnel through here, so a request approved
 * twice (or force-approved after a partial run) cannot deduct twice.
 */
export async function applyApprovalSideEffects(
  env: Bindings,
  req: ApprovableRequest
): Promise<{ alreadyApplied: boolean }> {
  const current = await env.DB.prepare(
    `SELECT side_effects_applied_at, leave_type_id, start_date, end_date, total_days
     FROM leave_requests WHERE id = ?`
  )
    .bind(req.id)
    .first<any>();

  if (current?.side_effects_applied_at) return { alreadyApplied: true };

  const leaveTypeId = current?.leave_type_id ?? req.leave_type_id;
  const startDate = current?.start_date ?? req.start_date;
  const endDate = current?.end_date ?? req.end_date;
  const totalDays = Number(current?.total_days ?? req.total_days);

  // 1. Deduct the balance for this year only.
  const year = parseInt(String(startDate).slice(0, 4), 10) || new Date().getUTCFullYear();
  await env.DB.prepare(
    `UPDATE leave_balances
     SET used_days = used_days + ?,
         remaining_days = remaining_days - ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE employee_id = ? AND leave_type_id = ? AND year = ?`
  )
    .bind(totalDays, totalDays, req.employee_id, leaveTypeId, year)
    .run();

  // 2. Mark attendance for each working day. Weekends and public holidays are
  //    not working days, and an existing real clock-in is never overwritten.
  const leaveType = await env.DB.prepare(`SELECT code FROM leave_types WHERE id = ?`)
    .bind(leaveTypeId)
    .first<{ code: string }>();

  const attStatus = String(leaveType?.code || '').toLowerCase() === 'sick' ? 'sick' : 'on_leave';

  const holidayRows = await env.DB.prepare(
    `SELECT date FROM holidays WHERE date BETWEEN ? AND ?`
  )
    .bind(startDate, endDate)
    .all<{ date: string }>();
  const holidaySet = new Set((holidayRows.results || []).map((row) => row.date));

  const cursor = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (!Number.isNaN(cursor.getTime()) && !Number.isNaN(end.getTime())) {
    for (; cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
      const day = cursor.getUTCDay();
      if (day === 0 || day === 6) continue;
      const dateStr = cursor.toISOString().slice(0, 10);
      if (holidaySet.has(dateStr)) continue;

      const existing = await env.DB.prepare(
        `SELECT id, clock_in_time, source FROM attendance WHERE employee_id = ? AND date = ? LIMIT 1`
      )
        .bind(req.employee_id, dateStr)
        .first<any>();

      if (!existing) {
        await env.DB.prepare(
          `INSERT INTO attendance (id, tenant_id, employee_id, date, status, source)
           VALUES (?, 'default', ?, ?, ?, 'manual')`
        )
          .bind(`att-leave-${req.employee_id}-${dateStr}`, req.employee_id, dateStr, attStatus)
          .run();
        continue;
      }

      // Someone actually turned up that day: leave the record intact.
      if (existing.clock_in_time) continue;

      await env.DB.prepare(
        `UPDATE attendance SET status = ?, source = 'manual', updated_at = CURRENT_TIMESTAMP WHERE id = ?`
      )
        .bind(attStatus, existing.id)
        .run();
    }
  }

  await env.DB.prepare(
    `UPDATE leave_requests SET side_effects_applied_at = CURRENT_TIMESTAMP WHERE id = ? AND side_effects_applied_at IS NULL`
  )
    .bind(req.id)
    .run();

  return { alreadyApplied: false };
}

/* ------------------------------------------------------------------ */
/* Audit trail                                                         */
/* ------------------------------------------------------------------ */

export async function auditLeaveAction(
  db: D1Database,
  userId: string | null,
  action: string,
  requestId: string,
  values: Record<string, unknown>
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO audit_logs (id, tenant_id, user_id, action, entity_type, entity_id, new_values)
       VALUES (?, 'default', ?, ?, 'leave_requests', ?, ?)`
    )
    .bind(makeId('aud'), userId, action, requestId, JSON.stringify(values))
    .run();
}

/* ------------------------------------------------------------------ */
/* Clash detection                                                     */
/* ------------------------------------------------------------------ */

export interface LeaveConflict {
  id: string;
  reference_no: string | null;
  employee_id: string;
  employee_name: string;
  department_label: string | null;
  leave_type_label: string | null;
  start_date: string;
  end_date: string;
  status: string;
}

/**
 * Colleagues in the same department with overlapping leave that is either
 * already approved or still in flight. Used to help the administrator and the
 * department head spot clashes instead of comparing dates by hand.
 */
export async function findLeaveConflicts(
  db: D1Database,
  params: { departmentId?: string | null; start: string; end: string; excludeId?: string | null }
): Promise<LeaveConflict[]> {
  if (!params.departmentId || !params.start || !params.end) return [];

  const rows = await db
    .prepare(
      `SELECT lr.id, lr.reference_no, lr.employee_id, lr.start_date, lr.end_date, lr.status,
              lr.department_label, lr.leave_type_label, e.full_name AS employee_name
       FROM leave_requests lr
       JOIN employees e ON e.id = lr.employee_id
       WHERE lr.department_id = ?
         AND lr.start_date <= ?
         AND lr.end_date >= ?
         AND lr.status IN ('pending', 'submitted', 'pending_administrator',
                           'pending_dept_head', 'pending_management', 'approved')
         AND lr.id <> ?
       ORDER BY lr.start_date ASC`
    )
    .bind(params.departmentId, params.end, params.start, params.excludeId || '')
    .all<any>();

  return (rows.results || []) as LeaveConflict[];
}
