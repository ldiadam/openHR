import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  PlusCircle,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  MapPin,
  Briefcase,
  Calendar,
  Clock,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { apiFetch, getLocalDateString, getLocalMonthString, getToken } from '../api';
import { PageSkeleton } from '../components/Skeleton';
import { apiFetchCached } from '../utils/offlineCache';
import { useLanguage } from '../context/LanguageContext';
import { useCompany } from '../context/CompanyContext';
import { MobileDatePicker } from '../components/pickers/MobileDatePicker';
import { MobileTimePicker } from '../components/pickers/MobileTimePicker';
import { MobileMonthPicker } from '../components/pickers/MobileMonthPicker';

export const EmployeeAttendance: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t, tr, lang, formatDate } = useLanguage();
  const { palette } = useCompany();
  const [activeTab, setActiveTab] = useState<'attendance' | 'visits'>('attendance');
  const [month, setMonth] = useState(getLocalMonthString());
  const [records, setRecords] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({});
  const [visits, setVisits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCorrectionModal, setShowCorrectionModal] = useState(false);
  const [corrDate, setCorrDate] = useState(getLocalDateString());
  const [corrIn, setCorrIn] = useState('08:30');
  const [corrOut, setCorrOut] = useState('17:30');
  const [corrReason, setCorrReason] = useState('');
  const [showVisitModal, setShowVisitModal] = useState(false);
  const [visitClient, setVisitClient] = useState('');
  const [visitCompany, setVisitCompany] = useState('');
  const [visitPurpose, setVisitPurpose] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadAttendance = async () => {
    setLoading(true);
    try {
      const [res, visitRes] = await Promise.all([
        apiFetchCached(`/attendance/my?month=${month}`),
        apiFetch('/client-visits?scope=mine').catch(() => ({ visits: [] })),
      ]);
      setRecords(res.records || []);
      setSummary(res.summary || {});
      setVisits(visitRes.visits || []);
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

  const getCoords = (): Promise<{ latitude?: number; longitude?: number }> =>
    new Promise((resolve) => {
      if (!navigator.geolocation) return resolve({});
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        () => resolve({}),
        { enableHighAccuracy: true, timeout: 6000 }
      );
    });

  const handleVisitCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setMsg(null);
    try {
      const coords = await getCoords();
      const res = await apiFetch('/client-visits/check-in', {
        method: 'POST',
        body: JSON.stringify({
          client_name: visitClient,
          company_name: visitCompany,
          purpose: visitPurpose,
          ...coords,
        }),
      });
      setMsg({ type: 'success', text: res.message });
      setShowVisitModal(false);
      setVisitClient('');
      setVisitCompany('');
      setVisitPurpose('');
      loadAttendance();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleVisitCheckOut = async (visitId: string) => {
    setSubmitting(true);
    try {
      const coords = await getCoords();
      const res = await apiFetch(`/client-visits/${visitId}/check-out`, {
        method: 'POST',
        body: JSON.stringify({ ...coords }),
      });
      setMsg({ type: 'success', text: res.message });
      loadAttendance();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
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
    <div className="max-w-md mx-auto pb-8">
      {/* Colored Hero Header */}
      <div
        className="px-4 pt-5 pb-5 rounded-b-3xl md:rounded-3xl shadow-sm"
        style={{ background: palette.gradient, color: palette.onPrimary, viewTransitionName: 'ess-hero' }}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => navigate('/app', { viewTransition: true })}
              className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center shrink-0 cursor-pointer"
              aria-label={tr('Kembali', 'Back')}
            >
              <ArrowLeft size={18} />
            </button>
            <div className="min-w-0">
              <h2 className="text-base font-bold truncate">{tr('Riwayat Presensi', 'Attendance History')}</h2>
              <p className="text-[11px] opacity-85 truncate">
                {tr('Rekap jam kerja, koreksi & kunjungan', 'Monthly hours, corrections & visits')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowCorrectionModal(true)}
            className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center shrink-0 cursor-pointer"
            title={t.attendance.requestCorrection}
          >
            <PlusCircle size={18} />
          </button>
        </div>

        {/* Horizontal Tab Strip */}
        <div className="mt-4 flex items-center gap-2 overflow-x-auto no-scrollbar">
          {[
            { id: 'attendance' as const, label: tr('Kehadiran', 'Attendance'), icon: CheckCircle2 },
            { id: 'visits' as const, label: tr('Kunjungan', 'Visits'), icon: Briefcase },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                  isActive
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'bg-white/15 text-white/90 hover:bg-white/25'
                }`}
              >
                <Icon size={14} style={isActive ? { color: palette.primary } : undefined} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-4 pt-4 space-y-4">
        {/* Month Selector & Correction Button */}
        <div className="flex items-center justify-between gap-2">
          <div className="w-44">
            <MobileMonthPicker value={month} onChange={setMonth} />
          </div>
          <button
            type="button"
            onClick={() => setShowCorrectionModal(true)}
            className="inline-flex items-center gap-1.5 py-2 px-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 rounded-xl font-semibold text-xs transition cursor-pointer shadow-2xs"
          >
            <PlusCircle size={14} style={{ color: palette.primary }} />
            <span>{tr('Koreksi', 'Correction')}</span>
          </button>
        </div>

        {msg && (
          <div
            className={`p-3 rounded-2xl text-xs flex items-center justify-between border ${
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

        {activeTab === 'visits' ? (
          /* Client Visits Section */
          <div className="bg-white rounded-3xl border border-slate-200/80 p-4 space-y-3 shadow-2xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Briefcase size={15} style={{ color: palette.primary }} />
                <h3 className="text-xs font-bold text-slate-900">{tr('Kunjungan Klien', 'Client Visits')}</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowVisitModal(true)}
                style={{ backgroundColor: palette.primary, color: palette.onPrimary }}
                className="inline-flex items-center gap-1 rounded-full px-3.5 py-1.5 text-[11px] font-bold shadow-2xs hover:opacity-95 cursor-pointer"
              >
                <MapPin size={12} /> {tr('Check-In Klien', 'Client Check-In')}
              </button>
            </div>
            {visits.length === 0 ? (
              <p className="text-[11px] text-slate-400 py-4 text-center">
                {tr('Belum ada kunjungan klien tercatat.', 'No client visits logged yet.')}
              </p>
            ) : (
              <div className="space-y-2">
                {visits.slice(0, 10).map((v) => (
                  <div
                    key={v.id}
                    className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/70 p-3 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-slate-900 truncate">
                        {v.client_name}
                        {v.company_name ? ` · ${v.company_name}` : ''}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {formatDate(v.visit_date)} · {String(v.check_in_time || '').slice(0, 5)} →{' '}
                        {v.check_out_time ? String(v.check_out_time).slice(0, 5) : '--:--'}
                      </div>
                    </div>
                    {v.status !== 'completed' ? (
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => handleVisitCheckOut(v.id)}
                        className="shrink-0 rounded-full bg-emerald-600 px-3 py-1 text-[10px] font-bold text-white hover:bg-emerald-700 cursor-pointer"
                      >
                        {tr('Check-Out', 'Check-Out')}
                      </button>
                    ) : (
                      <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700">
                        {tr('Selesai', 'Done')}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Attendance Summary & Daily Records */
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="min-w-0 bg-white p-3 rounded-2xl border border-slate-200/80 shadow-2xs">
                <span className="text-[10px] text-slate-400 uppercase font-semibold leading-tight block">
                  {t.attendance.presentOnTime}
                </span>
                <div className="text-lg font-black text-emerald-600 mt-0.5">{summary.present || 0}</div>
              </div>
              <div className="min-w-0 bg-white p-3 rounded-2xl border border-slate-200/80 shadow-2xs">
                <span className="text-[10px] text-slate-400 uppercase font-semibold leading-tight block">
                  {t.attendance.late}
                </span>
                <div className="text-lg font-black text-amber-600 mt-0.5">{summary.late || 0}</div>
              </div>
              <div className="min-w-0 bg-white p-3 rounded-2xl border border-slate-200/80 shadow-2xs">
                <span className="text-[10px] text-slate-400 uppercase font-semibold leading-tight block">
                  {t.attendance.totalLate}
                </span>
                <div className="text-lg font-black text-slate-800 mt-0.5">{summary.totalLateMinutes || 0}m</div>
              </div>
            </div>

            <div className="space-y-2.5">
              {records.length === 0 ? (
                <div className="bg-white rounded-3xl p-8 text-center text-xs text-slate-400 border border-slate-200/80">
                  {tr('Belum ada catatan presensi pada bulan ini.', 'No attendance records this month.')}
                </div>
              ) : (
                records.map((r) => (
                  <div
                    key={r.id}
                    className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs space-y-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-xs sm:text-sm text-slate-900">{formatDate(r.date)}</span>
                      <div>{statusBadge(r.status, r.late_minutes)}</div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-slate-50 border border-slate-100 rounded-xl p-2.5">
                        <span className="text-[10px] text-slate-400 block font-medium uppercase tracking-wider">
                          {t.attendance.todayMasuk}
                        </span>
                        <span className="font-mono font-bold text-sm text-slate-800 mt-0.5 block">
                          {r.clock_in_time || '--:--'}
                        </span>
                      </div>
                      <div className="bg-slate-50 border border-slate-100 rounded-xl p-2.5">
                        <span className="text-[10px] text-slate-400 block font-medium uppercase tracking-wider">
                          {t.attendance.todayPulang}
                        </span>
                        <span className="font-mono font-bold text-sm text-slate-800 mt-0.5 block">
                          {r.clock_out_time || '--:--'}
                        </span>
                      </div>
                    </div>

                    {r.clock_in_time && !r.clock_out_time && r.date < getLocalDateString() && (
                      <div className="flex items-center gap-1 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[10px] font-semibold text-amber-800">
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
                            style={{ color: palette.primary }}
                            className="hover:underline"
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
          </div>
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

      {/* Client Visit Check-In Modal */}
      {showVisitModal && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) setShowVisitModal(false);
          }}
        >
          <div className="flex max-h-[90vh] w-full max-w-sm flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-3.5">
              <h3 className="font-bold text-slate-900 text-sm">{tr('Check-In Kunjungan Klien', 'Client Visit Check-In')}</h3>
              <button type="button" onClick={() => setShowVisitModal(false)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
            </div>
            <form onSubmit={handleVisitCheckIn} className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-5 text-xs">
              <div>
                <label className="block text-slate-600 font-medium mb-1">{tr('Nama Klien / PIC *', 'Client / Contact Name *')}</label>
                <input required value={visitClient} onChange={(e) => setVisitClient(e.target.value)} placeholder="e.g. Bpk. Hendra" className="w-full p-2.5 border border-slate-300 rounded-xl" />
              </div>
              <div>
                <label className="block text-slate-600 font-medium mb-1">{tr('Perusahaan / Lokasi', 'Company / Site')}</label>
                <input value={visitCompany} onChange={(e) => setVisitCompany(e.target.value)} placeholder="e.g. PT Maju Bersama" className="w-full p-2.5 border border-slate-300 rounded-xl" />
              </div>
              <div>
                <label className="block text-slate-600 font-medium mb-1">{tr('Tujuan Kunjungan', 'Visit Purpose')}</label>
                <textarea rows={2} value={visitPurpose} onChange={(e) => setVisitPurpose(e.target.value)} placeholder={tr('Presentasi / Maintenance / Survei...', 'Presentation / Maintenance / Survey...')} className="w-full p-2.5 border border-slate-300 rounded-xl" />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setShowVisitModal(false)} className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-lg font-medium">{t.common.cancel}</button>
                <button type="submit" disabled={submitting} className="px-4 py-1.5 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 disabled:opacity-50">
                  {submitting ? '...' : tr('Check-In Sekarang', 'Check-In Now')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
