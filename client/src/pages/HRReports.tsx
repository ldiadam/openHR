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
  ShieldCheck,
  Activity,
} from 'lucide-react';
import { downloadFile, getLocalDateString, getLocalMonthString } from '../api';
import { useLanguage } from '../context/LanguageContext';
import { MobileYearPicker } from '../components/pickers/MobileYearPicker';

export const HRReports: React.FC = () => {
  const { t, tr } = useLanguage();
  const [selectedMonth, setSelectedMonth] = useState(getLocalMonthString());
  const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));
  const [downloadingIdx, setDownloadingIdx] = useState<number | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const reportsList = [
    {
      title: t.reports.repAttendance,
      description: t.reports.repAttendanceDesc,
      icon: Calendar,
      tag: t.nav.attendance,
      color: 'text-blue-700 bg-blue-50 border-blue-200',
      actionUrl: `/reports/attendance-recap?month=${selectedMonth}&export=excel`,
      filename: `Rekap_Presensi_${selectedMonth}.xlsx`,
    },
    {
      title: t.reports.repPayroll,
      description: t.reports.repPayrollDesc,
      icon: DollarSign,
      tag: t.nav.payroll,
      color: 'text-emerald-700 bg-emerald-50 border-emerald-200',
      actionUrl: `/reports/payroll-recap?export=excel`,
      filename: `Rekap_Penggajian.xlsx`,
    },
    {
      title: t.reports.repHeadcount,
      description: t.reports.repHeadcountDesc,
      icon: Users,
      tag: t.nav.employees,
      color: 'text-indigo-700 bg-indigo-50 border-indigo-200',
      actionUrl: `/reports/headcount?export=excel`,
      filename: `Laporan_Headcount.xlsx`,
    },
    {
      title: t.reports.repTaxBpjs,
      description: t.reports.repTaxBpjsDesc,
      icon: HeartPulse,
      tag: 'Statutory',
      color: 'text-rose-700 bg-rose-50 border-rose-200',
      actionUrl: `/reports/bpjs-tax-export?export=excel`,
      filename: `Export_BPJS_PPh21.xlsx`,
    },
    {
      title: tr('Bukti Potong 1721-A1', '1721-A1 Tax Certificate'),
      description: tr(
        'Rekap PPh 21 setahun per karyawan: bruto, biaya jabatan, iuran pensiun, PTKP, PKP, dan pajak terpotong.',
        'Annual PPh 21 recap per employee: gross, occupational cost, pension, PTKP, taxable income, and tax withheld.'
      ),
      icon: ShieldCheck,
      tag: 'PPh 21',
      color: 'text-violet-700 bg-violet-50 border-violet-200',
      actionUrl: `/reports/pph21-1721a1?year=${selectedYear}`,
      filename: `Bukti_Potong_1721A1_${selectedYear}.xlsx`,
    },
    {
      title: tr('Laporan BPJS per Program', 'BPJS Report by Program'),
      description: tr(
        'Iuran Kesehatan, JHT, JP, JKK, dan JKM dipisah per lembar beserta total karyawan dan perusahaan.',
        'Health, JHT, JP, JKK, and JKM contributions split by sheet with employee and employer totals.'
      ),
      icon: Activity,
      tag: 'BPJS',
      color: 'text-cyan-700 bg-cyan-50 border-cyan-200',
      actionUrl: `/reports/bpjs-programs?month=${selectedMonth}`,
      filename: `Laporan_BPJS_${selectedMonth}.xlsx`,
    },
    {
      title: t.reports.repLeave,
      description: t.reports.repLeaveDesc,
      icon: FileSpreadsheet,
      tag: t.nav.leave,
      color: 'text-amber-700 bg-amber-50 border-amber-200',
      actionUrl: `/reports/leave-balances?export=excel`,
      filename: `Laporan_Sisa_Cuti.xlsx`,
    },
    {
      title: t.reports.repBackup,
      description: t.reports.repBackupDesc,
      icon: Database,
      tag: 'Database',
      color: 'text-slate-800 bg-slate-100 border-slate-300',
      actionUrl: `/reports/backup-data`,
      filename: `openhr_backup_${getLocalDateString()}.json`,
    },
  ];

  const handleDownload = async (idx: number, url: string, filename: string) => {
    setDownloadingIdx(idx);
    setStatusMsg(null);
    try {
      await downloadFile(url, filename);
      setStatusMsg({ type: 'success', text: tr(`Berhasil mengunduh "${filename}"`, `Downloaded "${filename}"`) });
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || tr('Unduhan gagal', 'Download failed') });
    } finally {
      setDownloadingIdx(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">{t.reports.title}</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {t.reports.subtitle}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-xs font-medium text-slate-600">{t.reports.attendanceMonth}</span>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="text-xs font-semibold border-0 p-0 text-slate-900 focus:ring-0 bg-transparent"
            />
          </div>
          <div className="w-28">
            <MobileYearPicker value={selectedYear} onChange={setSelectedYear} />
          </div>
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
            {t.common.close}
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
                      <span>{t.common.downloading}</span>
                    </>
                  ) : (
                    <>
                      <ArrowDownToLine size={13} />
                      <span>{t.reports.downloadFile}</span>
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
