export type UserRole = 'owner_admin' | 'manager' | 'finance' | 'employee';

export type EmploymentStatus = 'PKWTT' | 'PKWT' | 'probation' | 'intern';
export type LifecycleStatus = 'probation' | 'active' | 'on_leave' | 'resigned' | 'terminated';
export type PTKPStatus = 'TK/0' | 'TK/1' | 'TK/2' | 'TK/3' | 'K/0' | 'K/1' | 'K/2' | 'K/3';

export type AttendanceStatus =
  | 'present'
  | 'late'
  | 'early_leave'
  | 'absent'
  | 'on_leave'
  | 'sick'
  | 'holiday'
  | 'day_off';

export interface Bindings {
  DB: D1Database;
  R2?: R2Bucket;
  ASSETS?: Fetcher;
  ENVIRONMENT?: string;
  PURELYMAIL_API_TOKEN?: string;
  PURELYMAIL_DOMAIN?: string;
  PURELYMAIL_FROM_ADDRESS?: string;
  PURELYMAIL_API_BASE_URL?: string;
  PURELYMAIL_SMTP_HOST?: string;
  PURELYMAIL_SMTP_PORT?: string;
  PURELYMAIL_SMTP_USER?: string;
  PURELYMAIL_SMTP_PASS?: string;
  APP_URL?: string;
  JWT_SECRET?: string;
}

export interface JwtPayload {
  userId: string;
  tenantId: string;
  email: string;
  role: UserRole;
  employeeId?: string | null;
  name?: string;
  exp: number;
}

export interface PayrollSettingsModel {
  id: string;
  tenant_id: string;
  effective_date: string;
  bpjs_kesehatan_employer_rate: number;
  bpjs_kesehatan_employee_rate: number;
  bpjs_kesehatan_wage_cap: number;
  bpjs_tk_jht_employer_rate: number;
  bpjs_tk_jht_employee_rate: number;
  bpjs_tk_jp_employer_rate: number;
  bpjs_tk_jp_employee_rate: number;
  bpjs_tk_jp_wage_cap: number;
  bpjs_tk_jkk_rate: number;
  bpjs_tk_jkm_rate: number;
  overtime_divider: number;
  overtime_weekday_first_hour_mult: number;
  overtime_weekday_next_hour_mult: number;
  overtime_holiday_tier1_mult: number;
  overtime_holiday_tier2_mult: number;
  overtime_holiday_tier3_mult: number;
  late_deduction_enabled: number;
  late_deduction_rate_per_minute: number;
  absence_deduction_enabled: number;
  absence_deduction_type: string;
  cuti_bersama_deducts_annual: number;
  prorating_method: string;
  cutoff_day: number;
  thr_payment_rule: string;
  ter_rules_json: string;
  pasal17_rules_json: string;
  ptkp_rates_json: string;
}
