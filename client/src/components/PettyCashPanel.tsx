import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Camera,
  CheckCircle2,
  ChevronRight,
  FileDown,
  FileText,
  FileSpreadsheet,
  Plus,
  Pencil,
  RefreshCw,
  Trash2,
  Upload,
  Wallet,
  X,
} from 'lucide-react';
import { apiFetch, getLocalDateString, getToken } from '../api';
import { useLanguage } from '../context/LanguageContext';
import { useCompany } from '../context/CompanyContext';
import { generatePettyCashPdf } from '../utils/pettyCashPdf';
import { MobileDatePicker } from './pickers/MobileDatePicker';
import { MobileSelect } from './pickers/MobileSelect';
import { CameraModal } from './CameraModal';
import { ListSkeleton } from './Skeleton';
import { useLockBodyScroll } from '../hooks/useLockBodyScroll';
import { fileToDownscaledDataUrl } from '../utils/image';

const CATEGORY_OPTIONS = [
  { value: 'transport', id: 'Transport', en: 'Transport' },
  { value: 'meals', id: 'Makan & Konsumsi', en: 'Meals & Catering' },
  { value: 'office_supplies', id: 'Perlengkapan Kantor', en: 'Office Supplies' },
  { value: 'utilities', id: 'Utilitas', en: 'Utilities' },
  { value: 'maintenance', id: 'Perbaikan & Perawatan', en: 'Repairs & Maintenance' },
  { value: 'travel', id: 'Perjalanan Dinas', en: 'Business Travel' },
  { value: 'other', id: 'Lain-lain', en: 'Other' },
];

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  approved: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-rose-100 text-rose-800',
  cancelled: 'bg-slate-200 text-slate-600',
  report_submitted: 'bg-sky-100 text-sky-800',
  report_approved: 'bg-emerald-100 text-emerald-800',
  report_rejected: 'bg-orange-100 text-orange-800',
};

const STATUS_LABELS: Record<string, { id: string; en: string }> = {
  pending: { id: 'Menunggu Persetujuan', en: 'Awaiting Approval' },
  approved: { id: 'Dana Diterima', en: 'Cash Received' },
  rejected: { id: 'Ditolak', en: 'Rejected' },
  cancelled: { id: 'Dibatalkan', en: 'Cancelled' },
  report_submitted: { id: 'Realisasi Diperiksa', en: 'Report Under Review' },
  report_approved: { id: 'Realisasi Disetujui', en: 'Report Approved' },
  report_rejected: { id: 'Realisasi Dikembalikan', en: 'Report Sent Back' },
};

const isExcelReceipt = (mime?: string, name?: string) => {
  const m = String(mime || '').toLowerCase();
  const n = String(name || '').toLowerCase();
  return (
    m.includes('spreadsheet') ||
    m.includes('excel') ||
    m.includes('csv') ||
    n.endsWith('.xlsx') ||
    n.endsWith('.xls') ||
    n.endsWith('.csv')
  );
};

const isPdfReceipt = (mime?: string, name?: string) => {
  const m = String(mime || '').toLowerCase();
  const n = String(name || '').toLowerCase();
  return m.includes('pdf') || n.endsWith('.pdf');
};

interface PendingReceipt {
  dataUrl: string;
  name: string;
  mime: string;
}

interface PettyCashPanelProps {
  onFormOpenChange?: (open: boolean) => void;
}

export const PettyCashPanel: React.FC<PettyCashPanelProps> = ({ onFormOpenChange }) => {
  const { tr, formatCurrency, formatDate } = useLanguage();
  const { companyName, logoUrl, modules } = useCompany();
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [purpose, setPurpose] = useState('');
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [expenseDate, setExpenseDate] = useState(getLocalDateString());
  const [category, setCategory] = useState('office_supplies');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [description, setDescription] = useState('');
  const [vendor, setVendor] = useState('');
  const [receipts, setReceipts] = useState<PendingReceipt[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editCategory, setEditCategory] = useState('office_supplies');
  const [editDescription, setEditDescription] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editVendor, setEditVendor] = useState('');

  useLockBodyScroll(Boolean(openId) || Boolean(previewUrl));

  const categoryLabel = useCallback(
    (code: string) => {
      const option = CATEGORY_OPTIONS.find((item) => item.value === code);
      return option ? tr(option.id, option.en) : code;
    },
    [tr]
  );

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await apiFetch<any>('/petty-cash/requests?scope=mine');
      setRequests(res.requests || []);
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    onFormOpenChange?.(showForm);
  }, [showForm, onFormOpenChange]);

  const openDetail = async (id: string) => {
    setOpenId(id);
    setDetail(null);
    setDetailLoading(true);
    setMsg(null);
    try {
      const res = await apiFetch<any>(`/petty-cash/requests/${id}`);
      setDetail(res);
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
      setOpenId(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const refreshDetail = async () => {
    if (!openId) return;
    const res = await apiFetch<any>(`/petty-cash/requests/${openId}`);
    setDetail(res);
  };

  const submitRequest = async (event: React.FormEvent) => {
    event.preventDefault();
    setMsg(null);
    if (!purpose.trim()) {
      setMsg({ type: 'error', text: tr('Tujuan penggunaan wajib diisi.', 'Purpose is required.') });
      return;
    }
    if (!amount || Number(amount) <= 0) {
      setMsg({ type: 'error', text: tr('Nominal harus lebih dari 0.', 'Amount must be greater than 0.') });
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiFetch<any>('/petty-cash/requests', {
        method: 'POST',
        body: JSON.stringify({ purpose: purpose.trim(), requested_amount: Number(amount) }),
      });
      setMsg({ type: 'success', text: res.message });
      setPurpose('');
      setAmount('');
      setShowForm(false);
      await load(true);
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleReceiptFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    const next: PendingReceipt[] = [];
    for (const file of files) {
      const dataUrl = await fileToDownscaledDataUrl(file);
      next.push({ dataUrl, name: file.name || 'receipt', mime: file.type || 'image/jpeg' });
    }
    setReceipts((current) => [...current, ...next]);
    event.target.value = '';
  };

  const addExpense = async (event: React.FormEvent) => {
    event.preventDefault();
    setMsg(null);
    if (!description.trim()) {
      setMsg({ type: 'error', text: tr('Deskripsi pengeluaran wajib diisi.', 'Expense description is required.') });
      return;
    }
    if (!expenseAmount || Number(expenseAmount) <= 0) {
      setMsg({ type: 'error', text: tr('Nominal pengeluaran harus lebih dari 0.', 'Expense amount must be greater than 0.') });
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/petty-cash/requests/${openId}/expenses`, {
        method: 'POST',
        body: JSON.stringify({
          expense_date: expenseDate,
          category,
          description: description.trim(),
          amount: Number(expenseAmount),
          vendor: vendor.trim() || null,
          receipts: receipts.map((receipt) => ({
            file_name: receipt.name,
            mime_type: receipt.mime,
            base64: receipt.dataUrl,
          })),
        }),
      });
      setMsg({ type: 'success', text: tr('Pengeluaran dicatat.', 'Expense recorded.') });
      setExpenseAmount('');
      setDescription('');
      setVendor('');
      setReceipts([]);
      setExpenseDate(getLocalDateString());
      await Promise.all([refreshDetail(), load(true)]);
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const startEditExpense = (expense: any) => {
    setEditingExpenseId(expense.id);
    setEditDate(expense.expense_date ? String(expense.expense_date).slice(0, 10) : getLocalDateString());
    setEditCategory(expense.category || 'office_supplies');
    setEditDescription(expense.description || '');
    setEditAmount(String(expense.amount ?? ''));
    setEditVendor(expense.vendor || '');
  };

  const cancelEditExpense = () => {
    setEditingExpenseId(null);
  };

  const updateExpense = async (expenseId: string) => {
    if (!openId) return;
    const parsedAmount = parseFloat(editAmount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setMsg({
        type: 'error',
        text: tr('Nominal pengeluaran harus lebih dari 0.', 'Expense amount must be greater than 0.'),
      });
      return;
    }
    if (!editDescription.trim()) {
      setMsg({
        type: 'error',
        text: tr('Deskripsi pengeluaran wajib diisi.', 'Expense description is required.'),
      });
      return;
    }

    setSaving(true);
    setMsg(null);
    try {
      await apiFetch(`/petty-cash/requests/${openId}/expenses/${expenseId}`, {
        method: 'PUT',
        body: JSON.stringify({
          expense_date: editDate,
          category: editCategory,
          description: editDescription.trim(),
          amount: parsedAmount,
          vendor: editVendor.trim() || null,
        }),
      });
      setEditingExpenseId(null);
      await Promise.all([refreshDetail(), load(true)]);
      setMsg({
        type: 'success',
        text: tr('Pengeluaran berhasil diperbarui.', 'Expense updated successfully.'),
      });
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const deleteExpense = async (expenseId: string) => {
    if (!window.confirm(tr('Hapus pengeluaran ini?', 'Delete this expense?'))) return;
    setSaving(true);
    try {
      await apiFetch(`/petty-cash/requests/${openId}/expenses/${expenseId}`, { method: 'DELETE' });
      await Promise.all([refreshDetail(), load(true)]);
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const deleteReceipt = async (expenseId: string, receiptId: string) => {
    if (!window.confirm(tr('Hapus lampiran ini?', 'Delete this attachment?'))) return;
    setSaving(true);
    try {
      await apiFetch(
        `/petty-cash/requests/${openId}/expenses/${expenseId}/receipts/${receiptId}`,
        { method: 'DELETE' }
      );
      await refreshDetail();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const submitReport = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const res = await apiFetch<any>(`/petty-cash/requests/${openId}/submit-report`, { method: 'POST' });
      setMsg({ type: 'success', text: res.message });
      await Promise.all([refreshDetail(), load(true)]);
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const downloadPdfReport = async () => {
    if (!detail?.request) return;
    setDownloadingPdf(true);
    try {
      await generatePettyCashPdf({
        companyName: companyName || 'openHR',
        logoUrl,
        referenceNo: detail.request.reference_no || detail.request.id,
        purpose: detail.request.purpose || 'Petty Cash',
        departmentName: detail.request.department_name || detail.request.department_label || '-',
        employeeName: detail.request.full_name || '-',
        employeeNik: detail.request.nik || '-',
        approverName: detail.request.approver_name || '-',
        reviewerName: detail.request.reviewer_name || '-',
        status: detail.request.status,
        createdAt: detail.request.created_at,
        disbursedAmount: Number(detail.totals?.disbursed_amount ?? detail.totals?.requested_amount ?? 0),
        totalRealized: Number(detail.totals?.total_realized ?? 0),
        variance: Number(detail.totals?.variance ?? 0),
        expenses: detail.expenses || [],
        verifyUrl: detail.verifyPath ? `${window.location.origin}${detail.verifyPath}` : null,
        templateLabels: {
          currencySymbol: modules.template_currency_symbol,
          preparedBy: modules.template_prepared_by,
          checkedBy: modules.template_checked_by,
          approvedBy: modules.template_approved_by,
        },
      });
    } catch (err: any) {
      console.error('Error generating PDF:', err);
      setMsg({ type: 'error', text: tr('Gagal mengunduh laporan PDF.', 'Failed to download PDF report.') });
    } finally {
      setDownloadingPdf(false);
    }
  };

  const cancelRequest = async () => {
    if (!window.confirm(tr('Batalkan pengajuan ini?', 'Cancel this request?'))) return;
    setSaving(true);
    try {
      await apiFetch(`/petty-cash/requests/${openId}/cancel`, { method: 'POST' });
      await Promise.all([refreshDetail(), load(true)]);
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const openReceipt = (receipt: any) => {
    const url = `${receipt.url}?token=${getToken()}`;
    if (isPdfReceipt(receipt.mime_type, receipt.file_name) || isExcelReceipt(receipt.mime_type, receipt.file_name)) {
      window.open(url, '_blank');
      return;
    }
    setPreviewUrl(url);
  };

  const statusBadge = (status: string) => (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[9px] font-bold ${
        STATUS_STYLES[status] || STATUS_STYLES.pending
      }`}
    >
      {STATUS_LABELS[status] ? tr(STATUS_LABELS[status].id, STATUS_LABELS[status].en) : status}
    </span>
  );

  const allReceipted =
    Boolean(detail?.expenses?.length) &&
    detail.expenses.every((expense: any) => (expense.receipts || []).length > 0);

  return (
    <div className="order-2 space-y-3">
      {!showForm && (
      <div className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white px-4 py-3 shadow-2xs">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
            <Wallet size={16} />
          </span>
          <div>
            <h3 className="text-xs font-bold uppercase text-slate-900">{tr('Petty Cash', 'Petty Cash')}</h3>
            <p className="text-[10px] text-slate-500">
              {tr('Dana kecil untuk kebutuhan operasional', 'Small float for operational expenses')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => load(true)}
            disabled={refreshing}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
            aria-label={tr('Muat ulang', 'Refresh')}
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          </button>
          <button
            type="button"
            onClick={() => {
              setMsg(null);
              setShowForm(true);
            }}
            className="inline-flex items-center gap-1 rounded-xl bg-slate-900 px-3 py-2 text-[11px] font-bold text-white hover:bg-slate-800"
          >
            <Plus size={13} />
            {tr('Ajukan', 'Request')}
          </button>
        </div>
      </div>
      )}

      {msg && (
        <div
          className={`flex items-start gap-2 rounded-xl border p-3 text-[11px] font-medium ${
            msg.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-rose-200 bg-rose-50 text-rose-800'
          }`}
        >
          {msg.type === 'success' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
          <span className="flex-1">{msg.text}</span>
          <button type="button" onClick={() => setMsg(null)} aria-label="Dismiss">
            <X size={13} />
          </button>
        </div>
      )}

      {showForm && (
        <>
          <div className="flex items-start gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100 cursor-pointer"
              aria-label={tr('Kembali', 'Back')}
            >
              <ArrowLeft size={15} />
            </button>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-900">
                {tr('Pengajuan Petty Cash Baru', 'New Petty Cash Request')}
              </h3>
              <p className="text-[11px] text-slate-500">
                {tr('Ajukan dana kecil untuk kebutuhan operasional.', 'Request a small float for operational expenses.')}
              </p>
            </div>
          </div>
        <form
          onSubmit={submitRequest}
          className="space-y-3 rounded-3xl border border-slate-200/80 bg-white p-5 text-xs shadow-xs"
        >
          <h3 className="border-b border-slate-100 pb-3 text-xs font-bold uppercase text-slate-900">
            {tr('Form Pengajuan Petty Cash', 'Petty Cash Request Form')}
          </h3>
          <div>
            <label className="mb-1 block font-medium text-slate-600">
              {tr('Tujuan Penggunaan *', 'Purpose *')}
            </label>
            <textarea
              required
              rows={2}
              value={purpose}
              onChange={(event) => setPurpose(event.target.value)}
              placeholder={tr(
                'Contoh: kebutuhan konsumsi rapat bulanan, alat tulis kantor...',
                'Example: monthly meeting catering, office stationery...'
              )}
              className="w-full rounded-xl border border-slate-300 p-2.5"
            />
          </div>
          <div>
            <label className="mb-1 block font-medium text-slate-600">
              {tr('Nominal Diajukan (Rp) *', 'Requested Amount (Rp) *')}
            </label>
            <input
              type="number"
              required
              min="1"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="500000"
              className="w-full rounded-xl border border-slate-300 p-2.5 font-bold text-slate-900"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-emerald-600 py-2.5 font-bold text-white transition hover:bg-emerald-700 disabled:bg-slate-300"
          >
            {submitting ? tr('Mengirim...', 'Submitting...') : tr('Kirim Pengajuan', 'Submit Request')}
          </button>
        </form>
        </>
      )}

      {!showForm && (loading ? (
        <ListSkeleton rows={4} />
      ) : requests.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <Wallet size={24} className="mx-auto mb-2 text-slate-300" />
          <p className="text-xs font-medium text-slate-500">
            {tr('Belum ada pengajuan petty cash.', 'No petty cash requests yet.')}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {requests.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => openDetail(row.id)}
              className="flex w-full items-start gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3.5 text-left transition hover:border-slate-300 hover:bg-white"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-bold text-slate-900">{row.purpose}</span>
                  {statusBadge(row.status)}
                </div>
                <p className="font-mono text-[10px] text-slate-400">
                  {row.reference_no || '—'} · {row.department_name || '—'}
                </p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-slate-500">
                  <span>
                    {tr('Diajukan', 'Requested')}: <b className="text-slate-700">{formatCurrency(Number(row.requested_amount))}</b>
                  </span>
                  <span>
                    {tr('Realisasi', 'Realized')}: <b className="text-slate-700">{formatCurrency(Number(row.total_realized || 0))}</b>
                  </span>
                  <span>
                    {tr('Sisa', 'Remaining')}: <b className="text-slate-700">{formatCurrency(Number(row.variance || 0))}</b>
                  </span>
                </div>
                <p className="text-[10px] text-slate-400">
                  {row.expense_count || 0} {tr('pengeluaran', 'expenses')} · {row.receipt_count || 0}{' '}
                  {tr('lampiran', 'attachments')}
                </p>
              </div>
              <ChevronRight size={16} className="mt-1 shrink-0 text-slate-300" />
            </button>
          ))}
        </div>
      ))}

      {openId && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 backdrop-blur-[2px] sm:items-center sm:p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) setOpenId(null);
          }}
        >
          <div className="flex max-h-[94vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-h-[92vh] sm:rounded-3xl">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-5 py-3.5">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-bold text-slate-900">
                  {detail?.request?.purpose || tr('Petty Cash', 'Petty Cash')}
                </h3>
                <p className="truncate text-[11px] text-slate-500">
                  {detail?.request?.reference_no || '—'} · {detail?.request?.department_name || detail?.request?.department_label || '—'}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                {detail && (
                  <button
                    type="button"
                    onClick={downloadPdfReport}
                    disabled={downloadingPdf}
                    className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-700 shadow-xs hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
                    title={tr('Unduh Laporan PDF', 'Download PDF Report')}
                  >
                    <FileDown size={13} className="text-emerald-600" />
                    <span>{downloadingPdf ? tr('Mengunduh...', 'Downloading...') : tr('Unduh PDF', 'Download PDF')}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setOpenId(null)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Close"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-5 text-xs">
              {detailLoading || !detail ? (
                <p className="py-10 text-center text-slate-400">{tr('Memuat...', 'Loading...')}</p>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    {statusBadge(detail.request.status)}
                    <span className="text-[10px] text-slate-500">
                      {formatDate(detail.request.created_at)}
                    </span>
                  </div>

                  {detail.request.rejection_note && (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-[11px] text-rose-800">
                      <b>{tr('Alasan penolakan', 'Rejection note')}:</b> {detail.request.rejection_note}
                    </div>
                  )}
                  {detail.request.report_note && (
                    <div className="rounded-xl border border-orange-200 bg-orange-50 p-3 text-[11px] text-orange-800">
                      <b>{tr('Catatan pemeriksa', 'Reviewer note')}:</b> {detail.request.report_note}
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: tr('Dana', 'Cash'), value: detail.totals.disbursed_amount },
                      { label: tr('Terpakai', 'Spent'), value: detail.totals.total_realized },
                      { label: tr('Sisa', 'Remaining'), value: detail.totals.variance },
                    ].map((item) => (
                      <div key={item.label} className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                        <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{item.label}</p>
                        <p className="mt-1 truncate text-[11px] font-bold text-slate-900">
                          {formatCurrency(Number(item.value || 0))}
                        </p>
                      </div>
                    ))}
                  </div>

                  <section className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                        {tr('Pengeluaran', 'Expenses')}
                      </h4>
                      <span className="text-[10px] text-slate-400">
                        {detail.expenses.length} {tr('item', 'items')}
                      </span>
                    </div>

                    {detail.expenses.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-[11px] text-slate-400">
                        {tr('Belum ada pengeluaran dicatat.', 'No expenses recorded yet.')}
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {detail.expenses.map((expense: any) => (
                          <div key={expense.id} className="rounded-xl border border-slate-200 p-3">
                            {editingExpenseId === expense.id ? (
                              <form
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  updateExpense(expense.id);
                                }}
                                className="space-y-2.5"
                              >
                                <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                                  <span className="text-[11px] font-bold text-slate-800">
                                    {tr('Edit Pengeluaran', 'Edit Expense')}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={cancelEditExpense}
                                    className="text-slate-400 hover:text-slate-600"
                                  >
                                    <X size={14} />
                                  </button>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                  <div className="min-w-0">
                                    <label className="mb-1 block text-[10px] font-medium text-slate-600">
                                      {tr('Tanggal', 'Date')}
                                    </label>
                                    <MobileDatePicker value={editDate} onChange={setEditDate} />
                                  </div>
                                  <div className="min-w-0">
                                    <label className="mb-1 block text-[10px] font-medium text-slate-600">
                                      {tr('Kategori', 'Category')}
                                    </label>
                                    <MobileSelect
                                      value={editCategory}
                                      onChange={setEditCategory}
                                      title={tr('Kategori', 'Category')}
                                      options={CATEGORY_OPTIONS.map((option) => ({
                                        value: option.value,
                                        label: tr(option.id, option.en),
                                      }))}
                                    />
                                  </div>
                                </div>

                                <div>
                                  <label className="mb-1 block text-[10px] font-medium text-slate-600">
                                    {tr('Deskripsi *', 'Description *')}
                                  </label>
                                  <input
                                    type="text"
                                    required
                                    value={editDescription}
                                    onChange={(e) => setEditDescription(e.target.value)}
                                    placeholder={tr('Deskripsi pengeluaran *', 'Expense description *')}
                                    className="w-full rounded-xl border border-slate-300 p-2 text-xs text-slate-900"
                                  />
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="mb-1 block text-[10px] font-medium text-slate-600">
                                      {tr('Nominal (Rp) *', 'Amount (Rp) *')}
                                    </label>
                                    <input
                                      type="number"
                                      required
                                      min="1"
                                      value={editAmount}
                                      onChange={(e) => setEditAmount(e.target.value)}
                                      placeholder={tr('Nominal (Rp) *', 'Amount (Rp) *')}
                                      className="w-full rounded-xl border border-slate-300 p-2 text-xs font-bold text-slate-900"
                                    />
                                  </div>
                                  <div>
                                    <label className="mb-1 block text-[10px] font-medium text-slate-600">
                                      {tr('Toko / Vendor', 'Store / Vendor')}
                                    </label>
                                    <input
                                      type="text"
                                      value={editVendor}
                                      onChange={(e) => setEditVendor(e.target.value)}
                                      placeholder={tr('Toko / vendor', 'Store / vendor')}
                                      className="w-full rounded-xl border border-slate-300 p-2 text-xs text-slate-900"
                                    />
                                  </div>
                                </div>

                                <div className="flex items-center justify-end gap-2 pt-1">
                                  <button
                                    type="button"
                                    onClick={cancelEditExpense}
                                    disabled={saving}
                                    className="rounded-xl border border-slate-200 px-3 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                                  >
                                    {tr('Batal', 'Cancel')}
                                  </button>
                                  <button
                                    type="submit"
                                    disabled={saving}
                                    className="rounded-xl bg-blue-600 px-4 py-1.5 text-[11px] font-bold text-white hover:bg-blue-700 disabled:bg-slate-300"
                                  >
                                    {saving ? tr('Menyimpan...', 'Saving...') : tr('Simpan Perubahan', 'Save Changes')}
                                  </button>
                                </div>
                              </form>
                            ) : (
                              <>
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="text-[11px] font-bold text-slate-900">{expense.description}</p>
                                    <p className="text-[10px] text-slate-400">
                                      {formatDate(expense.expense_date)} · {categoryLabel(expense.category)}
                                      {expense.vendor ? ` · ${expense.vendor}` : ''}
                                    </p>
                                  </div>
                                  <div className="shrink-0 text-right">
                                    <p className="text-[11px] font-bold text-slate-900">
                                      {formatCurrency(Number(expense.amount))}
                                    </p>
                                    {detail.rights.canEditExpenses && (
                                      <div className="mt-1 flex items-center justify-end gap-2">
                                        <button
                                          type="button"
                                          onClick={() => startEditExpense(expense)}
                                          disabled={saving}
                                          className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-600 hover:text-blue-700 disabled:opacity-50"
                                        >
                                          <Pencil size={10} /> {tr('Edit', 'Edit')}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => deleteExpense(expense.id)}
                                          disabled={saving}
                                          className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-600 hover:text-rose-700 disabled:opacity-50"
                                        >
                                          <Trash2 size={10} /> {tr('Hapus', 'Delete')}
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </div>
                                {expense.receipts.length > 0 && (
                                  <div className="mt-2 flex flex-wrap gap-1.5">
                                    {expense.receipts.map((receipt: any) => (
                                      <div key={receipt.id} className="relative">
                                        <button
                                          type="button"
                                          onClick={() => openReceipt(receipt)}
                                          className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-100 text-slate-500 hover:border-blue-400"
                                          title={receipt.file_name}
                                        >
                                          {isPdfReceipt(receipt.mime_type, receipt.file_name) ? (
                                            <FileText size={16} className="text-rose-500" />
                                          ) : isExcelReceipt(receipt.mime_type, receipt.file_name) ? (
                                            <span className="flex flex-col items-center justify-center text-emerald-600">
                                              <FileSpreadsheet size={16} />
                                              <span className="text-[7px] font-bold uppercase mt-0.5">XLS</span>
                                            </span>
                                          ) : (
                                            <img
                                              src={`${receipt.url}?token=${getToken()}`}
                                              alt={receipt.file_name}
                                              loading="lazy"
                                              className="h-full w-full object-cover"
                                            />
                                          )}
                                        </button>
                                        {detail.rights.canEditExpenses && (
                                          <button
                                            type="button"
                                            onClick={() => deleteReceipt(expense.id, receipt.id)}
                                            className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-600 text-white"
                                            aria-label="Remove receipt"
                                          >
                                            <X size={9} />
                                          </button>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  {detail.rights.canEditExpenses && (
                    <form
                      onSubmit={addExpense}
                      className="space-y-2.5 rounded-2xl border border-slate-200 bg-slate-50/70 p-3"
                    >
                      <h4 className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                        {tr('Catat Pengeluaran', 'Add Expense')}
                      </h4>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="min-w-0">
                          <label className="mb-1 block text-[10px] font-medium text-slate-600">
                            {tr('Tanggal', 'Date')}
                          </label>
                          <MobileDatePicker value={expenseDate} onChange={setExpenseDate} />
                        </div>
                        <div className="min-w-0">
                          <label className="mb-1 block text-[10px] font-medium text-slate-600">
                            {tr('Kategori', 'Category')}
                          </label>
                          <MobileSelect
                            value={category}
                            onChange={setCategory}
                            title={tr('Kategori', 'Category')}
                            options={CATEGORY_OPTIONS.map((option) => ({
                              value: option.value,
                              label: tr(option.id, option.en),
                            }))}
                          />
                        </div>
                      </div>
                      <input
                        type="text"
                        required
                        value={description}
                        onChange={(event) => setDescription(event.target.value)}
                        placeholder={tr('Deskripsi pengeluaran *', 'Expense description *')}
                        className="w-full rounded-xl border border-slate-300 p-2.5"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="number"
                          required
                          min="1"
                          value={expenseAmount}
                          onChange={(event) => setExpenseAmount(event.target.value)}
                          placeholder={tr('Nominal (Rp) *', 'Amount (Rp) *')}
                          className="w-full rounded-xl border border-slate-300 p-2.5 font-bold"
                        />
                        <input
                          type="text"
                          value={vendor}
                          onChange={(event) => setVendor(event.target.value)}
                          placeholder={tr('Toko / vendor', 'Store / vendor')}
                          className="w-full rounded-xl border border-slate-300 p-2.5"
                        />
                      </div>

                      <input
                        type="file"
                        ref={fileInputRef}
                        accept="image/*,application/pdf,.xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                        multiple
                        onChange={handleReceiptFiles}
                        className="hidden"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setCameraOpen(true)}
                          className="flex items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-300 py-2 text-[11px] font-semibold text-slate-700 hover:border-emerald-500"
                        >
                          <Camera size={14} className="text-emerald-600" />
                          {tr('Kamera', 'Camera')}
                        </button>
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="flex items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-300 py-2 text-[11px] font-semibold text-slate-700 hover:border-blue-500"
                        >
                          <Upload size={14} className="text-blue-600" />
                          {tr('Unggah', 'Upload')}
                        </button>
                      </div>

                      {receipts.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {receipts.map((receipt, index) => (
                            <div key={`${receipt.name}-${index}`} className="relative">
                              {isPdfReceipt(receipt.mime, receipt.name) ? (
                                <span className="flex h-12 w-12 items-center justify-center rounded-lg border border-slate-200 bg-white text-rose-500">
                                  <FileText size={16} />
                                </span>
                              ) : isExcelReceipt(receipt.mime, receipt.name) ? (
                                <span className="flex h-12 w-12 flex-col items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-600">
                                  <FileSpreadsheet size={16} />
                                  <span className="text-[7px] font-bold uppercase mt-0.5">XLS</span>
                                </span>
                              ) : (
                                <img
                                  src={receipt.dataUrl}
                                  alt={receipt.name}
                                  className="h-12 w-12 rounded-lg border border-slate-200 object-cover"
                                />
                              )}
                              <button
                                type="button"
                                onClick={() => setReceipts((current) => current.filter((_, i) => i !== index))}
                                className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-600 text-white"
                                aria-label="Remove"
                              >
                                <X size={9} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      <button
                        type="submit"
                        disabled={saving}
                        className="w-full rounded-xl bg-slate-900 py-2 text-[11px] font-bold text-white hover:bg-slate-800 disabled:bg-slate-300"
                      >
                        {saving ? tr('Menyimpan...', 'Saving...') : tr('Simpan Pengeluaran', 'Save Expense')}
                      </button>
                    </form>
                  )}

                  <div className="space-y-2 border-t border-slate-100 pt-3">
                    <button
                      type="button"
                      onClick={downloadPdfReport}
                      disabled={downloadingPdf}
                      className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-2.5 text-[11px] font-bold text-slate-700 shadow-xs hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
                    >
                      <FileDown size={14} className="text-emerald-600" />
                      {downloadingPdf ? tr('Menyiapkan Laporan PDF...', 'Preparing PDF Report...') : tr('Unduh Laporan Realisasi (PDF)', 'Download Realization Report (PDF)')}
                    </button>

                    {detail.rights.canSubmitReport && (
                      <div className="space-y-1.5">
                        <button
                          type="button"
                          onClick={submitReport}
                          disabled={saving || !allReceipted}
                          className="w-full rounded-xl bg-emerald-600 py-2.5 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:bg-slate-300"
                        >
                          {tr('Kirim Realisasi untuk Persetujuan', 'Submit Realization for Approval')}
                        </button>
                        {!allReceipted && (
                          <p className="text-center text-[10px] text-slate-500">
                            {tr(
                              'Setiap pengeluaran wajib memiliki minimal satu lampiran bukti.',
                              'Every expense needs at least one receipt attached.'
                            )}
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {detail.rights.canCancel && (
                    <button
                      type="button"
                      onClick={cancelRequest}
                      disabled={saving}
                      className="w-full rounded-xl border border-rose-200 py-2 text-[11px] font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                    >
                      {tr('Batalkan Pengajuan', 'Cancel Request')}
                    </button>
                  )}

                  {detail.history.length > 0 && (
                    <section className="space-y-2 border-t border-slate-100 pt-3">
                      <h4 className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                        {tr('Riwayat', 'History')}
                      </h4>
                      <div className="space-y-1.5">
                        {detail.history.map((item: any) => (
                          <div key={item.id} className="flex items-start justify-between gap-2 text-[10px]">
                            <span className="font-medium text-slate-700">
                              {item.action.replace(/^PETTY_CASH_/, '').replace(/_/g, ' ').toLowerCase()}
                            </span>
                            <span className="shrink-0 text-slate-400">{formatDate(item.created_at)}</span>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {previewUrl && (
        <div
          onClick={() => setPreviewUrl(null)}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs"
        >
          <div
            className="w-full max-w-lg space-y-3 rounded-2xl bg-white p-4 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h4 className="text-xs font-bold uppercase text-slate-800">
                {tr('Bukti Pengeluaran', 'Expense Receipt')}
              </h4>
              <button type="button" onClick={() => setPreviewUrl(null)} className="p-1 text-slate-400 hover:text-slate-700">
                <X size={15} />
              </button>
            </div>
            <div className="flex max-h-[70vh] items-center justify-center overflow-y-auto rounded-xl bg-slate-950 p-2">
              <img src={previewUrl} alt="Receipt" className="max-h-[65vh] w-auto rounded object-contain" />
            </div>
          </div>
        </div>
      )}

      <CameraModal
        isOpen={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(photo) =>
          setReceipts((current) => [
            ...current,
            { dataUrl: photo, name: `camera-${Date.now()}.jpg`, mime: 'image/jpeg' },
          ])
        }
        title={tr('Ambil Foto Nota / Struk', 'Take Receipt Photo')}
        facingMode="environment"
      />
    </div>
  );
};
