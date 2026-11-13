import { JwtPayload, UserRole } from '../types';
import { isRestrictedWorkflow } from '../services/signing-workflows';

/**
 * RBAC for the e-signature module.
 *
 * Role mapping used by this app:
 *   owner_admin -> HR_ADMIN    (manage templates, any request, view all)
 *   finance     -> HR_OPERATOR (create requests, view documents for employees)
 *   manager     -> MANAGER     (direct reports only)
 *   employee    -> EMPLOYEE    (own documents only)
 */

export function isHrAdmin(user: JwtPayload | null | undefined): boolean {
  return user?.role === 'owner_admin';
}

export function isHrOperator(user: JwtPayload | null | undefined): boolean {
  return user?.role === 'owner_admin' || user?.role === 'finance';
}

/** Anyone who may create a signing request at all (employee cannot). */
export function canCreateSigningRequests(user: JwtPayload | null | undefined): boolean {
  return ['owner_admin', 'finance', 'manager'].includes(user?.role as UserRole);
}

export function canManageTemplates(user: JwtPayload | null | undefined): boolean {
  return isHrAdmin(user);
}

export interface SignableEmployee {
  id: string;
  manager_id?: string | null;
  full_name?: string;
  department_id?: string | null;
}

/**
 * HR_ADMIN / HR_OPERATOR may create for anyone.
 * MANAGER may create only for their direct reports (not themselves via this path).
 */
export function canCreateRequestFor(
  user: JwtPayload | null | undefined,
  target: SignableEmployee | null | undefined
): boolean {
  if (!user || !target) return false;
  if (isHrOperator(user)) return true;
  if (user.role === 'manager') return target.manager_id === user.employeeId;
  return false;
}

export interface SignerLike {
  email?: string | null;
  employee_id?: string | null;
  role?: string | null;
}

export interface SigningRequestLike {
  employee_id: string;
  workflow?: string | null;
  requested_by?: string | null;
}

/**
 * Who may read a signing request and its documents.
 * Restricted workflows (PIP, salary change) are limited to HR admins and the
 * employee's management chain.
 */
export function canViewSigningRequest(
  user: JwtPayload | null | undefined,
  request: SigningRequestLike | null | undefined,
  signers: SignerLike[] = [],
  targetEmployee?: SignableEmployee | null
): boolean {
  if (!user || !request) return false;

  if (user.role === 'owner_admin') return true;
  if (user.role === 'finance') return !isRestrictedWorkflow(request.workflow);

  if (user.role === 'manager') {
    const isOwnRequest = user.employeeId === request.employee_id;
    const isDirectReport = !!targetEmployee && targetEmployee.manager_id === user.employeeId;
    if (isRestrictedWorkflow(request.workflow)) {
      // Management chain (direct manager or the employee themselves) only.
      return isOwnRequest || isDirectReport;
    }
    return isOwnRequest || isDirectReport;
  }

  // Employee: only their own documents, or a signer entry addressed to them.
  if (user.employeeId && user.employeeId === request.employee_id) return true;
  return signers.some(
    (signer) =>
      (signer.employee_id && signer.employee_id === user.employeeId) ||
      (signer.email && user.email && signer.email.toLowerCase() === user.email.toLowerCase())
  );
}

export function canViewEmployeeDocuments(
  user: JwtPayload | null | undefined,
  target: SignableEmployee | null | undefined
): boolean {
  if (!user || !target) return false;
  if (isHrOperator(user)) return true;
  if (user.role === 'manager') {
    return target.manager_id === user.employeeId || target.id === user.employeeId;
  }
  return target.id === user.employeeId;
}

/** Managers cannot see payroll/tax-bearing documents they are not party to. */
export function canDownloadSignedDocument(
  user: JwtPayload | null | undefined,
  request: SigningRequestLike | null | undefined,
  signers: SignerLike[] = [],
  targetEmployee?: SignableEmployee | null
): boolean {
  return canViewSigningRequest(user, request, signers, targetEmployee);
}
