import { PayrollSettingsModel, PTKPStatus } from '../types';

export function getTerCategory(ptkp: PTKPStatus | string): 'A' | 'B' | 'C' {
  switch (ptkp) {
    case 'TK/0':
    case 'TK/1':
    case 'K/0':
      return 'A';
    case 'TK/2':
    case 'TK/3':
    case 'K/1':
    case 'K/2':
      return 'B';
    case 'K/3':
      return 'C';
    default:
      return 'A';
  }
}

export function calculateTerPPh21(
  grossMonthlyEarnings: number,
  ptkp: PTKPStatus | string,
  terRulesJson: string
): { rate: number; taxAmount: number; category: 'A' | 'B' | 'C' } {
  const category = getTerCategory(ptkp);
  let terRules: Record<string, Array<{ max: number; rate: number }>> = {};

  try {
    terRules = JSON.parse(terRulesJson);
  } catch {
    terRules = { A: [], B: [], C: [] };
  }

  const brackets = terRules[category] || [];
  let applicableRate = 0;

  for (const bracket of brackets) {
    if (grossMonthlyEarnings <= bracket.max) {
      applicableRate = bracket.rate;
      break;
    }
  }

  const taxAmount = Math.round(grossMonthlyEarnings * applicableRate);
  return { rate: applicableRate, taxAmount, category };
}

export function calculatePasal17Tax(
  pkp: number,
  pasal17RulesJson: string
): number {
  if (pkp <= 0) return 0;
  // DJP standard: PKP rounded down to nearest thousand
  const roundedPkp = Math.floor(pkp / 1000) * 1000;

  let brackets: Array<{ min: number; max: number; rate: number }> = [];
  try {
    brackets = JSON.parse(pasal17RulesJson);
  } catch {
    brackets = [
      { min: 0, max: 60000000, rate: 0.05 },
      { min: 60000000, max: 250000000, rate: 0.15 },
      { min: 250000000, max: 500000000, rate: 0.25 },
      { min: 500000000, max: 5000000000, rate: 0.3 },
      { min: 5000000000, max: 999999999999, rate: 0.35 },
    ];
  }

  let totalTax = 0;
  for (const bracket of brackets) {
    if (roundedPkp > bracket.min) {
      const taxableInBracket = Math.min(roundedPkp, bracket.max) - bracket.min;
      totalTax += taxableInBracket * bracket.rate;
    }
  }

  return Math.round(totalTax);
}

export interface EmployeePayrollInput {
  id: string;
  nik: string;
  full_name: string;
  ptkp_status: PTKPStatus;
  base_salary: number;
  fixed_allowances: number;
  bpjs_wage_basis?: number | null;
  bank_name: string;
  bank_account_number: string;
  
  // Attendance and time data
  days_worked: number;
  expected_working_days: number;
  late_minutes: number;
  unapproved_absence_days: number;
  /** Days with no attendance log and no approved leave/absence justification (alpha). */
  alpha_days?: number;
  
  // Overtime
  overtime_weekday_hours: number;
  overtime_holiday_hours: number;
  
  // Kasbon & reimbursement
  kasbon_deduction: number;
  reimbursement_amount: number;
  
  // Manual additions / deductions
  attendance_bonus?: number;
  commission_bonus?: number;
  thr_amount?: number;
  other_deductions?: number;
  other_deductions_reason?: string;
  
  // Join / Leave in month
  is_new_joiner_mid_month?: boolean;
  is_leaver_mid_month?: boolean;

  // BPJS & Tax Preferences
  has_bpjs_tk?: boolean | number;
  has_bpjs_kes?: boolean | number;
  pays_own_tax?: boolean | number;
  tax_scheme?: string;

  // December / Final recalculation
  is_december_recalc?: boolean;
  prior_months_gross?: number;
  prior_months_tax_paid?: number;
  prior_months_jht_jp?: number;
}

export interface PayrollCalculationResult {
  base_salary: number;
  fixed_allowance: number;
  prorated_salary: number;
  days_worked: number;
  expected_working_days: number;
  
  overtime_hours: number;
  overtime_pay: number;
  attendance_bonus: number;
  commission_bonus: number;
  reimbursement_amount: number;
  thr_amount: number;
  gross_earnings: number;
  
  late_deduction: number;
  unpaid_leave_deduction: number;
  /** Alpha portion of unpaid_leave_deduction, for display on payroll items. */
  alpha_days: number;
  alpha_deduction: number;
  kasbon_deduction: number;
  other_deductions: number;
  other_deductions_reason?: string;
  
  // BPJS Employee
  bpjs_kes_employee: number;
  bpjs_jht_employee: number;
  bpjs_jp_employee: number;
  
  // PPh 21
  pph21_amount: number;
  pph21_method: string;
  
  total_deductions: number;
  take_home_pay: number;
  
  // BPJS Employer
  bpjs_kes_employer: number;
  bpjs_jht_employer: number;
  bpjs_jp_employer: number;
  bpjs_jkk_employer: number;
  bpjs_jkm_employer: number;
  total_employer_cost: number;
}

export function calculateEmployeePayroll(
  input: EmployeePayrollInput,
  settings: PayrollSettingsModel
): PayrollCalculationResult {
  const expectedDays = input.expected_working_days > 0 ? input.expected_working_days : 21;
  const daysWorked = Math.min(input.days_worked, expectedDays);

  // Proration
  let proratedSalary = input.base_salary;
  if ((input.is_new_joiner_mid_month || input.is_leaver_mid_month) && daysWorked < expectedDays) {
    proratedSalary = Math.round((input.base_salary / expectedDays) * daysWorked);
  }

  // Overtime Calculation (wage / 173)
  const monthlyWageForOt = input.base_salary + input.fixed_allowances;
  const hourlyRate = monthlyWageForOt / (settings.overtime_divider || 173);

  // Weekday OT: 1.5x first hour, 2.0x next hours
  let weekdayOtPay = 0;
  if (input.overtime_weekday_hours > 0) {
    const firstHour = Math.min(1, input.overtime_weekday_hours);
    const restHours = Math.max(0, input.overtime_weekday_hours - 1);
    weekdayOtPay =
      firstHour * hourlyRate * (settings.overtime_weekday_first_hour_mult || 1.5) +
      restHours * hourlyRate * (settings.overtime_weekday_next_hour_mult || 2.0);
  }

  // Holiday OT: 2x for first 8 hours, 3x for 9th hour, 4x for 10th+ hours
  let holidayOtPay = 0;
  if (input.overtime_holiday_hours > 0) {
    const h = input.overtime_holiday_hours;
    const tier1 = Math.min(8, h);
    const tier2 = Math.min(1, Math.max(0, h - 8));
    const tier3 = Math.max(0, h - 9);
    holidayOtPay =
      tier1 * hourlyRate * (settings.overtime_holiday_tier1_mult || 2.0) +
      tier2 * hourlyRate * (settings.overtime_holiday_tier2_mult || 3.0) +
      tier3 * hourlyRate * (settings.overtime_holiday_tier3_mult || 4.0);
  }

  const overtimePay = Math.round(weekdayOtPay + holidayOtPay);
  const totalOvertimeHours = input.overtime_weekday_hours + input.overtime_holiday_hours;

  // Deductions: Late & Unapproved Absence
  let lateDeduction = 0;
  if (settings.late_deduction_enabled && input.late_minutes > 0) {
    lateDeduction = Math.round(input.late_minutes * settings.late_deduction_rate_per_minute);
  }

  let unpaidLeaveDeduction = 0;
  if (settings.absence_deduction_enabled && input.unapproved_absence_days > 0) {
    unpaidLeaveDeduction = Math.round((input.base_salary / expectedDays) * input.unapproved_absence_days);
  }

  // Alpha (no-show with no reason) is always deducted at a daily rate. Unlike the
  // optional late/absence deductions above, this is not gated by a settings toggle:
  // an unjustified missing day is unpaid by definition.
  //
  // The divisor is the same expected_working_days used by proration and unpaid
  // leave, and the day count is capped at daysWorked. Otherwise a new joiner would
  // be prorated AND alpha-deducted for the same days, driving net pay negative.
  const alphaDaysRaw = Math.max(0, Math.floor(input.alpha_days || 0));
  const alphaDays = Math.min(alphaDaysRaw, daysWorked);
  const alphaDeduction =
    alphaDays > 0 ? Math.round((input.base_salary / expectedDays) * alphaDays) : 0;

  const attendanceBonus = input.attendance_bonus || 0;
  const commissionBonus = input.commission_bonus || 0;
  const reimbursementAmount = input.reimbursement_amount || 0;
  const thrAmount = input.thr_amount || 0;

  // Gross Earnings (taxable compensation; reimbursements are non-earning expense repayments)
  const grossEarnings =
    proratedSalary +
    input.fixed_allowances +
    overtimePay +
    attendanceBonus +
    commissionBonus +
    thrAmount;

  // BPJS Wage Base (subject to cap)
  const bpjsWageBase = input.bpjs_wage_basis && input.bpjs_wage_basis > 0
    ? input.bpjs_wage_basis
    : input.base_salary + input.fixed_allowances;

  // BPJS Kesehatan (Cap Rp 12M) - Optional per employee
  const hasBpjsKes = input.has_bpjs_kes !== false && input.has_bpjs_kes !== 0;
  const bpjsKesBase = Math.min(bpjsWageBase, settings.bpjs_kesehatan_wage_cap || 12000000);
  const bpjsKesEmployee = hasBpjsKes ? Math.round(bpjsKesBase * settings.bpjs_kesehatan_employee_rate) : 0;
  const bpjsKesEmployer = hasBpjsKes ? Math.round(bpjsKesBase * settings.bpjs_kesehatan_employer_rate) : 0;

  // BPJS TK (JHT, JP, JKK, JKM) - Optional per employee
  const hasBpjsTk = input.has_bpjs_tk !== false && input.has_bpjs_tk !== 0;

  // BPJS TK - JHT (No wage cap)
  const bpjsJhtEmployee = hasBpjsTk ? Math.round(bpjsWageBase * settings.bpjs_tk_jht_employee_rate) : 0;
  const bpjsJhtEmployer = hasBpjsTk ? Math.round(bpjsWageBase * settings.bpjs_tk_jht_employer_rate) : 0;

  // BPJS TK - JP (Cap Rp 10,042,300)
  const bpjsJpBase = Math.min(bpjsWageBase, settings.bpjs_tk_jp_wage_cap || 10042300);
  const bpjsJpEmployee = hasBpjsTk ? Math.round(bpjsJpBase * settings.bpjs_tk_jp_employee_rate) : 0;
  const bpjsJpEmployer = hasBpjsTk ? Math.round(bpjsJpBase * settings.bpjs_tk_jp_employer_rate) : 0;

  // BPJS TK - JKK & JKM (Employer only)
  const bpjsJkkEmployer = hasBpjsTk ? Math.round(bpjsWageBase * settings.bpjs_tk_jkk_rate) : 0;
  const bpjsJkmEmployer = hasBpjsTk ? Math.round(bpjsWageBase * settings.bpjs_tk_jkm_rate) : 0;

  // PPh 21 Calculation (Supports Employee Paying Tax on Their Own)
  let pph21Amount = 0;
  let pph21Method = 'TER';

  const paysOwnTax = input.pays_own_tax === true || input.pays_own_tax === 1 || input.tax_scheme === 'self_paid';

  if (paysOwnTax) {
    pph21Amount = 0;
    pph21Method = 'Pajak Mandiri (Disetor Sendiri oleh Karyawan)';
  } else if (input.is_december_recalc) {
    pph21Method = 'PASAL_17_DECEMBER';
    const totalAnnualGross = (input.prior_months_gross || 0) + grossEarnings;
    const biayaJabatan = Math.min(totalAnnualGross * 0.05, 6000000);
    const annualJhtJp = (input.prior_months_jht_jp || 0) + (bpjsJhtEmployee + bpjsJpEmployee);
    const netAnnual = totalAnnualGross - biayaJabatan - annualJhtJp;

    let ptkpMap: Record<string, number> = {};
    try {
      ptkpMap = JSON.parse(settings.ptkp_rates_json);
    } catch {
      ptkpMap = { 'TK/0': 54000000 };
    }
    const ptkpValue = ptkpMap[input.ptkp_status] || 54000000;
    const pkp = Math.max(0, netAnnual - ptkpValue);
    const annualTax = calculatePasal17Tax(pkp, settings.pasal17_rules_json);
    const priorTaxPaid = input.prior_months_tax_paid || 0;
    pph21Amount = Math.max(0, annualTax - priorTaxPaid);
  } else {
    // Normal Month TER
    const terResult = calculateTerPPh21(grossEarnings, input.ptkp_status, settings.ter_rules_json);
    pph21Amount = terResult.taxAmount;
    pph21Method = `TER_${terResult.category} (${(terResult.rate * 100).toFixed(2)}%)`;
  }

  const kasbonDeduction = input.kasbon_deduction || 0;
  const otherDeductions = input.other_deductions || 0;

  const totalDeductions =
    lateDeduction +
    unpaidLeaveDeduction +
    alphaDeduction +
    kasbonDeduction +
    otherDeductions +
    bpjsKesEmployee +
    bpjsJhtEmployee +
    bpjsJpEmployee +
    pph21Amount;

  const takeHomePay = grossEarnings - totalDeductions + reimbursementAmount;

  const totalEmployerCost =
    grossEarnings +
    bpjsKesEmployer +
    bpjsJhtEmployer +
    bpjsJpEmployer +
    bpjsJkkEmployer +
    bpjsJkmEmployer;

  return {
    base_salary: input.base_salary,
    fixed_allowance: input.fixed_allowances,
    prorated_salary: proratedSalary,
    days_worked: daysWorked,
    expected_working_days: expectedDays,
    overtime_hours: totalOvertimeHours,
    overtime_pay: overtimePay,
    attendance_bonus: attendanceBonus,
    commission_bonus: commissionBonus,
    reimbursement_amount: reimbursementAmount,
    thr_amount: thrAmount,
    gross_earnings: grossEarnings,
    late_deduction: lateDeduction,
    unpaid_leave_deduction: unpaidLeaveDeduction,
    alpha_days: alphaDays,
    alpha_deduction: alphaDeduction,
    kasbon_deduction: kasbonDeduction,
    other_deductions: otherDeductions,
    other_deductions_reason: input.other_deductions_reason,
    bpjs_kes_employee: bpjsKesEmployee,
    bpjs_jht_employee: bpjsJhtEmployee,
    bpjs_jp_employee: bpjsJpEmployee,
    pph21_amount: pph21Amount,
    pph21_method: pph21Method,
    total_deductions: totalDeductions,
    take_home_pay: takeHomePay,
    bpjs_kes_employer: bpjsKesEmployer,
    bpjs_jht_employer: bpjsJhtEmployer,
    bpjs_jp_employer: bpjsJpEmployer,
    bpjs_jkk_employer: bpjsJkkEmployer,
    bpjs_jkm_employer: bpjsJkmEmployer,
    total_employer_cost: totalEmployerCost,
  };
}
