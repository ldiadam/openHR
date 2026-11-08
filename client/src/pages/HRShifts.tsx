import React, { useState, useEffect } from 'react';
import { Layers, Clock, Plus, CheckCircle2, AlertCircle } from 'lucide-react';
import { apiFetch, formatDateIndo } from '../api';

export const HRShifts: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'roster' | 'patterns' | 'overtime'>('overtime');
  const [patterns, setPatterns] = useState<any[]>([]);
  const [overtimes, setOvertimes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // New Pattern Form
  const [showPatternModal, setShowPatternModal] = useState(false);
  const [pName, setPName] = useState('');
  const [pCode, setPCode] = useState('shift-custom');
  const [pStart, setPStart] = useState('09:00');
  const [pEnd, setPEnd] = useState('18:00');
  const [pBreak, setPBreak] = useState('60');

  const loadData = async () => {
    setLoading(true);
    try {
      const [pRes, otRes] = await Promise.all([
        apiFetch('/shifts/patterns'),
        apiFetch('/shifts/overtime/requests'),
      ]);
      setPatterns(pRes.patterns || []);
      setOvertimes(otRes.requests || []);
    } catch (err: any) {
      console.warn('Shifts err:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleReviewOt = async (id: string, status: 'approved' | 'rejected', defaultHours: number) => {
    let actualHours = defaultHours;
    if (status === 'approved') {
      const inputHours = prompt(`Jam lembur yang disetujui (aktual):`, String(defaultHours));
      if (inputHours !== null) {
        actualHours = parseFloat(inputHours) || defaultHours;
      }
    }

    try {
      const res = await apiFetch(`/shifts/overtime/requests/${id}/review`, {
        method: 'POST',
        body: JSON.stringify({ status, actual_hours: actualHours }),
      });
      setMsg({ type: 'success', text: res.message });
      loadData();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    }
  };

  const handleCreatePattern = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch('/shifts/patterns', {
        method: 'POST',
        body: JSON.stringify({
          name: pName,
          code: pCode,
          start_time: pStart,
          end_time: pEnd,
          break_minutes: parseInt(pBreak, 10),
        }),
      });
      setMsg({ type: 'success', text: res.message });
      setShowPatternModal(false);
      loadData();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Shift & Lembur (Overtime)</h1>
          <p className="text-xs text-slate-500">
            Pengaturan jadwal shift kerja dan verifikasi jam lembur karyawan sebelum masuk ke payroll
          </p>
        </div>

        {activeTab === 'patterns' && (
          <button
            onClick={() => setShowPatternModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md transition"
          >
            <Plus size={16} />
            <span>Tambah Pola Shift</span>
          </button>
        )}
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
          onClick={() => setActiveTab('overtime')}
          className={`pb-3 transition border-b-2 -mb-px flex items-center gap-1.5 ${
            activeTab === 'overtime' ? 'border-amber-600 text-amber-600' : 'border-transparent hover:text-slate-800'
          }`}
        >
          <span>Persetujuan Lembur (Overtime)</span>
          {overtimes.filter((o) => o.status === 'pending').length > 0 && (
            <span className="bg-amber-500 text-white text-[10px] px-1.5 py-0.2 rounded-full">
              {overtimes.filter((o) => o.status === 'pending').length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('patterns')}
          className={`pb-3 transition border-b-2 -mb-px ${
            activeTab === 'patterns' ? 'border-blue-600 text-blue-600' : 'border-transparent hover:text-slate-800'
          }`}
        >
          Pola Shift Kerja
        </button>
      </div>

      {/* OVERTIME TAB */}
      {activeTab === 'overtime' && (
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4 font-bold">Karyawan</th>
                  <th className="py-3 px-4 font-bold">Tanggal</th>
                  <th className="py-3 px-4 font-bold">Jam</th>
                  <th className="py-3 px-4 font-bold">Durasi Rencana</th>
                  <th className="py-3 px-4 font-bold">Jenis Hari</th>
                  <th className="py-3 px-4 font-bold">Uraian Tugas</th>
                  <th className="py-3 px-4 font-bold">Status</th>
                  <th className="py-3 px-4 font-bold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {overtimes.map((ot) => (
                  <tr key={ot.id}>
                    <td className="py-3 px-4 font-bold text-slate-900">{ot.full_name}</td>
                    <td className="py-3 px-4">{formatDateIndo(ot.date)}</td>
                    <td className="py-3 px-4 font-mono font-medium">
                      {ot.start_time} - {ot.end_time}
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-900">{ot.planned_hours} Jam</td>
                    <td className="py-3 px-4">
                      {ot.is_holiday_or_rest_day === 1 ? (
                        <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded">
                          Hari Libur
                        </span>
                      ) : (
                        <span className="bg-blue-100 text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded">
                          Hari Kerja
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 italic max-w-xs">{ot.reason}</td>
                    <td className="py-3 px-4">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                        ot.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : ot.status === 'rejected' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {ot.status} ({ot.actual_hours}h)
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {ot.status === 'pending' && (
                        <div className="flex justify-end gap-1.5">
                          <button
                            onClick={() => handleReviewOt(ot.id, 'approved', ot.planned_hours)}
                            className="bg-emerald-600 text-white font-bold px-2.5 py-1 rounded-lg hover:bg-emerald-700"
                          >
                            Setujui
                          </button>
                          <button
                            onClick={() => handleReviewOt(ot.id, 'rejected', ot.planned_hours)}
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

      {/* SHIFT PATTERNS TAB */}
      {activeTab === 'patterns' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {patterns.map((sp) => (
            <div key={sp.id} className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-2xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                  {sp.code}
                </span>
                <span className="text-[11px] text-slate-400">Istirahat {sp.break_minutes}m</span>
              </div>
              <h3 className="font-extrabold text-slate-900 text-base">{sp.name}</h3>
              <div className="text-lg font-mono font-black text-slate-800 pt-1">
                {sp.start_time} - {sp.end_time}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* PATTERN MODAL */}
      {showPatternModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <h3 className="font-bold text-base text-slate-900">Tambah Pola Shift Baru</h3>
            <form onSubmit={handleCreatePattern} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-medium mb-1">Nama Pola Shift *</label>
                <input
                  type="text"
                  required
                  value={pName}
                  onChange={(e) => setPName(e.target.value)}
                  placeholder="Shift Malam Operasional..."
                  className="w-full p-2.5 border border-slate-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">Kode *</label>
                <input
                  type="text"
                  required
                  value={pCode}
                  onChange={(e) => setPCode(e.target.value)}
                  placeholder="malam"
                  className="w-full p-2.5 border border-slate-300 rounded-xl font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Jam Mulai</label>
                  <input
                    type="time"
                    required
                    value={pStart}
                    onChange={(e) => setPStart(e.target.value)}
                    className="w-full p-2 border border-slate-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Jam Selesai</label>
                  <input
                    type="time"
                    required
                    value={pEnd}
                    onChange={(e) => setPEnd(e.target.value)}
                    className="w-full p-2 border border-slate-300 rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">Istirahat (Menit)</label>
                <input
                  type="number"
                  value={pBreak}
                  onChange={(e) => setPBreak(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 rounded-xl"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPatternModal(false)}
                  className="px-4 py-2 text-slate-600 font-semibold rounded-xl hover:bg-slate-100 text-xs"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 text-white font-bold rounded-xl shadow-md text-xs hover:bg-blue-700"
                >
                  Simpan Pola
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
