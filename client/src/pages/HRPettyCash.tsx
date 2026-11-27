import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  FileDown,
  FileText,
  FileSpreadsheet,
  Pencil,
  RefreshCw,
  Search,
  Trash2,
  Wallet,
  X,
} from 'lucide-react';
import { apiFetch, getToken } from '../api';
import { useLanguage } from '../context/LanguageContext';
import { useCompany } from '../context/CompanyContext';
import { generatePettyCashPdf } from '../utils/pettyCashPdf';
import { TableSkeleton } from '../components/Skeleton';
import { useLockBodyScroll } from '../hooks/useLockBodyScroll';

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

const CATEGORY_LABELS: Record<string, { id: string; en: string }> = {
  transport: { id: 'Transport', en: 'Transport' },
  meals: { id: 'Makan & Konsumsi', en: 'Meals & Catering' },
  office_supplies: { id: 'Perlengkapan Kantor', en: 'Office Supplies' },
  utilities: { id: 'Utilitas', en: 'Utilities' },
  maintenance: { id: 'Perbaikan & Perawatan', en: 'Repairs & Maintenance' },
  travel: { id: 'Perjalanan Dinas', en: 'Business Travel' },
  other: { id: 'Lain-lain', en: 'Other' },
};

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

const FILTERS = [
  { key: 'open', id: 'Perlu tindakan', en: 'Needs action' },
  { key: 'all', id: 'Semua', en: 'All' },
  { key: 'approved', id: 'Disetujui', en: 'Approved' },
  { key: 'rejected', id: 'Ditolak', en: 'Rejected' },
];

const OPEN_STATUSES = ['pending', 'report_submitted'];
const APPROVED_STATUSES = ['approved', 'report_approved'];
const REJECTED_STATUSES = ['rejected', 'report_rejected', 'cancelled'];

export const HRPettyCash: React.FC = () => {
  const { tr, formatCurrency, formatDate } = useLanguage();
  const { companyName, logoUrl, modules } = useCompany();
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('open');
  const [search, setSearch] = useState('');
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [editingExpense, setEditingExpense] = useState<any | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editCategory, setEditCategory] = useState('office_supplies');
  const [editDescription, setEditDescription] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editVendor, setEditVendor] = useState('');

  useLockBodyScroll(Boolean(openId) || Boolean(previewUrl) || Boolean(editingExpense));

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await apiFetch<any>('/petty-cash/requests');
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

  const filtered = useMemo(() => {
    return requests.filter((row) => {
      if (filter === 'open' && !OPEN_STATUSES.includes(row.status)) return false;
      if (filter === 'approved' && !APPROVED_STATUSES.includes(row.status)) return false;
      if (filter === 'rejected' && !REJECTED_STATUSES.includes(row.status)) return false;

      if (search.trim()) {
        const needle = search.trim().toLowerCase();
        const haystack = [row.full_name, row.nik, row.reference_no, row.purpose, row.department_name]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [requests, filter, search]);

  const openDetail = async (id: string) => {
    setOpenId(id);
    setDetail(null);
    setDetailLoading(true);
    setNote('');
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

  const closeDetail = () => {
    setOpenId(null);
    setDetail(null);
    setNote('');
  };

  const runAction = async (path: string, body: Record<string, unknown> | null, successText: string) => {
    setSaving(true);
    setMsg(null);
    try {
      await apiFetch(path, {
        method: 'POST',
        body: body ? JSON.stringify(body) : undefined,
      });
      setMsg({ type: 'success', text: successText });
      setNote('');
      await load(true);
      if (openId) {
        const refreshed = await apiFetch<any>(`/petty-cash/requests/${openId}`);
        setDetail(refreshed);
      }
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const startEditExpense = (expense: any) => {
    setEditingExpense(expense);
    setEditDate(expense.expense_date ? String(expense.expense_date).slice(0, 10) : '');
    setEditCategory(expense.category || 'office_supplies');
    setEditDescription(expense.description || '');
    setEditAmount(String(expense.amount ?? ''));
    setEditVendor(expense.vendor || '');
  };

  const saveEditExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!openId || !editingExpense) return;
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
      await apiFetch(`/petty-cash/requests/${openId}/expenses/${editingExpense.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          expense_date: editDate,
          category: editCategory,
          description: editDescription.trim(),
          amount: parsedAmount,
          vendor: editVendor.trim() || null,
        }),
      });
      setEditingExpense(null);
      const refreshed = await apiFetch<any>(`/petty-cash/requests/${openId}`);
      setDetail(refreshed);
      await load(true);
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
    if (!openId) return;
    if (!window.confirm(tr('Hapus pengeluaran ini?', 'Delete this expense?'))) return;
    setSaving(true);
    try {
      await apiFetch(`/petty-cash/requests/${openId}/expenses/${expenseId}`, { method: 'DELETE' });
      const refreshed = await apiFetch<any>(`/petty-cash/requests/${openId}`);
      setDetail(refreshed);
      await load(true);
      setMsg({
        type: 'success',
        text: tr('Pengeluaran berhasil dihapus.', 'Expense deleted successfully.'),
      });
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const categoryLabel = (code: string) => {
    const label = CATEGORY_LABELS[code];
    return label ? tr(label.id, label.en) : code;
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

  const openReceipt = (receipt: any) => {
    const url = `${receipt.url}?token=${getToken()}`;
    if (isPdfReceipt(receipt.mime_type, receipt.file_name) || isExcelReceipt(receipt.mime_type, receipt.file_name)) {
      window.open(url, '_blank');
      return;
    }
    setPreviewUrl(url);
  };

  const request = detail?.request;

  return (
    <div className="space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-black tracking-tight text-slate-900">
            {tr('Petty Cash', 'Petty Cash')}
          </h1>
          <p className="text-[11px] text-slate-500">
            {tr(
              'Persetujuan permintaan dana dan pemeriksaan laporan realisasi pengeluaran.',
              'Approve cash requests and review realization expense reports.'
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => load(true)}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
          {tr('Muat ulang', 'Refresh')}
        </button>
      </div>

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
          <button type="button" onClick={() => setMsg(null)} aria-label="Dismiss">
            <X size={13} />
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setFilter(item.key)}
              className={`rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition ${
                filter === item.key ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'
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
              <th className="px-3 py-2.5 font-bold">{tr('Pemohon', 'Employee')}</th>
              <th className="px-3 py-2.5 font-bold">{tr('Tujuan', 'Purpose')}</th>
              <th className="px-3 py-2.5 text-right font-bold">{tr('Dana', 'Cash')}</th>
              <th className="px-3 py-2.5 text-right font-bold">{tr('Realisasi', 'Realized')}</th>
              <th className="px-3 py-2.5 font-bold">{tr('Status', 'Status')}</th>
              <th className="px-4 py-2.5 text-right font-bold">{tr('Aksi', 'Action')}</th>
            </tr>
          </thead>
          {loading ? (
            <TableSkeleton rows={5} columns={7} />
          ) : (
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                    <Wallet size={22} className="mx-auto mb-2 text-slate-300" />
                    {tr('Tidak ada pengajuan petty cash.', 'No petty cash requests.')}
                  </td>
                </tr>
              ) : (
                filtered.map((row) => (
                  <tr
                    key={row.id}
                    className="cursor-pointer hover:bg-slate-50"
                    onClick={() => openDetail(row.id)}
                  >
                    <td className="px-4 py-2.5 font-mono text-[10px] font-bold text-slate-700">
                      {row.reference_no || '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-bold text-slate-900">{row.full_name}</div>
                      <div className="text-[10px] text-slate-400">{row.department_name || '—'}</div>
                    </td>
                    <td className="max-w-[220px] truncate px-3 py-2.5 text-slate-700">{row.purpose}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right text-slate-700">
                      {formatCurrency(Number(row.disbursed_amount ?? row.requested_amount ?? 0))}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right text-slate-700">
                      {formatCurrency(Number(row.total_realized || 0))}
                    </td>
                    <td className="px-3 py-2.5">{statusBadge(row.status)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          openDetail(row.id);
                        }}
                        className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-700 hover:bg-slate-200"
                      >
                        <Eye size={11} /> {tr('Buka', 'Open')}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          )}
        </table>
      </div>

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
                  {request?.full_name || tr('Petty cash', 'Petty cash')}
                </h3>
                <p className="truncate text-[11px] text-slate-500">
                  {request?.reference_no || '—'} · {request?.department_name || '—'}
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
                  onClick={closeDetail}
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
                    {statusBadge(request.status)}
                    <span className="text-[10px] text-slate-500">
                      {tr('Diajukan', 'Submitted')}: {formatDate(request.created_at)}
                    </span>
                    {request.approver_name && (
                      <span className="text-[10px] text-slate-500">
                        {tr('Disetujui oleh', 'Approved by')}: {request.approver_name}
                      </span>
                    )}
                  </div>

                  <section className="rounded-xl border border-slate-200 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                      {tr('Tujuan', 'Purpose')}
                    </p>
                    <p className="mt-1 text-slate-800">{request.purpose}</p>
                  </section>

                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: tr('Dana Diterima', 'Cash Received'), value: detail.totals.disbursed_amount },
                      { label: tr('Total Realisasi', 'Total Realized'), value: detail.totals.total_realized },
                      { label: tr('Selisih', 'Difference'), value: detail.totals.variance },
                    ].map((item) => (
                      <div key={item.label} className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                        <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{item.label}</p>
                        <p className="mt-1 truncate text-[12px] font-bold text-slate-900">
                          {formatCurrency(Number(item.value || 0))}
                        </p>
                      </div>
                    ))}
                  </div>

                  {request.rejection_note && (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-[11px] text-rose-800">
                      <b>{tr('Alasan penolakan', 'Rejection note')}:</b> {request.rejection_note}
                    </div>
                  )}
                  {request.report_note && (
                    <div className="rounded-xl border border-orange-200 bg-orange-50 p-3 text-[11px] text-orange-800">
                      <b>{tr('Catatan pemeriksa', 'Reviewer note')}:</b> {request.report_note}
                    </div>
                  )}

                  <section className="space-y-2">
                    <h4 className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                      {tr('Rincian Pengeluaran', 'Expense Details')}
                    </h4>
                    {detail.expenses.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-[11px] text-slate-400">
                        {tr('Belum ada pengeluaran.', 'No expenses yet.')}
                      </p>
                    ) : (
                      <div className="overflow-hidden rounded-xl border border-slate-200">
                        <table className="w-full text-left text-[11px]">
                          <thead className="border-b border-slate-200 bg-slate-50 text-[9px] uppercase tracking-wider text-slate-500">
                            <tr>
                              <th className="px-3 py-2 font-bold">{tr('Tanggal', 'Date')}</th>
                              <th className="px-3 py-2 font-bold">{tr('Kategori', 'Category')}</th>
                              <th className="px-3 py-2 font-bold">{tr('Deskripsi', 'Description')}</th>
                              <th className="px-3 py-2 text-right font-bold">{tr('Nominal', 'Amount')}</th>
                              <th className="px-3 py-2 text-right font-bold">{tr('Bukti', 'Receipts')}</th>
                              <th className="px-3 py-2 text-right font-bold">{tr('Aksi', 'Action')}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {detail.expenses.map((expense: any) => (
                              <tr key={expense.id}>
                                <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                                  {formatDate(expense.expense_date)}
                                </td>
                                <td className="px-3 py-2 text-slate-700">{categoryLabel(expense.category)}</td>
                                <td className="px-3 py-2 text-slate-700">
                                  {expense.description}
                                  {expense.vendor ? (
                                    <span className="block text-[10px] text-slate-400">{expense.vendor}</span>
                                  ) : null}
                                </td>
                                <td className="whitespace-nowrap px-3 py-2 text-right font-semibold text-slate-800">
                                  {formatCurrency(Number(expense.amount))}
                                </td>
                                <td className="px-3 py-2">
                                  <div className="flex flex-wrap justify-end gap-1">
                                    {expense.receipts.length === 0 ? (
                                      <span className="text-[10px] text-rose-500">
                                        {tr('Tidak ada', 'None')}
                                      </span>
                                    ) : (
                                      expense.receipts.map((receipt: any) => (
                                        <button
                                          key={receipt.id}
                                          type="button"
                                          onClick={() => openReceipt(receipt)}
                                          className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-slate-100 text-slate-500 hover:border-blue-400"
                                          title={receipt.file_name}
                                        >
                                          {isPdfReceipt(receipt.mime_type, receipt.file_name) ? (
                                            <FileText size={14} className="text-rose-500" />
                                          ) : isExcelReceipt(receipt.mime_type, receipt.file_name) ? (
                                            <FileSpreadsheet size={14} className="text-emerald-600" />
                                          ) : (
                                            <img
                                              src={`${receipt.url}?token=${getToken()}`}
                                              alt={receipt.file_name}
                                              loading="lazy"
                                              className="h-full w-full object-cover"
                                            />
                                          )}
                                        </button>
                                      ))
                                    )}
                                  </div>
                                </td>
                                <td className="whitespace-nowrap px-3 py-2 text-right">
                                  <div className="flex items-center justify-end gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => startEditExpense(expense)}
                                      disabled={saving}
                                      className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-semibold text-blue-600 hover:bg-blue-50 disabled:opacity-50"
                                      title={tr('Edit Pengeluaran', 'Edit Expense')}
                                    >
                                      <Pencil size={11} /> {tr('Edit', 'Edit')}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => deleteExpense(expense.id)}
                                      disabled={saving}
                                      className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                                      title={tr('Hapus Pengeluaran', 'Delete Expense')}
                                    >
                                      <Trash2 size={11} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={downloadPdfReport}
                        disabled={downloadingPdf}
                        className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-2 text-[11px] font-bold text-slate-700 shadow-xs hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
                      >
                        <FileDown size={14} className="text-emerald-600" />
                        {downloadingPdf ? tr('Menyiapkan Laporan PDF...', 'Preparing PDF Report...') : tr('Unduh Laporan Realisasi (PDF)', 'Download Realization Report (PDF)')}
                      </button>
                    </div>
                  </section>

                  {(detail.rights.canReject || detail.rights.canReviewReport) && (
                    <section className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <h4 className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                        {tr('Keputusan', 'Decision')}
                      </h4>
                      <textarea
                        rows={2}
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        placeholder={
                          detail.rights.canReviewReport
                            ? tr('Catatan pengembalian (wajib jika dikembalikan)', 'Return note (required when sending back)')
                            : tr('Catatan penolakan (wajib jika ditolak)', 'Rejection note (required when rejecting)')
                        }
                        className="w-full rounded-xl border border-slate-300 p-2.5"
                      />
                      <div className="flex flex-wrap gap-2">
                        {detail.rights.canApprove && (
                          <button
                            type="button"
                            onClick={() =>
                              runAction(
                                `/petty-cash/requests/${openId}/approve`,
                                null,
                                tr('Petty cash disetujui dan dicairkan.', 'Petty cash approved and disbursed.')
                              )
                            }
                            disabled={saving}
                            className="flex-1 rounded-xl bg-emerald-600 px-3 py-2 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                          >
                            {tr('Setujui & Cairkan', 'Approve & Disburse')}
                          </button>
                        )}
                        {detail.rights.canApprove && (
                          <button
                            type="button"
                            onClick={() =>
                              note.trim()
                                ? runAction(
                                    `/petty-cash/requests/${openId}/reject`,
                                    { note: note.trim() },
                                    tr('Pengajuan ditolak.', 'Request rejected.')
                                  )
                                : setMsg({
                                    type: 'error',
                                    text: tr('Isi catatan penolakan.', 'Enter a rejection note.'),
                                  })
                            }
                            disabled={saving}
                            className="flex-1 rounded-xl border border-rose-300 px-3 py-2 text-[11px] font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                          >
                            {tr('Tolak', 'Reject')}
                          </button>
                        )}
                        {detail.rights.canReviewReport && (
                          <button
                            type="button"
                            onClick={() =>
                              runAction(
                                `/petty-cash/requests/${openId}/report-approve`,
                                null,
                                tr('Realisasi disetujui.', 'Report approved.')
                              )
                            }
                            disabled={saving}
                            className="flex-1 rounded-xl bg-emerald-600 px-3 py-2 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                          >
                            {tr('Setujui Realisasi', 'Approve Report')}
                          </button>
                        )}
                        {detail.rights.canReviewReport && (
                          <button
                            type="button"
                            onClick={() =>
                              note.trim()
                                ? runAction(
                                    `/petty-cash/requests/${openId}/report-reject`,
                                    { note: note.trim() },
                                    tr('Realisasi dikembalikan.', 'Report sent back.')
                                  )
                                : setMsg({
                                    type: 'error',
                                    text: tr('Isi catatan pengembalian.', 'Enter a return note.'),
                                  })
                            }
                            disabled={saving}
                            className="flex-1 rounded-xl border border-rose-300 px-3 py-2 text-[11px] font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                          >
                            {tr('Kembalikan', 'Send Back')}
                          </button>
                        )}
                      </div>
                    </section>
                  )}

                  {detail.history.length > 0 && (
                    <section className="space-y-2">
                      <h4 className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                        {tr('Riwayat', 'History')}
                      </h4>
                      <div className="space-y-1.5">
                        {detail.history.map((item: any) => (
                          <div
                            key={item.id}
                            className="flex items-start justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-[10px]"
                          >
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
              <button
                type="button"
                onClick={() => setPreviewUrl(null)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X size={15} />
              </button>
            </div>
            <div className="flex max-h-[70vh] items-center justify-center overflow-y-auto rounded-xl bg-slate-950 p-2">
              <img src={previewUrl} alt="Receipt" className="max-h-[65vh] w-auto rounded object-contain" />
            </div>
          </div>
        </div>
      )}

      {editingExpense && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-800">
                {tr('Edit Pengeluaran', 'Edit Expense')}
              </h3>
              <button
                type="button"
                onClick={() => setEditingExpense(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={saveEditExpense} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">
                    {tr('Tanggal *', 'Date *')}
                  </label>
                  <input
                    type="date"
                    required
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 p-2 text-xs text-slate-900"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">
                    {tr('Kategori *', 'Category *')}
                  </label>
                  <select
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 p-2 text-xs text-slate-900"
                  >
                    {Object.entries(CATEGORY_LABELS).map(([catKey, catVal]) => (
                      <option key={catKey} value={catKey}>
                        {tr(catVal.id, catVal.en)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">
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

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">
                    {tr('Nominal (Rp) *', 'Amount (Rp) *')}
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                    placeholder="393900"
                    className="w-full rounded-xl border border-slate-300 p-2 text-xs font-bold text-slate-900"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">
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

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingExpense(null)}
                  disabled={saving}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  {tr('Batal', 'Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:bg-slate-300"
                >
                  {saving ? tr('Menyimpan...', 'Saving...') : tr('Simpan Perubahan', 'Save Changes')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
