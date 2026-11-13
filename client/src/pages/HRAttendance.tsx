import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Upload,
  Calendar,
  ArrowLeft,
  Trash2,
  MapPin,
  Image as ImageIcon,
  Smartphone,
  ScanLine,
  X,
} from 'lucide-react';
import { apiFetch, getLocalDateString, getToken } from '../api';
import { TableSkeleton } from '../components/Skeleton';
import { LocationMap } from '../components/LocationMap';
import { useLanguage } from '../context/LanguageContext';

export const HRAttendance: React.FC = () => {
  const navigate = useNavigate();
  const { t, tr, formatDate } = useLanguage();
  const [activeTab, setActiveTab] = useState<'today' | 'recap' | 'corrections'>('today');
  const [selectedDate, setSelectedDate] = useState(getLocalDateString());
  const [todayData, setTodayData] = useState<any>({ summary: {}, records: [] });
  const [corrections, setCorrections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFpModal, setShowFpModal] = useState(false);
  const [fpText, setFpText] = useState('');
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string; date: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [detailRecord, setDetailRecord] = useState<any>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [todayRes, corrRes] = await Promise.all([
        apiFetch(`/attendance/today?date=${selectedDate}`),
        apiFetch('/attendance/corrections'),
      ]);
      setTodayData(todayRes);
      setCorrections(corrRes.corrections || []);
    } catch (err: any) {
      console.warn('Attendance err:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedDate, activeTab]);

  const handleReviewCorrection = async (id: string, status: 'approved' | 'rejected') => {
    const note = prompt(
      tr(
        `Catatan ${status === 'approved' ? 'persetujuan' : 'penolakan'} (opsional):`,
        `Review note for ${status === 'approved' ? 'approval' : 'rejection'} (optional):`
      )
    );
    try {
      const res = await apiFetch(`/attendance/corrections/${id}/review`, {
        method: 'POST',
        body: JSON.stringify({ status, note }),
      });
      setMsg({ type: 'success', text: res.message });
      loadData();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    }
  };

  const handleImportFingerprint = async () => {
    // Expected format per line: EMP001,2026-10-05,08:25:00,in
    const lines = fpText.trim().split('\n');
    const logs = lines
      .map((l) => {
        const parts = l.split(',');
        if (parts.length >= 4) {
          return {
            nik: parts[0].trim(),
            date: parts[1].trim(),
            time: parts[2].trim(),
            type: parts[3].trim().toLowerCase(),
          };
        }
        return null;
      })
      .filter(Boolean);

    if (logs.length === 0) {
      alert(tr('Format log fingerprint tidak valid. Contoh per baris: EMP001,2026-10-05,08:25:00,in', 'Invalid fingerprint log format. Example per line: EMP001,2026-10-05,08:25:00,in'));
      return;
    }

    try {
      const res = await apiFetch('/attendance/import-fingerprint', {
        method: 'POST',
        body: JSON.stringify({ logs }),
      });
      setMsg({ type: 'success', text: res.message });
      setShowFpModal(false);
      setFpText('');
      loadData();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await apiFetch(`/attendance/${deleteTarget.id}`, { method: 'DELETE' });
      setMsg({ type: 'success', text: res.message || tr('Data presensi berhasil dihapus.', 'Attendance record deleted successfully.') });
      setDeleteTarget(null);
      await loadData();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || tr('Gagal menghapus data presensi.', 'Failed to delete attendance record.') });
    } finally {
      setDeleting(false);
    }
  };

  const statusBadge = (status: string, lateMins: number) => {
    switch (status) {
      case 'present':
        return <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded">{t.attendance.presentOnTime}</span>;
      case 'late':
        return <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded">{t.attendance.late} {lateMins}m</span>;
      case 'on_leave':
        return <span className="bg-blue-100 text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded">{t.attendance.onLeave}</span>;
      case 'sick':
        return <span className="bg-indigo-100 text-indigo-800 text-[10px] font-bold px-2 py-0.5 rounded">{t.attendance.sick}</span>;
      case 'absent':
        return <span className="bg-rose-100 text-rose-800 text-[10px] font-bold px-2 py-0.5 rounded">{t.attendance.absent}</span>;
      case 'early_leave':
        return <span className="bg-violet-100 text-violet-800 text-[10px] font-bold px-2 py-0.5 rounded">{t.attendance.earlyLeave}</span>;
      default:
        return <span className="bg-slate-100 text-slate-700 text-[10px] font-bold px-2 py-0.5 rounded">{status}</span>;
    }
  };

  const sourceLabel = (source?: string) => {
    switch (source) {
      case 'fingerprint':
        return tr('Fingerprint', 'Fingerprint');
      case 'manual':
        return tr('Manual HR', 'Manual HR');
      case 'mobile':
        return tr('Mobile (GPS + Selfie)', 'Mobile (GPS + Selfie)');
      default:
        return source || '-';
    }
  };

  const formatDistance = (meters: any) => {
    if (meters === null || meters === undefined || meters === '') return null;
    const value = Number(meters);
    if (Number.isNaN(value)) return null;
    return value >= 1000 ? `${(value / 1000).toFixed(2)} km` : `${Math.round(value)} m`;
  };

  const correctionStatusLabel = (status: string) => {
    switch (status) {
      case 'approved':
        return tr('Disetujui', 'Approved');
      case 'rejected':
        return tr('Ditolak', 'Rejected');
      case 'pending':
        return tr('Menunggu', 'Pending');
      default:
        return status;
    }
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumb Navigation */}
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900 font-medium transition cursor-pointer"
        >
          <ArrowLeft size={13} />
          <span>{t.nav.dashboard}</span>
        </button>
        <span className="text-slate-300">/</span>
        <span className="font-semibold text-slate-800">{t.attendance.title}</span>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">{t.attendance.title}</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {t.attendance.subtitle}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFpModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold shadow-2xs cursor-pointer"
          >
            <Upload size={15} />
            <span>{t.attendance.importFingerprint}</span>
          </button>
        </div>
      </div>

      {msg && (
        <div
          className={`p-4 rounded-2xl text-xs flex items-center gap-2 shadow-2xs ${
            msg.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          {msg.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span className="flex-1 font-medium">{msg.text}</span>
          <button onClick={() => setMsg(null)}>✕</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-6 text-xs font-bold text-slate-500">
        <button
          onClick={() => setActiveTab('today')}
          className={`pb-3 transition border-b-2 -mb-px ${
            activeTab === 'today' ? 'border-blue-600 text-blue-600' : 'border-transparent hover:text-slate-800'
          }`}
        >
          {tr('Kehadiran Hari Ini', "Today's Attendance")}
        </button>
        <button
          onClick={() => setActiveTab('corrections')}
          className={`pb-3 transition border-b-2 -mb-px flex items-center gap-1.5 ${
            activeTab === 'corrections' ? 'border-blue-600 text-blue-600' : 'border-transparent hover:text-slate-800'
          }`}
        >
          <span>{tr('Inbox Koreksi Presensi', 'Attendance Correction Inbox')}</span>
          {corrections.filter((c) => c.status === 'pending').length > 0 && (
            <span className="bg-amber-500 text-white text-[10px] px-1.5 py-0.2 rounded-full">
              {corrections.filter((c) => c.status === 'pending').length}
            </span>
          )}
        </button>
      </div>

      {activeTab === 'today' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-700">{tr('Pilih Tanggal:', 'Select Date:')}</span>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="text-xs border border-slate-300 rounded-xl px-3 py-1.5 bg-white font-medium shadow-2xs"
              />
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200/80 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4 font-bold">{tr('Karyawan', 'Employee')}</th>
                    <th className="py-3 px-4 font-bold">{tr('Masuk / Pulang', 'In / Out')}</th>
                    <th className="py-3 px-4 font-bold">{tr('Status', 'Status')}</th>
                    <th className="py-3 px-4 font-bold">{tr('Lokasi & Jarak', 'Location & Distance')}</th>
                    <th className="py-3 px-4 font-bold">{tr('Bukti', 'Evidence')}</th>
                    <th className="py-3 px-4 font-bold">{tr('Sumber', 'Source')}</th>
                    <th className="py-3 px-4 font-bold text-right">{tr('Aksi', 'Action')}</th>
                  </tr>
                </thead>
                {loading ? (
                  <TableSkeleton rows={6} columns={7} />
                ) : (
                <tbody className="divide-y divide-slate-100">
                  {(todayData.records || []).map((r: any) => {
                    const outOfGeofence =
                      r.clock_in_status === 'out_of_geofence' || r.clock_out_status === 'out_of_geofence';
                    const hasLocation = r.clock_in_lat !== null && r.clock_in_lat !== undefined && r.attendance_id;
                    return (
                      <tr key={r.employee_id} className="align-top hover:bg-slate-50/80">
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900">{r.full_name}</div>
                          <div className="font-mono text-[10px] text-slate-400">
                            {r.nik} · {r.department_name || '-'}
                          </div>
                        </td>
                        <td className="whitespace-nowrap py-3 px-4">
                          <div className="font-mono font-semibold text-slate-800">
                            {r.clock_in_time || '--:--'}
                          </div>
                          <div className="font-mono text-[11px] text-slate-400">
                            {r.clock_out_time || '--:--'}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex flex-col items-start gap-1">
                            {statusBadge(r.status, r.late_minutes)}
                            {r.late_minutes > 0 && (
                              <span className="text-[10px] font-medium text-amber-700">
                                +{r.late_minutes} {tr('menit', 'min')}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          {hasLocation ? (
                            <div
                              className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                outOfGeofence
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              <MapPin size={11} />
                              {outOfGeofence
                                ? tr('Di luar geofence', 'Outside geofence')
                                : tr('Dalam geofence', 'Inside geofence')}
                            </div>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {r.attendance_id && (r.clock_in_photo_key || r.clock_out_photo_key) ? (
                            <div className="flex items-center gap-1">
                              {r.clock_in_photo_key && (
                                <a
                                  href={`/api/attendance/${r.attendance_id}/photo?type=in&token=${getToken()}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-700 hover:bg-blue-100"
                                >
                                  <ImageIcon size={11} />
                                  {tr('Masuk', 'In')}
                                </a>
                              )}
                              {r.clock_out_photo_key && (
                                <a
                                  href={`/api/attendance/${r.attendance_id}/photo?type=out&token=${getToken()}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-700 hover:bg-amber-100"
                                >
                                  <ImageIcon size={11} />
                                  {tr('Pulang', 'Out')}
                                </a>
                              )}
                            </div>
                          ) : (
                            <span className="text-[10px] text-slate-400">{tr('Tanpa foto', 'No photo')}</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <div className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-600">
                            {r.source === 'fingerprint' ? <ScanLine size={12} /> : <Smartphone size={12} />}
                            {sourceLabel(r.source)}
                          </div>
                          {r.is_offline_sync === 1 && (
                            <div className="mt-0.5 text-[10px] text-sky-600">{tr('Sinkron offline', 'Offline synced')}</div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {r.attendance_id && (
                              <button
                                type="button"
                                onClick={() => setDetailRecord({ ...r, date: selectedDate })}
                                className="rounded-lg px-2 py-1 text-[10px] font-semibold text-slate-600 hover:bg-slate-100"
                                title={tr('Lihat detail presensi', 'View attendance detail')}
                              >
                                {tr('Detail', 'Detail')}
                              </button>
                            )}
                            {r.attendance_id ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setDeleteTarget({
                                    id: r.attendance_id,
                                    name: r.full_name,
                                    date: selectedDate,
                                  })
                                }
                                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                                title={tr('Hapus Presensi', 'Delete Attendance')}
                              >
                                <Trash2 size={15} />
                              </button>
                            ) : (
                              <span className="text-xs text-slate-300">-</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {!(todayData.records || []).length && (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-xs text-slate-400">
                        {tr('Belum ada data presensi pada tanggal ini.', 'No attendance data for this date.')}
                      </td>
                    </tr>
                  )}
                </tbody>
                )}
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'corrections' && (
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4 font-bold">{tr('Karyawan', 'Employee')}</th>
                  <th className="py-3 px-4 font-bold">{tr('Tanggal', 'Date')}</th>
                  <th className="py-3 px-4 font-bold">{tr('Jam Diajukan', 'Requested Time')}</th>
                  <th className="py-3 px-4 font-bold">{tr('Alasan', 'Reason')}</th>
                  <th className="py-3 px-4 font-bold">{tr('Status', 'Status')}</th>
                  <th className="py-3 px-4 font-bold text-right">{tr('Aksi', 'Action')}</th>
                </tr>
              </thead>
              {loading ? (
                <TableSkeleton rows={5} columns={6} />
              ) : (
              <tbody className="divide-y divide-slate-100">
                {corrections.map((c) => (
                  <tr key={c.id}>
                    <td className="py-3 px-4 font-bold text-slate-900">{c.full_name}</td>
                    <td className="py-3 px-4">{formatDate(c.correction_date)}</td>
                    <td className="py-3 px-4 font-mono">
                      {tr('Masuk', 'In')}: {c.requested_clock_in || '-'} | {tr('Pulang', 'Out')}: {c.requested_clock_out || '-'}
                    </td>
                    <td className="py-3 px-4 italic max-w-xs">{c.reason}</td>
                    <td className="py-3 px-4">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                        c.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : c.status === 'rejected' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {correctionStatusLabel(c.status)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {c.status === 'pending' && (
                        <div className="flex justify-end gap-1.5">
                          <button
                            onClick={() => handleReviewCorrection(c.id, 'approved')}
                            className="bg-emerald-600 text-white font-bold px-2.5 py-1 rounded-lg hover:bg-emerald-700"
                          >
                            {tr('Setujui', 'Approve')}
                          </button>
                          <button
                            onClick={() => handleReviewCorrection(c.id, 'rejected')}
                            className="bg-rose-600 text-white font-bold px-2.5 py-1 rounded-lg hover:bg-rose-700"
                          >
                            {tr('Tolak', 'Reject')}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {!corrections.length && (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-xs text-slate-400">
                      {tr('Tidak ada pengajuan koreksi presensi.', 'No attendance correction requests.')}
                    </td>
                  </tr>
                )}
              </tbody>
              )}
            </table>
          </div>
        </div>
      )}

      {/* ATTENDANCE DETAIL MODAL */}
      {detailRecord && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) setDetailRecord(null);
          }}
        >
          <div className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">{detailRecord.full_name}</h3>
                <p className="text-[11px] text-slate-500">
                  {detailRecord.nik} · {detailRecord.department_name || '-'} · {formatDate(detailRecord.date)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailRecord(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-xl bg-slate-50 p-3">
                <div className="text-[10px] font-bold uppercase text-slate-400">{tr('Jam Masuk', 'Clock In')}</div>
                <div className="mt-0.5 font-mono text-sm font-bold text-slate-900">{detailRecord.clock_in_time || '--:--'}</div>
                <div className={`mt-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                  detailRecord.clock_in_status === 'out_of_geofence'
                    ? 'bg-amber-100 text-amber-800'
                    : detailRecord.clock_in_status
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-slate-100 text-slate-500'
                }`}>
                  <MapPin size={11} />
                  {detailRecord.clock_in_status === 'out_of_geofence'
                    ? tr('Di luar geofence', 'Outside geofence')
                    : detailRecord.clock_in_status
                    ? tr('Dalam geofence', 'Inside geofence')
                    : tr('Tidak ada data', 'No data')}
                </div>
                {formatDistance(detailRecord.clock_in_distance_meters) && (
                  <div className="mt-1 text-[10px] text-slate-500">
                    {tr('Jarak', 'Distance')}: {formatDistance(detailRecord.clock_in_distance_meters)}
                  </div>
                )}
                {detailRecord.clock_in_geofence_reason && (
                  <div className="mt-1 text-[10px] italic text-slate-600">"{detailRecord.clock_in_geofence_reason}"</div>
                )}
              </div>

              <div className="rounded-xl bg-slate-50 p-3">
                <div className="text-[10px] font-bold uppercase text-slate-400">{tr('Jam Pulang', 'Clock Out')}</div>
                <div className="mt-0.5 font-mono text-sm font-bold text-slate-900">{detailRecord.clock_out_time || '--:--'}</div>
                <div className={`mt-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                  detailRecord.clock_out_status === 'out_of_geofence'
                    ? 'bg-amber-100 text-amber-800'
                    : detailRecord.clock_out_status
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-slate-100 text-slate-500'
                }`}>
                  <MapPin size={11} />
                  {detailRecord.clock_out_status === 'out_of_geofence'
                    ? tr('Di luar geofence', 'Outside geofence')
                    : detailRecord.clock_out_status
                    ? tr('Dalam geofence', 'Inside geofence')
                    : tr('Tidak ada data', 'No data')}
                </div>
                {formatDistance(detailRecord.clock_out_distance_meters) && (
                  <div className="mt-1 text-[10px] text-slate-500">
                    {tr('Jarak', 'Distance')}: {formatDistance(detailRecord.clock_out_distance_meters)}
                  </div>
                )}
                {detailRecord.clock_out_geofence_reason && (
                  <div className="mt-1 text-[10px] italic text-slate-600">"{detailRecord.clock_out_geofence_reason}"</div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-xl border border-slate-200 p-3">
                <div className="text-[10px] font-bold uppercase text-slate-400">{tr('Sumber', 'Source')}</div>
                <div className="mt-1 inline-flex items-center gap-1 font-semibold text-slate-700">
                  {detailRecord.source === 'fingerprint' ? <ScanLine size={13} /> : <Smartphone size={13} />}
                  {sourceLabel(detailRecord.source)}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 p-3">
                <div className="text-[10px] font-bold uppercase text-slate-400">{tr('Geofence Kantor', 'Office Geofence')}</div>
                <div className="mt-1 font-semibold text-slate-700">
                  {detailRecord.branch_radius ? `${Math.round(Number(detailRecord.branch_radius))} m` : '-'}
                  {detailRecord.branch_name ? ` · ${detailRecord.branch_name}` : ''}
                </div>
              </div>
            </div>

            {(detailRecord.clock_in_lat || detailRecord.clock_out_lat) && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-[10px] font-bold uppercase text-slate-400">
                    {tr('Peta Lokasi Presensi', 'Attendance Location Map')}
                  </div>
                  <div className="flex items-center gap-1 text-[10px] font-bold text-slate-600">
                    <MapPin size={11} />
                    {detailRecord.clock_in_distance_meters !== null && detailRecord.clock_in_distance_meters !== undefined
                      ? `${formatDistance(detailRecord.clock_in_distance_meters)} ${tr('dari kantor', 'from office')}`
                      : tr('Jarak tidak tercatat', 'Distance not recorded')}
                  </div>
                </div>
                <LocationMap
                  lat={Number(detailRecord.clock_out_lat || detailRecord.clock_in_lat)}
                  lng={Number(detailRecord.clock_out_lng || detailRecord.clock_in_lng)}
                  office={
                    detailRecord.branch_lat && detailRecord.branch_lng
                      ? {
                          name: detailRecord.branch_name,
                          latitude: Number(detailRecord.branch_lat),
                          longitude: Number(detailRecord.branch_lng),
                          radius_meters: Number(detailRecord.branch_radius || 150),
                        }
                      : null
                  }
                  className="h-56 w-full overflow-hidden rounded-xl border border-slate-200"
                />
                <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2.5 w-2.5 rounded-full bg-blue-600" />
                    {tr('Lokasi presensi', 'Attendance point')}
                  </span>
                  {detailRecord.branch_lat && (
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2.5 w-2.5 rounded-sm bg-blue-700" />
                      {detailRecord.branch_name || tr('Kantor', 'Office')}
                      {detailRecord.branch_radius ? ` (${Math.round(Number(detailRecord.branch_radius))} m)` : ''}
                    </span>
                  )}
                </div>
              </div>
            )}

            {(detailRecord.clock_in_lat || detailRecord.clock_out_lat) && (
              <div className="rounded-xl border border-slate-200 p-3 text-xs">
                <div className="text-[10px] font-bold uppercase text-slate-400">{tr('Koordinat GPS', 'GPS Coordinates')}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {detailRecord.clock_in_lat && detailRecord.clock_in_lng && (
                    <a
                      href={`https://www.google.com/maps?q=${detailRecord.clock_in_lat},${detailRecord.clock_in_lng}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2 py-1 font-mono text-[10px] font-bold text-blue-700 hover:bg-blue-100"
                    >
                      <MapPin size={11} />
                      {tr('Masuk', 'In')}: {Number(detailRecord.clock_in_lat).toFixed(5)}, {Number(detailRecord.clock_in_lng).toFixed(5)}
                    </a>
                  )}
                  {detailRecord.clock_out_lat && detailRecord.clock_out_lng && (
                    <a
                      href={`https://www.google.com/maps?q=${detailRecord.clock_out_lat},${detailRecord.clock_out_lng}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2 py-1 font-mono text-[10px] font-bold text-amber-700 hover:bg-amber-100"
                    >
                      <MapPin size={11} />
                      {tr('Pulang', 'Out')}: {Number(detailRecord.clock_out_lat).toFixed(5)}, {Number(detailRecord.clock_out_lng).toFixed(5)}
                    </a>
                  )}
                </div>
              </div>
            )}

            <div>
              <div className="mb-2 text-[10px] font-bold uppercase text-slate-400">{tr('Bukti Selfie', 'Selfie Evidence')}</div>
              <div className="grid grid-cols-2 gap-2">
                {detailRecord.clock_in_photo_key ? (
                  <a
                    href={`/api/attendance/${detailRecord.attendance_id}/photo?type=in&token=${getToken()}`}
                    target="_blank"
                    rel="noreferrer"
                    className="overflow-hidden rounded-xl border border-slate-200"
                  >
                    <img
                      src={`/api/attendance/${detailRecord.attendance_id}/photo?type=in&token=${getToken()}`}
                      alt={tr('Foto masuk', 'Clock in photo')}
                      className="h-32 w-full object-cover"
                    />
                    <div className="bg-slate-50 px-2 py-1 text-[10px] font-semibold text-slate-600">
                      {tr('Foto Masuk', 'Clock In Photo')}
                    </div>
                  </a>
                ) : (
                  <div className="flex h-32 items-center justify-center rounded-xl bg-slate-50 text-[10px] text-slate-400">
                    {tr('Tidak ada foto masuk', 'No clock-in photo')}
                  </div>
                )}
                {detailRecord.clock_out_photo_key ? (
                  <a
                    href={`/api/attendance/${detailRecord.attendance_id}/photo?type=out&token=${getToken()}`}
                    target="_blank"
                    rel="noreferrer"
                    className="overflow-hidden rounded-xl border border-slate-200"
                  >
                    <img
                      src={`/api/attendance/${detailRecord.attendance_id}/photo?type=out&token=${getToken()}`}
                      alt={tr('Foto pulang', 'Clock out photo')}
                      className="h-32 w-full object-cover"
                    />
                    <div className="bg-slate-50 px-2 py-1 text-[10px] font-semibold text-slate-600">
                      {tr('Foto Pulang', 'Clock Out Photo')}
                    </div>
                  </a>
                ) : (
                  <div className="flex h-32 items-center justify-center rounded-xl bg-slate-50 text-[10px] text-slate-400">
                    {tr('Tidak ada foto pulang', 'No clock-out photo')}
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => setDetailRecord(null)}
                className="rounded-xl bg-slate-900 px-5 py-2 text-xs font-bold text-white hover:bg-slate-800"
              >
                {tr('Tutup', 'Close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FINGERPRINT MODAL */}
      {showFpModal && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) setShowFpModal(false);
          }}
        >
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="font-bold text-base text-slate-900">{tr('Import Log Mesin Fingerprint (CSV)', 'Import Fingerprint Machine Log (CSV)')}</h3>
            <p className="text-xs text-slate-500">
              {tr('Format:', 'Format:')} <code>NIK,YYYY-MM-DD,HH:MM:SS,in/out</code> {tr('per baris.', 'per line.')}
            </p>
            <textarea
              rows={6}
              value={fpText}
              onChange={(e) => setFpText(e.target.value)}
              placeholder={"EMP001,2026-10-05,08:25:00,in\nEMP002,2026-10-05,08:35:00,in\nEMP001,2026-10-05,17:35:00,out"}
              className="w-full p-3 border border-slate-300 rounded-xl font-mono text-xs"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowFpModal(false)}
                className="px-4 py-2 text-slate-600 font-semibold rounded-xl hover:bg-slate-100 text-xs"
              >
                {tr('Batal', 'Cancel')}
              </button>
              <button
                type="button"
                onClick={handleImportFingerprint}
                className="px-5 py-2 bg-blue-600 text-white font-bold rounded-xl shadow-md text-xs hover:bg-blue-700"
              >
                {tr('Impor Data', 'Import Data')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) setDeleteTarget(null);
          }}
        >
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 size={24} />
            </div>
            <div className="text-center">
              <h3 className="font-bold text-base text-slate-900">{tr('Hapus Data Presensi?', 'Delete Attendance Record?')}</h3>
              <p className="text-xs text-slate-500 mt-1">
                {tr('Apakah Anda yakin ingin menghapus data presensi karyawan', 'Are you sure you want to delete the attendance record for employee')}{' '}
                <strong className="text-slate-900">{deleteTarget.name}</strong> {tr('pada tanggal', 'on')}{' '}
                <strong className="text-slate-900">{deleteTarget.date}</strong>?
              </p>
              <p className="text-[11px] text-rose-600 font-medium mt-2">
                {tr('Log jam masuk dan jam pulang karyawan untuk hari ini akan dibersihkan dari sistem.', "The employee's clock-in and clock-out logs for this day will be cleared from the system.")}
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setDeleteTarget(null)}
                className="flex-1 px-4 py-2 text-slate-700 font-semibold rounded-xl hover:bg-slate-100 text-xs transition"
              >
                {tr('Batal', 'Cancel')}
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleConfirmDelete}
                className="flex-1 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs transition shadow-xs"
              >
                {deleting ? tr('Menghapus...', 'Deleting...') : tr('Ya, Hapus', 'Yes, Delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
