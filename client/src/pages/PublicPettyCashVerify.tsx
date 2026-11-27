import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  FileDown,
  FileSpreadsheet,
  FileText,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useCompany } from '../context/CompanyContext';
import { generatePettyCashPdf } from '../utils/pettyCashPdf';

const CATEGORY_MAP: Record<string, string> = {
  transport: 'Transport',
  meals: 'Meals & Catering',
  office_supplies: 'Office Supplies',
  utilities: 'Utilities',
  maintenance: 'Repairs & Maintenance',
  travel: 'Business Travel',
  other: 'Other',
};

const STATUS_MAP: Record<string, { label: string; style: string }> = {
  pending: { label: 'Awaiting Approval', style: 'bg-amber-100 text-amber-800' },
  approved: { label: 'Cash Received', style: 'bg-emerald-100 text-emerald-800' },
  rejected: { label: 'Rejected', style: 'bg-rose-100 text-rose-800' },
  cancelled: { label: 'Cancelled', style: 'bg-slate-200 text-slate-600' },
  report_submitted: { label: 'Under Review', style: 'bg-sky-100 text-sky-800' },
  report_approved: { label: 'Approved', style: 'bg-emerald-100 text-emerald-800' },
  report_rejected: { label: 'Sent Back', style: 'bg-orange-100 text-orange-800' },
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

function formatCurrency(amount: number): string {
  return 'Rp ' + (amount || 0).toLocaleString('id-ID');
}

function formatDateEn(dateStr?: string | null): string {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    return d.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return String(dateStr);
  }
}

export const PublicPettyCashVerify: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const { companyName, logoUrl } = useCompany();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!id || !token) {
        setError('Missing verification parameters.');
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/public/petty-cash/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`
        );
        const json = (await res.json()) as any;
        if (!res.ok) {
          throw new Error(json?.error || 'Verification failed.');
        }
        if (active) setData(json);
      } catch (err: any) {
        if (active) setError(err?.message || 'Verification failed.');
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [id, token]);

  const handleDownloadPdf = async () => {
    if (!data?.request) return;
    setDownloadingPdf(true);
    try {
      await generatePettyCashPdf({
        companyName: companyName || 'openHR',
        logoUrl,
        referenceNo: data.request.reference_no || data.request.id,
        purpose: data.request.purpose || 'Petty Cash',
        departmentName: data.request.department_name || '-',
        employeeName: data.request.full_name || '-',
        employeeNik: data.request.nik || '-',
        approverName: data.request.approver_name || '-',
        reviewerName: data.request.reviewer_name || '-',
        status: data.request.status,
        createdAt: data.request.created_at,
        disbursedAmount: Number(data.totals?.disbursed_amount ?? 0),
        totalRealized: Number(data.totals?.total_realized ?? 0),
        variance: Number(data.totals?.variance ?? 0),
        expenses: data.expenses || [],
        verifyUrl: window.location.href,
      });
    } finally {
      setDownloadingPdf(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4 text-xs text-slate-500">
        Verifying petty cash report...
      </div>
    );
  }

  if (error || !data?.request) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md rounded-2xl border border-rose-200 bg-white p-6 text-center shadow-sm">
          <AlertCircle size={32} className="mx-auto mb-3 text-rose-500" />
          <h1 className="text-sm font-bold text-slate-900">Verification Failed</h1>
          <p className="mt-1 text-xs text-slate-500">
            {error || 'This petty cash report could not be verified.'}
          </p>
        </div>
      </div>
    );
  }

  const req = data.request;
  const totals = data.totals;
  const expenses = data.expenses || [];
  const statusInfo = STATUS_MAP[req.status] || {
    label: req.status,
    style: 'bg-slate-100 text-slate-700',
  };

  return (
    <div className="min-h-screen bg-slate-100 px-3 py-6 sm:px-6">
      <div className="mx-auto max-w-3xl space-y-4">
        {/* Verified Header Card */}
        <div className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-xs sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              {logoUrl && (
                <img
                  src={logoUrl}
                  alt={companyName}
                  className="h-9 max-w-[120px] object-contain"
                />
              )}
              <div>
                <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700">
                  <ShieldCheck size={13} />
                  Verified Authentic Document
                </div>
                <h1 className="mt-1 text-base font-black text-slate-900">
                  {companyName || 'openHR'} — Petty Cash Report
                </h1>
              </div>
            </div>

            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={downloadingPdf}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              <FileDown size={14} />
              {downloadingPdf ? 'Preparing PDF...' : 'Download PDF'}
            </button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-400">Reference No.</p>
              <p className="mt-0.5 font-mono font-bold text-slate-900">
                {req.reference_no || req.id}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-400">Applicant</p>
              <p className="mt-0.5 font-bold text-slate-900">{req.full_name}</p>
              <p className="text-[10px] text-slate-500">ID: {req.nik || '-'}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-400">Department</p>
              <p className="mt-0.5 font-semibold text-slate-800">{req.department_name || '-'}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-400">Status</p>
              <span
                className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${statusInfo.style}`}
              >
                <CheckCircle2 size={10} />
                {statusInfo.label}
              </span>
            </div>
          </div>

          <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs">
            <span className="text-[10px] font-bold uppercase text-slate-400">Purpose: </span>
            <span className="font-medium text-slate-800">{req.purpose}</span>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2.5">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-[9px] font-bold uppercase text-slate-400">Cash Received</p>
              <p className="mt-0.5 text-sm font-black text-slate-900">
                {formatCurrency(totals.disbursed_amount)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-[9px] font-bold uppercase text-slate-400">Total Realized</p>
              <p className="mt-0.5 text-sm font-black text-rose-700">
                {formatCurrency(totals.total_realized)}
              </p>
            </div>
            <div
              className={`rounded-xl border p-3 ${
                totals.variance >= 0
                  ? 'border-emerald-200 bg-emerald-50'
                  : 'border-rose-200 bg-rose-50'
              }`}
            >
              <p className="text-[9px] font-bold uppercase text-slate-500">
                {totals.variance >= 0 ? 'Remaining Balance' : 'Deficit'}
              </p>
              <p
                className={`mt-0.5 text-sm font-black ${
                  totals.variance >= 0 ? 'text-emerald-700' : 'text-rose-700'
                }`}
              >
                {formatCurrency(Math.abs(totals.variance))}
              </p>
            </div>
          </div>
        </div>

        {/* Expense Breakdown Table */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="text-xs font-bold uppercase tracking-wide text-slate-600">
              Expense Breakdown ({expenses.length} items)
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 font-bold">Date</th>
                  <th className="px-3 py-2.5 font-bold">Category</th>
                  <th className="px-3 py-2.5 font-bold">Description</th>
                  <th className="px-3 py-2.5 text-right font-bold">Amount</th>
                  <th className="px-4 py-2.5 text-right font-bold">Receipts</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {expenses.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                      No expenses recorded.
                    </td>
                  </tr>
                ) : (
                  expenses.map((exp: any) => (
                    <tr key={exp.id}>
                      <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">
                        {formatDateEn(exp.expense_date)}
                      </td>
                      <td className="px-3 py-2.5 text-slate-700">
                        {CATEGORY_MAP[exp.category] || exp.category}
                      </td>
                      <td className="px-3 py-2.5 text-slate-800">
                        <div className="font-medium">{exp.description}</div>
                        {exp.vendor && (
                          <div className="text-[10px] text-slate-400">{exp.vendor}</div>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right font-bold text-slate-900">
                        {formatCurrency(Number(exp.amount))}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap justify-end gap-1">
                          {(exp.receipts || []).length === 0 ? (
                            <span className="text-[10px] text-slate-400">None</span>
                          ) : (
                            exp.receipts.map((receipt: any) => (
                              <button
                                key={receipt.id}
                                type="button"
                                onClick={() => {
                                  if (
                                    isPdfReceipt(receipt.mime_type, receipt.file_name) ||
                                    isExcelReceipt(receipt.mime_type, receipt.file_name)
                                  ) {
                                    window.open(receipt.url, '_blank');
                                  } else {
                                    setPreviewUrl(receipt.url);
                                  }
                                }}
                                className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50 hover:border-blue-400"
                                title={receipt.file_name}
                              >
                                {isPdfReceipt(receipt.mime_type, receipt.file_name) ? (
                                  <FileText size={14} className="text-rose-500" />
                                ) : isExcelReceipt(receipt.mime_type, receipt.file_name) ? (
                                  <FileSpreadsheet size={14} className="text-emerald-600" />
                                ) : (
                                  <img
                                    src={receipt.url}
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
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Approvals Footer */}
        <div className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-xs shadow-xs sm:grid-cols-3">
          <div>
            <p className="text-[10px] font-bold uppercase text-slate-400">Prepared By</p>
            <p className="mt-0.5 font-bold text-slate-900">{req.full_name}</p>
            <p className="text-[10px] text-slate-400">{formatDateEn(req.created_at)}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase text-slate-400">Checked By</p>
            <p className="mt-0.5 font-bold text-slate-900">{req.approver_name || '-'}</p>
            <p className="text-[10px] text-slate-400">{formatDateEn(req.approved_at)}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase text-slate-400">Approved By</p>
            <p className="mt-0.5 font-bold text-slate-900">{req.reviewer_name || '-'}</p>
            <p className="text-[10px] text-slate-400">{formatDateEn(req.report_reviewed_at)}</p>
          </div>
        </div>
      </div>

      {previewUrl && (
        <div
          onClick={() => setPreviewUrl(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg space-y-3 rounded-2xl bg-white p-4 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h4 className="text-xs font-bold uppercase text-slate-800">Receipt Preview</h4>
              <button
                type="button"
                onClick={() => setPreviewUrl(null)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex max-h-[70vh] items-center justify-center overflow-y-auto rounded-xl bg-slate-950 p-2">
              <img
                src={previewUrl}
                alt="Receipt"
                className="max-h-[65vh] w-auto rounded object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
