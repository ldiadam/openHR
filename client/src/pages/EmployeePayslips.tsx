import React, { useState, useEffect } from 'react';
import { DollarSign, ChevronRight, Eye } from 'lucide-react';
import { apiFetchCached } from '../utils/offlineCache';
import { useLanguage } from '../context/LanguageContext';
import { PayslipModal } from '../components/PayslipModal';
import { MobileYearPicker } from '../components/pickers/MobileYearPicker';

export const EmployeePayslips: React.FC = () => {
  const { t, tr, formatDate, formatCurrency } = useLanguage();
  const [payslips, setPayslips] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPayslip, setSelectedPayslip] = useState<any>(null);
  const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));

  const loadPayslips = async () => {
    try {
      const res = await apiFetchCached('/payroll/my-payslips');
      setPayslips(res.payslips || []);
    } catch (err: any) {
      console.warn('Payslips error:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPayslips();
  }, []);

  const openDetail = async (id: string) => {
    try {
      const res = await apiFetchCached(`/payroll/items/${id}/payslip`);
      setSelectedPayslip(res.payslip);
    } catch (err: any) {
      alert(err.message || tr('Gagal membuka slip gaji', 'Failed to open payslip'));
    }
  };

  const availableYears = Array.from(
    new Set([
      String(new Date().getFullYear()),
      ...payslips
        .map((p) => String(p.period_end || p.period_start || '').slice(0, 4))
        .filter((year) => year.length === 4),
    ])
  )
    .map(Number)
    .sort((a, b) => b - a);

  const filteredPayslips = payslips.filter((p) =>
    String(p.period_end || p.period_start || '').startsWith(selectedYear)
  );

  return (
    <div className="max-w-md mx-auto space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-slate-900">{t.nav.payslips}</h2>
          <p className="text-xs text-slate-500">
            {t.payroll.slipGaji} · {selectedYear}
          </p>
        </div>
        <div className="w-28 shrink-0">
          <MobileYearPicker value={selectedYear} onChange={setSelectedYear} years={availableYears} />
        </div>
      </div>

      <div className="space-y-3">
        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((index) => (
              <div key={index} className="rounded-3xl border border-slate-200/80 bg-white p-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 animate-pulse rounded-2xl bg-slate-200" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="h-3 w-1/2 animate-pulse rounded bg-slate-200" />
                    <div className="h-2.5 w-3/4 animate-pulse rounded bg-slate-100" />
                    <div className="h-3.5 w-1/3 animate-pulse rounded bg-slate-200" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : payslips.length === 0 ? (
          <div className="bg-white rounded-3xl p-8 text-center text-xs text-slate-400 border border-slate-200">
            {tr(
              'Belum ada slip gaji yang diterbitkan untuk akun Anda.',
              'No payslips have been issued for your account yet.'
            )}
          </div>
        ) : filteredPayslips.length === 0 ? (
          <div className="bg-white rounded-3xl p-8 text-center text-xs text-slate-400 border border-slate-200">
            {tr('Tidak ada slip gaji pada tahun ini.', 'No payslips in this year.')}
          </div>
        ) : (
          filteredPayslips.map((p) => (
            <div
              key={p.id}
              onClick={() => openDetail(p.id)}
              className="bg-white p-4 rounded-3xl border border-slate-200/80 shadow-2xs hover:border-blue-400 transition cursor-pointer flex items-center justify-between gap-2"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold shrink-0">
                  <DollarSign size={20} />
                </div>
                <div className="min-w-0">
                  <h4 className="font-bold text-xs text-slate-900 truncate">{p.period_title}</h4>
                  <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                    {t.common.period}: {formatDate(p.period_start)} - {formatDate(p.period_end)}
                  </div>
                  <div className="text-sm font-black text-emerald-600 mt-1 truncate">
                    {formatCurrency(p.take_home_pay)}
                  </div>
                </div>
              </div>

              <div className="shrink-0 flex items-center gap-1 text-blue-600 text-xs font-semibold">
                <Eye size={16} />
                <ChevronRight size={16} />
              </div>
            </div>
          ))
        )}
      </div>

      <PayslipModal
        isOpen={!!selectedPayslip}
        onClose={() => setSelectedPayslip(null)}
        payslip={selectedPayslip}
      />
    </div>
  );
};
