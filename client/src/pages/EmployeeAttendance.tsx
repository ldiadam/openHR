import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlusCircle, CheckCircle2, AlertCircle, AlertTriangle } from 'lucide-react';
import { apiFetch, getLocalDateString, getLocalMonthString, getToken } from '../api';
import { PageSkeleton } from '../components/Skeleton';
import { apiFetchCached } from '../utils/offlineCache';
import { useLanguage } from '../context/LanguageContext';
import { MobileDatePicker } from '../components/pickers/MobileDatePicker';
import { MobileTimePicker } from '../components/pickers/MobileTimePicker';
import { MobileMonthPicker } from '../components/pickers/MobileMonthPicker';

export const EmployeeAttendance: React.FC = () => {
  const navigate = useNavigate();
  const { t, tr, formatDate } = useLanguage();
  const [month, setMonth] = useState(getLocalMonthString());
  const [records, setRecords] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [showCorrectionModal, setShowCorrectionModal] = useState(false);
  const [corrDate, setCorrDate] = useState(getLocalDateString());
  const [corrIn, setCorrIn] = useState('08:30');
  const [corrOut, setCorrOut] = useState('17:30');
  const [corrReason, setCorrReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadAttendance = async () => {
    setLoading(true);
    try {
      const res = await apiFetchCached(`/attendance/my?month=${month}`);
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
      setMsg({ type: 'error', text: err.message || tr('Gagal mengajukan koreksi', 'Failed to submit correction') });
    } finally {
      setSubmitting(false);
    }
  };

  const statusBadge = (status: string, lateMins: number) => {
    switch (status) {
      case 'present':
        return <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-semibold px-2 py-0.5 rounded-md">{t.attendance.presentOnTime}</span>;
      case 'late':
        return <span className="bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-semibold px-2 py-0.5 rounded-md">{t.attendance.late}{lateMins > 0 ? ` ${lateMins}m` : ''}</span>;
      case 'on_leave':
        return <span className="bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-semibold px-2 py-0.5 rounded-md">{t.attendance.onLeave}</span>;
      case 'sick':
        return <span className="bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-semibold px-2 py-0.5 rounded-md">{t.attendance.sick}</span>;
      case 'absent':
        return <span className="bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-semibold px-2 py-0.5 rounded-md">{t.attendance.absent}</span>;
      case 'early_leave':
        return <span className="bg-violet-50 text-violet-700 border border-violet-200 text-[10px] font-semibold px-2 py-0.5 rounded-md">{t.attendance.earlyLeave}</span>;
      default:
        return <span className="bg-slate-100 text-slate-700 border border-slate-200 text-[10px] font-semibold px-2 py-0.5 rounded-md">{status}</span>;
    }
  };

  if (loading) return <PageSkeleton cards={3} rows={5} />;

  return (
    <div className="max-w-md mx-auto space-y-4">
      {/* Header & Month Selector */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">{t.attendance.historyTitle}</h2>
          <p className="text-xs text-slate-500">{tr('Rekap jam kerja & status kehadiran bulanan', 'Monthly work hours & attendance status summary')}</p>
        </div>
        <div className="w-44 shrink-0">
          <MobileMonthPicker value={month} onChange={setMonth} />
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
        <div className="min-w-0 bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[10px] text-slate-400 uppercase font-medium leading-tight block">{t.attendance.presentOnTime}</span>
          <div className="text-base font-bold text-emerald-700 mt-0.5">{summary.present || 0}</div>
        </div>
        <div className="min-w-0 bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[10px] text-slate-400 uppercase font-medium leading-tight block">{t.attendance.late}</span>
          <div className="text-base font-bold text-amber-700 mt-0.5">{summary.late || 0}</div>
        </div>
        <div className="min-w-0 bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[10px] text-slate-400 uppercase font-medium leading-tight block">{t.attendance.totalLate}</span>
          <div className="text-base font-bold text-slate-800 mt-0.5">{summary.totalLateMinutes || 0}m</div>
        </div>
      </div>

      {/* Status legend */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-slate-200 bg-white p-2.5 shadow-2xs">
        <span className="mr-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
          {tr('Status Presensi', 'Attendance Status')}
        </span>
        {statusBadge('present', 0)}
        {statusBadge('late', 0)}
        {statusBadge('early_leave', 0)}
        {statusBadge('on_leave', 0)}
        {statusBadge('sick', 0)}
        {statusBadge('absent', 0)}
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
      <div className="space-y-3">
        {loading ? (
          <p className="text-center text-xs text-slate-400 py-8">{t.common.loading}</p>
        ) : records.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center text-xs text-slate-400 border border-slate-200">
            {records.length === 0 && tr('Belum ada catatan presensi pada bulan ini.', 'No attendance records this month.')}
          </div>
        ) : (
          records.map((r) => (
            <div
              key={r.id}
              className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200/90 shadow-2xs space-y-2.5 transition"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-xs sm:text-sm text-slate-900">{formatDate(r.date)}</span>
                <div>{statusBadge(r.status, r.late_minutes)}</div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-slate-50/80 border border-slate-100 rounded-xl p-2 sm:p-2.5">
                  <span className="text-[10px] text-slate-400 block font-medium uppercase tracking-wider">
                    {t.attendance.todayMasuk}
                  </span>
                  <span className="font-mono font-semibold text-xs sm:text-sm text-slate-800 mt-0.5 block">
                    {r.clock_in_time || '--:--'}
                  </span>
                </div>
                <div className="bg-slate-50/80 border border-slate-100 rounded-xl p-2 sm:p-2.5">
                  <span className="text-[10px] text-slate-400 block font-medium uppercase tracking-wider">
                    {t.attendance.todayPulang}
                  </span>
                  <span className="font-mono font-semibold text-xs sm:text-sm text-slate-800 mt-0.5 block">
                    {r.clock_out_time || '--:--'}
                  </span>
                </div>
              </div>

              {r.clock_in_time && !r.clock_out_time && r.date < getLocalDateString() && (
                <div className="flex items-center gap-1 rounded-lg bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-800">
                  <AlertTriangle size={11} />
                  {tr(
                    'Presensi pulang belum tercatat. Ajukan koreksi presensi.',
                    'Clock-out is missing. Please request an attendance correction.'
                  )}
                </div>
              )}

              {r.is_offline_sync === 1 && (
                <div className="text-[10px] text-amber-600 font-medium flex items-center gap-1 pt-0.5">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                  {t.common.syncedOffline}
                </div>
              )}

              {(r.clock_in_photo_key || r.clock_out_photo_key) && (
                <div className="flex items-center gap-3 pt-0.5 text-[11px] font-semibold">
                  {r.clock_in_photo_key && (
                    <a
                      href={`/api/attendance/${r.id}/photo?type=in&token=${getToken()}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      {tr('Foto Masuk', 'In Photo')}
                    </a>
                  )}
                  {r.clock_out_photo_key && (
                    <a
                      href={`/api/attendance/${r.id}/photo?type=out&token=${getToken()}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-amber-600 hover:underline"
                    >
                      {tr('Foto Pulang', 'Out Photo')}
                    </a>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Correction Modal */}
      {showCorrectionModal && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) setShowCorrectionModal(false);
          }}
        >
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
                <MobileDatePicker value={corrDate} onChange={setCorrDate} placeholder={tr('Pilih tanggal', 'Select date')} />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="min-w-0">
                  <label className="block text-slate-600 font-medium mb-1">{t.attendance.todayMasuk}</label>
                  <MobileTimePicker value={corrIn} onChange={setCorrIn} />
                </div>
                <div className="min-w-0">
                  <label className="block text-slate-600 font-medium mb-1">{t.attendance.todayPulang}</label>
                  <MobileTimePicker value={corrOut} onChange={setCorrOut} />
                </div>
              </div>

              <div>
                <label className="block text-slate-600 font-medium mb-1">{t.attendance.correctionReason} *</label>
                <textarea
                  required
                  rows={3}
                  value={corrReason}
                  onChange={(e) => setCorrReason(e.target.value)}
                  placeholder={tr('Contoh: Lupa clock in', 'Example: Forgot to clock in...')}
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
