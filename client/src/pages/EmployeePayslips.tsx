import React, { useState, useEffect } from 'react';
import { ArrowLeft, DollarSign, ChevronRight, FileText } from 'lucide-react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../api';
import { apiFetchCached } from '../utils/offlineCache';
import { useLanguage } from '../context/LanguageContext';
import { useCompany } from '../context/CompanyContext';
import { PayslipModal } from '../components/PayslipModal';
import { MobileYearPicker } from '../components/pickers/MobileYearPicker';
import { downloadTaxSlip1721Pdf } from '../utils/taxSlipPdf';

export const EmployeePayslips: React.FC = () => {
  const { t, tr, formatDate, formatCurrency } = useLanguage();
  const { palette } = useCompany();
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

  const handleDownload1721 = async () => {
    try {
      const res = await apiFetch(`/payroll/tax-slips?year=${selectedYear}`);
      const slip = res?.slips?.[0];
      if (!slip) {
        alert(tr('Belum ada data penggajian terkunci untuk tahun pajak ini.', 'No locked payroll data for this tax year yet.'));
        return;
      }
      downloadTaxSlip1721Pdf(slip);
    } catch (err: any) {
      alert(err.message || tr('Gagal mengunduh Bukti Potong 1721-A1', 'Failed to download 1721-A1 tax slip'));
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
    <div className="max-w-md mx-auto pb-8">
      {/* Colored Hero Header */}
      <div
        className="px-4 pt-5 pb-8 rounded-b-[28px] md:rounded-3xl shadow-sm"
        style={{ background: palette.gradient, color: palette.onPrimary, viewTransitionName: 'ess-hero' }}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <Link
              to="/app"
              viewTransition
              className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center shrink-0"
              aria-label={tr('Kembali', 'Back')}
            >
              <ArrowLeft size={18} />
            </Link>
            <div className="min-w-0">
              <h2 className="text-base font-bold truncate">{t.nav.payslips}</h2>
              <p className="text-[11px] opacity-85 truncate">
                {t.payroll.slipGaji} · {selectedYear}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleDownload1721}
              className="inline-flex items-center gap-1 rounded-full bg-white/20 hover:bg-white/30 px-3 py-1.5 text-[11px] font-bold cursor-pointer"
            >
              <FileText size={13} />
              <span>1721-A1</span>
            </button>
            <div className="w-24 text-slate-900">
              <MobileYearPicker value={selectedYear} onChange={setSelectedYear} years={availableYears} />
            </div>
          </div>
        </div>
      </div>

      {/* Overlapping Payslip Cards */}
      <div className="-mt-4 px-4 relative z-20 space-y-2.5">
        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((index) => (
              <div key={index} className="rounded-3xl border border-slate-200/80 bg-white p-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 animate-pulse rounded-2xl bg-slate-200" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="h-3 w-1/2 animate-pulse rounded bg-slate-200" />
                    <div className="h-2.5 w-3/4 animate-pulse rounded bg-slate-100" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : payslips.length === 0 ? (
          <div className="bg-white rounded-3xl p-8 text-center text-xs text-slate-400 border border-slate-200/80 shadow-xs">
            {tr(
              'Belum ada slip gaji yang diterbitkan untuk akun Anda.',
              'No payslips have been issued for your account yet.'
            )}
          </div>
        ) : filteredPayslips.length === 0 ? (
          <div className="bg-white rounded-3xl p-8 text-center text-xs text-slate-400 border border-slate-200/80 shadow-xs">
            {tr('Tidak ada slip gaji pada tahun ini.', 'No payslips in this year.')}
          </div>
        ) : (
          filteredPayslips.map((p) => (
            <div
              key={p.id}
              onClick={() => openDetail(p.id)}
              className="bg-white p-4 rounded-3xl border border-slate-100 shadow-xs hover:shadow-md transition cursor-pointer flex items-center justify-between gap-3"
            >
              <div className="min-w-0 flex-1">
                <h4 className="font-bold text-sm text-slate-900 truncate">{p.period_title}</h4>
                <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                  {formatDate(p.period_start)} – {formatDate(p.period_end)}
                </div>
              </div>

              <div className="shrink-0 flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 text-white px-3 py-1.5 text-xs font-bold shadow-2xs font-mono">
                  <DollarSign size={12} />
                  {formatCurrency(p.take_home_pay)}
                </span>
                <ChevronRight size={16} className="text-slate-400" />
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
