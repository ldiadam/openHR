import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Clock,
  PlusCircle,
  CheckCircle2,
  AlertCircle,
  Calendar,
  ArrowLeft,
  ChevronRight,
} from 'lucide-react';
import { apiFetch } from '../api';
import { useLanguage } from '../context/LanguageContext';

export const EmployeeAttendance: React.FC = () => {
  const navigate = useNavigate();
  const { t, formatDate } = useLanguage();
  const [month, setMonth] = useState(new Date().toISOString().substring(0, 7));
  const [records, setRecords] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [showCorrectionModal, setShowCorrectionModal] = useState(false);
  const [corrDate, setCorrDate] = useState(new Date().toISOString().split('T')[0]);
  const [corrIn, setCorrIn] = useState('08:30');
  const [corrOut, setCorrOut] = useState('17:30');
  const [corrReason, setCorrReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadAttendance = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/attendance/my?month=${month}`);
      setRecords(res.records || []);
      setSummary(res.summary || {});
    } catch (err: any) {
      console.warn('Load attendance err:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAttendance();
  }, [month]);

  const handleCorrectionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setMsg(null);
    try {
      const res = await apiFetch('/attendance/correction', {
        method: 'POST',
        body: JSON.stringify({
          date: corrDate,
          requested_clock_in: corrIn,
          requested_clock_out: corrOut,
          reason: corrReason,
        }),
      });
      setMsg({ type: 'success', text: res.message });
      setShowCorrectionModal(false);
      setCorrReason('');
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Gagal mengajukan koreksi' });
    } finally {
      setSubmitting(false);
    }
  };

  const statusBadge = (status: string, lateMins: number) => {
    switch (status) {
      case 'present':
        return <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-semibold px-2 py-0.5 rounded-md">{t.attendance.presentOnTime}</span>;
      case 'late':
        return <span className="bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-semibold px-2 py-0.5 rounded-md">{t.attendance.late} {lateMins}m</span>;
      case 'on_leave':
        return <span className="bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-semibold px-2 py-0.5 rounded-md">{t.attendance.onLeave}</span>;
      case 'sick':
        return <span className="bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-semibold px-2 py-0.5 rounded-md">{t.attendance.sick}</span>;
      case 'absent':
        return <span className="bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-semibold px-2 py-0.5 rounded-md">{t.attendance.absent}</span>;
      default:
        return <span className="bg-slate-100 text-slate-700 border border-slate-200 text-[10px] font-semibold px-2 py-0.5 rounded-md">{status}</span>;
    }
  };

  return (
    <div className="max-w-md mx-auto space-y-4">
      {/* Top Navigation & Back Bar */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-200">
        <button
          type="button"
          onClick={() => navigate('/app')}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 font-medium text-xs transition cursor-pointer shadow-2xs"
        >
          <ArrowLeft size={14} />
          <span>{t.common.backToHome}</span>
        </button>

        <button
          type="button"
          onClick={() => navigate('/app')}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs transition cursor-pointer shadow-2xs"
        >
          <Clock size={13} />
          <span>{t.attendance.clockIn} / {t.attendance.clockOut}</span>
        </button>
      </div>

      {/* Header & Month Selector */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">{t.attendance.historyTitle}</h2>
          <p className="text-xs text-slate-500">{t.attendance.historySubtitle}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 shadow-2xs">
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="text-xs font-semibold text-slate-900 bg-transparent border-0 p-0 focus:ring-0"
          />
        </div>
      </div>

      {msg && (
        <div
          className={`p-3 rounded-xl text-xs flex items-center justify-between border ${
            msg.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
              : 'bg-rose-50 text-rose-900 border-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {msg.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            <span>{msg.text}</span>
          </div>
          <button onClick={() => setMsg(null)} className="text-xs underline opacity-80 hover:opacity-100">
            {t.common.close}
          </button>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[10px] text-slate-400 uppercase font-medium">{t.attendance.presentOnTime}</span>
          <div className="text-base font-bold text-emerald-700 mt-0.5">{summary.present || 0}</div>
        </div>
        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[10px] text-slate-400 uppercase font-medium">{t.attendance.late}</span>
          <div className="text-base font-bold text-amber-700 mt-0.5">{summary.late || 0}</div>
        </div>
        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[10px] text-slate-400 uppercase font-medium">{t.attendance.totalLate}</span>
          <div className="text-base font-bold text-slate-800 mt-0.5">{summary.totalLateMinutes || 0}m</div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setShowCorrectionModal(true)}
        className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-white border border-slate-300 hover:border-slate-400 text-slate-800 rounded-xl font-medium text-xs transition cursor-pointer shadow-2xs"
      >
        <PlusCircle size={15} />
        <span>{t.attendance.requestCorrection}</span>
      </button>

      {/* Daily Records List */}
      <div className="space-y-2">
        {loading ? (
          <p className="text-center text-xs text-slate-400 py-8">{t.common.loading}</p>
        ) : records.length === 0 ? (
          <div className="bg-white rounded-xl p-8 text-center text-xs text-slate-400 border border-slate-200">
            {records.length === 0 && (summary.present === 0 ? 'Belum ada catatan presensi pada bulan ini.' : 'No attendance records this month.')}
          </div>
        ) : (
          records.map((r) => (
            <div
              key={r.id}
              className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between"
            >
              <div>
                <div className="font-semibold text-xs text-slate-900">{formatDate(r.date)}</div>
                <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                  {t.attendance.todayMasuk}: <span className="text-slate-800 font-medium">{r.clock_in_time || '--:--'}</span> | {t.attendance.todayPulang}: <span className="text-slate-800 font-medium">{r.clock_out_time || '--:--'}</span>
                </div>
                {r.is_offline_sync === 1 && (
                  <span className="text-[9px] text-amber-600 font-medium">{t.common.syncedOffline}</span>
                )}
              </div>
              <div>{statusBadge(r.status, r.late_minutes)}</div>
            </div>
          ))
        )}
      </div>

      {/* Correction Modal */}
      {showCorrectionModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-sm">{t.attendance.requestCorrection}</h3>
              <button
                type="button"
                onClick={() => setShowCorrectionModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCorrectionSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-600 font-medium mb-1">{t.common.date} *</label>
                <input
                  type="date"
                  required
                  value={corrDate}
                  onChange={(e) => setCorrDate(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-lg text-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-600 font-medium mb-1">{t.attendance.todayMasuk}</label>
                  <input
                    type="time"
                    value={corrIn}
                    onChange={(e) => setCorrIn(e.target.value)}
                    className="w-full p-2 border border-slate-300 rounded-lg text-slate-900 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-medium mb-1">{t.attendance.todayPulang}</label>
                  <input
                    type="time"
                    value={corrOut}
                    onChange={(e) => setCorrOut(e.target.value)}
                    className="w-full p-2 border border-slate-300 rounded-lg text-slate-900 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-600 font-medium mb-1">{t.attendance.correctionReason} *</label>
                <textarea
                  required
                  rows={3}
                  value={corrReason}
                  onChange={(e) => setCorrReason(e.target.value)}
                  placeholder="Contoh: Lupa clock in / Forget to clock in..."
                  className="w-full p-2 border border-slate-300 rounded-lg text-slate-900"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCorrectionModal(false)}
                  className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-lg font-medium"
                >
                  {t.common.cancel}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 disabled:opacity-50 transition"
                >
                  {submitting ? t.common.submitting : t.common.submit}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
