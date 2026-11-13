import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Upload,
  Users,
  Send,
} from 'lucide-react';
import { apiFetch, downloadFile } from '../api';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { TableSkeleton } from '../components/Skeleton';

const WORKFLOW_OPTIONS = [
  { code: 'offer_letter', label: 'Offer Letter' },
  { code: 'nda', label: 'NDA / IP' },
  { code: 'handbook_ack', label: 'Buku Panduan' },
  { code: 'policy_ack', label: 'Kebijakan' },
  { code: 'offboarding_clearance', label: 'Exit Clearance' },
  { code: 'pip_warning', label: 'PIP / Surat Peringatan' },
  { code: 'salary_change', label: 'Perubahan Gaji / Promosi' },
];

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

export const HRDocuments: React.FC = () => {
  const { isOwnerAdmin, isFinance } = useAuth();
  const { tr, formatDate } = useLanguage();

  const [requests, setRequests] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');

  const [showCreate, setShowCreate] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const [signingFrame, setSigningFrame] = useState<{ url: string; title: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Create-request form
  const [employeeId, setEmployeeId] = useState('');
  const [templateCode, setTemplateCode] = useState('offer_letter');
  const [dueAt, setDueAt] = useState('');
  const [sendEmail, setSendEmail] = useState(false);
  const [prefill, setPrefill] = useState('');

  // Template upload form
  const [templateForm, setTemplateForm] = useState({ code: 'offer_letter', name: '', version: '' });
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canManageTemplates = isOwnerAdmin;
  const canCreate = isOwnerAdmin || isFinance;

  const load = async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);

    try {
      const [requestRes, templateRes, employeeRes] = await Promise.all([
        apiFetch('/hr/signing-requests'),
        apiFetch('/hr/document-templates'),
        apiFetch('/employees'),
      ]);
      setRequests(requestRes.signingRequests || []);
      setTemplates(templateRes.templates || []);
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

  const templateOptions = useMemo(
    () => templates.filter((tpl) => tpl.active === 1),
    [templates]
  );

  const filtered = requests.filter((row) => statusFilter === 'all' || row.status === statusFilter);

  const counts = useMemo(
    () => ({
      all: requests.length,
      sent: requests.filter((r) => r.status === 'sent').length,
      completed: requests.filter((r) => r.status === 'completed').length,
      declined: requests.filter((r) => r.status === 'declined').length,
    }),
    [requests]
  );

  const openDetail = useCallback(async (id: string) => {
    try {
      const res = await apiFetch(`/hr/signing-requests/${id}`);
      setDetail(res);
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    }
  }, []);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setMsg(null);

    try {
      let parsedPrefill: Record<string, unknown> | undefined;
      if (prefill.trim()) {
        try {
          parsedPrefill = JSON.parse(prefill);
        } catch {
          throw new Error(tr('Prefill harus berupa JSON yang valid.', 'Prefill must be valid JSON.'));
        }
      }

      const res = await apiFetch('/hr/signing-requests', {
        method: 'POST',
        body: JSON.stringify({
          employeeId,
          templateCode,
          dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
          sendEmail,
          prefill: parsedPrefill,
          idempotencyKey: `${templateCode}-${employeeId}-${Date.now()}`,
        }),
      });

      setMsg({ type: 'success', text: tr('Pengajuan tanda tangan berhasil dibuat.', 'Signing request created.') });
      setShowCreate(false);
      setPrefill('');
      await load(true);
      if (res.signingRequestId) openDetail(res.signingRequestId);
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleTemplateUpload = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!templateFile) {
      setMsg({ type: 'error', text: tr('Pilih file PDF atau DOCX.', 'Choose a PDF or DOCX file.') });
      return;
    }

    setSubmitting(true);
    try {
      const form = new FormData();
      form.append('file', templateFile);
      form.append('code', templateForm.code);
      form.append('name', templateForm.name || templateForm.code);
      if (templateForm.version) form.append('version', templateForm.version);

      await apiFetch('/hr/document-templates', { method: 'POST', body: form });
      setMsg({ type: 'success', text: tr('Template berhasil didaftarkan.', 'Template registered.') });
      setShowTemplateModal(false);
      setTemplateFile(null);
      setTemplateForm({ code: 'offer_letter', name: '', version: '' });
      await load(true);
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
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

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">
            {tr('Dokumen & Tanda Tangan', 'Documents & Signing')}
          </h1>
          <p className="text-xs text-slate-500">
            {tr(
              'Kelola template dokumen HR dan kirim permintaan tanda tangan elektronik.',
              'Manage HR document templates and send electronic signing requests.'
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
            title={tr('Muat ulang', 'Refresh')}
          >
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
          </button>
          {canManageTemplates && (
            <button
              onClick={() => setShowTemplateModal(true)}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
            >
              <Upload size={15} />
              {tr('Template Baru', 'New Template')}
            </button>
          )}
          {canCreate && (
            <button
              onClick={() => {
                setEmployeeId(employees[0]?.id || '');
                setShowCreate(true);
              }}
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
          <button onClick={() => setMsg(null)} className="font-bold">✕</button>
        </div>
      )}

      <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-2xs">
        <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 p-4">
          {[
            { key: 'all', label: tr('Semua', 'All'), count: counts.all },
            { key: 'sent', label: tr('Terkirim', 'Sent'), count: counts.sent },
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
            <p className="mt-3 text-sm font-bold text-slate-900">{tr('Belum ada pengajuan', 'No signing requests yet')}</p>
            <p className="mt-1 text-xs text-slate-500">
              {tr(
                'Daftarkan template lalu buat permintaan tanda tangan pertama.',
                'Register a template, then create your first signing request.'
              )}
            </p>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-5 py-3 font-bold">{tr('Karyawan', 'Employee')}</th>
                    <th className="px-3 py-3 font-bold">{tr('Dokumen', 'Document')}</th>
                    <th className="px-3 py-3 text-center font-bold">{tr('Versi', 'Version')}</th>
                    <th className="px-3 py-3 font-bold">{tr('Batas Waktu', 'Due')}</th>
                    <th className="px-3 py-3 text-center font-bold">{tr('Status', 'Status')}</th>
                    <th className="px-5 py-3 text-right font-bold">{tr('Aksi', 'Action')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((row) => (
                    <tr key={row.id} className="cursor-pointer transition hover:bg-slate-50/80" onClick={() => openDetail(row.id)}>
                      <td className="px-5 py-3">
                        <div className="font-bold text-slate-900">{row.employee_name || row.employee_id}</div>
                        <div className="text-[10px] text-slate-400">{row.employee_nik || ''}</div>
                      </td>
                      <td className="px-3 py-3 font-medium text-slate-700">{row.template_code}</td>
                      <td className="px-3 py-3 text-center text-slate-600">v{row.template_version}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-slate-600">
                        {row.due_at ? formatDate(row.due_at) : '-'}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold ${STATUS_STYLES[row.status] || STATUS_STYLES.draft}`}>
                          {STATUS_LABELS[row.status] ? tr(STATUS_LABELS[row.status].id, STATUS_LABELS[row.status].en) : row.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          className="rounded-lg px-2.5 py-1 text-[10px] font-bold text-blue-600 hover:bg-blue-50"
                          onClick={(e) => {
                            e.stopPropagation();
                            openDetail(row.id);
                          }}
                        >
                          {tr('Detail', 'Detail')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-slate-100 md:hidden">
              {filtered.map((row) => (
                <div key={row.id} className="space-y-2 p-4" onClick={() => openDetail(row.id)}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold text-slate-900">{row.employee_name || row.employee_id}</div>
                      <div className="text-[11px] text-slate-500">
                        {row.template_code} · v{row.template_version}
                      </div>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${STATUS_STYLES[row.status] || STATUS_STYLES.draft}`}>
                      {STATUS_LABELS[row.status] ? tr(STATUS_LABELS[row.status].id, STATUS_LABELS[row.status].en) : row.status}
                    </span>
                  </div>
                  {row.due_at && (
                    <div className="flex items-center gap-1 text-[10px] text-slate-400">
                      <Clock size={11} /> {tr('Batas', 'Due')} {formatDate(row.due_at)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* CREATE REQUEST MODAL */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) setShowCreate(false);
          }}
        >
          <div className="max-h-[90vh] w-full max-w-md space-y-4 overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                <PenLine size={18} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">{tr('Minta Tanda Tangan', 'Request Signature')}</h3>
                <p className="text-[11px] text-slate-500">
                  {tr('Penandatangan mengikuti alur dokumen yang dipilih.', 'Signers follow the selected document workflow.')}
                </p>
              </div>
            </div>

            <form onSubmit={handleCreate} className="space-y-3 text-xs">
              <div>
                <label className="mb-1 block font-medium text-slate-700">{tr('Karyawan *', 'Employee *')}</label>
                <select
                  required
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 p-2.5"
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
                <label className="mb-1 block font-medium text-slate-700">{tr('Jenis Dokumen *', 'Document Type *')}</label>
                <select
                  value={templateCode}
                  onChange={(e) => setTemplateCode(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 p-2.5"
                >
                  {WORKFLOW_OPTIONS.map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.label}
                      {templateOptions.some((t) => t.code === option.code) ? '' : ' — belum ada template'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block font-medium text-slate-700">{tr('Batas Waktu', 'Due Date')}</label>
                <input
                  type="date"
                  value={dueAt}
                  onChange={(e) => setDueAt(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 p-2.5"
                />
              </div>

              <div>
                <label className="mb-1 block font-medium text-slate-700">
                  {tr('Prefill (JSON, opsional)', 'Prefill (JSON, optional)')}
                </label>
                <textarea
                  rows={3}
                  value={prefill}
                  onChange={(e) => setPrefill(e.target.value)}
                  placeholder='{"Position":"Engineer","Start Date":"2026-12-01"}'
                  className="w-full rounded-xl border border-slate-300 p-2 font-mono text-[11px]"
                />
              </div>

              <label className="flex items-center gap-2 font-medium text-slate-700">
                <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />
                {tr('Kirim email tanda tangan dari DocuSeal', 'Send signing email from DocuSeal')}
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="rounded-xl px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100">
                  {tr('Batal', 'Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-xl bg-blue-600 px-5 py-2.5 font-bold text-white shadow-md transition hover:bg-blue-700 disabled:opacity-50"
                >
                  {submitting ? tr('Memproses...', 'Processing...') : tr('Kirim', 'Send')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TEMPLATE UPLOAD MODAL */}
      {showTemplateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) setShowTemplateModal(false);
          }}
        >
          <div className="max-h-[90vh] w-full max-w-md space-y-4 overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                <Upload size={18} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">{tr('Template Dokumen Baru', 'New Document Template')}</h3>
                <p className="text-[11px] text-slate-500">
                  {tr('Unggah PDF atau DOCX. Versi baru dibuat otomatis.', 'Upload PDF or DOCX. A new version is created automatically.')}
                </p>
              </div>
            </div>

            <form onSubmit={handleTemplateUpload} className="space-y-3 text-xs">
              <div>
                <label className="mb-1 block font-medium text-slate-700">{tr('Kode *', 'Code *')}</label>
                <select
                  value={templateForm.code}
                  onChange={(e) => setTemplateForm({ ...templateForm, code: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 p-2.5"
                >
                  {WORKFLOW_OPTIONS.map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.code}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block font-medium text-slate-700">{tr('Nama *', 'Name *')}</label>
                <input
                  required
                  value={templateForm.name}
                  onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 p-2.5"
                />
              </div>

              <div>
                <label className="mb-1 block font-medium text-slate-700">{tr('Versi (opsional)', 'Version (optional)')}</label>
                <input
                  type="number"
                  min={1}
                  value={templateForm.version}
                  onChange={(e) => setTemplateForm({ ...templateForm, version: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 p-2.5"
                />
              </div>

              <div>
                <label className="mb-1 block font-medium text-slate-700">{tr('File PDF / DOCX *', 'PDF / DOCX File *')}</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx"
                  onChange={(e) => setTemplateFile(e.target.files?.[0] || null)}
                  className="w-full rounded-xl border border-slate-300 p-2.5"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowTemplateModal(false)} className="rounded-xl px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100">
                  {tr('Batal', 'Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-xl bg-slate-900 px-5 py-2.5 font-bold text-white shadow-md transition hover:bg-slate-800 disabled:opacity-50"
                >
                  {submitting ? tr('Mengunggah...', 'Uploading...') : tr('Daftarkan', 'Register')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DETAIL MODAL */}
      {detail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) setDetail(null);
          }}
        >
          <div className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {detail.signingRequest.employee?.full_name || detail.signingRequest.employee_id}
                </h3>
                <p className="text-[11px] text-slate-500">
                  {detail.signingRequest.template_code} · v{detail.signingRequest.template_version} ·{' '}
                  {STATUS_LABELS[detail.signingRequest.status]
                    ? tr(STATUS_LABELS[detail.signingRequest.status].id, STATUS_LABELS[detail.signingRequest.status].en)
                    : detail.signingRequest.status}
                </p>
              </div>
              <button onClick={() => setDetail(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
                <X size={18} />
              </button>
            </div>

            <div>
              <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                <Users size={12} /> {tr('Penandatangan', 'Signers')}
              </div>
              <div className="space-y-2">
                {(detail.signers || []).map((signer: any) => (
                  <div key={signer.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 p-3">
                    <div className="min-w-0">
                      <div className="truncate text-xs font-bold text-slate-900">
                        {signer.name} <span className="font-normal text-slate-400">({signer.role})</span>
                      </div>
                      <div className="truncate text-[10px] text-slate-500">{signer.email}</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                        {signer.status}
                      </span>
                      {signer.signing_url && signer.status !== 'completed' && (
                        <button
                          onClick={() => setSigningFrame({ url: signer.signing_url, title: `${signer.name} - ${detail.signingRequest.template_code}` })}
                          className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-700 hover:bg-blue-100"
                        >
                          <ExternalLink size={11} /> {tr('Tanda tangan', 'Sign')}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                <FileText size={12} /> {tr('Dokumen Tersimpan', 'Stored Documents')}
              </div>
              {(detail.documents || []).length === 0 ? (
                <p className="text-[11px] text-slate-400">
                  {tr('Dokumen tersedia setelah semua pihak menandatangani.', 'Documents become available once everyone signs.')}
                </p>
              ) : (
                <div className="space-y-1.5">
                  {detail.documents.map((doc: any) => (
                    <div key={doc.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2">
                      <div className="min-w-0">
                        <div className="truncate text-[11px] font-bold text-slate-800">{doc.kind}</div>
                        <div className="truncate font-mono text-[9px] text-slate-400">
                          {doc.byteSize ? `${Math.round(doc.byteSize / 1024)} KB` : ''} {doc.sha256 ? `· ${doc.sha256.slice(0, 12)}…` : ''}
                        </div>
                      </div>
                      <button
                        onClick={() => handleDownload({ ...doc, signingRequestId: detail.signingRequest.id })}
                        className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700 hover:bg-emerald-100"
                      >
                        <Download size={11} /> {tr('Unduh', 'Download')}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-1">
              <button onClick={() => setDetail(null)} className="rounded-xl bg-slate-900 px-5 py-2 text-xs font-bold text-white hover:bg-slate-800">
                {tr('Tutup', 'Close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* IN-APP SIGNING IFRAME (uses DocuSeal embed_src) */}
      {signingFrame && (
        <div className="fixed inset-0 z-60 flex flex-col bg-slate-900/80 p-2 md:p-6">
          <div className="mx-auto flex h-full w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-2.5">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                <Send size={14} className="text-blue-600" />
                {signingFrame.title}
              </div>
              <button
                onClick={() => {
                  setSigningFrame(null);
                  if (detail) openDetail(detail.signingRequest.id);
                }}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>
            <iframe
              src={signingFrame.url}
              title={signingFrame.title}
              className="h-full w-full flex-1 border-0"
              allow="camera; microphone; clipboard-write"
            />
          </div>
        </div>
      )}
    </div>
  );
};
