import React, { useState, useEffect } from 'react';
import { Clock, PlusCircle, CheckCircle2, AlertCircle, Calendar } from 'lucide-react';
import { apiFetch, formatDateIndo } from '../api';

export const EmployeeAttendance: React.FC = () => {
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
        return <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded">Hadir</span>;
      case 'late':
        return <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded">Telat {lateMins}m</span>;
      case 'on_leave':
        return <span className="bg-blue-100 text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded">Cuti</span>;
      case 'sick':
        return <span className="bg-indigo-100 text-indigo-800 text-[10px] font-bold px-2 py-0.5 rounded">Sakit</span>;
      case 'absent':
        return <span className="bg-rose-100 text-rose-800 text-[10px] font-bold px-2 py-0.5 rounded">Alpha</span>;
      default:
        return <span className="bg-slate-100 text-slate-700 text-[10px] font-bold px-2 py-0.5 rounded">{status}</span>;
    }
  };

  return (
    <div className="max-w-md mx-auto space-y-4">
      {/* Header & Month Selector */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Riwayat Presensi</h2>
          <p className="text-xs text-slate-500">Rekap kehadiran & jam kerja Anda</p>
        </div>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="text-xs font-semibold bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 shadow-2xs"
        />
      </div>

      {msg && (
        <div
          className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
            msg.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          {msg.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{msg.text}</span>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-2xs">
          <span className="text-[10px] text-slate-400 uppercase font-semibold">Hadir Tepat</span>
          <div className="text-lg font-black text-emerald-600">{summary.present || 0}</div>
        </div>
        <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-2xs">
          <span className="text-[10px] text-slate-400 uppercase font-semibold">Terlambat</span>
          <div className="text-lg font-black text-amber-600">{summary.late || 0}</div>
        </div>
        <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-2xs">
          <span className="text-[10px] text-slate-400 uppercase font-semibold">Total Menit</span>
          <div className="text-lg font-black text-slate-700">{summary.totalLateMinutes || 0}m</div>
        </div>
      </div>

      <button
        onClick={() => setShowCorrectionModal(true)}
        className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-white border border-blue-600 text-blue-600 hover:bg-blue-50 rounded-xl font-semibold text-xs transition shadow-2xs"
      >
        <PlusCircle size={16} />
        <span>Ajukan Koreksi Presensi (Lupa Clock In/Out)</span>
      </button>

      {/* Daily Records List */}
      <div className="space-y-2">
        {loading ? (
          <p className="text-center text-xs text-slate-400 py-8">Memuat log presensi...</p>
        ) : records.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center text-xs text-slate-400 border border-slate-200">
            Belum ada catatan presensi pada bulan ini.
          </div>
        ) : (
          records.map((r) => (
            <div
              key={r.id}
              className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-2xs flex items-center justify-between"
            >
              <div>
                <div className="font-semibold text-xs text-slate-900">{formatDateIndo(r.date)}</div>
                <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                  Masuk: <strong>{r.clock_in_time || '--:--'}</strong> | Pulang: <strong>{r.clock_out_time || '--:--'}</strong>
                </div>
                {r.is_offline_sync === 1 && (
                  <span className="text-[9px] text-amber-600 font-medium">Synced from offline queue</span>
                )}
              </div>
              <div>{statusBadge(r.status, r.late_minutes)}</div>
            </div>
          ))
        )}
      </div>

      {/* Correction Modal */}
      {showCorrectionModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-4">
            <h3 className="font-bold text-slate-900 text-sm">Formulir Koreksi Presensi</h3>
            <form onSubmit={handleCorrectionSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-600 font-medium mb-1">Tanggal</label>
                <input
                  type="date"
                  required
                  value={corrDate}
                  onChange={(e) => setCorrDate(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-600 font-medium mb-1">Jam Masuk</label>
                  <input
                    type="time"
                    value={corrIn}
                    onChange={(e) => setCorrIn(e.target.value)}
                    className="w-full p-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-medium mb-1">Jam Pulang</label>
                  <input
                    type="time"
                    value={corrOut}
                    onChange={(e) => setCorrOut(e.target.value)}
                    className="w-full p-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-600 font-medium mb-1">Alasan Koreksi</label>
                <textarea
                  required
                  rows={3}
                  value={corrReason}
                  onChange={(e) => setCorrReason(e.target.value)}
                  placeholder="Contoh: Lupa clock in karena HP tertinggal di rumah..."
                  className="w-full p-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCorrectionModal(false)}
                  className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-lg font-medium"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
                >
                  {submitting ? 'Mengirim...' : 'Kirim Pengajuan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
