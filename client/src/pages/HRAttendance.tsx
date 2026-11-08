import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, CheckCircle2, XCircle, AlertCircle, Upload, Calendar, ArrowLeft } from 'lucide-react';
import { apiFetch } from '../api';
import { useLanguage } from '../context/LanguageContext';

export const HRAttendance: React.FC = () => {
  const navigate = useNavigate();
  const { t, formatDate } = useLanguage();
  const [activeTab, setActiveTab] = useState<'today' | 'recap' | 'corrections'>('today');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [todayData, setTodayData] = useState<any>({ summary: {}, records: [] });
  const [corrections, setCorrections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFpModal, setShowFpModal] = useState(false);
  const [fpText, setFpText] = useState('');
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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
    const note = prompt(`Catatan ${status === 'approved' ? 'persetujuan' : 'penolakan'} (opsional):`);
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
      alert('Format log fingerprint tidak valid. Contoh per baris: EMP001,2026-10-05,08:25:00,in');
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
      default:
        return <span className="bg-slate-100 text-slate-700 text-[10px] font-bold px-2 py-0.5 rounded">{status}</span>;
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
          Kehadiran Hari Ini
        </button>
        <button
          onClick={() => setActiveTab('corrections')}
          className={`pb-3 transition border-b-2 -mb-px flex items-center gap-1.5 ${
            activeTab === 'corrections' ? 'border-blue-600 text-blue-600' : 'border-transparent hover:text-slate-800'
          }`}
        >
          <span>Inbox Koreksi Presensi</span>
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
              <span className="text-xs font-semibold text-slate-700">Pilih Tanggal:</span>
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
                    <th className="py-3 px-4 font-bold">Karyawan</th>
                    <th className="py-3 px-4 font-bold">Departemen</th>
                    <th className="py-3 px-4 font-bold">Jam Masuk</th>
                    <th className="py-3 px-4 font-bold">Jam Pulang</th>
                    <th className="py-3 px-4 font-bold">Status</th>
                    <th className="py-3 px-4 font-bold">Keterangan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(todayData.records || []).map((r: any) => (
                    <tr key={r.employee_id} className="hover:bg-slate-50/80">
                      <td className="py-3 px-4 font-bold text-slate-900">
                        {r.full_name} <span className="font-mono text-slate-400 text-[10px]">({r.nik})</span>
                      </td>
                      <td className="py-3 px-4">{r.department_name}</td>
                      <td className="py-3 px-4 font-mono font-semibold">{r.clock_in_time || '--:--'}</td>
                      <td className="py-3 px-4 font-mono font-semibold">{r.clock_out_time || '--:--'}</td>
                      <td className="py-3 px-4">{statusBadge(r.status, r.late_minutes)}</td>
                      <td className="py-3 px-4 text-[11px] text-slate-400">
                        {r.clock_in_status === 'out_of_geofence' && '⚠️ Di luar radius geofence'}
                        {r.is_offline_sync === 1 && '📦 Offline synced'}
                      </td>
                    </tr>
                  ))}
                </tbody>
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
                  <th className="py-3 px-4 font-bold">Karyawan</th>
                  <th className="py-3 px-4 font-bold">Tanggal</th>
                  <th className="py-3 px-4 font-bold">Jam Diajukan</th>
                  <th className="py-3 px-4 font-bold">Alasan</th>
                  <th className="py-3 px-4 font-bold">Status</th>
                  <th className="py-3 px-4 font-bold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {corrections.map((c) => (
                  <tr key={c.id}>
                    <td className="py-3 px-4 font-bold text-slate-900">{c.full_name}</td>
                    <td className="py-3 px-4">{formatDate(c.correction_date)}</td>
                    <td className="py-3 px-4 font-mono">
                      Masuk: {c.requested_clock_in || '-'} | Pulang: {c.requested_clock_out || '-'}
                    </td>
                    <td className="py-3 px-4 italic max-w-xs">{c.reason}</td>
                    <td className="py-3 px-4">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                        c.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : c.status === 'rejected' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {c.status === 'pending' && (
                        <div className="flex justify-end gap-1.5">
                          <button
                            onClick={() => handleReviewCorrection(c.id, 'approved')}
                            className="bg-emerald-600 text-white font-bold px-2.5 py-1 rounded-lg hover:bg-emerald-700"
                          >
                            Setujui
                          </button>
                          <button
                            onClick={() => handleReviewCorrection(c.id, 'rejected')}
                            className="bg-rose-600 text-white font-bold px-2.5 py-1 rounded-lg hover:bg-rose-700"
                          >
                            Tolak
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* FINGERPRINT MODAL */}
      {showFpModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="font-bold text-base text-slate-900">Import Log Mesin Fingerprint (CSV)</h3>
            <p className="text-xs text-slate-500">
              Format: <code>NIK,YYYY-MM-DD,HH:MM:SS,in/out</code> per baris.
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
                Batal
              </button>
              <button
                type="button"
                onClick={handleImportFingerprint}
                className="px-5 py-2 bg-blue-600 text-white font-bold rounded-xl shadow-md text-xs hover:bg-blue-700"
              >
                Impor Data
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
