import React, { useState } from 'react';
import {
  FileSpreadsheet,
  Download,
  Calendar,
  Users,
  DollarSign,
  HeartPulse,
  Database,
  ArrowDownToLine,
} from 'lucide-react';

export const HRReports: React.FC = () => {
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().substring(0, 7));

  const reportsList = [
    {
      title: 'Rekap Presensi Bulanan (Excel)',
      description: 'Laporan kehadiran, keterlambatan, cuti, sakit, dan alpha per karyawan dan departemen.',
      icon: Calendar,
      color: 'text-blue-600 bg-blue-50 border-blue-200',
      actionUrl: `/api/reports/attendance-recap?month=${selectedMonth}&export=excel`,
      needsMonth: true,
      filename: `Rekap_Presensi_${selectedMonth}.xlsx`,
    },
    {
      title: 'Rekap Penggajian (Payroll Recap Excel)',
      description: 'Gaji pokok, tunjangan, lembur, potongan BPJS & PPh 21, gaji bersih, dan total beban perusahaan.',
      icon: DollarSign,
      color: 'text-emerald-600 bg-emerald-50 border-emerald-200',
      actionUrl: `/api/reports/payroll-recap?export=excel`,
      needsMonth: false,
      filename: `Rekap_Penggajian.xlsx`,
    },
    {
      title: 'Laporan Headcount & Status Karyawan',
      description: 'Jumlah karyawan aktif, PKWT, PKWTT, probation, dan riwayat karyawan keluar.',
      icon: Users,
      color: 'text-purple-600 bg-purple-50 border-purple-200',
      actionUrl: `/api/reports/headcount?export=excel`,
      needsMonth: false,
      filename: `Laporan_Headcount.xlsx`,
    },
    {
      title: 'Ekspor Pajak & BPJS (Form 1721 Disnaker)',
      description: 'Data pelaporan PPh 21 TER, iuran BPJS Kesehatan dan BPJS Ketenagakerjaan untuk pelaporan resmi.',
      icon: HeartPulse,
      color: 'text-rose-600 bg-rose-50 border-rose-200',
      actionUrl: `/api/reports/bpjs-tax-export?export=excel`,
      needsMonth: false,
      filename: `Export_BPJS_PPh21.xlsx`,
    },
    {
      title: 'Laporan Hak & Sisa Cuti Karyawan',
      description: 'Daftar hak cuti tahunan, cuti terpakai, penyesuaian HR, dan sisa cuti per departemen.',
      icon: FileSpreadsheet,
      color: 'text-amber-600 bg-amber-50 border-amber-200',
      actionUrl: `/api/reports/leave-balances?export=excel`,
      needsMonth: false,
      filename: `Laporan_Sisa_Cuti.xlsx`,
    },
    {
      title: 'Cadangan Seluruh Data Perusahaan (Backup JSON)',
      description: 'Ekspor lengkap database perusahaan (karyawan, presensi, cuti, penggajian, dan setting) untuk cadangan.',
      icon: Database,
      color: 'text-slate-700 bg-slate-100 border-slate-300',
      actionUrl: `/api/reports/backup-data`,
      needsMonth: false,
      filename: `openhr_backup_${new Date().toISOString().split('T')[0]}.json`,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Pusat Laporan & Ekspor Excel</h1>
          <p className="text-xs text-slate-500">
            Setiap laporan dapat langsung diunduh ke format Excel (.xlsx) siap pakai untuk Disnaker, BPJS, dan Pajak
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-600">Periode Bulan:</span>
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="text-xs font-bold border border-slate-300 rounded-xl px-3 py-2 bg-white shadow-2xs"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {reportsList.map((rep, idx) => {
          const Icon = rep.icon;
          return (
            <div
              key={idx}
              className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-2xs hover:border-blue-400 transition flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className={`p-3 rounded-2xl border ${rep.color}`}>
                    <Icon size={22} />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50 px-2 py-0.5 rounded border border-slate-100">
                    Excel Export
                  </span>
                </div>
                <h3 className="font-extrabold text-slate-900 text-sm">{rep.title}</h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">{rep.description}</p>
              </div>

              <div className="pt-5 mt-4 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[11px] text-slate-400 font-mono truncate max-w-44">
                  {rep.filename}
                </span>
                <a
                  href={rep.actionUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-blue-600 text-white rounded-xl text-xs font-bold shadow-xs transition"
                >
                  <ArrowDownToLine size={14} />
                  <span>Unduh File</span>
                </a>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
