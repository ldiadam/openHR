import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { UserMinus, Plus, CheckSquare, Square, AlertTriangle, CheckCircle2, Trash2, FileDown, RotateCcw, X } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { apiFetch } from '../api';
import { useLanguage } from '../context/LanguageContext';

export const OffboardingPage: React.FC = () => {
  const { tr } = useLanguage();
  const [cases, setCases] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<{ case: any; items: any[]; blockers: any; blockerDetails?: { assets: any[]; tasks: any[] } } | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [empId, setEmpId] = useState('');
  const [resignDate, setResignDate] = useState(new Date().toISOString().slice(0, 10));
  const [lastDay, setLastDay] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState('');
  const [newItemDept, setNewItemDept] = useState('HR');
  const [newItemTitle, setNewItemTitle] = useState('');
  const [notice, setNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const flash = (type: 'ok' | 'err', text: string) => {
    setNotice({ type, text });
    setTimeout(() => setNotice(null), 4000);
  };

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/offboarding');
      setCases(res.cases || []);
      setEmployees(res.employees || []);
      if (!empId && res.employees?.[0]?.id) setEmpId(res.employees[0].id);
    } catch (err: any) {
      flash('err', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openCase = async (id: string) => {
    try {
      const res = await apiFetch(`/offboarding/${id}`);
      setSelected(res);
    } catch (err: any) {
      flash('err', err.message);
    }
  };

  const handleInitiate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/offboarding', {
        method: 'POST',
        body: JSON.stringify({ employee_id: empId, resignation_date: resignDate, last_working_day: lastDay, reason }),
      });
      setShowNew(false);
      setReason('');
      flash('ok', tr('Proses offboarding dimulai.', 'Offboarding initiated.'));
      await load();
    } catch (err: any) {
      flash('err', err.message);
    }
  };

  const toggleItem = async (caseId: string, itemId: string) => {
    try {
      await apiFetch(`/offboarding/${caseId}/checklist/${itemId}/toggle`, { method: 'POST' });
      await Promise.all([openCase(caseId), load()]);
    } catch (err: any) {
      flash('err', err.message);
    }
  };

  const addChecklistItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || !newItemTitle.trim()) return;
    try {
      await apiFetch(`/offboarding/${selected.case.id}/checklist`, {
        method: 'POST',
        body: JSON.stringify({ department_label: newItemDept.trim() || 'HR', title: newItemTitle.trim() }),
      });
      setNewItemTitle('');
      await Promise.all([openCase(selected.case.id), load()]);
    } catch (err: any) {
      flash('err', err.message);
    }
  };

  const quickReturnAsset = async (assetId: string) => {
    if (!selected) return;
    try {
      await apiFetch(`/assets/${assetId}/return`, { method: 'POST', body: JSON.stringify({ condition_in: 'good' }) });
      flash('ok', tr('Aset dikembalikan.', 'Asset returned.'));
      await Promise.all([openCase(selected.case.id), load()]);
    } catch (err: any) {
      flash('err', err.message);
    }
  };

  const completeCase = async (caseId: string) => {
    if (!window.confirm(tr('Tandai offboarding selesai dan ubah status karyawan menjadi Resigned?', 'Complete offboarding and mark employee resigned?'))) return;
    try {
      await apiFetch(`/offboarding/${caseId}/complete`, { method: 'POST', body: JSON.stringify({}) });
      flash('ok', tr('Offboarding selesai.', 'Offboarding completed.'));
      await Promise.all([openCase(caseId), load()]);
    } catch (err: any) {
      flash('err', err.message);
    }
  };

  const deleteCase = async (caseId: string) => {
    if (!window.confirm(tr('Hapus kasus offboarding ini?', 'Delete this offboarding case?'))) return;
    try {
      await apiFetch(`/offboarding/${caseId}`, { method: 'DELETE' });
      setSelected(null);
      flash('ok', tr('Kasus offboarding dihapus.', 'Offboarding case deleted.'));
      await load();
    } catch (err: any) {
      flash('err', err.message);
    }
  };

  const updateCaseNotes = async (caseId: string, notes: string) => {
    try {
      await apiFetch(`/offboarding/${caseId}`, { method: 'PUT', body: JSON.stringify({ exit_interview_notes: notes }) });
      flash('ok', tr('Catatan wawancara keluar disimpan.', 'Exit interview notes saved.'));
      await openCase(caseId);
    } catch (err: any) {
      flash('err', err.message);
    }
  };

  const downloadClearancePdf = () => {
    if (!selected) return;
    const doc = new jsPDF();
    const c = selected.case;
    doc.setFontSize(15);
    doc.text('EMPLOYEE OFFBOARDING & CLEARANCE CERTIFICATE', 14, 20);
    doc.setFontSize(10);
    doc.text(`Employee: ${c.full_name} (${c.nik})`, 14, 34);
    doc.text(`Department / Title: ${c.department_name || '-'} · ${c.job_title}`, 14, 41);
    doc.text(`Notice Date: ${c.resignation_date}   |   Last Working Day: ${c.last_working_day}`, 14, 48);
    doc.text(`Status: ${String(c.status).toUpperCase()}`, 14, 55);
    doc.text(`Blockers -> Assets: ${selected.blockers.unreturnedAssets} | Open Tasks: ${selected.blockers.openTasks} | Kasbon: Rp ${Number(selected.blockers.kasbonBalance || 0).toLocaleString('id-ID')}`, 14, 65);
    let y = 78;
    doc.setFontSize(11);
    doc.text('Clearance Checklist:', 14, y);
    y += 7;
    doc.setFontSize(9.5);
    selected.items.forEach((it) => {
      doc.text(`[${it.is_completed ? 'X' : ' '}] ${it.department_label}: ${it.title}`, 14, y);
      y += 6;
    });
    doc.text('HR Authorized Signature: _______________________', 14, y + 18);
    doc.save(`Clearance_${c.nik}.pdf`);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-black text-slate-900">
            <UserMinus size={20} className="text-rose-600" />
            {tr('Offboarding & Clearance', 'Offboarding & Clearance')}
          </h1>
          <p className="text-xs text-slate-500">
            {tr('Pantau pengembalian aset, serah-terima tugas, pelunasan kasbon, dan sertifikat clearance PDF.', 'Track asset return, task handover, kasbon settlement, and clearance PDF.')}
          </p>
        </div>
        <button type="button" onClick={() => setShowNew(true)} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white hover:bg-slate-800">
          <Plus size={15} /> {tr('Mulai Offboarding', 'Initiate Offboarding')}
        </button>
      </div>

      {notice && (
        <div className={`rounded-xl border px-3.5 py-2.5 text-xs font-semibold ${notice.type === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>
          {notice.text}
        </div>
      )}

      <div className="space-y-2.5">
        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-xs text-slate-400">Loading...</div>
        ) : cases.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-xs text-slate-500">
            {tr('Belum ada proses offboarding.', 'No offboarding cases.')}
          </div>
        ) : (
          cases.map((c) => {
            const hasBlockers = c.blockers.unreturnedAssets > 0 || c.blockers.openTasks > 0 || c.blockers.kasbonBalance > 0;
            return (
              <div key={c.id} onClick={() => openCase(c.id)} className="cursor-pointer rounded-2xl border border-slate-200 bg-white p-4 hover:border-blue-300">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] font-bold text-slate-500">{c.nik}</span>
                      <span className="text-sm font-bold text-slate-900">{c.full_name}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${c.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>
                        {c.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">
                      {c.job_title} · {c.department_name || '-'} · {tr('Hari Terakhir', 'Last Day')}: <strong>{c.last_working_day}</strong>
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    {hasBlockers && c.status !== 'completed' && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 font-bold text-rose-700">
                        <AlertTriangle size={12} /> {c.blockers.unreturnedAssets} assets · {c.blockers.openTasks} tasks
                      </span>
                    )}
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 font-bold text-slate-700">
                      Checklist {c.completed_items}/{c.total_items}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-xl">
            <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-base font-black text-slate-900">{tr('Mulai Offboarding', 'Initiate Offboarding')}</h2>
              <button type="button" onClick={() => setShowNew(false)} className="rounded-xl p-1 text-slate-400"><X size={18} /></button>
            </div>
            <form onSubmit={handleInitiate} className="space-y-3 text-xs">
              <div>
                <label className="mb-1 block font-semibold text-slate-700">{tr('Karyawan', 'Employee')}</label>
                <select value={empId} onChange={(e) => setEmpId(e.target.value)} className="w-full rounded-xl border border-slate-300 bg-white p-2.5">
                  {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.nik} · {emp.full_name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block font-semibold text-slate-700">{tr('Tanggal Resign', 'Notice Date')}</label>
                  <input type="date" value={resignDate} onChange={(e) => setResignDate(e.target.value)} className="w-full rounded-xl border border-slate-300 p-2" />
                </div>
                <div>
                  <label className="mb-1 block font-semibold text-slate-700">{tr('Hari Kerja Terakhir', 'Last Working Day')}</label>
                  <input type="date" value={lastDay} onChange={(e) => setLastDay(e.target.value)} className="w-full rounded-xl border border-slate-300 p-2" />
                </div>
              </div>
              <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={tr('Alasan keluar...', 'Reason...')} className="w-full rounded-xl border border-slate-300 p-2.5" />
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowNew(false)} className="rounded-xl border border-slate-200 px-4 py-2 font-bold text-slate-600">{tr('Batal', 'Cancel')}</button>
                <button type="submit" className="rounded-xl bg-slate-900 px-5 py-2 font-bold text-white">{tr('Mulai', 'Start')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-xl">
            <div className="flex shrink-0 items-start justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="text-base font-black text-slate-900">{selected.case.full_name} ({selected.case.nik})</h2>
                <p className="text-xs text-slate-500">Last Working Day: {selected.case.last_working_day} · Status: {selected.case.status}</p>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={downloadClearancePdf} className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50">
                  <FileDown size={13} /> PDF
                </button>
                <button type="button" onClick={() => setSelected(null)} className="rounded-xl p-1 text-slate-400"><X size={18} /></button>
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-5">

            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                <div className="text-[10px] text-slate-500">Unreturned Assets</div>
                <div className="text-base font-black text-slate-900">{selected.blockers.unreturnedAssets}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                <div className="text-[10px] text-slate-500">Open Tasks</div>
                <div className="text-base font-black text-slate-900">{selected.blockers.openTasks}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                <div className="text-[10px] text-slate-500">Kasbon Balance</div>
                <div className="text-base font-black text-slate-900">Rp {Number(selected.blockers.kasbonBalance || 0).toLocaleString('id-ID')}</div>
              </div>
            </div>

            {/* Live clickable blocker details */}
            {((selected.blockerDetails?.assets?.length || 0) > 0 || (selected.blockerDetails?.tasks?.length || 0) > 0) && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-3 space-y-2 text-xs">
                <div className="font-bold text-rose-800">{tr('Item Penghambat Clearance', 'Active Clearance Blockers')}</div>
                {selected.blockerDetails?.assets?.map((a) => (
                  <div key={a.id} className="flex items-center justify-between rounded-xl bg-white px-3 py-2 border border-rose-100">
                    <span><strong>{a.asset_tag}</strong> · {a.name}</span>
                    <button type="button" onClick={() => quickReturnAsset(a.id)} className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1 text-[10px] font-bold text-white">
                      <RotateCcw size={11} /> {tr('Kembalikan', 'Return')}
                    </button>
                  </div>
                ))}
                {selected.blockerDetails?.tasks?.map((t) => (
                  <div key={t.id} className="flex items-center justify-between rounded-xl bg-white px-3 py-2 border border-rose-100">
                    <span><strong className="font-mono">{t.reference_no}</strong> · {t.title}</span>
                    <Link to={`/tasks/${t.id}`} className="text-[11px] font-bold text-blue-600 hover:underline">Open Task →</Link>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2">
              {selected.items.map((item) => (
                <div
                  key={item.id}
                  onClick={() => selected.case.status !== 'completed' && toggleItem(selected.case.id, item.id)}
                  className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 p-3 text-xs hover:bg-slate-50"
                >
                  {item.is_completed ? <CheckSquare size={16} className="text-emerald-600" /> : <Square size={16} className="text-slate-400" />}
                  <div className="flex-1">
                    <div className="text-[10px] font-bold uppercase text-slate-400">{item.department_label}</div>
                    <div className={item.is_completed ? 'line-through text-slate-400' : 'font-semibold text-slate-800'}>{item.title}</div>
                  </div>
                </div>
              ))}
            </div>

            {selected.case.status !== 'completed' && (
              <form onSubmit={addChecklistItem} className="flex gap-2 text-xs">
                <input value={newItemDept} onChange={(e) => setNewItemDept(e.target.value)} placeholder="Dept" className="w-24 rounded-xl border border-slate-200 p-2" />
                <input value={newItemTitle} onChange={(e) => setNewItemTitle(e.target.value)} placeholder={tr('Tambah item checklist...', 'Add custom checklist item...')} className="flex-1 rounded-xl border border-slate-200 p-2" />
                <button type="submit" className="rounded-xl bg-slate-800 px-3 py-2 font-bold text-white">+ Add</button>
              </form>
            )}

            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-slate-700">{tr('Catatan Wawancara Keluar', 'Exit Interview Notes')}</label>
              <textarea
                rows={2}
                defaultValue={selected.case.exit_interview_notes || ''}
                onBlur={(e) => {
                  if (e.target.value !== (selected.case.exit_interview_notes || '')) updateCaseNotes(selected.case.id, e.target.value);
                }}
                placeholder={tr('Tulis catatan wawancara keluar (otomatis tersimpan)...', 'Exit interview notes (auto-saved)...')}
                className="w-full rounded-xl border border-slate-200 p-2.5 text-xs"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <button type="button" onClick={() => deleteCase(selected.case.id)} className="inline-flex items-center gap-1 rounded-xl border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50">
                <Trash2 size={13} /> {tr('Hapus Kasus', 'Delete Case')}
              </button>
              {selected.case.status !== 'completed' && (
                <button type="button" onClick={() => completeCase(selected.case.id)} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700">
                  <CheckCircle2 size={14} /> {tr('Selesaikan Offboarding', 'Complete Offboarding')}
                </button>
              )}
            </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
