import React, { useState, useEffect } from 'react';
import {
  Receipt,
  CheckCircle2,
  AlertCircle,
  Eye,
  FileSpreadsheet,
  FileDown,
  Filter,
  Archive,
} from 'lucide-react';
import { apiFetch, downloadFile, getToken, formatDateIndo, getLocalMonthString } from '../api';
import { PageSkeleton } from '../components/Skeleton';
import { useLanguage } from '../context/LanguageContext';
import { useCompany } from '../context/CompanyContext';
import { generateCombinedReceiptsPdf, ClaimItemForPdf } from '../utils/claimPdf';

export const HRKasbon: React.FC = () => {
  const { t, tr, formatDate, formatCurrency } = useLanguage();
  const { companyName } = useCompany();
  const [reimbursements, setReimbursements] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [includeSalary, setIncludeSalary] = useState(true);
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Filters
  const [selectedMonth, setSelectedMonth] = useState<string>(getLocalMonthString());
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');

  const loadData = async () => {
    setLoading(true);
    try {
      const [rRes, eRes] = await Promise.all([
        apiFetch(
          `/kasbon/reimbursements?month=${selectedMonth}&status=${selectedStatus}${
            selectedEmployeeId ? `&employee_id=${selectedEmployeeId}` : ''
          }`
        ),
        apiFetch('/employees'),
      ]);
      setReimbursements(rRes.reimbursements || []);
      setEmployees(eRes.employees || []);
    } catch (err: any) {
      console.warn('Load reimbursements err:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedMonth, selectedEmployeeId, selectedStatus]);

  const handleReviewReimb = async (id: string, status: 'approved' | 'rejected') => {
    const note = prompt(
      status === 'approved'
        ? tr('Catatan persetujuan (opsional):', 'Approval note (optional):')
        : tr('Catatan penolakan (opsional):', 'Rejection note (optional):')
    );
    try {
      const res = await apiFetch(`/kasbon/reimbursements/${id}/review`, {
        method: 'POST',
        body: JSON.stringify({ status, note }),
      });
      setMsg({ type: 'success', text: res.message });
      loadData();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    }
  };

  const handleDownloadExcel = async () => {
    setDownloading(true);
    try {
      let endpoint = `/kasbon/claims/export-excel?month=${selectedMonth}&status=approved&include_salary=${includeSalary ? 'true' : 'false'}`;
      if (selectedEmployeeId) {
        endpoint += `&employee_id=${selectedEmployeeId}`;
        const targetEmp = employees.find((e) => e.id === selectedEmployeeId);
        const empName = targetEmp ? targetEmp.full_name.replace(/\s+/g, '_') : 'Karyawan';
        const filename = `Claim_Expenses_${empName}_${selectedMonth || 'All'}.xlsx`;
        await downloadFile(endpoint, filename);
      } else {
        // When no specific employee is selected, download All as ZIP (1 Excel per Employee)
        const filename = `Claim_Expenses_All_Employees_${selectedMonth || 'All'}.zip`;
        await downloadFile(`/kasbon/claims/export-all-zip?month=${selectedMonth}&include_salary=${includeSalary ? 'true' : 'false'}`, filename);
      }
    } catch (err: any) {
      alert(err.message || tr('Gagal mengunduh Claim Sheet Excel', 'Failed to download Claim Sheet Excel'));
    } finally {
      setDownloading(false);
    }
  };

  const handleDownloadAllZip = async () => {
    setDownloading(true);
    try {
      const filename = `Claim_Expenses_All_Employees_${selectedMonth || 'All'}.zip`;
      await downloadFile(`/kasbon/claims/export-all-zip?month=${selectedMonth}&include_salary=${includeSalary ? 'true' : 'false'}`, filename);
    } catch (err: any) {
      alert(err.message || tr('Gagal mengunduh ZIP Claim Sheet Karyawan', 'Failed to download Employee Claim Sheet ZIP'));
    } finally {
      setDownloading(false);
    }
  };

  const handleDownloadPdf = async () => {
    setDownloading(true);
    try {
      const approvedClaims = reimbursements.filter((r) => r.status === 'approved');
      if (approvedClaims.length === 0) {
        alert(
          tr(
            'Tidak ada klaim berstatus disetujui (approved) pada filter ini untuk digabungkan struknya.',
            'There are no approved claims in this filter to combine receipts for.'
          )
        );
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

      const targetEmp = employees.find((e) => e.id === selectedEmployeeId);
      const employeeName = targetEmp ? targetEmp.full_name : approvedClaims[0]?.full_name || 'Staff';
      const employeeNik = targetEmp ? targetEmp.nik : approvedClaims[0]?.nik || '-';

      // Format Period Title e.g. "September 2026"
      let periodLabel = selectedMonth;
      if (selectedMonth && selectedMonth.includes('-')) {
        const [y, m] = selectedMonth.split('-');
        const monthNames = [
          'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
          'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
        ];
        const mIdx = parseInt(m, 10) - 1;
        if (mIdx >= 0 && mIdx < 12) {
          periodLabel = `${monthNames[mIdx]} ${y}`;
        }
      }

      await generateCombinedReceiptsPdf({
        companyName: companyName || 'SMTS Pte Ltd',
        periodTitle: periodLabel,
        employeeName,
        employeeNik,
        approverName: 'Lawrence',
        claims: itemsForPdf,
      });
    } catch (err: any) {
      alert(err.message || tr('Gagal membuat file PDF struk', 'Failed to create receipt PDF file'));
    } finally {
      setDownloading(false);
    }
  };

  const pendingCount = reimbursements.filter((r) => r.status === 'pending').length;

  const reimbStatusBadge = (r: any) => {
    let cls = 'bg-amber-100 text-amber-800';
    let label = tr('Menunggu', 'Pending');
    if (r.status === 'paid') {
      cls = 'bg-blue-100 text-blue-800';
      label = tr('Sudah Dibayar', 'Paid');
    } else if (r.status === 'approved' && r.payroll_run_id) {
      cls = 'bg-indigo-100 text-indigo-800';
      label = tr('Masuk Payroll', 'In Payroll');
    } else if (r.status === 'approved') {
      cls = 'bg-emerald-100 text-emerald-800';
      label = tr('Disetujui', 'Approved');
    } else if (r.status === 'rejected') {
      cls = 'bg-rose-100 text-rose-800';
      label = tr('Ditolak', 'Rejected');
    }
    return (
      <div className="flex flex-col gap-0.5">
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded w-fit ${cls}`}>{label}</span>
        {r.payroll_run_title && <span className="text-[9px] text-slate-500">{r.payroll_run_title}</span>}
      </div>
    );
  };

  if (loading) return <PageSkeleton cards={0} rows={6} />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            {tr('Klaim Biaya & Pengeluaran (Expense Claims)', 'Expense Claims')}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {tr(
              'Verifikasi persetujuan klaim biaya operasional karyawan, ekspor Claim Sheet Excel resmi, dan gabungkan bukti struk ke PDF.',
              'Verify approval of employee operational expense claims, export the official Excel Claim Sheet, and combine receipt proofs into a PDF.'
            )}
          </p>
        </div>

        {/* Export Toolbar */}
        <div className="flex flex-wrap items-center gap-1.5 bg-white border border-slate-200/80 rounded-2xl p-1.5 shadow-2xs">
          <button
            type="button"
            disabled={downloading}
            onClick={handleDownloadExcel}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2.5 rounded-xl text-xs font-bold transition shadow-xs cursor-pointer disabled:opacity-50"
            title={
              selectedEmployeeId
                ? tr('Unduh Claim Excel karyawan terpilih (termasuk klaim gaji)', 'Download the selected employee\'s Claim Excel (including salary claims)')
                : tr('Unduh Claim Excel (.xlsx)', 'Download Claim Excel (.xlsx)')
            }
          >
            <FileSpreadsheet size={15} />
            <span>
              {selectedEmployeeId ? tr('Excel Karyawan', 'Employee Excel') : tr('Ekspor Excel', 'Export Excel')}
            </span>
          </button>

          <div className="hidden sm:block h-7 w-px bg-slate-200 mx-0.5" />

          <button
            type="button"
            disabled={downloading}
            onClick={handleDownloadAllZip}
            className="flex items-center gap-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 px-3.5 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer disabled:opacity-50"
            title={tr('ZIP berisi 1 file Excel untuk setiap karyawan', 'ZIP containing 1 Excel file for each employee')}
          >
            <Archive size={15} className="text-teal-600" />
            <span>{tr('Ekspor Semua', 'Export All')}</span>
            <span className="text-[10px] font-bold text-slate-500 bg-slate-200/80 px-1.5 py-0.5 rounded-md">ZIP</span>
          </button>

          <button
            type="button"
            disabled={downloading || reimbursements.filter((r) => r.status === 'approved').length === 0}
            onClick={handleDownloadPdf}
            className="flex items-center gap-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 px-3.5 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer disabled:opacity-50"
            title={tr('Gabungkan seluruh bukti struk yang disetujui menjadi satu PDF', 'Combine all approved receipt proofs into a single PDF')}
          >
            <FileDown size={15} className="text-blue-600" />
            <span>{tr('Gabungkan Struk', 'Combine Receipts')}</span>
            <span className="text-[10px] font-bold text-slate-500 bg-slate-200/80 px-1.5 py-0.5 rounded-md">PDF</span>
          </button>
        </div>
      </div>

      {msg && (
        <div
          className={`p-4 rounded-2xl text-xs flex items-center gap-2 shadow-2xs ${
            msg.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          {msg.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span className="flex-1 font-medium">{msg.text}</span>
          <button onClick={() => setMsg(null)} className="font-bold cursor-pointer">✕</button>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs flex flex-wrap items-center gap-3 text-xs">
        <div className="flex items-center gap-1.5 text-slate-500 font-bold">
          <Filter size={15} />
          <span>{tr('Filter:', 'Filter:')}</span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-slate-500">{tr('Periode Klaim:', 'Claim Period:')}</span>
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="p-1.5 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-slate-500">{tr('Karyawan:', 'Employee:')}</span>
          <select
            value={selectedEmployeeId}
            onChange={(e) => setSelectedEmployeeId(e.target.value)}
            className="p-1.5 border border-slate-300 rounded-lg text-xs font-medium text-slate-800"
          >
            <option value="">{tr('Semua Karyawan', 'All Employees')}</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.full_name} ({emp.nik})
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-slate-500">{tr('Status:', 'Status:')}</span>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="p-1.5 border border-slate-300 rounded-lg text-xs font-medium text-slate-800"
          >
            <option value="all">{tr('Semua Status', 'All Statuses')}</option>
            <option value="pending">{tr('Menunggu Persetujuan (Pending)', 'Pending Approval (Pending)')}</option>
            <option value="approved">{tr('Disetujui (Approved)', 'Approved')}</option>
            <option value="paid">{tr('Sudah Dibayar (Paid)', 'Paid')}</option>
            <option value="rejected">{tr('Ditolak (Rejected)', 'Rejected')}</option>
          </select>
        </div>

        <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
          <label className="flex items-center gap-1.5 cursor-pointer text-slate-700 font-semibold select-none text-xs">
            <input
              type="checkbox"
              checked={includeSalary}
              onChange={(e) => setIncludeSalary(e.target.checked)}
              className="rounded text-blue-600 focus:ring-0 cursor-pointer"
            />
            <span>{tr('Sertakan Gaji (Klaim UNPAID)', 'Include Salary (UNPAID Claims)')}</span>
          </label>
        </div>

        {pendingCount > 0 && (
          <span className="ml-auto text-[11px] bg-amber-100 text-amber-900 border border-amber-300 px-2.5 py-1 rounded-full font-bold">
            {pendingCount} {tr('klaim menunggu verifikasi', 'claims awaiting verification')}
          </span>
        )}
      </div>

      {/* Reimbursements Table */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
              <tr>
                <th className="py-3 px-4 font-bold">{tr('Tanggal', 'Date')}</th>
                <th className="py-3 px-4 font-bold">{tr('Karyawan', 'Employee')}</th>
                <th className="py-3 px-4 font-bold">{tr('Kategori', 'Category')}</th>
                <th className="py-3 px-4 font-bold">{tr('Deskripsi', 'Description')}</th>
                <th className="py-3 px-4 font-bold">{tr('Nominal', 'Amount')}</th>
                <th className="py-3 px-4 font-bold">{tr('Remarks / Ref', 'Remarks / Ref')}</th>
                <th className="py-3 px-4 font-bold">{tr('Bukti Struk', 'Receipt Proof')}</th>
                <th className="py-3 px-4 font-bold">{tr('Status', 'Status')}</th>
                <th className="py-3 px-4 font-bold text-right">{tr('Aksi', 'Action')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-xs text-slate-400">
                    {tr('Memuat data klaim...', 'Loading claim data...')}
                  </td>
                </tr>
              ) : reimbursements.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-xs text-slate-400">
                    {tr('Tidak ada klaim pengeluaran pada filter yang dipilih.', 'No expense claims match the selected filter.')}
                  </td>
                </tr>
              ) : (
                reimbursements.map((r, idx) => (
                  <tr key={r.id} className="hover:bg-slate-50/50 transition">
                    <td className="py-3 px-4 font-medium text-slate-700 whitespace-nowrap">
                      {formatDate(r.expense_date || r.created_at)}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900">{r.full_name}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{r.nik}</div>
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-800">
                      <span className="bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                        {r.category}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-800 max-w-xs">{r.description}</td>
                    <td className="py-3 px-4 font-black text-emerald-700 whitespace-nowrap">
                      {formatCurrency(r.amount)}
                    </td>
                    <td className="py-3 px-4 max-w-xs">
                      {r.remarks && <p className="text-[11px] text-blue-700 font-medium">"{r.remarks}"</p>}
                      {r.cost_centre && (
                        <p className="text-[10px] text-slate-500">
                          {r.cost_centre} {r.project_ref ? `| ${r.project_ref}` : ''}
                        </p>
                      )}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {r.has_receipt && r.receipt_url ? (
                        <button
                          type="button"
                          onClick={() => setPreviewPhoto(r.receipt_url)}
                          className="inline-flex items-center gap-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 px-2 py-1 rounded-lg font-bold text-[11px] transition cursor-pointer"
                        >
                          <Eye size={13} />
                          <span>{tr('Lihat Struk', 'View Receipt')}</span>
                        </button>
                      ) : (
                        <span className="text-slate-400 text-[11px] italic">{tr('Tidak ada struk', 'No receipt')}</span>
                      )}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">{reimbStatusBadge(r)}</td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      {r.status === 'pending' ? (
                        <div className="flex justify-end gap-1.5">
                          <button
                            onClick={() => handleReviewReimb(r.id, 'approved')}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-2.5 py-1 rounded-lg text-xs cursor-pointer shadow-xs"
                          >
                            {tr('Setujui', 'Approve')}
                          </button>
                          <button
                            onClick={() => handleReviewReimb(r.id, 'rejected')}
                            className="bg-rose-600 hover:bg-rose-700 text-white font-bold px-2.5 py-1 rounded-lg text-xs cursor-pointer shadow-xs"
                          >
                            {tr('Tolak', 'Reject')}
                          </button>
                        </div>
                      ) : r.status === 'approved' ? (
                        <div className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              const empName = (r.full_name || 'Staff').replace(/\s+/g, '_');
                              const filename = `Claim_Expenses_${empName}_${selectedMonth || 'All'}.xlsx`;
                              downloadFile(
                                `/kasbon/claims/export-excel?employee_id=${r.employee_id}&month=${selectedMonth}&status=approved&include_salary=${includeSalary ? 'true' : 'false'}`,
                                filename
                              );
                            }}
                            title={`${tr('Unduh Claim Sheet Excel', 'Download Claim Sheet Excel')} (${r.full_name})`}
                            className="inline-flex items-center gap-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 px-2 py-1 rounded-lg font-bold text-[11px] transition cursor-pointer"
                          >
                            <FileSpreadsheet size={13} />
                            <span>{tr('Claim Excel', 'Claim Excel')}</span>
                          </button>
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-400">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Image Preview Modal */}
      {previewPhoto && (
        <div
          onClick={() => setPreviewPhoto(null)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 cursor-pointer"
        >
          <div
            className="bg-white rounded-2xl max-w-lg w-full p-4 overflow-hidden shadow-2xl space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <h4 className="font-bold text-xs uppercase text-slate-800">{tr('Bukti Struk Pembayaran', 'Payment Receipt Proof')}</h4>
              <button
                type="button"
                onClick={() => setPreviewPhoto(null)}
                className="text-slate-400 hover:text-slate-700 font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto flex items-center justify-center bg-slate-950 rounded-xl p-2">
              <img
                src={previewPhoto}
                alt={tr('Bukti Struk', 'Receipt Proof')}
                className="max-h-[65vh] w-auto object-contain rounded"
              />
            </div>
            <button
              type="button"
              onClick={() => setPreviewPhoto(null)}
              className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-medium cursor-pointer"
            >
              {tr('Tutup', 'Close')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
