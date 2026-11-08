import React, { useState, useEffect } from 'react';
import { DollarSign, FileText, ChevronRight, Eye } from 'lucide-react';
import { apiFetch } from '../api';
import { useLanguage } from '../context/LanguageContext';
import { PayslipModal } from '../components/PayslipModal';

export const EmployeePayslips: React.FC = () => {
  const { t, formatDate, formatCurrency } = useLanguage();
  const [payslips, setPayslips] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPayslip, setSelectedPayslip] = useState<any>(null);

  const loadPayslips = async () => {
    try {
      const res = await apiFetch('/payroll/my-payslips');
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
      const res = await apiFetch(`/payroll/items/${id}/payslip`);
      setSelectedPayslip(res.payslip);
    } catch (err: any) {
      alert(err.message || 'Gagal membuka slip gaji');
    }
  };

  return (
    <div className="max-w-md mx-auto space-y-4">
      <div>
        <h2 className="text-xl font-bold text-slate-900">{t.nav.payslips}</h2>
        <p className="text-xs text-slate-500">
          {t.payroll.slipGaji} - {t.common.all}
        </p>
      </div>

      <div className="space-y-3">
        {loading ? (
          <p className="text-center text-xs text-slate-400 py-8">{t.common.loading}</p>
        ) : payslips.length === 0 ? (
          <div className="bg-white rounded-3xl p-8 text-center text-xs text-slate-400 border border-slate-200">
            Belum ada slip gaji yang diterbitkan untuk akun Anda.
          </div>
        ) : (
          payslips.map((p) => (
            <div
              key={p.id}
              onClick={() => openDetail(p.id)}
              className="bg-white p-4 rounded-3xl border border-slate-200/80 shadow-2xs hover:border-blue-400 transition cursor-pointer flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                  <DollarSign size={20} />
                </div>
                <div>
                  <h4 className="font-bold text-xs text-slate-900">{p.period_title}</h4>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {t.common.period}: {formatDate(p.period_start)} - {formatDate(p.period_end)}
                  </div>
                  <div className="text-sm font-black text-emerald-600 mt-1">
                    {formatCurrency(p.take_home_pay)}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1 text-blue-600 text-xs font-semibold">
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
