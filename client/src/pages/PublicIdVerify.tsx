import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  Building2,
  MapPin,
  Mail,
  Phone,
  Globe,
  ExternalLink,
  MessageCircle,
  UserPlus,
  Share2,
  AlertCircle,
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { generateThemePalette } from '../utils/themePalette';

interface CardLink {
  type: string;
  label: string;
  value: string;
}

function buildHref(link: CardLink): string {
  const val = (link.value || '').trim();
  if (!val) return '#';
  switch (link.type) {
    case 'whatsapp': {
      if (/^https?:\/\//i.test(val)) return val;
      let digits = val.replace(/\D/g, '');
      if (digits.startsWith('0')) digits = `62${digits.slice(1)}`;
      return `https://wa.me/${digits}`;
    }
    case 'email':
      return val.startsWith('mailto:') ? val : `mailto:${val}`;
    case 'phone':
      return val.startsWith('tel:') ? val : `tel:${val}`;
    default:
      return /^https?:\/\//i.test(val) ? val : `https://${val}`;
  }
}

function linkIcon(type: string) {
  switch (type) {
    case 'whatsapp':
      return <MessageCircle size={18} className="text-emerald-600" />;
    case 'email':
      return <Mail size={18} className="text-blue-600" />;
    case 'phone':
      return <Phone size={18} className="text-indigo-600" />;
    default:
      return <Globe size={18} className="text-slate-600" />;
  }
}

export const PublicIdVerify: React.FC = () => {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const { tr } = useLanguage();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!id) {
      setError(tr('Tautan profil tidak valid.', 'Invalid profile link.'));
      setLoading(false);
      return;
    }
    const qs = token ? `?token=${encodeURIComponent(token)}` : '';
    fetch(`/api/public/id-card/${encodeURIComponent(id)}${qs}`)
      .then(async (res) => {
        const json = (await res.json().catch(() => ({}))) as any;
        if (!res.ok) throw new Error(json.error || 'Failed to load profile');
        setData(json);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id, token]);

  const palette = generateThemePalette(data?.company?.primary_color);

  const handleDownloadVcard = () => {
    const emp = data?.employee;
    const comp = data?.company;
    if (!emp) return;
    const links: CardLink[] = Array.isArray(emp.card_links) ? emp.card_links : [];
    const phone = links.find((l) => l.type === 'phone' || l.type === 'whatsapp')?.value || '';
    const email = links.find((l) => l.type === 'email')?.value || emp.company_email || '';
    const website = links.find((l) => l.type === 'website')?.value || '';

    const vcf = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `FN:${emp.full_name || ''}`,
      `ORG:${comp?.name || ''}`,
      `TITLE:${emp.job_title || ''}`,
      phone ? `TEL;TYPE=CELL:${phone}` : '',
      email ? `EMAIL;TYPE=WORK:${email}` : '',
      website ? `URL:${website}` : '',
      'END:VCARD',
    ]
      .filter(Boolean)
      .join('\r\n');

    const blob = new Blob([vcf], { type: 'text/vcard;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${String(emp.full_name || 'contact').replace(/[^a-zA-Z0-9_-]+/g, '_')}.vcf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 text-xs text-slate-400">
        {tr('Memuat kartu profil...', 'Loading profile card...')}
      </div>
    );
  }

  if (error || !data?.employee) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-3xl bg-white p-8 text-center shadow-xl border border-slate-200 space-y-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
            <AlertCircle size={26} />
          </div>
          <h2 className="text-base font-black text-slate-900">{tr('Profil Tidak Ditemukan', 'Profile Not Found')}</h2>
          <p className="text-xs text-slate-500">{error}</p>
        </div>
      </div>
    );
  }

  const emp = data.employee;
  const comp = data.company;
  const rawLinks: CardLink[] = Array.isArray(emp.card_links) ? emp.card_links : [];
  const displayLinks: CardLink[] =
    rawLinks.length > 0
      ? rawLinks
      : emp.company_email
        ? [{ type: 'email', label: 'Email', value: emp.company_email }]
        : [];

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center py-8 px-4">
      <div className="w-full max-w-md rounded-[30px] bg-white shadow-[0_20px_50px_rgba(15,23,42,0.12)] border border-slate-200/80 overflow-hidden">
        {/* Branded Hero */}
        <div style={{ background: palette.gradient }} className="relative z-0 px-6 pt-7 pb-16 text-white text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3.5 py-1.5 backdrop-blur-xs">
            {comp?.logo_url && (
              <img
                src={comp.logo_url}
                alt={comp.name || 'Company'}
                className="h-4 w-4 rounded object-contain bg-white p-0.5"
              />
            )}
            <span className="text-[11px] font-bold tracking-wide uppercase">{comp?.name || 'openHR'}</span>
          </div>
        </div>

        {/* Avatar */}
        <div className="-mt-12 relative z-10 flex flex-col items-center px-6 text-center">
          <div className="h-24 w-24 overflow-hidden rounded-3xl border-4 border-white bg-white shadow-xl flex items-center justify-center">
            {emp.photo_url ? (
              <img src={emp.photo_url} alt={emp.full_name} className="h-full w-full object-cover" />
            ) : (
              <span style={{ color: palette.primary }} className="text-2xl font-black">
                {(emp.full_name || 'U').slice(0, 2).toUpperCase()}
              </span>
            )}
          </div>

          <h1 className="mt-3 text-xl font-black text-slate-900">{emp.full_name}</h1>
          <p className="text-xs font-semibold text-slate-600">{emp.job_title}</p>

          <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-[11px] text-slate-500">
            {emp.department_name && (
              <span className="inline-flex items-center gap-1">
                <Building2 size={12} /> {emp.department_name}
              </span>
            )}
            {emp.branch_name && (
              <span className="inline-flex items-center gap-1">
                <MapPin size={12} /> {emp.branch_name}
              </span>
            )}
          </div>

          {emp.card_bio && (
            <p className="mt-3 rounded-2xl bg-slate-50 px-4 py-2.5 text-xs leading-relaxed text-slate-600 border border-slate-100 w-full">
              {emp.card_bio}
            </p>
          )}
        </div>

        {/* Linktree Links Stack */}
        <div className="p-6 space-y-2.5">
          {displayLinks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 p-5 text-center text-xs text-slate-400">
              {tr('Belum ada tautan kontak yang dibagikan.', 'No contact links shared yet.')}
            </div>
          ) : (
            displayLinks.map((link, idx) => {
              const href = buildHref(link);
              const isExternal = href.startsWith('http');
              return (
                <a
                  key={idx}
                  href={href}
                  target={isExternal ? '_blank' : undefined}
                  rel={isExternal ? 'noreferrer' : undefined}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200/90 bg-white px-4 py-3.5 shadow-2xs transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-50 border border-slate-100">
                      {linkIcon(link.type)}
                    </div>
                    <div className="min-w-0 text-left">
                      <div className="text-xs font-bold text-slate-900 truncate">{link.label}</div>
                      <div className="text-[11px] text-slate-500 truncate">{link.value}</div>
                    </div>
                  </div>
                  <ExternalLink size={15} className="shrink-0 text-slate-400" />
                </a>
              );
            })
          )}

          {/* Save Contact + Share */}
          <div className="grid grid-cols-2 gap-2 pt-3">
            <button
              type="button"
              onClick={handleDownloadVcard}
              style={{ backgroundColor: palette.primary, color: palette.onPrimary }}
              className="inline-flex items-center justify-center gap-1.5 rounded-2xl px-4 py-3 text-xs font-bold shadow-sm hover:opacity-95 cursor-pointer"
            >
              <UserPlus size={14} />
              <span>{tr('Simpan Kontak', 'Save Contact')}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                if (navigator.share) {
                  navigator.share({ title: emp.full_name, url: window.location.href }).catch(() => {});
                } else {
                  navigator.clipboard?.writeText(window.location.href);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1800);
                }
              }}
              className="inline-flex items-center justify-center gap-1.5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
            >
              <Share2 size={14} />
              <span>{copied ? tr('Disalin!', 'Copied!') : tr('Bagikan', 'Share')}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
