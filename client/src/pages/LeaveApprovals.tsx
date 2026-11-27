import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react';
import { apiFetch } from '../api';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { SignaturePad } from '../components/SignaturePad';
import { generateLeaveFormPdf } from '../utils/leaveFormPdf';
import { TableSkeleton } from '../components/Skeleton';
import { useLockBodyScroll } from '../hooks/useLockBodyScroll';

/**
 * Approval inbox for the multi-stage leave application.
 *
 * Only the stage that is currently pending is editable; every earlier stage is
 * shown read-only with who acted and when. Which controls appear is decided by
 * `rights` from the server, so the UI cannot offer an action the API refuses.
 */

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-700',
  submitted: 'bg-slate-100 text-slate-700',
  pending_administrator: 'bg-amber-100 text-amber-800',
  pending_dept_head: 'bg-sky-100 text-sky-800',
  pending_management: 'bg-indigo-100 text-indigo-800',
  approved: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-rose-100 text-rose-800',
  cancelled: 'bg-slate-200 text-slate-600',
};

const STATUS_LABELS: Record<string, { id: string; en: string }> = {
  pending: { id: 'Menunggu', en: 'Pending' },
  submitted: { id: 'Dikirim', en: 'Submitted' },
  pending_administrator: { id: 'Pemeriksaan Administratif', en: 'Administrative Check' },
  pending_dept_head: { id: 'Menunggu Department Head', en: 'Awaiting Department Head' },
  pending_management: { id: 'Menunggu Management', en: 'Awaiting Management' },
  approved: { id: 'Disetujui', en: 'Approved' },
  rejected: { id: 'Ditolak', en: 'Rejected' },
  cancelled: { id: 'Dibatalkan', en: 'Cancelled' },
};

const FILTERS = [
  { key: 'open', id: 'Perlu tindakan', en: 'Needs action' },
  { key: 'all', id: 'Semua', en: 'All' },
  { key: 'approved', id: 'Disetujui', en: 'Approved' },
  { key: 'rejected', id: 'Ditolak', en: 'Rejected' },
];

const formatDDMMYY = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value.length <= 10 ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getUTCDate())} ${pad(date.getUTCMonth() + 1)} ${String(date.getUTCFullYear()).slice(-2)}`;
};

const parseList = (raw: unknown): string[] => {
  if (typeof raw !== 'string' || !raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
};

export const LeaveApprovals: React.FC<{ embedded?: boolean }> = ({ embedded = false }) => {
  const { isOwnerAdmin } = useAuth();
  const { tr } = useLanguage();

  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('open');
  const [search, setSearch] = useState('');
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Stage inputs
  const [adminFlags, setAdminFlags] = useState<string[]>([]);
  const [adminOther, setAdminOther] = useState('');
  const [headIssues, setHeadIssues] = useState<string[]>([]);
  const [headDecision, setHeadDecision] = useState('APPROVED');
  const [managementDecision, setManagementDecision] = useState('APPROVED');
  const [managementSignature, setManagementSignature] = useState<string | null>(null);
  const [note, setNote] = useState('');

  // Override
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideStatus, setOverrideStatus] = useState('cancelled');
  const [overrideReason, setOverrideReason] = useState('');

  const [conflicts, setConflicts] = useState<any[]>([]);
  const [flagsConfig, setFlagsConfig] = useState<{ admin: string[]; head: string[] }>({ admin: [], head: [] });

  useLockBodyScroll(Boolean(openId));

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await apiFetch('/leave/applications');
      setApplications(res.applications || []);
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    (async () => {
      try {
        const config = await apiFetch('/leave/form/config');
        setFlagsConfig({
          admin: config.adminClashFlags || [],
          head: config.deptHeadFlags || [],
        });
      } catch {
        // Flags still render from the record itself.
      }
    })();
  }, [load]);

  const filtered = useMemo(() => {
    const openStatuses = ['pending', 'submitted', 'pending_administrator', 'pending_dept_head', 'pending_management'];
    return applications.filter((app) => {
      if (filter === 'open' && !openStatuses.includes(app.status)) return false;
      if (filter === 'approved' && app.status !== 'approved') return false;
      if (filter === 'rejected' && app.status !== 'rejected') return false;

      if (search.trim()) {
        const needle = search.trim().toLowerCase();
        const haystack = [app.full_name, app.nik, app.reference_no, app.department_label, app.leave_type_label]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [applications, filter, search]);

  const openDetail = async (id: string) => {
    setOpenId(id);
    setDetailLoading(true);
    setDetail(null);
    setMsg(null);
    setConflicts([]);
    setOverrideOpen(false);
    setOverrideReason('');
    setNote('');

    try {
      const res = await apiFetch(`/leave/applications/${id}`);
      setDetail(res);
      setAdminFlags(parseList(res.application.admin_clash_checks));
      setAdminOther(res.application.admin_other_reason || '');
      setHeadIssues(parseList(res.application.dept_head_issues));
      setHeadDecision(res.application.dept_head_decision === 'NOT_APPROVED' ? 'NOT_APPROVED' : 'APPROVED');
      setManagementDecision(
        res.application.management_decision === 'NOT_APPROVED' ? 'NOT_APPROVED' : 'APPROVED'
      );
      setManagementSignature(null);

      // Clash detection helps the administrator and the department head.
      if (['pending_administrator', 'submitted', 'pending', 'pending_dept_head'].includes(res.application.status)) {
        try {
          const conflictRes = await apiFetch(
            `/leave/applications/conflicts?departmentId=${encodeURIComponent(
              res.application.department_id || ''
            )}&start=${res.application.start_date}&end=${res.application.end_date}&excludeId=${res.application.id}`
          );
          setConflicts(conflictRes.conflicts || []);
        } catch {
          // Adjacent information only; never blocks the decision.
        }
      }
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
      setOpenId(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setOpenId(null);
    setDetail(null);
  };

  const runAction = async (path: string, body: Record<string, unknown>, successText: string) => {
    setSaving(true);
    setMsg(null);
    try {
      await apiFetch(path, { method: 'POST', body: JSON.stringify(body) });
      setMsg({ type: 'success', text: successText });
      await load(true);
      if (openId) await openDetail(openId);
      return true;
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const toggleFlag = (list: string[], setList: (next: string[]) => void, flag: string) => {
    setList(list.includes(flag) ? list.filter((item) => item !== flag) : [...list, flag]);
  };

  const handlePrint = async () => {
    if (!detail) return;
    try {
      const res = await apiFetch(`/leave/applications/${detail.application.id}/print`);
      if (!res.canPrint) {
        setMsg({
          type: 'error',
          text: tr(
            'Hanya Administrator yang dapat mencetak formulir resmi.',
            'Only an Administrator can export the official form.'
          ),
        });
        return;
      }
      await generateLeaveFormPdf({
        application: res.application,
        letterhead: res.letterhead,
        adminFlags: res.adminClashFlags || flagsConfig.admin,
        deptHeadFlags: res.deptHeadFlags || flagsConfig.head,
        departments: res.departments || [],
        leaveTypes: res.leaveTypes || [],
        policyNotes: [
          tr(
            'Formulir ini harus ditandatangani oleh pemohon sebelum diproses.',
            'This form must be signed by the applicant before it is processed.'
          ),
          tr(
            'Salinan formulir tidak boleh digandakan tanpa izin Administrator.',
            'Copies of this form may not be duplicated without the Administrator’s permission.'
          ),
          tr(
            'Pemeriksaan administratif harus diselesaikan sebelum Department Head meninjau.',
            'The administrative check must be completed before the Department Head reviews.'
          ),
          tr(
            'Department Head tidak dapat menyetujui sebelum pemeriksaan administratif selesai.',
            'The Department Head cannot approve before the administrative check is complete.'
          ),
          tr(
            'Pemberitahuan hasil akhir kepada pemohon dilakukan dalam 1 hari kerja.',
            'The applicant must be notified of the final outcome within 1 working day.'
          ),
          tr(
            'Management dapat membatalkan atau mengesampingkan keputusan departemen.',
            'Management may cancel or override any departmental decision.'
          ),
          tr(
            'Cuti belum resmi disetujui sampai persetujuan Management selesai.',
            'Leave is not officially confirmed until Management approval is complete.'
          ),
        ],
      });
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    }
  };

  const statusLabel = (status: string) =>
    STATUS_LABELS[status] ? tr(STATUS_LABELS[status].id, STATUS_LABELS[status].en) : status;

  const app = detail?.application;
  const rights = detail?.rights;

  const isOverdue = (row: any) =>
    row.sla_due_at &&
    new Date(row.sla_due_at) < new Date() &&
    ['submitted', 'pending_administrator', 'pending_dept_head', 'pending_management'].includes(row.status);

  const isOpenRow = (status: string) =>
    ['pending', 'submitted', 'pending_administrator', 'pending_dept_head', 'pending_management'].includes(status);

  const handleQuickDecision = async (row: any, decision: 'approved' | 'rejected') => {
    setSaving(true);
    setMsg(null);
    try {
      if (row.status === 'pending') {
        await apiFetch(`/leave/requests/${row.id}/review`, {
          method: 'POST',
          body: JSON.stringify({ status: decision }),
        });
      } else {
        await apiFetch(`/leave/applications/${row.id}/override`, {
          method: 'POST',
          body: JSON.stringify({
            status: decision,
            reason: decision === 'approved' ? 'Approved by HR / Management' : 'Rejected by HR / Management',
          }),
        });
      }
      setMsg({
        type: 'success',
        text: decision === 'approved' ? tr('Cuti disetujui.', 'Leave approved.') : tr('Cuti ditolak.', 'Leave rejected.'),
      });
      await load(true);
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: any) => {
    if (
      !window.confirm(
        tr(
          'Hapus pengajuan cuti ini? Saldo cuti akan dipulihkan jika sebelumnya disetujui.',
          'Delete this leave request? Leave balance will be restored if it was approved.'
        )
      )
    ) {
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      await apiFetch(`/leave/requests/${row.id}`, { method: 'DELETE' });
      setMsg({ type: 'success', text: tr('Pengajuan cuti dihapus.', 'Leave request deleted.') });
      await load(true);
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={embedded ? 'space-y-4' : 'space-y-4 p-4 sm:p-5'}>
      {!embedded && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-lg font-black tracking-tight text-slate-900">
              {tr('Persetujuan Cuti', 'Leave Approvals')}
            </h1>
            <p className="text-[11px] text-slate-500">
              {tr(
                'Pemeriksaan administratif, tinjauan Department Head, dan keputusan Management.',
                'Administrative check, Department Head review, and Management decision.'
              )}
            </p>
          </div>
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
            {tr('Muat ulang', 'Refresh')}
          </button>
        </div>
      )}

      {msg && (
        <div
          className={`flex items-start gap-2 rounded-2xl border p-3 text-[11px] font-medium ${
            msg.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-rose-200 bg-rose-50 text-rose-800'
          }`}
        >
          {msg.type === 'success' ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
          <span className="flex-1">{msg.text}</span>
          <button onClick={() => setMsg(null)} aria-label="Dismiss">
            <X size={13} />
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((item) => (
            <button
              key={item.key}
              onClick={() => setFilter(item.key)}
              className={`rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition ${
                filter === item.key
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-100'
              }`}
            >
              {tr(item.id, item.en)}
            </button>
          ))}
        </div>
        <div className="relative ml-auto">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={tr('Cari nama / referensi', 'Search name / reference')}
            className="w-52 rounded-xl border border-slate-300 py-1.5 pl-8 pr-2 text-[11px] focus:border-blue-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-left text-[11px]">
          <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-2.5 font-bold">{tr('Referensi', 'Reference')}</th>
              <th className="px-3 py-2.5 font-bold">{tr('Pemohon', 'Applicant')}</th>
              <th className="px-3 py-2.5 font-bold">{tr('Jenis', 'Type')}</th>
              <th className="px-3 py-2.5 font-bold">{tr('Tanggal', 'Dates')}</th>
              <th className="px-3 py-2.5 font-bold">{tr('Status', 'Status')}</th>
              <th className="px-4 py-2.5 text-right font-bold">{tr('Aksi', 'Action')}</th>
            </tr>
          </thead>
          {loading ? (
            <TableSkeleton rows={5} columns={6} />
          ) : (
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                    {tr('Tidak ada pengajuan cuti.', 'No leave applications.')}
                  </td>
                </tr>
              ) : (
                filtered.map((row) => (
                  <tr key={row.id} className="cursor-pointer hover:bg-slate-50" onClick={() => openDetail(row.id)}>
                    <td className="px-4 py-2.5 font-mono text-[10px] font-bold text-slate-700">
                      {row.reference_no || '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-bold text-slate-900">{row.full_name}</div>
                      <div className="text-[10px] text-slate-400">{row.department_label || '—'}</div>
                    </td>
                    <td className="px-3 py-2.5 text-slate-700">{row.leave_type_label || '—'}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">
                      {formatDDMMYY(row.start_date)} → {formatDDMMYY(row.end_date)}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[9px] font-bold ${
                          STATUS_STYLES[row.status] || STATUS_STYLES.pending
                        }`}
                      >
                        {statusLabel(row.status)}
                      </span>
                      {isOverdue(row) && (
                        <span className="ml-1 inline-flex items-center gap-0.5 rounded-full bg-rose-100 px-1.5 py-0.5 text-[9px] font-bold text-rose-700">
                          <Clock size={8} /> SLA
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        {isOwnerAdmin && isOpenRow(row.status) && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleQuickDecision(row, 'approved')}
                              disabled={saving}
                              className="inline-flex items-center rounded-lg bg-emerald-600 px-2 py-1 text-[10px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                              title={tr('Setujui langsung', 'Quick Approve')}
                            >
                              {tr('Setujui', 'Approve')}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleQuickDecision(row, 'rejected')}
                              disabled={saving}
                              className="inline-flex items-center rounded-lg bg-rose-600 px-2 py-1 text-[10px] font-bold text-white hover:bg-rose-700 disabled:opacity-50"
                              title={tr('Tolak langsung', 'Quick Reject')}
                            >
                              {tr('Tolak', 'Reject')}
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => openDetail(row.id)}
                          className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-700 hover:bg-slate-200"
                          title={tr('Tinjauan 3 Tahap & PDF', '3-Stage Review & PDF')}
                        >
                          <Eye size={11} /> {tr('Buka', 'Open')}
                        </button>
                        {isOwnerAdmin && (
                          <button
                            type="button"
                            onClick={() => handleDelete(row)}
                            disabled={saving}
                            className="inline-flex items-center rounded-lg p-1 text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                            title={tr('Hapus Pengajuan', 'Delete Request')}
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          )}
        </table>
      </div>

      {/* ---------- detail / stage panel ---------- */}
      {openId && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 backdrop-blur-[2px] sm:items-center sm:p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeDetail();
          }}
        >
          <div className="flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-h-[92vh] sm:rounded-3xl">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-5 py-3.5">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-bold text-slate-900">
                  {app?.full_name || tr('Pengajuan cuti', 'Leave application')}
                </h3>
                <p className="truncate text-[11px] text-slate-500">
                  {app?.reference_no || '—'} · {app?.department_label || '—'} · {app?.leave_type_label || '—'}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {isOwnerAdmin && (
                  <button
                    onClick={handlePrint}
                    disabled={!app}
                    className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1.5 text-[10px] font-bold text-white hover:bg-slate-800 disabled:opacity-40"
                  >
                    <Download size={11} /> {tr('Cetak formulir', 'Print form')}
                  </button>
                )}
                <button
                  onClick={closeDetail}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Close"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-5 text-xs">
              {detailLoading || !app ? (
                <p className="py-10 text-center text-slate-400">{tr('Memuat...', 'Loading...')}</p>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold ${
                        STATUS_STYLES[app.status] || STATUS_STYLES.pending
                      }`}
                    >
                      {statusLabel(app.status)}
                    </span>
                    <span className="text-[10px] text-slate-500">
                      {tr('Diajukan', 'Submitted')}: {formatDDMMYY(app.submission_date || app.created_at)}
                    </span>
                    {app.sla_due_at && (
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-semibold ${
                          isOverdue(app) ? 'text-rose-600' : 'text-slate-500'
                        }`}
                      >
                        <Clock size={10} /> SLA {formatDDMMYY(app.sla_due_at)}
                      </span>
                    )}
                  </div>

                  {/* Applicant summary — always read only. */}
                  <section className="rounded-xl border border-slate-200">
                    <header className="border-b border-slate-100 bg-slate-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                      {tr('1. Pemohon', '1. Applicant')}
                    </header>
                    <dl className="divide-y divide-slate-50">
                      {[
                        [tr('Nama', 'Name'), app.full_name || '—'],
                        [tr('Departemen', 'Department'), app.department_label || '—'],
                        [tr('Jenis cuti', 'Leave type'), app.leave_type_label || '—'],
                        ...(app.leave_type_other_note
                          ? [[tr('Keterangan', 'Explanation'), app.leave_type_other_note]]
                          : []),
                        [tr('Dari', 'From'), formatDDMMYY(app.start_date)],
                        [tr('Sampai', 'To'), formatDDMMYY(app.end_date)],
                        [tr('Hari kerja', 'Working days'), String(app.total_days ?? '—')],
                        [tr('Alasan', 'Reason'), app.reason || '—'],
                      ].map(([label, value]) => (
                        <div key={String(label)} className="flex gap-3 px-3 py-1.5">
                          <dt className="w-28 shrink-0 font-medium text-slate-500">{label}</dt>
                          <dd className="min-w-0 flex-1 font-semibold text-slate-800">{value}</dd>
                        </div>
                      ))}
                    </dl>
                    {app.applicant_signature && (
                      <div className="border-t border-slate-100 px-3 py-2">
                        <p className="mb-1 text-[10px] font-medium text-slate-500">
                          {tr('Tanda tangan pemohon', "Applicant's signature")}
                        </p>
                        <img
                          src={app.applicant_signature}
                          alt=""
                          className="max-h-16 rounded border border-slate-200 bg-white object-contain p-0.5"
                        />
                      </div>
                    )}
                  </section>

                  {conflicts.length > 0 && (
                    <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-800">
                      <ShieldAlert size={14} className="mt-0.5 shrink-0" />
                      <div>
                        <p className="font-bold">
                          {tr(
                            `${conflicts.length} rekan di departemen ini sudah memiliki cuti pada tanggal tersebut:`,
                            `${conflicts.length} colleague(s) in this department already have leave on these dates:`
                          )}
                        </p>
                        <ul className="mt-1 space-y-0.5">
                          {conflicts.map((conflict) => (
                            <li key={conflict.id}>
                              {conflict.employee_name} · {formatDDMMYY(conflict.start_date)}–
                              {formatDDMMYY(conflict.end_date)} · {statusLabel(conflict.status)}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}

                  {/* Stage 2 */}
                  <section className="rounded-xl border border-slate-200">
                    <header className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-3 py-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                        {tr('2. Pemeriksaan Administratif', '2. Administrative Check')}
                      </span>
                      {app.admin_checked_at && (
                        <span className="text-[9px] text-emerald-600">
                          <Check size={9} className="mr-0.5 inline" />
                          {formatDDMMYY(app.admin_checked_at)}
                        </span>
                      )}
                    </header>
                    <div className="space-y-2 p-3">
                      <p className="text-[10px] font-medium text-slate-500">
                        {tr(
                          'Centang jika ada bentrok dengan rekan kerja:',
                          'Tick if there is any clash with colleagues:'
                        )}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {(flagsConfig.admin.length > 0 ? flagsConfig.admin : parseList(app.admin_clash_checks)).map(
                          (flag) => {
                            const active = adminFlags.includes(flag);
                            return (
                              <button
                                key={flag}
                                type="button"
                                disabled={!rights?.canAdminCheck}
                                onClick={() =>
                                  rights?.canAdminCheck && toggleFlag(adminFlags, setAdminFlags, flag)
                                }
                                className={`rounded-lg border px-2 py-1 text-[10px] font-semibold transition ${
                                  active
                                    ? 'border-slate-900 bg-slate-900 text-white'
                                    : 'border-slate-200 bg-white text-slate-600'
                                } ${rights?.canAdminCheck ? 'hover:border-slate-400' : 'opacity-60'}`}
                              >
                                {active ? '☑' : '☐'} {flag}
                              </button>
                            );
                          }
                        )}
                      </div>

                      {(adminFlags.includes('Other reason') || app.admin_other_reason) && (
                        <input
                          value={adminOther}
                          onChange={(event) => setAdminOther(event.target.value)}
                          disabled={!rights?.canAdminCheck}
                          placeholder={tr('Keterangan other reason', 'Other reason note')}
                          className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-[11px] disabled:bg-slate-50"
                        />
                      )}

                      {rights?.canAdminCheck && (
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() =>
                            runAction(
                              `/leave/applications/${app.id}/admin-check`,
                              { admin_clash_checks: adminFlags, admin_other_reason: adminOther },
                              tr('Pemeriksaan administratif disimpan.', 'Administrative check saved.')
                            )
                          }
                          className="w-full rounded-lg bg-slate-900 px-3 py-2 text-[11px] font-bold text-white hover:bg-slate-800 disabled:opacity-50"
                        >
                          {tr('Simpan & teruskan ke Department Head', 'Save & send to Department Head')}
                        </button>
                      )}
                    </div>
                  </section>

                  {/* Stage 3 */}
                  <section className="rounded-xl border border-slate-200">
                    <header className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-3 py-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                        {tr('3. Department Head', '3. Department Head')}
                      </span>
                      {app.dept_head_decided_at && (
                        <span className="text-[9px] text-emerald-600">
                          <Check size={9} className="mr-0.5 inline" />
                          {formatDDMMYY(app.dept_head_decided_at)}
                        </span>
                      )}
                    </header>
                    <div className="space-y-2 p-3">
                      <p className="text-[10px] font-medium text-slate-500">
                        {tr('Centang jika ada kendala:', 'Check if there is an issue with:')}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {(flagsConfig.head.length > 0 ? flagsConfig.head : parseList(app.dept_head_issues)).map(
                          (flag) => {
                            const active = headIssues.includes(flag);
                            return (
                              <button
                                key={flag}
                                type="button"
                                disabled={!rights?.canDeptHeadReview}
                                onClick={() =>
                                  rights?.canDeptHeadReview && toggleFlag(headIssues, setHeadIssues, flag)
                                }
                                className={`rounded-lg border px-2 py-1 text-[10px] font-semibold transition ${
                                  active
                                    ? 'border-slate-900 bg-slate-900 text-white'
                                    : 'border-slate-200 bg-white text-slate-600'
                                } ${rights?.canDeptHeadReview ? 'hover:border-slate-400' : 'opacity-60'}`}
                              >
                                {active ? '☑' : '☐'} {flag}
                              </button>
                            );
                          }
                        )}
                      </div>

                      <div className="flex gap-1.5">
                        {['APPROVED', 'NOT_APPROVED'].map((value) => (
                          <button
                            key={value}
                            type="button"
                            disabled={!rights?.canDeptHeadReview}
                            onClick={() => setHeadDecision(value)}
                            className={`flex-1 rounded-lg border px-2 py-1.5 text-[10px] font-bold transition ${
                              headDecision === value
                                ? 'border-slate-900 bg-slate-900 text-white'
                                : 'border-slate-200 bg-white text-slate-600'
                            } disabled:opacity-60`}
                          >
                            {value === 'APPROVED' ? tr('Disetujui', 'Approved') : tr('Tidak disetujui', 'Not approved')}
                          </button>
                        ))}
                      </div>

                      {rights?.canDeptHeadReview && (
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() =>
                            runAction(
                              `/leave/applications/${app.id}/dept-head-review`,
                              { dept_head_issues: headIssues, dept_head_decision: headDecision },
                              tr('Tinjauan Department Head disimpan.', 'Department Head review saved.')
                            )
                          }
                          className="w-full rounded-lg bg-slate-900 px-3 py-2 text-[11px] font-bold text-white hover:bg-slate-800 disabled:opacity-50"
                        >
                          {tr('Simpan & teruskan ke Management', 'Save & send to Management')}
                        </button>
                      )}
                    </div>
                  </section>

                  {/* Stage 4 */}
                  <section className="rounded-xl border border-slate-200">
                    <header className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-3 py-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                        {tr('4. Management', '4. Management')}
                      </span>
                      {app.management_signed_at && (
                        <span className="text-[9px] text-emerald-600">
                          <Check size={9} className="mr-0.5 inline" />
                          {formatDDMMYY(app.management_signed_at)}
                        </span>
                      )}
                    </header>
                    <div className="space-y-2 p-3">
                      <div className="flex gap-1.5">
                        {['APPROVED', 'NOT_APPROVED'].map((value) => (
                          <button
                            key={value}
                            type="button"
                            disabled={!rights?.canManagementDecide}
                            onClick={() => setManagementDecision(value)}
                            className={`flex-1 rounded-lg border px-2 py-1.5 text-[10px] font-bold transition ${
                              managementDecision === value
                                ? 'border-slate-900 bg-slate-900 text-white'
                                : 'border-slate-200 bg-white text-slate-600'
                            } disabled:opacity-60`}
                          >
                            {value === 'APPROVED' ? tr('Disetujui', 'Approved') : tr('Tidak disetujui', 'Not approved')}
                          </button>
                        ))}
                      </div>

                      {app.management_signature ? (
                        <img
                          src={app.management_signature}
                          alt=""
                          className="max-h-16 rounded border border-slate-200 bg-white object-contain p-0.5"
                        />
                      ) : (
                        rights?.canManagementDecide && (
                          <SignaturePad
                            value={managementSignature}
                            onChange={setManagementSignature}
                            label={tr('Tanda tangan Management', 'Management signature')}
                            height={110}
                          />
                        )
                      )}

                      {rights?.canManagementDecide && (
                        <>
                          <input
                            value={note}
                            onChange={(event) => setNote(event.target.value)}
                            placeholder={tr('Catatan (opsional)', 'Note (optional)')}
                            className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-[11px]"
                          />
                          <button
                            type="button"
                            disabled={saving || !managementSignature}
                            onClick={() =>
                              runAction(
                                `/leave/applications/${app.id}/management-decision`,
                                {
                                  management_decision: managementDecision,
                                  management_signature: managementSignature,
                                  note,
                                },
                                tr('Keputusan Management tersimpan.', 'Management decision saved.')
                              )
                            }
                            className="w-full rounded-lg bg-blue-600 px-3 py-2 text-[11px] font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                          >
                            {tr('Simpan keputusan akhir', 'Save final decision')}
                          </button>
                        </>
                      )}
                    </div>
                  </section>

                  {/* Override */}
                  {rights?.canOverride && (
                    <section className="rounded-xl border border-slate-200">
                      <header className="border-b border-slate-100 bg-slate-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                        {tr('Override Management', 'Management Override')}
                      </header>
                      <div className="space-y-2 p-3">
                        <p className="text-[10px] text-slate-500">
                          {tr(
                            'Management dapat membatalkan atau mengesampingkan keputusan departemen.',
                            'Management may cancel or override any departmental decision.'
                          )}
                        </p>
                        {!overrideOpen ? (
                          <button
                            type="button"
                            onClick={() => setOverrideOpen(true)}
                            className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-[10px] font-bold text-rose-700 hover:bg-rose-100"
                          >
                            {tr('Buka override', 'Open override')}
                          </button>
                        ) : (
                          <>
                            <div className="flex gap-1.5">
                              {['cancelled', 'approved', 'rejected'].map((value) => (
                                <button
                                  key={value}
                                  type="button"
                                  onClick={() => setOverrideStatus(value)}
                                  className={`flex-1 rounded-lg border px-2 py-1.5 text-[10px] font-bold transition ${
                                    overrideStatus === value
                                      ? 'border-slate-900 bg-slate-900 text-white'
                                      : 'border-slate-200 bg-white text-slate-600'
                                  }`}
                                >
                                  {value === 'cancelled'
                                    ? tr('Batalkan', 'Cancel')
                                    : value === 'approved'
                                      ? tr('Setujui', 'Approve')
                                      : tr('Tolak', 'Reject')}
                                </button>
                              ))}
                            </div>
                            <input
                              value={overrideReason}
                              onChange={(event) => setOverrideReason(event.target.value)}
                              placeholder={tr('Alasan override (wajib)', 'Override reason (required)')}
                              className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-[11px]"
                            />
                            <div className="flex gap-1.5">
                              <button
                                type="button"
                                onClick={() => setOverrideOpen(false)}
                                className="flex-1 rounded-lg px-3 py-1.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-100"
                              >
                                {tr('Batal', 'Cancel')}
                              </button>
                              <button
                                type="button"
                                disabled={saving || !overrideReason.trim()}
                                onClick={() =>
                                  runAction(
                                    `/leave/applications/${app.id}/override`,
                                    { status: overrideStatus, reason: overrideReason },
                                    tr('Override tersimpan.', 'Override saved.')
                                  )
                                }
                                className="flex-1 rounded-lg bg-rose-600 px-3 py-1.5 text-[10px] font-bold text-white hover:bg-rose-700 disabled:opacity-50"
                              >
                                {tr('Simpan override', 'Save override')}
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </section>
                  )}

                  {/* History */}
                  {(detail.history || []).length > 0 && (
                    <section className="rounded-xl border border-slate-200">
                      <header className="border-b border-slate-100 bg-slate-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                        {tr('Riwayat', 'History')}
                      </header>
                      <ul className="divide-y divide-slate-50">
                        {detail.history.map((entry: any) => (
                          <li key={entry.id} className="flex items-center gap-2 px-3 py-1.5">
                            <span className="font-mono text-[9px] font-bold text-slate-500">{entry.action}</span>
                            <span className="ml-auto text-[9px] text-slate-400">
                              {formatDDMMYY(entry.created_at)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}

                  {app.status === 'approved' && (
                    <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-[11px] font-semibold text-emerald-800">
                      <CheckCircle2 size={14} />
                      {tr('Cuti resmi disetujui.', 'Leave is officially approved.')}
                    </div>
                  )}
                  {['submitted', 'pending', 'pending_administrator', 'pending_dept_head', 'pending_management'].includes(
                    app.status
                  ) && (
                    <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-800">
                      <AlertTriangle size={14} className="shrink-0" />
                      {tr(
                        'Cuti belum resmi disetujui sampai keputusan Management.',
                        'Leave is not officially confirmed until the Management decision.'
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
