export interface BilingualLeaveType {
  name?: string | null;
  name_en?: string | null;
  name_id?: string | null;
  leave_type_name?: string | null;
  leave_type_name_en?: string | null;
  leave_type_name_id?: string | null;
  code?: string | null;
  leave_type_code?: string | null;
}

/**
 * Returns the localized leave type label based on active UI language (`id` or `en`),
 * falling back cleanly to legacy `name` / `leave_type_name` or `code`.
 */
export function getLeaveTypeLabel(
  item: BilingualLeaveType | null | undefined,
  language: 'id' | 'en',
): string {
  if (!item) return '-';
  const idName = item.name_id || item.leave_type_name_id;
  const enName = item.name_en || item.leave_type_name_en;
  const fallback = item.name || item.leave_type_name || item.code || item.leave_type_code || '-';

  if (language === 'en') {
    return enName || fallback || idName || '-';
  }
  return idName || fallback || enName || '-';
}
