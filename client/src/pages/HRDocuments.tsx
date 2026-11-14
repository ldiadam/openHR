import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  PenLine,
  Plus,
  X,
  RefreshCw,
  FileText,
  ExternalLink,
  Download,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Users,
  Send,
  Trash2,
  Upload,
  Check,
  Copy,
  Link2,
} from 'lucide-react';
import { apiFetch, downloadFile } from '../api';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useLockBodyScroll } from '../hooks/useLockBodyScroll';
import { TableSkeleton } from '../components/Skeleton';
import { SigningFieldPlacer, PlacedField } from '../components/SigningFieldPlacer';

const WORKFLOW_OPTIONS = [
  { code: 'offer_letter', id: 'Surat Penawaran Kerja', en: 'Offer Letter' },
  { code: 'nda', id: 'NDA / Hak Kekayaan Intelektual', en: 'NDA / IP' },
  { code: 'handbook_ack', id: 'Peraturan Perusahaan', en: 'Company Handbook' },
  { code: 'policy_ack', id: 'Persetujuan Kebijakan', en: 'Policy Acknowledgement' },
  { code: 'offboarding_clearance', id: 'Exit Clearance & Serah Terima', en: 'Exit Clearance' },
  { code: 'pip_warning', id: 'PIP / Surat Peringatan', en: 'PIP / Warning Letter' },
  { code: 'salary_change', id: 'Perubahan Gaji / Promosi', en: 'Salary Change / Promotion' },
];

const WORKFLOW_LABELS: Record<string, { id: string; en: string }> = Object.fromEntries(
  WORKFLOW_OPTIONS.map((option) => [option.code, { id: option.id, en: option.en }])
);

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700',
  sent: 'bg-blue-100 text-blue-800',
  partially_signed: 'bg-indigo-100 text-indigo-800',
  completed: 'bg-emerald-100 text-emerald-800',
  declined: 'bg-rose-100 text-rose-800',
  expired: 'bg-amber-100 text-amber-800',
  archived: 'bg-slate-100 text-slate-600',
  failed: 'bg-rose-100 text-rose-800',
  superseded: 'bg-slate-200 text-slate-600',
};

const STATUS_LABELS: Record<string, { id: string; en: string }> = {
  draft: { id: 'Draf', en: 'Draft' },
  sent: { id: 'Terkirim', en: 'Sent' },
  partially_signed: { id: 'Sebagian', en: 'Partially signed' },
  completed: { id: 'Selesai', en: 'Completed' },
  declined: { id: 'Ditolak', en: 'Declined' },
  expired: { id: 'Kedaluwarsa', en: 'Expired' },
  archived: { id: 'Diarsipkan', en: 'Archived' },
  failed: { id: 'Gagal', en: 'Failed' },
  superseded: { id: 'Digantikan', en: 'Superseded' },
};

const SIGNER_STATUS_LABELS: Record<string, { id: string; en: string }> = {
  awaiting: { id: 'Menunggu', en: 'Awaiting' },
  sent: { id: 'Terkirim', en: 'Sent' },
  opened: { id: 'Dibuka', en: 'Opened' },
  completed: { id: 'Ditandatangani', en: 'Signed' },
  declined: { id: 'Ditolak', en: 'Declined' },
};

const OPEN_STATUSES = ['draft', 'sent', 'partially_signed', 'failed'];
const CLOSED_STATUSES = ['completed', 'declined', 'expired', 'archived', 'superseded'];

/** Read a File into base64. Chunked so large PDFs cannot blow the call stack. */
async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

export const HRDocuments: React.FC = () => {
  const { isOwnerAdmin, isFinance } = useAuth();
  const { tr, formatDate } = useLanguage();

  const [requests, setRequests] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');

  const [showCreate, setShowCreate] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const [signingFrame, setSigningFrame] = useState<{ url: string; title: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [signerPreview, setSignerPreview] = useState<any>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  // Create-request form
  const [employeeId, setEmployeeId] = useState('');
  const [templateCode, setTemplateCode] = useState('offer_letter');
  const [dueAt, setDueAt] = useState('');
  const [sendEmail, setSendEmail] = useState(true);
  const [prefill, setPrefill] = useState('');

  // Every request carries its own document: upload the PDF for this employee,
  // place the fields, send. There is no reusable template registry.
  const [oneOff, setOneOff] = useState<{ file: File | null; base64: string; name: string; fields: PlacedField[] }>({
    file: null,
    base64: '',
    name: '',
    fields: [],
  });

  useLockBodyScroll(showCreate || Boolean(detail) || Boolean(signingFrame));

  const canCreate = isOwnerAdmin || isFinance;

  const load = async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);

    try {
      const [requestRes, employeeRes] = await Promise.all([
        apiFetch('/hr/signing-requests'),
        apiFetch('/employees'),
      ]);
      setRequests(requestRes.signingRequests || []);
      setEmployees(employeeRes.employees || []);
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const counts = useMemo(
    () => ({
      all: requests.length,
      open: requests.filter((r) => OPEN_STATUSES.includes(r.status)).length,
      completed: requests.filter((r) => r.status === 'completed').length,
      declined: requests.filter((r) => r.status === 'declined').length,
    }),
    [requests]
  );

  const filtered = useMemo(() => {
    if (statusFilter === 'open') return requests.filter((r) => OPEN_STATUSES.includes(r.status));
    if (statusFilter === 'all') return requests;
    return requests.filter((r) => r.status === statusFilter);
  }, [requests, statusFilter]);

  const openDetail = useCallback(async (id: string) => {
    try {
      const res = await apiFetch(`/hr/signing-requests/${id}`);
      setDetail(res);
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    }
  }, []);

  // DocuSeal's webhook is optional here, so pull the live status whenever a
  // request is still open. Without this, signers show 0/3 forever.
  const syncRequest = useCallback(
    async (id: string, silent = true) => {
      if (!silent) setSyncing(true);
      try {
        const res = await apiFetch(`/hr/signing-requests/${id}/sync`, { method: 'POST' });
        if (!silent) {
          setMsg({
            type: 'success',
            text: tr(
              `Status diperbarui: ${res.status} · ${res.signersUpdated} penandatangan · ${res.documentsStored} dokumen tersimpan.`,
              `Status refreshed: ${res.status} · ${res.signersUpdated} signers · ${res.documentsStored} documents stored.`
            ),
          });
        }
        await load(true);
        await openDetail(id);
        return res;
      } catch (err: any) {
        if (!silent) setMsg({ type: 'error', text: err.message });
        return null;
      } finally {
        if (!silent) setSyncing(false);
      }
    },
    [tr]
  );

  // Opening a request refreshes it from DocuSeal first, so the signer list is
  // never stale just because no webhook is configured.
  const openDetailSynced = useCallback(
    async (id: string) => {
      const res = await apiFetch(`/hr/signing-requests/${id}`);
      setDetail(res);
      if (['draft', 'sent', 'partially_signed', 'failed'].includes(res?.signingRequest?.status)) {
        await syncRequest(id, true);
      }
    },
    [syncRequest]
  );

  const closeCreate = useCallback(() => {
    setShowCreate(false);
    setFormError(null);
    setPrefill('');
    setOneOff({ file: null, base64: '', name: '', fields: [] });
  }, []);

  const openCreate = () => {
    setEmployeeId(employees[0]?.id || '');
    setTemplateCode('offer_letter');
    setDueAt(new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10));
    setSendEmail(true);
    setFormError(null);
    setShowCreate(true);
  };

  // Escape closes whichever layer is on top.
  useEffect(() => {
    if (!showCreate && !detail && !signingFrame) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (signingFrame) setSigningFrame(null);
      else if (detail) setDetail(null);
      else closeCreate();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showCreate, detail, signingFrame, closeCreate]);

  // Who will actually sign, resolved from the employee's manager and the
  // company record. Re-fetched whenever the employee or document type changes.
  useEffect(() => {
    if (!showCreate || !employeeId) {
      setSignerPreview(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await apiFetch('/hr/signing-requests/preview-signers', {
          method: 'POST',
          body: JSON.stringify({ employeeId, templateCode }),
        });
        if (!cancelled) setSignerPreview(res);
      } catch {
        if (!cancelled) setSignerPreview(null);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [showCreate, employeeId, templateCode]);

  const documentLabel = (row: any) => {
    if (row.document_name) return row.document_name;
    const fallback = WORKFLOW_LABELS[row.template_code];
    return fallback ? tr(fallback.id, fallback.en) : row.template_code || '-';
  };

  const handleFile = async (file: File | null) => {
    setFormError(null);
    if (!file) {
      setOneOff({ file: null, base64: '', name: '', fields: [] });
      return;
    }
    if (!/\.pdf$/i.test(file.name)) {
      setFormError(tr('Dokumen harus berformat PDF.', 'The document must be a PDF.'));
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setFormError(tr('Ukuran file maksimal 15 MB.', 'Maximum file size is 15 MB.'));
      return;
    }
    try {
      const base64 = await fileToBase64(file);
      setOneOff({ file, base64, name: file.name.replace(/\.pdf$/i, ''), fields: [] });
    } catch {
      setFormError(tr('Gagal membaca file.', 'Failed to read the file.'));
    }
  };

  // A role with no field never becomes a DocuSeal submitter, so the request can
  // never complete. Catch it before sending rather than after.
  const rolesMissingFields = useMemo(() => {
    const placed = new Set(oneOff.fields.map((f) => f.role.toLowerCase()));
    return (signerPreview?.signers || [])
      .filter((s: any) => s.resolved)
      .map((s: any) => String(s.role))
      .filter((role: string) => !placed.has(role.toLowerCase()));
  }, [oneOff.fields, signerPreview]);

  const canSubmit =
    Boolean(employeeId) &&
    Boolean(oneOff.base64) &&
    oneOff.fields.length > 0 &&
    rolesMissingFields.length === 0 &&
    Boolean(signerPreview) &&
    !signerPreview?.problem &&
    !submitting;

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    if (!oneOff.base64) {
      setFormError(tr('Pilih file PDF dokumen.', 'Choose the document PDF file.'));
      return;
    }
    if (oneOff.fields.length === 0) {
      setFormError(
        tr(
          'Tempatkan minimal satu field tanda tangan pada dokumen.',
          'Place at least one signing field on the document.'
        )
      );
      return;
    }
    if (rolesMissingFields.length > 0) {
      setFormError(
        tr(
          `Tempatkan minimal satu field untuk setiap penandatangan. Belum ada field untuk: ${rolesMissingFields.join(
            ', '
          )}.`,
          `Place at least one field for every signer. Missing a field for: ${rolesMissingFields.join(', ')}.`
        )
      );
      return;
    }
    if (signerPreview?.problem) {
      setFormError(signerPreview.problem);
      return;
    }

    setSubmitting(true);

    try {
      let parsedPrefill: Record<string, unknown> | undefined;
      if (prefill.trim()) {
        try {
          parsedPrefill = JSON.parse(prefill);
        } catch {
          throw new Error(tr('Prefill harus berupa JSON yang valid.', 'Prefill must be valid JSON.'));
        }
      }

      const employeeName = employees.find((e) => e.id === employeeId)?.full_name || employeeId;
      const res = await apiFetch('/hr/signing-requests', {
        method: 'POST',
        body: JSON.stringify({
          employeeId,
          document: {
            name: oneOff.name || `${documentLabel({ template_code: templateCode })} - ${employeeName}`,
            code: templateCode,
            pdfBase64: oneOff.base64,
            fields: oneOff.fields,
          },
          dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
          sendEmail,
          prefill: parsedPrefill,
          idempotencyKey: `${templateCode}-${employeeId}-${Date.now()}`,
        }),
      });

      setMsg({
        type: 'success',
        text: sendEmail
          ? tr('Dokumen terkirim dan email tanda tangan dikirim.', 'Document sent and signing emails delivered.')
          : tr(
              'Dokumen terkirim. Bagikan tautan tanda tangan secara manual.',
              'Document sent. Share the signing links manually.'
            ),
      });
      closeCreate();
      await load(true);
      if (res.signingRequestId) openDetailSynced(res.signingRequestId);
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownload = async (document: any) => {
    try {
      await downloadFile(
        `/hr/signing-documents/${document.id}/download`,
        `${document.kind}-${document.signingRequestId || document.signing_request_id}.pdf`
      );
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    }
  };

  const handleDeleteRequest = async (request: any) => {
    if (
      !window.confirm(
        tr(
          `Hapus pengajuan untuk ${request.employee_name || request.employee_id}?`,
          `Delete the request for ${request.employee_name || request.employee_id}?`
        )
      )
    ) {
      return;
    }
    try {
      await apiFetch(`/hr/signing-requests/${request.id}`, { method: 'DELETE' });
      setMsg({ type: 'success', text: tr('Pengajuan dihapus.', 'Request deleted.') });
      setDetail(null);
      await load(true);
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    }
  };

  const handleSupersede = async (request: any) => {
    const reason = window.prompt(tr('Alasan penggantian (wajib):', 'Reason for replacing (required):'));
    if (!reason?.trim()) return;
    try {
      await apiFetch(`/hr/signing-requests/${request.id}/supersede`, {
        method: 'POST',
        body: JSON.stringify({ reason: reason.trim() }),
      });
      setMsg({ type: 'success', text: tr('Pengajuan ditandai digantikan.', 'Request marked superseded.') });
      setDetail(null);
      await load(true);
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    }
  };

  const handleResend = async (request: any) => {
    try {
      const res = await apiFetch(`/hr/signing-requests/${request.id}/resend`, { method: 'POST' });
      setMsg({
        type: 'success',
        text: res.message || tr('Tautan tanda tangan diperbarui.', 'Signing links refreshed.'),
      });
      await load(true);
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    }
  };

  const statusLabel = (status: string) =>
    STATUS_LABELS[status] ? tr(STATUS_LABELS[status].id, STATUS_LABELS[status].en) : status;

  const progressOf = (row: any) => {
    const total = Number(row.signer_total || 0);
    const signed = Number(row.signer_signed || 0);
    return { total, signed, complete: total > 0 && signed >= total };
  };

  const isOverdue = (row: any) =>
    row.due_at && !CLOSED_STATUSES.includes(row.status)
      ? new Date(row.due_at).getTime() < Date.now()
      : false;

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">
            {tr('Dokumen & Tanda Tangan', 'Documents & Signing')}
          </h1>
          <p className="text-xs text-slate-500">
            {tr(
              'Unggah dokumen, tempatkan tanda tangan, lalu kirim untuk ditandatangani.',
              'Upload a document, place the signatures, then send it for signing.'
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
            title={tr('Muat ulang', 'Refresh')}
            aria-label={tr('Muat ulang', 'Refresh')}
          >
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
          </button>
          {canCreate && (
            <button
              onClick={openCreate}
              className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-md transition hover:bg-blue-700"
            >
              <Plus size={16} />
              {tr('Minta Tanda Tangan', 'Request Signature')}
            </button>
          )}
        </div>
      </div>

      {msg && (
        <div
          className={`flex items-center gap-2 rounded-2xl border p-4 text-xs shadow-2xs ${
            msg.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-rose-200 bg-rose-50 text-rose-800'
          }`}
        >
          {msg.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          <span className="flex-1 font-medium">{msg.text}</span>
          <button onClick={() => setMsg(null)} className="font-bold" aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-2xs">
        <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 p-4">
          {[
            { key: 'all', label: tr('Semua', 'All'), count: counts.all },
            { key: 'open', label: tr('Perlu Tindakan', 'Action needed'), count: counts.open },
            { key: 'completed', label: tr('Selesai', 'Completed'), count: counts.completed },
            { key: 'declined', label: tr('Ditolak', 'Declined'), count: counts.declined },
          ].map((filter) => (
            <button
              key={filter.key}
              onClick={() => setStatusFilter(filter.key)}
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[10px] font-bold transition ${
                statusFilter === filter.key ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span>{filter.label}</span>
              <span className={`rounded-full px-1.5 py-0.5 text-[9px] ${statusFilter === filter.key ? 'bg-white/20' : 'bg-white'}`}>
                {filter.count}
              </span>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <TableSkeleton rows={6} columns={6} />
            </table>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-blue-50 text-blue-600">
              <PenLine size={24} />
            </div>
            <p className="mt-3 text-sm font-bold text-slate-900">
              {statusFilter === 'all'
                ? tr('Belum ada pengajuan', 'No signing requests yet')
                : tr('Tidak ada pengajuan di filter ini', 'No requests in this filter')}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {statusFilter === 'all'
                ? tr(
                    'Unggah dokumen pertama untuk mulai meminta tanda tangan.',
                    'Upload your first document to start collecting signatures.'
                  )
                : tr('Coba pilih filter lain.', 'Try a different filter.')}
            </p>
            {canCreate && statusFilter === 'all' && (
              <button
                onClick={openCreate}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-blue-700"
              >
                <Plus size={14} /> {tr('Minta Tanda Tangan', 'Request Signature')}
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-5 py-3 font-bold">{tr('Karyawan', 'Employee')}</th>
                    <th className="px-3 py-3 font-bold">{tr('Dokumen', 'Document')}</th>
                    <th className="px-3 py-3 font-bold">{tr('Penandatangan', 'Signers')}</th>
                    <th className="px-3 py-3 font-bold">{tr('Batas Waktu', 'Due')}</th>
                    <th className="px-3 py-3 text-center font-bold">{tr('Status', 'Status')}</th>
                    <th className="px-5 py-3 text-right font-bold">{tr('Aksi', 'Action')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((row) => {
                    const progress = progressOf(row);
                    return (
                      <tr
                        key={row.id}
                        className="cursor-pointer transition hover:bg-slate-50/80"
                        onClick={() => openDetailSynced(row.id)}
                      >
                        <td className="px-5 py-3">
                          <div className="font-bold text-slate-900">{row.employee_name || row.employee_id}</div>
                          <div className="text-[10px] text-slate-400">{row.employee_nik || ''}</div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                              <FileText size={12} />
                            </span>
                            <span className="font-medium text-slate-800">{documentLabel(row)}</span>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          {progress.total === 0 ? (
                            <span className="text-slate-400">-</span>
                          ) : (
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200">
                                <div
                                  className={`h-full rounded-full ${progress.complete ? 'bg-emerald-500' : 'bg-blue-500'}`}
                                  style={{ width: `${(progress.signed / progress.total) * 100}%` }}
                                />
                              </div>
                              <span className="whitespace-nowrap text-[10px] font-bold text-slate-600">
                                {progress.signed}/{progress.total}
                              </span>
                            </div>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3">
                          {row.due_at ? (
                            <span className={isOverdue(row) ? 'font-bold text-rose-600' : 'text-slate-600'}>
                              {formatDate(row.due_at)}
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold ${
                              STATUS_STYLES[row.status] || STATUS_STYLES.draft
                            }`}
                          >
                            {statusLabel(row.status)}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <button
                            className="rounded-lg px-2.5 py-1 text-[10px] font-bold text-blue-600 hover:bg-blue-50"
                            onClick={(e) => {
                              e.stopPropagation();
                              openDetailSynced(row.id);
                            }}
                          >
                            {tr('Detail', 'Detail')}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-slate-100 md:hidden">
              {filtered.map((row) => {
                const progress = progressOf(row);
                return (
                  <div key={row.id} className="space-y-2 p-4 active:bg-slate-50" onClick={() => openDetailSynced(row.id)}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-bold text-slate-900">
                          {row.employee_name || row.employee_id}
                        </div>
                        <div className="truncate text-[11px] text-slate-500">{documentLabel(row)}</div>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${
                          STATUS_STYLES[row.status] || STATUS_STYLES.draft
                        }`}
                      >
                        {statusLabel(row.status)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-slate-400">
                      {progress.total > 0 && (
                        <span className="font-bold text-slate-600">
                          {progress.signed}/{progress.total} {tr('tanda tangan', 'signed')}
                        </span>
                      )}
                      {row.due_at && (
                        <span
                          className={`inline-flex items-center gap-1 ${isOverdue(row) ? 'font-bold text-rose-600' : ''}`}
                        >
                          <Clock size={11} /> {formatDate(row.due_at)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* CREATE REQUEST MODAL — two panes: metadata on the left, the document
          and field placer on the right. The placer needs real width, so this
          dialog is deliberately wide and becomes a bottom sheet on phones. */}
      {showCreate && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/50 backdrop-blur-[2px] sm:items-center sm:p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeCreate();
          }}
        >
          <div
            className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-h-[92vh] sm:rounded-3xl"
            role="dialog"
            aria-modal="true"
            aria-label={tr('Minta Tanda Tangan', 'Request Signature')}
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                  <PenLine size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">{tr('Minta Tanda Tangan', 'Request Signature')}</h3>
                  <p className="text-[11px] text-slate-500">
                    {tr(
                      'Pilih penerima, unggah dokumen, lalu letakkan tanda tangan.',
                      'Pick the recipient, upload the document, then place the signatures.'
                    )}
                  </p>
                </div>
              </div>
              <button
                onClick={closeCreate}
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreate} className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                <div className="grid gap-5 p-5 md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
                  {/* LEFT — metadata */}
                  <div className="space-y-4 text-xs">
                    <div>
                      <label className="mb-1 block font-semibold text-slate-700">
                        {tr('Karyawan', 'Employee')} <span className="text-rose-500">*</span>
                      </label>
                      <select
                        required
                        value={employeeId}
                        onChange={(e) => setEmployeeId(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 p-2.5 font-medium focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
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
                      <label className="mb-1 block font-semibold text-slate-700">
                        {tr('Jenis Dokumen', 'Document Type')} <span className="text-rose-500">*</span>
                      </label>
                      <select
                        value={templateCode}
                        onChange={(e) => setTemplateCode(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 p-2.5 font-medium focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                      >
                        {WORKFLOW_OPTIONS.map((option) => (
                          <option key={option.code} value={option.code}>
                            {tr(option.id, option.en)}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
                        {tr(
                          'Jenis dokumen menentukan siapa saja yang harus menandatangani.',
                          'The document type determines who has to sign.'
                        )}
                      </p>
                    </div>

                    {/* Signers — the question that caused the most confusion. */}
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                        <Users size={12} /> {tr('Penandatangan', 'Signers')}
                      </div>

                      {!employeeId ? (
                        <p className="text-[11px] text-slate-400">
                          {tr('Pilih karyawan untuk melihat penandatangan.', 'Select an employee to see the signers.')}
                        </p>
                      ) : !signerPreview ? (
                        <p className="text-[11px] text-slate-400">{tr('Memuat...', 'Loading...')}</p>
                      ) : (
                        <div className="space-y-2">
                          {(signerPreview.signers || []).map((signer: any) => (
                            <div key={signer.role} className="flex items-start gap-2">
                              <span
                                className={`mt-0.5 inline-flex w-16 shrink-0 justify-center rounded px-1.5 py-0.5 text-[9px] font-bold ${
                                  signer.resolved
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : signer.required
                                      ? 'bg-rose-100 text-rose-700'
                                      : 'bg-slate-200 text-slate-500'
                                }`}
                              >
                                {signer.role}
                              </span>
                              <div className="min-w-0 flex-1">
                                {signer.resolved ? (
                                  <>
                                    <div className="truncate text-[11px] font-semibold text-slate-800">{signer.name}</div>
                                    <div className="truncate text-[10px] text-slate-500">{signer.email}</div>
                                  </>
                                ) : (
                                  <div className="text-[10px] leading-relaxed text-slate-500">
                                    {signer.required
                                      ? tr('Wajib, tetapi belum bisa ditentukan', 'Required, but cannot be determined')
                                      : tr('Opsional, akan dilewati', 'Optional, will be skipped')}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                          {signerPreview.problem && (
                            <p className="flex items-start gap-1.5 border-t border-slate-200 pt-2 text-[10px] font-medium leading-relaxed text-rose-600">
                              <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                              {signerPreview.problem}
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="mb-1 block font-semibold text-slate-700">{tr('Batas Waktu', 'Due Date')}</label>
                      <input
                        type="date"
                        value={dueAt}
                        onChange={(e) => setDueAt(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 p-2.5 font-medium focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                      />
                    </div>

                    <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-slate-200 p-2.5">
                      <input
                        type="checkbox"
                        checked={sendEmail}
                        onChange={(e) => setSendEmail(e.target.checked)}
                        className="mt-0.5"
                      />
                      <span>
                        <span className="block font-semibold text-slate-700">
                          {tr('Kirim email tanda tangan', 'Send signing emails')}
                        </span>
                        <span className="block text-[10px] text-slate-500">
                          {tr(
                            'Penandatangan menerima tautan langsung dari DocuSeal.',
                            'Signers receive the link directly from DocuSeal.'
                          )}
                        </span>
                      </span>
                    </label>

                    <details className="rounded-xl border border-slate-200 p-2.5">
                      <summary className="cursor-pointer text-[11px] font-semibold text-slate-600">
                        {tr('Isian otomatis (opsional)', 'Prefill values (optional)')}
                      </summary>
                      <textarea
                        rows={3}
                        value={prefill}
                        onChange={(e) => setPrefill(e.target.value)}
                        placeholder='{"Position":"Engineer","Start Date":"2026-12-01"}'
                        className="mt-2 w-full rounded-lg border border-slate-300 p-2 font-mono text-[10px]"
                      />
                      <p className="mt-1 text-[10px] text-slate-500">
                        {tr(
                          'Pasangan nama field dan nilai dalam format JSON.',
                          'Field name and value pairs in JSON format.'
                        )}
                      </p>
                    </details>
                  </div>

                  {/* RIGHT — document and placement */}
                  <div className="min-w-0 space-y-3">
                    {!oneOff.file ? (
                      <label
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => {
                          event.preventDefault();
                          handleFile(event.dataTransfer.files?.[0] || null);
                        }}
                        className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center transition hover:border-blue-400 hover:bg-blue-50/40"
                      >
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-blue-600 shadow-sm">
                          <Upload size={20} />
                        </div>
                        <span className="mt-3 text-sm font-bold text-slate-800">
                          {tr('Unggah dokumen PDF', 'Upload a PDF document')}
                        </span>
                        <span className="mt-1 text-[11px] text-slate-500">
                          {tr(
                            'Tarik file ke sini atau klik untuk memilih. Maks. 15 MB.',
                            'Drag a file here or click to choose. Max 15 MB.'
                          )}
                        </span>
                        <input
                          type="file"
                          accept=".pdf"
                          className="hidden"
                          onChange={(event) => handleFile(event.target.files?.[0] || null)}
                        />
                      </label>
                    ) : (
                      <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-rose-600 shadow-sm">
                          <FileText size={16} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-bold text-slate-900">{oneOff.file.name}</div>
                          <div className="text-[10px] text-slate-500">{formatBytes(oneOff.file.size)}</div>
                        </div>
                        <label className="cursor-pointer rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[10px] font-bold text-slate-700 hover:bg-slate-100">
                          {tr('Ganti', 'Change')}
                          <input
                            type="file"
                            accept=".pdf"
                            className="hidden"
                            onChange={(event) => handleFile(event.target.files?.[0] || null)}
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => handleFile(null)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                          aria-label={tr('Hapus file', 'Remove file')}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}

                    {oneOff.file && (
                      <div>
                        <div className="mb-2 flex items-center justify-between">
                          <label className="text-xs font-semibold text-slate-700">
                            {tr('Penempatan Tanda Tangan', 'Signature Placement')}{' '}
                            <span className="text-rose-500">*</span>
                          </label>
                          <span className="text-[10px] text-slate-400">
                            {oneOff.fields.length} {tr('field', 'fields')}
                          </span>
                        </div>
                        <SigningFieldPlacer
                          file={oneOff.file}
                          fields={oneOff.fields}
                          onChange={(fields) => setOneOff({ ...oneOff, fields })}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Footer — readiness checklist plus the primary action. */}
              <div className="shrink-0 border-t border-slate-200 bg-white px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 sm:pb-3">
                {formError && (
                  <div className="mb-2 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-[11px] font-medium text-rose-800">
                    <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                    <span className="flex-1">{formError}</span>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-3 text-[10px]">
                    {[
                      { done: Boolean(oneOff.base64), label: tr('Dokumen PDF', 'PDF document') },
                      { done: oneOff.fields.length > 0, label: tr('Field tanda tangan', 'Signing fields') },
                      {
                        done: oneOff.fields.length > 0 && rolesMissingFields.length === 0,
                        label: tr('Field tiap penandatangan', 'Field per signer'),
                      },
                      {
                        done: Boolean(signerPreview) && !signerPreview?.problem,
                        label: tr('Penandatangan lengkap', 'Signers resolved'),
                      },
                    ].map((item) => (
                      <span
                        key={item.label}
                        className={`inline-flex items-center gap-1 font-semibold ${
                          item.done ? 'text-emerald-600' : 'text-slate-400'
                        }`}
                      >
                        {item.done ? (
                          <Check size={11} />
                        ) : (
                          <span className="h-2.5 w-2.5 rounded-full border border-current" />
                        )}
                        {item.label}
                      </span>
                    ))}
                  </div>

                  <div className="ml-auto flex items-center gap-2">
                    <button
                      type="button"
                      onClick={closeCreate}
                      className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
                    >
                      {tr('Batal', 'Cancel')}
                    </button>
                    <button
                      type="submit"
                      disabled={!canSubmit}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white shadow-md transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
                    >
                      <Send size={13} />
                      {submitting ? tr('Mengirim...', 'Sending...') : tr('Kirim', 'Send')}
                    </button>
                  </div>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DETAIL MODAL */}
      {detail && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/50 backdrop-blur-[2px] sm:items-center sm:p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) setDetail(null);
          }}
        >
          <div
            className="flex max-h-[94vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-h-[92vh] sm:rounded-3xl"
            role="dialog"
            aria-modal="true"
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 p-5">
              <div className="min-w-0">
                <h3 className="truncate text-base font-bold text-slate-900">
                  {documentLabel(detail.signingRequest)}
                </h3>
                <p className="truncate text-[11px] text-slate-500">
                  {detail.signingRequest.employee?.full_name || detail.signingRequest.employee_id}
                </p>
              </div>
              <button
                onClick={() => setDetail(null)}
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold ${
                    STATUS_STYLES[detail.signingRequest.status] || STATUS_STYLES.draft
                  }`}
                >
                  {statusLabel(detail.signingRequest.status)}
                </span>
                {detail.signingRequest.due_at && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-slate-500">
                    <Clock size={11} /> {tr('Batas', 'Due')} {formatDate(detail.signingRequest.due_at)}
                  </span>
                )}
              </div>

              <div>
                <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  <Users size={12} /> {tr('Penandatangan', 'Signers')}
                </div>
                <div className="space-y-2">
                  {(detail.signers || []).map((signer: any) => (
                    <div key={signer.id} className="rounded-xl border border-slate-200 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-xs font-bold text-slate-900">
                            {signer.name} <span className="font-normal text-slate-400">({signer.role})</span>
                          </div>
                          <div className="truncate text-[10px] text-slate-500">{signer.email}</div>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            signer.status === 'completed'
                              ? 'bg-emerald-100 text-emerald-700'
                              : signer.status === 'declined'
                                ? 'bg-rose-100 text-rose-700'
                                : signer.status === 'opened'
                                  ? 'bg-indigo-100 text-indigo-700'
                                  : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {SIGNER_STATUS_LABELS[signer.status]
                            ? tr(SIGNER_STATUS_LABELS[signer.status].id, SIGNER_STATUS_LABELS[signer.status].en)
                            : signer.status}
                        </span>
                      </div>
                      {signer.signing_url && signer.status !== 'completed' && (
                        <button
                          onClick={() =>
                            setSigningFrame({
                              url: signer.signing_url,
                              title: `${signer.name} · ${signer.role}`,
                            })
                          }
                          className="mt-2 inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-700 transition hover:bg-blue-100"
                        >
                          <Link2 size={11} /> {tr('Tautan tanda tangan', 'Signing link')}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  <FileText size={12} /> {tr('Dokumen Tersimpan', 'Stored Documents')}
                </div>
                {(detail.documents || []).length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-200 p-3 text-[11px] leading-relaxed text-slate-400">
                    {tr(
                      'Dokumen tersedia setelah semua pihak menandatangani.',
                      'Documents become available once everyone signs.'
                    )}
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {detail.documents.map((doc: any) => (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-[11px] font-bold text-slate-800">{doc.kind}</div>
                          <div className="truncate font-mono text-[9px] text-slate-400">
                            {doc.byteSize ? formatBytes(doc.byteSize) : ''}
                            {doc.sha256 ? ` · ${doc.sha256.slice(0, 12)}…` : ''}
                          </div>
                        </div>
                        <button
                          onClick={() => handleDownload({ ...doc, signingRequestId: detail.signingRequest.id })}
                          className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700 transition hover:bg-emerald-100"
                        >
                          <Download size={11} /> {tr('Unduh', 'Download')}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {detail.signingRequest.last_error && (
                <p className="rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-[10px] font-medium text-rose-700">
                  {detail.signingRequest.last_error}
                </p>
              )}
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 sm:pb-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {detail.signingRequest.docuseal_submission_id && (
                  <button
                    onClick={() => syncRequest(detail.signingRequest.id, false)}
                    disabled={syncing}
                    className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-1.5 text-[11px] font-bold text-blue-700 transition hover:bg-blue-100 disabled:opacity-60"
                    title={tr('Ambil status terbaru dari DocuSeal', 'Pull the latest status from DocuSeal')}
                  >
                    <RefreshCw size={11} className={syncing ? 'animate-spin' : ''} />
                    {syncing ? tr('Menyinkron...', 'Syncing...') : tr('Sinkronkan', 'Sync')}
                  </button>
                )}
                {OPEN_STATUSES.includes(detail.signingRequest.status) && (
                  <button
                    onClick={() => handleResend(detail.signingRequest)}
                    className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 transition hover:bg-slate-200"
                  >
                    {tr('Kirim Ulang', 'Resend')}
                  </button>
                )}
                {OPEN_STATUSES.includes(detail.signingRequest.status) && (
                  <button
                    onClick={() => handleSupersede(detail.signingRequest)}
                    className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] font-bold text-amber-700 transition hover:bg-amber-100"
                  >
                    {tr('Gantikan', 'Supersede')}
                  </button>
                )}
                {detail.signingRequest.status !== 'completed' &&
                  detail.signingRequest.status !== 'partially_signed' && (
                    <button
                      onClick={() => handleDeleteRequest(detail.signingRequest)}
                      className="inline-flex items-center gap-1 rounded-lg bg-rose-50 px-2.5 py-1.5 text-[11px] font-bold text-rose-700 transition hover:bg-rose-100"
                      title={tr(
                        'Hanya untuk pengajuan yang belum ditandatangani',
                        'Only for requests that have not been signed'
                      )}
                    >
                      <Trash2 size={11} /> {tr('Hapus', 'Delete')}
                    </button>
                  )}
              </div>
              <button
                onClick={() => setDetail(null)}
                className="rounded-xl bg-slate-900 px-5 py-2 text-xs font-bold text-white transition hover:bg-slate-800"
              >
                {tr('Tutup', 'Close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SIGNING LINK — DocuSeal refuses framing (x-frame-options: SAMEORIGIN),
          so we hand the signer a real link instead of embedding an iframe. */}
      {signingFrame && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-900/50 backdrop-blur-[2px] sm:items-center sm:p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) setSigningFrame(null);
          }}
        >
          <div
            className="w-full max-w-md space-y-4 rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl"
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                  <ExternalLink size={18} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-slate-900">{tr('Tautan Tanda Tangan', 'Signing Link')}</h3>
                  <p className="truncate text-[11px] text-slate-500">{signingFrame.title}</p>
                </div>
              </div>
              <button
                onClick={() => setSigningFrame(null)}
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-800">
              {tr(
                'DocuSeal tidak dapat ditampilkan di dalam halaman ini, jadi tautan dibuka di tab baru. Kirim tautan ini ke penandatangan, atau buka sendiri.',
                'DocuSeal cannot be embedded in this page, so the link opens in a new tab. Send it to the signer, or open it yourself.'
              )}
            </p>

            <div className="break-all rounded-xl border border-slate-200 bg-slate-50 p-2.5 font-mono text-[10px] text-slate-600">
              {signingFrame.url}
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(signingFrame.url);
                    setMsg({ type: 'success', text: tr('Tautan disalin.', 'Link copied.') });
                  } catch {
                    setMsg({ type: 'error', text: tr('Gagal menyalin tautan.', 'Could not copy the link.') });
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                <Copy size={12} /> {tr('Salin tautan', 'Copy link')}
              </button>
              <a
                href={signingFrame.url}
                target="_blank"
                rel="noreferrer noopener"
                onClick={() => setSigningFrame(null)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white shadow-md transition hover:bg-blue-700"
              >
                <ExternalLink size={12} /> {tr('Buka di tab baru', 'Open in new tab')}
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
