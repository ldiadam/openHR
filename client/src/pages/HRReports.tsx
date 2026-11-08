import React, { useState } from 'react';
import {
  FileSpreadsheet,
  Calendar,
  Users,
  DollarSign,
  HeartPulse,
  Database,
  ArrowDownToLine,
  Loader2,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { downloadFile } from '../api';

export const HRReports: React.FC = () => {
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().substring(0, 7));
  const [downloadingIdx, setDownloadingIdx] = useState<number | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const reportsList = [
    {
      title: 'Rekap Presensi Bulanan (Excel)',
      description: 'Laporan kehadiran, keterlambatan, cuti, sakit, dan alpha per karyawan dan departemen.',
      icon: Calendar,
      tag: 'Presensi',
      color: 'text-blue-700 bg-blue-50 border-blue-200',
      actionUrl: `/reports/attendance-recap?month=${selectedMonth}&export=excel`,
      filename: `Rekap_Presensi_${selectedMonth}.xlsx`,
    },
    {
      title: 'Rekap Penggajian (Payroll Recap Excel)',
      description: 'Gaji pokok, tunjangan, lembur, potongan BPJS & PPh 21, gaji bersih, dan total beban perusahaan.',
      icon: DollarSign,
      tag: 'Penggajian',
      color: 'text-emerald-700 bg-emerald-50 border-emerald-200',
      actionUrl: `/reports/payroll-recap?export=excel`,
      filename: `Rekap_Penggajian.xlsx`,
    },
    {
      title: 'Laporan Headcount & Status Karyawan',
      description: 'Jumlah karyawan aktif, WNI / WNA (Foreign Workers), PKWT, PKWTT, probation, dan riwayat karyawan keluar.',
      icon: Users,
      tag: 'Ketenagakerjaan',
      color: 'text-indigo-700 bg-indigo-50 border-indigo-200',
      actionUrl: `/reports/headcount?export=excel`,
      filename: `Laporan_Headcount.xlsx`,
    },
    {
      title: 'Ekspor Pajak & BPJS (Form 1721 Disnaker)',
      description: 'Data pelaporan PPh 21 TER, iuran BPJS Kesehatan dan BPJS Ketenagakerjaan untuk pelaporan resmi.',
      icon: HeartPulse,
      tag: 'Kepatuhan',
      color: 'text-rose-700 bg-rose-50 border-rose-200',
      actionUrl: `/reports/bpjs-tax-export?export=excel`,
      filename: `Export_BPJS_PPh21.xlsx`,
    },
    {
      title: 'Laporan Hak & Sisa Cuti Karyawan',
      description: 'Daftar hak cuti tahunan, cuti terpakai, penyesuaian HR, dan sisa cuti per departemen.',
      icon: FileSpreadsheet,
      tag: 'Cuti',
      color: 'text-amber-700 bg-amber-50 border-amber-200',
      actionUrl: `/reports/leave-balances?export=excel`,
      filename: `Laporan_Sisa_Cuti.xlsx`,
    },
    {
      title: 'Cadangan Seluruh Data Perusahaan (Backup JSON)',
      description: 'Ekspor lengkap database perusahaan (karyawan, presensi, cuti, penggajian, dan pengaturan) untuk cadangan.',
      icon: Database,
      tag: 'Database',
      color: 'text-slate-800 bg-slate-100 border-slate-300',
      actionUrl: `/reports/backup-data`,
      filename: `openhr_backup_${new Date().toISOString().split('T')[0]}.json`,
    },
  ];

  const handleDownload = async (idx: number, url: string, filename: string) => {
    setDownloadingIdx(idx);
    setStatusMsg(null);
    try {
      await downloadFile(url, filename);
      setStatusMsg({ type: 'success', text: `Berhasil mengunduh "${filename}"` });
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Gagal mengunduh file laporan' });
    } finally {
      setDownloadingIdx(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Pusat Laporan & Ekspor Data</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Unduh rekapan terverifikasi format Excel (.xlsx) dan cadangan data resmi siap audit.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-xs font-medium text-slate-600">Periode Presensi:</span>
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="text-xs font-semibold border-0 p-0 text-slate-900 focus:ring-0 bg-transparent"
          />
        </div>
      </div>

      {statusMsg && (
        <div
          className={`p-3.5 rounded-xl text-xs flex items-center justify-between border ${
            statusMsg.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
              : 'bg-rose-50 text-rose-900 border-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusMsg.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            <span>{statusMsg.text}</span>
          </div>
          <button
            onClick={() => setStatusMsg(null)}
            className="text-xs font-medium underline opacity-80 hover:opacity-100"
          >
            Tutup
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {reportsList.map((rep, idx) => {
          const Icon = rep.icon;
          const isDownloading = downloadingIdx === idx;

          return (
            <div
              key={idx}
              className="bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs hover:border-slate-300 transition flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className={`p-2.5 rounded-xl border ${rep.color}`}>
                    <Icon size={18} />
                  </div>
                  <span className="text-[10px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                    {rep.tag}
                  </span>
                </div>
                <h3 className="font-bold text-slate-900 text-sm">{rep.title}</h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">{rep.description}</p>
              </div>

              <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[11px] text-slate-400 font-mono truncate max-w-44">
                  {rep.filename}
                </span>
                <button
                  type="button"
                  disabled={isDownloading}
                  onClick={() => handleDownload(idx, rep.actionUrl, rep.filename)}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition cursor-pointer shadow-2xs"
                >
                  {isDownloading ? (
                    <>
                      <Loader2 size={13} className="animate-spin" />
                      <span>Mengunduh...</span>
                    </>
                  ) : (
                    <>
                      <ArrowDownToLine size={13} />
                      <span>Unduh File</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
