import React, { useEffect, useState } from 'react';
import {
  Briefcase,
  MapPin,
  Building2,
  Upload,
  CheckCircle2,
  X,
  Search,
  Send,
  RefreshCw,
  ShieldCheck,
  ArrowRight,
  Clock,
  Users,
  Mail,
  KeyRound,
} from 'lucide-react';
import { API_BASE } from '../api';
import { useLanguage } from '../context/LanguageContext';

export const PublicCareersPage: React.FC = () => {
  const { tr, lang, setLang } = useLanguage();
  const [company, setCompany] = useState<any | null>(null);
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [closedMessage, setClosedMessage] = useState('');
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('all');
  const [workModeFilter, setWorkModeFilter] = useState('all');

  // Role Detail & Application modal
  const [selectedJob, setSelectedJob] = useState<any | null>(null);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [coverNote, setCoverNote] = useState('');
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [captchaQuestion, setCaptchaQuestion] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState('');
  const [submittedJobTitle, setSubmittedJobTitle] = useState('');
  const [submittedTrackingCode, setSubmittedTrackingCode] = useState('');

  // Track Application modal
  const [showTrack, setShowTrack] = useState(false);
  const [trackTab, setTrackTab] = useState<'code' | 'magic'>('code');
  const [trackEmail, setTrackEmail] = useState('');
  const [trackCode, setTrackCode] = useState('');
  const [trackApps, setTrackApps] = useState<any[] | null>(null);
  const [trackMsg, setTrackMsg] = useState('');
  const [trackErr, setTrackErr] = useState('');
  const [trackLoading, setTrackLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE}/public/careers`);
        if (res.status === 403) {
          setClosedMessage(tr('Portal karir saat ini sedang ditutup.', 'Careers portal is currently closed.'));
          return;
        }
        const data = await res.json();
        setCompany(data.company || null);
        setJobs(data.jobs || []);
      } catch {
        setClosedMessage(tr('Gagal memuat daftar lowongan.', 'Failed to load job openings.'));
      } finally {
        setLoading(false);
      }
    };
    load();

    // Check for ?track=<magic_token> in URL
    const params = new URLSearchParams(window.location.search);
    const trackToken = params.get('track');
    if (trackToken) {
      setShowTrack(true);
      setTrackLoading(true);
      fetch(`${API_BASE}/public/careers/track/verify?token=${encodeURIComponent(trackToken)}`)
        .then(async (r) => {
          const d = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(d.error || tr('Tautan tidak valid.', 'Invalid link.'));
          setTrackApps(d.applications || []);
          setTrackEmail(d.email || '');
        })
        .catch((err) => setTrackErr(err.message))
        .finally(() => setTrackLoading(false));
    }
  }, []);

  const formatEmploymentType = (type: string) => {
    switch (type) {
      case 'PKWTT':
        return tr('Penuh Waktu (Tetap)', 'Full-Time');
      case 'PKWT':
        return tr('Kontrak', 'Contract');
      case 'probation':
        return tr('Masa Percobaan', 'Probation');
      case 'intern':
        return tr('Magang', 'Internship');
      default:
        return type;
    }
  };

  const formatWorkMode = (mode: string) => {
    switch (mode) {
      case 'onsite':
        return 'On-site';
      case 'hybrid':
        return 'Hybrid';
      case 'remote':
        return 'Remote';
      default:
        return mode;
    }
  };

  const formatExpLevel = (lvl: string) => {
    switch (lvl) {
      case 'entry':
        return tr('Fresh Grad / Entry', 'Entry Level');
      case 'junior':
        return 'Junior (1-2 yrs)';
      case 'mid':
        return 'Mid-Level (3-5 yrs)';
      case 'senior':
        return 'Senior (5+ yrs)';
      case 'lead':
        return 'Lead / Manager';
      default:
        return lvl;
    }
  };

  const parseBullets = (text?: string | null): string[] =>
    String(text || '')
      .split(/\r?\n/)
      .map((line) => line.replace(/^\s*(?:[-*•]+|\d+[.)])\s*/, '').trim())
      .filter(Boolean);

  const departments = Array.from(new Set(jobs.map((j) => j.department_name).filter(Boolean))) as string[];
  const q = search.trim().toLowerCase();
  const filteredJobs = jobs.filter((j) => {
    if (deptFilter !== 'all' && j.department_name !== deptFilter) return false;
    if (workModeFilter !== 'all' && j.work_mode !== workModeFilter) return false;
    if (
      q &&
      !`${j.title} ${j.department_name || ''} ${j.branch_name || ''} ${j.description || ''} ${j.requirements || ''}`
        .toLowerCase()
        .includes(q)
    ) {
      return false;
    }
    return true;
  });

  const loadCaptcha = async () => {
    try {
      const res = await fetch(`${API_BASE}/public/careers/captcha`);
      if (res.ok) {
        const data = await res.json();
        setCaptchaQuestion(data.question || '');
        setCaptchaToken(data.token || '');
        setCaptchaAnswer('');
      }
    } catch {
      // ignore
    }
  };

  const openApply = (job: any) => {
    setSelectedJob(job);
    setFullName('');
    setEmail('');
    setPhone('');
    setCoverNote('');
    setResumeFile(null);
    setHoneypot('');
    setSubmitErr('');
    loadCaptcha();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedJob) return;
    setSubmitting(true);
    setSubmitErr('');
    try {
      const fd = new FormData();
      fd.append('job_id', selectedJob.id);
      fd.append('full_name', fullName.trim());
      fd.append('email', email.trim());
      fd.append('phone', phone.trim());
      fd.append('cover_note', coverNote.trim());
      fd.append('captcha_token', captchaToken);
      fd.append('captcha_answer', captchaAnswer.trim());
      if (honeypot) fd.append('website', honeypot);
      if (resumeFile) {
        fd.append('file', resumeFile);
      }
      const res = await fetch(`${API_BASE}/public/careers/apply`, {
        method: 'POST',
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        loadCaptcha();
        throw new Error(data.error || tr('Gagal mengirim lamaran.', 'Failed to submit application.'));
      }
      setSubmittedJobTitle(selectedJob.title);
      setSubmittedTrackingCode(data.tracking_code || '');
      setSelectedJob(null);
    } catch (err: any) {
      setSubmitErr(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const openTrackModal = () => {
    setShowTrack(true);
    setTrackApps(null);
    setTrackMsg('');
    setTrackErr('');
    loadCaptcha();
  };

  const handleTrackByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setTrackLoading(true);
    setTrackErr('');
    setTrackMsg('');
    try {
      const res = await fetch(`${API_BASE}/public/careers/track/code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: trackEmail.trim(),
          tracking_code: trackCode.trim(),
          captcha_token: captchaToken,
          captcha_answer: captchaAnswer.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        loadCaptcha();
        throw new Error(data.error || tr('Gagal melacak lamaran.', 'Failed to track application.'));
      }
      setTrackApps(data.applications || []);
    } catch (err: any) {
      setTrackErr(err.message);
    } finally {
      setTrackLoading(false);
    }
  };

  const handleTrackMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setTrackLoading(true);
    setTrackErr('');
    setTrackMsg('');
    try {
      const res = await fetch(`${API_BASE}/public/careers/track/magic-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: trackEmail.trim(),
          captcha_token: captchaToken,
          captcha_answer: captchaAnswer.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        loadCaptcha();
        throw new Error(data.error || tr('Gagal mengirim tautan.', 'Failed to send link.'));
      }
      setTrackMsg(data.message || tr('Tautan pelacakan telah dikirim ke email Anda.', 'Tracking link sent to your email.'));
      loadCaptcha();
    } catch (err: any) {
      setTrackErr(err.message);
    } finally {
      setTrackLoading(false);
    }
  };

  const companyName = company?.name || '';

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Top Navbar */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5 sm:px-6">
          {loading ? (
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 animate-pulse rounded-xl bg-slate-200" />
              <div className="space-y-1.5">
                <div className="h-3.5 w-32 animate-pulse rounded bg-slate-200" />
                <div className="h-2.5 w-20 animate-pulse rounded bg-slate-100" />
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              {company?.logo_url ? (
                <img
                  src={company.logo_url}
                  alt={companyName || 'Company'}
                  className="h-9 w-9 rounded-xl border border-slate-200 object-contain bg-white p-0.5"
                />
              ) : (
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-sm">
                  <Briefcase size={17} />
                </div>
              )}
              <div>
                <div className="text-sm font-black tracking-tight text-slate-900">{companyName || tr('Karir', 'Careers')}</div>
                <div className="text-[11px] font-medium text-slate-500">{tr('Portal Karir', 'Careers Portal')}</div>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2.5">
            {!closedMessage && (
              <button
                type="button"
                onClick={openTrackModal}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
              >
                <Search size={13} /> {tr('Pantau Lamaran', 'Track Application')}
              </button>
            )}
            <div className="flex items-center gap-0.5 rounded-xl border border-slate-200 bg-slate-100 p-0.5 text-[11px] font-bold">
              <button
                type="button"
                onClick={() => setLang('id')}
                className={`rounded-lg px-2.5 py-1 transition ${lang === 'id' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
              >
                ID
              </button>
              <button
                type="button"
                onClick={() => setLang('en')}
                className={`rounded-lg px-2.5 py-1 transition ${lang === 'en' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
              >
                EN
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-slate-200 bg-gradient-to-br from-slate-900 via-slate-900 to-blue-950 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.22),transparent_55%)]" />
        <div className="relative mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          {loading ? (
            <div className="space-y-4">
              <div className="h-9 w-80 max-w-full animate-pulse rounded-xl bg-white/15" />
              <div className="h-4 w-96 max-w-full animate-pulse rounded bg-white/10" />
              <div className="mt-7 h-14 w-full animate-pulse rounded-2xl bg-white/10" />
            </div>
          ) : (
            <>
              <h1 className="max-w-2xl text-2xl font-black tracking-tight sm:text-4xl">
                {companyName
                  ? tr(`Berkembang Bersama ${companyName}`, `Build Your Career at ${companyName}`)
                  : tr('Berkembang Bersama Kami', 'Build Your Career With Us')}
              </h1>
              <p className="mt-2.5 max-w-xl text-sm leading-relaxed text-slate-300">
                {tr(
                  'Temukan peran yang sesuai dengan keahlian Anda dan kirimkan lamaran langsung secara online dalam hitungan menit.',
                  'Explore open roles across our teams and submit your application directly online in minutes.'
                )}
              </p>

              {!closedMessage && (
                <div className="mt-7 flex flex-col gap-2.5 rounded-2xl border border-white/15 bg-white/10 p-2 backdrop-blur-md sm:flex-row sm:items-center">
                  <div className="relative flex-1">
                    <Search size={15} className="absolute left-3.5 top-3 text-slate-300" />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder={tr('Cari posisi, departemen, atau lokasi...', 'Search role, department, or location...')}
                      className="w-full rounded-xl bg-white/95 py-2.5 pl-10 pr-4 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {departments.length > 0 && (
                      <select
                        value={deptFilter}
                        onChange={(e) => setDeptFilter(e.target.value)}
                        className="rounded-xl bg-white/95 px-3 py-2.5 text-xs font-semibold text-slate-800 focus:outline-none"
                      >
                        <option value="all">{tr('Semua Departemen', 'All Departments')}</option>
                        {departments.map((d) => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                    )}
                    <select
                      value={workModeFilter}
                      onChange={(e) => setWorkModeFilter(e.target.value)}
                      className="rounded-xl bg-white/95 px-3 py-2.5 text-xs font-semibold text-slate-800 focus:outline-none"
                    >
                      <option value="all">{tr('Semua Sistem Kerja', 'All Work Modes')}</option>
                      <option value="onsite">On-site</option>
                      <option value="hybrid">Hybrid</option>
                      <option value="remote">Remote</option>
                    </select>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* Main Content */}
      <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 py-8 sm:px-6">
        {submittedJobTitle && (
          <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-900 shadow-sm">
            <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-600" />
            <div>
              <div className="font-black">
                {tr('Lamaran Anda berhasil dikirim!', 'Your application has been submitted!')}
              </div>
              <p className="mt-0.5 text-emerald-800">
                {tr(
                  `Terima kasih telah melamar untuk posisi "${submittedJobTitle}". Tim HR kami akan meninjau lamaran Anda dan menghubungi melalui email/WhatsApp.`,
                  `Thank you for applying for "${submittedJobTitle}". Our HR team will review your application and contact you via email/phone.`
                )}
              </p>
              {submittedTrackingCode && (
                <div className="mt-2 inline-flex items-center gap-2 rounded-xl border border-emerald-300 bg-white px-3 py-1.5 font-mono text-xs font-black text-emerald-800">
                  <span>{tr('Kode Pelacakan:', 'Tracking Code:')}</span>
                  <span>{submittedTrackingCode}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {closedMessage ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500 shadow-sm">
            {closedMessage}
          </div>
        ) : (
          <>
            {/* Department Quick Pills */}
            {departments.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDeptFilter('all')}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                    deptFilter === 'all'
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {tr('Semua', 'All')} ({jobs.length})
                </button>
                {departments.map((d) => {
                  const count = jobs.filter((j) => j.department_name === d).length;
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDeptFilter(d)}
                      className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                        deptFilter === d
                          ? 'bg-slate-900 text-white shadow-sm'
                          : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {d} ({count})
                    </button>
                  );
                })}
              </div>
            )}

            {loading ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-44 animate-pulse rounded-2xl border border-slate-200 bg-white p-5" />
                ))}
              </div>
            ) : filteredJobs.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-14 text-center">
                <Briefcase size={28} className="mx-auto text-slate-300" />
                <p className="mt-2 text-sm font-bold text-slate-700">
                  {tr('Belum ada lowongan yang cocok', 'No matching positions found')}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {tr('Coba ubah kata kunci pencarian atau filter departemen.', 'Try adjusting your search keywords or department filter.')}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {filteredJobs.map((j) => {
                  const descBullets = parseBullets(j.description);
                  return (
                    <div
                      key={j.id}
                      onClick={() => openApply(j)}
                      className="group flex cursor-pointer flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-400 hover:shadow-md"
                    >
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[10px] font-bold uppercase text-blue-700">
                              {formatEmploymentType(j.employment_type)}
                            </span>
                            {j.work_mode && (
                              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold uppercase text-slate-700">
                                {formatWorkMode(j.work_mode)}
                              </span>
                            )}
                            {j.experience_level && (
                              <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-bold uppercase text-amber-700">
                                {formatExpLevel(j.experience_level)}
                              </span>
                            )}
                          </div>
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400">
                            <Users size={12} /> {j.headcount || 1}
                          </span>
                        </div>

                        <div>
                          <h2 className="text-base font-black text-slate-900 group-hover:text-blue-600 transition">
                            {j.title}
                          </h2>
                          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                            <span className="inline-flex items-center gap-1">
                              <Building2 size={12} /> {j.department_name || 'General'}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <MapPin size={12} /> {j.branch_name || 'Head Office'}
                            </span>
                            {j.closing_date && (
                              <span className="inline-flex items-center gap-1 text-rose-600 font-semibold">
                                <Clock size={12} /> {tr('Tutup:', 'Closes:')} {j.closing_date}
                              </span>
                            )}
                          </div>
                        </div>

                        {Boolean(j.show_salary) && (j.salary_min > 0 || j.salary_max > 0) && (
                          <div className="inline-block rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
                            Rp {Number(j.salary_min || 0).toLocaleString('id-ID')} – Rp{' '}
                            {Number(j.salary_max || 0).toLocaleString('id-ID')} / {tr('bln', 'mo')}
                          </div>
                        )}

                        {descBullets.length > 0 && (
                          <ul className="list-disc space-y-1 pl-4 text-xs text-slate-600">
                            {descBullets.slice(0, 3).map((item, idx) => (
                              <li key={idx} className="line-clamp-1">{item}</li>
                            ))}
                          </ul>
                        )}
                      </div>

                      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                        <span className="text-[11px] font-semibold text-slate-400">
                          {parseBullets(j.requirements).length > 0
                            ? tr('Lihat kualifikasi & detail', 'View qualifications & details')
                            : tr('Lihat detail posisi', 'View role details')}
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-1.5 text-xs font-bold text-white group-hover:bg-blue-600 transition">
                          {tr('Detail & Lamar', 'Details & Apply')} <ArrowRight size={13} />
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-400">
        {loading ? (
          <div className="mx-auto h-3 w-48 animate-pulse rounded bg-slate-200" />
        ) : (
          <>
            {companyName ? `${companyName} · ` : ''}
            {tr('Didukung oleh', 'Powered by')} <span className="font-bold text-slate-600">openHR</span>
          </>
        )}
      </footer>

      {/* Track Application Modal */}
      {showTrack && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-black text-slate-900">{tr('Pantau Status Lamaran', 'Track Your Application')}</h2>
                <p className="text-[11px] text-slate-500">
                  {tr('Gunakan kode pelacakan atau tautan email tanpa perlu akun.', 'Use your tracking code or email magic link — no account required.')}
                </p>
              </div>
              <button type="button" onClick={() => setShowTrack(false)} className="rounded-xl p-1 text-slate-400 hover:bg-slate-100">
                <X size={18} />
              </button>
            </div>

            {trackApps !== null ? (
              <div className="space-y-3">
                {trackApps.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-xs text-slate-500">
                    {tr('Tidak ada lamaran ditemukan.', 'No applications found.')}
                  </div>
                ) : (
                  trackApps.map((app) => {
                    const steps = ['applied', 'screening', 'interview', 'offer', 'hired'];
                    const idx = steps.indexOf(app.stage);
                    return (
                      <div key={app.id} className="rounded-2xl border border-slate-200 p-4 space-y-3 text-xs">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-black text-slate-900">{app.job_title}</div>
                            <div className="text-[11px] text-slate-500">
                              {app.department_name || 'General'} · {app.branch_name || 'Head Office'}
                            </div>
                          </div>
                          <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase ${
                            app.stage === 'hired'
                              ? 'bg-emerald-50 text-emerald-700'
                              : app.stage === 'rejected'
                              ? 'bg-rose-50 text-rose-700'
                              : 'bg-blue-50 text-blue-700'
                          }`}>
                            {app.stage}
                          </span>
                        </div>
                        {app.stage !== 'rejected' && (
                          <div className="grid grid-cols-5 gap-1 pt-1">
                            {steps.map((s, sIdx) => (
                              <div key={s} className="space-y-1 text-center">
                                <div className={`h-1.5 rounded-full ${sIdx <= idx ? 'bg-blue-600' : 'bg-slate-200'}`} />
                                <div className={`text-[9px] font-bold uppercase ${sIdx <= idx ? 'text-blue-700' : 'text-slate-400'}`}>{s}</div>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] text-slate-400">
                          <span>Code: <strong className="font-mono text-slate-600">{app.tracking_code || '-'}</strong></span>
                          <span>{String(app.updated_at || app.created_at || '').slice(0, 10)}</span>
                        </div>
                      </div>
                    );
                  })
                )}
                <div className="flex justify-end pt-2">
                  <button type="button" onClick={() => { setTrackApps(null); loadCaptcha(); }} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
                    {tr('Cari Lagi', 'Check Another')}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="mb-4 flex gap-1 rounded-2xl border border-slate-200 bg-slate-50 p-1 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => { setTrackTab('code'); setTrackErr(''); setTrackMsg(''); }}
                    className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl py-2 ${trackTab === 'code' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
                  >
                    <KeyRound size={13} /> {tr('Kode Pelacakan', 'Tracking Code')}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setTrackTab('magic'); setTrackErr(''); setTrackMsg(''); }}
                    className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl py-2 ${trackTab === 'magic' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
                  >
                    <Mail size={13} /> {tr('Tautan Email', 'Email Magic Link')}
                  </button>
                </div>

                {trackErr && (
                  <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                    {trackErr}
                  </div>
                )}
                {trackMsg && (
                  <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
                    {trackMsg}
                  </div>
                )}

                <form onSubmit={trackTab === 'code' ? handleTrackByCode : handleTrackMagicLink} className="space-y-3 text-xs">
                  <div>
                    <label className="mb-1 block font-semibold text-slate-700">Email *</label>
                    <input required type="email" value={trackEmail} onChange={(e) => setTrackEmail(e.target.value)} placeholder="budi@email.com" className="w-full rounded-xl border border-slate-300 p-2.5" />
                  </div>
                  {trackTab === 'code' && (
                    <div>
                      <label className="mb-1 block font-semibold text-slate-700">{tr('Kode Pelacakan *', 'Tracking Code *')}</label>
                      <input required value={trackCode} onChange={(e) => setTrackCode(e.target.value.toUpperCase())} placeholder="APP-XXXXXX" className="w-full rounded-xl border border-slate-300 p-2.5 font-mono uppercase" />
                    </div>
                  )}
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 font-bold text-slate-700">
                        <ShieldCheck size={14} className="text-blue-600" />
                        {tr('Verifikasi Keamanan *', 'Security Check *')}
                      </span>
                      <button type="button" onClick={loadCaptcha} className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:underline">
                        <RefreshCw size={11} /> {tr('Ganti Soal', 'Refresh')}
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs font-black text-slate-900">
                        {captchaQuestion || '...'}
                      </span>
                      <input required inputMode="numeric" value={captchaAnswer} onChange={(e) => setCaptchaAnswer(e.target.value)} placeholder={tr('Jawaban', 'Answer')} className="w-full rounded-xl border border-slate-300 bg-white p-2 text-xs" />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <button type="button" onClick={() => setShowTrack(false)} className="rounded-xl border border-slate-200 px-4 py-2 font-bold text-slate-600">{tr('Tutup', 'Close')}</button>
                    <button type="submit" disabled={trackLoading} className="rounded-xl bg-slate-900 px-5 py-2 font-bold text-white hover:bg-blue-600 disabled:opacity-50">
                      {trackLoading ? '...' : trackTab === 'code' ? tr('Cek Status', 'Check Status') : tr('Kirim Tautan', 'Send Magic Link')}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      {/* Role Detail & Application Modal */}
      {selectedJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 sm:p-5 backdrop-blur-xs">
          <div className="w-full max-w-4xl rounded-3xl bg-white shadow-2xl max-h-[92vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-slate-100 px-6 py-4">
              <div>
                <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                  <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[10px] font-bold uppercase text-blue-700">
                    {formatEmploymentType(selectedJob.employment_type)}
                  </span>
                  {selectedJob.work_mode && (
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold uppercase text-slate-700">
                      {formatWorkMode(selectedJob.work_mode)}
                    </span>
                  )}
                  {selectedJob.experience_level && (
                    <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-bold uppercase text-amber-700">
                      {formatExpLevel(selectedJob.experience_level)}
                    </span>
                  )}
                </div>
                <h2 className="text-lg font-black text-slate-900">{selectedJob.title}</h2>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1">
                    <Building2 size={12} /> {selectedJob.department_name || 'General'}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <MapPin size={12} /> {selectedJob.branch_name || 'Head Office'}
                  </span>
                  {Boolean(selectedJob.show_salary) && (selectedJob.salary_min > 0 || selectedJob.salary_max > 0) && (
                    <span className="font-bold text-emerald-700">
                      Rp {Number(selectedJob.salary_min || 0).toLocaleString('id-ID')} – Rp{' '}
                      {Number(selectedJob.salary_max || 0).toLocaleString('id-ID')} / {tr('bln', 'mo')}
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedJob(null)}
                className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body: Split Role Details (left) + Application Form (right) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 overflow-y-auto">
              {/* Left: Full Bulleted Job Details */}
              <div className="lg:col-span-6 space-y-5 border-b border-slate-100 bg-slate-50/70 p-6 lg:border-b-0 lg:border-r">
                {selectedJob.description ? (
                  <div>
                    <h3 className="mb-2 text-xs font-black uppercase tracking-wide text-slate-700">
                      {tr('Deskripsi & Tanggung Jawab', 'Job Description & Responsibilities')}
                    </h3>
                    <ul className="list-disc space-y-1.5 pl-4 text-xs leading-relaxed text-slate-600">
                      {parseBullets(selectedJob.description).map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">
                    {tr('Tidak ada deskripsi tambahan.', 'No additional description provided.')}
                  </p>
                )}

                {selectedJob.requirements && (
                  <div>
                    <h3 className="mb-2 text-xs font-black uppercase tracking-wide text-slate-700">
                      {tr('Kualifikasi & Persyaratan', 'Qualifications & Requirements')}
                    </h3>
                    <ul className="list-disc space-y-1.5 pl-4 text-xs leading-relaxed text-slate-600">
                      {parseBullets(selectedJob.requirements).map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {selectedJob.closing_date && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                    {tr('Batas akhir lamaran:', 'Application deadline:')} {selectedJob.closing_date}
                  </div>
                )}
              </div>

              {/* Right: Application Form */}
              <div className="lg:col-span-6 p-6">
                <h3 className="mb-3 text-sm font-black text-slate-900">
                  {tr('Kirim Lamaran Anda', 'Submit Your Application')}
                </h3>
                {submitErr && (
                  <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                    {submitErr}
                  </div>
                )}
                <form onSubmit={handleSubmit} className="space-y-3 text-xs">
                  <div>
                    <label className="mb-1 block font-semibold text-slate-700">{tr('Nama Lengkap *', 'Full Name *')}</label>
                    <input
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g. Budi Santoso"
                      className="w-full rounded-xl border border-slate-300 p-2.5"
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block font-semibold text-slate-700">Email *</label>
                      <input
                        required
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="budi@email.com"
                        className="w-full rounded-xl border border-slate-300 p-2.5"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block font-semibold text-slate-700">{tr('No. HP / WhatsApp', 'Phone / WhatsApp')}</label>
                      <input
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="0812..."
                        className="w-full rounded-xl border border-slate-300 p-2.5"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block font-semibold text-slate-700">{tr('Catatan / Tautan Portofolio', 'Cover Note / Portfolio Link')}</label>
                    <textarea
                      rows={3}
                      value={coverNote}
                      onChange={(e) => setCoverNote(e.target.value)}
                      placeholder={tr('Ceritakan singkat pengalaman Anda...', 'Briefly share your relevant experience...')}
                      className="w-full rounded-xl border border-slate-300 p-2.5"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block font-semibold text-slate-700">
                      {tr('Unggah CV / Resume (PDF/DOC/DOCX, maks 5 MB)', 'Upload CV / Resume (PDF/DOC/DOCX, max 5 MB)')}
                    </label>
                    <label className="flex cursor-pointer items-center justify-between rounded-xl border border-dashed border-slate-300 px-3 py-2.5 text-slate-600 hover:bg-slate-50">
                      <span className="flex items-center gap-2 truncate">
                        <Upload size={14} className="shrink-0 text-slate-400" />
                        <span className="truncate">{resumeFile ? resumeFile.name : tr('Pilih file CV...', 'Choose CV file...')}</span>
                      </span>
                      <input
                        type="file"
                        accept=".pdf,.doc,.docx"
                        className="hidden"
                        onChange={(e) => setResumeFile(e.target.files?.[0] || null)}
                      />
                    </label>
                  </div>

                  {/* Honeypot anti-bot trap */}
                  <input
                    type="text"
                    name="website"
                    value={honeypot}
                    onChange={(e) => setHoneypot(e.target.value)}
                    tabIndex={-1}
                    autoComplete="off"
                    className="hidden"
                    aria-hidden="true"
                  />

                  {/* CAPTCHA Challenge */}
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 font-bold text-slate-700">
                        <ShieldCheck size={14} className="text-blue-600" />
                        {tr('Verifikasi Keamanan *', 'Security Check *')}
                      </span>
                      <button
                        type="button"
                        onClick={loadCaptcha}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:underline"
                      >
                        <RefreshCw size={11} /> {tr('Ganti Soal', 'Refresh')}
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs font-black text-slate-900">
                        {captchaQuestion || '...'}
                      </span>
                      <input
                        required
                        inputMode="numeric"
                        value={captchaAnswer}
                        onChange={(e) => setCaptchaAnswer(e.target.value)}
                        placeholder={tr('Jawaban', 'Answer')}
                        className="w-full rounded-xl border border-slate-300 bg-white p-2 text-xs"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setSelectedJob(null)}
                      className="rounded-xl border border-slate-200 px-4 py-2 font-bold text-slate-600"
                    >
                      {tr('Batal', 'Cancel')}
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2 font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      <Send size={13} />
                      {submitting ? tr('Mengirim...', 'Submitting...') : tr('Kirim Lamaran', 'Submit Application')}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
