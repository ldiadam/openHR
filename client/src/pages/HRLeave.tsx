import React, { useState, useEffect } from 'react';
import { Calendar, Plus, CheckCircle2, XCircle, AlertCircle, Edit, Trash2, X } from 'lucide-react';
import { apiFetch } from '../api';
import { TableSkeleton } from '../components/Skeleton';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { LeaveApprovals } from './LeaveApprovals';
import { getLeaveTypeLabel } from '../utils/leaveTypeLabel';

export const HRLeave: React.FC = () => {
  const { t, tr, lang, formatDate } = useLanguage();
  const { user } = useAuth();
  const isOwnerAdmin = user?.role === 'owner_admin';
  const [activeTab, setActiveTab] = useState<'requests' | 'balances' | 'holidays' | 'types'>('requests');
  const [requests, setRequests] = useState<any[]>([]);
  const [balances, setBalances] = useState<any[]>([]);
  const [holidays, setHolidays] = useState<any[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [selectedBalance, setSelectedBalance] = useState<any>(null);
  const [adjustDays, setAdjustDays] = useState('1');
  const [adjustReason, setAdjustReason] = useState('');

  const [showHolidayModal, setShowHolidayModal] = useState(false);
  const [holidayName, setHolidayName] = useState('');
  const [holidayDate, setHolidayDate] = useState('');
  const [holidayType, setHolidayType] = useState('national');
  const [holidayDeduct, setHolidayDeduct] = useState(false);

  const [showTypeModal, setShowTypeModal] = useState(false);
  const [editingTypeId, setEditingTypeId] = useState<string | null>(null);
  const [ltCode, setLtCode] = useState('');
  const [ltNameId, setLtNameId] = useState('');
  const [ltNameEn, setLtNameEn] = useState('');
  const [ltDesc, setLtDesc] = useState('');
  const [ltDefaultDays, setLtDefaultDays] = useState('0');
  const [ltSortOrder, setLtSortOrder] = useState('100');
  const [ltIsPaid, setLtIsPaid] = useState(true);
  const [ltReqAttachment, setLtReqAttachment] = useState(false);
  const [ltIsActive, setLtIsActive] = useState(true);
  const [savingType, setSavingType] = useState(false);

  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [reqRes, holRes, balRes, ltRes] = await Promise.all([
        apiFetch('/leave/requests'),
        apiFetch('/leave/holidays?year=2026'),
        apiFetch('/reports/leave-balances'),
        apiFetch('/leave/types?includeInactive=1'),
      ]);
      setRequests(reqRes.requests || []);
      setHolidays(holRes.holidays || []);
      setBalances(balRes.balances || []);
      setLeaveTypes(ltRes.leaveTypes || []);
    } catch (err: any) {
      console.warn('Leave err:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleReview = async (id: string, status: 'approved' | 'rejected') => {
    const note = prompt(
      tr(
        `Catatan ${status === 'approved' ? 'persetujuan' : 'penolakan'} (opsional):`,
        `${status === 'approved' ? 'Approval' : 'Rejection'} note (optional):`
      )
    );
    try {
      const res = await apiFetch(`/leave/requests/${id}/review`, {
        method: 'POST',
        body: JSON.stringify({ status, note }),
      });
      setMsg({ type: 'success', text: res.message });
      loadData();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    }
  };

  const handleDeleteRequest = async (id: string) => {
    if (!window.confirm(tr('Hapus pengajuan cuti ini? Saldo cuti akan dipulihkan jika sebelumnya disetujui.', 'Delete this leave request? Leave balance will be restored if it was approved.'))) {
      return;
    }
    try {
      const res = await apiFetch(`/leave/requests/${id}`, { method: 'DELETE' });
      setMsg({ type: 'success', text: res.message });
      loadData();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    }
  };

  const handleAdjustBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBalance) return;
    try {
      const res = await apiFetch('/leave/adjust-balance', {
        method: 'POST',
        body: JSON.stringify({
          employee_id: selectedBalance.employee_id || selectedBalance.nik,
          leave_type_id: selectedBalance.leave_type_id || 'lt-annual',
          adjustment_days: parseFloat(adjustDays),
          reason: adjustReason,
        }),
      });
      setMsg({ type: 'success', text: res.message });
      setShowAdjustModal(false);
      setAdjustReason('');
      loadData();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    }
  };

  const handleAddHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch('/leave/holidays', {
        method: 'POST',
        body: JSON.stringify({
          name: holidayName,
          date: holidayDate,
          type: holidayType,
          is_cuti_bersama_deducts_leave: holidayDeduct,
        }),
      });
      setMsg({ type: 'success', text: res.message });
      setShowHolidayModal(false);
      setHolidayName('');
      setHolidayDate('');
      loadData();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    }
  };

  const openCreateTypeModal = () => {
    setEditingTypeId(null);
    setLtCode('');
    setLtNameId('');
    setLtNameEn('');
    setLtDesc('');
    setLtDefaultDays('0');
    setLtSortOrder('100');
    setLtIsPaid(true);
    setLtReqAttachment(false);
    setLtIsActive(true);
    setShowTypeModal(true);
  };

  const openEditTypeModal = (lt: any) => {
    setEditingTypeId(lt.id);
    setLtCode(lt.code || '');
    setLtNameId(lt.name_id || lt.name || '');
    setLtNameEn(lt.name_en || lt.name || '');
    setLtDesc(lt.description || '');
    setLtDefaultDays(String(lt.default_days ?? 0));
    setLtSortOrder(String(lt.sort_order ?? 100));
    setLtIsPaid(Boolean(lt.is_paid));
    setLtReqAttachment(Boolean(lt.requires_attachment));
    setLtIsActive(lt.is_active === undefined || lt.is_active === null ? true : Boolean(lt.is_active));
    setShowTypeModal(true);
  };

  const handleSaveLeaveType = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingType(true);
    try {
      const payload = {
        code: ltCode,
        name_id: ltNameId,
        name_en: ltNameEn,
        description: ltDesc,
        default_days: Number(ltDefaultDays) || 0,
        sort_order: Number(ltSortOrder) || 100,
        is_paid: ltIsPaid,
        requires_attachment: ltReqAttachment,
        is_active: ltIsActive,
      };
      const res = editingTypeId
        ? await apiFetch(`/leave/types/${editingTypeId}`, { method: 'PUT', body: JSON.stringify(payload) })
        : await apiFetch('/leave/types', { method: 'POST', body: JSON.stringify(payload) });
      setMsg({ type: 'success', text: res.message });
      setShowTypeModal(false);
      loadData();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setSavingType(false);
    }
  };

  const handleToggleTypeActive = async (lt: any) => {
    const nextActive = !(lt.is_active === undefined || lt.is_active === null ? true : Boolean(lt.is_active));
    try {
      const res = await apiFetch(`/leave/types/${lt.id}`, {
        method: 'PUT',
        body: JSON.stringify({ is_active: nextActive }),
      });
      setMsg({ type: 'success', text: res.message });
      loadData();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    }
  };

  const handleDeleteLeaveType = async (lt: any) => {
    if (!window.confirm(tr(`Hapus jenis cuti "${getLeaveTypeLabel(lt, lang)}"?`, `Delete leave type "${getLeaveTypeLabel(lt, lang)}"?`))) {
      return;
    }
    try {
      const res = await apiFetch(`/leave/types/${lt.id}`, { method: 'DELETE' });
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
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">{t.leave.title}</h1>
          <p className="text-xs text-slate-500">
            {t.leave.subtitle}
          </p>
        </div>

        {activeTab === 'holidays' && (
          <button
            onClick={() => setShowHolidayModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md transition cursor-pointer"
          >
            <Plus size={16} />
            <span>{tr('Tambah Hari Libur', 'Add Holiday')}</span>
          </button>
        )}

        {activeTab === 'types' && isOwnerAdmin && (
          <button
            onClick={openCreateTypeModal}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md transition cursor-pointer"
          >
            <Plus size={16} />
            <span>{tr('Tambah Jenis Cuti', 'Add Leave Type')}</span>
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
          onClick={() => setActiveTab('requests')}
          className={`pb-3 transition border-b-2 -mb-px flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'requests' ? 'border-blue-600 text-blue-600' : 'border-transparent hover:text-slate-800'
          }`}
        >
          <span>{t.dashboard.leaveRequests}</span>
          {requests.filter((r) => r.status === 'pending').length > 0 && (
            <span className="bg-blue-600 text-white text-[10px] px-1.5 py-0.2 rounded-full">
              {requests.filter((r) => r.status === 'pending').length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('balances')}
          className={`pb-3 transition border-b-2 -mb-px cursor-pointer ${
            activeTab === 'balances' ? 'border-blue-600 text-blue-600' : 'border-transparent hover:text-slate-800'
          }`}
        >
          {t.leave.annualLeaveBalance}
        </button>
        <button
          onClick={() => setActiveTab('holidays')}
          className={`pb-3 transition border-b-2 -mb-px cursor-pointer ${
            activeTab === 'holidays' ? 'border-blue-600 text-blue-600' : 'border-transparent hover:text-slate-800'
          }`}
        >
          {t.leave.holidaysCalendar}
        </button>
        <button
          onClick={() => setActiveTab('types')}
          className={`pb-3 transition border-b-2 -mb-px cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'types' ? 'border-blue-600 text-blue-600' : 'border-transparent hover:text-slate-800'
          }`}
        >
          <span>{tr('Jenis Cuti', 'Leave Types')}</span>
          <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
            {leaveTypes.length}
          </span>
        </button>
      </div>

      {/* TAB 1: REQUESTS (Unified 3-Stage + Quick Review + Delete) */}
      {activeTab === 'requests' && <LeaveApprovals embedded />}

      {/* TAB 2: BALANCES */}
      {activeTab === 'balances' && (
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4 font-bold">{tr('Karyawan', 'Employee')}</th>
                  <th className="py-3 px-4 font-bold">{tr('Departemen', 'Department')}</th>
                  <th className="py-3 px-4 font-bold">{tr('Jenis Cuti', 'Leave Type')}</th>
                  <th className="py-3 px-4 font-bold">{tr('Hak Cuti', 'Leave Entitlement')}</th>
                  <th className="py-3 px-4 font-bold">{tr('Terpakai', 'Used')}</th>
                  <th className="py-3 px-4 font-bold">{tr('Sisa Cuti', 'Remaining')}</th>
                  <th className="py-3 px-4 font-bold text-right">{tr('Aksi', 'Actions')}</th>
                </tr>
              </thead>
              {loading ? (
                <TableSkeleton rows={6} columns={7} />
              ) : (
              <tbody className="divide-y divide-slate-100">
                {balances.map((b, i) => (
                  <tr key={i}>
                    <td className="py-3 px-4 font-bold text-slate-900">{b.full_name} ({b.nik})</td>
                    <td className="py-3 px-4">{b.department_name}</td>
                    <td className="py-3 px-4">{getLeaveTypeLabel(b, lang)}</td>
                    <td className="py-3 px-4 font-medium">{b.total_entitled} {tr('Hari', 'Days')}</td>
                    <td className="py-3 px-4 font-medium text-rose-600">{b.used_days} {tr('Hari', 'Days')}</td>
                    <td className="py-3 px-4 font-black text-emerald-600 text-sm">{b.remaining_days} {tr('Hari', 'Days')}</td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => {
                          setSelectedBalance(b);
                          setShowAdjustModal(true);
                        }}
                        className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs font-bold"
                      >
                        <Edit size={14} />
                        <span>{tr('Sesuaikan', 'Adjust')}</span>
                      </button>
                    </td>
                  </tr>
                ))}
                {!balances.length && (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-xs text-slate-400">
                      {tr('Belum ada data saldo cuti.', 'No leave balance data yet.')}
                    </td>
                  </tr>
                )}
              </tbody>
              )}
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: HOLIDAYS */}
      {activeTab === 'holidays' && (
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4 font-bold">{tr('Tanggal', 'Date')}</th>
                  <th className="py-3 px-4 font-bold">{tr('Nama Hari Libur', 'Holiday Name')}</th>
                  <th className="py-3 px-4 font-bold">{tr('Kategori', 'Category')}</th>
                  <th className="py-3 px-4 font-bold">{tr('Potong Cuti Tahunan?', 'Deduct Annual Leave?')}</th>
                </tr>
              </thead>
              {loading ? (
                <TableSkeleton rows={6} columns={4} />
              ) : (
              <tbody className="divide-y divide-slate-100">
                {holidays.map((h) => (
                  <tr key={h.id}>
                    <td className="py-3 px-4 font-bold text-slate-900">{formatDate(h.date)}</td>
                    <td className="py-3 px-4 font-medium">{h.name}</td>
                    <td className="py-3 px-4">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                        h.type === 'cuti_bersama' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                      }`}>
                        {h.type === 'cuti_bersama' ? tr('Cuti Bersama', 'Collective Leave') : tr('Libur Nasional', 'National Holiday')}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {h.is_cuti_bersama_deducts_leave === 1 ? (
                        <span className="text-rose-600 font-semibold">{tr('Ya (Memotong Saldo Cuti)', 'Yes (Deducts Leave Balance)')}</span>
                      ) : (
                        <span className="text-slate-400">{tr('Tidak', 'No')}</span>
                      )}
                    </td>
                  </tr>
                ))}
                {!holidays.length && (
                  <tr>
                    <td colSpan={4} className="py-10 text-center text-xs text-slate-400">
                      {tr('Belum ada hari libur pada tahun ini.', 'No holidays for this year yet.')}
                    </td>
                  </tr>
                )}
              </tbody>
              )}
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: LEAVE TYPES CRUD */}
      {activeTab === 'types' && (
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4 font-bold">{tr('Kode', 'Code')}</th>
                  <th className="py-3 px-4 font-bold">{tr('Nama (ID / EN)', 'Name (ID / EN)')}</th>
                  <th className="py-3 px-4 font-bold">{tr('Jatah Default', 'Default Days')}</th>
                  <th className="py-3 px-4 font-bold">{tr('Gaji', 'Pay')}</th>
                  <th className="py-3 px-4 font-bold">{tr('Lampiran', 'Attachment')}</th>
                  <th className="py-3 px-4 font-bold">{tr('Status', 'Status')}</th>
                  {isOwnerAdmin && <th className="py-3 px-4 font-bold text-right">{tr('Aksi', 'Actions')}</th>}
                </tr>
              </thead>
              {loading ? (
                <TableSkeleton rows={8} columns={isOwnerAdmin ? 7 : 6} />
              ) : (
                <tbody className="divide-y divide-slate-100">
                  {leaveTypes.map((lt) => {
                    const active = lt.is_active === undefined || lt.is_active === null ? true : Boolean(lt.is_active);
                    return (
                      <tr key={lt.id} className={!active ? 'opacity-55 bg-slate-50/50' : ''}>
                        <td className="py-3 px-4 font-mono text-[11px] font-bold text-slate-700">{lt.code}</td>
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900">{getLeaveTypeLabel(lt, lang)}</div>
                          <div className="text-[11px] text-slate-400">
                            ID: {lt.name_id || lt.name} · EN: {lt.name_en || lt.name}
                          </div>
                          {lt.description && (
                            <div className="mt-0.5 text-[10px] text-slate-500">{lt.description}</div>
                          )}
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-800">
                          {lt.default_days} {tr('Hari', 'Days')}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            lt.is_paid ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {lt.is_paid ? tr('Dibayar', 'Paid') : tr('Tanpa Gaji', 'Unpaid')}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            lt.requires_attachment ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'
                          }`}>
                            {lt.requires_attachment ? tr('Wajib', 'Required') : tr('Opsional', 'Optional')}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          {isOwnerAdmin ? (
                            <button
                              type="button"
                              onClick={() => handleToggleTypeActive(lt)}
                              className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold transition ${
                                active ? 'bg-blue-50 text-blue-700 hover:bg-blue-100' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                              }`}
                            >
                              {active ? tr('Aktif', 'Active') : tr('Nonaktif', 'Inactive')}
                            </button>
                          ) : (
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              active ? 'bg-blue-50 text-blue-700' : 'bg-slate-200 text-slate-600'
                            }`}>
                              {active ? tr('Aktif', 'Active') : tr('Nonaktif', 'Inactive')}
                            </span>
                          )}
                        </td>
                        {isOwnerAdmin && (
                          <td className="py-3 px-4 text-right">
                            <div className="inline-flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => openEditTypeModal(lt)}
                                className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs font-bold"
                              >
                                <Edit size={13} />
                                <span>{tr('Ubah', 'Edit')}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteLeaveType(lt)}
                                className="inline-flex items-center gap-1 text-rose-600 hover:text-rose-800 text-xs font-bold"
                              >
                                <Trash2 size={13} />
                                <span>{tr('Hapus', 'Delete')}</span>
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                  {!leaveTypes.length && (
                    <tr>
                      <td colSpan={isOwnerAdmin ? 7 : 6} className="py-10 text-center text-xs text-slate-400">
                        {tr('Belum ada data jenis cuti.', 'No leave types configured yet.')}
                      </td>
                    </tr>
                  )}
                </tbody>
              )}
            </table>
          </div>
        </div>
      )}

      {/* ADD / EDIT LEAVE TYPE MODAL */}
      {showTypeModal && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) setShowTypeModal(false);
          }}
        >
          <div className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-6 py-4">
              <h3 className="font-bold text-base text-slate-900">
                {editingTypeId ? tr('Ubah Jenis Cuti', 'Edit Leave Type') : tr('Tambah Jenis Cuti', 'Add Leave Type')}
              </h3>
              <button
                type="button"
                onClick={() => setShowTypeModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSaveLeaveType} className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-6 py-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">{tr('Kode Unik *', 'Unique Code *')}</label>
                  <input
                    type="text"
                    required
                    value={ltCode}
                    onChange={(e) => setLtCode(e.target.value)}
                    placeholder="e.g. paternity"
                    className="w-full p-2.5 border border-slate-300 rounded-xl font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">{tr('Urutan Tampil', 'Sort Order')}</label>
                  <input
                    type="number"
                    value={ltSortOrder}
                    onChange={(e) => setLtSortOrder(e.target.value)}
                    className="w-full p-2.5 border border-slate-300 rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">{tr('Nama (Bahasa Indonesia) *', 'Name (Indonesian) *')}</label>
                <input
                  type="text"
                  required
                  value={ltNameId}
                  onChange={(e) => setLtNameId(e.target.value)}
                  placeholder="Cuti Istri Melahirkan"
                  className="w-full p-2.5 border border-slate-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">{tr('Nama (Bahasa Inggris) *', 'Name (English) *')}</label>
                <input
                  type="text"
                  required
                  value={ltNameEn}
                  onChange={(e) => setLtNameEn(e.target.value)}
                  placeholder="Paternity Leave"
                  className="w-full p-2.5 border border-slate-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">{tr('Jatah Default (Hari/Tahun)', 'Default Days / Year')}</label>
                <input
                  type="number"
                  min="0"
                  required
                  value={ltDefaultDays}
                  onChange={(e) => setLtDefaultDays(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 rounded-xl font-bold"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">{tr('Keterangan / Kebijakan', 'Description / Policy')}</label>
                <textarea
                  rows={2}
                  value={ltDesc}
                  onChange={(e) => setLtDesc(e.target.value)}
                  placeholder={tr('Catatan syarat atau durasi...', 'Eligibility or duration notes...')}
                  className="w-full p-2.5 border border-slate-300 rounded-xl"
                />
              </div>

              <div className="space-y-2 pt-1">
                <label className="flex items-center gap-2 text-slate-700 font-medium">
                  <input type="checkbox" checked={ltIsPaid} onChange={(e) => setLtIsPaid(e.target.checked)} className="rounded text-blue-600" />
                  <span>{tr('Cuti dibayar (Paid leave)', 'Paid leave')}</span>
                </label>
                <label className="flex items-center gap-2 text-slate-700 font-medium">
                  <input type="checkbox" checked={ltReqAttachment} onChange={(e) => setLtReqAttachment(e.target.checked)} className="rounded text-blue-600" />
                  <span>{tr('Wajib lampiran dokumen pendukung', 'Requires supporting attachment')}</span>
                </label>
                <label className="flex items-center gap-2 text-slate-700 font-medium">
                  <input type="checkbox" checked={ltIsActive} onChange={(e) => setLtIsActive(e.target.checked)} className="rounded text-blue-600" />
                  <span>{tr('Aktif (tampil di formulir pengajuan)', 'Active (visible in request forms)')}</span>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowTypeModal(false)}
                  className="px-4 py-2 text-slate-600 font-semibold rounded-xl hover:bg-slate-100 text-xs"
                >
                  {tr('Batal', 'Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={savingType}
                  className="px-5 py-2 bg-blue-600 text-white font-bold rounded-xl shadow-md text-xs hover:bg-blue-700 disabled:opacity-60"
                >
                  {savingType ? tr('Menyimpan...', 'Saving...') : tr('Simpan', 'Save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADJUST BALANCE MODAL */}
      {showAdjustModal && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) setShowAdjustModal(false);
          }}
        >
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <h3 className="font-bold text-base text-slate-900">{tr('Penyesuaian Saldo Cuti (HR Adjustment)', 'Leave Balance Adjustment (HR Adjustment)')}</h3>
            <p className="text-xs text-slate-500">
              {tr('Karyawan', 'Employee')}: <strong>{selectedBalance?.full_name}</strong>
            </p>
            <form onSubmit={handleAdjustBalance} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-medium mb-1">
                  {tr('Jumlah Hari Penyesuaian (+ untuk tambah, - untuk kurangi)', 'Adjustment Days (+ to add, - to subtract)')}
                </label>
                <input
                  type="number"
                  step="0.5"
                  required
                  value={adjustDays}
                  onChange={(e) => setAdjustDays(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 rounded-xl font-bold"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">{tr('Alasan Penyesuaian *', 'Adjustment Reason *')}</label>
                <textarea
                  required
                  rows={3}
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder={tr('Kompensasi lembur akhir pekan / penyesuaian carry-over...', 'Weekend overtime compensation / carry-over adjustment...')}
                  className="w-full p-2.5 border border-slate-300 rounded-xl"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAdjustModal(false)}
                  className="px-4 py-2 text-slate-600 font-semibold rounded-xl hover:bg-slate-100 text-xs"
                >
                  {tr('Batal', 'Cancel')}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 text-white font-bold rounded-xl shadow-md text-xs hover:bg-blue-700"
                >
                  {tr('Simpan Penyesuaian', 'Save Adjustment')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD HOLIDAY MODAL */}
      {showHolidayModal && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) setShowHolidayModal(false);
          }}
        >
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <h3 className="font-bold text-base text-slate-900">{tr('Tambah Hari Libur Perusahaan / Nasional', 'Add Company / National Holiday')}</h3>
            <form onSubmit={handleAddHoliday} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-medium mb-1">{tr('Nama Hari Libur *', 'Holiday Name *')}</label>
                <input
                  type="text"
                  required
                  value={holidayName}
                  onChange={(e) => setHolidayName(e.target.value)}
                  placeholder={tr('HUT Perusahaan...', 'Company anniversary...')}
                  className="w-full p-2.5 border border-slate-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">{tr('Tanggal *', 'Date *')}</label>
                <input
                  type="date"
                  required
                  value={holidayDate}
                  onChange={(e) => setHolidayDate(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">{tr('Jenis Hari Libur', 'Holiday Type')}</label>
                <select
                  value={holidayType}
                  onChange={(e) => setHolidayType(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 rounded-xl"
                >
                  <option value="national">{tr('Libur Nasional Resmi', 'Official National Holiday')}</option>
                  <option value="cuti_bersama">{tr('Cuti Bersama Pemerintah', 'Government Collective Leave')}</option>
                  <option value="company">{tr('Libur Khusus Perusahaan', 'Company-Specific Holiday')}</option>
                </select>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="hDeduct"
                  checked={holidayDeduct}
                  onChange={(e) => setHolidayDeduct(e.target.checked)}
                  className="rounded text-blue-600"
                />
                <label htmlFor="hDeduct" className="text-slate-700 font-medium">
                  {tr('Memotong saldo cuti tahunan karyawan', "Deducts from the employee's annual leave balance")}
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowHolidayModal(false)}
                  className="px-4 py-2 text-slate-600 font-semibold rounded-xl hover:bg-slate-100 text-xs"
                >
                  {tr('Batal', 'Cancel')}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 text-white font-bold rounded-xl shadow-md text-xs hover:bg-blue-700"
                >
                  {tr('Tambah Libur', 'Add Holiday')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
