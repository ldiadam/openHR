import React, { useState, useEffect } from 'react';
import { Layers, Clock, Plus, CheckCircle2, AlertCircle, Edit, Trash2 } from 'lucide-react';
import { apiFetch, getLocalDateString } from '../api';
import { TableSkeleton, CardsSkeleton } from '../components/Skeleton';
import { useLanguage } from '../context/LanguageContext';

export const HRShifts: React.FC = () => {
  const { t, tr, formatDate } = useLanguage();
  const [activeTab, setActiveTab] = useState<'roster' | 'patterns' | 'overtime'>('overtime');
  const [patterns, setPatterns] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [overtimes, setOvertimes] = useState<any[]>([]);
  const [roster, setRoster] = useState<any[]>([]);
  const [rosterStart, setRosterStart] = useState(getLocalDateString());
  const [rosterEnd, setRosterEnd] = useState(getLocalDateString());
  const [rosterForm, setRosterForm] = useState({ employee_id: '', date: getLocalDateString(), shift_pattern_id: '', is_off: false });
  const [savingRoster, setSavingRoster] = useState(false);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // New Pattern Form
  const [showPatternModal, setShowPatternModal] = useState(false);
  const [pName, setPName] = useState('');
  const [pCode, setPCode] = useState('shift-custom');
  const [pStart, setPStart] = useState('09:00');
  const [pEnd, setPEnd] = useState('18:00');
  const [pBreak, setPBreak] = useState('60');

  // Edit Pattern Form
  const [editingPattern, setEditingPattern] = useState<any | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [pRes, otRes, eRes] = await Promise.all([
        apiFetch('/shifts/patterns'),
        apiFetch('/shifts/overtime/requests'),
        apiFetch('/employees').catch(() => ({ employees: [] })),
      ]);
      setPatterns(pRes.patterns || []);
      setOvertimes(otRes.requests || []);
      setEmployees(eRes.employees || []);
    } catch (err: any) {
      console.warn('Shifts err:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadRoster = async (start = rosterStart, end = rosterEnd) => {
    try {
      const res = await apiFetch(`/shifts/roster?start_date=${start}&end_date=${end}`);
      setRoster(res.roster || []);
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    }
  };

  useEffect(() => {
    if (activeTab === 'roster') loadRoster();
  }, [activeTab]);

  const handleSaveRoster = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!rosterForm.employee_id || !rosterForm.date) return;
    if (!rosterForm.is_off && !rosterForm.shift_pattern_id) {
      setMsg({ type: 'error', text: tr('Pilih shift atau tandai sebagai hari libur.', 'Pick a shift or mark it as a day off.') });
      return;
    }
    setSavingRoster(true);
    try {
      const res = await apiFetch('/shifts/roster/batch', {
        method: 'POST',
        body: JSON.stringify({
          assignments: [
            {
              employee_id: rosterForm.employee_id,
              date: rosterForm.date,
              shift_pattern_id: rosterForm.is_off ? null : rosterForm.shift_pattern_id,
              is_off: rosterForm.is_off,
            },
          ],
        }),
      });
      setMsg({ type: 'success', text: res.message });
      loadRoster(rosterStart, rosterEnd);
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setSavingRoster(false);
    }
  };

  const handleReviewOt = async (id: string, status: 'approved' | 'rejected', defaultHours: number) => {
    let actualHours = defaultHours;
    if (status === 'approved') {
      const inputHours = prompt(tr('Jam lembur yang disetujui (aktual):', 'Approved overtime hours (actual):'), String(defaultHours));
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

  const handleUpdatePattern = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPattern) return;
    try {
      const res = await apiFetch(`/shifts/patterns/${editingPattern.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: editingPattern.name,
          code: editingPattern.code,
          start_time: editingPattern.start_time,
          end_time: editingPattern.end_time,
          break_minutes: parseInt(editingPattern.break_minutes || '60', 10),
        }),
      });
      setMsg({ type: 'success', text: res.message });
      setEditingPattern(null);
      loadData();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    }
  };

  const handleDeletePattern = async (id: string, name: string) => {
    if (!confirm(tr(`Hapus pola shift "${name}"?`, `Delete shift pattern "${name}"?`))) return;
    try {
      const res = await apiFetch(`/shifts/patterns/${id}`, { method: 'DELETE' });
      setMsg({ type: 'success', text: res.message });
      loadData();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">{t.shifts.title}</h1>
          <p className="text-xs text-slate-500">
            {t.shifts.subtitle}
          </p>
        </div>

        {activeTab === 'patterns' && (
          <button
            onClick={() => setShowPatternModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md transition cursor-pointer"
          >
            <Plus size={16} />
            <span>{tr('Tambah Pola Shift', 'Add Shift Pattern')}</span>
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
      <div className="flex flex-wrap border-b border-slate-200 gap-x-6 gap-y-1 text-xs font-bold text-slate-500">
        <button
          onClick={() => setActiveTab('roster')}
          className={`pb-3 transition border-b-2 -mb-px flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'roster' ? 'border-indigo-600 text-indigo-600' : 'border-transparent hover:text-slate-800'
          }`}
        >
          <Layers size={14} />
          <span>{tr('Roster Shift', 'Shift Roster')}</span>
        </button>
        <button
          onClick={() => setActiveTab('overtime')}
          className={`pb-3 transition border-b-2 -mb-px flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'overtime' ? 'border-amber-600 text-amber-600' : 'border-transparent hover:text-slate-800'
          }`}
        >
          <span>{t.dashboard.overtimeRequests}</span>
          {overtimes.filter((o) => o.status === 'pending').length > 0 && (
            <span className="bg-amber-500 text-white text-[10px] px-1.5 py-0.2 rounded-full">
              {overtimes.filter((o) => o.status === 'pending').length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('patterns')}
          className={`pb-3 transition border-b-2 -mb-px cursor-pointer ${
            activeTab === 'patterns' ? 'border-blue-600 text-blue-600' : 'border-transparent hover:text-slate-800'
          }`}
        >
          {t.shifts.shiftPatterns}
        </button>
      </div>

      {/* ROSTER TAB */}
      {activeTab === 'roster' && (
        <div className="space-y-4">
          <div className="bg-white rounded-3xl border border-slate-200/80 p-4 shadow-2xs space-y-3">
            <div className="flex flex-wrap items-end gap-2 text-xs">
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 mb-1">{tr('Dari Tanggal', 'From Date')}</label>
                <input
                  type="date"
                  value={rosterStart}
                  onChange={(e) => setRosterStart(e.target.value)}
                  className="rounded-xl border border-slate-300 px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 mb-1">{tr('Sampai Tanggal', 'To Date')}</label>
                <input
                  type="date"
                  value={rosterEnd}
                  onChange={(e) => setRosterEnd(e.target.value)}
                  className="rounded-xl border border-slate-300 px-3 py-2"
                />
              </div>
              <button
                type="button"
                onClick={() => loadRoster()}
                className="rounded-xl bg-slate-900 px-4 py-2 font-bold text-white hover:bg-slate-800 cursor-pointer"
              >
                {tr('Muat Roster', 'Load Roster')}
              </button>
            </div>

            <form onSubmit={handleSaveRoster} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 border-t border-slate-100 pt-3 text-xs">
              <div className="lg:col-span-2">
                <label className="block text-[10px] font-semibold text-slate-500 mb-1">{tr('Karyawan', 'Employee')}</label>
                <select
                  required
                  value={rosterForm.employee_id}
                  onChange={(e) => setRosterForm({ ...rosterForm, employee_id: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2"
                >
                  <option value="">{tr('Pilih karyawan', 'Select employee')}</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.full_name} ({emp.nik})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 mb-1">{tr('Tanggal', 'Date')}</label>
                <input
                  type="date"
                  required
                  value={rosterForm.date}
                  onChange={(e) => setRosterForm({ ...rosterForm, date: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 mb-1">{tr('Shift', 'Shift')}</label>
                <select
                  value={rosterForm.shift_pattern_id}
                  disabled={rosterForm.is_off}
                  onChange={(e) => setRosterForm({ ...rosterForm, shift_pattern_id: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 disabled:bg-slate-100"
                >
                  <option value="">{tr('Pilih shift', 'Select shift')}</option>
                  {patterns.map((pattern) => (
                    <option key={pattern.id} value={pattern.id}>
                      {pattern.name} ({pattern.start_time}-{pattern.end_time})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end gap-2">
                <label className="flex items-center gap-1.5 pb-2 text-[11px] font-medium text-slate-600">
                  <input
                    type="checkbox"
                    checked={rosterForm.is_off}
                    onChange={(e) => setRosterForm({ ...rosterForm, is_off: e.target.checked })}
                  />
                  {tr('Libur', 'Day off')}
                </label>
                <button
                  type="submit"
                  disabled={savingRoster}
                  className="flex-1 rounded-xl bg-indigo-600 px-3 py-2 font-bold text-white hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
                >
                  {savingRoster ? tr('Menyimpan...', 'Saving...') : tr('Simpan', 'Save')}
                </button>
              </div>
            </form>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200/80 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">{tr('Tanggal', 'Date')}</th>
                    <th className="px-4 py-3">{tr('Karyawan', 'Employee')}</th>
                    <th className="px-4 py-3">{tr('Shift', 'Shift')}</th>
                    <th className="px-4 py-3">{tr('Jam', 'Time')}</th>
                  </tr>
                </thead>
                {loading ? (
                  <TableSkeleton rows={6} columns={4} />
                ) : (
                <tbody className="divide-y divide-slate-100">
                  {roster.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                        {tr('Belum ada roster untuk rentang tanggal ini.', 'No roster for this date range yet.')}
                      </td>
                    </tr>
                  ) : (
                    roster.map((entry) => (
                      <tr key={entry.id} className="hover:bg-slate-50/80">
                        <td className="px-4 py-2.5 font-mono font-semibold text-slate-700">{formatDate(entry.date)}</td>
                        <td className="px-4 py-2.5">
                          {entry.full_name} <span className="text-[10px] text-slate-400">({entry.nik})</span>
                        </td>
                        <td className="px-4 py-2.5">
                          {entry.is_off ? (
                            <span className="font-semibold text-rose-600">{tr('Libur', 'Day off')}</span>
                          ) : (
                            entry.shift_name || '-'
                          )}
                        </td>
                        <td className="px-4 py-2.5 font-mono">
                          {entry.is_off ? '-' : `${entry.start_time || '-'} - ${entry.end_time || '-'}`}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                )}
              </table>
            </div>
          </div>
        </div>
      )}

      {/* OVERTIME TAB */}
      {activeTab === 'overtime' && (
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4 font-bold">{tr('Karyawan', 'Employee')}</th>
                  <th className="py-3 px-4 font-bold">{tr('Tanggal', 'Date')}</th>
                  <th className="py-3 px-4 font-bold">{tr('Jam', 'Time')}</th>
                  <th className="py-3 px-4 font-bold">{tr('Durasi Rencana', 'Planned Duration')}</th>
                  <th className="py-3 px-4 font-bold">{tr('Jenis Hari', 'Day Type')}</th>
                  <th className="py-3 px-4 font-bold">{tr('Uraian Tugas', 'Task Description')}</th>
                  <th className="py-3 px-4 font-bold">{tr('Status', 'Status')}</th>
                  <th className="py-3 px-4 font-bold text-right">{tr('Aksi', 'Actions')}</th>
                </tr>
              </thead>
              {loading ? (
                <TableSkeleton rows={6} columns={8} />
              ) : (
              <tbody className="divide-y divide-slate-100">
                {overtimes.map((ot) => (
                  <tr key={ot.id}>
                    <td className="py-3 px-4 font-bold text-slate-900">{ot.full_name}</td>
                    <td className="py-3 px-4">{formatDate(ot.date)}</td>
                    <td className="py-3 px-4 font-mono font-medium">
                      {ot.start_time} - {ot.end_time}
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-900">{ot.planned_hours} {tr('Jam', 'Hours')}</td>
                    <td className="py-3 px-4">
                      {ot.is_holiday_or_rest_day === 1 ? (
                        <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded">
                          {tr('Hari Libur', 'Public Holiday')}
                        </span>
                      ) : (
                        <span className="bg-blue-100 text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded">
                          {tr('Hari Kerja', 'Workday')}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 italic max-w-xs">{ot.reason}</td>
                    <td className="py-3 px-4">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                        ot.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : ot.status === 'rejected' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {ot.status === 'approved'
                          ? tr('Disetujui', 'Approved')
                          : ot.status === 'rejected'
                            ? tr('Ditolak', 'Rejected')
                            : tr('Menunggu', 'Pending')}{' '}
                        ({ot.actual_hours}h)
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {ot.status === 'pending' && (
                        <div className="flex justify-end gap-1.5">
                          <button
                            onClick={() => handleReviewOt(ot.id, 'approved', ot.planned_hours)}
                            className="bg-emerald-600 text-white font-bold px-2.5 py-1 rounded-lg hover:bg-emerald-700"
                          >
                            {tr('Setujui', 'Approve')}
                          </button>
                          <button
                            onClick={() => handleReviewOt(ot.id, 'rejected', ot.planned_hours)}
                            className="bg-rose-600 text-white font-bold px-2.5 py-1 rounded-lg hover:bg-rose-700"
                          >
                            {tr('Tolak', 'Reject')}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {!overtimes.length && (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-xs text-slate-400">
                      {tr('Belum ada pengajuan lembur.', 'No overtime requests yet.')}
                    </td>
                  </tr>
                )}
              </tbody>
              )}
            </table>
          </div>
        </div>
      )}

      {/* SHIFT PATTERNS TAB */}
      {activeTab === 'patterns' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {loading && <CardsSkeleton cards={3} className="md:col-span-3" />}
          {!loading && patterns.map((sp) => (
            <div key={sp.id} className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-2xs space-y-3 relative flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded-lg">
                    {sp.code}
                  </span>
                  <span className="text-[11px] text-slate-400 font-medium">{tr('Istirahat', 'Break')} {sp.break_minutes}m</span>
                </div>
                <h3 className="font-extrabold text-slate-900 text-base">{sp.name}</h3>
                <div className="text-xl font-mono font-black text-slate-800 pt-1">
                  {sp.start_time} - {sp.end_time}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setEditingPattern({ ...sp })}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 text-slate-700 text-xs font-semibold transition cursor-pointer"
                >
                  <Edit size={13} />
                  <span>{tr('Ubah Jam Kerja', 'Edit Work Hours')}</span>
                </button>

                {sp.id !== 'shift-reg' && (
                  <button
                    type="button"
                    onClick={() => handleDeletePattern(sp.id, sp.name)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                    title={tr('Hapus Pola Shift', 'Delete Shift Pattern')}
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* PATTERN MODAL */}
      {showPatternModal && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) setShowPatternModal(false);
          }}
        >
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <h3 className="font-bold text-base text-slate-900">{tr('Tambah Pola Shift Baru', 'Add New Shift Pattern')}</h3>
            <form onSubmit={handleCreatePattern} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-medium mb-1">{tr('Nama Pola Shift *', 'Shift Pattern Name *')}</label>
                <input
                  type="text"
                  required
                  value={pName}
                  onChange={(e) => setPName(e.target.value)}
                  placeholder={tr('Shift Malam Operasional...', 'Night Shift Operations...')}
                  className="w-full p-2.5 border border-slate-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">{tr('Kode *', 'Code *')}</label>
                <input
                  type="text"
                  required
                  value={pCode}
                  onChange={(e) => setPCode(e.target.value)}
                  placeholder={tr('malam', 'night')}
                  className="w-full p-2.5 border border-slate-300 rounded-xl font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-700 font-medium mb-1">{tr('Jam Mulai', 'Start Time')}</label>
                  <input
                    type="time"
                    required
                    value={pStart}
                    onChange={(e) => setPStart(e.target.value)}
                    className="w-full p-2 border border-slate-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-medium mb-1">{tr('Jam Selesai', 'End Time')}</label>
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
                <label className="block text-slate-700 font-medium mb-1">{tr('Istirahat (Menit)', 'Break (Minutes)')}</label>
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
                  {tr('Batal', 'Cancel')}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 text-white font-bold rounded-xl shadow-md text-xs hover:bg-blue-700"
                >
                  {tr('Simpan Pola', 'Save Pattern')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT PATTERN MODAL */}
      {editingPattern && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) setEditingPattern(null);
          }}
        >
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <h3 className="font-bold text-base text-slate-900">{tr('Ubah Jam Kerja Shift', 'Edit Shift Work Hours')}</h3>
            <form onSubmit={handleUpdatePattern} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-medium mb-1">{tr('Nama Pola Shift *', 'Shift Pattern Name *')}</label>
                <input
                  type="text"
                  required
                  value={editingPattern.name}
                  onChange={(e) => setEditingPattern({ ...editingPattern, name: e.target.value })}
                  className="w-full p-2.5 border border-slate-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">{tr('Kode *', 'Code *')}</label>
                <input
                  type="text"
                  required
                  value={editingPattern.code}
                  onChange={(e) => setEditingPattern({ ...editingPattern, code: e.target.value })}
                  className="w-full p-2.5 border border-slate-300 rounded-xl font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-700 font-medium mb-1 font-bold text-blue-700">{tr('Jam Masuk', 'Clock In')}</label>
                  <input
                    type="time"
                    required
                    value={editingPattern.start_time}
                    onChange={(e) => setEditingPattern({ ...editingPattern, start_time: e.target.value })}
                    className="w-full p-2 border border-blue-300 rounded-xl font-mono font-bold bg-blue-50/50"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-medium mb-1 font-bold text-blue-700">{tr('Jam Pulang', 'Clock Out')}</label>
                  <input
                    type="time"
                    required
                    value={editingPattern.end_time}
                    onChange={(e) => setEditingPattern({ ...editingPattern, end_time: e.target.value })}
                    className="w-full p-2 border border-blue-300 rounded-xl font-mono font-bold bg-blue-50/50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">{tr('Istirahat (Menit)', 'Break (Minutes)')}</label>
                <input
                  type="number"
                  value={editingPattern.break_minutes}
                  onChange={(e) => setEditingPattern({ ...editingPattern, break_minutes: e.target.value })}
                  className="w-full p-2.5 border border-slate-300 rounded-xl"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingPattern(null)}
                  className="px-4 py-2 text-slate-600 font-semibold rounded-xl hover:bg-slate-100 text-xs"
                >
                  {tr('Batal', 'Cancel')}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 text-white font-bold rounded-xl shadow-md text-xs hover:bg-blue-700"
                >
                  {tr('Simpan Perubahan', 'Save Changes')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
