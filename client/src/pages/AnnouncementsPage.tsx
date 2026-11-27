import React, { useEffect, useMemo, useState } from 'react';
import { Megaphone, Plus, Pin, CheckCircle2, Paperclip, Pencil, Trash2, X, FileText, Search, Users } from 'lucide-react';
import { apiFetch, getToken } from '../api';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

export const AnnouncementsPage: React.FC = () => {
  const { user } = useAuth();
  const { tr } = useLanguage();
  const canManage = user?.role === 'owner_admin' || user?.role === 'manager';

  const [items, setItems] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [totalEmployees, setTotalEmployees] = useState(0);
  const [loading, setLoading] = useState(true);
  const [catFilter, setCatFilter] = useState('');
  const [search, setSearch] = useState('');

  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<'memo' | 'policy' | 'sop' | 'holiday'>('memo');
  const [targetScope, setTargetScope] = useState<'all' | 'department' | 'branch'>('all');
  const [targetId, setTargetId] = useState('');
  const [requireAck, setRequireAck] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [expiresAt, setExpiresAt] = useState('');
  const [file, setFile] = useState<File | null>(null);

  // Ack breakdown modal
  const [ackDetail, setAckDetail] = useState<{ announcement: any; acked: any[]; pending: any[] } | null>(null);

  const flash = (type: 'ok' | 'err', text: string) => {
    setNotice({ type, text });
    setTimeout(() => setNotice(null), 4000);
  };

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/announcements');
      setItems(res.announcements || []);
      setTotalEmployees(res.totalActiveEmployees || 0);
      setDepartments(res.departments || []);
      setBranches(res.branches || []);
    } catch (err: any) {
      flash('err', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    return items.filter((it) => {
      if (catFilter && it.category !== catFilter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        if (!`${it.title} ${it.body}`.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [items, catFilter, search]);

  const openNew = () => {
    setEditingId(null);
    setTitle('');
    setBody('');
    setCategory('memo');
    setTargetScope('all');
    setTargetId('');
    setRequireAck(false);
    setPinned(false);
    setExpiresAt('');
    setFile(null);
    setShowCreate(true);
  };

  const openEdit = (item: any) => {
    setEditingId(item.id);
    setTitle(item.title || '');
    setBody(item.body || '');
    setCategory(item.category || 'memo');
    setTargetScope(item.target_scope || 'all');
    setTargetId(item.target_id || '');
    setRequireAck(Boolean(item.require_ack));
    setPinned(Boolean(item.pinned));
    setExpiresAt(item.expires_at || '');
    setFile(null);
    setShowCreate(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        body: body.trim(),
        category,
        target_scope: targetScope,
        target_id: targetScope === 'all' ? null : targetId || null,
        require_ack: requireAck,
        pinned,
        expires_at: expiresAt || null,
      };
      let resId = editingId;
      if (editingId) {
        await apiFetch(`/announcements/${editingId}`, { method: 'PUT', body: JSON.stringify(payload) });
        flash('ok', tr('Pengumuman diperbarui.', 'Announcement updated.'));
      } else {
        const created = await apiFetch('/announcements', { method: 'POST', body: JSON.stringify(payload) });
        resId = created.id;
        flash('ok', tr('Pengumuman berhasil diterbitkan.', 'Announcement published.'));
      }
      if (file && resId) {
        const fd = new FormData();
        fd.append('file', file);
        const token = getToken();
        await fetch(`/api/announcements/${resId}/attachment`, {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: fd,
        });
      }
      setShowCreate(false);
      await load();
    } catch (err: any) {
      flash('err', err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAck = async (id: string) => {
    try {
      await apiFetch(`/announcements/${id}/ack`, { method: 'POST' });
      flash('ok', tr('Terima kasih, konfirmasi baca tercatat.', 'Acknowledged.'));
      await load();
    } catch (err: any) {
      flash('err', err.message);
    }
  };

  const openAckBreakdown = async (id: string) => {
    try {
      const res = await apiFetch(`/announcements/${id}/acks`);
      setAckDetail(res);
    } catch (err: any) {
      flash('err', err.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(tr('Hapus pengumuman ini?', 'Delete this announcement?'))) return;
    try {
      await apiFetch(`/announcements/${id}`, { method: 'DELETE' });
      await load();
    } catch (err: any) {
      flash('err', err.message);
    }
  };

  const catBadge: Record<string, string> = {
    memo: 'bg-blue-100 text-blue-700',
    policy: 'bg-purple-100 text-purple-700',
    sop: 'bg-amber-100 text-amber-800',
    holiday: 'bg-emerald-100 text-emerald-700',
  };

  const pendingMyAck = items.filter((i) => i.require_ack && !i.acknowledged).length;

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-black text-slate-900">
            <Megaphone size={20} className="text-blue-600" />
            {tr('Pengumuman & Kebijakan', 'Announcements & Policies')}
          </h1>
          <p className="text-xs text-slate-500">
            {tr('Memo perusahaan, SOP, kebijakan HR, dan pelacakan konfirmasi baca.', 'Company memos, SOPs, HR policies, and read-acknowledgment tracking.')}
          </p>
        </div>
        {canManage && (
          <button type="button" onClick={openNew} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white hover:bg-slate-800">
            <Plus size={15} /> {tr('Buat Pengumuman', 'New Announcement')}
          </button>
        )}
      </div>

      {/* KPI Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-3.5">
          <div className="text-[11px] font-semibold text-slate-400">{tr('Total Aktif', 'Total Notices')}</div>
          <div className="mt-1 text-xl font-black text-slate-900">{items.length}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-3.5">
          <div className="text-[11px] font-semibold text-amber-600">{tr('Disematkan', 'Pinned')}</div>
          <div className="mt-1 text-xl font-black text-amber-700">{items.filter((i) => i.pinned).length}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-3.5">
          <div className="text-[11px] font-semibold text-blue-600">{tr('Perlu Konfirmasi', 'Pending My Ack')}</div>
          <div className="mt-1 text-xl font-black text-blue-700">{pendingMyAck}</div>
        </div>
      </div>

      {notice && (
        <div className={`rounded-xl border px-3.5 py-2.5 text-xs font-semibold ${notice.type === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>
          {notice.text}
        </div>
      )}

      {/* Search & Category Filter */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={tr('Cari pengumuman...', 'Search announcements...')} className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs" />
        </div>
        <div className="flex flex-wrap gap-1">
          {['', 'memo', 'policy', 'sop', 'holiday'].map((cat) => (
            <button
              key={cat || 'all'}
              type="button"
              onClick={() => setCatFilter(cat)}
              className={`rounded-xl px-3 py-1.5 text-[11px] font-bold uppercase ${catFilter === cat ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-600'}`}
            >
              {cat || tr('Semua', 'All')}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-2xl border border-slate-200 bg-white p-4 space-y-2">
              <div className="h-4 w-1/3 rounded bg-slate-200" />
              <div className="h-3 w-full rounded bg-slate-100" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-xs text-slate-500">
          {tr('Belum ada pengumuman.', 'No announcements found.')}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => (
            <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {Boolean(item.pinned) && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                        <Pin size={10} /> Pinned
                      </span>
                    )}
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${catBadge[item.category] || catBadge.memo}`}>
                      {item.category}
                    </span>
                    {item.target_scope !== 'all' && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-600">
                        {item.target_scope}
                      </span>
                    )}
                    <span className="text-[10px] text-slate-400">
                      {item.publisher_name || 'HR'} · {String(item.published_at || '').slice(0, 10)}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-slate-900">{item.title}</h3>
                </div>
                {canManage && (
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => openEdit(item)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title={tr('Ubah', 'Edit')}>
                      <Pencil size={14} />
                    </button>
                    <button type="button" onClick={() => handleDelete(item.id)} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title={tr('Hapus', 'Delete')}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>

              <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-600">{item.body}</p>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2.5 text-[11px]">
                <div className="flex flex-wrap items-center gap-2">
                  {item.attachment_url && (
                    <a
                      href={`${item.attachment_url}?token=${encodeURIComponent(getToken() || '')}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 font-semibold text-blue-700 hover:bg-blue-50"
                    >
                      <Paperclip size={11} />
                      {item.attachment_name || 'Attachment'}
                    </a>
                  )}
                  {canManage && Boolean(item.require_ack) && (
                    <button
                      type="button"
                      onClick={() => openAckBreakdown(item.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      <Users size={11} />
                      {tr('Konfirmasi baca', 'Read tracker')}: <strong>{item.ack_count}</strong> / {totalEmployees}
                    </button>
                  )}
                </div>

                {Boolean(item.require_ack) && user?.employeeId && (
                  item.acknowledged ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 font-bold text-emerald-700">
                      <CheckCircle2 size={12} /> {tr('Sudah Dibaca', 'Acknowledged')}
                    </span>
                  ) : (
                    <button type="button" onClick={() => handleAck(item.id)} className="inline-flex items-center gap-1 rounded-xl bg-blue-600 px-3 py-1.5 font-bold text-white hover:bg-blue-700">
                      <CheckCircle2 size={12} /> {tr('Tandai Sudah Dibaca', 'Acknowledge')}
                    </button>
                  )
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white p-5 shadow-xl">
            <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-base font-black text-slate-900">
                {editingId ? tr('Ubah Pengumuman', 'Edit Announcement') : tr('Pengumuman Baru', 'New Announcement')}
              </h2>
              <button type="button" onClick={() => setShowCreate(false)} className="rounded-xl p-1 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
            </div>
            <form onSubmit={handleSave} className="space-y-3 text-xs">
              <div>
                <label className="mb-1 block font-semibold text-slate-700">{tr('Judul', 'Title')} *</label>
                <input required value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-xl border border-slate-300 p-2.5" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block font-semibold text-slate-700">{tr('Kategori', 'Category')}</label>
                  <select value={category} onChange={(e) => setCategory(e.target.value as any)} className="w-full rounded-xl border border-slate-300 bg-white p-2.5">
                    <option value="memo">Memo</option>
                    <option value="policy">Policy</option>
                    <option value="sop">SOP</option>
                    <option value="holiday">Holiday</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block font-semibold text-slate-700">{tr('Target Penerima', 'Target Audience')}</label>
                  <select value={targetScope} onChange={(e) => { setTargetScope(e.target.value as any); setTargetId(''); }} className="w-full rounded-xl border border-slate-300 bg-white p-2.5">
                    <option value="all">{tr('Semua Karyawan', 'All Employees')}</option>
                    <option value="department">{tr('Departemen Tertentu', 'Specific Department')}</option>
                    <option value="branch">{tr('Cabang Tertentu', 'Specific Branch')}</option>
                  </select>
                </div>
              </div>
              {targetScope !== 'all' && (
                <select value={targetId} onChange={(e) => setTargetId(e.target.value)} required className="w-full rounded-xl border border-slate-300 bg-white p-2.5">
                  <option value="">{tr('Pilih target...', 'Select target...')}</option>
                  {(targetScope === 'department' ? departments : branches).map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              )}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block font-semibold text-slate-700">{tr('Lampiran (PDF/Dokumen)', 'Attachment')}</label>
                  <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} className="w-full rounded-xl border border-slate-300 p-2 text-[11px]" />
                </div>
                <div>
                  <label className="mb-1 block font-semibold text-slate-700">{tr('Kedaluwarsa (Opsional)', 'Expires On')}</label>
                  <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className="w-full rounded-xl border border-slate-300 p-2" />
                </div>
              </div>
              <div>
                <label className="mb-1 block font-semibold text-slate-700">{tr('Isi Pengumuman', 'Content')} *</label>
                <textarea required rows={4} value={body} onChange={(e) => setBody(e.target.value)} className="w-full rounded-xl border border-slate-300 p-2.5" />
              </div>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 font-semibold text-slate-700">
                  <input type="checkbox" checked={requireAck} onChange={(e) => setRequireAck(e.target.checked)} />
                  {tr('Wajib konfirmasi baca', 'Require read acknowledgment')}
                </label>
                <label className="flex items-center gap-2 font-semibold text-slate-700">
                  <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
                  {tr('Sematkan di atas', 'Pin to top')}
                </label>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="rounded-xl border border-slate-200 px-4 py-2 font-bold text-slate-600">{tr('Batal', 'Cancel')}</button>
                <button type="submit" disabled={saving} className="rounded-xl bg-slate-900 px-5 py-2 font-bold text-white">
                  {saving ? tr('Menyimpan...', 'Saving...') : tr('Simpan', 'Save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Who Read / Who Hasn't Modal */}
      {ackDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-black text-slate-900">{ackDetail.announcement.title}</h2>
                <p className="text-xs text-slate-500">
                  {ackDetail.acked.length} {tr('sudah membaca', 'acknowledged')} · {ackDetail.pending.length} {tr('belum membaca', 'pending')}
                </p>
              </div>
              <button type="button" onClick={() => setAckDetail(null)}><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 text-xs">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-3 space-y-1.5">
                <div className="font-bold text-emerald-800">{tr('Sudah Membaca', 'Acknowledged')} ({ackDetail.acked.length})</div>
                {ackDetail.acked.map((e) => (
                  <div key={e.id} className="flex justify-between text-[11px] text-slate-700">
                    <span>{e.full_name}</span>
                    <span className="text-slate-400">{String(e.acknowledged_at || '').slice(0, 10)}</span>
                  </div>
                ))}
              </div>
              <div className="rounded-2xl border border-rose-200 bg-rose-50/40 p-3 space-y-1.5">
                <div className="font-bold text-rose-800">{tr('Belum Membaca', 'Pending')} ({ackDetail.pending.length})</div>
                {ackDetail.pending.map((e) => (
                  <div key={e.id} className="text-[11px] text-slate-700">{e.full_name} ({e.department_name || '-'})</div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
