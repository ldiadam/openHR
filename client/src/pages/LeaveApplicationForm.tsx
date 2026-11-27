import React, { useEffect, useMemo, useState } from 'react';
import { Check, ChevronRight, AlertTriangle, CheckCircle2, Send, Info } from 'lucide-react';
import { apiFetch } from '../api';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { SignaturePad } from '../components/SignaturePad';
import { MobileDatePicker } from '../components/pickers/MobileDatePicker';
import { MobileSelect } from '../components/pickers/MobileSelect';

/**
 * Stage 1 of the leave application: the applicant fills in their part and signs.
 *
 * Everything shown here is driven by GET /leave/form/config — the letterhead is
 * the company's own record and the department / leave-type options are real
 * database rows. No organisation or list is hardcoded in this file.
 */

interface FormConfig {
  letterhead: {
    name: string;
    address: string;
    email: string;
    phone: string;
    regNo: string;
    logoUrl: string | null;
  };
  letterheadGaps: Record<string, boolean>;
  departments: Array<{ id: string; name: string; code: string | null }>;
  leaveTypes: Array<{ id: string; code: string; name: string; is_paid: number }>;
  formTitle: string;
  viewer?: {
    role?: string;
    employeeId?: string | null;
    fullName?: string | null;
    departmentId?: string | null;
    canPrint?: boolean;
  };
}

const STEPS = [
  { id: 'Data pemohon', en: 'Applicant details', shortId: 'Pemohon', shortEn: 'Applicant' },
  { id: 'Detail cuti', en: 'Leave details', shortId: 'Cuti', shortEn: 'Leave' },
  { id: 'Tanda tangan', en: 'Signature', shortId: 'Tanda tangan', shortEn: 'Sign' },
  { id: 'Periksa', en: 'Review', shortId: 'Kirim', shortEn: 'Review' },
];

const todayISO = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/** Counts working days so the applicant sees the number that will be deducted. */
function workingDays(from: string, to: string): number {
  if (!from || !to) return 0;
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;

  let days = 0;
  for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const day = cursor.getUTCDay();
    if (day === 0 || day === 6) continue;
    days++;
  }
  return days;
}

const formatDDMMYY = (iso: string) => {
  if (!iso) return '—';
  const date = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return '—';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getUTCDate())} ${pad(date.getUTCMonth() + 1)} ${String(date.getUTCFullYear()).slice(-2)}`;
};

export const LeaveApplicationForm: React.FC = () => {
  const { user } = useAuth();
  const { tr } = useLanguage();

  const [config, setConfig] = useState<FormConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ referenceNo: string; slaDueAt: string } | null>(null);

  // Applicant
  const [applicantName, setApplicantName] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [submissionDate, setSubmissionDate] = useState(todayISO());

  // Leave
  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [otherNote, setOtherNote] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');

  // Signature
  const [signature, setSignature] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch('/leave/form/config');
        setConfig(res);
        if (res.viewer?.fullName) {
          setApplicantName(res.viewer.fullName);
        }
        const matchedDept = res.viewer?.departmentId
          ? res.departments?.find((d: any) => d.id === res.viewer.departmentId)
          : null;
        if (matchedDept) {
          setDepartmentId(matchedDept.id);
        } else if (res.departments?.[0]) {
          setDepartmentId(res.departments[0].id);
        }
        if (res.leaveTypes?.[0]) setLeaveTypeId(res.leaveTypes[0].id);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
    if (user?.name) setApplicantName(user.name);
  }, [user?.name]);

  const selectedType = config?.leaveTypes.find((type) => type.id === leaveTypeId);
  const isOtherType = ['other', 'others'].includes(String(selectedType?.code || '').toLowerCase());
  const totalDays = useMemo(() => workingDays(startDate, endDate), [startDate, endDate]);

  const missingLetterhead = useMemo(() => {
    const gaps = config?.letterheadGaps || {};
    return Object.entries(gaps)
      .filter(([, present]) => !present)
      .map(([key]) => key);
  }, [config]);

  const stepProblems = [
    [
      !applicantName.trim() ? tr('Isi nama pemohon.', 'Enter the applicant name.') : '',
      !departmentId ? tr('Pilih departemen.', 'Choose a department.') : '',
    ].filter(Boolean),
    [
      !leaveTypeId ? tr('Pilih jenis cuti.', 'Choose a leave type.') : '',
      isOtherType && !otherNote.trim() ? tr('Jelaskan jenis cuti "Others".', 'Explain the "Others" type.') : '',
      !startDate || !endDate ? tr('Lengkapi tanggal cuti.', 'Complete the leave dates.') : '',
      startDate && endDate && endDate < startDate
        ? tr('Tanggal selesai sebelum tanggal mulai.', 'End date is before the start date.')
        : '',
      totalDays === 0 ? tr('Rentang tanggal tidak memuat hari kerja.', 'The range contains no working days.') : '',
      !reason.trim() ? tr('Isi alasan cuti.', 'Enter the reason.') : '',
    ].filter(Boolean),
    [!signature ? tr('Tanda tangan diperlukan.', 'A signature is required.') : ''].filter(Boolean),
    [],
  ] as string[][];

  const canAdvance = stepProblems[step].length === 0;

  const goNext = () => {
    if (!canAdvance) {
      setError(stepProblems[step][0]);
      return;
    }
    setError(null);
    setStep((current) => Math.min(STEPS.length - 1, current + 1));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await apiFetch('/leave/applications', {
        method: 'POST',
        body: JSON.stringify({
          employee_id: user?.employeeId,
          department_id: departmentId,
          leave_type_id: leaveTypeId,
          leave_type_other_note: isOtherType ? otherNote.trim() : undefined,
          start_date: startDate,
          end_date: endDate,
          total_days: totalDays,
          reason: reason.trim(),
          applicant_signature: signature,
          submission_date: submissionDate,
        }),
      });
      setResult({ referenceNo: res.referenceNo, slaDueAt: res.slaDueAt });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-xs text-slate-400">
        {tr('Memuat formulir...', 'Loading form...')}
      </div>
    );
  }

  if (result) {
    return (
      <div className="mx-auto max-w-lg p-5">
        <div className="rounded-3xl border border-emerald-200 bg-white p-6 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <CheckCircle2 size={28} />
          </div>
          <h2 className="mt-3 text-base font-bold text-slate-900">
            {tr('Pengajuan terkirim', 'Application submitted')}
          </h2>
          <p className="mt-1 text-[11px] text-slate-500">
            {tr('Nomor referensi', 'Reference number')}
          </p>
          <p className="mt-1 font-mono text-lg font-black text-slate-900">{result.referenceNo}</p>

          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-left text-[11px] leading-relaxed text-amber-800">
            <Info size={13} className="mr-1 inline" />
            {tr(
              'Cuti belum resmi disetujui sampai persetujuan Management selesai. Anda akan menerima kabar paling lambat satu hari kerja setelah pengajuan.',
              'Leave is not officially confirmed until Management approval is complete. You will hear back within one working day of submitting.'
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              setResult(null);
              setStep(0);
              setStartDate('');
              setEndDate('');
              setReason('');
              setSignature(null);
            }}
            className="mt-5 w-full rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white hover:bg-slate-800"
          >
            {tr('Ajukan cuti lain', 'Submit another application')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-5">
      {/* Letterhead — straight from the company record. */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-sm font-black uppercase tracking-wide text-slate-900">
              {config?.letterhead.name || tr('Nama perusahaan belum diatur', 'Company name not set')}
            </h1>
            {config?.letterhead.address && (
              <p className="text-[10px] leading-relaxed text-slate-500">{config.letterhead.address}</p>
            )}
            <p className="text-[10px] text-slate-500">
              {[config?.letterhead.email, config?.letterhead.phone].filter(Boolean).join(' · ')}
            </p>
            {config?.letterhead.regNo && (
              <p className="text-[10px] text-slate-400">
                {tr('No. Pendaftaran', 'Reg. No.')}: {config.letterhead.regNo}
              </p>
            )}
          </div>
          {config?.letterhead.logoUrl && (
            <img
              src={config.letterhead.logoUrl}
              alt=""
              className="max-h-12 w-auto shrink-0 object-contain"
            />
          )}
        </div>
        <div className="mt-3 border-t border-slate-200 pt-2 text-center text-[11px] font-bold uppercase tracking-widest text-slate-700">
          {config?.formTitle || tr('Formulir Permohonan Cuti', 'Leave Application Form')}
        </div>

        {/* Admins are told which company details are still missing. */}
        {missingLetterhead.length > 0 && user?.role === 'owner_admin' && (
          <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1.5 text-[10px] font-medium text-amber-800">
            <AlertTriangle size={11} className="mr-1 inline" />
            {tr(
              `Lengkapi data perusahaan di Pengaturan: ${missingLetterhead.join(', ')}.`,
              `Complete the company profile in Settings: ${missingLetterhead.join(', ')}.`
            )}
          </p>
        )}
      </div>

      {/* Progress rail */}
      <div className="flex items-center gap-1">
        {STEPS.map((item, index) => (
          <button
            key={item.en}
            type="button"
            onClick={() => index <= step && setStep(index)}
            disabled={index > step}
            className={`flex flex-1 items-center gap-1.5 ${index <= step ? 'cursor-pointer' : 'cursor-default'}`}
          >
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-black ${
                index === step
                  ? 'bg-slate-900 text-white'
                  : index < step
                    ? 'bg-emerald-500 text-white'
                    : 'bg-slate-200 text-slate-500'
              }`}
            >
              {index < step ? <Check size={10} /> : index + 1}
            </span>
            <span
              className={`hidden truncate text-[10px] font-bold sm:block ${
                index === step ? 'text-slate-900' : 'text-slate-400'
              }`}
            >
              {tr(item.shortId, item.shortEn)}
            </span>
            {index < STEPS.length - 1 && <span className="h-px flex-1 bg-slate-200" />}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-xs font-bold text-slate-900">{tr(STEPS[step].id, STEPS[step].en)}</h2>

        {step === 0 && (
          <div className="space-y-3 text-xs">
            <div>
              <label className="mb-1 block font-semibold text-slate-700">
                {tr('Nama pemohon', 'Applicant name')} <span className="text-rose-500">*</span>
              </label>
              <input
                value={applicantName}
                onChange={(event) => setApplicantName(event.target.value)}
                className="w-full rounded-xl border border-slate-300 p-2.5 font-medium focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block font-semibold text-slate-700">
                {tr('Departemen', 'Department')} <span className="text-rose-500">*</span>
              </label>
              <MobileSelect
                value={departmentId}
                onChange={setDepartmentId}
                title={tr('Departemen', 'Department')}
                placeholder={tr('Pilih departemen', 'Choose department')}
                options={(config?.departments || []).map((dept) => ({
                  value: dept.id,
                  label: dept.name,
                }))}
              />
            </div>
            <div>
              <label className="mb-1 block font-semibold text-slate-700">{tr('Tanggal pengajuan', 'Date')}</label>
              <MobileDatePicker
                value={submissionDate}
                onChange={setSubmissionDate}
                allowClear={false}
                placeholder={tr('Pilih tanggal', 'Select date')}
              />
              <p className="mt-1 text-[10px] text-slate-400">
                {tr('Pada formulir cetak', 'On the printed form')}: {formatDDMMYY(submissionDate)}
              </p>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-3 text-xs">
            <div>
              <label className="mb-1 block font-semibold text-slate-700">
                {tr('Jenis cuti', 'Leave type')} <span className="text-rose-500">*</span>
              </label>
              <MobileSelect
                value={leaveTypeId}
                onChange={setLeaveTypeId}
                title={tr('Jenis cuti', 'Leave type')}
                placeholder={tr('Pilih jenis cuti', 'Choose leave type')}
                options={(config?.leaveTypes || []).map((type) => ({
                  value: type.id,
                  label: type.name,
                }))}
              />
            </div>

            {isOtherType && (
              <div>
                <label className="mb-1 block font-semibold text-slate-700">
                  {tr('Keterangan "Others"', '"Others" explanation')} <span className="text-rose-500">*</span>
                </label>
                <input
                  value={otherNote}
                  onChange={(event) => setOtherNote(event.target.value)}
                  className="w-full rounded-xl border border-slate-300 p-2.5 focus:border-blue-500 focus:outline-none"
                />
              </div>
            )}

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="min-w-0">
                <label className="mb-1 block font-semibold text-slate-700">
                  {tr('Dari', 'From')} <span className="text-rose-500">*</span>
                </label>
                <MobileDatePicker
                  value={startDate}
                  onChange={(val) => {
                    setStartDate(val);
                    if (endDate && val && endDate < val) {
                      setEndDate(val);
                    }
                  }}
                  placeholder={tr('Pilih tanggal', 'Select date')}
                />
              </div>
              <div className="min-w-0">
                <label className="mb-1 block font-semibold text-slate-700">
                  {tr('Sampai', 'To')} <span className="text-rose-500">*</span>
                </label>
                <MobileDatePicker
                  value={endDate}
                  min={startDate || undefined}
                  onChange={setEndDate}
                  placeholder={tr('Pilih tanggal', 'Select date')}
                />
              </div>
            </div>

            <div className="rounded-xl bg-slate-50 p-2.5 text-[11px] text-slate-600">
              {tr('Hari kerja terhitung', 'Working days counted')}: <strong>{totalDays}</strong>
              {startDate && endDate && (
                <span className="ml-1 text-slate-400">
                  ({formatDDMMYY(startDate)} → {formatDDMMYY(endDate)})
                </span>
              )}
            </div>

            <div>
              <label className="mb-1 block font-semibold text-slate-700">
                {tr('Alasan', 'Reason')} <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={3}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className="w-full rounded-xl border border-slate-300 p-2.5 focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="text-xs">
            <SignaturePad
              value={signature}
              onChange={setSignature}
              label={tr('Tanda tangan pemohon', "Applicant's signature")}
              hint={tr('Tanda tangan di sini', 'Sign here')}
            />
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3 text-xs">
            <dl className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {[
                [tr('Pemohon', 'Applicant'), applicantName || '—'],
                [tr('Departemen', 'Department'), config?.departments.find((d) => d.id === departmentId)?.name || '—'],
                [tr('Tanggal', 'Date'), formatDDMMYY(submissionDate)],
                [tr('Jenis cuti', 'Leave type'), selectedType?.name || '—'],
                [tr('Dari', 'From'), formatDDMMYY(startDate)],
                [tr('Sampai', 'To'), formatDDMMYY(endDate)],
                [tr('Hari kerja', 'Working days'), String(totalDays)],
                [tr('Alasan', 'Reason'), reason || '—'],
              ].map(([label, value]) => (
                <div key={label} className="flex gap-3 px-3 py-1.5">
                  <dt className="w-28 shrink-0 font-medium text-slate-500">{label}</dt>
                  <dd className="min-w-0 flex-1 font-semibold text-slate-800">{value}</dd>
                </div>
              ))}
            </dl>

            {signature && (
              <div>
                <p className="mb-1 font-medium text-slate-500">{tr('Tanda tangan', 'Signature')}</p>
                <img
                  src={signature}
                  alt={tr('Tanda tangan', 'Signature')}
                  className="max-h-24 rounded-lg border border-slate-200 bg-white object-contain p-1"
                />
              </div>
            )}

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-800">
              <Info size={13} className="mr-1 inline" />
              {tr(
                'Cuti belum resmi disetujui sampai persetujuan Management selesai.',
                'Leave is not officially confirmed until Management approval is complete.'
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-[11px] font-medium text-rose-800">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            <span className="flex-1">{error}</span>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
          <span className="text-[10px] font-semibold text-slate-400">
            {stepProblems[step].length === 0 ? (
              <span className="inline-flex items-center gap-1 text-emerald-600">
                <Check size={11} /> {tr('Siap', 'Ready')}
              </span>
            ) : (
              stepProblems[step][0]
            )}
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setStep((current) => Math.max(0, current - 1))}
              disabled={step === 0}
              className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-40"
            >
              {tr('Kembali', 'Back')}
            </button>
            {step < STEPS.length - 1 ? (
              <button
                type="button"
                onClick={goNext}
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-bold text-white hover:bg-slate-800"
              >
                {tr('Lanjut', 'Next')} <ChevronRight size={13} />
              </button>
            ) : (
              <button
                type="submit"
                disabled={submitting || stepProblems.some((problems) => problems.length > 0)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                <Send size={13} />
                {submitting ? tr('Mengirim...', 'Sending...') : tr('Kirim pengajuan', 'Submit application')}
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
};
