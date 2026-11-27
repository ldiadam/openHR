import { Bindings } from '../types';
import { makeId } from '../utils/id';

/**
 * Petty cash workflow.
 *
 * Two approval gates:
 *   1. the request for cash  (pending -> approved, cash handed over)
 *   2. the realization report (report_submitted -> report_approved | report_rejected)
 *
 * Expenses may only be changed while the cash is held and the report is not
 * under review: `approved` (still spending) or `report_rejected` (sent back).
 */

export const PETTY_CASH_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'cancelled',
  'report_submitted',
  'report_approved',
  'report_rejected',
] as const;

export type PettyCashStatus = (typeof PETTY_CASH_STATUSES)[number];

export type PettyCashStageActor = 'applicant' | 'finance' | null;

export const TRANSITIONS: Record<PettyCashStatus, PettyCashStatus[]> = {
  pending: ['approved', 'rejected', 'cancelled'],
  approved: ['report_submitted'],
  report_submitted: ['report_approved', 'report_rejected'],
  report_rejected: ['report_submitted'],
  report_approved: [],
  rejected: [],
  cancelled: [],
};

export const STAGE_ACTOR: Record<PettyCashStatus, PettyCashStageActor> = {
  pending: 'finance',
  approved: 'applicant',
  report_submitted: 'finance',
  report_rejected: 'applicant',
  report_approved: null,
  rejected: null,
  cancelled: null,
};

export const OPEN_STATUSES: PettyCashStatus[] = ['pending', 'report_submitted'];

export function isPettyCashStatus(value: unknown): value is PettyCashStatus {
  return typeof value === 'string' && (PETTY_CASH_STATUSES as readonly string[]).includes(value);
}

export function canTransition(from: string, to: string): boolean {
  if (!isPettyCashStatus(from) || !isPettyCashStatus(to)) return false;
  return TRANSITIONS[from].includes(to);
}

export function isOpenStatus(status: string): boolean {
  return OPEN_STATUSES.includes(status as PettyCashStatus);
}

/** The employee can still add, edit or delete expenses. */
export function isEditableStatus(status: string): boolean {
  return status === 'approved' || status === 'report_rejected';
}

/* ------------------------------------------------------------------ */
/* Expense categories                                                  */
/* ------------------------------------------------------------------ */

/**
 * Fixed code list so reports stay comparable. Labels are rendered client-side
 * in the active language.
 */
export const PETTY_CASH_CATEGORIES = [
  'transport',
  'meals',
  'office_supplies',
  'utilities',
  'maintenance',
  'travel',
  'other',
] as const;

export type PettyCashCategory = (typeof PETTY_CASH_CATEGORIES)[number];

export function isPettyCashCategory(value: unknown): value is PettyCashCategory {
  return typeof value === 'string' && (PETTY_CASH_CATEGORIES as readonly string[]).includes(value);
}

/* ------------------------------------------------------------------ */
/* Reference numbers                                                   */
/* ------------------------------------------------------------------ */

export function pettyCashReferenceNoFor(dateISO: string, sequence: number): string {
  const year = (dateISO || '').slice(0, 4) || String(new Date().getUTCFullYear());
  return `PC-${year}-${String(sequence).padStart(4, '0')}`;
}

/**
 * Next free sequence for the year. The unique index on reference_no is the real
 * guard: a race retries with the next candidate.
 */
export async function nextPettyCashReferenceNo(env: Bindings, dateISO: string): Promise<string> {
  const year = (dateISO || '').slice(0, 4) || String(new Date().getUTCFullYear());
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM petty_cash_requests WHERE reference_no LIKE ?`
  )
    .bind(`PC-${year}-%`)
    .first<{ n: number }>();

  const start = Number(row?.n || 0);
  for (let attempt = 1; attempt <= 50; attempt++) {
    const candidate = pettyCashReferenceNoFor(dateISO, start + attempt);
    const clash = await env.DB.prepare(
      `SELECT 1 AS hit FROM petty_cash_requests WHERE reference_no = ?`
    )
      .bind(candidate)
      .first();
    if (!clash) return candidate;
  }
  return `${pettyCashReferenceNoFor(dateISO, start + 1)}-${Date.now().toString(36)}`;
}

/* ------------------------------------------------------------------ */
/* Totals                                                              */
/* ------------------------------------------------------------------ */

export interface PettyCashTotals {
  totalRealized: number;
  disbursed: number;
  variance: number;
}

/**
 * Recompute the report totals from the expense rows and persist them next to
 * the request. `variance` is what remains in hand: positive means cash left
 * over, negative means the employee spent more than the float.
 */
export async function recalculateTotals(env: Bindings, requestId: string): Promise<PettyCashTotals> {
  const sum = await env.DB.prepare(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM petty_cash_expenses WHERE request_id = ?`
  )
    .bind(requestId)
    .first<{ total: number }>();

  const request = await env.DB.prepare(
    `SELECT requested_amount, disbursed_amount FROM petty_cash_requests WHERE id = ?`
  )
    .bind(requestId)
    .first<any>();

  const totalRealized = Number(sum?.total || 0);
  const disbursed = Number(request?.disbursed_amount ?? request?.requested_amount ?? 0);
  const variance = Math.round((disbursed - totalRealized) * 100) / 100;

  await env.DB.prepare(
    `UPDATE petty_cash_requests
     SET total_realized = ?, variance = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  )
    .bind(totalRealized, variance, requestId)
    .run();

  return { totalRealized, disbursed, variance };
}

/** Expenses that still have no receipt attached. */
export async function expensesMissingReceipts(db: D1Database, requestId: string): Promise<string[]> {
  const rows = await db
    .prepare(
      `SELECT e.id
       FROM petty_cash_expenses e
       LEFT JOIN petty_cash_receipts r ON r.expense_id = e.id
       WHERE e.request_id = ?
       GROUP BY e.id
       HAVING COUNT(r.id) = 0`
    )
    .bind(requestId)
    .all<{ id: string }>();

  return (rows.results || []).map((row) => row.id);
}

/* ------------------------------------------------------------------ */
/* Audit trail                                                         */
/* ------------------------------------------------------------------ */

export async function auditPettyCashAction(
  db: D1Database,
  userId: string | null,
  action: string,
  requestId: string,
  values: Record<string, unknown>
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO audit_logs (id, tenant_id, user_id, action, entity_type, entity_id, new_values)
       VALUES (?, 'default', ?, ?, 'petty_cash_requests', ?, ?)`
    )
    .bind(makeId('aud'), userId, action, requestId, JSON.stringify(values))
    .run();
}

/* ------------------------------------------------------------------ */
/* Public verification token (HMAC-SHA256)                             */
/* ------------------------------------------------------------------ */

async function computeHmacHex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret || 'openhr-fallback-secret'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 24);
}

export async function signPettyCashVerifyToken(secret: string, requestId: string): Promise<string> {
  return computeHmacHex(secret, `petty-cash-verify:${requestId}`);
}

export async function verifyPettyCashToken(
  secret: string,
  requestId: string,
  token: string
): Promise<boolean> {
  if (!token || typeof token !== 'string') return false;
  const expected = await signPettyCashVerifyToken(secret, requestId);
  if (token.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  }
  return diff === 0;
}
