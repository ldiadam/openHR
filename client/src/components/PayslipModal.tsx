import React from 'react';
import { X, Printer, Download } from 'lucide-react';
import { formatRupiah, formatDateIndo } from '../api';

interface PayslipModalProps {
  isOpen: boolean;
  onClose: () => void;
  payslip: any;
}

export const PayslipModal: React.FC<PayslipModalProps> = ({ isOpen, onClose, payslip }) => {
  if (!isOpen || !payslip) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto print:p-0 print:bg-white print:fixed print:inset-0">
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden border border-slate-200 my-8 print:shadow-none print:border-none print:m-0 print:max-w-none">
        {/* Modal Top Bar (Hidden in Print) */}
        <div className="p-4 bg-slate-900 text-white flex items-center justify-between print:hidden">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-sm">Slip Gaji Resmi (Official Payslip)</h3>
            <span className="text-xs bg-blue-600 px-2 py-0.5 rounded text-white">{payslip.run_title}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-xs px-3 py-1.5 rounded-lg border border-slate-700 transition"
            >
              <Printer size={15} />
              <span>Cetak / Simpan PDF</span>
            </button>
            <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white rounded-lg">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Payslip Document Body */}
        <div className="p-6 md:p-8 space-y-6 text-slate-800 print:p-8" id="printable-payslip">
          {/* Header */}
          <div className="border-b-2 border-slate-900 pb-4 flex justify-between items-start">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-slate-900 uppercase">
                {payslip.company_name || 'PT Nusantara Digital Kreasi'}
              </h2>
              <p className="text-xs text-slate-600 mt-1 max-w-md">
                {payslip.company_address || 'Jl. Jend. Sudirman Kav. 52-53, Jakarta Selatan'}
              </p>
              {payslip.company_npwp && (
                <p className="text-xs text-slate-500">NPWP: {payslip.company_npwp}</p>
              )}
            </div>
            <div className="text-right">
              <span className="inline-block bg-slate-100 text-slate-800 font-bold text-xs uppercase px-2.5 py-1 rounded tracking-wider border border-slate-200">
                SLIP GAJI
              </span>
              <p className="text-xs font-semibold text-slate-700 mt-2">{payslip.run_title}</p>
              <p className="text-[11px] text-slate-500">
                Tgl Bayar: {formatDateIndo(payslip.payment_date || payslip.period_end)}
              </p>
            </div>
          </div>

          {/* Employee Metadata Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div>
              <span className="text-slate-400 block text-[10px] uppercase">Nama Karyawan</span>
              <span className="font-bold text-slate-900">{payslip.employee_name}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase">NIK / ID</span>
              <span className="font-semibold text-slate-800">{payslip.employee_nik}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase">Jabatan / Dept</span>
              <span className="font-semibold text-slate-800">
                {payslip.job_title} ({payslip.department_name || '-'})
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase">Status PTKP</span>
              <span className="font-semibold text-slate-800">{payslip.ptkp_status}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase">Rekening Bank</span>
              <span className="font-semibold text-slate-800">
                {payslip.bank_name} {payslip.bank_account_number}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase">Hari Kerja</span>
              <span className="font-semibold text-slate-800">
                {payslip.days_worked} / {payslip.expected_working_days} Hari
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase">Lembur Disetujui</span>
              <span className="font-semibold text-slate-800">{payslip.overtime_hours} Jam</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase">Metode Pajak</span>
              <span className="font-semibold text-slate-800">{payslip.pph21_method}</span>
            </div>
          </div>

          {/* Dual Columns: Earnings vs Deductions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
            {/* EARNINGS */}
            <div className="border border-slate-200 rounded-xl p-4 bg-white flex flex-col justify-between shadow-xs">
              <div>
                <h4 className="font-bold text-slate-900 border-b border-slate-100 pb-2 mb-3 text-sm flex items-center justify-between">
                  <span>PENGHASILAN (EARNINGS)</span>
                  <span className="text-[11px] font-normal text-slate-500">Rupiah</span>
                </h4>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Gaji Pokok</span>
                    <span className="font-medium">{formatRupiah(payslip.base_salary)}</span>
                  </div>
                  {payslip.prorated_salary !== payslip.base_salary && (
                    <div className="flex justify-between text-blue-600 font-medium">
                      <span>Penyesuaian Prorata ({payslip.days_worked} hari)</span>
                      <span>{formatRupiah(payslip.prorated_salary)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-slate-600">Tunjangan Tetap</span>
                    <span className="font-medium">{formatRupiah(payslip.fixed_allowance)}</span>
                  </div>
                  {payslip.overtime_pay > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-600">Upah Lembur ({payslip.overtime_hours} jam)</span>
                      <span className="font-medium text-emerald-600">{formatRupiah(payslip.overtime_pay)}</span>
                    </div>
                  )}
                  {payslip.attendance_bonus > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-600">Bonus Kehadiran</span>
                      <span className="font-medium text-emerald-600">{formatRupiah(payslip.attendance_bonus)}</span>
                    </div>
                  )}
                  {payslip.commission_bonus > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-600">Komisi / Bonus Performa</span>
                      <span className="font-medium text-emerald-600">{formatRupiah(payslip.commission_bonus)}</span>
                    </div>
                  )}
                  {payslip.reimbursement_amount > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-600">Klaim Reimbursement</span>
                      <span className="font-medium">{formatRupiah(payslip.reimbursement_amount)}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="border-t border-slate-200 pt-3 mt-4 flex justify-between font-bold text-slate-900 text-sm">
                <span>Total Penghasilan Bruto</span>
                <span>{formatRupiah(payslip.gross_earnings)}</span>
              </div>
            </div>

            {/* DEDUCTIONS */}
            <div className="border border-slate-200 rounded-xl p-4 bg-white flex flex-col justify-between shadow-xs">
              <div>
                <h4 className="font-bold text-slate-900 border-b border-slate-100 pb-2 mb-3 text-sm flex items-center justify-between">
                  <span>POTONGAN (DEDUCTIONS)</span>
                  <span className="text-[11px] font-normal text-slate-500">Rupiah</span>
                </h4>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-600">BPJS Kesehatan (1%)</span>
                    <span className="font-medium text-rose-600">{formatRupiah(payslip.bpjs_kes_employee)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">BPJS Ketenagakerjaan JHT (2%)</span>
                    <span className="font-medium text-rose-600">{formatRupiah(payslip.bpjs_jht_employee)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">BPJS Ketenagakerjaan JP (1%)</span>
                    <span className="font-medium text-rose-600">{formatRupiah(payslip.bpjs_jp_employee)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Pajak PPh 21 ({payslip.pph21_method})</span>
                    <span className="font-medium text-rose-600">{formatRupiah(payslip.pph21_amount)}</span>
                  </div>
                  {payslip.kasbon_deduction > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-600">Cicilan Kasbon</span>
                      <span className="font-medium text-rose-600">{formatRupiah(payslip.kasbon_deduction)}</span>
                    </div>
                  )}
                  {payslip.late_deduction > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-600">Potongan Terlambat</span>
                      <span className="font-medium text-rose-600">{formatRupiah(payslip.late_deduction)}</span>
                    </div>
                  )}
                  {payslip.unpaid_leave_deduction > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-600">Potongan Cuti Tidak Berbayar</span>
                      <span className="font-medium text-rose-600">{formatRupiah(payslip.unpaid_leave_deduction)}</span>
                    </div>
                  )}
                  {payslip.other_deductions > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-600">Lain-lain ({payslip.other_deductions_reason || 'Koreksi'})</span>
                      <span className="font-medium text-rose-600">{formatRupiah(payslip.other_deductions)}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="border-t border-slate-200 pt-3 mt-4 flex justify-between font-bold text-rose-600 text-sm">
                <span>Total Potongan</span>
                <span>{formatRupiah(payslip.total_deductions)}</span>
              </div>
            </div>
          </div>

          {/* Highlighted Take Home Pay */}
          <div className="bg-blue-50 border-2 border-blue-600 rounded-xl p-5 flex items-center justify-between text-blue-950">
            <div>
              <span className="text-xs uppercase font-bold tracking-wider text-blue-800">
                Gaji Bersih Diterima (Take Home Pay)
              </span>
              <p className="text-xs text-blue-700 mt-0.5">
                Ditransfer ke rekening {payslip.bank_name} - {payslip.bank_account_number}
              </p>
            </div>
            <div className="text-2xl font-black text-blue-700 tracking-tight">
              {formatRupiah(payslip.take_home_pay)}
            </div>
          </div>

          {/* Employer Cost Transparency Box */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-[11px] text-slate-600">
            <span className="font-bold text-slate-700 block mb-1">
              Informasi Kontribusi Perusahaan (Employer Cost - Bukan Pemotong Gaji):
            </span>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              <div>BPJS Kes (4%): <strong className="text-slate-800">{formatRupiah(payslip.bpjs_kes_employer)}</strong></div>
              <div>BPJS JHT (3.7%): <strong className="text-slate-800">{formatRupiah(payslip.bpjs_jht_employer)}</strong></div>
              <div>BPJS JP (2%): <strong className="text-slate-800">{formatRupiah(payslip.bpjs_jp_employer)}</strong></div>
              <div>BPJS JKK (0.24%): <strong className="text-slate-800">{formatRupiah(payslip.bpjs_jkk_employer)}</strong></div>
              <div>BPJS JKM (0.3%): <strong className="text-slate-800">{formatRupiah(payslip.bpjs_jkm_employer)}</strong></div>
            </div>
            <div className="mt-2 text-slate-500 border-t border-slate-200 pt-2 flex justify-between">
              <span>Total Beban Biaya Perusahaan (Total Employer Cost):</span>
              <span className="font-bold text-slate-800">{formatRupiah(payslip.total_employer_cost)}</span>
            </div>
          </div>

          {/* Signatures */}
          <div className="grid grid-cols-2 gap-8 pt-6 text-center text-xs text-slate-700">
            <div>
              <p className="text-slate-500 mb-14">Diterima oleh (Penerima)</p>
              <p className="font-bold border-t border-slate-300 pt-1 inline-block min-w-44">
                {payslip.employee_name}
              </p>
            </div>
            <div>
              <p className="text-slate-500 mb-14">Disahkan oleh (HR / Finance)</p>
              <p className="font-bold border-t border-slate-300 pt-1 inline-block min-w-44">
                {payslip.company_name || 'PT Nusantara Digital Kreasi'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
