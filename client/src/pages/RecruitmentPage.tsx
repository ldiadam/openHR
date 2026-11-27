import React, { useEffect, useRef, useState } from 'react';
import {
  UserPlus,
  Briefcase,
  Plus,
  CheckCircle2,
  Pencil,
  Trash2,
  X,
  LayoutGrid,
  Table2,
  Upload,
  FileText,
  ClipboardCheck,
  Search,
  Star,
  ExternalLink,
  Copy,
  RotateCcw,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
} from 'lucide-react';
import { API_BASE, apiFetch, getToken } from '../api';
import { useLanguage } from '../context/LanguageContext';
import { useCompany } from '../context/CompanyContext';
import { buildOfferLetterPdf } from '../utils/offerLetterPdf';

const STAGES = ['applied', 'screening', 'interview', 'offer', 'hired', 'rejected'] as const;

const STAGE_STYLES: Record<string, string> = {
  applied: 'bg-slate-100 text-slate-700 border-slate-200',
  screening: 'bg-sky-50 text-sky-700 border-sky-200',
  interview: 'bg-amber-50 text-amber-700 border-amber-200',
  offer: 'bg-purple-50 text-purple-700 border-purple-200',
  hired: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected: 'bg-rose-50 text-rose-700 border-rose-200',
};

export const RecruitmentPage: React.FC = () => {
  const { tr } = useLanguage();
  const { company } = useCompany();
  const [tab, setTab] = useState<'pipeline' | 'calendar' | 'onboarding'>('pipeline');
  const [calendarMonth, setCalendarMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [viewMode, setViewMode] = useState<'board' | 'table'>('board');
  const [jobs, setJobs] = useState<any[]>([]);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [hires, setHires] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [search, setSearch] = useState('');
  const [jobFilter, setJobFilter] = useState('all');
  const [draggedCandId, setDraggedCandId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const draggedCandRef = useRef<string | null>(null);

  // Job Create/Edit modal
  const [showJob, setShowJob] = useState(false);
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [jobTitle, setJobTitle] = useState('');
  const [jobDept, setJobDept] = useState('');
  const [jobBranch, setJobBranch] = useState('');
  const [jobType, setJobType] = useState('PKWTT');
  const [jobHeadcount, setJobHeadcount] = useState('1');
  const [jobWorkMode, setJobWorkMode] = useState('onsite');
  const [jobExpLevel, setJobExpLevel] = useState('mid');
  const [jobSalaryMin, setJobSalaryMin] = useState('');
  const [jobSalaryMax, setJobSalaryMax] = useState('');
  const [jobShowSalary, setJobShowSalary] = useState(false);
  const [jobClosingDate, setJobClosingDate] = useState('');
  const [jobStatus, setJobStatus] = useState('open');
  const [jobDesc, setJobDesc] = useState('');
  const [jobRequirements, setJobRequirements] = useState('');

  // Candidate Create/Edit modal
  const [showCand, setShowCand] = useState(false);
  const [editingCandId, setEditingCandId] = useState<string | null>(null);
  const [candJob, setCandJob] = useState('');
  const [candName, setCandName] = useState('');
  const [candEmail, setCandEmail] = useState('');
  const [candPhone, setCandPhone] = useState('');
  const [candSalary, setCandSalary] = useState('');
  const [candNotes, setCandNotes] = useState('');
  const [candRating, setCandRating] = useState('0');
  const [candResumeFile, setCandResumeFile] = useState<File | null>(null);

  // Interview Schedule modal
  const [interviewCand, setInterviewCand] = useState<any | null>(null);
  const [intDateTime, setIntDateTime] = useState('');
  const [intType, setIntType] = useState('online');
  const [intLocation, setIntLocation] = useState('');
  const [intInterviewer, setIntInterviewer] = useState('');
  const [intNotes, setIntNotes] = useState('');
  const [intSendEmail, setIntSendEmail] = useState(true);

  // Job Offer modal
  const [offerCand, setOfferCand] = useState<any | null>(null);
  const [offerAgreementNo, setOfferAgreementNo] = useState('');
  const [offerIcNumber, setOfferIcNumber] = useState('');
  const [offerAddress, setOfferAddress] = useState('');
  const [offerWorkingHours, setOfferWorkingHours] = useState('Monday to Friday: 08:30 to 17:30 hour');
  const [offerSalary, setOfferSalary] = useState('');
  const [offerStartDate, setOfferStartDate] = useState('');
  const [offerExpiresAt, setOfferExpiresAt] = useState('');
  const [offerNotes, setOfferNotes] = useState('');
  const [offerCustomFile, setOfferCustomFile] = useState<File | null>(null);
  const [offerSendEmail, setOfferSendEmail] = useState(true);

  const flash = (type: 'ok' | 'err', text: string) => {
    setNotice({ type, text });
    setTimeout(() => setNotice(null), 4000);
  };

  const load = async () => {
    setLoading(true);
    try {
      const [res, onbRes] = await Promise.all([
        apiFetch('/recruitment'),
        apiFetch('/recruitment/onboarding').catch(() => ({ hires: [] })),
      ]);
      setJobs(res.jobs || []);
      setCandidates(res.candidates || []);
      setDepartments(res.departments || []);
      setBranches(res.branches || []);
      setHires(onbRes.hires || []);
      if (!jobDept && res.departments?.[0]?.id) setJobDept(res.departments[0].id);
      if (!jobBranch && res.branches?.[0]?.id) setJobBranch(res.branches[0].id);
      if (!candJob && res.jobs?.[0]?.id) setCandJob(res.jobs[0].id);
    } catch (err: any) {
      flash('err', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const uploadResume = async (candId: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    const token = getToken();
    const res = await fetch(`${API_BASE}/recruitment/candidates/${candId}/resume`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as any;
      throw new Error(err.error || 'Gagal mengunggah CV.');
    }
  };

  const viewResume = async (c: any) => {
    try {
      const token = getToken();
      const res = await fetch(`${API_BASE}/recruitment/candidates/${c.id}/resume`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(tr('CV tidak ditemukan.', 'Resume not found.'));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (err: any) {
      flash('err', err.message);
    }
  };

  const openNewJob = () => {
    setEditingJobId(null);
    setJobTitle('');
    setJobDept(departments[0]?.id || '');
    setJobBranch(branches[0]?.id || '');
    setJobType('PKWTT');
    setJobHeadcount('1');
    setJobWorkMode('onsite');
    setJobExpLevel('mid');
    setJobSalaryMin('');
    setJobSalaryMax('');
    setJobShowSalary(false);
    setJobClosingDate('');
    setJobStatus('open');
    setJobDesc('');
    setJobRequirements('');
    setShowJob(true);
  };

  const openEditJob = (j: any) => {
    setEditingJobId(j.id);
    setJobTitle(j.title || '');
    setJobDept(j.department_id || '');
    setJobBranch(j.branch_id || '');
    setJobType(j.employment_type || 'PKWTT');
    setJobHeadcount(String(j.headcount || 1));
    setJobWorkMode(j.work_mode || 'onsite');
    setJobExpLevel(j.experience_level || 'mid');
    setJobSalaryMin(j.salary_min ? String(j.salary_min) : '');
    setJobSalaryMax(j.salary_max ? String(j.salary_max) : '');
    setJobShowSalary(Boolean(j.show_salary));
    setJobClosingDate(j.closing_date || '');
    setJobStatus(j.status || 'open');
    setJobDesc(j.description || '');
    setJobRequirements(j.requirements || '');
    setShowJob(true);
  };

  const handleSaveJob = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        title: jobTitle.trim(),
        department_id: jobDept || null,
        branch_id: jobBranch || null,
        employment_type: jobType,
        headcount: Number(jobHeadcount || 1) || 1,
        work_mode: jobWorkMode,
        experience_level: jobExpLevel,
        salary_min: Number(jobSalaryMin || 0) || 0,
        salary_max: Number(jobSalaryMax || 0) || 0,
        show_salary: jobShowSalary,
        closing_date: jobClosingDate || null,
        status: jobStatus,
        description: jobDesc.trim(),
        requirements: jobRequirements.trim(),
      };
      if (editingJobId) {
        await apiFetch(`/recruitment/jobs/${editingJobId}`, { method: 'PUT', body: JSON.stringify(payload) });
        flash('ok', tr('Lowongan diperbarui.', 'Job opening updated.'));
      } else {
        await apiFetch('/recruitment/jobs', { method: 'POST', body: JSON.stringify(payload) });
        flash('ok', tr('Lowongan dibuat.', 'Job opening created.'));
      }
      setShowJob(false);
      await load();
    } catch (err: any) {
      flash('err', err.message);
    }
  };

  const handleDeleteJob = async (j: any) => {
    if (!window.confirm(tr(`Hapus lowongan "${j.title}" beserta kandidatnya?`, `Delete job "${j.title}" and its candidates?`))) return;
    try {
      await apiFetch(`/recruitment/jobs/${j.id}`, { method: 'DELETE' });
      flash('ok', tr('Lowongan dihapus.', 'Job opening deleted.'));
      await load();
    } catch (err: any) {
      flash('err', err.message);
    }
  };

  const openNewCand = () => {
    setEditingCandId(null);
    setCandJob(jobs[0]?.id || '');
    setCandName('');
    setCandEmail('');
    setCandPhone('');
    setCandSalary('');
    setCandNotes('');
    setCandRating('0');
    setCandResumeFile(null);
    setShowCand(true);
  };

  const openEditCand = (c: any) => {
    setEditingCandId(c.id);
    setCandJob(c.job_id || '');
    setCandName(c.full_name || '');
    setCandEmail(c.email || '');
    setCandPhone(c.phone || '');
    setCandSalary(String(c.offered_salary || ''));
    setCandNotes(c.interview_notes || '');
    setCandRating(String(c.rating || 0));
    setCandResumeFile(null);
    setShowCand(true);
  };

  const handleSaveCandidate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        job_id: candJob,
        full_name: candName.trim(),
        email: candEmail.trim(),
        phone: candPhone.trim(),
        offered_salary: Number(candSalary || 0) || 0,
        interview_notes: candNotes.trim(),
        rating: Number(candRating || 0) || 0,
      };
      let targetId = editingCandId;
      if (editingCandId) {
        await apiFetch(`/recruitment/candidates/${editingCandId}`, { method: 'PUT', body: JSON.stringify(payload) });
        flash('ok', tr('Kandidat diperbarui.', 'Candidate updated.'));
      } else {
        const created = await apiFetch('/recruitment/candidates', { method: 'POST', body: JSON.stringify(payload) });
        targetId = created.id;
        flash('ok', tr('Kandidat ditambahkan.', 'Candidate added.'));
      }
      if (candResumeFile && targetId) {
        await uploadResume(targetId, candResumeFile);
      }
      setShowCand(false);
      await load();
    } catch (err: any) {
      flash('err', err.message);
    }
  };

  const handleDeleteCandidate = async (c: any) => {
    if (!window.confirm(tr(`Hapus kandidat "${c.full_name}"?`, `Delete candidate "${c.full_name}"?`))) return;
    try {
      await apiFetch(`/recruitment/candidates/${c.id}`, { method: 'DELETE' });
      flash('ok', tr('Kandidat dihapus.', 'Candidate deleted.'));
      await load();
    } catch (err: any) {
      flash('err', err.message);
    }
  };

  const openInterviewModal = (c: any) => {
    setInterviewCand(c);
    const defaultDt = c.interview_at || `${new Date(Date.now() + 86400000).toISOString().slice(0, 10)}T10:00`;
    setIntDateTime(defaultDt);
    setIntType(c.interview_type || 'online');
    setIntLocation(c.interview_location || '');
    setIntInterviewer(c.interviewer_name || '');
    setIntNotes(c.interview_notes || '');
    setIntSendEmail(Boolean(c.email));
  };

  const handleSaveInterview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!interviewCand) return;
    try {
      const res = await apiFetch(`/recruitment/candidates/${interviewCand.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          stage: 'interview',
          interview_at: intDateTime,
          interview_type: intType,
          interview_location: intLocation.trim(),
          interviewer_name: intInterviewer.trim(),
          interview_notes: intNotes.trim(),
          send_interview_email: intSendEmail,
        }),
      });
      setInterviewCand(null);
      flash(
        'ok',
        res.email_queued
          ? tr('Jadwal interview disimpan & email undangan dikirim.', 'Interview scheduled & invitation email sent.')
          : tr('Jadwal interview disimpan.', 'Interview schedule saved.')
      );
      await load();
    } catch (err: any) {
      flash('err', err.message);
    }
  };

  const openOfferModal = (c: any) => {
    setOfferCand(c);
    const ym = new Date().toISOString().slice(2, 7).replace('-', '');
    setOfferAgreementNo(c.offer_agreement_no || `OFF-${ym}-${String(Math.floor(Math.random() * 90) + 10)}`);
    setOfferIcNumber('');
    setOfferAddress('');
    setOfferWorkingHours('Monday to Friday: 08:30 to 17:30 hour');
    setOfferSalary(c.offered_salary ? String(c.offered_salary) : '');
    setOfferStartDate(c.offer_start_date || new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10));
    setOfferExpiresAt(c.offer_expires_at || new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
    setOfferNotes(c.offer_notes || '');
    setOfferCustomFile(null);
    setOfferSendEmail(Boolean(c.email));
  };

  const generateOfferPdfBlob = (c: any) => {
    const jobObj = jobs.find((j) => j.id === c.job_id);
    const scope = String(jobObj?.description || '')
      .split(/\r?\n/)
      .map((s) => s.replace(/^\s*(?:[-*•]+|\d+[.)])\s*/, '').trim())
      .filter(Boolean);
    const doc = buildOfferLetterPdf({
      companyName: company?.name || 'Company',
      agreementNo: offerAgreementNo.trim() || 'OFF-001',
      offerDate: new Date().toISOString().slice(0, 10),
      candidateName: c.full_name,
      icNumber: offerIcNumber.trim(),
      address: offerAddress.trim(),
      jobTitle: c.job_title,
      startDate: offerStartDate || new Date().toISOString().slice(0, 10),
      monthlySalary: Number(offerSalary || 0) || 0,
      workingHours: offerWorkingHours.trim(),
      jobScope: scope,
      extraNotes: offerNotes.trim() || undefined,
    });
    return doc;
  };

  const viewOfferLetter = async (c: any) => {
    try {
      const token = getToken();
      const res = await fetch(`${API_BASE}/recruitment/candidates/${c.id}/offer-letter`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(tr('Offer Letter belum tersedia.', 'Offer Letter not found.'));
      const blob = await res.blob();
      window.open(URL.createObjectURL(blob), '_blank');
    } catch (err: any) {
      flash('err', err.message);
    }
  };

  const handleSaveOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!offerCand) return;
    try {
      const fd = new FormData();
      if (offerCustomFile) {
        fd.append('file', offerCustomFile);
      } else {
        const doc = generateOfferPdfBlob(offerCand);
        const pdfBlob = doc.output('blob');
        const safeName = `Offer_Letter_${String(offerCand.full_name || 'Candidate').replace(/\s+/g, '_')}.pdf`;
        fd.append('file', new File([pdfBlob], safeName, { type: 'application/pdf' }));
      }
      fd.append('agreement_no', offerAgreementNo.trim());

      const token = getToken();
      const upRes = await fetch(`${API_BASE}/recruitment/candidates/${offerCand.id}/offer-letter`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      if (!upRes.ok) {
        const errData = (await upRes.json().catch(() => ({}))) as any;
        throw new Error(errData.error || 'Gagal mengunggah Offer Letter.');
      }

      const res = await apiFetch(`/recruitment/candidates/${offerCand.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          stage: 'offer',
          offered_salary: Number(offerSalary || 0) || 0,
          offer_start_date: offerStartDate || null,
          offer_expires_at: offerExpiresAt || null,
          offer_notes: offerNotes.trim(),
          send_offer_email: offerSendEmail,
        }),
      });
      setOfferCand(null);
      flash(
        'ok',
        res.email_queued
          ? tr('Offer Letter PDF dibuat & email penawaran dikirim.', 'Offer Letter PDF generated & offer email sent.')
          : tr('Offer Letter disimpan.', 'Offer Letter saved.')
      );
      await load();
    } catch (err: any) {
      flash('err', err.message);
    }
  };

  const moveStage = async (id: string, stage: string) => {
    if (stage === 'interview') {
      const cand = candidates.find((c) => c.id === id);
      if (cand) {
        openInterviewModal(cand);
        return;
      }
    }
    if (stage === 'offer') {
      const cand = candidates.find((c) => c.id === id);
      if (cand) {
        openOfferModal(cand);
        return;
      }
    }
    setCandidates((prev) => prev.map((c) => (c.id === id ? { ...c, stage } : c)));
    try {
      await apiFetch(`/recruitment/candidates/${id}`, { method: 'PUT', body: JSON.stringify({ stage }) });
      await load();
    } catch (err: any) {
      flash('err', err.message);
      await load();
    }
  };

  const startPointerDrag = (e: React.PointerEvent, cand: any) => {
    if (cand.stage === 'hired' || e.button !== 0) return;
    const targetEl = e.target as HTMLElement;
    if (targetEl.closest('button, select, input, a, textarea')) return;

    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    let active = false;

    const onMove = (ev: PointerEvent) => {
      const dist = Math.hypot(ev.clientX - startX, ev.clientY - startY);
      if (!active && dist > 6) {
        active = true;
        window.getSelection()?.removeAllRanges();
        draggedCandRef.current = cand.id;
        setDraggedCandId(cand.id);
      }
      if (active) {
        setDragPos({ x: ev.clientX, y: ev.clientY });
        const el = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null;
        const col = el?.closest('[data-stage-col]')?.getAttribute('data-stage-col') || null;
        setDragOverStage(col);
      }
    };

    const onUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      if (active) {
        const el = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null;
        const targetStage = el?.closest('[data-stage-col]')?.getAttribute('data-stage-col') || null;
        setDragPos(null);
        if (targetStage) {
          handleDropOnStage(targetStage, cand.id);
        } else {
          draggedCandRef.current = null;
          setDraggedCandId(null);
          setDragOverStage(null);
        }
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const handleDropOnStage = async (targetStage: string, droppedId?: string | null) => {
    setDragOverStage(null);
    const id = droppedId || draggedCandRef.current || draggedCandId;
    draggedCandRef.current = null;
    setDraggedCandId(null);
    if (!id) return;
    const cand = candidates.find((c) => c.id === id);
    if (!cand || cand.stage === targetStage || cand.stage === 'hired') return;
    if (targetStage === 'hired') {
      await hireCandidate(cand);
      return;
    }
    await moveStage(cand.id, targetStage);
  };

  const hireCandidate = async (c: any) => {
    if (!window.confirm(tr(`Rekrut ${c.full_name} menjadi karyawan dan buat checklist onboarding?`, `Hire ${c.full_name} into Employees and generate onboarding checklist?`))) return;
    try {
      const res = await apiFetch(`/recruitment/candidates/${c.id}/hire`, { method: 'POST', body: JSON.stringify({}) });
      flash('ok', tr(`${c.full_name} resmi direkrut (NIK: ${res.nik}).`, `${c.full_name} hired (NIK: ${res.nik}).`));
      await load();
    } catch (err: any) {
      flash('err', err.message);
    }
  };

  const cancelHire = async (c: any) => {
    if (!window.confirm(tr(`Batalkan status rekrut untuk ${c.full_name}? Data karyawan & checklist onboarding baru akan dihapus dan kandidat dikembalikan ke tahap Offer.`, `Cancel hire for ${c.full_name}? This will remove the new employee & onboarding record and move them back to Offer.`))) return;
    try {
      await apiFetch(`/recruitment/candidates/${c.id}/cancel-hire`, { method: 'POST', body: JSON.stringify({}) });
      flash('ok', tr(`Rekrutmen ${c.full_name} dibatalkan.`, `Hire cancelled for ${c.full_name}.`));
      await load();
    } catch (err: any) {
      flash('err', err.message);
    }
  };

  const toggleOnboardingTask = async (taskId: string) => {
    try {
      await apiFetch(`/recruitment/onboarding/${taskId}/toggle`, { method: 'POST' });
      await load();
    } catch (err: any) {
      flash('err', err.message);
    }
  };

  const q = search.trim().toLowerCase();
  const filteredCandidates = candidates.filter((c) => {
    if (jobFilter !== 'all' && c.job_id !== jobFilter) return false;
    if (q && !`${c.full_name} ${c.email || ''} ${c.job_title || ''}`.toLowerCase().includes(q)) return false;
    return true;
  });

  const openJobsCount = jobs.filter((j) => j.status === 'open').length;
  const interviewOfferCount = candidates.filter((c) => c.stage === 'interview' || c.stage === 'offer').length;
  const hiredCount = candidates.filter((c) => c.stage === 'hired').length;

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-black text-slate-900">
            <Briefcase size={20} className="text-blue-600" />
            {tr('Rekrutmen & Onboarding', 'Recruitment & Onboarding')}
          </h1>
          <p className="text-xs text-slate-500">
            {tr('Lowongan kerja, papan Kanban kandidat, unggah CV, dan tracker onboarding karyawan baru.', 'Job openings, Kanban candidate pipeline, CV storage, and new-hire onboarding tracker.')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href="/careers"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            <ExternalLink size={14} /> {tr('Halaman Karir', 'Careers Page')}
          </a>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(`${window.location.origin}/careers`);
              flash('ok', tr('Tautan halaman karir disalin.', 'Careers page link copied.'));
            }}
            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
            title={tr('Salin Tautan Karir', 'Copy Careers Link')}
          >
            <Copy size={14} />
          </button>
          {jobs.length > 0 && (
            <button type="button" onClick={openNewCand} className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
              <UserPlus size={14} /> {tr('Tambah Kandidat', 'Add Candidate')}
            </button>
          )}
          <button type="button" onClick={openNewJob} className="inline-flex items-center gap-1 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800">
            <Plus size={14} /> {tr('Lowongan Baru', 'New Job')}
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-3.5">
          <div className="text-[11px] font-semibold text-slate-500">{tr('Lowongan Aktif', 'Open Positions')}</div>
          <div className="mt-1 text-xl font-black text-slate-900">{openJobsCount} <span className="text-xs font-semibold text-slate-400">/ {jobs.length}</span></div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-3.5">
          <div className="text-[11px] font-semibold text-slate-500">{tr('Total Kandidat', 'Total Candidates')}</div>
          <div className="mt-1 text-xl font-black text-blue-600">{candidates.length}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-3.5">
          <div className="text-[11px] font-semibold text-slate-500">{tr('Interview / Offer', 'Interview / Offer')}</div>
          <div className="mt-1 text-xl font-black text-amber-600">{interviewOfferCount}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-3.5">
          <div className="text-[11px] font-semibold text-slate-500">{tr('Direkrut / Onboarding', 'Hired / Onboarding')}</div>
          <div className="mt-1 text-xl font-black text-emerald-600">{hiredCount} <span className="text-xs font-semibold text-slate-400">({hires.length} tracked)</span></div>
        </div>
      </div>

      {notice && (
        <div className={`rounded-xl border px-3.5 py-2.5 text-xs font-semibold ${notice.type === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>
          {notice.text}
        </div>
      )}

      {/* Main Tabs */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1 rounded-2xl border border-slate-200 bg-white p-1.5 text-xs font-bold w-fit">
          <button type="button" onClick={() => setTab('pipeline')} className={`rounded-xl px-3 py-1.5 ${tab === 'pipeline' ? 'bg-slate-900 text-white' : 'text-slate-600'}`}>
            {tr('Lowongan & Pipeline', 'Jobs & Pipeline')} ({candidates.length})
          </button>
          <button type="button" onClick={() => setTab('calendar')} className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 ${tab === 'calendar' ? 'bg-slate-900 text-white' : 'text-slate-600'}`}>
            <CalendarIcon size={13} /> {tr('Kalender Interview', 'Interview Calendar')} ({candidates.filter((c) => c.interview_at).length})
          </button>
          <button type="button" onClick={() => setTab('onboarding')} className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 ${tab === 'onboarding' ? 'bg-slate-900 text-white' : 'text-slate-600'}`}>
            <ClipboardCheck size={13} /> {tr('Tracker Onboarding', 'Onboarding Tracker')} ({hires.length})
          </button>
        </div>

        {tab === 'pipeline' && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search size={13} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={tr('Cari kandidat...', 'Search candidate...')}
                className="rounded-xl border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs"
              />
            </div>
            <select value={jobFilter} onChange={(e) => setJobFilter(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700">
              <option value="all">{tr('Semua Lowongan', 'All Jobs')}</option>
              {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
            </select>
            <div className="flex rounded-xl border border-slate-200 bg-white p-0.5 text-xs">
              <button type="button" onClick={() => setViewMode('board')} className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 font-bold ${viewMode === 'board' ? 'bg-slate-900 text-white' : 'text-slate-600'}`}>
                <LayoutGrid size={12} /> Board
              </button>
              <button type="button" onClick={() => setViewMode('table')} className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 font-bold ${viewMode === 'table' ? 'bg-slate-900 text-white' : 'text-slate-600'}`}>
                <Table2 size={12} /> Table
              </button>
            </div>
          </div>
        )}
      </div>

      {tab === 'pipeline' ? (
        <>
          {/* Active Jobs */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {jobs.map((j) => (
              <div key={j.id} className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">{j.employment_type}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${j.status === 'open' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{j.status}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => openEditJob(j)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title={tr('Ubah', 'Edit')}>
                      <Pencil size={13} />
                    </button>
                    <button type="button" onClick={() => handleDeleteJob(j)} className="rounded-lg p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title={tr('Hapus', 'Delete')}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">{j.title}</h3>
                  <p className="text-xs text-slate-500">
                    {j.department_name || 'General'} · {j.headcount || 1} {tr('posisi', 'open')} · {j.candidate_count} {tr('kandidat', 'candidates')}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {loading ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-xs text-slate-400">Loading...</div>
          ) : viewMode === 'board' ? (
            <div className={`grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-6 ${draggedCandId ? 'select-none' : ''}`}>
              {STAGES.map((stage) => {
                const items = filteredCandidates.filter((c) => c.stage === stage);
                const isDropTarget = dragOverStage === stage && draggedCandId;
                return (
                  <div
                    key={stage}
                    data-stage-col={stage}
                    className={`rounded-2xl border p-2.5 space-y-2 transition ${
                      isDropTarget
                        ? 'border-blue-400 bg-blue-50/70 ring-2 ring-blue-300'
                        : 'border-slate-200 bg-slate-50/70'
                    }`}
                  >
                    <div className="flex items-center justify-between px-1">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${STAGE_STYLES[stage]}`}>{stage}</span>
                      <span className="text-[11px] font-bold text-slate-500">{items.length}</span>
                    </div>
                    <div className="space-y-2 min-h-[60px]">
                      {items.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-slate-200 p-3 text-center text-[11px] text-slate-400">
                          {isDropTarget ? tr('Lepas di sini', 'Drop here') : '-'}
                        </div>
                      ) : (
                        items.map((c) => (
                          <div
                            key={c.id}
                            onPointerDown={(e) => startPointerDrag(e, c)}
                            className={`select-none rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm space-y-1.5 text-xs transition ${
                              c.stage !== 'hired' ? 'cursor-grab active:cursor-grabbing hover:border-blue-300' : ''
                            } ${draggedCandId === c.id ? 'opacity-40 ring-2 ring-blue-300' : ''}`}
                          >
                            <div className="flex items-start justify-between gap-1">
                              <div className="font-bold text-slate-900 leading-tight">{c.full_name}</div>
                              <div className="flex items-center gap-0.5 shrink-0">
                                <button type="button" onClick={() => openEditCand(c)} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                                  <Pencil size={11} />
                                </button>
                                <button type="button" onClick={() => handleDeleteCandidate(c)} className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600">
                                  <Trash2 size={11} />
                                </button>
                              </div>
                            </div>
                            <div className="text-[11px] text-slate-500 truncate">{c.job_title}</div>
                            {c.interview_at && (
                              <button
                                type="button"
                                onClick={() => openInterviewModal(c)}
                                className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 hover:bg-amber-100"
                              >
                                <Clock size={10} /> {String(c.interview_at).replace('T', ' ')}
                              </button>
                            )}
                            {Number(c.offered_salary || 0) > 0 && (c.stage === 'offer' || c.stage === 'hired') && (
                              <button
                                type="button"
                                onClick={() => openOfferModal(c)}
                                className="inline-flex items-center gap-1 rounded-md bg-purple-50 px-1.5 py-0.5 text-[10px] font-bold text-purple-800 hover:bg-purple-100"
                              >
                                Offer: Rp {Number(c.offered_salary).toLocaleString('id-ID')}
                              </button>
                            )}
                            <div className="flex items-center justify-between text-[10px] text-slate-500">
                              <span className="inline-flex items-center gap-0.5">
                                <Star size={10} className="text-amber-500" /> {c.rating || '-'}/5
                              </span>
                              {c.resume_name && (
                                <button type="button" onClick={() => viewResume(c)} className="inline-flex items-center gap-0.5 font-semibold text-blue-600 hover:underline">
                                  <FileText size={10} /> CV
                                </button>
                              )}
                              {c.offer_letter_name && (
                                <button type="button" onClick={() => viewOfferLetter(c)} className="inline-flex items-center gap-0.5 font-semibold text-purple-600 hover:underline">
                                  <FileText size={10} /> Offer PDF
                                </button>
                              )}
                            </div>
                            <div className="pt-1 flex items-center justify-between gap-1">
                              <select
                                disabled={c.stage === 'hired'}
                                value={c.stage}
                                onChange={(e) => moveStage(c.id, e.target.value)}
                                className="w-full rounded-lg border border-slate-200 bg-white px-1.5 py-1 text-[10px] font-bold uppercase"
                              >
                                {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                              </select>
                              {c.stage !== 'hired' && c.stage !== 'rejected' ? (
                                <button
                                  type="button"
                                  onClick={() => hireCandidate(c)}
                                  className="shrink-0 rounded-lg bg-emerald-600 px-2 py-1 text-[10px] font-bold text-white hover:bg-emerald-700"
                                >
                                  Hire
                                </button>
                              ) : c.stage === 'hired' ? (
                                <button
                                  type="button"
                                  onClick={() => cancelHire(c)}
                                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] font-bold text-rose-700 hover:bg-rose-100"
                                  title={tr('Batalkan Rekrut', 'Cancel Hire')}
                                >
                                  <RotateCcw size={10} /> {tr('Batal', 'Cancel')}
                                </button>
                              ) : null}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Candidate Pipeline Table */
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-[11px] font-bold uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">{tr('Kandidat', 'Candidate')}</th>
                    <th className="px-4 py-3">{tr('Posisi', 'Position')}</th>
                    <th className="px-4 py-3">{tr('Kontak', 'Contact')}</th>
                    <th className="px-4 py-3">CV</th>
                    <th className="px-4 py-3">{tr('Tahap', 'Stage')}</th>
                    <th className="px-4 py-3 text-right">{tr('Aksi', 'Action')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredCandidates.length === 0 ? (
                    <tr><td colSpan={6} className="p-8 text-center text-slate-400">{tr('Belum ada kandidat.', 'No candidates yet.')}</td></tr>
                  ) : (
                    filteredCandidates.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <div className="font-bold text-slate-900">{c.full_name}</div>
                          {c.interview_notes && <div className="line-clamp-1 text-[11px] text-slate-400">{c.interview_notes}</div>}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{c.job_title}</td>
                        <td className="px-4 py-3 text-slate-500">{[c.email, c.phone].filter(Boolean).join(' · ') || '-'}</td>
                        <td className="px-4 py-3">
                          {c.resume_name ? (
                            <button type="button" onClick={() => viewResume(c)} className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2 py-1 text-[11px] font-bold text-blue-700 hover:bg-blue-100">
                              <FileText size={11} /> {c.resume_name}
                            </button>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <select
                            disabled={c.stage === 'hired'}
                            value={c.stage}
                            onChange={(e) => moveStage(c.id, e.target.value)}
                            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold uppercase"
                          >
                            {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button type="button" onClick={() => openEditCand(c)} className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-100" title={tr('Ubah', 'Edit')}>
                              <Pencil size={12} />
                            </button>
                            <button type="button" onClick={() => handleDeleteCandidate(c)} className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600" title={tr('Hapus', 'Delete')}>
                              <Trash2 size={12} />
                            </button>
                            {c.stage !== 'hired' && c.stage !== 'rejected' ? (
                              <button
                                type="button"
                                onClick={() => hireCandidate(c)}
                                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1 text-[11px] font-bold text-white hover:bg-emerald-700"
                              >
                                <CheckCircle2 size={12} /> {tr('Rekrut', 'Hire')}
                              </button>
                            ) : c.stage === 'hired' ? (
                              <button
                                type="button"
                                onClick={() => cancelHire(c)}
                                className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-100"
                              >
                                <RotateCcw size={11} /> {tr('Batalkan Rekrut', 'Cancel Hire')}
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : tab === 'calendar' ? (
        /* Interview Calendar Tab */
        (() => {
          const [yStr, mStr] = calendarMonth.split('-');
          const year = Number(yStr);
          const monthIdx = Number(mStr) - 1;
          const firstDay = new Date(year, monthIdx, 1).getDay();
          const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
          const scheduled = candidates
            .filter((c) => c.interview_at)
            .sort((a, b) => String(a.interview_at).localeCompare(String(b.interview_at)));

          const shiftMonth = (delta: number) => {
            const d = new Date(year, monthIdx + delta, 1);
            setCalendarMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
          };

          const monthLabel = new Date(year, monthIdx, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
          const cells: (number | null)[] = [
            ...Array.from({ length: firstDay }, () => null),
            ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
          ];

          return (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
              <div className="lg:col-span-8 rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-black text-slate-900">{monthLabel}</h2>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => shiftMonth(-1)} className="rounded-lg border border-slate-200 p-1.5 hover:bg-slate-50"><ChevronLeft size={14} /></button>
                    <button type="button" onClick={() => setCalendarMonth(new Date().toISOString().slice(0, 7))} className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-bold hover:bg-slate-50">{tr('Hari Ini', 'Today')}</button>
                    <button type="button" onClick={() => shiftMonth(1)} className="rounded-lg border border-slate-200 p-1.5 hover:bg-slate-50"><ChevronRight size={14} /></button>
                  </div>
                </div>
                <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase text-slate-400">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <div key={d} className="py-1">{d}</div>)}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {cells.map((day, idx) => {
                    if (!day) return <div key={`empty-${idx}`} className="min-h-[76px] rounded-xl bg-slate-50/50" />;
                    const dateStr = `${calendarMonth}-${String(day).padStart(2, '0')}`;
                    const dayItems = scheduled.filter((c) => String(c.interview_at).startsWith(dateStr));
                    const isToday = dateStr === new Date().toISOString().slice(0, 10);
                    return (
                      <div key={dateStr} className={`min-h-[76px] rounded-xl border p-1.5 text-left ${isToday ? 'border-blue-400 bg-blue-50/40' : 'border-slate-200 bg-white'}`}>
                        <div className={`text-[11px] font-bold ${isToday ? 'text-blue-700' : 'text-slate-500'}`}>{day}</div>
                        <div className="mt-1 space-y-1">
                          {dayItems.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => openInterviewModal(c)}
                              className="w-full truncate rounded-md bg-amber-100 px-1.5 py-0.5 text-left text-[10px] font-bold text-amber-900 hover:bg-amber-200"
                              title={`${String(c.interview_at).slice(11, 16)} · ${c.full_name} (${c.job_title})`}
                            >
                              {String(c.interview_at).slice(11, 16)} {c.full_name}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="lg:col-span-4 rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
                <h3 className="text-xs font-black uppercase tracking-wide text-slate-700">
                  {tr('Agenda Interview', 'Scheduled Interviews')} ({scheduled.length})
                </h3>
                {scheduled.length === 0 ? (
                  <p className="py-8 text-center text-xs text-slate-400">
                    {tr('Pindahkan kandidat ke tahap "interview" untuk menjadwalkan.', 'Move any candidate to "interview" to schedule.')}
                  </p>
                ) : (
                  <div className="space-y-2 max-h-[460px] overflow-y-auto">
                    {scheduled.map((c) => (
                      <div key={c.id} className="rounded-xl border border-slate-200 p-3 text-xs space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-slate-900">{c.full_name}</span>
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-700">
                            {c.interview_type || 'online'}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500">{c.job_title}</div>
                        <div className="font-semibold text-blue-700">{String(c.interview_at).replace('T', ' ')}</div>
                        {c.interview_location && <div className="text-[11px] text-slate-600 truncate">{c.interview_location}</div>}
                        {c.interviewer_name && <div className="text-[11px] text-slate-400">Interviewer: {c.interviewer_name}</div>}
                        <div className="pt-1 flex justify-end">
                          <button type="button" onClick={() => openInterviewModal(c)} className="text-[11px] font-bold text-blue-600 hover:underline">
                            {tr('Ubah Jadwal', 'Reschedule')}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })()
      ) : (
        /* Onboarding Tracker Tab */
        <div className="space-y-3">
          {hires.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-xs text-slate-500">
              {tr('Belum ada karyawan baru dalam tracker onboarding. Klik "Hire" pada kandidat untuk memulai onboarding.', 'No new hires in onboarding tracker yet. Click "Hire" on a candidate to start.')}
            </div>
          ) : (
            hires.map((h) => {
              const doneCount = h.tasks.filter((t: any) => t.is_completed).length;
              const pct = h.tasks.length > 0 ? Math.round((doneCount / h.tasks.length) * 100) : 0;
              return (
                <div key={h.employee_id} className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-900">{h.employee_name}</span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{h.nik}</span>
                      </div>
                      <div className="text-xs text-slate-500">{h.job_title} · Join Date: {h.join_date}</div>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <div className="h-2 w-28 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="font-bold text-slate-700">{doneCount}/{h.tasks.length} ({pct}%)</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {h.tasks.map((t: any) => (
                      <label
                        key={t.id}
                        className={`flex cursor-pointer items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs transition ${
                          t.is_completed ? 'border-emerald-200 bg-emerald-50/50 text-slate-500 line-through' : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={Boolean(t.is_completed)}
                            onChange={() => toggleOnboardingTask(t.id)}
                            className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                          />
                          {t.title}
                        </span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{t.owner_role}</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {showJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-black text-slate-900">
                  {editingJobId ? tr('Ubah Lowongan Kerja', 'Edit Job Opening') : tr('Buat Lowongan Kerja Baru', 'Create Job Opening')}
                </h2>
                <p className="text-[11px] text-slate-500">
                  {tr('Lowongan berstatus Open akan tampil otomatis di halaman karir publik (/careers).', 'Open positions are automatically published on the public careers portal (/careers).')}
                </p>
              </div>
              <button type="button" onClick={() => setShowJob(false)}><X size={18} className="text-slate-400" /></button>
            </div>

            <form onSubmit={handleSaveJob} className="space-y-4 text-xs">
              {/* Section 1: Role & Placement */}
              <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-3.5">
                <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">
                  {tr('1. Posisi & Penempatan', '1. Role & Location')}
                </div>
                <div>
                  <label className="mb-1 block font-semibold text-slate-700">{tr('Judul Posisi *', 'Job Title *')}</label>
                  <input required value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="e.g. Senior Field Engineer, HR Generalist" className="w-full rounded-xl border border-slate-300 bg-white p-2.5" />
                </div>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block font-semibold text-slate-700">{tr('Departemen', 'Department')}</label>
                    <select value={jobDept} onChange={(e) => setJobDept(e.target.value)} className="w-full rounded-xl border border-slate-300 bg-white p-2.5">
                      <option value="">{tr('Semua Departemen', 'Any Department')}</option>
                      {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block font-semibold text-slate-700">{tr('Lokasi / Cabang', 'Office / Branch')}</label>
                    <select value={jobBranch} onChange={(e) => setJobBranch(e.target.value)} className="w-full rounded-xl border border-slate-300 bg-white p-2.5">
                      <option value="">{tr('Semua Cabang', 'Any Branch')}</option>
                      {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block font-semibold text-slate-700">{tr('Sistem Kerja', 'Work Arrangement')}</label>
                    <select value={jobWorkMode} onChange={(e) => setJobWorkMode(e.target.value)} className="w-full rounded-xl border border-slate-300 bg-white p-2.5">
                      <option value="onsite">{tr('On-site (Kantor)', 'On-site')}</option>
                      <option value="hybrid">Hybrid</option>
                      <option value="remote">Remote</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Section 2: Employment & Hiring Terms */}
              <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-3.5">
                <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">
                  {tr('2. Kontrak, Level & Kuota', '2. Employment & Hiring Terms')}
                </div>
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  <div>
                    <label className="mb-1 block font-semibold text-slate-700">{tr('Tipe Kontrak', 'Employment Type')}</label>
                    <select value={jobType} onChange={(e) => setJobType(e.target.value)} className="w-full rounded-xl border border-slate-300 bg-white p-2.5">
                      <option value="PKWTT">PKWTT (Permanent)</option>
                      <option value="PKWT">PKWT (Contract)</option>
                      <option value="probation">Probation</option>
                      <option value="intern">Internship</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block font-semibold text-slate-700">{tr('Level Pengalaman', 'Experience Level')}</label>
                    <select value={jobExpLevel} onChange={(e) => setJobExpLevel(e.target.value)} className="w-full rounded-xl border border-slate-300 bg-white p-2.5">
                      <option value="entry">Entry / Fresh Grad</option>
                      <option value="junior">Junior (1-2 yrs)</option>
                      <option value="mid">Mid-Level (3-5 yrs)</option>
                      <option value="senior">Senior (5+ yrs)</option>
                      <option value="lead">Lead / Manager</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block font-semibold text-slate-700">{tr('Kebutuhan (Orang)', 'Headcount')}</label>
                    <input type="number" min={1} value={jobHeadcount} onChange={(e) => setJobHeadcount(e.target.value)} className="w-full rounded-xl border border-slate-300 bg-white p-2.5" />
                  </div>
                  <div>
                    <label className="mb-1 block font-semibold text-slate-700">{tr('Status Lowongan', 'Status')}</label>
                    <select value={jobStatus} onChange={(e) => setJobStatus(e.target.value)} className="w-full rounded-xl border border-slate-300 bg-white p-2.5">
                      <option value="open">Open (Published)</option>
                      <option value="paused">Paused (Hidden)</option>
                      <option value="closed">Closed</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block font-semibold text-slate-700">{tr('Gaji Minimum (IDR/bln)', 'Min Salary (IDR/mo)')}</label>
                    <input type="number" min={0} step={100000} value={jobSalaryMin} onChange={(e) => setJobSalaryMin(e.target.value)} placeholder="e.g. 7000000" className="w-full rounded-xl border border-slate-300 bg-white p-2.5" />
                  </div>
                  <div>
                    <label className="mb-1 block font-semibold text-slate-700">{tr('Gaji Maksimum (IDR/bln)', 'Max Salary (IDR/mo)')}</label>
                    <input type="number" min={0} step={100000} value={jobSalaryMax} onChange={(e) => setJobSalaryMax(e.target.value)} placeholder="e.g. 12000000" className="w-full rounded-xl border border-slate-300 bg-white p-2.5" />
                  </div>
                  <div>
                    <label className="mb-1 block font-semibold text-slate-700">{tr('Batas Lamaran', 'Closing Date')}</label>
                    <input type="date" value={jobClosingDate} onChange={(e) => setJobClosingDate(e.target.value)} className="w-full rounded-xl border border-slate-300 bg-white p-2.5" />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-slate-700">
                  <input type="checkbox" checked={jobShowSalary} onChange={(e) => setJobShowSalary(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
                  {tr('Tampilkan kisaran gaji di halaman karir publik', 'Display salary range on Public Careers page')}
                </label>
              </div>

              {/* Section 3: Description & Requirements */}
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block font-semibold text-slate-700">
                    {tr('Deskripsi Pekerjaan & Tanggung Jawab (1 poin per baris)', 'Job Description & Responsibilities (one bullet per line)')}
                  </label>
                  <textarea
                    rows={4}
                    value={jobDesc}
                    onChange={(e) => setJobDesc(e.target.value)}
                    placeholder={tr('- Mengelola operasional harian tim\n- Menyusun laporan mingguan ke manajer', '- Manage daily team operations\n- Prepare weekly reports for management')}
                    className="w-full rounded-xl border border-slate-300 p-2.5"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-semibold text-slate-700">
                    {tr('Kualifikasi & Persyaratan (1 poin per baris)', 'Qualifications & Requirements (one bullet per line)')}
                  </label>
                  <textarea
                    rows={4}
                    value={jobRequirements}
                    onChange={(e) => setJobRequirements(e.target.value)}
                    placeholder={tr('- Pendidikan min. S1 jurusan terkait\n- Pengalaman minimal 2 tahun', '- Bachelor degree in relevant field\n- Minimum 2 years of experience')}
                    className="w-full rounded-xl border border-slate-300 p-2.5"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                <button type="button" onClick={() => setShowJob(false)} className="rounded-xl border border-slate-200 px-4 py-2 font-bold text-slate-600">{tr('Batal', 'Cancel')}</button>
                <button type="submit" className="rounded-xl bg-slate-900 px-5 py-2 font-bold text-white hover:bg-slate-800">{tr('Simpan Lowongan', 'Save Job Opening')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showCand && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-xl">
            <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-base font-black text-slate-900">
                {editingCandId ? tr('Ubah Kandidat', 'Edit Candidate') : tr('Tambah Kandidat', 'Add Candidate')}
              </h2>
              <button type="button" onClick={() => setShowCand(false)}><X size={18} className="text-slate-400" /></button>
            </div>
            <form onSubmit={handleSaveCandidate} className="space-y-3 text-xs">
              {!editingCandId && (
                <select value={candJob} onChange={(e) => setCandJob(e.target.value)} className="w-full rounded-xl border border-slate-300 bg-white p-2.5">
                  {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
                </select>
              )}
              <input required value={candName} onChange={(e) => setCandName(e.target.value)} placeholder={tr('Nama Lengkap', 'Full Name')} className="w-full rounded-xl border border-slate-300 p-2.5" />
              <div className="grid grid-cols-2 gap-2">
                <input type="email" value={candEmail} onChange={(e) => setCandEmail(e.target.value)} placeholder="Email" className="rounded-xl border border-slate-300 p-2.5" />
                <input value={candPhone} onChange={(e) => setCandPhone(e.target.value)} placeholder="Phone" className="rounded-xl border border-slate-300 p-2.5" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input type="number" value={candSalary} onChange={(e) => setCandSalary(e.target.value)} placeholder="Offered Salary" className="rounded-xl border border-slate-300 p-2.5" />
                <select value={candRating} onChange={(e) => setCandRating(e.target.value)} className="rounded-xl border border-slate-300 bg-white p-2.5">
                  <option value="0">Rating: -</option>
                  <option value="1">Rating: 1/5</option>
                  <option value="2">Rating: 2/5</option>
                  <option value="3">Rating: 3/5</option>
                  <option value="4">Rating: 4/5</option>
                  <option value="5">Rating: 5/5</option>
                </select>
              </div>
              <textarea rows={3} value={candNotes} onChange={(e) => setCandNotes(e.target.value)} placeholder={tr('Catatan wawancara...', 'Interview notes...')} className="w-full rounded-xl border border-slate-300 p-2.5" />
              <label className="flex cursor-pointer items-center justify-between rounded-xl border border-dashed border-slate-300 px-3 py-2.5 text-slate-600 hover:bg-slate-50">
                <span className="flex items-center gap-2">
                  <Upload size={14} className="text-slate-400" />
                  {candResumeFile ? candResumeFile.name : tr('Unggah CV / Resume (PDF/DOC)', 'Upload CV / Resume (PDF/DOC)')}
                </span>
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,image/*"
                  className="hidden"
                  onChange={(e) => setCandResumeFile(e.target.files?.[0] || null)}
                />
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowCand(false)} className="rounded-xl border border-slate-200 px-4 py-2 font-bold text-slate-600">{tr('Batal', 'Cancel')}</button>
                <button type="submit" className="rounded-xl bg-slate-900 px-5 py-2 font-bold text-white">{tr('Simpan', 'Save')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {interviewCand && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-xl">
            <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-black text-slate-900">{tr('Jadwalkan Interview', 'Schedule Interview')}</h2>
                <p className="text-xs font-semibold text-blue-600">{interviewCand.full_name} · {interviewCand.job_title}</p>
              </div>
              <button type="button" onClick={() => setInterviewCand(null)}><X size={18} className="text-slate-400" /></button>
            </div>
            <form onSubmit={handleSaveInterview} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block font-semibold text-slate-700">{tr('Tanggal & Jam *', 'Date & Time *')}</label>
                  <input required type="datetime-local" value={intDateTime} onChange={(e) => setIntDateTime(e.target.value)} className="w-full rounded-xl border border-slate-300 p-2.5" />
                </div>
                <div>
                  <label className="mb-1 block font-semibold text-slate-700">{tr('Format', 'Format')}</label>
                  <select value={intType} onChange={(e) => setIntType(e.target.value)} className="w-full rounded-xl border border-slate-300 bg-white p-2.5">
                    <option value="online">Online / Video Call</option>
                    <option value="onsite">On-site (Office)</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1 block font-semibold text-slate-700">{tr('Link Meeting / Lokasi Kantor', 'Meeting Link / Office Location')}</label>
                <input value={intLocation} onChange={(e) => setIntLocation(e.target.value)} placeholder={intType === 'online' ? 'https://meet.google.com/...' : 'Batam Office - Meeting Room 1'} className="w-full rounded-xl border border-slate-300 p-2.5" />
              </div>
              <div>
                <label className="mb-1 block font-semibold text-slate-700">{tr('Pewawancara (Interviewer)', 'Interviewer')}</label>
                <input value={intInterviewer} onChange={(e) => setIntInterviewer(e.target.value)} placeholder="e.g. Siti Rahmawati (HR) & Tech Lead" className="w-full rounded-xl border border-slate-300 p-2.5" />
              </div>
              <div>
                <label className="mb-1 block font-semibold text-slate-700">{tr('Catatan', 'Notes')}</label>
                <textarea rows={2} value={intNotes} onChange={(e) => setIntNotes(e.target.value)} placeholder={tr('Topik wawancara atau catatan...', 'Interview topics or notes...')} className="w-full rounded-xl border border-slate-300 p-2.5" />
              </div>
              <label className="flex items-center gap-2 text-slate-700">
                <input type="checkbox" checked={intSendEmail} disabled={!interviewCand.email} onChange={(e) => setIntSendEmail(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
                {interviewCand.email
                  ? tr(`Kirim undangan email ke ${interviewCand.email}`, `Send email invitation to ${interviewCand.email}`)
                  : tr('Kandidat tidak memiliki alamat email', 'Candidate has no email address')}
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setInterviewCand(null)} className="rounded-xl border border-slate-200 px-4 py-2 font-bold text-slate-600">{tr('Batal', 'Cancel')}</button>
                <button type="submit" className="rounded-xl bg-blue-600 px-5 py-2 font-bold text-white hover:bg-blue-700">{tr('Simpan & Kirim', 'Save & Notify')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {offerCand && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white p-5 shadow-xl max-h-[92vh] overflow-y-auto">
            <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-black text-slate-900">{tr('Buat & Kirim Offer Letter', 'Create & Send Offer Letter')}</h2>
                <p className="text-xs font-semibold text-purple-600">{offerCand.full_name} · {offerCand.job_title}</p>
              </div>
              <button type="button" onClick={() => setOfferCand(null)}><X size={18} className="text-slate-400" /></button>
            </div>
            <form onSubmit={handleSaveOffer} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block font-semibold text-slate-700">{tr('No. Perjanjian *', 'Agreement No. *')}</label>
                  <input required value={offerAgreementNo} onChange={(e) => setOfferAgreementNo(e.target.value)} className="w-full rounded-xl border border-slate-300 p-2.5 font-mono" />
                </div>
                <div>
                  <label className="mb-1 block font-semibold text-slate-700">{tr('No. KTP / Paspor / IC', 'IC / Passport / KTP No.')}</label>
                  <input value={offerIcNumber} onChange={(e) => setOfferIcNumber(e.target.value)} placeholder="e.g. E0747602" className="w-full rounded-xl border border-slate-300 p-2.5" />
                </div>
              </div>
              <div>
                <label className="mb-1 block font-semibold text-slate-700">{tr('Alamat Kandidat', 'Candidate Address')}</label>
                <input value={offerAddress} onChange={(e) => setOfferAddress(e.target.value)} placeholder="e.g. Batam Center, Batam" className="w-full rounded-xl border border-slate-300 p-2.5" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block font-semibold text-slate-700">{tr('Gaji Bulanan (IDR) *', 'Monthly Salary (IDR) *')}</label>
                  <input required type="number" min={0} step={100000} value={offerSalary} onChange={(e) => setOfferSalary(e.target.value)} placeholder="e.g. 6000000" className="w-full rounded-xl border border-slate-300 p-2.5" />
                </div>
                <div>
                  <label className="mb-1 block font-semibold text-slate-700">{tr('Tanggal Mulai Kerja *', 'Start Date *')}</label>
                  <input required type="date" value={offerStartDate} onChange={(e) => setOfferStartDate(e.target.value)} className="w-full rounded-xl border border-slate-300 p-2.5" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block font-semibold text-slate-700">{tr('Jam Kerja Resmi', 'Official Working Hours')}</label>
                  <input value={offerWorkingHours} onChange={(e) => setOfferWorkingHours(e.target.value)} className="w-full rounded-xl border border-slate-300 p-2.5" />
                </div>
                <div>
                  <label className="mb-1 block font-semibold text-slate-700">{tr('Berlaku Hingga', 'Offer Valid Until')}</label>
                  <input type="date" value={offerExpiresAt} onChange={(e) => setOfferExpiresAt(e.target.value)} className="w-full rounded-xl border border-slate-300 p-2.5" />
                </div>
              </div>
              <div>
                <label className="mb-1 block font-semibold text-slate-700">{tr('Tunjangan / Catatan Tambahan', 'Additional Benefits / Notes')}</label>
                <textarea rows={2} value={offerNotes} onChange={(e) => setOfferNotes(e.target.value)} placeholder={tr('Opsional: tunjangan khusus atau catatan...', 'Optional: special allowances or notes...')} className="w-full rounded-xl border border-slate-300 p-2.5" />
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-700">{tr('Lampiran Surat Offer Letter (PDF)', 'Offer Letter PDF Attachment')}</span>
                  <button
                    type="button"
                    onClick={() => {
                      const doc = generateOfferPdfBlob(offerCand);
                      window.open(doc.output('bloburl'), '_blank');
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-purple-200 bg-white px-2.5 py-1 text-[11px] font-bold text-purple-700 hover:bg-purple-50"
                  >
                    <FileText size={11} /> {tr('Pratinjau PDF', 'Preview PDF')}
                  </button>
                </div>
                <label className="flex cursor-pointer items-center justify-between rounded-xl border border-dashed border-slate-300 bg-white px-3 py-2 text-slate-600 hover:bg-slate-50">
                  <span className="flex items-center gap-2 truncate">
                    <Upload size={13} className="shrink-0 text-slate-400" />
                    <span className="truncate">
                      {offerCustomFile
                        ? offerCustomFile.name
                        : tr('Otomatis dibuat dari template (atau klik untuk unggah PDF sendiri)', 'Auto-generated from template (or click to upload custom PDF)')}
                    </span>
                  </span>
                  <input type="file" accept=".pdf" className="hidden" onChange={(e) => setOfferCustomFile(e.target.files?.[0] || null)} />
                </label>
              </div>
              <label className="flex items-center gap-2 text-slate-700">
                <input type="checkbox" checked={offerSendEmail} disabled={!offerCand.email} onChange={(e) => setOfferSendEmail(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
                {offerCand.email
                  ? tr(`Kirim Offer Letter ke ${offerCand.email}`, `Send Offer Letter to ${offerCand.email}`)
                  : tr('Kandidat tidak memiliki alamat email', 'Candidate has no email address')}
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setOfferCand(null)} className="rounded-xl border border-slate-200 px-4 py-2 font-bold text-slate-600">{tr('Batal', 'Cancel')}</button>
                <button type="submit" className="rounded-xl bg-purple-600 px-5 py-2 font-bold text-white hover:bg-purple-700">{tr('Simpan & Kirim', 'Save & Send Offer')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {draggedCandId && dragPos && (
        <div
          style={{ left: dragPos.x + 12, top: dragPos.y + 12 }}
          className="pointer-events-none fixed z-50 rounded-xl border border-blue-400 bg-white/95 px-3 py-2 text-xs font-bold text-slate-900 shadow-xl"
        >
          {candidates.find((c) => c.id === draggedCandId)?.full_name}
        </div>
      )}
    </div>
  );
};
