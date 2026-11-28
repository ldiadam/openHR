import React, { useEffect, useMemo, useState } from 'react';
import { Laptop, Plus, UserPlus, RotateCcw, Search, Pencil, Trash2, FileDown, X } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { apiFetch } from '../api';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

export const AssetsPage: React.FC = () => {
  const { user } = useAuth();
  const { tr } = useLanguage();
  const canManage = user?.role === 'owner_admin' || user?.role === 'manager';

  const [assets, setAssets] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [notice, setNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [assetTag, setAssetTag] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('laptop');
  const [serial, setSerial] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [purchaseCost, setPurchaseCost] = useState('');
  const [condition, setCondition] = useState('good');
  const [notes, setNotes] = useState('');

  const [assignTarget, setAssignTarget] = useState<any | null>(null);
  const [assignEmpId, setAssignEmpId] = useState('');

  const [detail, setDetail] = useState<{ asset: any; history: any[] } | null>(null);

  const flash = (type: 'ok' | 'err', text: string) => {
    setNotice({ type, text });
    setTimeout(() => setNotice(null), 4000);
  };

  const load = async () => {
    setLoading(true);
    try {
      if (canManage) {
        const params = new URLSearchParams();
        if (statusFilter) params.set('status', statusFilter);
        if (search.trim()) params.set('search', search.trim());
        const res = await apiFetch(`/assets?${params.toString()}`);
        setAssets(res.assets || []);
        setEmployees(res.employees || []);
        if (!assignEmpId && res.employees?.[0]?.id) setAssignEmpId(res.employees[0].id);
      } else {
        const res = await apiFetch('/assets/mine');
        setAssets(res.assets || []);
      }
    } catch (err: any) {
      flash('err', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [statusFilter]);

  const kpis = useMemo(() => {
    const total = assets.length;
    const available = assets.filter((a) => a.status === 'available').length;
    const assigned = assets.filter((a) => a.status === 'assigned').length;
    const totalValue = assets.reduce((sum, a) => sum + Number(a.purchase_cost || 0), 0);
    return { total, available, assigned, totalValue };
  }, [assets]);

  const openDetail = async (id: string) => {
    if (!canManage) return;
    try {
      const res = await apiFetch(`/assets/${id}`);
      setDetail(res);
    } catch (err: any) {
      flash('err', err.message);
    }
  };

  const downloadHandoverPdf = (asset: any, assignment: any) => {
    const doc = new jsPDF();
    doc.setFontSize(15);
    doc.text('ASSET HANDOVER / ASSIGNMENT RECEIPT', 14, 20);
    doc.setFontSize(10);
    doc.text(`Asset Tag: ${asset.asset_tag}`, 14, 34);
    doc.text(`Asset Name: ${asset.name} (${asset.category})`, 14, 41);
    doc.text(`Serial Number: ${asset.serial_number || '-'}`, 14, 48);
    doc.text(`Employee: ${assignment.employee_name} (${assignment.employee_nik})`, 14, 58);
    doc.text(`Department: ${assignment.department_name || '-'}`, 14, 65);
    doc.text(`Assigned At: ${String(assignment.assigned_at || '').slice(0, 16)}`, 14, 72);
    doc.text(`Condition Out: ${assignment.condition_out || 'good'}`, 14, 79);
    if (assignment.returned_at) {
      doc.text(`Returned At: ${String(assignment.returned_at).slice(0, 16)} (${assignment.condition_in || 'good'})`, 14, 86);
    }
    doc.text('Received By: _______________________', 14, 112);
    doc.text('Authorized By: _____________________', 115, 112);
    doc.save(`Asset_${asset.asset_tag}.pdf`);
  };

  const openNew = () => {
    setEditingId(null);
    setAssetTag('');
    setName('');
    setCategory('laptop');
    setSerial('');
    setPurchaseDate('');
    setPurchaseCost('');
    setCondition('good');
    setNotes('');
    setShowAdd(true);
  };

  const openEdit = (a: any) => {
    setEditingId(a.id);
    setAssetTag(a.asset_tag || '');
    setName(a.name || '');
    setCategory(a.category || 'laptop');
    setSerial(a.serial_number || '');
    setPurchaseDate(a.purchase_date || '');
    setPurchaseCost(String(a.purchase_cost || ''));
    setCondition(a.condition || 'good');
    setNotes(a.notes || '');
    setShowAdd(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        asset_tag: assetTag.trim(),
        name: name.trim(),
        category,
        serial_number: serial.trim(),
        purchase_date: purchaseDate || null,
        purchase_cost: Number(purchaseCost || 0) || 0,
        condition,
        notes: notes.trim(),
      };
      if (editingId) {
        await apiFetch(`/assets/${editingId}`, { method: 'PUT', body: JSON.stringify(payload) });
        flash('ok', tr('Aset diperbarui.', 'Asset updated.'));
      } else {
        await apiFetch('/assets', { method: 'POST', body: JSON.stringify(payload) });
        flash('ok', tr('Aset berhasil ditambahkan.', 'Asset added.'));
      }
      setShowAdd(false);
      await load();
    } catch (err: any) {
      flash('err', err.message);
    }
  };

  const handleDelete = async (a: any) => {
    if (!window.confirm(tr(`Hapus aset ${a.asset_tag}?`, `Delete asset ${a.asset_tag}?`))) return;
    try {
      await apiFetch(`/assets/${a.id}`, { method: 'DELETE' });
      flash('ok', tr('Aset dihapus.', 'Asset deleted.'));
      await load();
    } catch (err: any) {
      flash('err', err.message);
    }
  };

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignTarget || !assignEmpId) return;
    try {
      await apiFetch(`/assets/${assignTarget.id}/assign`, {
        method: 'POST',
        body: JSON.stringify({ employee_id: assignEmpId }),
      });
      setAssignTarget(null);
      flash('ok', tr('Aset diserahkan ke karyawan.', 'Asset assigned.'));
      await load();
    } catch (err: any) {
      flash('err', err.message);
    }
  };

  const handleReturn = async (assetId: string) => {
    try {
      await apiFetch(`/assets/${assetId}/return`, { method: 'POST', body: JSON.stringify({ condition_in: 'good' }) });
      flash('ok', tr('Aset dikembalikan ke inventaris.', 'Asset returned.'));
      await load();
    } catch (err: any) {
      flash('err', err.message);
    }
  };

  const statusBadge: Record<string, string> = {
    available: 'bg-emerald-100 text-emerald-700',
    assigned: 'bg-blue-100 text-blue-700',
    maintenance: 'bg-amber-100 text-amber-800',
    retired: 'bg-slate-100 text-slate-600',
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-black text-slate-900">
            <Laptop size={20} className="text-blue-600" />
            {canManage ? tr('Aset & Inventaris Perusahaan', 'Company Assets & Inventory') : tr('Aset Saya', 'My Assigned Assets')}
          </h1>
          <p className="text-xs text-slate-500">
            {tr('Pelacakan perangkat kerja, nilai aset, riwayat serah-terima, dan tanda terima PDF.', 'Track company equipment, asset value, handover history, and PDF receipts.')}
          </p>
        </div>
        {canManage && (
          <button type="button" onClick={openNew} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white hover:bg-slate-800">
            <Plus size={15} /> {tr('Tambah Aset', 'Add Asset')}
          </button>
        )}
      </div>

      {/* KPI Cards */}
      {canManage && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-3.5">
            <div className="text-[11px] font-semibold text-slate-400">{tr('Total Aset', 'Total Assets')}</div>
            <div className="mt-1 text-xl font-black text-slate-900">{kpis.total}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-3.5">
            <div className="text-[11px] font-semibold text-emerald-600">{tr('Tersedia', 'Available')}</div>
            <div className="mt-1 text-xl font-black text-emerald-700">{kpis.available}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-3.5">
            <div className="text-[11px] font-semibold text-blue-600">{tr('Dipinjamkan', 'Assigned')}</div>
            <div className="mt-1 text-xl font-black text-blue-700">{kpis.assigned}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-3.5">
            <div className="text-[11px] font-semibold text-slate-400">{tr('Total Nilai Aset', 'Total Asset Value')}</div>
            <div className="mt-1 text-base font-black text-slate-900">Rp {kpis.totalValue.toLocaleString('id-ID')}</div>
          </div>
        </div>
      )}

      {notice && (
        <div className={`rounded-xl border px-3.5 py-2.5 text-xs font-semibold ${notice.type === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>
          {notice.text}
        </div>
      )}

      {canManage && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="relative sm:col-span-2">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && load()}
              placeholder={tr('Cari kode aset, nama, serial, atau pemegang...', 'Search tag, name, serial, or holder...')}
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs"
            />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium">
            <option value="">{tr('Semua Status', 'All Statuses')}</option>
            <option value="available">Available</option>
            <option value="assigned">Assigned</option>
            <option value="maintenance">Maintenance</option>
          </select>
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-[11px] font-bold uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Tag</th>
              <th className="px-4 py-3">{tr('Nama Aset', 'Asset')}</th>
              <th className="px-4 py-3">{tr('Kategori', 'Category')}</th>
              <th className="px-4 py-3">Serial</th>
              <th className="px-4 py-3">{tr('Pemegang', 'Holder')}</th>
              <th className="px-4 py-3">Status</th>
              {canManage && <th className="px-4 py-3 text-right">{tr('Aksi', 'Action')}</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td colSpan={canManage ? 7 : 6} className="px-4 py-3"><div className="h-4 rounded bg-slate-100" /></td>
                </tr>
              ))
            ) : assets.length === 0 ? (
              <tr><td colSpan={canManage ? 7 : 6} className="p-8 text-center text-slate-400">{tr('Belum ada data aset.', 'No assets found.')}</td></tr>
            ) : (
              assets.map((a) => (
                <tr key={a.id} onClick={() => openDetail(a.id)} className={canManage ? 'cursor-pointer hover:bg-slate-50' : ''}>
                  <td className="px-4 py-3 font-mono font-bold text-slate-800">{a.asset_tag}</td>
                  <td className="px-4 py-3 font-semibold text-slate-900">{a.name}</td>
                  <td className="px-4 py-3 uppercase text-slate-500">{a.category}</td>
                  <td className="px-4 py-3 font-mono text-slate-500">{a.serial_number || '-'}</td>
                  <td className="px-4 py-3">{a.holder_name || (canManage ? '-' : user?.name)}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${statusBadge[a.status] || statusBadge.available}`}>{a.status}</span>
                  </td>
                  {canManage && (
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="inline-flex items-center gap-1.5">
                        <button type="button" onClick={() => openEdit(a)} className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-100" title={tr('Ubah', 'Edit')}><Pencil size={12} /></button>
                        <button type="button" onClick={() => handleDelete(a)} className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600" title={tr('Hapus', 'Delete')}><Trash2 size={12} /></button>
                        {a.status === 'available' ? (
                          <button type="button" onClick={() => setAssignTarget(a)} className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-blue-700">
                            <UserPlus size={12} /> {tr('Serahkan', 'Assign')}
                          </button>
                        ) : a.status === 'assigned' ? (
                          <button type="button" onClick={() => handleReturn(a.id)} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-50">
                            <RotateCcw size={12} /> {tr('Kembalikan', 'Return')}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add / Edit Asset Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-xl">
            <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-base font-black text-slate-900">{editingId ? tr('Ubah Aset', 'Edit Asset') : tr('Tambah Aset Baru', 'Add Asset')}</h2>
              <button type="button" onClick={() => setShowAdd(false)} className="rounded-xl p-1 text-slate-400"><X size={18} /></button>
            </div>
            <form onSubmit={handleSave} className="space-y-3 text-xs">
              <input required value={assetTag} onChange={(e) => setAssetTag(e.target.value)} placeholder="Asset Tag (e.g. AST-LTP-001)" className="w-full rounded-xl border border-slate-300 p-2.5" />
              <input required value={name} onChange={(e) => setName(e.target.value)} placeholder={tr('Nama Aset (e.g. MacBook Pro 14)', 'Asset Name')} className="w-full rounded-xl border border-slate-300 p-2.5" />
              <div className="grid grid-cols-2 gap-2">
                <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-xl border border-slate-300 bg-white p-2.5">
                  <option value="laptop">Laptop</option>
                  <option value="phone">Phone</option>
                  <option value="access_card">Access Card / Key</option>
                  <option value="vehicle">Vehicle</option>
                  <option value="tool">Tool / Equipment</option>
                  <option value="other">Other</option>
                </select>
                <select value={condition} onChange={(e) => setCondition(e.target.value)} className="rounded-xl border border-slate-300 bg-white p-2.5">
                  <option value="good">Good</option>
                  <option value="fair">Fair</option>
                  <option value="damaged">Damaged</option>
                  <option value="retired">Retired</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} className="rounded-xl border border-slate-300 p-2.5" />
                <input type="number" value={purchaseCost} onChange={(e) => setPurchaseCost(e.target.value)} placeholder="Purchase Cost (Rp)" className="rounded-xl border border-slate-300 p-2.5" />
              </div>
              <input value={serial} onChange={(e) => setSerial(e.target.value)} placeholder="Serial Number (optional)" className="w-full rounded-xl border border-slate-300 p-2.5" />
              <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" className="w-full rounded-xl border border-slate-300 p-2.5" />
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowAdd(false)} className="rounded-xl border border-slate-200 px-4 py-2 font-bold text-slate-600">{tr('Batal', 'Cancel')}</button>
                <button type="submit" className="rounded-xl bg-slate-900 px-5 py-2 font-bold text-white">{tr('Simpan', 'Save')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign Modal */}
      {assignTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-xl">
            <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-base font-black text-slate-900">{tr('Serahkan Aset', 'Assign Asset')}: {assignTarget.asset_tag}</h2>
              <button type="button" onClick={() => setAssignTarget(null)} className="rounded-xl p-1 text-slate-400"><X size={18} /></button>
            </div>
            <form onSubmit={handleAssign} className="space-y-3 text-xs">
              <select value={assignEmpId} onChange={(e) => setAssignEmpId(e.target.value)} className="w-full rounded-xl border border-slate-300 bg-white p-2.5">
                {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.nik} · {emp.full_name}</option>)}
              </select>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setAssignTarget(null)} className="rounded-xl border border-slate-200 px-4 py-2 font-bold text-slate-600">{tr('Batal', 'Cancel')}</button>
                <button type="submit" className="rounded-xl bg-blue-600 px-5 py-2 font-bold text-white">{tr('Serahkan', 'Assign')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Asset Detail & History Modal */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl bg-white shadow-xl">
            <div className="flex shrink-0 items-start justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <span className="font-mono text-xs font-bold text-slate-500">{detail.asset.asset_tag}</span>
                <h2 className="text-base font-black text-slate-900">{detail.asset.name}</h2>
                <p className="text-xs text-slate-500">
                  {detail.asset.category} · Serial: {detail.asset.serial_number || '-'} · Cost: Rp {Number(detail.asset.purchase_cost || 0).toLocaleString('id-ID')}
                </p>
              </div>
              <button type="button" onClick={() => setDetail(null)}><X size={18} className="text-slate-400" /></button>
            </div>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain p-5 text-xs">
              <div className="font-bold text-slate-800">{tr('Riwayat Penyerahan & Pengembalian', 'Assignment & Return History')}</div>
              {detail.history.length === 0 ? (
                <p className="text-slate-400">{tr('Belum ada riwayat penyerahan.', 'No assignment history yet.')}</p>
              ) : (
                detail.history.map((h) => (
                  <div key={h.id} className="flex items-center justify-between rounded-xl border border-slate-200 p-3">
                    <div>
                      <div className="font-bold text-slate-900">{h.employee_name} ({h.employee_nik})</div>
                      <div className="text-[11px] text-slate-500">
                        Out: {String(h.assigned_at || '').slice(0, 10)} ({h.condition_out})
                        {h.returned_at ? ` · Returned: ${String(h.returned_at).slice(0, 10)} (${h.condition_in})` : ' · Active'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => downloadHandoverPdf(detail.asset, h)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
                    >
                      <FileDown size={12} /> PDF
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
