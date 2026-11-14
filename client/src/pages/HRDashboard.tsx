import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Clock,
  Calendar,
  AlertTriangle,
  FileCheck,
  TrendingUp,
  ArrowRight,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { apiFetch, getLocalDateString } from '../api';

export const HRDashboard: React.FC = () => {
  const { user } = useAuth();
  const { t, tr, formatDate } = useLanguage();
  const [todaySummary, setTodaySummary] = useState<any>({ total: 0, present: 0, late: 0, on_leave: 0, absent: 0 });
  const [contractAlerts, setContractAlerts] = useState<any[]>([]);
  const [pendingCounts, setPendingCounts] = useState({
    corrections: 0,
    leave: 0,
    overtime: 0,
    reimbursements: 0,
  });
  const [loading, setLoading] = useState(true);
  const [leaveSla, setLeaveSla] = useState<{ open: number; overdue: number }>({ open: 0, overdue: 0 });

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        const todayStr = getLocalDateString();
        const [attRes, alertRes, corrRes, lvrRes, otRes, rmbRes, slaRes] = await Promise.all([
          apiFetch(`/attendance/today?date=${todayStr}`),
          apiFetch('/employees/contract-alerts'),
          apiFetch('/attendance/corrections'),
          apiFetch('/leave/requests'),
          apiFetch('/shifts/overtime/requests'),
          apiFetch('/kasbon/reimbursements'),
          // Applications past their one-working-day notification SLA.
          apiFetch('/leave/sla-summary').catch(() => ({ open: 0, overdue: 0 })),
        ]);

        setLeaveSla({ open: slaRes.open || 0, overdue: slaRes.overdue || 0 });

        setTodaySummary(attRes.summary || {});
        setContractAlerts(alertRes.alerts || []);
        setPendingCounts({
          corrections: (corrRes.corrections || []).filter((c: any) => c.status === 'pending').length,
          leave: (lvrRes.requests || []).filter((r: any) => r.status === 'pending').length,
          overtime: (otRes.requests || []).filter((r: any) => r.status === 'pending').length,
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
    pendingCounts.reimbursements;

  const metricSkeletons = (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {[0, 1, 2, 3, 4].map((index) => (
        <div
          key={index}
          className="rounded-3xl border border-slate-200/80 bg-white p-4 shadow-2xs"
        >
          <div className="h-2.5 w-20 animate-pulse rounded bg-slate-200" />
          <div className="mt-2.5 h-7 w-10 animate-pulse rounded bg-slate-200" />
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div className="rounded-3xl bg-linear-to-r from-slate-900 via-blue-950 to-indigo-900 p-6 text-white shadow-xl md:p-8">
        <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">
          {t.dashboard.welcome}, {user?.name}
        </h1>
      </div>

      {/* Contract Expiry Alerts (30 & 7 days warning) */}
      {contractAlerts.length > 0 && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-3xl p-5 shadow-xs">
          <div className="flex items-center gap-2 text-amber-900 font-bold text-sm mb-3">
            <AlertTriangle size={18} className="text-amber-600" />
            <span>{t.dashboard.contractAlerts} ({contractAlerts.length})</span>
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
                    {t.employees.contractEnd}: {formatDate(a.contract_end_date)}
                  </p>
                </div>
                <span
                  className={`text-[10px] font-black px-2.5 py-1 rounded-full ${
                    a.severity === 'danger' ? 'bg-rose-100 text-rose-700 animate-pulse' : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {a.days_left} {t.employees.daysRemaining}
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
            {t.dashboard.todayAttendance} ({formatDate(getLocalDateString())})
          </h2>
          <Link to="/attendance" className="text-xs text-blue-600 hover:underline font-semibold flex items-center gap-1">
            {t.dashboard.viewReports} <ArrowRight size={14} />
          </Link>
        </div>

        {loading ? (
          metricSkeletons
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white p-4 rounded-3xl border border-slate-200/80 shadow-2xs">
              <span className="text-[11px] font-semibold text-slate-400 block">{t.dashboard.totalHeadcount}</span>
              <div className="text-2xl font-black text-slate-900 mt-1">{todaySummary.total}</div>
            </div>
            <div className="bg-white p-4 rounded-3xl border border-slate-200/80 shadow-2xs">
              <span className="text-[11px] font-semibold text-emerald-600 block">{t.dashboard.present}</span>
              <div className="text-2xl font-black text-emerald-600 mt-1">{todaySummary.present}</div>
            </div>
            <div className="bg-white p-4 rounded-3xl border border-slate-200/80 shadow-2xs">
              <span className="text-[11px] font-semibold text-amber-600 block">{t.dashboard.late}</span>
              <div className="text-2xl font-black text-amber-600 mt-1">{todaySummary.late}</div>
            </div>
            <div className="bg-white p-4 rounded-3xl border border-slate-200/80 shadow-2xs">
              <span className="text-[11px] font-semibold text-blue-600 block">{t.dashboard.onLeave}</span>
              <div className="text-2xl font-black text-blue-600 mt-1">{todaySummary.on_leave}</div>
            </div>
            <div className="bg-white p-4 rounded-3xl border border-slate-200/80 shadow-2xs col-span-2 md:col-span-1">
              <span className="text-[11px] font-semibold text-rose-600 block">{t.dashboard.absent}</span>
              <div className="text-2xl font-black text-rose-600 mt-1">{todaySummary.absent}</div>
            </div>
          </div>
        )}
      </div>

      {/* Pending Approvals Summary */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-sm text-slate-900">{t.dashboard.pendingApprovals}</h3>
            <p className="text-xs text-slate-500">{t.dashboard.pendingSubtitle}</p>
          </div>
          {loading ? (
            <div className="h-6 w-20 animate-pulse rounded-full bg-slate-200" />
          ) : (
            <span className="bg-blue-100 text-blue-800 text-xs font-bold px-3 py-1 rounded-full">
              {totalPending} {t.leave.pending}
            </span>
          )}
        </div>

        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map((index) => (
              <div key={index} className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
                <div className="mx-auto h-5 w-5 animate-pulse rounded bg-slate-200" />
                <div className="mx-auto mt-2 h-2.5 w-20 animate-pulse rounded bg-slate-200" />
                <div className="mx-auto mt-2 h-5 w-8 animate-pulse rounded bg-slate-200" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Link
              to="/leave-applications"
              className="p-3.5 rounded-2xl bg-slate-50 hover:bg-blue-50 border border-slate-200 transition text-center"
            >
              <Calendar size={20} className="mx-auto text-blue-600 mb-1" />
              <div className="text-xs font-bold text-slate-800">{t.dashboard.leaveRequests}</div>
              <div className="text-lg font-black text-blue-700">{leaveSla.open || pendingCounts.leave}</div>
              {leaveSla.overdue > 0 && (
                <div className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-rose-100 px-1.5 py-0.5 text-[9px] font-bold text-rose-700">
                  <AlertTriangle size={9} />
                  {leaveSla.overdue} {tr('lewat SLA', 'past SLA')}
                </div>
              )}
            </Link>

            <Link
              to="/shifts"
              className="p-3.5 rounded-2xl bg-slate-50 hover:bg-amber-50 border border-slate-200 transition text-center"
            >
              <Clock size={20} className="mx-auto text-amber-600 mb-1" />
              <div className="text-xs font-bold text-slate-800">{t.dashboard.overtimeRequests}</div>
              <div className="text-lg font-black text-amber-700">{pendingCounts.overtime}</div>
            </Link>

            <Link
              to="/attendance"
              className="p-3.5 rounded-2xl bg-slate-50 hover:bg-purple-50 border border-slate-200 transition text-center"
            >
              <FileCheck size={20} className="mx-auto text-purple-600 mb-1" />
              <div className="text-xs font-bold text-slate-800">{t.dashboard.corrections}</div>
              <div className="text-lg font-black text-purple-700">{pendingCounts.corrections}</div>
            </Link>

            <Link
              to="/kasbon"
              className="p-3.5 rounded-2xl bg-slate-50 hover:bg-emerald-50 border border-slate-200 transition text-center"
            >
              <TrendingUp size={20} className="mx-auto text-emerald-600 mb-1" />
              <div className="text-xs font-bold text-slate-800">{t.dashboard.reimbursements}</div>
              <div className="text-lg font-black text-emerald-700">{pendingCounts.reimbursements}</div>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
};
