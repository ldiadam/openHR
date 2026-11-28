import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  Clock,
  Receipt,
  Plus,
  CheckCircle2,
  FileCheck,
  Camera,
  FileSpreadsheet,
  FileDown,
  Upload,
  Eye,
  Wallet,
} from 'lucide-react';
import { apiFetch, getLocalDateString, getLocalMonthString, downloadFile, getToken } from '../api';
import { apiFetchCached } from '../utils/offlineCache';
import { useLanguage } from '../context/LanguageContext';
import { getLeaveTypeLabel } from '../utils/leaveTypeLabel';
import { useCompany } from '../context/CompanyContext';
import { useAuth } from '../context/AuthContext';
import { CameraModal } from '../components/CameraModal';
import { PettyCashPanel } from '../components/PettyCashPanel';
import { MobileDatePicker } from '../components/pickers/MobileDatePicker';
import { MobileTimePicker } from '../components/pickers/MobileTimePicker';
import { MobileSelect } from '../components/pickers/MobileSelect';
import { MobileMonthPicker } from '../components/pickers/MobileMonthPicker';
import { generateCombinedReceiptsPdf, ClaimItemForPdf } from '../utils/claimPdf';
import { fileToDownscaledDataUrl } from '../utils/image';

export const EmployeeRequests: React.FC = () => {
  const { t, tr, lang, formatDate, formatCurrency } = useLanguage();
  const { companyName, isModuleEnabled } = useCompany();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const initialType = searchParams.get('type');
  const initialView =
    initialType === 'reimbursement' || initialType === 'overtime' || initialType === 'petty'
      ? initialType
      : 'hub';
  const [view, setView] = useState<'hub' | 'leave' | 'overtime' | 'reimbursement' | 'petty'>(initialView);
  const [showForm, setShowForm] = useState(false);
  const [pettyFormOpen, setPettyFormOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'paid' | 'rejected'>('all');
  const [claimMonth, setClaimMonth] = useState(getLocalMonthString);

  const [leaveTypes, setLeaveTypes] = useState<any[]>([]);
  const [leaveBalances, setLeaveBalances] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Forms states
  // 1. Leave
  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [leaveStart, setLeaveStart] = useState('');
  const [leaveEnd, setLeaveEnd] = useState('');
  const [leaveDays, setLeaveDays] = useState('1');
  const [leaveReason, setLeaveReason] = useState('');
  const [leaveAttachment, setLeaveAttachment] = useState<string | null>(null);
  const [leaveAttachmentName, setLeaveAttachmentName] = useState('');
  const [leaveAttachmentMime, setLeaveAttachmentMime] = useState('image/jpeg');

  // 2. Overtime
  const [otDate, setOtDate] = useState(getLocalDateString());
  const [otStart, setOtStart] = useState('18:00');
  const [otEnd, setOtEnd] = useState('20:00');
  const [otHours, setOtHours] = useState('2');
  const [otReason, setOtReason] = useState('');
  const [otIsHoliday, setOtIsHoliday] = useState(false);

  // 3. Reimbursement
  const [reimbDate, setReimbDate] = useState(getLocalDateString());
  const [reimbCategory, setReimbCategory] = useState('Transport');
  const [reimbAmount, setReimbAmount] = useState('100000');
  const [reimbDesc, setReimbDesc] = useState('');
  const [reimbRemarks, setReimbRemarks] = useState('');
  const [reimbCostCentre, setReimbCostCentre] = useState('');
  const [reimbProjectRef, setReimbProjectRef] = useState('');
  const [receiptPhoto, setReceiptPhoto] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [previewModalImg, setPreviewModalImg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [ltRes, balRes] = await Promise.all([
        apiFetchCached('/leave/types'),
        apiFetchCached('/leave/balances'),
      ]);
      setLeaveTypes(ltRes.leaveTypes || []);
      setLeaveBalances(balRes.balances || []);
      if (ltRes.leaveTypes?.[0] && !leaveTypeId) {
        setLeaveTypeId(ltRes.leaveTypes[0].id);
      }

      await loadHistory(view);
    } catch (err: any) {
      console.warn('Load requests data err:', err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async (tab: string) => {
    try {
      if (tab === 'leave') {
        const res = await apiFetchCached('/leave/requests?scope=mine');
        setHistory(res.requests || []);
      } else if (tab === 'overtime') {
        const res = await apiFetchCached('/shifts/overtime/requests?scope=mine');
        setHistory(res.requests || []);
      } else if (tab === 'reimbursement') {
        const res = await apiFetchCached(`/kasbon/reimbursements?month=${claimMonth}&scope=mine`);
        setHistory(res.reimbursements || []);
      }
    } catch (err: any) {
      console.warn('History err:', err.message);
    }
  };

  useEffect(() => {
    loadData();
  }, [view, claimMonth]);

  const handleSubmitLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (!leaveTypeId || !leaveStart || !leaveEnd) {
      setMsg({
        type: 'error',
        text: tr('Lengkapi jenis cuti, tanggal mulai, dan tanggal selesai.', 'Please complete the leave type, start date, and end date.'),
      });
      return;
    }
    const today = getLocalDateString();
    if (leaveStart < today || leaveEnd < today) {
      setMsg({
        type: 'error',
        text: tr('Tanggal cuti tidak boleh mundur dari hari ini.', 'Leave dates cannot be earlier than today.'),
      });
      return;
    }
    if (leaveEnd < leaveStart) {
      setMsg({
        type: 'error',
        text: tr('Tanggal selesai tidak boleh sebelum tanggal mulai.', 'The end date cannot be before the start date.'),
      });
      return;
    }
    try {
      const res = await apiFetch('/leave/requests', {
        method: 'POST',
        body: JSON.stringify({
          leave_type_id: leaveTypeId,
          start_date: leaveStart,
          end_date: leaveEnd,
          total_days: parseFloat(leaveDays),
          reason: leaveReason,
          attachment_base64: leaveAttachment || undefined,
          attachment_mime: leaveAttachment ? leaveAttachmentMime : undefined,
        }),
      });
      setMsg({ type: 'success', text: res.message });
      setShowForm(false);
      setLeaveReason('');
      setLeaveAttachment(null);
      setLeaveAttachmentName('');
      loadHistory('leave');
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    }
  };

  const handleSubmitOvertime = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (otDate < getLocalDateString()) {
      setMsg({
        type: 'error',
        text: tr('Tanggal lembur tidak boleh mundur dari hari ini.', 'Overtime date cannot be earlier than today.'),
      });
      return;
    }
    try {
      const res = await apiFetch('/shifts/overtime/requests', {
        method: 'POST',
        body: JSON.stringify({
          date: otDate,
          start_time: otStart,
          end_time: otEnd,
          planned_hours: parseFloat(otHours),
          reason: otReason,
          is_holiday_or_rest_day: otIsHoliday,
        }),
      });
      setMsg({ type: 'success', text: res.message });
      setShowForm(false);
      setOtReason('');
      loadHistory('overtime');
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    }
  };

  const handleLeaveAttachmentChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setLeaveAttachmentName(file.name);
    setLeaveAttachmentMime(file.type || 'image/jpeg');
    const reader = new FileReader();
    reader.onload = (e) => setLeaveAttachment(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await fileToDownscaledDataUrl(file);
      setReceiptPhoto(dataUrl);
    } catch {
      const reader = new FileReader();
      reader.onload = (event) => {
        setReceiptPhoto(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmitReimbursement = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      const res = await apiFetch('/kasbon/reimbursements', {
        method: 'POST',
        body: JSON.stringify({
          expense_date: reimbDate,
          category: reimbCategory,
          amount: parseFloat(reimbAmount),
          description: reimbDesc,
          remarks: reimbRemarks || null,
          cost_centre: reimbCostCentre || null,
          project_ref: reimbProjectRef || null,
          receipt_photo_base64: receiptPhoto,
        }),
      });
      setMsg({ type: 'success', text: res.message });
      setShowForm(false);
      setReimbDesc('');
      setReimbRemarks('');
      setReimbCostCentre('');
      setReimbProjectRef('');
      setReceiptPhoto(null);
      loadHistory('reimbursement');
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    }
  };

  const handleDownloadExcel = async () => {
    setDownloading(true);
    try {
      await downloadFile(
        `/kasbon/claims/export-excel?month=${claimMonth}&status=approved`,
        `Claim_Expenses_${claimMonth}.xlsx`
      );
    } catch (err: any) {
      alert(err.message || tr('Gagal mengunduh Excel klaim', 'Failed to download claim Excel'));
    } finally {
      setDownloading(false);
    }
  };

  const handleDownloadPdf = async () => {
    setDownloading(true);
    try {
      const approvedClaims = history.filter((h) => h.status === 'approved');
      if (approvedClaims.length === 0) {
        alert(tr('Belum ada klaim yang disetujui (approved) untuk diunduh struknya.', 'There are no approved claims to download receipts for yet.'));
        return;
      }
      const token = getToken();
      const itemsForPdf: ClaimItemForPdf[] = approvedClaims.map((c, i) => ({
        id: c.id,
        no: i + 1,
        date: c.expense_date || c.created_at?.split('T')[0] || '-',
        description: c.description || '-',
        category: c.category || '-',
        amount: Number(c.amount) || 0,
        remarks: c.remarks || '',
        receipt_photo_key: c.receipt_photo_key,
        receipt_url: c.receipt_photo_key ? `/api/kasbon/reimbursements/${c.id}/receipt?token=${token}` : null,
        status: c.status,
      }));

      await generateCombinedReceiptsPdf({
        companyName: companyName || 'openHR',
        periodTitle: (() => {
          const [yearStr, monthStr] = claimMonth.split('-');
          return new Date(Number(yearStr), Number(monthStr) - 1, 1).toLocaleDateString(
            lang === 'id' ? 'id-ID' : 'en-US',
            { month: 'long', year: 'numeric' }
          );
        })(),
        employeeName: user?.name || '-',
        employeeNik: user?.employeeId || '-',
        claims: itemsForPdf,
      });
    } catch (err: any) {
      alert(err.message || tr('Gagal membuat file PDF struk', 'Failed to create the receipt PDF file'));
    } finally {
      setDownloading(false);
    }
  };

  const statusBadge = (status: string, payrollRunId?: string | null, payrollRunTitle?: string | null) => {
    if (status === 'paid') {
      return <span className="bg-blue-100 text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded">{tr('Dibayar', 'Paid')}</span>;
    }
    if (status === 'approved' && payrollRunId) {
      return (
        <div className="flex flex-col items-end gap-0.5">
          <span className="bg-indigo-100 text-indigo-800 text-[10px] font-bold px-2 py-0.5 rounded">{tr('Masuk Payroll', 'In Payroll')}</span>
          {payrollRunTitle && <span className="text-[9px] text-slate-500">{payrollRunTitle}</span>}
        </div>
      );
    }
    switch (status) {
      case 'approved':
        return <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded">{t.leave.approved}</span>;
      case 'rejected':
        return <span className="bg-rose-100 text-rose-800 text-[10px] font-bold px-2 py-0.5 rounded">{t.leave.rejected}</span>;
      default:
        return <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded">{t.leave.pending}</span>;
    }
  };

  const statusCounts = {
    pending: history.filter((h) => h.status === 'pending').length,
    approved: history.filter((h) => h.status === 'approved').length,
    paid: history.filter((h) => h.status === 'paid').length,
    rejected: history.filter((h) => h.status === 'rejected').length,
  };
  const filteredHistory =
    statusFilter === 'all' ? history : history.filter((h) => h.status === statusFilter);

  const [claimYear, claimMonthNumber] = claimMonth.split('-').map(Number);
  const claimPrevMonth = new Date(claimYear, claimMonthNumber - 2, 25);
  const claimPeriodStart = `${claimPrevMonth.getFullYear()}-${String(claimPrevMonth.getMonth() + 1).padStart(2, '0')}-25`;
  const claimPeriodEnd = `${claimMonth}-25`;

  const REQUEST_CARDS = [
    {
      key: 'leave' as const,
      moduleId: 'leave' as const,
      icon: Calendar,
      title: t.nav.leave,
      description: tr('Cuti, izin, dan sakit', 'Leave, absence, and sick days'),
      tint: 'bg-blue-50 text-blue-600',
    },
    {
      key: 'overtime' as const,
      moduleId: 'attendance' as const,
      icon: Clock,
      title: t.shifts.requestOvertime,
      description: tr('Pengajuan kerja lembur', 'Overtime work requests'),
      tint: 'bg-amber-50 text-amber-600',
    },
    {
      key: 'reimbursement' as const,
      moduleId: 'claims' as const,
      icon: Receipt,
      title: tr('Klaim Biaya', 'Expense Claims'),
      description: tr('Klaim pengeluaran & struk', 'Expense claims & receipts'),
      tint: 'bg-emerald-50 text-emerald-600',
    },
    {
      key: 'petty' as const,
      moduleId: 'petty_cash' as const,
      icon: Wallet,
      title: tr('Petty Cash', 'Petty Cash'),
      description: tr('Dana kecil & realisasi', 'Small float & realization'),
      tint: 'bg-sky-50 text-sky-600',
    },
  ].filter((item) => isModuleEnabled(item.moduleId));

  const currentCard = REQUEST_CARDS.find((item) => item.key === view) || REQUEST_CARDS[0];

  return (
    <div className="max-w-md mx-auto flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-bold text-slate-900">{t.nav.requests}</h2>
        {view === 'hub' && (
          <p className="text-xs text-slate-500">
            {tr('Pilih jenis permohonan yang ingin dibuat', 'Choose the type of request you want to make')}
          </p>
        )}
      </div>

      {msg && (
        <div
          className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
            msg.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          {msg.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{msg.text}</span>
        </div>
      )}

      {view === 'hub' ? (
        <div className="order-1 grid grid-cols-2 gap-2.5">
          {REQUEST_CARDS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => {
                  setMsg(null);
                  setShowForm(false);
                  setPettyFormOpen(false);
                  setStatusFilter('all');
                  setView(item.key);
                }}
                className="flex min-h-[118px] flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-3.5 text-left shadow-2xs transition hover:border-slate-300 hover:shadow-xs cursor-pointer"
              >
                <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${item.tint}`}>
                  <Icon size={17} />
                </span>
                <span className="mt-2 block">
                  <span className="block text-xs font-bold leading-tight text-slate-900">{item.title}</span>
                  <span className="mt-0.5 block text-[10px] leading-snug text-slate-500">{item.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="order-1 space-y-3">
          {!(showForm || (view === 'petty' && pettyFormOpen)) && (
          <div className="flex items-start gap-2">
            <button
              type="button"
              onClick={() => {
                setMsg(null);
                setShowForm(false);
                setStatusFilter('all');
                setView('hub');
              }}
              className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100 cursor-pointer"
              aria-label={tr('Kembali', 'Back')}
            >
              <ArrowLeft size={15} />
            </button>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-900">{currentCard.title}</h3>
              <p className="text-[11px] text-slate-500">{currentCard.description}</p>
            </div>
          </div>
          )}

          {view === 'petty' ? (
            <PettyCashPanel onFormOpenChange={setPettyFormOpen} />
          ) : showForm ? (
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
                  <h3 className="text-sm font-bold text-slate-900">{currentCard.title}</h3>
                  <p className="text-[11px] text-slate-500">
                    {tr('Form pengajuan baru', 'New request form')}
                  </p>
                </div>
              </div>

      {/* TAB 1: CUTI / IZIN */}
      {view === 'leave' && (
        <div className="order-3 bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <h3 className="font-bold text-xs uppercase text-slate-900">{t.leave.requestLeave}</h3>
            <div className="flex items-center gap-2">
              <div className="text-xs text-blue-600 font-semibold">
                {t.leave.annualLeaveBalance}: {leaveBalances.find((b) => b.leave_type_code === 'annual')?.remaining_days || 12} {t.leave.remainingDays}
              </div>
              <Link
                to="/app/leave-application"
                className="rounded-lg bg-slate-900 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-slate-800"
              >
                {tr('Formulir Resmi (TTD & PDF)', 'Official Form (Sign & PDF)')}
              </Link>
            </div>
          </div>

          <form onSubmit={handleSubmitLeave} className="space-y-3 text-xs">
            <div>
              <label className="block text-slate-600 font-medium mb-1">{t.leave.leaveType}</label>
              <MobileSelect
                value={leaveTypeId}
                onChange={setLeaveTypeId}
                title={t.leave.leaveType}
                options={leaveTypes.map((lt) => ({
                  value: lt.id,
                  label: `${getLeaveTypeLabel(lt, lang)} (${lt.is_paid ? tr('Dibayar', 'Paid') : tr('Tanpa Gaji', 'Unpaid')})`,
                }))}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="min-w-0">
                <label className="block text-slate-600 font-medium mb-1">{tr('Tgl Mulai', 'Start Date')}</label>
                <MobileDatePicker
                  value={leaveStart}
                  onChange={setLeaveStart}
                  min={getLocalDateString()}
                  placeholder={tr('Pilih tanggal', 'Select date')}
                />
              </div>
              <div className="min-w-0">
                <label className="block text-slate-600 font-medium mb-1">{tr('Tgl Selesai', 'End Date')}</label>
                <MobileDatePicker
                  value={leaveEnd}
                  onChange={setLeaveEnd}
                  min={leaveStart || getLocalDateString()}
                  placeholder={tr('Pilih tanggal', 'Select date')}
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-600 font-medium mb-1">{tr('Total Hari Kerja', 'Total Working Days')}</label>
              <input
                type="number"
                min="0.5"
                step="0.5"
                required
                value={leaveDays}
                onChange={(e) => setLeaveDays(e.target.value)}
                className="w-full p-2 border border-slate-300 rounded-xl"
              />
            </div>

            <div>
              <label className="block text-slate-600 font-medium mb-1">{tr('Alasan Cuti / Izin', 'Leave / Permission Reason')}</label>
              <textarea
                required
                rows={2}
                value={leaveReason}
                onChange={(e) => setLeaveReason(e.target.value)}
                placeholder={tr('Keperluan keluarga, sakit flu, dll...', 'Family matters, flu, etc...')}
                className="w-full p-2 border border-slate-300 rounded-xl"
              />
            </div>

            <div>
              <label className="block text-slate-600 font-medium mb-1">
                {tr('Lampiran (opsional)', 'Attachment (optional)')}
              </label>
              <input
                type="file"
                accept="image/*,.pdf"
                onChange={handleLeaveAttachmentChange}
                className="w-full rounded-xl border border-slate-300 bg-white p-2 text-[11px]"
              />
              {leaveAttachmentName && (
                <p className="mt-1 text-[10px] font-medium text-emerald-600">{leaveAttachmentName}</p>
              )}
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-blue-600 text-white font-bold rounded-xl shadow-xs hover:bg-blue-700 transition"
            >
              {tr('Kirim Pengajuan Cuti', 'Submit Leave Request')}
            </button>
          </form>
        </div>
      )}

      {/* TAB 2: OVERTIME */}
      {view === 'overtime' && (
        <div className="order-3 bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
          <h3 className="font-bold text-xs uppercase text-slate-900 border-b border-slate-100 pb-3">
            {tr('Form Pengajuan Lembur', 'Overtime Request Form')}
          </h3>
          <form onSubmit={handleSubmitOvertime} className="space-y-3 text-xs">
            <div>
              <label className="block text-slate-600 font-medium mb-1">{tr('Tanggal Lembur', 'Overtime Date')}</label>
              <MobileDatePicker
                value={otDate}
                onChange={setOtDate}
                min={getLocalDateString()}
                placeholder={tr('Pilih tanggal', 'Select date')}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="min-w-0">
                <label className="block text-slate-600 font-medium mb-1">{tr('Jam Mulai', 'Start Time')}</label>
                <MobileTimePicker value={otStart} onChange={setOtStart} />
              </div>
              <div className="min-w-0">
                <label className="block text-slate-600 font-medium mb-1">{tr('Jam Selesai', 'End Time')}</label>
                <MobileTimePicker value={otEnd} onChange={setOtEnd} />
              </div>
            </div>

            <div>
              <label className="block text-slate-600 font-medium mb-1">{tr('Durasi Rencana (Jam)', 'Planned Duration (Hours)')}</label>
              <input
                type="number"
                min="0.5"
                step="0.5"
                required
                value={otHours}
                onChange={(e) => setOtHours(e.target.value)}
                className="w-full p-2 border border-slate-300 rounded-xl"
              />
            </div>

            <div className="flex items-center gap-2 py-1">
              <input
                type="checkbox"
                id="otHoliday"
                checked={otIsHoliday}
                onChange={(e) => setOtIsHoliday(e.target.checked)}
                className="rounded text-amber-600"
              />
              <label htmlFor="otHoliday" className="text-slate-700 font-medium">
                {tr('Hari Libur / Istirahat Mingguan (Tarif 2x / 3x / 4x)', 'Public Holiday / Weekly Rest Day (2x / 3x / 4x Rate)')}
              </label>
            </div>

            <div>
              <label className="block text-slate-600 font-medium mb-1">{tr('Uraian Tugas Lembur', 'Overtime Task Description')}</label>
              <textarea
                required
                rows={2}
                value={otReason}
                onChange={(e) => setOtReason(e.target.value)}
                placeholder={tr('Pekerjaan deploy sistem, closing akhir bulan...', 'System deployment work, month-end closing...')}
                className="w-full p-2 border border-slate-300 rounded-xl"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-amber-600 text-white font-bold rounded-xl shadow-xs hover:bg-amber-700 transition cursor-pointer"
            >
              {tr('Kirim Pengajuan Lembur', 'Submit Overtime Request')}
            </button>
          </form>
        </div>
      )}

      {/* TAB 3: REIMBURSEMENT (KLAIM BIAYA) */}
      {view === 'reimbursement' && (
        <div className="order-3 bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-bold text-xs uppercase text-slate-900">
                {tr('Form Klaim Biaya (Expense Claim)', 'Expense Claim Form')}
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">{tr('Format standar template klaim operasional & struk', 'Standard format for operational expense claims & receipts')}</p>
            </div>
            <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold px-2 py-0.5 rounded-full">
              IDR
            </span>
          </div>

          <form onSubmit={handleSubmitReimbursement} className="space-y-3 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="min-w-0">
                <label className="block text-slate-600 font-medium mb-1">{tr('Tanggal Pengeluaran *', 'Expense Date *')}</label>
                <MobileDatePicker value={reimbDate} onChange={setReimbDate} placeholder={tr('Pilih tanggal', 'Select date')} />
              </div>

              <div className="min-w-0">
                <label className="block text-slate-600 font-medium mb-1">{tr('Kategori Kolom *', 'Column Category *')}</label>
                <MobileSelect
                  value={reimbCategory}
                  onChange={setReimbCategory}
                  title={tr('Kategori Kolom', 'Column Category')}
                  options={[
                    { value: 'Transport', label: tr('Transport (Bensin, Tiket, Ferry)', 'Transport (Fuel, Tickets, Ferry)') },
                    { value: 'Food', label: tr('Food (Makan Lembur, Konsumsi)', 'Food (Overtime Meals, Catering)') },
                    { value: 'Hotel', label: tr('Hotel (Penginapan / Lodging)', 'Hotel (Accommodation / Lodging)') },
                    { value: 'UNPAID', label: tr('UNPAID (Beban Belum Dibayar / Gaji)', 'UNPAID (Unpaid Expense / Payroll)') },
                    { value: 'OTHERS', label: tr('OTHERS (Lain-lain / Operasional)', 'OTHERS (Miscellaneous / Operational)') },
                  ]}
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-600 font-medium mb-1">{tr('Deskripsi Klaim (Description) *', 'Claim Description *')}</label>
              <input
                type="text"
                required
                value={reimbDesc}
                onChange={(e) => setReimbDesc(e.target.value)}
                placeholder={tr('Contoh: Meeting Singapore, Place Rent, Grab ke klien...', 'Example: Singapore Meeting, Place Rent, Grab to client...')}
                className="w-full p-2.5 border border-slate-300 rounded-xl"
              />
            </div>

            <div>
              <label className="block text-slate-600 font-medium mb-1">{tr('Nominal Biaya (Rp) *', 'Expense Amount (Rp) *')}</label>
              <input
                type="number"
                required
                min="1"
                value={reimbAmount}
                onChange={(e) => setReimbAmount(e.target.value)}
                placeholder="2300000"
                className="w-full p-2.5 border border-slate-300 rounded-xl font-bold text-slate-900"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-slate-600 font-medium mb-1">{tr('Pusat Biaya (Cost Centre)', 'Cost Centre')}</label>
                <input
                  type="text"
                  value={reimbCostCentre}
                  onChange={(e) => setReimbCostCentre(e.target.value)}
                  placeholder={tr('Opsional, cth: OPS-01', 'Optional, e.g. OPS-01')}
                  className="w-full p-2.5 border border-slate-300 rounded-xl"
                />
              </div>
              <div>
                <label className="block text-slate-600 font-medium mb-1">{tr('Ref Proyek (Project Ref)', 'Project Ref')}</label>
                <input
                  type="text"
                  value={reimbProjectRef}
                  onChange={(e) => setReimbProjectRef(e.target.value)}
                  placeholder={tr('Opsional, cth: PRJ-01', 'Optional, e.g. PRJ-01')}
                  className="w-full p-2.5 border border-slate-300 rounded-xl"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-600 font-medium mb-1">{tr('Catatan Tambahan (Remarks)', 'Additional Notes (Remarks)')}</label>
              <input
                type="text"
                value={reimbRemarks}
                onChange={(e) => setReimbRemarks(e.target.value)}
                placeholder={tr('Contoh: Ferry + Fuel Surcharge, Arround 175 SGD, dll.', 'Example: Ferry + Fuel Surcharge, Around 175 SGD, etc.')}
                className="w-full p-2.5 border border-slate-300 rounded-xl"
              />
            </div>

            <div>
              <label className="block text-slate-600 font-medium mb-1">{tr('Lampiran Foto Bukti / Struk', 'Proof / Receipt Photo Attachment')}</label>
              <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />

              {receiptPhoto ? (
                <div className="relative rounded-2xl overflow-hidden border border-slate-300 aspect-16/9 bg-slate-900">
                  <img src={receiptPhoto} alt={tr('Struk', 'Receipt')} className="w-full h-full object-contain" />
                  <button
                    type="button"
                    onClick={() => setReceiptPhoto(null)}
                    className="absolute top-2 right-2 bg-rose-600 hover:bg-rose-700 text-white text-[10px] px-2.5 py-1 rounded-lg font-bold shadow-md cursor-pointer"
                  >
                    {tr('Hapus Foto', 'Remove Photo')}
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setCameraOpen(true)}
                    className="py-3 px-2 border-2 border-dashed border-slate-300 hover:border-emerald-500 rounded-xl flex flex-col items-center justify-center gap-1 text-slate-700 font-medium cursor-pointer transition"
                  >
                    <Camera size={18} className="text-emerald-600" />
                    <span className="text-[11px]">{tr('Foto via Kamera', 'Photo via Camera')}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="py-3 px-2 border-2 border-dashed border-slate-300 hover:border-emerald-500 rounded-xl flex flex-col items-center justify-center gap-1 text-slate-700 font-medium cursor-pointer transition"
                  >
                    <Upload size={18} className="text-blue-600" />
                    <span className="text-[11px]">{tr('Unggah dari Galeri', 'Upload from Gallery')}</span>
                  </button>
                </div>
              )}
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-xs transition cursor-pointer text-xs"
            >
              {tr('Kirim Klaim Biaya', 'Submit Expense Claim')}
            </button>
          </form>
        </div>
      )}
            </>
          ) : (
            <>

      {/* REQUEST HISTORY LIST */}
      <div className="order-2 bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h3 className="font-bold text-xs uppercase text-slate-900">
              {tr('Riwayat Pengajuan', 'Request History')}
            </h3>
            <p className="text-[11px] text-slate-400">
              {loading
                ? tr('Memuat pengajuan...', 'Loading requests...')
                : tr(`${filteredHistory.length} dari ${history.length} pengajuan`, `${filteredHistory.length} of ${history.length} requests`)}
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setMsg(null);
              setShowForm(true);
            }}
            className="flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white transition hover:bg-slate-800 cursor-pointer"
          >
            <Plus size={14} />
            <span>{tr('Buat Pengajuan', 'New Request')}</span>
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {[
            { key: 'all', label: tr('Semua', 'All'), count: history.length },
            { key: 'pending', label: tr('Menunggu', 'Pending'), count: statusCounts.pending },
            { key: 'approved', label: tr('Disetujui', 'Approved'), count: statusCounts.approved },
            { key: 'paid', label: tr('Dibayar', 'Paid'), count: statusCounts.paid },
            { key: 'rejected', label: tr('Ditolak', 'Rejected'), count: statusCounts.rejected },
          ].map((filter) => (
            <button
              key={filter.key}
              type="button"
              onClick={() => setStatusFilter(filter.key as typeof statusFilter)}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold transition cursor-pointer ${
                statusFilter === filter.key
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span>{filter.label}</span>
              <span className={`rounded-full px-1.5 py-0.5 text-[9px] ${statusFilter === filter.key ? 'bg-white/20' : 'bg-white'}`}>
                {filter.count}
              </span>
            </button>
          ))}
        </div>

        {view === 'reimbursement' && (
          <div className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2">
            <span className="text-[11px] font-semibold text-slate-600">
              {tr('Periode Klaim', 'Claim Period')}
            </span>
            <div className="w-40">
              <MobileMonthPicker value={claimMonth} onChange={setClaimMonth} />
            </div>
          </div>
        )}

        {view === 'reimbursement' && (
          <p className="text-[10px] text-slate-400">
            {tr('Periode:', 'Period:')} {formatDate(claimPeriodStart)} – {formatDate(claimPeriodEnd)}
          </p>
        )}

        {view === 'reimbursement' && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={downloading || history.length === 0}
                onClick={handleDownloadExcel}
                className="flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer disabled:opacity-50"
                title={tr('Unduh Claim Sheet Excel sesuai template resmi', 'Download the Excel Claim Sheet using the official template')}
              >
                <FileSpreadsheet size={14} className="text-emerald-600 shrink-0" />
                <span>{tr('Claim Excel (.xlsx)', 'Claim Excel (.xlsx)')}</span>
              </button>

              <button
                type="button"
                disabled={downloading || history.filter((h) => h.status === 'approved').length === 0}
                onClick={handleDownloadPdf}
                className="flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-300 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer disabled:opacity-50"
                title={tr('Gabungkan seluruh bukti struk yang disetujui ke dalam satu file PDF', 'Combine all approved receipt proofs into a single PDF file')}
              >
                <FileDown size={14} className="text-blue-600 shrink-0" />
                <span>{tr('Struk PDF (Combined)', 'Receipt PDF (Combined)')}</span>
              </button>
            </div>
          )}

        {loading ? (
          <div className="space-y-2.5">
            {[0, 1, 2].map((index) => (
              <div key={index} className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 w-1/2 animate-pulse rounded bg-slate-200" />
                    <div className="h-3 w-3/4 animate-pulse rounded bg-slate-200" />
                  </div>
                  <div className="h-4 w-16 animate-pulse rounded bg-slate-200" />
                </div>
                <div className="mt-3 h-3 w-2/3 animate-pulse rounded bg-slate-200" />
              </div>
            ))}
          </div>
        ) : filteredHistory.length === 0 ? (
          <p className="text-center text-xs text-slate-400 py-6">
            {statusFilter === 'all'
              ? tr('Belum ada riwayat pengajuan.', 'No request history yet.')
              : tr('Tidak ada pengajuan dengan status ini.', 'No requests with this status.')}
          </p>
        ) : (
          <div className="space-y-2.5">
            {filteredHistory.map((h, idx) => (
              <div key={h.id} className="p-3.5 rounded-2xl border border-slate-200/80 bg-slate-50/70 space-y-2 text-xs">
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <div className="font-bold text-slate-900 text-sm break-words">
                      {h.leave_type_name || (h.amount ? formatCurrency(h.amount) : `${h.actual_hours || h.planned_hours} ${t.common.hours}`)}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5 break-words">
                      {h.start_date
                        ? `${formatDate(h.start_date)} - ${formatDate(h.end_date)} (${h.total_days} ${t.common.days})`
                        : formatDate(h.expense_date || h.date || h.created_at)}
                      {h.category && <span className="ml-2 font-medium text-slate-700 bg-slate-200 px-1.5 py-0.5 rounded text-[10px]">{h.category}</span>}
                    </div>
                  </div>
                  <div className="shrink-0">{statusBadge(h.status, h.payroll_run_id, h.payroll_run_title)}</div>
                </div>

                {h.description && (
                  <p className="text-xs text-slate-700 font-medium">{h.description}</p>
                )}

                {h.remarks && (
                  <p className="text-[11px] text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-100">
                    <span className="font-bold">{tr('Remarks:', 'Remarks:')}</span> {h.remarks}
                  </p>
                )}

                {h.cost_centre && (
                  <div className="text-[10px] text-slate-500">
                    {tr('Cost Centre:', 'Cost Centre:')} <span className="font-semibold text-slate-700">{h.cost_centre}</span>
                    {h.project_ref && <span> | {tr('Ref:', 'Ref:')} <span className="font-semibold text-slate-700">{h.project_ref}</span></span>}
                  </div>
                )}

                {h.reason && <p className="text-[11px] text-slate-600 italic">"{h.reason}"</p>}
                {h.attachment_key && (
                  <a
                    href={`/api/leave/requests/${h.id}/attachment?token=${getToken()}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 hover:underline"
                  >
                    {tr('Lihat Lampiran', 'View Attachment')}
                  </a>
                )}
                {h.rejection_note && <p className="text-[11px] text-rose-600 font-medium">{tr('Catatan Penolakan:', 'Rejection Note:')} {h.rejection_note}</p>}

                {h.has_receipt && h.receipt_url && (
                  <div className="pt-1 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPreviewModalImg(h.receipt_url)}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-200 cursor-pointer"
                    >
                      <Eye size={12} />
                      <span>{tr('Lihat Foto Struk', 'View Receipt Photo')}</span>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
            </>
          )}
        </div>
      )}

      {/* Image Preview Modal */}
      {previewModalImg && (
        <div
          onClick={() => setPreviewModalImg(null)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 cursor-pointer"
        >
          <div className="bg-white rounded-2xl max-w-lg w-full p-4 overflow-hidden shadow-2xl space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <h4 className="font-bold text-xs uppercase text-slate-800">{tr('Bukti Struk Pembayaran', 'Payment Receipt Proof')}</h4>
              <button
                type="button"
                onClick={() => setPreviewModalImg(null)}
                className="text-slate-400 hover:text-slate-700 font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto flex items-center justify-center bg-slate-950 rounded-xl p-2">
              <img
                src={previewModalImg}
                alt={tr('Bukti Struk', 'Receipt Proof')}
                className="max-h-[65vh] w-auto object-contain rounded"
              />
            </div>
            <button
              type="button"
              onClick={() => setPreviewModalImg(null)}
              className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-medium cursor-pointer"
            >
              {tr('Tutup', 'Close')}
            </button>
          </div>
        </div>
      )}

      <CameraModal
        isOpen={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(photo) => setReceiptPhoto(photo)}
        title={tr('Ambil Foto Nota / Struk', 'Take Receipt / Invoice Photo')}
        facingMode="environment"
      />
    </div>
  );
};
