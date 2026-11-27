import React from 'react';
import { Edit } from 'lucide-react';

interface PayrollAdjustModalProps {
  isOpen: boolean;
  adjustItem: any;
  attBonus: string;
  setAttBonus: (val: string) => void;
  commBonus: string;
  setCommBonus: (val: string) => void;
  otherDed: string;
  setOtherDed: (val: string) => void;
  otherReason: string;
  setOtherReason: (val: string) => void;
  payFullMonth: boolean;
  setPayFullMonth: (val: boolean) => void;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  formatCurrency: (val: number) => string;
  tr: (id: string, en: string) => string;
}

export const PayrollAdjustModal: React.FC<PayrollAdjustModalProps> = ({
  isOpen,
  adjustItem,
  attBonus,
  setAttBonus,
  commBonus,
  setCommBonus,
  otherDed,
  setOtherDed,
  otherReason,
  setOtherReason,
  payFullMonth,
  setPayFullMonth,
  onClose,
  onSubmit,
  formatCurrency,
  tr,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-sm space-y-4 rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
            <Edit size={18} />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">
              {tr('Penyesuaian Item Payroll', 'Payroll Item Adjustment')}
            </h3>
            <p className="text-[11px] text-slate-500">
              {tr('Karyawan:', 'Employee:')} <strong>{adjustItem?.employee_name}</strong>
            </p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-3 text-xs">
          {adjustItem && Number(adjustItem.days_worked) < Number(adjustItem.expected_working_days) && (
            <label className="flex cursor-pointer items-start gap-2.5 rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <input
                type="checkbox"
                checked={payFullMonth}
                onChange={(e) => setPayFullMonth(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600"
              />
              <div className="min-w-0">
                <div className="font-bold text-slate-900">
                  {tr('Bayar Penuh 1 Bulan (Tanpa Prorate)', 'Pay Full Month (No Prorate)')}
                </div>
                <div className="text-[10px] text-slate-500">
                  {tr(
                    `Hari kerja ${adjustItem.days_worked}/${adjustItem.expected_working_days}. Centang untuk membayar gaji pokok penuh (${formatCurrency(adjustItem.base_salary)}).`,
                    `Worked ${adjustItem.days_worked}/${adjustItem.expected_working_days} days. Check to pay full base salary (${formatCurrency(adjustItem.base_salary)}).`
                  )}
                </div>
              </div>
            </label>
          )}
          <div>
            <label className="mb-1 block font-medium text-slate-700">{tr('Bonus Kehadiran (Rp)', 'Attendance Bonus (Rp)')}</label>
            <input
              type="number"
              value={attBonus}
              onChange={(e) => setAttBonus(e.target.value)}
              className="w-full rounded-xl border border-slate-300 p-2 outline-none focus:border-blue-400"
            />
          </div>
          <div>
            <label className="mb-1 block font-medium text-slate-700">{tr('Komisi / Bonus (Rp)', 'Commission / Bonus (Rp)')}</label>
            <input
              type="number"
              value={commBonus}
              onChange={(e) => setCommBonus(e.target.value)}
              className="w-full rounded-xl border border-slate-300 p-2 outline-none focus:border-blue-400"
            />
          </div>
          <div>
            <label className="mb-1 block font-medium text-slate-700">{tr('Potongan Lain-Lain (Rp)', 'Other Deductions (Rp)')}</label>
            <input
              type="number"
              value={otherDed}
              onChange={(e) => setOtherDed(e.target.value)}
              className="w-full rounded-xl border border-slate-300 p-2 font-bold text-rose-600 outline-none focus:border-blue-400"
            />
          </div>
          <div>
            <label className="mb-1 block font-medium text-slate-700">{tr('Alasan Penyesuaian', 'Adjustment Reason')}</label>
            <textarea
              rows={2}
              value={otherReason}
              onChange={(e) => setOtherReason(e.target.value)}
              placeholder={tr('Koreksi kelebihan bayar bulan lalu...', 'Correction of last month overpayment...')}
              className="w-full rounded-xl border border-slate-300 p-2 outline-none focus:border-blue-400"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100"
            >
              {tr('Batal', 'Cancel')}
            </button>
            <button
              type="submit"
              className="rounded-xl bg-blue-600 px-5 py-2 font-bold text-white shadow-md transition hover:bg-blue-700"
            >
              {tr('Simpan Perubahan', 'Save Changes')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
