-- Exclude non-earning reimbursement_amount from stored gross_earnings on historical payroll_items
UPDATE payroll_items
SET gross_earnings = gross_earnings - reimbursement_amount,
    total_employer_cost = total_employer_cost - reimbursement_amount
WHERE reimbursement_amount > 0
  AND gross_earnings = (
    COALESCE(prorated_salary, 0) +
    COALESCE(fixed_allowance, 0) +
    COALESCE(overtime_pay, 0) +
    COALESCE(attendance_bonus, 0) +
    COALESCE(commission_bonus, 0) +
    COALESCE(thr_amount, 0) +
    COALESCE(reimbursement_amount, 0)
  );

UPDATE payroll_runs
SET total_gross = COALESCE((
  SELECT SUM(gross_earnings) FROM payroll_items WHERE payroll_run_id = payroll_runs.id
), 0);
