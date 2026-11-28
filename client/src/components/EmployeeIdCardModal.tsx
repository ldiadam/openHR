import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  X,
  Download,
  RotateCw,
  ShieldCheck,
  Building2,
  MapPin,
  Calendar,
  Link2,
  Plus,
  Trash2,
  ExternalLink,
  Check,
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useCompany } from '../context/CompanyContext';
import { apiFetch, getToken } from '../api';
import {
  buildVerifyBadgeUrl,
  downloadEmployeeIdCardPdf,
  EmployeeCardLink,
  IdCardEmployee,
} from '../utils/idCardPdf';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  employee: IdCardEmployee | null;
  canEdit?: boolean;
  onLinksUpdated?: (bio: string | null, links: EmployeeCardLink[]) => void;
}

const LINK_PRESETS: Array<{ type: string; label: string; placeholder: string }> = [
  { type: 'whatsapp', label: 'WhatsApp', placeholder: '+6281234567890' },
  { type: 'email', label: 'Email', placeholder: 'name@company.com' },
  { type: 'phone', label: 'Phone', placeholder: '+6281234567890' },
  { type: 'linkedin', label: 'LinkedIn', placeholder: 'https://linkedin.com/in/username' },
  { type: 'instagram', label: 'Instagram', placeholder: 'https://instagram.com/username' },
  { type: 'website', label: 'Website', placeholder: 'https://yourwebsite.com' },
  { type: 'custom', label: 'Custom Link', placeholder: 'https://...' },
];

export const EmployeeIdCardModal: React.FC<Props> = ({
  isOpen,
  onClose,
  employee,
  canEdit = true,
  onLinksUpdated,
}) => {
  const { tr, formatDate } = useLanguage();
  const { company, companyName, logoUrl, palette } = useCompany();
  const [side, setSide] = useState<'front' | 'back'>('front');
  const [editingLinks, setEditingLinks] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [downloading, setDownloading] = useState(false);
  const [savingLinks, setSavingLinks] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  const [bio, setBio] = useState('');
  const [links, setLinks] = useState<EmployeeCardLink[]>([]);

  const photoFetchUrl = employee?.photo_url
    ? `${employee.photo_url}${employee.photo_url.includes('?') ? '&' : '?'}token=${encodeURIComponent(getToken() || '')}`
    : null;

  const badgeUrl = employee ? buildVerifyBadgeUrl(employee) : '';

  useEffect(() => {
    if (!isOpen || !employee) return;
    setSide('front');
    setEditingLinks(false);
    setSavedNotice(false);
    setBio(employee.card_bio || '');
    setLinks(Array.isArray(employee.card_links) ? employee.card_links : []);
    QRCode.toDataURL(buildVerifyBadgeUrl(employee), { width: 240, margin: 1 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''));
  }, [isOpen, employee?.id, employee?.badge_token]);

  if (!isOpen || !employee) return null;

  const isActive = ['active', 'probation', 'on_leave'].includes(
    String(employee.lifecycle_status || 'active').toLowerCase()
  );
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

  const addPresetLink = (preset: { type: string; label: string }) => {
    let defaultVal = '';
    if (preset.type === 'email' && employee.company_email) defaultVal = employee.company_email;
    if ((preset.type === 'phone' || preset.type === 'whatsapp') && employee.phone) defaultVal = employee.phone;
    setLinks((prev) => [...prev, { type: preset.type, label: preset.label, value: defaultVal }]);
  };

  const handleSaveLinks = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingLinks(true);
    setSavedNotice(false);
    try {
      const cleaned = links
        .map((l) => ({
          type: l.type || 'custom',
          label: (l.label || '').trim() || l.type || 'Link',
          value: (l.value || '').trim(),
        }))
        .filter((l) => Boolean(l.value));

      const res = await apiFetch(`/employees/${employee.id}/card-links`, {
        method: 'PUT',
        body: JSON.stringify({
          card_bio: bio.trim() || null,
          card_links: cleaned,
        }),
      });
      setLinks(res.card_links || []);
      setBio(res.card_bio || '');
      onLinksUpdated?.(res.card_bio || null, res.card_links || []);
      setSavedNotice(true);
      setTimeout(() => {
        setSavedNotice(false);
        setEditingLinks(false);
      }, 650);
    } catch (err: any) {
      alert(err.message || tr('Gagal menyimpan tautan.', 'Failed to save links.'));
    } finally {
      setSavingLinks(false);
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
              {editingLinks
                ? tr('Tautan Kartu (Linktree)', 'Card Links (Linktree)')
                : tr('Kartu Identitas Karyawan', 'Employee ID Card')}
            </h3>
            <p className="text-[11px] text-slate-500">
              {editingLinks
                ? tr('Atur kontak & link saat QR dipindai', 'Customize contacts & links shown when QR is scanned')
                : `${side === 'front' ? tr('Tampak Depan', 'Front Side') : tr('Tampak Belakang', 'Back Side')} · ${employee.nik}`}
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

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-100/80 p-5">
          {editingLinks ? (
            <form id="card-links-form" onSubmit={handleSaveLinks} className="space-y-3.5 text-xs">
              <div className="rounded-2xl border border-slate-200 bg-white p-3.5 space-y-2">
                <label className="block font-bold text-slate-700">
                  {tr('Bio / Headline Singkat', 'Short Bio / Headline')}
                </label>
                <input
                  type="text"
                  maxLength={200}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder={tr('Contoh: Siap membantu untuk kerja sama & proyek', 'e.g. Reach out for partnerships & projects')}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs"
                />
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-700">{tr('Tambah Cepat', 'Quick Add')}</span>
                  {badgeUrl && (
                    <a
                      href={badgeUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:underline"
                    >
                      <ExternalLink size={11} />
                      {tr('Pratinjau', 'Preview')}
                    </a>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {LINK_PRESETS.map((preset) => (
                    <button
                      key={preset.type}
                      type="button"
                      onClick={() => addPresetLink(preset)}
                      className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
                    >
                      <Plus size={11} />
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                {links.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 p-4 text-center text-[11px] text-slate-400">
                    {tr('Belum ada tautan ditambahkan. Klik tombol di atas untuk menambah.', 'No links added yet. Tap a preset above to add.')}
                  </div>
                ) : (
                  links.map((item, idx) => {
                    const preset = LINK_PRESETS.find((p) => p.type === item.type);
                    return (
                      <div key={idx} className="rounded-2xl border border-slate-200 bg-white p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <select
                            value={item.type}
                            onChange={(e) => {
                              const nextType = e.target.value;
                              const p = LINK_PRESETS.find((x) => x.type === nextType);
                              setLinks((prev) =>
                                prev.map((row, i) =>
                                  i === idx ? { ...row, type: nextType, label: p?.label || row.label } : row
                                )
                              );
                            }}
                            className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-bold text-slate-700"
                          >
                            {LINK_PRESETS.map((p) => (
                              <option key={p.type} value={p.type}>{p.label}</option>
                            ))}
                          </select>
                          <input
                            type="text"
                            value={item.label}
                            onChange={(e) =>
                              setLinks((prev) => prev.map((row, i) => (i === idx ? { ...row, label: e.target.value } : row)))
                            }
                            placeholder={tr('Label tombol', 'Button label')}
                            className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-semibold"
                          />
                          <button
                            type="button"
                            onClick={() => setLinks((prev) => prev.filter((_, i) => i !== idx))}
                            className="rounded-lg p-1 text-rose-500 hover:bg-rose-50 cursor-pointer"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                        <input
                          type="text"
                          value={item.value}
                          onChange={(e) =>
                            setLinks((prev) => prev.map((row, i) => (i === idx ? { ...row, value: e.target.value } : row)))
                          }
                          placeholder={preset?.placeholder || 'https://...'}
                          className="w-full rounded-xl border border-slate-200 px-2.5 py-1.5 font-mono text-[11px]"
                        />
                      </div>
                    );
                  })
                )}
              </div>
            </form>
          ) : (
            <div className="flex flex-col items-center">
              {/* 3D Flip Container */}
              <div
                onClick={() => setSide(side === 'front' ? 'back' : 'front')}
                style={{ perspective: '1100px' }}
                className="w-[272px] cursor-pointer select-none"
                title={tr('Ketuk kartu untuk membalik', 'Tap card to flip')}
              >
                <div
                  style={{
                    transformStyle: 'preserve-3d',
                    transition: 'transform 560ms cubic-bezier(0.22, 1, 0.36, 1)',
                    transform: side === 'back' ? 'rotateY(180deg)' : 'rotateY(0deg)',
                  }}
                  className="grid w-full"
                >
                  {/* FRONT FACE */}
                  <div
                    style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
                    className="col-start-1 row-start-1 overflow-hidden rounded-[26px] border border-slate-200/90 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.16)]"
                  >
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

                      {/* QR Linktree */}
                      {qrDataUrl && (
                        <div className="mt-3 flex flex-col items-center">
                          <div className="rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xs">
                            <img src={qrDataUrl} alt="Employee Linktree QR" className="h-20 w-20" />
                          </div>
                        </div>
                      )}

                      <div style={{ background: palette.gradient }} className="mt-3 h-1.5 w-full" />
                    </div>
                  </div>

                  {/* BACK FACE */}
                  <div
                    style={{
                      backfaceVisibility: 'hidden',
                      WebkitBackfaceVisibility: 'hidden',
                      transform: 'rotateY(180deg)',
                    }}
                    className="col-start-1 row-start-1 flex flex-col justify-between overflow-hidden rounded-[26px] border border-slate-200/90 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.16)]"
                  >
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
                            <div className="font-bold text-slate-800">
                              {employee.join_date ? formatDate(employee.join_date) : '-'}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="px-4 pb-4 flex flex-col items-center text-center">
                      {qrDataUrl && (
                        <div className="rounded-xl border border-slate-200 bg-white p-1.5 mb-2">
                          <img src={qrDataUrl} alt="Employee Linktree QR" className="h-24 w-24" />
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
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-slate-100 bg-white px-4 py-3">
          {editingLinks ? (
            <>
              <button
                type="button"
                onClick={() => setEditingLinks(false)}
                className="rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                {tr('Kembali', 'Back')}
              </button>
              <button
                type="submit"
                form="card-links-form"
                disabled={savingLinks}
                style={{ backgroundColor: palette.primary, color: palette.onPrimary }}
                className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold shadow-sm hover:opacity-95 disabled:opacity-50 cursor-pointer"
              >
                {savedNotice && <Check size={14} />}
                <span>
                  {savingLinks
                    ? tr('Menyimpan...', 'Saving...')
                    : savedNotice
                      ? tr('Tersimpan', 'Saved')
                      : tr('Simpan Tautan', 'Save Links')}
                </span>
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setSide(side === 'front' ? 'back' : 'front')}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  <RotateCw size={14} />
                  <span>{tr('Balik', 'Flip')}</span>
                </button>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => setEditingLinks(true)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    <Link2 size={14} />
                    <span>{tr('Tautan QR', 'QR Links')}</span>
                  </button>
                )}
              </div>
              <button
                type="button"
                disabled={downloading}
                onClick={handleDownloadPdf}
                style={{ backgroundColor: palette.primary, color: palette.onPrimary }}
                className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold shadow-sm hover:opacity-95 disabled:opacity-50 cursor-pointer"
              >
                <Download size={14} />
                <span>{downloading ? '...' : 'PDF'}</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
