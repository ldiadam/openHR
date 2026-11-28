import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { X, Download, RotateCw, ShieldCheck, Building2, MapPin, Calendar } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useCompany } from '../context/CompanyContext';
import { getToken } from '../api';
import { buildVerifyBadgeUrl, downloadEmployeeIdCardPdf, IdCardEmployee } from '../utils/idCardPdf';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  employee: IdCardEmployee | null;
}

export const EmployeeIdCardModal: React.FC<Props> = ({ isOpen, onClose, employee }) => {
  const { tr, formatDate } = useLanguage();
  const { company, companyName, logoUrl, palette } = useCompany();
  const [side, setSide] = useState<'front' | 'back'>('front');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [downloading, setDownloading] = useState(false);

  const photoFetchUrl = employee?.photo_url
    ? `${employee.photo_url}${employee.photo_url.includes('?') ? '&' : '?'}token=${encodeURIComponent(getToken() || '')}`
    : null;

  useEffect(() => {
    if (!isOpen || !employee) return;
    setSide('front');
    const url = buildVerifyBadgeUrl(employee);
    QRCode.toDataURL(url, { width: 240, margin: 1 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''));
  }, [isOpen, employee?.id, employee?.badge_token]);

  if (!isOpen || !employee) return null;

  const isActive = ['active', 'probation', 'on_leave'].includes(String(employee.lifecycle_status || 'active').toLowerCase());
  const initials = (employee.full_name || 'U')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  const handleDownloadPdf = async () => {
    setDownloading(true);
    try {
      await downloadEmployeeIdCardPdf(
        employee,
        {
          name: companyName,
          legal_name: company?.legal_name,
          logo_url: logoUrl,
          primary_color: palette.primary,
          address: company?.address,
          phone: company?.phone,
          email: company?.email,
        },
        photoFetchUrl
      );
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[92vh] w-full max-w-sm flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <div>
            <h3 className="text-sm font-black text-slate-900">
              {tr('Kartu Identitas Karyawan', 'Employee ID Card')}
            </h3>
            <p className="text-[11px] text-slate-500">
              {side === 'front' ? tr('Tampak Depan', 'Front Side') : tr('Tampak Belakang', 'Back Side')} · {employee.nik}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-100/80 p-5 flex flex-col items-center">
          {/* CR80 Vertical Badge */}
          <div className="w-[272px] overflow-hidden rounded-[26px] border border-slate-200/90 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.16)]">
            {side === 'front' ? (
              <div className="flex flex-col items-center pb-4">
                {/* Brand Header + Lanyard Slot */}
                <div
                  style={{ background: palette.gradient }}
                  className="relative flex w-full flex-col items-center px-4 pt-3 pb-12 text-white"
                >
                  <div className="mb-3 h-2 w-12 rounded-full bg-white/85 shadow-inner" />
                  <div className="flex items-center gap-2 max-w-full">
                    {logoUrl && (
                      <div className="h-7 w-7 shrink-0 overflow-hidden rounded-lg bg-white p-0.5 shadow-xs">
                        <img src={logoUrl} alt={companyName} className="h-full w-full object-contain" />
                      </div>
                    )}
                    <span className="truncate text-xs font-black tracking-wide uppercase">
                      {companyName}
                    </span>
                  </div>
                </div>

                {/* Employee Avatar */}
                <div className="-mt-10 relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl border-4 border-white bg-slate-100 shadow-lg">
                  {photoFetchUrl ? (
                    <img src={photoFetchUrl} alt={employee.full_name || ''} className="h-full w-full object-cover" />
                  ) : (
                    <span style={{ color: palette.primary }} className="text-2xl font-black">
                      {initials}
                    </span>
                  )}
                </div>

                {/* Identity */}
                <div className="mt-3 px-4 text-center">
                  <h4 className="text-base font-black leading-snug text-slate-900">
                    {employee.full_name}
                  </h4>
                  <p className="mt-0.5 text-xs font-semibold text-slate-500">
                    {employee.job_title || tr('Karyawan', 'Employee')}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
                    {employee.level_code && (
                      <span
                        style={{ backgroundColor: palette.primarySoft, color: palette.primary }}
                        className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                      >
                        {employee.level_code}
                      </span>
                    )}
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                      }`}
                    >
                      <ShieldCheck size={10} />
                      {isActive ? tr('Aktif', 'Active') : tr('Nonaktif', 'Inactive')}
                    </span>
                  </div>
                </div>

                {/* NIK & Dept Pill */}
                <div className="mt-3 w-[calc(100%-32px)] rounded-2xl bg-slate-50 px-3 py-2 text-center border border-slate-100">
                  <div className="font-mono text-xs font-black tracking-wider text-slate-900">
                    {employee.nik || '-'}
                  </div>
                  <div className="truncate text-[10px] font-medium text-slate-500">
                    {employee.department_name || employee.branch_name || '-'}
                  </div>
                </div>

                {/* QR Verification */}
                {qrDataUrl && (
                  <div className="mt-3 flex flex-col items-center">
                    <div className="rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xs">
                      <img src={qrDataUrl} alt="ID Verification QR" className="h-20 w-20" />
                    </div>
                    <span className="mt-1 text-[9px] font-bold uppercase tracking-widest text-slate-400">
                      {tr('Pindai untuk Verifikasi', 'Scan to Verify')}
                    </span>
                  </div>
                )}

                <div style={{ background: palette.gradient }} className="mt-3 h-1.5 w-full" />
              </div>
            ) : (
              <div className="flex flex-col justify-between min-h-[420px]">
                <div>
                  <div
                    style={{ background: palette.gradient }}
                    className="px-4 py-3 text-center text-[11px] font-black tracking-wider text-white uppercase"
                  >
                    {tr('Informasi Karyawan', 'Employee Credentials')}
                  </div>

                  <div className="space-y-2.5 p-4 text-xs">
                    <div className="flex items-start gap-2">
                      <Building2 size={14} className="mt-0.5 text-slate-400 shrink-0" />
                      <div>
                        <div className="text-[10px] text-slate-400">{tr('Departemen', 'Department')}</div>
                        <div className="font-bold text-slate-800">{employee.department_name || '-'}</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <MapPin size={14} className="mt-0.5 text-slate-400 shrink-0" />
                      <div>
                        <div className="text-[10px] text-slate-400">{tr('Kantor / Cabang', 'Office / Branch')}</div>
                        <div className="font-bold text-slate-800">{employee.branch_name || '-'}</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <Calendar size={14} className="mt-0.5 text-slate-400 shrink-0" />
                      <div>
                        <div className="text-[10px] text-slate-400">{tr('Tanggal Bergabung', 'Join Date')}</div>
                        <div className="font-bold text-slate-800">{employee.join_date ? formatDate(employee.join_date) : '-'}</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="px-4 pb-4 flex flex-col items-center text-center">
                  {qrDataUrl && (
                    <div className="rounded-xl border border-slate-200 bg-white p-1.5 mb-2">
                      <img src={qrDataUrl} alt="Verify QR" className="h-24 w-24" />
                    </div>
                  )}
                  <p className="text-[10px] leading-relaxed text-slate-500">
                    {tr(
                      `Kartu ini milik ${companyName}. Apabila ditemukan, harap kembalikan ke kantor kami.`,
                      `Property of ${companyName}. If found, please return to our office.`
                    )}
                  </p>
                  {(company?.phone || company?.address) && (
                    <p className="mt-1 text-[9px] text-slate-400">
                      {[company?.phone, company?.address].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>

                <div style={{ background: palette.gradient }} className="h-1.5 w-full" />
              </div>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-slate-100 bg-white px-5 py-3.5">
          <button
            type="button"
            onClick={() => setSide(side === 'front' ? 'back' : 'front')}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            <RotateCw size={14} />
            <span>{side === 'front' ? tr('Lihat Belakang', 'Flip to Back') : tr('Lihat Depan', 'Flip to Front')}</span>
          </button>
          <button
            type="button"
            disabled={downloading}
            onClick={handleDownloadPdf}
            style={{ backgroundColor: palette.primary, color: palette.onPrimary }}
            className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold shadow-sm hover:opacity-95 disabled:opacity-50 cursor-pointer"
          >
            <Download size={14} />
            <span>{downloading ? '...' : tr('Unduh PDF', 'Print PDF')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
