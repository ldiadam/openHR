import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  Clock,
  Calendar,
  AlertTriangle,
  FileCheck,
  DollarSign,
  TrendingUp,
  UserPlus,
  ArrowRight,
  ShieldCheck,
  CheckCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiFetch, formatDateIndo } from '../api';

export const HRDashboard: React.FC = () => {
  const { user } = useAuth();
  const [todaySummary, setTodaySummary] = useState<any>({ total: 0, present: 0, late: 0, on_leave: 0, absent: 0 });
  const [contractAlerts, setContractAlerts] = useState<any[]>([]);
  const [pendingCounts, setPendingCounts] = useState({
    corrections: 0,
    leave: 0,
    overtime: 0,
    kasbon: 0,
    reimbursements: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        const todayStr = new Date().toISOString().split('T')[0];
        const [attRes, alertRes, corrRes, lvrRes, otRes, ksbRes, rmbRes] = await Promise.all([
          apiFetch(`/attendance/today?date=${todayStr}`),
          apiFetch('/employees/contract-alerts'),
          apiFetch('/attendance/corrections'),
          apiFetch('/leave/requests'),
          apiFetch('/shifts/overtime/requests'),
          apiFetch('/kasbon/requests'),
          apiFetch('/kasbon/reimbursements'),
        ]);

        setTodaySummary(attRes.summary || {});
        setContractAlerts(alertRes.alerts || []);
        setPendingCounts({
          corrections: (corrRes.corrections || []).filter((c: any) => c.status === 'pending').length,
          leave: (lvrRes.requests || []).filter((r: any) => r.status === 'pending').length,
          overtime: (otRes.requests || []).filter((r: any) => r.status === 'pending').length,
          kasbon: (ksbRes.kasbonList || []).filter((k: any) => k.status === 'pending').length,
          reimbursements: (rmbRes.reimbursements || []).filter((r: any) => r.status === 'pending').length,
        });
      } catch (err: any) {
        console.warn('Dashboard load error:', err.message);
      } finally {
        setLoading(false);
      }
    };
    loadDashboard();
  }, []);

  const totalPending =
    pendingCounts.corrections +
    pendingCounts.leave +
    pendingCounts.overtime +
    pendingCounts.kasbon +
    pendingCounts.reimbursements;

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-linear-to-r from-slate-900 via-blue-950 to-indigo-900 rounded-3xl p-6 md:p-8 text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-blue-600/60 text-blue-200 text-xs px-2.5 py-0.5 rounded-full font-semibold border border-blue-400/30">
              openHR Portal Manajemen
            </span>
            <span className="text-xs text-slate-300">PT Nusantara Digital Kreasi</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
            Selamat Datang, {user?.name}
          </h1>
          <p className="text-xs md:text-sm text-slate-300 mt-1">
            Ringkasan operasional HR, presensi real-time, dan persetujuan hari ini.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/employees"
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shadow-md transition"
          >
            <UserPlus size={16} />
            <span>Tambah Karyawan</span>
          </Link>
          <Link
            to="/payroll"
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold border border-slate-700 transition"
          >
            <DollarSign size={16} />
            <span>Payroll Run</span>
          </Link>
        </div>
      </div>

      {/* Contract Expiry Alerts (30 & 7 days warning) */}
      {contractAlerts.length > 0 && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-3xl p-5 shadow-xs">
          <div className="flex items-center gap-2 text-amber-900 font-bold text-sm mb-3">
            <AlertTriangle size={18} className="text-amber-600" />
            <span>Peringatan Kontrak & Masa Percobaan ({contractAlerts.length} Karyawan)</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {contractAlerts.map((a) => (
              <div
                key={a.id}
                className={`p-3 rounded-2xl bg-white border flex items-center justify-between shadow-2xs ${
                  a.severity === 'danger' ? 'border-rose-400' : 'border-amber-300'
                }`}
              >
                <div>
                  <h4 className="font-bold text-xs text-slate-900">{a.full_name}</h4>
                  <p className="text-[11px] text-slate-500">
                    {a.job_title} • {a.employment_status}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Berakhir: {formatDateIndo(a.contract_end_date)}
                  </p>
                </div>
                <span
                  className={`text-[10px] font-black px-2.5 py-1 rounded-full ${
                    a.severity === 'danger' ? 'bg-rose-100 text-rose-700 animate-pulse' : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {a.days_left} Hari Lagi
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Today's Attendance Metric Cards */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700">
            Presensi Hari Ini ({new Date().toISOString().split('T')[0]})
          </h2>
          <Link to="/attendance" className="text-xs text-blue-600 hover:underline font-semibold flex items-center gap-1">
            Lihat Rekap Lengkap <ArrowRight size={14} />
          </Link>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="bg-white p-4 rounded-3xl border border-slate-200/80 shadow-2xs">
            <span className="text-[11px] font-semibold text-slate-400 block">Total Karyawan</span>
            <div className="text-2xl font-black text-slate-900 mt-1">{todaySummary.total}</div>
          </div>
          <div className="bg-white p-4 rounded-3xl border border-slate-200/80 shadow-2xs">
            <span className="text-[11px] font-semibold text-emerald-600 block">Hadir Tepat Waktu</span>
            <div className="text-2xl font-black text-emerald-600 mt-1">{todaySummary.present}</div>
          </div>
          <div className="bg-white p-4 rounded-3xl border border-slate-200/80 shadow-2xs">
            <span className="text-[11px] font-semibold text-amber-600 block">Terlambat</span>
            <div className="text-2xl font-black text-amber-600 mt-1">{todaySummary.late}</div>
          </div>
          <div className="bg-white p-4 rounded-3xl border border-slate-200/80 shadow-2xs">
            <span className="text-[11px] font-semibold text-blue-600 block">Cuti / Sakit</span>
            <div className="text-2xl font-black text-blue-600 mt-1">{todaySummary.on_leave}</div>
          </div>
          <div className="bg-white p-4 rounded-3xl border border-slate-200/80 shadow-2xs col-span-2 md:col-span-1">
            <span className="text-[11px] font-semibold text-rose-600 block">Belum Hadir / Alpha</span>
            <div className="text-2xl font-black text-rose-600 mt-1">{todaySummary.absent}</div>
          </div>
        </div>
      </div>

      {/* Pending Approvals Summary */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-sm text-slate-900">Kotak Masuk Persetujuan (Pending Approvals)</h3>
            <p className="text-xs text-slate-500">Terdapat {totalPending} pengajuan yang membutuhkan tindakan</p>
          </div>
          <span className="bg-blue-100 text-blue-800 text-xs font-bold px-3 py-1 rounded-full">
            {totalPending} Menunggu
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Link
            to="/leave"
            className="p-3.5 rounded-2xl bg-slate-50 hover:bg-blue-50 border border-slate-200 transition text-center"
          >
            <Calendar size={20} className="mx-auto text-blue-600 mb-1" />
            <div className="text-xs font-bold text-slate-800">Cuti & Izin</div>
            <div className="text-lg font-black text-blue-700">{pendingCounts.leave}</div>
          </Link>

          <Link
            to="/shifts"
            className="p-3.5 rounded-2xl bg-slate-50 hover:bg-amber-50 border border-slate-200 transition text-center"
          >
            <Clock size={20} className="mx-auto text-amber-600 mb-1" />
            <div className="text-xs font-bold text-slate-800">Lembur</div>
            <div className="text-lg font-black text-amber-700">{pendingCounts.overtime}</div>
          </Link>

          <Link
            to="/attendance"
            className="p-3.5 rounded-2xl bg-slate-50 hover:bg-purple-50 border border-slate-200 transition text-center"
          >
            <FileCheck size={20} className="mx-auto text-purple-600 mb-1" />
            <div className="text-xs font-bold text-slate-800">Koreksi Presensi</div>
            <div className="text-lg font-black text-purple-700">{pendingCounts.corrections}</div>
          </Link>

          <Link
            to="/kasbon"
            className="p-3.5 rounded-2xl bg-slate-50 hover:bg-emerald-50 border border-slate-200 transition text-center"
          >
            <DollarSign size={20} className="mx-auto text-emerald-600 mb-1" />
            <div className="text-xs font-bold text-slate-800">Kasbon</div>
            <div className="text-lg font-black text-emerald-700">{pendingCounts.kasbon}</div>
          </Link>

          <Link
            to="/kasbon"
            className="p-3.5 rounded-2xl bg-slate-50 hover:bg-indigo-50 border border-slate-200 transition text-center col-span-2 md:col-span-1"
          >
            <TrendingUp size={20} className="mx-auto text-indigo-600 mb-1" />
            <div className="text-xs font-bold text-slate-800">Reimbursement</div>
            <div className="text-lg font-black text-indigo-700">{pendingCounts.reimbursements}</div>
          </Link>
        </div>
      </div>
    </div>
  );
};
