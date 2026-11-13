import React, { useState, useEffect } from 'react';
import {
  DollarSign,
  Plus,
  RefreshCw,
  Lock,
  AlertTriangle,
  CheckCircle2,
  Archive,
  Download,
  Eye,
  Edit,
  Send,
  Trash2,
  Calendar,
  X,
  Users,
  TrendingUp,
  ChevronRight,
  ChevronLeft,
  Clock,
  FileSpreadsheet,
  AlertCircle,
  Search,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { apiFetch, downloadFile, getLocalDateString } from '../api';
import { TableSkeleton } from '../components/Skeleton';
import { PayslipModal } from '../components/PayslipModal';
import { MobileMonthPicker } from '../components/pickers/MobileMonthPicker';

export const HRPayroll: React.FC = () => {
  const { isOwnerAdmin, isFinance } = useAuth();
  const { t, tr, lang, formatCurrency, formatDate } = useLanguage();

  const statusLabel = (status?: string) => {
    switch (status) {
      case 'draft':
        return tr('Draf', 'Draft');
      case 'inputs_pulled':
        return tr('Input Ditarik', 'Inputs Pulled');
      case 'calculating':
        return tr('Menghitung', 'Calculating');
      case 'calculated':
        return tr('Sudah Dihitung', 'Calculated');
      case 'locked':
        return tr('Terkunci', 'Locked');
      case 'paid':
        return tr('Sudah Dibayar', 'Paid');
      default:
        return status || '';
    }
  };

  const statusPill = (status?: string) => {
    switch (status) {
      case 'paid':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'locked':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'calculated':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'draft':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const exceptionTypeLabel = (type?: string) => {
    switch (type) {
      case 'missing_attendance':
        return tr('Presensi Tidak Ditemukan', 'Missing Attendance');
      case 'unapproved_overtime':
        return tr('Lembur Belum Disetujui', 'Unapproved Overtime');
      case 'below_umk':
        return tr('Di Bawah UMK', 'Below UMK');
      case 'new_joiner':
        return tr('Karyawan Baru', 'New Joiner');
      case 'resignation':
        return tr('Resign', 'Resignation');
      case 'salary_change':
        return tr('Perubahan Gaji', 'Salary Change');
      default:
        return type || '';
    }
  };

  const resolutionOptionsFor = (type?: string) => {
    if (type === 'missing_attendance') {
      return [
        {
          code: 'attendance_completed',
          label: tr('Presensi sudah dilengkapi', 'Attendance completed'),
          desc: tr('Log presensi sudah diperbaiki atau ditambahkan di menu Presensi.', 'Attendance logs were fixed or added in the Attendance menu.'),
        },
        {
          code: 'approved_leave',
          label: tr('Cuti / izin disetujui', 'Approved leave'),
          desc: tr('Hari yang kosong adalah cuti atau izin yang sudah disetujui.', 'The missing day is approved leave or permission.'),
        },
        {
          code: 'alpha',
          label: tr('Alpa — potong otomatis', 'Alpha — deduct automatically'),
          desc: tr('Tidak ada alasan. Gaji dipotong 1 hari kerja pada perhitungan payroll.', 'No justification. One working day is deducted from payroll.'),
        },
        {
          code: 'accepted_as_is',
          label: tr('Diterima apa adanya', 'Accepted as is'),
          desc: tr('Selisih presensi diketahui dan diterima untuk periode ini.', 'The attendance gap is known and accepted for this period.'),
        },
      ];
    }
    if (type === 'unapproved_overtime') {
      return [
        {
          code: 'overtime_approved',
          label: tr('Lembur sudah disetujui', 'Overtime approved'),
          desc: tr('Pengajuan lembur sudah disetujui dan akan dihitung.', 'The overtime request is approved and will be counted.'),
        },
        {
          code: 'accepted_as_is',
          label: tr('Tidak dihitung', 'Not counted'),
          desc: tr('Lembur tidak dimasukkan ke payroll periode ini.', 'Overtime will not be included in this payroll period.'),
        },
      ];
    }
    if (type === 'below_umk') {
      return [
        {
          code: 'salary_adjusted',
          label: tr('Gaji sudah disesuaikan', 'Salary adjusted'),
          desc: tr('Gaji pokok sudah dinaikkan sesuai UMK cabang.', 'Base salary has been raised to the branch minimum wage.'),
        },
        {
          code: 'accepted_as_is',
          label: tr('Diterima di bawah UMK', 'Accepted below UMK'),
          desc: tr('Selisih UMK diketahui dan diterima untuk periode ini.', 'The minimum-wage gap is known and accepted for this period.'),
        },
      ];
    }
    return [
      {
        code: 'accepted_as_is',
        label: tr('Diterima apa adanya', 'Accepted as is'),
        desc: tr('Pengecualian diketahui dan tidak perlu tindakan lain.', 'The exception is known and needs no further action.'),
      },
      {
        code: 'other',
        label: tr('Lainnya', 'Other'),
        desc: tr('Tambahkan catatan untuk menjelaskan penyelesaiannya.', 'Add a note to explain the resolution.'),
      },
    ];
  };

  const resolutionLabel = (code?: string) => {
    switch (code) {
      case 'attendance_completed':
        return tr('Presensi dilengkapi', 'Attendance completed');
      case 'approved_leave':
        return tr('Cuti / izin', 'Approved leave');
      case 'overtime_approved':
        return tr('Lembur disetujui', 'Overtime approved');
      case 'salary_adjusted':
        return tr('Gaji disesuaikan', 'Salary adjusted');
      case 'accepted_as_is':
        return tr('Diterima apa adanya', 'Accepted as is');
      case 'alpha':
        return tr('Alpa (dipotong)', 'Alpha (deducted)');
      case 'other':
        return tr('Lainnya', 'Other');
      default:
        return '';
    }
  };

  const [runs, setRuns] = useState<any[]>([]);
  const [selectedRun, setSelectedRun] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [exceptions, setExceptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Modals
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [showThrModal, setShowThrModal] = useState(false);
  const [thrPaymentDate, setThrPaymentDate] = useState(getLocalDateString());
  const [creatingThr, setCreatingThr] = useState(false);
  const [periodStart, setPeriodStart] = useState('2026-09-25');
  const [periodEnd, setPeriodEnd] = useState('2026-10-25');
  const [paymentDate, setPaymentDate] = useState('2026-10-25');
  const [periodMonth, setPeriodMonth] = useState('2026-10');
  const [runTitle, setRunTitle] = useState(tr('Gaji Periode Oktober 2026', 'October 2026 Payroll Period'));

  const handlePeriodMonthChange = (month: string) => {
    setPeriodMonth(month);
    const [yearStr, monthStr] = month.split('-');
    const year = Number(yearStr);
    const monthNumber = Number(monthStr);
    const prev = new Date(year, monthNumber - 2, 1);
    const prevMonth = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
    const label = new Date(year, monthNumber - 1, 1).toLocaleDateString(
      lang === 'id' ? 'id-ID' : 'en-US',
      { month: 'long', year: 'numeric' }
    );

    setPeriodStart(`${prevMonth}-25`);
    setPeriodEnd(`${month}-25`);
    setPaymentDate(`${month}-25`);
    setRunTitle(`${tr('Gaji Periode', 'Payroll Period')} ${label}`);
  };

  // Adjust item modal
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustItem, setAdjustItem] = useState<any>(null);
  const [attBonus, setAttBonus] = useState('0');
  const [commBonus, setCommBonus] = useState('0');
  const [otherDed, setOtherDed] = useState('0');
  const [otherReason, setOtherReason] = useState('');

  // Payslip detail modal
  const [selectedPayslip, setSelectedPayslip] = useState<any>(null);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Resolve exception modal
  const [resolveException, setResolveException] = useState<any>(null);
  const [resolutionCode, setResolutionCode] = useState('accepted_as_is');
  const [showExceptionCalendar, setShowExceptionCalendar] = useState(false);
  const [calendarEmployeeId, setCalendarEmployeeId] = useState<string>('all');
  const [selectedExceptionIds, setSelectedExceptionIds] = useState<string[]>([]);
  const [bulkResolving, setBulkResolving] = useState(false);
  const [bulkResolutionCode, setBulkResolutionCode] = useState('attendance_completed');
  const [resolutionNote, setResolutionNote] = useState('');

  const scrollTop = () => {
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const loadRuns = async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await apiFetch('/payroll/runs');
      setRuns(res.runs || []);
    } catch (err: any) {
      console.warn('Payroll runs err:', err.message);
    } finally {
      if (silent) setRefreshing(false);
      else setLoading(false);
    }
  };

  const loadRunData = async (run: any) => {
    try {
      const [recapRes, excRes] = await Promise.all([
        apiFetch(`/payroll/runs/${run.id}/recap`),
        apiFetch(`/payroll/runs/${run.id}/exceptions`),
      ]);
      setItems(recapRes.items || []);
      setExceptions(excRes.exceptions || []);
    } catch (err: any) {
      console.warn('Load run items err:', err.message);
    }
  };

  const selectRun = async (run: any) => {
    setSelectedRun(run);
    setView('detail');
    await loadRunData(run);
  };

  const openRun = (run: any) => {
    scrollTop();
    selectRun(run);
  };

  const backToList = () => {
    setView('list');
    setSelectedRun(null);
    setItems([]);
    setExceptions([]);
    scrollTop();
  };

  useEffect(() => {
    loadRuns();
  }, []);

  // Step 1: Open Period
  const handleOpenRun = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch('/payroll/runs', {
        method: 'POST',
        body: JSON.stringify({
          period_start: periodStart,
          period_end: periodEnd,
          payment_date: paymentDate,
          title: runTitle,
        }),
      });
      setMsg({ type: 'success', text: res.message });
      setShowOpenModal(false);
      const list = await apiFetch('/payroll/runs');
      const nextRuns = list.runs || [];
      setRuns(nextRuns);
      const created = nextRuns.find((run: any) => run.id === res.runId);
      if (created) openRun(created);
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    }
  };

  // Step 2: Pull Inputs
  const handlePullInputs = async () => {
    if (!selectedRun) return;
    try {
      const res = await apiFetch(`/payroll/runs/${selectedRun.id}/pull-inputs`, { method: 'POST' });
      setMsg({ type: 'success', text: res.message });
      selectRun({ ...selectedRun, status: 'calculated' });
      loadRuns(true);
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    }
  };

  // Step 3: Resolve Exception
  const openResolveException = (exc: any) => {
    setResolveException(exc);
    setResolutionCode(resolutionOptionsFor(exc.exception_type)[0].code);
    setResolutionNote('');
  };

  const handleResolveException = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!resolveException) return;
    try {
      await apiFetch(`/payroll/runs/${selectedRun.id}/exceptions/${resolveException.id}/resolve`, {
        method: 'POST',
        body: JSON.stringify({
          resolution_code: resolutionCode,
          resolution_note: resolutionNote || null,
        }),
      });
      setMsg({
        type: 'success',
        text: tr('Pengecualian berhasil diselesaikan.', 'Exception resolved successfully.'),
      });
      setResolveException(null);
      // Reload the run in place so the calendar (and its month grid) stays open.
      await loadRunData(selectedRun);
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    }
  };

  // Clear a stale multi-select whenever the calendar switches employee.
  const changeCalendarEmployee = (employeeId: string) => {
    setCalendarEmployeeId(employeeId);
    setSelectedExceptionIds([]);
  };

  const handleBulkResolve = async (employeeId: string) => {
    if (selectedExceptionIds.length === 0) return;
    setBulkResolving(true);
    try {
      const res = await apiFetch(`/payroll/runs/${selectedRun.id}/exceptions/bulk-resolve`, {
        method: 'POST',
        body: JSON.stringify({
          employee_id: employeeId,
          exception_ids: selectedExceptionIds,
          resolution_code: bulkResolutionCode,
        }),
      });
      setMsg({ type: 'success', text: res.message });
      setSelectedExceptionIds([]);
      await loadRunData(selectedRun);
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setBulkResolving(false);
    }
  };

  // Step 4: Adjust Item
  const handleSaveAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustItem || !selectedRun) return;
    try {
      const res = await apiFetch(`/payroll/runs/${selectedRun.id}/adjust-item`, {
        method: 'POST',
        body: JSON.stringify({
          item_id: adjustItem.id,
          attendance_bonus: attBonus,
          commission_bonus: commBonus,
          other_deductions: otherDed,
          other_deductions_reason: otherReason,
        }),
      });
      setMsg({ type: 'success', text: res.message });
      setShowAdjustModal(false);
      selectRun(selectedRun);
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    }
  };

  // Delete a period (from list or detail)
  const deleteRun = async (run: any) => {
    if (!run) return;
    const confirm = window.confirm(
      tr(
        `Hapus periode "${run.title}"? Semua item payroll dan pengecualian pada periode ini akan dihapus.`,
        `Delete period "${run.title}"? All payroll items and exceptions in this period will be removed.`
      )
    );
    if (!confirm) return;

    try {
      const res = await apiFetch(`/payroll/runs/${run.id}`, { method: 'DELETE' });
      setMsg({ type: 'success', text: res.message });
      if (selectedRun?.id === run.id) {
        setSelectedRun(null);
        setItems([]);
        setExceptions([]);
        setView('list');
      }
      const list = await apiFetch('/payroll/runs');
      setRuns(list.runs || []);
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    }
  };

  // Step 5: Lock Run
  const handleLockRun = async () => {
    if (!selectedRun) return;
    const confirm = window.confirm(
      tr(
        'Apakah Anda yakin ingin mengunci periode penggajian ini? Payroll yang sudah dikunci TIDAK DAPAT diubah lagi.',
        'Are you sure you want to lock this payroll period? A locked payroll CANNOT be changed anymore.'
      )
    );
    if (!confirm) return;

    try {
      const res = await apiFetch(`/payroll/runs/${selectedRun.id}/lock`, { method: 'POST' });
      setMsg({ type: 'success', text: res.message });
      selectRun({ ...selectedRun, status: 'locked' });
      loadRuns(true);
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    }
  };

  // Step 6: Finance Pays & Sends Email
  const handlePayRun = async () => {
    if (!selectedRun) return;
    const confirm = window.confirm(
      tr(
        'Konfirmasi pembayaran gaji? Sistem akan mengirimkan notifikasi slip gaji otomatis via email ke seluruh karyawan.',
        'Confirm salary payment? The system will automatically email payslip notifications to all employees.'
      )
    );
    if (!confirm) return;

    try {
      const res = await apiFetch(`/payroll/runs/${selectedRun.id}/pay`, { method: 'POST' });
      setMsg({ type: 'success', text: res.message });
      selectRun({ ...selectedRun, status: 'paid' });
      loadRuns(true);
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    }
  };

  const handleCreateThr = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreatingThr(true);
    setMsg(null);
    try {
      const res = await apiFetch('/payroll/runs/thr', {
        method: 'POST',
        body: JSON.stringify({ payment_date: thrPaymentDate }),
      });
      setMsg({ type: 'success', text: res.message });
      setShowThrModal(false);
      const runsRes = await apiFetch('/payroll/runs');
      setRuns(runsRes.runs || []);
      const created = (runsRes.runs || []).find((run: any) => run.id === res.runId);
      if (created) openRun(created);
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setCreatingThr(false);
    }
  };

  const downloadBankFile = async (format: 'BCA' | 'MANDIRI') => {
    if (!selectedRun) return;
    try {
      const filename = `${format === 'BCA' ? 'KlikBCA' : 'Mandiri_MCM'}_${selectedRun.period_end || 'export'}.csv`;
      await downloadFile(`/payroll/runs/${selectedRun.id}/bank-file?format=${format}`, filename);
    } catch (err: any) {
      alert(err.message || tr('Gagal mengunduh file bank transfer', 'Failed to download bank transfer file'));
    }
  };

  const handleExportClaimZip = async () => {
    if (!selectedRun) return;
    const month = (selectedRun.period_end || selectedRun.period_start || '').slice(0, 7);
    try {
      await downloadFile(
        `/kasbon/claims/export-all-zip?month=${month}&include_salary=true&salary_only=true`,
        `Claim_Expenses_All_Employees_${month}.zip`
      );
    } catch (err: any) {
      alert(
        err.message ||
          tr('Gagal mengunduh ZIP Claim Sheet Karyawan', 'Failed to download the Employee Claim Sheet ZIP')
      );
    }
  };

  const isLocked = selectedRun?.status === 'locked' || selectedRun?.status === 'paid';
  const isPaid = selectedRun?.status === 'paid';
  const unresolvedExceptions = exceptions.filter((e) => !e.resolved).length;

  const initials = (name?: string) =>
    (name || '?')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0])
      .join('')
      .toUpperCase();

  const filteredRuns = runs.filter((run) => {
    const matchesStatus = statusFilter === 'all' || run.status === statusFilter;
    const matchesSearch =
      !search.trim() || String(run.title || '').toLowerCase().includes(search.trim().toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const statusFilters = [
    { key: 'all', label: tr('Semua', 'All'), count: runs.length },
    { key: 'draft', label: tr('Draf', 'Draft'), count: runs.filter((r) => r.status === 'draft').length },
    {
      key: 'calculated',
      label: tr('Dihitung', 'Calculated'),
      count: runs.filter((r) => r.status === 'calculated').length,
    },
    { key: 'locked', label: tr('Terkunci', 'Locked'), count: runs.filter((r) => r.status === 'locked').length },
    { key: 'paid', label: tr('Dibayar', 'Paid'), count: runs.filter((r) => r.status === 'paid').length },
  ];

  const steps = [
    { n: 1, label: tr('Buka Periode', 'Open Period'), done: !!selectedRun, warn: false },
    { n: 2, label: tr('Tarik & Hitung', 'Pull & Calculate'), done: items.length > 0, warn: false },
    {
      n: 3,
      label: tr('Pengecualian', 'Exceptions'),
      done: items.length > 0 && (unresolvedExceptions === 0 || isLocked),
      warn: !isLocked && unresolvedExceptions > 0,
    },
    { n: 4, label: tr('Kunci', 'Lock'), done: isLocked, warn: false },
    { n: 5, label: tr('Bayar', 'Pay'), done: isPaid, warn: false },
  ];
  const currentStepIndex = steps.findIndex((step) => !step.done);

  const nextAction = (() => {
    if (!selectedRun) return null;
    if (isPaid) {
      return {
        tone: 'emerald' as const,
        icon: CheckCircle2,
        title: tr('Payroll selesai', 'Payroll completed'),
        desc: tr(
          'Slip gaji sudah dirilis ke seluruh karyawan pada periode ini.',
          'Payslips have been released to all employees for this period.'
        ),
        label: null as string | null,
        onClick: undefined as (() => void) | undefined,
        disabled: false,
      };
    }
    if (isLocked) {
      return {
        tone: 'emerald' as const,
        icon: Send,
        title: tr('Siap dibayar', 'Ready for payment'),
        desc: tr(
          'Periode sudah terkunci. Konfirmasi pembayaran untuk merilis slip gaji.',
          'The period is locked. Confirm payment to release payslips.'
        ),
        label: tr('Konfirmasi Pembayaran', 'Confirm Payment'),
        onClick: handlePayRun,
        disabled: !(isOwnerAdmin || isFinance),
      };
    }
    if (items.length === 0) {
      return {
        tone: 'blue' as const,
        icon: RefreshCw,
        title: tr('Tarik data penggajian', 'Pull payroll inputs'),
        desc: tr(
          'Tarik presensi, lembur, kasbon, dan klaim yang disetujui untuk periode ini.',
          'Pull attendance, overtime, advances, and approved claims for this period.'
        ),
        label: tr('Tarik & Hitung', 'Pull & Calculate'),
        onClick: handlePullInputs,
        disabled: !isOwnerAdmin,
      };
    }
    return {
      tone: 'purple' as const,
      icon: Lock,
      title:
        unresolvedExceptions > 0
          ? tr(`${unresolvedExceptions} pengecualian belum selesai`, `${unresolvedExceptions} unresolved exceptions`)
          : tr('Siap dikunci', 'Ready to lock'),
      desc:
        unresolvedExceptions > 0
          ? tr(
              'Anda tetap bisa mengunci, tetapi tinjau peringatan di bawah terlebih dahulu.',
              'You can still lock, but review the warnings below first.'
            )
          : tr(
              'Tinjau perhitungan lalu kunci periode agar tidak bisa diubah lagi.',
              'Review the calculations, then lock the period to make it immutable.'
            ),
      label: tr('Kunci Payroll Run', 'Lock Payroll Run'),
      onClick: handleLockRun,
      disabled: !isOwnerAdmin,
    };
  })();

  const toneShell = {
    blue: 'border-blue-200 bg-blue-50/60',
    purple: 'border-purple-200 bg-purple-50/60',
    emerald: 'border-emerald-200 bg-emerald-50/60',
  };
  const toneTile = {
    blue: 'bg-blue-100 text-blue-700',
    purple: 'bg-purple-100 text-purple-700',
    emerald: 'bg-emerald-100 text-emerald-700',
  };
  const toneButton = {
    blue: 'bg-blue-600 hover:bg-blue-700',
    purple: 'bg-purple-600 hover:bg-purple-700',
    emerald: 'bg-emerald-600 hover:bg-emerald-700',
  };

  const netRatio =
    selectedRun?.total_gross > 0
      ? Math.max(0, Math.min(100, Math.round((selectedRun.total_take_home / selectedRun.total_gross) * 100)))
      : 0;

  const metrics = selectedRun
    ? [
        {
          label: tr('Karyawan', 'Employees'),
          value: String(items.length),
          sub: tr('dalam run ini', 'in this run'),
          icon: Users,
          valueClass: 'text-slate-900',
          iconClass: 'bg-slate-100 text-slate-600',
        },
        {
          label: t.payroll.grossEarnings,
          value: formatCurrency(selectedRun.total_gross),
          sub: tr('sebelum potongan', 'before deductions'),
          icon: TrendingUp,
          valueClass: 'text-slate-900',
          iconClass: 'bg-emerald-50 text-emerald-600',
        },
        {
          label: t.payroll.totalDeductions,
          value: formatCurrency(selectedRun.total_deductions),
          sub: tr('BPJS, PPh 21, kasbon', 'BPJS, PPh 21, advances'),
          icon: AlertCircle,
          valueClass: 'text-rose-600',
          iconClass: 'bg-rose-50 text-rose-600',
        },
        {
          label: t.payroll.takeHomePay,
          value: formatCurrency(selectedRun.total_take_home),
          sub: tr('Beban perusahaan', 'Employer cost') + `: ${formatCurrency(selectedRun.total_employer_cost)}`,
          icon: DollarSign,
          valueClass: 'text-blue-700',
          iconClass: 'bg-blue-50 text-blue-600',
        },
      ]
    : [];

  return (
    <div className="space-y-6">
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
          <button onClick={() => setMsg(null)} className="cursor-pointer font-bold">✕</button>
        </div>
      )}

      {view === 'list' || !selectedRun ? (
        /* ============================= LIST ============================= */
        <>
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-900">{t.payroll.title}</h1>
              <p className="text-xs text-slate-500">{t.payroll.subtitle}</p>
            </div>
            {isOwnerAdmin && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => {
                    setPeriodMonth(periodEnd.slice(0, 7));
                    setShowOpenModal(true);
                  }}
                  className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-md transition hover:bg-blue-700"
                >
                  <Plus size={16} />
                  <span>{t.payroll.openPeriod}</span>
                </button>
                <button
                  onClick={() => setShowThrModal(true)}
                  className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 shadow-2xs transition hover:bg-slate-50"
                >
                  <Plus size={16} />
                  <span>{tr('Proses THR', 'Process THR')}</span>
                </button>
              </div>
            )}
          </div>

          <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-2xs">
            {/* Toolbar */}
            <div className="flex flex-col gap-3 border-b border-slate-100 p-4 md:p-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="relative w-full md:max-w-xs">
                  <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={tr('Cari periode...', 'Search period...')}
                    className="w-full rounded-xl border border-slate-300 py-2 pl-9 pr-3 text-xs font-medium outline-none focus:border-blue-400"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-slate-500">
                    {filteredRuns.length} {tr('dari', 'of')} {runs.length} {tr('periode', 'periods')}
                  </span>
                  <button
                    onClick={() => loadRuns(true)}
                    disabled={refreshing}
                    title={tr('Muat ulang', 'Refresh')}
                    className="rounded-xl border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
                  >
                    <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {statusFilters.map((filter) => (
                  <button
                    key={filter.key}
                    type="button"
                    onClick={() => setStatusFilter(filter.key)}
                    className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[10px] font-bold transition ${
                      statusFilter === filter.key
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <span>{filter.label}</span>
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[9px] ${
                        statusFilter === filter.key ? 'bg-white/20' : 'bg-white'
                      }`}
                    >
                      {filter.count}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <TableSkeleton rows={6} columns={8} />
                </table>
              </div>
            ) : runs.length === 0 ? (
              <div className="p-10 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-blue-50 text-blue-600">
                  <DollarSign size={28} />
                </div>
                <h3 className="mt-4 text-lg font-black text-slate-900">
                  {tr('Belum ada periode payroll', 'No payroll period yet')}
                </h3>
                <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">
                  {tr(
                    'Buka periode pertama untuk menarik presensi, lembur, kasbon, dan klaim yang disetujui.',
                    'Open your first period to pull attendance, overtime, advances, and approved claims.'
                  )}
                </p>
                {isOwnerAdmin && (
                  <button
                    onClick={() => setShowOpenModal(true)}
                    className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white shadow-md transition hover:bg-blue-700"
                  >
                    <Plus size={16} />
                    {t.payroll.openPeriod}
                  </button>
                )}
              </div>
            ) : filteredRuns.length === 0 ? (
              <div className="p-10 text-center text-xs text-slate-400">
                {tr('Tidak ada periode yang cocok dengan filter.', 'No periods match the current filter.')}
              </div>
            ) : (
              <>
                {/* Desktop table */}
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full text-left text-xs text-slate-600">
                    <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="px-5 py-3 font-bold">{tr('Periode', 'Period')}</th>
                        <th className="px-3 py-3 font-bold">{tr('Tanggal Periode', 'Period Dates')}</th>
                        <th className="px-3 py-3 font-bold">{tr('Tanggal Bayar', 'Payment Date')}</th>
                        <th className="px-3 py-3 text-center font-bold">{tr('Karyawan', 'Employees')}</th>
                        <th className="px-3 py-3 text-right font-bold">{t.payroll.grossEarnings}</th>
                        <th className="px-3 py-3 text-right font-bold text-blue-700">{t.payroll.takeHomePay}</th>
                        <th className="px-3 py-3 text-center font-bold">{tr('Status', 'Status')}</th>
                        <th className="px-5 py-3 text-right font-bold">{t.common.action}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {refreshing ? (
                        Array.from({ length: 4 }).map((_, index) => (
                          <tr key={`skeleton-${index}`} className="animate-pulse">
                            <td className="px-5 py-3"><div className="h-3 w-32 rounded bg-slate-200" /></td>
                            <td className="px-3 py-3"><div className="h-3 w-28 rounded bg-slate-100" /></td>
                            <td className="px-3 py-3"><div className="h-3 w-20 rounded bg-slate-100" /></td>
                            <td className="px-3 py-3"><div className="mx-auto h-3 w-8 rounded bg-slate-100" /></td>
                            <td className="px-3 py-3"><div className="ml-auto h-3 w-24 rounded bg-slate-100" /></td>
                            <td className="px-3 py-3"><div className="ml-auto h-3 w-24 rounded bg-slate-200" /></td>
                            <td className="px-3 py-3"><div className="mx-auto h-5 w-16 rounded-full bg-slate-100" /></td>
                            <td className="px-5 py-3"><div className="ml-auto h-6 w-14 rounded bg-slate-100" /></td>
                          </tr>
                        ))
                      ) : (
                        filteredRuns.map((run) => (
                        <tr
                          key={run.id}
                          onClick={() => openRun(run)}
                          className="cursor-pointer transition hover:bg-slate-50/80"
                        >
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900">{run.title}</span>
                              {run.run_type === 'thr' && (
                                <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-emerald-700">
                                  THR
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-slate-600">
                            {formatDate(run.period_start)} → {formatDate(run.period_end)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-slate-600">{formatDate(run.payment_date)}</td>
                          <td className="px-3 py-3 text-center font-semibold text-slate-700">
                            {run.employee_count || 0}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-slate-700">
                            {formatCurrency(run.total_gross)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-right font-black tabular-nums text-blue-700">
                            {formatCurrency(run.total_take_home)}
                          </td>
                          <td className="px-3 py-3 text-center">
                            <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold ${statusPill(run.status)}`}>
                              {statusLabel(run.status)}
                            </span>
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openRun(run);
                                }}
                                className="rounded-lg bg-blue-50 p-1.5 text-blue-600 transition hover:bg-blue-100"
                                title={tr('Buka periode', 'Open period')}
                              >
                                <ChevronRight size={15} />
                              </button>
                              {isOwnerAdmin && run.status !== 'locked' && run.status !== 'paid' && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deleteRun(run);
                                  }}
                                  className="rounded-lg bg-rose-50 p-1.5 text-rose-600 transition hover:bg-rose-100"
                                  title={tr('Hapus periode', 'Delete period')}
                                >
                                  <Trash2 size={15} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Mobile cards */}
                <div className="divide-y divide-slate-100 md:hidden">
                  {refreshing ? (
                    Array.from({ length: 3 }).map((_, index) => (
                      <div key={`skeleton-mobile-${index}`} className="animate-pulse space-y-2 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1.5">
                            <div className="h-3 w-40 rounded bg-slate-200" />
                            <div className="h-2.5 w-28 rounded bg-slate-100" />
                          </div>
                          <div className="h-5 w-16 rounded-full bg-slate-100" />
                        </div>
                        <div className="h-12 rounded-xl bg-slate-50" />
                        <div className="h-8 rounded-xl bg-slate-100" />
                      </div>
                    ))
                  ) : (
                    filteredRuns.map((run) => (
                    <div key={run.id} onClick={() => openRun(run)} className="cursor-pointer space-y-2 p-4 active:bg-slate-50">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-black text-slate-900">{run.title}</span>
                            {run.run_type === 'thr' && (
                              <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-emerald-700">
                                THR
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 text-[11px] text-slate-500">
                            {formatDate(run.period_start)} → {formatDate(run.period_end)}
                          </div>
                        </div>
                        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold ${statusPill(run.status)}`}>
                          {statusLabel(run.status)}
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-2.5 text-[10px]">
                        <div>
                          <div className="font-semibold text-slate-400">{tr('Karyawan', 'Employees')}</div>
                          <div className="mt-0.5 font-bold text-slate-800">{run.employee_count || 0}</div>
                        </div>
                        <div>
                          <div className="font-semibold text-slate-400">{t.payroll.grossEarnings}</div>
                          <div className="mt-0.5 truncate font-bold tabular-nums text-slate-800">
                            {formatCurrency(run.total_gross)}
                          </div>
                        </div>
                        <div>
                          <div className="font-semibold text-slate-400">{tr('Bersih', 'Net')}</div>
                          <div className="mt-0.5 truncate font-bold tabular-nums text-blue-700">
                            {formatCurrency(run.total_take_home)}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-blue-50 px-3 py-2 text-[11px] font-bold text-blue-700">
                          <ChevronRight size={13} />
                          {tr('Buka Periode', 'Open Period')}
                        </button>
                        {isOwnerAdmin && run.status !== 'locked' && run.status !== 'paid' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteRun(run);
                            }}
                            className="rounded-xl bg-rose-50 px-3 py-2 text-rose-600"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        </>
      ) : (
        /* ============================= DETAIL ============================= */
        <>
          <div>
            <button
              onClick={backToList}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 transition hover:text-slate-900"
            >
              <ChevronLeft size={15} />
              {tr('Kembali ke Daftar Payroll', 'Back to Payroll List')}
            </button>

            <div className="mt-3 flex flex-col justify-between gap-4 rounded-3xl border border-slate-200/80 bg-white p-5 shadow-2xs lg:flex-row lg:items-center">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                  <Calendar size={20} />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="truncate text-lg font-black tracking-tight text-slate-900">{selectedRun.title}</h1>
                    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${statusPill(selectedRun.status)}`}>
                      {statusLabel(selectedRun.status)}
                    </span>
                    {selectedRun.run_type === 'thr' && (
                      <span className="rounded bg-emerald-100 px-2 py-0.5 text-[9px] font-bold uppercase text-emerald-700">
                        THR
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <Calendar size={12} />
                      {formatDate(selectedRun.period_start)} → {formatDate(selectedRun.period_end)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Clock size={12} />
                      {tr('Bayar', 'Pay')} {formatDate(selectedRun.payment_date)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Users size={12} />
                      {items.length} {tr('karyawan', 'employees')}
                    </span>
                  </div>
                </div>
              </div>

              {!isLocked && isOwnerAdmin && (
                <button
                  onClick={() => deleteRun(selectedRun)}
                  className="flex shrink-0 items-center gap-1.5 self-start rounded-xl px-3 py-2 text-xs font-bold text-rose-600 transition hover:bg-rose-50"
                >
                  <Trash2 size={14} />
                  {tr('Hapus Periode', 'Delete Period')}
                </button>
              )}
            </div>
          </div>

          {/* WORKFLOW + NEXT ACTION */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-2xs lg:col-span-2">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">{tr('Alur Payroll', 'Payroll Workflow')}</h3>
                  <p className="text-[11px] text-slate-500">
                    {tr('Klik langkah demi langkah sampai periode dibayar.', 'Move step by step until the period is paid.')}
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold text-slate-600">
                  {tr('Langkah', 'Step')} {currentStepIndex === -1 ? steps.length : currentStepIndex + 1}/{steps.length}
                </span>
              </div>

              <div className="flex min-w-0 items-start gap-1 overflow-x-auto pb-1">
                {steps.map((step, index) => {
                  const isCurrent = index === currentStepIndex;
                  return (
                    <React.Fragment key={step.n}>
                      {index > 0 && (
                        <div
                          className={`mt-4 h-0.5 min-w-4 flex-1 rounded-full ${
                            steps[index - 1].done ? 'bg-emerald-400' : 'bg-slate-200'
                          }`}
                        />
                      )}
                      <div className="flex w-20 shrink-0 flex-col items-center gap-1.5 text-center">
                        <div
                          className={`flex h-9 w-9 items-center justify-center rounded-full border text-xs font-black ${
                            step.done
                              ? 'border-emerald-200 bg-emerald-500 text-white'
                              : step.warn
                              ? 'border-amber-200 bg-amber-100 text-amber-700'
                              : isCurrent
                              ? 'border-blue-200 bg-blue-600 text-white ring-4 ring-blue-100'
                              : 'border-slate-200 bg-slate-100 text-slate-400'
                          }`}
                        >
                          {step.done ? <CheckCircle2 size={16} /> : step.warn ? <AlertTriangle size={16} /> : step.n}
                        </div>
                        <span
                          className={`text-[10px] font-bold leading-tight ${
                            step.done ? 'text-emerald-700' : step.warn ? 'text-amber-700' : isCurrent ? 'text-blue-700' : 'text-slate-400'
                          }`}
                        >
                          {step.label}
                        </span>
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
                {!isLocked && isOwnerAdmin && (
                  <>
                    <button
                      onClick={handlePullInputs}
                      className="flex items-center gap-1.5 rounded-xl bg-blue-50 px-3.5 py-2 text-xs font-bold text-blue-700 transition hover:bg-blue-100"
                    >
                      <RefreshCw size={14} />
                      <span>{items.length > 0 ? tr('Tarik Ulang Input', 'Re-pull Inputs') : tr('Tarik Data Input', 'Pull Inputs')}</span>
                    </button>
                    <button
                      onClick={handleLockRun}
                      disabled={items.length === 0}
                      className="flex items-center gap-1.5 rounded-xl bg-purple-600 px-3.5 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-purple-700 disabled:opacity-40"
                    >
                      <Lock size={14} />
                      <span>{tr('Kunci Periode', 'Lock Period')}</span>
                    </button>
                    <button
                      onClick={() => deleteRun(selectedRun)}
                      className="ml-auto flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-rose-600 transition hover:bg-rose-50"
                    >
                      <Trash2 size={14} />
                      <span>{tr('Hapus', 'Delete')}</span>
                    </button>
                  </>
                )}
                {isLocked && (
                  <span className="flex items-center gap-1.5 rounded-xl bg-purple-50 px-3 py-2 text-xs font-bold text-purple-700">
                    <Lock size={14} />
                    {tr('Periode terkunci permanen', 'Period permanently locked')}
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-4">
              {nextAction && (
                <div className={`rounded-3xl border p-5 shadow-2xs ${toneShell[nextAction.tone]}`}>
                  <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${toneTile[nextAction.tone]}`}>
                    <nextAction.icon size={20} />
                  </div>
                  <h3 className="mt-3 text-sm font-black text-slate-900">{nextAction.title}</h3>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-600">{nextAction.desc}</p>
                  {nextAction.label && (
                    <button
                      onClick={nextAction.onClick}
                      disabled={nextAction.disabled}
                      className={`mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-bold text-white shadow-md transition disabled:opacity-40 ${toneButton[nextAction.tone]}`}
                    >
                      <nextAction.icon size={15} />
                      <span>{nextAction.label}</span>
                    </button>
                  )}
                </div>
              )}

              <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-2xs">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">{tr('Unduhan & Ekspor', 'Downloads & Exports')}</h3>
                    <p className="text-[11px] text-slate-500">
                      {tr('File transfer bank & claim', 'Bank transfer & claim files')}
                    </p>
                  </div>
                  <FileSpreadsheet size={18} className="text-slate-300" />
                </div>

                <div className="mt-3 space-y-2">
                  <button
                    type="button"
                    onClick={() => downloadBankFile('BCA')}
                    disabled={items.length === 0}
                    className="flex w-full items-center gap-2 rounded-xl bg-slate-50 px-3.5 py-2.5 text-left text-xs font-semibold text-slate-800 transition hover:bg-slate-100 disabled:opacity-40"
                  >
                    <Download size={14} className="text-slate-500" />
                    <span className="flex-1">BCA (KlikBCA)</span>
                    <ChevronRight size={14} className="text-slate-400" />
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadBankFile('MANDIRI')}
                    disabled={items.length === 0}
                    className="flex w-full items-center gap-2 rounded-xl bg-slate-50 px-3.5 py-2.5 text-left text-xs font-semibold text-slate-800 transition hover:bg-slate-100 disabled:opacity-40"
                  >
                    <Download size={14} className="text-slate-500" />
                    <span className="flex-1">Mandiri (MCM)</span>
                    <ChevronRight size={14} className="text-slate-400" />
                  </button>
                  <button
                    type="button"
                    onClick={handleExportClaimZip}
                    disabled={items.length === 0}
                    className="flex w-full items-center gap-2 rounded-xl bg-emerald-600 px-3.5 py-2.5 text-left text-xs font-bold text-white shadow-xs transition hover:bg-emerald-700 disabled:opacity-40"
                  >
                    <Archive size={14} />
                    <span className="flex-1">{tr('Semua Claim (ZIP)', 'All Claims (ZIP)')}</span>
                    <ChevronRight size={14} className="text-emerald-100" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* METRICS */}
          {selectedRun && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {metrics.map((metric) => (
                <div key={metric.label} className="rounded-3xl border border-slate-200/80 bg-white p-4 shadow-2xs">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[11px] font-semibold text-slate-400">{metric.label}</span>
                    <span className={`flex h-8 w-8 items-center justify-center rounded-xl ${metric.iconClass}`}>
                      <metric.icon size={15} />
                    </span>
                  </div>
                  <div className={`mt-2 truncate text-lg font-black tabular-nums md:text-xl ${metric.valueClass}`}>
                    {metric.value}
                  </div>
                  <div className="mt-0.5 truncate text-[10px] text-slate-400">{metric.sub}</div>
                  {metric.label === t.payroll.takeHomePay && (
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-blue-100">
                      <div className="h-full rounded-full bg-blue-600" style={{ width: `${netRatio}%` }} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* EXCEPTIONS */}
          {exceptions.length > 0 && (
            <div className="rounded-3xl border border-amber-300 bg-amber-50 p-5 shadow-2xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-bold text-amber-900">
                  <AlertTriangle size={18} className="text-amber-600" />
                  <span>{tr('Pengecualian Payroll', 'Payroll Exceptions')}</span>
                  <span className="rounded-full bg-amber-200/70 px-2 py-0.5 text-[10px] font-black text-amber-900">
                    {exceptions.length}
                  </span>
                </div>
                <span className="text-[11px] font-semibold text-amber-700">
                  {tr(
                    `${exceptions.length - unresolvedExceptions} dari ${exceptions.length} diselesaikan`,
                    `${exceptions.length - unresolvedExceptions} of ${exceptions.length} resolved`
                  )}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
                {Array.from(
                  exceptions.reduce((map, exc) => {
                    const key = exc.employee_id || exc.full_name;
                    const entry = map.get(key) || {
                      employeeId: exc.employee_id || exc.full_name,
                      fullName: exc.full_name,
                      total: 0,
                      resolved: 0,
                      openDates: [] as string[],
                    };
                    entry.total += 1;
                    if (exc.resolved) entry.resolved += 1;
                    else if (exc.exception_date) entry.openDates.push(exc.exception_date);
                    map.set(key, entry);
                    return map;
                  }, new Map<string, { employeeId: string; fullName: string; total: number; resolved: number; openDates: string[] }>())
                ).map(([key, summary]) => {
                  const open = summary.total - summary.resolved;
                  const pct = summary.total > 0 ? Math.round((summary.resolved / summary.total) * 100) : 0;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        setCalendarEmployeeId(summary.employeeId);
                        setShowExceptionCalendar(true);
                      }}
                      className="rounded-2xl border border-amber-200 bg-white p-3 text-left transition hover:border-amber-400 hover:bg-amber-50/40"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-xs font-bold text-slate-900">{summary.fullName}</div>
                          <div className="text-[10px] text-slate-500">
                            {open > 0
                              ? tr(`${open} hari belum diselesaikan`, `${open} days unresolved`)
                              : tr('Semua diselesaikan', 'All resolved')}
                          </div>
                        </div>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${
                          open === 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {summary.resolved}/{summary.total}
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-amber-100">
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                      </div>
                    </button>
                  );
                })}
              </div>

              {!isLocked && unresolvedExceptions > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setCalendarEmployeeId('all');
                    setShowExceptionCalendar(true);
                  }}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-amber-700"
                >
                  <Calendar size={14} />
                  {tr('Buka Kalender Presensi', 'Open Attendance Calendar')}
                </button>
              )}
            </div>
          )}

          {/* EMPLOYEES */}
          <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 p-5">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {tr('Rincian Karyawan', 'Employee Details')} <span className="text-slate-400">({items.length})</span>
                </h3>
                <p className="text-[11px] text-slate-500">
                  {tr('Klik ikon mata untuk melihat slip gaji resmi.', 'Click the eye icon to view the official payslip.')}
                </p>
              </div>
              {unresolvedExceptions > 0 && (
                <span className="rounded-full bg-amber-100 px-3 py-1 text-[10px] font-bold text-amber-800">
                  {unresolvedExceptions} {tr('perlu ditinjau', 'need review')}
                </span>
              )}
            </div>

            {items.length === 0 ? (
              <div className="p-10 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                  <Users size={22} />
                </div>
                <p className="mt-3 text-xs font-semibold text-slate-600">
                  {tr('Belum ada data karyawan pada periode ini.', 'No employee data in this period yet.')}
                </p>
                <p className="text-[11px] text-slate-400">
                  {tr('Tarik data input untuk mulai menghitung.', 'Pull inputs to start calculating.')}
                </p>
              </div>
            ) : (
              <>
                {/* Desktop table */}
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full text-left text-xs text-slate-600">
                    <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="px-5 py-3 font-bold">{tr('Karyawan', 'Employee')}</th>
                        <th className="px-3 py-3 text-center font-bold">PTKP</th>
                        <th className="px-3 py-3 text-center font-bold">{tr('Hari', 'Days')}</th>
                        <th className="px-3 py-3 text-right font-bold">{tr('Gaji Pokok', 'Base Salary')}</th>
                        <th className="px-3 py-3 text-right font-bold">{t.payroll.grossEarnings}</th>
                        <th className="px-3 py-3 text-right font-bold">{t.payroll.totalDeductions}</th>
                        <th className="px-3 py-3 text-right font-bold text-blue-700">{t.payroll.takeHomePay}</th>
                        <th className="px-5 py-3 text-right font-bold">{t.common.action}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {items.map((it) => (
                        <tr key={it.id} className="transition hover:bg-slate-50/80">
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2.5">
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-black text-slate-600">
                                {initials(it.employee_name)}
                              </span>
                              <div className="min-w-0">
                                <div className="truncate font-bold text-slate-900">{it.employee_name}</div>
                                <div className="truncate text-[10px] text-slate-400">{it.job_title}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3 text-center font-semibold text-slate-700">{it.ptkp_status}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-center font-medium text-slate-600">
                            <div>
                              {it.days_worked} / {it.expected_working_days}
                            </div>
                            {Number(it.alpha_days) > 0 && (
                              <div className="mt-0.5 inline-flex rounded bg-rose-100 px-1.5 py-0.5 text-[9px] font-bold text-rose-700">
                                {tr('Alpa', 'Alpha')} {Math.min(Number(it.alpha_days), Number(it.expected_working_days) || Number(it.alpha_days))}
                              </div>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-slate-700">
                            {formatCurrency(it.base_salary)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-right font-bold tabular-nums text-slate-900">
                            {formatCurrency(it.gross_earnings)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-rose-600">
                            <div>{formatCurrency(it.total_deductions)}</div>
                            {Number(it.alpha_deduction) > 0 && (
                              <div className="text-[9px] font-semibold text-rose-500">
                                {tr('alpa', 'alpha')} {formatCurrency(it.alpha_deduction)}
                              </div>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-right text-sm font-black tabular-nums text-blue-700">
                            {formatCurrency(it.take_home_pay)}
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={async () => {
                                  const res = await apiFetch(`/payroll/items/${it.id}/payslip`);
                                  setSelectedPayslip(res.payslip);
                                }}
                                className="rounded-lg bg-blue-50 p-1.5 font-bold text-blue-600 transition hover:bg-blue-100"
                                title={tr('Lihat Slip Gaji', 'View Payslip')}
                              >
                                <Eye size={14} />
                              </button>
                              {!isLocked && isOwnerAdmin && (
                                <button
                                  onClick={() => {
                                    setAdjustItem(it);
                                    setAttBonus(String(it.attendance_bonus || 0));
                                    setCommBonus(String(it.commission_bonus || 0));
                                    setOtherDed(String(it.other_deductions || 0));
                                    setOtherReason(it.other_deductions_reason || '');
                                    setShowAdjustModal(true);
                                  }}
                                  className="rounded-lg bg-slate-100 p-1.5 text-slate-700 transition hover:bg-slate-200"
                                  title={tr('Sesuaikan Item', 'Adjust Item')}
                                >
                                  <Edit size={14} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile cards */}
                <div className="divide-y divide-slate-100 md:hidden">
                  {items.map((it) => (
                    <div key={it.id} className="space-y-2.5 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-black text-slate-600">
                            {initials(it.employee_name)}
                          </span>
                          <div className="min-w-0">
                            <div className="truncate text-xs font-bold text-slate-900">{it.employee_name}</div>
                            <div className="truncate text-[10px] text-slate-400">
                              {it.job_title} · {it.ptkp_status}
                            </div>
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-sm font-black tabular-nums text-blue-700">{formatCurrency(it.take_home_pay)}</div>
                          <div className="text-[10px] text-slate-400">{tr('Gaji Bersih', 'Net Pay')}</div>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-2.5 text-[10px]">
                        <div>
                          <div className="font-semibold text-slate-400">{t.payroll.grossEarnings}</div>
                          <div className="mt-0.5 font-bold tabular-nums text-slate-800">{formatCurrency(it.gross_earnings)}</div>
                        </div>
                        <div>
                          <div className="font-semibold text-slate-400">{t.payroll.totalDeductions}</div>
                          <div className="mt-0.5 font-bold tabular-nums text-rose-600">{formatCurrency(it.total_deductions)}</div>
                        </div>
                        <div>
                          <div className="font-semibold text-slate-400">{tr('Hari', 'Days')}</div>
                          <div className="mt-0.5 font-bold text-slate-800">
                            {it.days_worked} / {it.expected_working_days}
                          </div>
                          {Number(it.alpha_days) > 0 && (
                            <div className="mt-0.5 inline-flex rounded bg-rose-100 px-1.5 py-0.5 text-[9px] font-bold text-rose-700">
                              {tr('Alpa', 'Alpha')} {it.alpha_days}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={async () => {
                            const res = await apiFetch(`/payroll/items/${it.id}/payslip`);
                            setSelectedPayslip(res.payslip);
                          }}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-blue-50 px-3 py-2 text-[11px] font-bold text-blue-700"
                        >
                          <Eye size={13} />
                          {tr('Slip Gaji', 'Payslip')}
                        </button>
                        {!isLocked && isOwnerAdmin && (
                          <button
                            onClick={() => {
                              setAdjustItem(it);
                              setAttBonus(String(it.attendance_bonus || 0));
                              setCommBonus(String(it.commission_bonus || 0));
                              setOtherDed(String(it.other_deductions || 0));
                              setOtherReason(it.other_deductions_reason || '');
                              setShowAdjustModal(true);
                            }}
                            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-slate-100 px-3 py-2 text-[11px] font-bold text-slate-700"
                          >
                            <Edit size={13} />
                            {tr('Sesuaikan', 'Adjust')}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </>
      )}

      {/* OPEN PERIOD MODAL */}
      {showOpenModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) setShowOpenModal(false);
          }}
        >
          <div className="w-full max-w-md space-y-4 rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                <Calendar size={18} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {tr('Buka Periode Payroll Baru', 'Open New Payroll Period')}
                </h3>
                <p className="text-[11px] text-slate-500">
                  {tr('Periode otomatis mengikuti siklus 25 → 25.', 'Periods follow the 25 → 25 cycle automatically.')}
                </p>
              </div>
            </div>

            <form onSubmit={handleOpenRun} className="space-y-3 text-xs">
              <div>
                <label className="mb-1 block font-medium text-slate-700">{tr('Bulan Periode *', 'Payroll Month *')}</label>
                <MobileMonthPicker value={periodMonth} onChange={handlePeriodMonthChange} />
                <p className="mt-1 text-[10px] text-slate-500">
                  {tr(
                    'Awal & akhir periode serta tanggal bayar terisi otomatis. Anda tetap bisa menyesuaikannya.',
                    'Period start/end and payment date are filled automatically. You can still adjust them.'
                  )}
                </p>
              </div>

              <div>
                <label className="mb-1 block font-medium text-slate-700">{tr('Judul Periode *', 'Period Title *')}</label>
                <input
                  type="text"
                  required
                  value={runTitle}
                  onChange={(e) => setRunTitle(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 p-2.5 font-bold outline-none focus:border-blue-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block font-medium text-slate-700">{tr('Awal Periode *', 'Period Start *')}</label>
                  <input
                    type="date"
                    required
                    value={periodStart}
                    onChange={(e) => setPeriodStart(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 p-2 outline-none focus:border-blue-400"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-medium text-slate-700">{tr('Akhir Periode *', 'Period End *')}</label>
                  <input
                    type="date"
                    required
                    value={periodEnd}
                    onChange={(e) => setPeriodEnd(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 p-2 outline-none focus:border-blue-400"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block font-medium text-slate-700">{tr('Tanggal Bayar Gaji *', 'Salary Payment Date *')}</label>
                <input
                  type="date"
                  required
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 p-2.5 outline-none focus:border-blue-400"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowOpenModal(false)}
                  className="rounded-xl px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100"
                >
                  {tr('Batal', 'Cancel')}
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-blue-600 px-5 py-2.5 font-bold text-white shadow-md transition hover:bg-blue-700"
                >
                  {tr('Buka Periode', 'Open Period')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* THR MODAL */}
      {showThrModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) setShowThrModal(false);
          }}
        >
          <div className="w-full max-w-md space-y-4 rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                <DollarSign size={18} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {tr('Proses THR (Tunjangan Hari Raya)', 'Process THR (Holiday Allowance)')}
                </h3>
                <p className="text-[11px] text-slate-500">
                  {tr('Dihitung proporsional dari masa kerja.', 'Prorated by length of service.')}
                </p>
              </div>
            </div>

            <form onSubmit={handleCreateThr} className="space-y-3 text-xs">
              <div>
                <label className="mb-1 block font-medium text-slate-700">
                  {tr('Tanggal Pembayaran THR *', 'THR Payment Date *')}
                </label>
                <input
                  type="date"
                  required
                  value={thrPaymentDate}
                  onChange={(e) => setThrPaymentDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 p-2.5 outline-none focus:border-emerald-400"
                />
                <p className="mt-1 text-[10px] text-slate-500">
                  {tr(
                    'THR dihitung proporsional dari masa kerja (maksimal 1x upah pokok + tunjangan tetap).',
                    'THR is prorated by length of service (max 1x base salary + fixed allowances).'
                  )}
                </p>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowThrModal(false)}
                  className="rounded-xl px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100"
                >
                  {tr('Batal', 'Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={creatingThr}
                  className="rounded-xl bg-emerald-600 px-5 py-2.5 font-bold text-white shadow-md transition hover:bg-emerald-700 disabled:opacity-50"
                >
                  {creatingThr ? tr('Memproses...', 'Processing...') : tr('Proses THR', 'Process THR')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ATTENDANCE EXCEPTION CALENDAR */}
      {showExceptionCalendar && (() => {
        const employeeOptions = Array.from(
          exceptions.reduce((map, exc) => {
            const key = exc.employee_id || exc.full_name;
            if (!map.has(key)) map.set(key, exc.full_name);
            return map;
          }, new Map<string, string>())
        );

        const visible = exceptions.filter(
          (exc) => calendarEmployeeId === 'all' || (exc.employee_id || exc.full_name) === calendarEmployeeId
        );

        // Group by date so a day with several employees is one cell.
        const byDate = visible.reduce((map, exc) => {
          if (!exc.exception_date) return map;
          const list = map.get(exc.exception_date) || [];
          list.push(exc);
          map.set(exc.exception_date, list);
          return map;
        }, new Map<string, any[]>());

        const dates = (Array.from(byDate.keys()) as string[]).sort();
        const months = (Array.from(new Set(dates.map((d) => d.slice(0, 7)))) as string[]).sort();

        const monthLabel = (ym: string) => {
          const [y, m] = ym.split('-').map(Number);
          return new Date(y, m - 1, 1).toLocaleDateString(lang === 'id' ? 'id-ID' : 'en-US', {
            month: 'long',
            year: 'numeric',
          });
        };

        const weekdayLabels = lang === 'id'
          ? ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min']
          : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

        const buildMonthGrid = (ym: string) => {
          const [year, month] = ym.split('-').map(Number);
          const first = new Date(year, month - 1, 1);
          const daysInMonth = new Date(year, month, 0).getDate();
          // Monday-first offset
          const offset = (first.getDay() + 6) % 7;
          const cells: Array<{ date: string | null; day: number | null }> = [];
          for (let i = 0; i < offset; i++) cells.push({ date: null, day: null });
          for (let d = 1; d <= daysInMonth; d++) {
            cells.push({
              date: `${ym}-${String(d).padStart(2, '0')}`,
              day: d,
            });
          }
          return cells;
        };

        const resolvedCount = visible.filter((e) => e.resolved).length;

        // Multi-select is only meaningful for a single employee: a bulk decision
        // must never mix different people's attendance.
        const singleEmployee = calendarEmployeeId !== 'all';
        const selectableIds = visible.filter((exc) => !exc.resolved).map((exc) => exc.id);
        const allSelected =
          selectableIds.length > 0 && selectableIds.every((id) => selectedExceptionIds.includes(id));

        const toggleSelected = (date: string) => {
          const ids = (byDate.get(date) || []).filter((exc) => !exc.resolved).map((exc) => exc.id);
          if (ids.length === 0) return;
          setSelectedExceptionIds((prev) => {
            const hasAll = ids.every((id) => prev.includes(id));
            return hasAll
              ? prev.filter((id) => !ids.includes(id))
              : Array.from(new Set([...prev, ...ids]));
          });
        };

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4"
            onClick={(event) => {
              if (event.target === event.currentTarget) setShowExceptionCalendar(false);
            }}
          >
            <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
              <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-5">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {tr('Kalender Pengecualian Presensi', 'Attendance Exception Calendar')}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {tr(
                      'Klik tanggal untuk menandai alpa (potong otomatis) atau melampirkan alasan.',
                      'Click a date to mark alpha (automatic deduction) or attach a reason.'
                    )}
                  </p>
                </div>
                <button
                  onClick={() => setShowExceptionCalendar(false)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3 text-xs">
                <select
                  value={calendarEmployeeId}
                  onChange={(e) => changeCalendarEmployee(e.target.value)}
                  className="rounded-xl border border-slate-300 px-3 py-1.5 font-semibold"
                >
                  <option value="all">{tr('Semua karyawan', 'All employees')}</option>
                  {employeeOptions.map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 font-bold text-slate-600">
                  {visible.length - resolvedCount} {tr('belum', 'open')}
                </span>
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-bold text-emerald-700">
                  {resolvedCount} {tr('selesai', 'resolved')}
                </span>
                {singleEmployee && selectableIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedExceptionIds(allSelected ? [] : selectableIds)
                    }
                    className="ml-auto rounded-lg border border-slate-300 px-2.5 py-1 font-bold text-slate-600 transition hover:bg-slate-50"
                  >
                    {allSelected ? tr('Batal pilih', 'Clear selection') : tr('Pilih semua', 'Select all')}
                  </button>
                )}
              </div>

              {!singleEmployee && (
                <div className="border-b border-amber-100 bg-amber-50/70 px-5 py-2 text-[10px] font-semibold text-amber-800">
                  {tr(
                    'Pilih satu karyawan untuk menyelesaikan beberapa tanggal sekaligus.',
                    'Select a single employee to resolve several dates at once.'
                  )}
                </div>
              )}

              <div className="flex-1 space-y-6 overflow-y-auto p-5">
                {months.length === 0 ? (
                  <p className="py-10 text-center text-xs text-slate-400">
                    {tr('Tidak ada pengecualian presensi.', 'No attendance exceptions.')}
                  </p>
                ) : (
                  months.map((ym) => (
                    <div key={ym}>
                      <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                        {monthLabel(ym)}
                      </div>
                      <div className="grid grid-cols-7 gap-1">
                        {weekdayLabels.map((label) => (
                          <div key={label} className="pb-1 text-center text-[9px] font-bold uppercase text-slate-400">
                            {label}
                          </div>
                        ))}
                        {buildMonthGrid(ym).map((cell, index) => {
                          if (!cell.date) return <div key={`empty-${index}`} />;

                          const dayExceptions = byDate.get(cell.date) || [];
                          const hasOpen = dayExceptions.some((exc) => !exc.resolved);
                          const allResolved = dayExceptions.length > 0 && !hasOpen;

                          const base =
                            'flex aspect-square flex-col items-center justify-center rounded-lg border text-[11px] font-bold transition';

                          if (dayExceptions.length === 0) {
                            return (
                              <div
                                key={cell.date}
                                className={`${base} border-transparent bg-slate-50 text-slate-300`}
                              >
                                {cell.day}
                              </div>
                            );
                          }

                          const selectedHere =
                            dayExceptions.length > 0 &&
                            dayExceptions
                              .filter((exc) => !exc.resolved)
                              .every((exc) => selectedExceptionIds.includes(exc.id)) &&
                            dayExceptions.some((exc) => !exc.resolved);

                          return (
                            <button
                              key={cell.date}
                              type="button"
                              disabled={isLocked}
                              onClick={() => {
                                if (singleEmployee) {
                                  // Multi-select mode: toggle the day instead of opening one dialog.
                                  toggleSelected(cell.date);
                                  return;
                                }
                                if (dayExceptions.length === 1) {
                                  openResolveException(dayExceptions[0]);
                                } else {
                                  // Multiple employees on the same day: pick the first open one.
                                  const target = dayExceptions.find((exc) => !exc.resolved) || dayExceptions[0];
                                  openResolveException(target);
                                }
                              }}
                              title={dayExceptions
                                .map((exc) => `${exc.full_name}: ${exc.resolved ? resolutionLabel(exc.resolution_code) || 'resolved' : 'open'}`)
                                .join('\n')}
                              className={`${base} ${
                                selectedHere
                                  ? 'border-blue-500 bg-blue-100 text-blue-900 ring-2 ring-blue-300'
                                  : hasOpen
                                  ? 'border-amber-300 bg-amber-100 text-amber-900 hover:border-amber-500'
                                  : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                              } ${isLocked ? 'cursor-default opacity-70' : 'cursor-pointer'}`}
                            >
                              {cell.day}
                              <span className={`mt-0.5 text-[8px] font-semibold ${selectedHere ? 'text-blue-700' : hasOpen ? 'text-amber-700' : 'text-emerald-600'}`}>
                                {selectedHere
                                  ? tr('dipilih', 'selected')
                                  : hasOpen
                                  ? `${dayExceptions.filter((exc) => !exc.resolved).length} ${tr('buka', 'open')}`
                                  : allResolved
                                  ? '✓'
                                  : ''}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {singleEmployee && selectedExceptionIds.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 border-t border-blue-100 bg-blue-50/70 px-5 py-3">
                  <span className="text-[11px] font-bold text-blue-900">
                    {selectedExceptionIds.length} {tr('tanggal dipilih', 'dates selected')}
                  </span>
                  <select
                    value={bulkResolutionCode}
                    onChange={(e) => setBulkResolutionCode(e.target.value)}
                    className="rounded-lg border border-blue-200 bg-white px-2 py-1.5 text-[11px] font-semibold"
                  >
                    <option value="attendance_completed">
                      {tr('Presensi sudah dilengkapi', 'Attendance completed')}
                    </option>
                    <option value="approved_leave">{tr('Cuti / izin disetujui', 'Approved leave')}</option>
                    <option value="alpha">{tr('Alpa — potong otomatis', 'Alpha — deduct automatically')}</option>
                    <option value="accepted_as_is">{tr('Diterima apa adanya', 'Accepted as is')}</option>
                  </select>
                  <button
                    type="button"
                    disabled={bulkResolving}
                    onClick={() => handleBulkResolve(calendarEmployeeId)}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-blue-700 disabled:opacity-50"
                  >
                    {bulkResolving
                      ? tr('Memproses...', 'Processing...')
                      : tr(
                          `Selesaikan ${selectedExceptionIds.length} tanggal`,
                          `Resolve ${selectedExceptionIds.length} dates`
                        )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedExceptionIds([])}
                    className="rounded-lg px-2 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-white"
                  >
                    {tr('Batal', 'Cancel')}
                  </button>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 p-4">
                <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-500">
                  <span className="inline-flex items-center gap-1">
                    <span className="h-3 w-3 rounded border border-amber-300 bg-amber-100" /> {tr('Belum diselesaikan', 'Unresolved')}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-3 w-3 rounded border border-emerald-200 bg-emerald-50" /> {tr('Selesai', 'Resolved')}
                  </span>
                  {singleEmployee && (
                    <span className="inline-flex items-center gap-1">
                      <span className="h-3 w-3 rounded border border-blue-500 bg-blue-100" /> {tr('Dipilih', 'Selected')}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => {
                    setSelectedExceptionIds([]);
                    setShowExceptionCalendar(false);
                  }}
                  className="rounded-xl bg-slate-900 px-5 py-2 text-xs font-bold text-white hover:bg-slate-800"
                >
                  {tr('Tutup', 'Close')}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* RESOLVE EXCEPTION MODAL */}
      {resolveException && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) setResolveException(null);
          }}
        >
          <div className="max-h-[90vh] w-full max-w-md space-y-4 overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                <AlertTriangle size={18} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {tr('Selesaikan Pengecualian', 'Resolve Exception')}
                </h3>
                <p className="text-[11px] text-slate-500">
                  {tr('Pilih alasan penyelesaian yang sesuai.', 'Choose the matching resolution reason.')}
                </p>
              </div>
            </div>

            <div className="rounded-xl bg-slate-50 p-3 text-xs">
              <div className="font-bold text-slate-900">{resolveException.full_name}</div>
              <div className="mt-0.5 text-[10px] font-semibold uppercase text-amber-700">
                {exceptionTypeLabel(resolveException.exception_type)}
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-600">{resolveException.description}</p>
            </div>

            <form onSubmit={handleResolveException} className="space-y-3 text-xs">
              <div className="space-y-2">
                {resolutionOptionsFor(resolveException.exception_type).map((option) => (
                  <label
                    key={option.code}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
                      resolutionCode === option.code
                        ? 'border-blue-400 bg-blue-50/60'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="resolution_code"
                      checked={resolutionCode === option.code}
                      onChange={() => setResolutionCode(option.code)}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="block font-bold text-slate-900">{option.label}</span>
                      <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-500">{option.desc}</span>
                    </span>
                  </label>
                ))}
              </div>

              <div>
                <label className="mb-1 block font-medium text-slate-700">
                  {tr('Catatan (opsional)', 'Note (optional)')}
                </label>
                <textarea
                  rows={2}
                  value={resolutionNote}
                  onChange={(e) => setResolutionNote(e.target.value)}
                  placeholder={tr(
                    'Contoh: presensi 19 hari sudah diinput manual oleh HR.',
                    'Example: the 19 missing days were entered manually by HR.'
                  )}
                  className="w-full rounded-xl border border-slate-300 p-2 outline-none focus:border-blue-400"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setResolveException(null)}
                  className="rounded-xl px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100"
                >
                  {tr('Batal', 'Cancel')}
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-amber-600 px-5 py-2 font-bold text-white shadow-md transition hover:bg-amber-700"
                >
                  {tr('Tandai Selesai', 'Mark as Resolved')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADJUST ITEM MODAL */}
      {showAdjustModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) setShowAdjustModal(false);
          }}
        >
          <div className="w-full max-w-sm space-y-4 rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                <Edit size={18} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {tr('Penyesuaian Item Payroll', 'Payroll Item Adjustment')}
                </h3>
                <p className="text-[11px] text-slate-500">
                  {tr('Karyawan:', 'Employee:')} <strong>{adjustItem?.employee_name}</strong>
                </p>
              </div>
            </div>

            <form onSubmit={handleSaveAdjust} className="space-y-3 text-xs">
              <div>
                <label className="mb-1 block font-medium text-slate-700">{tr('Bonus Kehadiran (Rp)', 'Attendance Bonus (Rp)')}</label>
                <input
                  type="number"
                  value={attBonus}
                  onChange={(e) => setAttBonus(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 p-2 outline-none focus:border-blue-400"
                />
              </div>
              <div>
                <label className="mb-1 block font-medium text-slate-700">{tr('Komisi / Bonus (Rp)', 'Commission / Bonus (Rp)')}</label>
                <input
                  type="number"
                  value={commBonus}
                  onChange={(e) => setCommBonus(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 p-2 outline-none focus:border-blue-400"
                />
              </div>
              <div>
                <label className="mb-1 block font-medium text-slate-700">{tr('Potongan Lain-Lain (Rp)', 'Other Deductions (Rp)')}</label>
                <input
                  type="number"
                  value={otherDed}
                  onChange={(e) => setOtherDed(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 p-2 font-bold text-rose-600 outline-none focus:border-blue-400"
                />
              </div>
              <div>
                <label className="mb-1 block font-medium text-slate-700">{tr('Alasan Penyesuaian *', 'Adjustment Reason *')}</label>
                <textarea
                  required
                  rows={2}
                  value={otherReason}
                  onChange={(e) => setOtherReason(e.target.value)}
                  placeholder={tr('Koreksi kelebihan bayar bulan lalu...', 'Correction of last month overpayment...')}
                  className="w-full rounded-xl border border-slate-300 p-2 outline-none focus:border-blue-400"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAdjustModal(false)}
                  className="rounded-xl px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100"
                >
                  {tr('Batal', 'Cancel')}
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-blue-600 px-5 py-2 font-bold text-white shadow-md transition hover:bg-blue-700"
                >
                  {tr('Simpan Perubahan', 'Save Changes')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PAYSLIP DETAIL MODAL */}
      <PayslipModal isOpen={!!selectedPayslip} onClose={() => setSelectedPayslip(null)} payslip={selectedPayslip} />
    </div>
  );
};
