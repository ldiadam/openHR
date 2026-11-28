import React from 'react';
import { Download, FileText, X } from 'lucide-react';
import { formatRupiah, formatDateIndo } from '../api';
import { downloadPayslipPdf } from '../utils/payslipPdf';
import { useLanguage } from '../context/LanguageContext';
import { useCompany } from '../context/CompanyContext';
import { useLockBodyScroll } from '../hooks/useLockBodyScroll';

interface PayslipModalProps {
  isOpen: boolean;
  onClose: () => void;
  payslip: any;
}

const comp = (value: any) => Number(value) || 0;

const InfoItem = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="min-w-0">
    <dt className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
    <dd className="truncate text-[11px] font-semibold text-slate-800">{value || '-'}</dd>
  </div>
);

const MoneyRow = ({ label, amount }: { label: string; amount: number }) => (
  <tr>
    <td className="w-[62%] break-words px-3 py-1.5 align-top text-slate-600">{label}</td>
    <td className="w-[38%] whitespace-nowrap px-3 py-1.5 text-right font-medium tabular-nums text-slate-800">
      {formatRupiah(amount)}
    </td>
  </tr>
);

export const PayslipModal: React.FC<PayslipModalProps> = ({ isOpen, onClose, payslip }) => {
  const { tr } = useLanguage();
  const { logoUrl, palette } = useCompany();
  useLockBodyScroll(isOpen);

  if (!isOpen || !payslip) return null;
  const activeLogoUrl = payslip.company_logo_url || logoUrl;

  const prorationDelta = comp(payslip.prorated_salary) - comp(payslip.base_salary);

  const earnings: Array<{ label: string; amount: number }> = [
    { label: tr('Gaji Pokok', 'Base Salary'), amount: comp(payslip.base_salary) },
    ...(prorationDelta !== 0
      ? [
          {
            label: tr(
              `Penyesuaian Prorata (${payslip.days_worked}/${payslip.expected_working_days} hari)`,
              `Proration Adjustment (${payslip.days_worked}/${payslip.expected_working_days} days)`
            ),
            amount: prorationDelta,
          },
        ]
      : []),
    { label: tr('Tunjangan Tetap', 'Fixed Allowance'), amount: comp(payslip.fixed_allowance) },
    ...(comp(payslip.thr_amount) > 0
      ? [
          {
            label: tr('THR (Tunjangan Hari Raya)', 'THR (Holiday Allowance)'),
            amount: comp(payslip.thr_amount),
          },
        ]
      : []),
    ...(comp(payslip.overtime_pay) > 0
      ? [
          {
            label: tr(`Upah Lembur (${payslip.overtime_hours} jam)`, `Overtime Pay (${payslip.overtime_hours} hrs)`),
            amount: comp(payslip.overtime_pay),
          },
        ]
      : []),
    ...(comp(payslip.attendance_bonus) > 0
      ? [{ label: tr('Bonus Kehadiran', 'Attendance Bonus'), amount: comp(payslip.attendance_bonus) }]
      : []),
    ...(comp(payslip.commission_bonus) > 0
      ? [{ label: tr('Komisi / Bonus', 'Commission / Bonus'), amount: comp(payslip.commission_bonus) }]
      : []),
  ];

  // Historical payroll_items saved before reimbursement was separated from gross_earnings
  // may still have reimbursement_amount baked into payslip.gross_earnings; use the sum of
  // actual earning rows so Earnings always reconciles to Gross Earnings.
  const earningsTotal = earnings.reduce((sum, row) => sum + row.amount, 0);
  const grossEarningsDisplay =
    comp(payslip.reimbursement_amount) > 0 &&
    comp(payslip.gross_earnings) === earningsTotal + comp(payslip.reimbursement_amount)
      ? earningsTotal
      : comp(payslip.gross_earnings);

  const deductions: Array<{ label: string; amount: number; kind?: 'alpha' }> = [
    ...(comp(payslip.bpjs_kes_employee) > 0
      ? [{ label: tr('BPJS Kesehatan (1%)', 'BPJS Health (1%)'), amount: comp(payslip.bpjs_kes_employee) }]
      : []),
    ...(comp(payslip.bpjs_jht_employee) > 0
      ? [{ label: tr('BPJS JHT (2%)', 'BPJS JHT (2%)'), amount: comp(payslip.bpjs_jht_employee) }]
      : []),
    ...(comp(payslip.bpjs_jp_employee) > 0
      ? [{ label: tr('BPJS JP (1%)', 'BPJS JP (1%)'), amount: comp(payslip.bpjs_jp_employee) }]
      : []),
    ...(comp(payslip.pph21_amount) > 0
      ? [
          {
            label: tr(`PPh 21 (${payslip.pph21_method})`, `Income Tax PPh 21 (${payslip.pph21_method})`),
            amount: comp(payslip.pph21_amount),
          },
        ]
      : []),
    ...(comp(payslip.kasbon_deduction) > 0
      ? [{ label: tr('Cicilan Kasbon', 'Salary Advance'), amount: comp(payslip.kasbon_deduction) }]
      : []),
    ...(comp(payslip.late_deduction) > 0
      ? [{ label: tr('Potongan Terlambat', 'Late Deduction'), amount: comp(payslip.late_deduction) }]
      : []),
    ...(comp(payslip.unpaid_leave_deduction) > 0
      ? [
          {
            label: tr('Cuti Tidak Berbayar', 'Unpaid Leave'),
            amount: comp(payslip.unpaid_leave_deduction),
          },
        ]
      : []),
    ...(comp(payslip.alpha_deduction) > 0
      ? [
          {
            label: tr('Alpa / Tanpa Keterangan', 'Absence Without Notice'),
            amount: comp(payslip.alpha_deduction),
            kind: 'alpha' as const,
          },
        ]
      : []),
    ...(comp(payslip.other_deductions) > 0
      ? [
          {
            label: tr(
              `Lain-lain (${payslip.other_deductions_reason || 'Koreksi'})`,
              `Other (${payslip.other_deductions_reason || 'Correction'})`
            ),
            amount: comp(payslip.other_deductions),
          },
        ]
      : []),
  ];

  const employerRows = [
    { label: tr('BPJS Kesehatan (4%)', 'BPJS Health (4%)'), amount: comp(payslip.bpjs_kes_employer) },
    { label: tr('BPJS JHT (3.7%)', 'BPJS JHT (3.7%)'), amount: comp(payslip.bpjs_jht_employer) },
    { label: tr('BPJS JP (2%)', 'BPJS JP (2%)'), amount: comp(payslip.bpjs_jp_employer) },
    { label: tr('BPJS JKK (0.24%)', 'BPJS JKK (0.24%)'), amount: comp(payslip.jkk_employer ?? payslip.bpjs_jkk_employer) },
    { label: tr('BPJS JKM (0.3%)', 'BPJS JKM (0.3%)'), amount: comp(payslip.jkm_employer ?? payslip.bpjs_jkm_employer) },
  ].filter((row) => row.amount > 0);

  const periodStart = formatDateIndo(payslip.period_start);
  const periodEnd = formatDateIndo(payslip.period_end);
  const paymentDate = formatDateIndo(payslip.payment_date || payslip.period_end);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-700/70 p-3 backdrop-blur-sm sm:p-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="my-2 w-full max-w-2xl rounded-2xl bg-white shadow-2xl sm:my-6">
        {/* Toolbar */}
        <div className="sticky top-0 z-20 flex items-center justify-between gap-2 rounded-t-2xl border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white">
              <FileText size={15} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-900">{tr('Slip Gaji', 'Payslip')}</p>
              <p className="truncate text-[10px] text-slate-500">{payslip.run_title}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => downloadPayslipPdf({ ...payslip, company_logo_url: activeLogoUrl })}
              className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-[11px] font-semibold text-white transition hover:bg-slate-800 cursor-pointer"
            >
              <Download size={14} />
              <span>{tr('Unduh PDF', 'Download PDF')}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label={tr('Tutup', 'Close')}
              className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700 cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Document */}
        <div className="space-y-5 px-5 py-6 sm:px-8 sm:py-7">
          {/* Letterhead */}
          <div className="flex flex-col gap-3 border-b-2 border-slate-900 pb-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              {activeLogoUrl && (
                <img
                  src={activeLogoUrl}
                  alt={payslip.company_name || 'Company Logo'}
                  className="mb-2 max-h-9 w-auto max-w-[220px] object-contain"
                />
              )}
              <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-slate-500">
                {tr('Slip Gaji Karyawan', 'Employee Payslip')}
              </p>
              <h2 className="mt-1 text-lg font-bold leading-tight text-slate-900">
                {payslip.company_name || 'PT Nusantara Digital Kreasi'}
              </h2>
              <p className="mt-0.5 max-w-md text-[10px] leading-relaxed text-slate-500">
                {payslip.company_address || 'Jl. Jend. Sudirman Kav. 52-53, Jakarta Selatan'}
              </p>
              {payslip.company_npwp && (
                <p className="text-[10px] text-slate-500">NPWP: {payslip.company_npwp}</p>
              )}
            </div>
            <div className="shrink-0 sm:text-right">
              <span className="inline-block rounded bg-slate-900 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.18em] text-white">
                {tr('Rahasia', 'Confidential')}
              </span>
              <p className="mt-2 text-xs font-bold text-slate-900">{payslip.run_title}</p>
              <p className="text-[10px] text-slate-500">
                {tr('Periode', 'Period')}: {periodStart} – {periodEnd}
              </p>
              <p className="text-[10px] text-slate-500">
                {tr('Tanggal Bayar', 'Payment Date')}: {paymentDate}
              </p>
            </div>
          </div>

          {/* Employee data */}
          <div>
            <h3 className="mb-2 border-l-2 border-slate-900 pl-2 text-[10px] font-bold uppercase tracking-wide text-slate-700">
              {tr('Data Karyawan', 'Employee Details')}
            </h3>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2.5 rounded-lg border border-slate-200 bg-slate-50/60 p-3 sm:grid-cols-3">
              <InfoItem label={tr('Nama Karyawan', 'Employee Name')} value={payslip.employee_name} />
              <InfoItem label={tr('NIK / ID', 'Employee ID')} value={payslip.employee_nik} />
              <InfoItem label={tr('Jabatan', 'Job Title')} value={payslip.job_title} />
              <InfoItem label={tr('Departemen', 'Department')} value={payslip.department_name} />
              <InfoItem label={tr('Status PTKP', 'Tax Status')} value={payslip.ptkp_status} />
              <InfoItem
                label={tr('Rekening Bank', 'Bank Account')}
                value={
                  payslip.bank_account_number
                    ? `${payslip.bank_name || '-'} · ${payslip.bank_account_number}`
                    : payslip.bank_name
                    ? `${payslip.bank_name} · ${tr('belum diisi', 'not set')}`
                    : '-'
                }
              />
              <InfoItem
                label={tr('Hari Kerja', 'Working Days')}
                value={`${payslip.days_worked} / ${payslip.expected_working_days} ${tr('hari', 'days')}`}
              />
              <InfoItem
                label={tr('Lembur Disetujui', 'Approved Overtime')}
                value={`${payslip.overtime_hours} ${tr('jam', 'hrs')}`}
              />
              <InfoItem label={tr('Metode Pajak', 'Tax Method')} value={payslip.pph21_method} />
            </dl>
          </div>

          {/* Earnings & deductions — both cards share the same height; the total
              row is pinned to the bottom so the two tables line up. */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:items-stretch">
            <div className="flex flex-col overflow-hidden rounded-lg border border-slate-200">
              <div
                className="flex items-center justify-between px-3 py-2 text-[10px] font-bold uppercase tracking-wide"
                style={{ backgroundColor: palette.primary, color: palette.onPrimary }}
              >
                <span>{tr('Penghasilan', 'Earnings')}</span>
                <span className="font-normal normal-case opacity-85">Rupiah</span>
              </div>
              <table className="w-full table-fixed text-[11px]">
                <tbody className="divide-y divide-slate-100">
                  {earnings.map((row, index) => (
                    <MoneyRow key={`${row.label}-${index}`} label={row.label} amount={row.amount} />
                  ))}
                </tbody>
              </table>
              <div className="mt-auto flex items-center justify-between border-t-2 border-slate-900 bg-slate-50 px-3 py-2 text-[11px] font-bold text-slate-900">
                <span>{tr('Total Penghasilan Bruto', 'Gross Earnings')}</span>
                <span className="tabular-nums">{formatRupiah(grossEarningsDisplay)}</span>
              </div>
            </div>

            <div className="flex flex-col overflow-hidden rounded-lg border border-slate-200">
              <div
                className="flex items-center justify-between px-3 py-2 text-[10px] font-bold uppercase tracking-wide"
                style={{ backgroundColor: palette.primary, color: palette.onPrimary }}
              >
                <span>{tr('Potongan', 'Deductions')}</span>
                <span className="font-normal normal-case opacity-85">Rupiah</span>
              </div>
              <table className="w-full table-fixed text-[11px]">
                <tbody className="divide-y divide-slate-100">
                  {deductions.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="px-3 py-4 text-center text-[10px] italic text-slate-400">
                        {comp(payslip.total_deductions) > 0
                          ? tr(
                              'Rincian potongan tidak tersedia untuk periode ini',
                              'Deduction breakdown unavailable for this period'
                            )
                          : tr('Tidak ada potongan pada periode ini', 'No deductions in this period')}
                      </td>
                    </tr>
                  ) : (
                    deductions.flatMap((row, index) => {
                      const rows = [
                        <MoneyRow key={`${row.label}-${index}`} label={row.label} amount={row.amount} />,
                      ];

                      // Alpha shows its unit basis inline: rate × number of days.
                      if (row.kind === 'alpha') {
                        rows[0] = (
                          <tr key={`${row.label}-${index}`} className="border-t border-slate-100">
                            <td className="px-3 py-2 text-slate-700">
                              <span className="block">{row.label}</span>
                              <span className="block text-[9px] text-slate-500">
                                {formatRupiah(Number(payslip.alpha_daily_rate_exact) || 0)} × {payslip.alpha_days}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-900">
                              {formatRupiah(row.amount)}
                            </td>
                          </tr>
                        );
                      }

                      return rows;
                    })
                  )}
                </tbody>
              </table>
              <div className="mt-auto flex items-center justify-between border-t-2 border-slate-900 bg-slate-50 px-3 py-2 text-[11px] font-bold text-slate-900">
                <span>{tr('Total Potongan', 'Total Deductions')}</span>
                <span className="tabular-nums">{formatRupiah(payslip.total_deductions)}</span>
              </div>
            </div>
          </div>

          {/* Non-earning reimbursement (added to take-home pay, excluded from gross earnings & tax) */}
          {comp(payslip.reimbursement_amount) > 0 && (
            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px]">
              <div>
                <span className="font-semibold text-slate-800">
                  {tr('Reimbursement (Penggantian Biaya)', 'Reimbursement (Expense Claim)')}
                </span>
                <span className="ml-2 text-[10px] text-slate-500">
                  {tr('Bukan penghasilan · Tidak kena pajak', 'Non-earning · Non-taxable')}
                </span>
              </div>
              <span className="font-bold tabular-nums text-emerald-700">
                +{formatRupiah(payslip.reimbursement_amount)}
              </span>
            </div>
          )}

          {/* Net pay */}
          <div className="flex flex-col gap-2 rounded-lg bg-slate-900 px-4 py-3.5 text-white sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-300">
                {tr('Gaji Bersih Diterima', 'Net Take-Home Pay')}
              </p>
              <p className="mt-0.5 text-[10px] text-slate-400">
                {payslip.bank_account_number
                  ? `${tr('Ditransfer ke', 'Transferred to')} ${payslip.bank_name || '-'} · ${payslip.bank_account_number}`
                  : tr('Nomor rekening belum diisi', 'Bank account number not set')}
              </p>
            </div>
            <p className="font-mono text-xl font-black tracking-tight tabular-nums">
              {formatRupiah(payslip.take_home_pay)}
            </p>
          </div>

          {/* Employer contributions */}
          {employerRows.length > 0 && (
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="mb-2 text-[9px] font-bold uppercase tracking-wide text-slate-500">
                {tr('Kontribusi Perusahaan (bukan potongan gaji)', 'Employer Contributions (not deducted from pay)')}
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] text-slate-600 sm:grid-cols-3">
                {employerRows.map((row) => (
                  <div key={row.label} className="flex items-baseline justify-between gap-2">
                    <span className="truncate">{row.label}</span>
                    <span className="shrink-0 font-semibold tabular-nums text-slate-800">{formatRupiah(row.amount)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2 text-[10px] font-bold text-slate-800">
                <span>{tr('Total Beban Perusahaan', 'Total Employer Cost')}</span>
                <span className="tabular-nums">{formatRupiah(payslip.total_employer_cost)}</span>
              </div>
            </div>
          )}

          {/* Signatures */}
          <div className="grid grid-cols-2 gap-6 pt-3 text-center text-[10px] text-slate-600">
            <div>
              <p className="text-[9px] uppercase tracking-wide text-slate-400">
                {tr('Diterima oleh', 'Received by')}
              </p>
              <div className="mx-auto mt-12 w-40 border-t border-dotted border-slate-400 pt-1.5">
                <p className="truncate font-semibold text-slate-800">{payslip.employee_name}</p>
              </div>
            </div>
            <div>
              <p className="text-[9px] uppercase tracking-wide text-slate-400">
                {tr('Disahkan oleh', 'Authorized by')}
              </p>
              <div className="mx-auto mt-12 w-40 border-t border-dotted border-slate-400 pt-1.5">
                <p className="truncate font-semibold text-slate-800">
                  {payslip.approver_name || payslip.company_name || 'HR / Finance'}
                </p>
                {(payslip.approver_title || payslip.authorized_by_company) && (
                  <p className="truncate text-[8px] font-medium uppercase tracking-wide text-slate-400">
                    {payslip.approver_title || tr('Perusahaan', 'Company')}
                  </p>
                )}
              </div>
            </div>
          </div>

          <p className="border-t border-slate-100 pt-3 text-center text-[9px] leading-relaxed text-slate-400">
            {tr(
              'Dokumen ini bersifat rahasia dan dihasilkan otomatis oleh sistem penggajian. Tidak memerlukan tanda tangan basah.',
              'This document is confidential and generated automatically by the payroll system. No wet signature is required.'
            )}
          </p>
        </div>
      </div>
    </div>
  );
};
