import React, { useState, useEffect } from 'react';
import {
  DollarSign,
  Plus,
  RefreshCw,
  Lock,
  Unlock,
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Download,
  Eye,
  Edit,
  Send,
  Building,
  ShieldAlert,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiFetch, formatRupiah, formatDateIndo, downloadFile } from '../api';
import { PayslipModal } from '../components/PayslipModal';

export const HRPayroll: React.FC = () => {
  const { user, isOwnerAdmin, isFinance } = useAuth();

  const [runs, setRuns] = useState<any[]>([]);
  const [selectedRun, setSelectedRun] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [exceptions, setExceptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeStep, setActiveStep] = useState<number>(1);

  // Modals
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [periodStart, setPeriodStart] = useState('2026-10-01');
  const [periodEnd, setPeriodEnd] = useState('2026-10-31');
  const [paymentDate, setPaymentDate] = useState('2026-10-25');
  const [runTitle, setRunTitle] = useState('Gaji Periode Oktober 2026');

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

  const loadRuns = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/payroll/runs');
      setRuns(res.runs || []);
      if (res.runs && res.runs.length > 0 && !selectedRun) {
        selectRun(res.runs[0]);
      }
    } catch (err: any) {
      console.warn('Payroll runs err:', err.message);
    } finally {
      setLoading(false);
    }
  };

  const selectRun = async (run: any) => {
    setSelectedRun(run);
    try {
      const [recapRes, excRes] = await Promise.all([
        apiFetch(`/payroll/runs/${run.id}/recap`),
        apiFetch(`/payroll/runs/${run.id}/exceptions`),
      ]);
      setItems(recapRes.items || []);
      setExceptions(excRes.exceptions || []);

      // Determine active step based on status
      if (run.status === 'draft') setActiveStep(2);
      else if (run.status === 'inputs_pulled') setActiveStep(3);
      else if (run.status === 'calculated') setActiveStep(4);
      else if (run.status === 'locked' || run.status === 'paid') setActiveStep(6);
    } catch (err: any) {
      console.warn('Load run items err:', err.message);
    }
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
      loadRuns();
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
      loadRuns();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    }
  };

  // Step 3: Resolve Exception
  const handleResolveException = async (excId: string) => {
    try {
      await apiFetch(`/payroll/runs/${selectedRun.id}/exceptions/${excId}/resolve`, { method: 'POST' });
      setMsg({ type: 'success', text: 'Pengecualian berhasil ditandai selesai.' });
      selectRun(selectedRun);
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
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

  // Step 5: Lock Run
  const handleLockRun = async () => {
    if (!selectedRun) return;
    const confirm = window.confirm(
      'Apakah Anda yakin ingin mengunci periode penggajian ini? Payroll yang sudah dikunci TIDAK DAPAT diubah lagi.'
    );
    if (!confirm) return;

    try {
      const res = await apiFetch(`/payroll/runs/${selectedRun.id}/lock`, { method: 'POST' });
      setMsg({ type: 'success', text: res.message });
      selectRun({ ...selectedRun, status: 'locked' });
      loadRuns();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    }
  };

  // Step 6: Finance Pays & Sends Email
  const handlePayRun = async () => {
    if (!selectedRun) return;
    const confirm = window.confirm(
      'Konfirmasi pembayaran gaji? Sistem akan mengirimkan notifikasi slip gaji otomatis via email ke seluruh karyawan.'
    );
    if (!confirm) return;

    try {
      const res = await apiFetch(`/payroll/runs/${selectedRun.id}/pay`, { method: 'POST' });
      setMsg({ type: 'success', text: res.message });
      selectRun({ ...selectedRun, status: 'paid' });
      loadRuns();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    }
  };

  const downloadBankFile = async (format: 'BCA' | 'MANDIRI') => {
    if (!selectedRun) return;
    try {
      const filename = `${format === 'BCA' ? 'KlikBCA' : 'Mandiri_MCM'}_${selectedRun.period_end || 'export'}.csv`;
      await downloadFile(`/payroll/runs/${selectedRun.id}/bank-file?format=${format}`, filename);
    } catch (err: any) {
      alert(err.message || 'Gagal mengunduh file bank transfer');
    }
  };

  const isLocked = selectedRun?.status === 'locked' || selectedRun?.status === 'paid';
  const isPaid = selectedRun?.status === 'paid';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Penggajian (Payroll Run)</h1>
          <p className="text-xs text-slate-500">
            Alur 6 langkah penguncian penggajian bulanan sesuai regulasi BPJS dan PPh 21 TER Indonesia
          </p>
        </div>

        {isOwnerAdmin && (
          <button
            onClick={() => setShowOpenModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md transition"
          >
            <Plus size={16} />
            <span>Buka Periode Payroll Baru (Langkah 1)</span>
          </button>
        )}
      </div>

      {msg && (
        <div
          className={`p-4 rounded-2xl text-xs flex items-center gap-2 shadow-2xs ${
            msg.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          {msg.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          <span className="flex-1 font-medium">{msg.text}</span>
          <button onClick={() => setMsg(null)}>✕</button>
        </div>
      )}

      {/* Selected Run Selector & Status Pill */}
      {runs.length > 0 && (
        <div className="bg-white p-4 rounded-3xl border border-slate-200/80 shadow-2xs flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-slate-500 uppercase">Pilih Periode:</span>
            <select
              value={selectedRun?.id || ''}
              onChange={(e) => {
                const found = runs.find((r) => r.id === e.target.value);
                if (found) selectRun(found);
              }}
              className="text-xs font-bold border border-slate-300 rounded-xl px-3 py-2 bg-white"
            >
              {runs.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title} ({r.status.toUpperCase()})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`text-xs font-bold px-3 py-1 rounded-full border ${
                isPaid
                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                  : isLocked
                  ? 'bg-purple-100 text-purple-800 border-purple-300'
                  : 'bg-amber-100 text-amber-800 border-amber-300'
              }`}
            >
              Status: {selectedRun?.status?.toUpperCase()}
            </span>

            {isLocked && (
              <span className="text-[11px] text-slate-500 flex items-center gap-1">
                <Lock size={13} className="text-slate-400" /> Terkunci Permanen
              </span>
            )}
          </div>
        </div>
      )}

      {/* 6-STEP WORKFLOW STEPPER BAR */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-2xs overflow-x-auto">
        <div className="flex items-center justify-between min-w-160 text-xs">
          {/* Step 1 */}
          <div className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold ${
              selectedRun ? 'bg-emerald-600 text-white' : 'bg-blue-600 text-white'
            }`}>
              1
            </div>
            <div>
              <div className="font-bold text-slate-900">Buka Periode</div>
              <div className="text-[10px] text-slate-400">1-31 Oct / Cutoff</div>
            </div>
          </div>
          <div className="w-8 h-px bg-slate-200" />

          {/* Step 2 */}
          <div className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold ${
              items.length > 0 ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'
            }`}>
              2
            </div>
            <div>
              <div className="font-bold text-slate-900">Tarik Data Input</div>
              <div className="text-[10px] text-slate-400">Presensi, OT, Kasbon</div>
            </div>
          </div>
          <div className="w-8 h-px bg-slate-200" />

          {/* Step 3 */}
          <div className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold ${
              exceptions.filter((e) => !e.resolved).length === 0 && items.length > 0
                ? 'bg-emerald-600 text-white'
                : exceptions.length > 0
                ? 'bg-amber-500 text-white'
                : 'bg-slate-200 text-slate-600'
            }`}>
              3
            </div>
            <div>
              <div className="font-bold text-slate-900">Pengecualian</div>
              <div className="text-[10px] text-slate-400">{exceptions.length} Catatan / UMK</div>
            </div>
          </div>
          <div className="w-8 h-px bg-slate-200" />

          {/* Step 4 */}
          <div className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold ${
              items.length > 0 ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'
            }`}>
              4
            </div>
            <div>
              <div className="font-bold text-slate-900">Hitung & Review</div>
              <div className="text-[10px] text-slate-400">BPJS & PPh 21 TER</div>
            </div>
          </div>
          <div className="w-8 h-px bg-slate-200" />

          {/* Step 5 */}
          <div className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold ${
              isLocked ? 'bg-purple-600 text-white' : 'bg-slate-200 text-slate-600'
            }`}>
              5
            </div>
            <div>
              <div className="font-bold text-slate-900">Kunci Run (Lock)</div>
              <div className="text-[10px] text-slate-400">Permanen & Final</div>
            </div>
          </div>
          <div className="w-8 h-px bg-slate-200" />

          {/* Step 6 */}
          <div className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold ${
              isPaid ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'
            }`}>
              6
            </div>
            <div>
              <div className="font-bold text-slate-900">Output & Bayar</div>
              <div className="text-[10px] text-slate-400">PDF, Bank CSV</div>
            </div>
          </div>
        </div>

        {/* STEP CONTROLS BAR */}
        {selectedRun && (
          <div className="mt-5 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {!isLocked && isOwnerAdmin && (
                <>
                  <button
                    onClick={handlePullInputs}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition"
                  >
                    <RefreshCw size={14} />
                    <span>Langkah 2: Tarik & Hitung Input Otomatis</span>
                  </button>

                  <button
                    onClick={handleLockRun}
                    disabled={items.length === 0}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold shadow-xs transition disabled:opacity-50"
                  >
                    <Lock size={14} />
                    <span>Langkah 5: Kunci Payroll Run Permanen</span>
                  </button>
                </>
              )}

              {isLocked && !isPaid && (isOwnerAdmin || isFinance) && (
                <button
                  onClick={handlePayRun}
                  className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md transition"
                >
                  <DollarSign size={15} />
                  <span>Langkah 6: Konfirmasi Pembayaran & Kirim Slip Gaji</span>
                </button>
              )}
            </div>

            {/* Output Download Buttons */}
            {items.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-slate-400 uppercase">Ekspor Bank:</span>
                <button
                  onClick={() => downloadBankFile('BCA')}
                  className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-semibold flex items-center gap-1"
                >
                  <Download size={13} />
                  <span>BCA (KlikBCA)</span>
                </button>
                <button
                  onClick={() => downloadBankFile('MANDIRI')}
                  className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-semibold flex items-center gap-1"
                >
                  <Download size={13} />
                  <span>Mandiri (MCM)</span>
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await downloadFile(`/reports/payroll-recap?run_id=${selectedRun.id}&export=excel`, `Rekap_Penggajian_${selectedRun.period_end}.xlsx`);
                    } catch (e: any) {
                      alert(e.message || 'Gagal mengunduh rekap');
                    }
                  }}
                  className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <FileSpreadsheet size={13} />
                  <span>Rekap Excel</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* EXCEPTIONS CARD (Step 3) */}
      {exceptions.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-3xl p-5 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-amber-900 font-bold text-sm">
              <AlertTriangle size={18} className="text-amber-600" />
              <span>Review Pengecualian Payroll ({exceptions.length} Catatan)</span>
            </div>
            <span className="text-xs text-amber-700">
              {exceptions.filter((e) => e.resolved).length} dari {exceptions.length} diselesaikan
            </span>
          </div>

          <div className="space-y-2">
            {exceptions.map((exc) => (
              <div
                key={exc.id}
                className="p-3 bg-white rounded-2xl border border-amber-200 flex items-center justify-between text-xs"
              >
                <div>
                  <div className="font-bold text-slate-900 flex items-center gap-2">
                    <span>{exc.full_name}</span>
                    <span className="bg-amber-100 text-amber-800 text-[10px] px-2 py-0.2 rounded font-semibold uppercase">
                      {exc.exception_type}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 mt-0.5">{exc.description}</p>
                </div>
                <div>
                  {exc.resolved ? (
                    <span className="text-emerald-700 text-xs font-bold flex items-center gap-1">
                      <CheckCircle2 size={15} /> Selesai
                    </span>
                  ) : (
                    !isLocked && (
                      <button
                        onClick={() => handleResolveException(exc.id)}
                        className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg text-xs"
                      >
                        Tandai Selesai
                      </button>
                    )
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PAYROLL SUMMARY TOTALS */}
      {selectedRun && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white p-4 rounded-3xl border border-slate-200/80 shadow-2xs">
            <span className="text-[11px] text-slate-400 font-semibold block">Total Karyawan</span>
            <div className="text-2xl font-black text-slate-900 mt-1">{items.length} Orang</div>
          </div>
          <div className="bg-white p-4 rounded-3xl border border-slate-200/80 shadow-2xs">
            <span className="text-[11px] text-slate-400 font-semibold block">Total Penghasilan Bruto</span>
            <div className="text-xl font-black text-slate-900 mt-1">
              {formatRupiah(selectedRun.total_gross)}
            </div>
          </div>
          <div className="bg-white p-4 rounded-3xl border border-slate-200/80 shadow-2xs">
            <span className="text-[11px] text-rose-500 font-semibold block">Total Potongan (BPJS + Pajak)</span>
            <div className="text-xl font-black text-rose-600 mt-1">
              {formatRupiah(selectedRun.total_deductions)}
            </div>
          </div>
          <div className="bg-white p-4 rounded-3xl border border-blue-200 bg-blue-50/50 shadow-2xs">
            <span className="text-[11px] text-blue-700 font-semibold block">Total Gaji Bersih (Take Home)</span>
            <div className="text-xl font-black text-blue-700 mt-1">
              {formatRupiah(selectedRun.total_take_home)}
            </div>
          </div>
        </div>
      )}

      {/* PAYROLL ITEMS TABLE (Review per Employee) */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-sm text-slate-900">
            Daftar Gaji Karyawan ({items.length} Penerima)
          </h3>
          <span className="text-xs text-slate-400 font-medium">Klik nama karyawan untuk melihat slip gaji resmi</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
              <tr>
                <th className="py-3 px-4 font-bold">Karyawan</th>
                <th className="py-3 px-4 font-bold">PTKP</th>
                <th className="py-3 px-4 font-bold">Gaji Pokok</th>
                <th className="py-3 px-4 font-bold">Lembur</th>
                <th className="py-3 px-4 font-bold">Penghasilan Bruto</th>
                <th className="py-3 px-4 font-bold">BPJS Pegawai</th>
                <th className="py-3 px-4 font-bold">PPh 21</th>
                <th className="py-3 px-4 font-bold">Kasbon</th>
                <th className="py-3 px-4 font-bold text-blue-700">Gaji Bersih (THP)</th>
                <th className="py-3 px-4 font-bold text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((it) => {
                const totalBpjsEmp = it.bpjs_kes_employee + it.bpjs_jht_employee + it.bpjs_jp_employee;
                return (
                  <tr key={it.id} className="hover:bg-slate-50/80 transition">
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900">{it.employee_name}</div>
                      <div className="text-[11px] text-slate-400">{it.job_title}</div>
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-700">{it.ptkp_status}</td>
                    <td className="py-3 px-4 font-medium">{formatRupiah(it.base_salary)}</td>
                    <td className="py-3 px-4 text-emerald-600 font-medium">
                      {it.overtime_pay > 0 ? formatRupiah(it.overtime_pay) : '-'}
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-900">{formatRupiah(it.gross_earnings)}</td>
                    <td className="py-3 px-4 font-medium text-rose-600">{formatRupiah(totalBpjsEmp)}</td>
                    <td className="py-3 px-4 font-medium text-rose-600">{formatRupiah(it.pph21_amount)}</td>
                    <td className="py-3 px-4 font-medium text-rose-600">
                      {it.kasbon_deduction > 0 ? formatRupiah(it.kasbon_deduction) : '-'}
                    </td>
                    <td className="py-3 px-4 font-black text-blue-700 text-sm">
                      {formatRupiah(it.take_home_pay)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={async () => {
                            const res = await apiFetch(`/payroll/items/${it.id}/payslip`);
                            setSelectedPayslip(res.payslip);
                          }}
                          className="p-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg font-bold"
                          title="Lihat Slip Gaji"
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
                            className="p-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg"
                            title="Sesuaikan Item"
                          >
                            <Edit size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* OPEN PERIOD MODAL (Step 1) */}
      {showOpenModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="font-bold text-base text-slate-900">Buka Periode Payroll Baru</h3>
            <form onSubmit={handleOpenRun} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-medium mb-1">Judul Periode *</label>
                <input
                  type="text"
                  required
                  value={runTitle}
                  onChange={(e) => setRunTitle(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 rounded-xl font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Awal Periode *</label>
                  <input
                    type="date"
                    required
                    value={periodStart}
                    onChange={(e) => setPeriodStart(e.target.value)}
                    className="w-full p-2 border border-slate-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Akhir Periode *</label>
                  <input
                    type="date"
                    required
                    value={periodEnd}
                    onChange={(e) => setPeriodEnd(e.target.value)}
                    className="w-full p-2 border border-slate-300 rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">Tanggal Bayar Gaji *</label>
                <input
                  type="date"
                  required
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 rounded-xl"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowOpenModal(false)}
                  className="px-4 py-2 text-slate-600 font-semibold rounded-xl hover:bg-slate-100"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-blue-600 text-white font-bold rounded-xl shadow-md hover:bg-blue-700"
                >
                  Buka Periode
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADJUST ITEM MODAL (Step 4) */}
      {showAdjustModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <h3 className="font-bold text-base text-slate-900">Penyesuaian Item Payroll</h3>
            <p className="text-xs text-slate-500">
              Karyawan: <strong>{adjustItem?.employee_name}</strong>
            </p>
            <form onSubmit={handleSaveAdjust} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-medium mb-1">Bonus Kehadiran (Rp)</label>
                <input
                  type="number"
                  value={attBonus}
                  onChange={(e) => setAttBonus(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-xl"
                />
              </div>
              <div>
                <label className="block text-slate-700 font-medium mb-1">Komisi / Bonus (Rp)</label>
                <input
                  type="number"
                  value={commBonus}
                  onChange={(e) => setCommBonus(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-xl"
                />
              </div>
              <div>
                <label className="block text-slate-700 font-medium mb-1">Potongan Lain-Lain (Rp)</label>
                <input
                  type="number"
                  value={otherDed}
                  onChange={(e) => setOtherDed(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-xl text-rose-600 font-bold"
                />
              </div>
              <div>
                <label className="block text-slate-700 font-medium mb-1">Alasan Penyesuaian *</label>
                <textarea
                  required
                  rows={2}
                  value={otherReason}
                  onChange={(e) => setOtherReason(e.target.value)}
                  placeholder="Koreksi kelebihan bayar bulan lalu..."
                  className="w-full p-2 border border-slate-300 rounded-xl"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAdjustModal(false)}
                  className="px-4 py-2 text-slate-600 font-semibold rounded-xl hover:bg-slate-100"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 text-white font-bold rounded-xl shadow-md hover:bg-blue-700"
                >
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PAYSLIP DETAIL MODAL */}
      <PayslipModal
        isOpen={!!selectedPayslip}
        onClose={() => setSelectedPayslip(null)}
        payslip={selectedPayslip}
      />
    </div>
  );
};
