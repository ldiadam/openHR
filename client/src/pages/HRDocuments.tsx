import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  PenLine,
  Plus,
  ChevronDown,
  ChevronRight,
  X,
  RefreshCw,
  FileText,
  ExternalLink,
  Download,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Users,
  Send,
  Trash2,
  Upload,
  Check,
} from 'lucide-react';
import { apiFetch, downloadFile } from '../api';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useLockBodyScroll } from '../hooks/useLockBodyScroll';
import { TableSkeleton } from '../components/Skeleton';
import { SigningFieldPlacer, PlacedField } from '../components/SigningFieldPlacer';

const WORKFLOW_OPTIONS = [
  { code: 'offer_letter', id: 'Surat Penawaran Kerja', en: 'Offer Letter' },
  { code: 'nda', id: 'NDA / Hak Kekayaan Intelektual', en: 'NDA / IP' },
  { code: 'handbook_ack', id: 'Peraturan Perusahaan', en: 'Company Handbook' },
  { code: 'policy_ack', id: 'Persetujuan Kebijakan', en: 'Policy Acknowledgement' },
  { code: 'offboarding_clearance', id: 'Exit Clearance & Serah Terima', en: 'Exit Clearance' },
  { code: 'pip_warning', id: 'PIP / Surat Peringatan', en: 'PIP / Warning Letter' },
  { code: 'salary_change', id: 'Perubahan Gaji / Promosi', en: 'Salary Change / Promotion' },
];

const WORKFLOW_LABELS: Record<string, { id: string; en: string }> = Object.fromEntries(
  WORKFLOW_OPTIONS.map((option) => [option.code, { id: option.id, en: option.en }])
);

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700',
  sent: 'bg-blue-100 text-blue-800',
  partially_signed: 'bg-indigo-100 text-indigo-800',
  completed: 'bg-emerald-100 text-emerald-800',
  declined: 'bg-rose-100 text-rose-800',
  expired: 'bg-amber-100 text-amber-800',
  archived: 'bg-slate-100 text-slate-600',
  failed: 'bg-rose-100 text-rose-800',
  superseded: 'bg-slate-200 text-slate-600',
};

const STATUS_LABELS: Record<string, { id: string; en: string }> = {
  draft: { id: 'Draf', en: 'Draft' },
  sent: { id: 'Terkirim', en: 'Sent' },
  partially_signed: { id: 'Sebagian', en: 'Partially signed' },
  completed: { id: 'Selesai', en: 'Completed' },
  declined: { id: 'Ditolak', en: 'Declined' },
  expired: { id: 'Kedaluwarsa', en: 'Expired' },
  archived: { id: 'Diarsipkan', en: 'Archived' },
  failed: { id: 'Gagal', en: 'Failed' },
  superseded: { id: 'Digantikan', en: 'Superseded' },
};

const SIGNER_STATUS_LABELS: Record<string, { id: string; en: string }> = {
  awaiting: { id: 'Menunggu', en: 'Awaiting' },
  sent: { id: 'Terkirim', en: 'Sent' },
  opened: { id: 'Dibuka', en: 'Opened' },
  completed: { id: 'Ditandatangani', en: 'Signed' },
  declined: { id: 'Ditolak', en: 'Declined' },
};

const OPEN_STATUSES = ['draft', 'sent', 'partially_signed', 'failed'];
const CLOSED_STATUSES = ['completed', 'declined', 'expired', 'archived', 'superseded'];

/** A signer is picked from the directory, or typed in for an outsider. */
interface SignerRow {
  id: string;
  role: string;
  /** directory = chosen from employees, guest = typed by hand. */
  kind: 'directory' | 'guest';
  employeeId?: string;
  name: string;
  email: string;
}

const ROLE_OPTIONS = ['Employee', 'Manager', 'HR', 'Guest', 'Witness'];

/** The request flow is asked one question at a time. */
const WIZARD_STEPS = [
  {
    id: 'Siapa yang menandatangani?',
    en: 'Who needs to sign?',
    shortId: 'Penandatangan',
    shortEn: 'Signers',
  },
  {
    id: 'Dokumen apa yang perlu ditandatangani?',
    en: 'Which document needs signing?',
    shortId: 'Dokumen',
    shortEn: 'Document',
  },
  {
    id: 'Di mana tanda tangannya?',
    en: 'Where do the signatures go?',
    shortId: 'Penempatan',
    shortEn: 'Placement',
  },
  {
    id: 'Periksa dan kirim',
    en: 'Review and send',
    shortId: 'Kirim',
    shortEn: 'Send',
  },
] as const;

const ROLE_DESCRIPTIONS: Record<string, { id: string; en: string }> = {
  Employee: { id: 'Karyawan yang menerima dokumen', en: 'The employee this document is for' },
  Manager: { id: 'Atasan langsung', en: 'Their direct manager' },
  HR: { id: 'Tim HR perusahaan', en: 'Company HR' },
  Guest: { id: 'Orang di luar perusahaan', en: 'Someone outside the company' },
  Witness: { id: 'Saksi', en: 'A witness' },
};

/** Which directory members make sense for a role. */
function matchesRole(emp: any, role: string): boolean {
  const key = role.trim().toLowerCase();
  if (key === 'manager') return emp.user_role === 'manager';
  if (key === 'hr') return emp.user_role === 'owner_admin' || emp.user_role === 'finance';
  return true;
}

let signerSeq = 0;
const emptySigner = (role: string, kind: 'directory' | 'guest' = 'directory'): SignerRow => ({
  id: `signer-${++signerSeq}`,
  role,
  kind,
  name: '',
  email: '',
});

/** Read a File into base64. Chunked so large PDFs cannot blow the call stack. */
async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

/**
 * One signer. A role picks people from the directory — choosing "Manager"
 * lists managers, "HR" lists HR — and only Guest/Witness ask for a typed email.
 */
const SignerCard: React.FC<{
  signer: SignerRow;
  employees: any[];
  canRemove: boolean;
  tr: (id: string, en: string) => string;
  onChangeRole: (role: string) => void;
  onPickEmployee: (employeeId: string) => void;
  onSetGuest: () => void;
  onPatch: (patch: Partial<SignerRow>) => void;
  onRemove: () => void;
}> = ({ signer, employees, canRemove, tr, onChangeRole, onPickEmployee, onSetGuest, onPatch, onRemove }) => {
  const candidates = employees.filter((emp) => matchesRole(emp, signer.role));
  const description = ROLE_DESCRIPTIONS[signer.role];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-2.5">
      <div className="flex items-center gap-1.5">
        <select
          value={signer.role}
          onChange={(event) => onChangeRole(event.target.value)}
          className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-bold text-slate-700 focus:border-blue-500 focus:outline-none"
        >
          {ROLE_OPTIONS.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </select>

        {/* Directory members are picked; outsiders are typed. */}
        {signer.kind === 'directory' ? (
          <select
            value={signer.employeeId || ''}
            onChange={(event) => onPickEmployee(event.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-700 focus:border-blue-500 focus:outline-none"
          >
            <option value="">
              {candidates.length > 0
                ? tr('Pilih orang…', 'Choose a person…')
                : tr('Tidak ada kandidat', 'No candidates')}
            </option>
            {candidates.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.full_name}
                {emp.job_title ? ` · ${emp.job_title}` : ''}
              </option>
            ))}
          </select>
        ) : (
          <input
            value={signer.name}
            onChange={(event) => onPatch({ name: event.target.value })}
            placeholder={tr('Nama lengkap', 'Full name')}
            className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-medium focus:border-blue-500 focus:outline-none"
          />
        )}

        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="shrink-0 rounded p-1 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
            aria-label={tr('Hapus penandatangan', 'Remove signer')}
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>

      {signer.kind === 'directory' ? (
        <div className="mt-1 flex items-center gap-1.5 pl-1">
          <span className="min-w-0 flex-1 truncate text-[10px] text-slate-500">
            {signer.email || (description ? tr(description.id, description.en) : '')}
          </span>
          <button
            type="button"
            onClick={onSetGuest}
            className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold text-blue-600 hover:bg-blue-50"
          >
            {tr('Bukan karyawan?', 'Not an employee?')}
          </button>
        </div>
      ) : (
        <div className="mt-1.5 flex items-center gap-1.5">
          <input
            type="email"
            value={signer.email}
            onChange={(event) => onPatch({ email: event.target.value })}
            placeholder={tr('email@contoh.com', 'email@example.com')}
            className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] focus:border-blue-500 focus:outline-none"
          />
          <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">
            {tr('Tamu', 'Guest')}
          </span>
        </div>
      )}
    </div>
  );
};

export const HRDocuments: React.FC = () => {
  const { isOwnerAdmin, isFinance } = useAuth();
  const { tr, formatDate } = useLanguage();

  const [requests, setRequests] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');

  const [showCreate, setShowCreate] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const [signingFrame, setSigningFrame] = useState<{ url: string; title: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  // Create-request form
  const [employeeId, setEmployeeId] = useState('');
  const [templateCode, setTemplateCode] = useState('offer_letter');
  const [dueAt, setDueAt] = useState('');
  const [sendEmail, setSendEmail] = useState(true);
  const [prefill, setPrefill] = useState('');

  // Every request carries its own document: upload the PDF for this employee,
  // place the fields, send. There is no reusable template registry.
  const [oneOff, setOneOff] = useState<{ file: File | null; base64: string; name: string; fields: PlacedField[] }>({
    file: null,
    base64: '',
    name: '',
    fields: [],
  });

  // Signers are picked from the directory, or typed in for an outsider.
  const [signers, setSigners] = useState<SignerRow[]>(() => [emptySigner('Employee')]);

  /** Wizard position: 0 people, 1 document, 2 placement, 3 review. */
  const [step, setStep] = useState(0);

  useLockBodyScroll(showCreate || Boolean(detail) || Boolean(signingFrame));

  const canCreate = isOwnerAdmin || isFinance;

  const load = async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);

    try {
      const [requestRes, employeeRes] = await Promise.all([
        apiFetch('/hr/signing-requests'),
        apiFetch('/employees'),
      ]);
      setRequests(requestRes.signingRequests || []);
      setEmployees(employeeRes.employees || []);
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const counts = useMemo(
    () => ({
      all: requests.length,
      open: requests.filter((r) => OPEN_STATUSES.includes(r.status)).length,
      completed: requests.filter((r) => r.status === 'completed').length,
      declined: requests.filter((r) => r.status === 'declined').length,
    }),
    [requests]
  );

  const filtered = useMemo(() => {
    if (statusFilter === 'open') return requests.filter((r) => OPEN_STATUSES.includes(r.status));
    if (statusFilter === 'all') return requests;
    return requests.filter((r) => r.status === statusFilter);
  }, [requests, statusFilter]);

  const openDetail = useCallback(async (id: string) => {
    try {
      const res = await apiFetch(`/hr/signing-requests/${id}`);
      setDetail(res);
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    }
  }, []);

  // DocuSeal's webhook is optional here, so pull the live status whenever a
  // request is still open. Without this, signers show 0/3 forever.
  const syncRequest = useCallback(
    async (id: string, silent = true) => {
      if (!silent) setSyncing(true);
      try {
        const res = await apiFetch(`/hr/signing-requests/${id}/sync`, { method: 'POST' });
        if (!silent) {
          setMsg({
            type: 'success',
            text: tr(
              `Status diperbarui: ${res.status} · ${res.signersUpdated} penandatangan · ${res.documentsStored} dokumen tersimpan.`,
              `Status refreshed: ${res.status} · ${res.signersUpdated} signers · ${res.documentsStored} documents stored.`
            ),
          });
        }
        await load(true);
        await openDetail(id);
        return res;
      } catch (err: any) {
        if (!silent) setMsg({ type: 'error', text: err.message });
        return null;
      } finally {
        if (!silent) setSyncing(false);
      }
    },
    [tr]
  );

  // Opening a request refreshes it from DocuSeal first, so the signer list is
  // never stale just because no webhook is configured.
  const openDetailSynced = useCallback(
    async (id: string) => {
      const res = await apiFetch(`/hr/signing-requests/${id}`);
      setDetail(res);
      if (['draft', 'sent', 'partially_signed', 'failed'].includes(res?.signingRequest?.status)) {
        await syncRequest(id, true);
      }
    },
    [syncRequest]
  );

  const closeCreate = useCallback(() => {
    setShowCreate(false);
    setFormError(null);
    setPrefill('');
    setOneOff({ file: null, base64: '', name: '', fields: [] });
    setSigners([emptySigner('Employee')]);
    setStep(0);
  }, []);

  const openCreate = () => {
    setEmployeeId(employees[0]?.id || '');
    setTemplateCode('offer_letter');
    setDueAt(new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10));
    setSendEmail(true);
    setFormError(null);
    setSigners([emptySigner('Employee')]);
    setStep(0);
    setShowCreate(true);
  };

  // Closing the signing frame re-reads the request: the signer may have just
  // finished inside the iframe, and there is no webhook to tell us otherwise.
  const closeSigningFrame = useCallback(() => {
    const requestId = detail?.signingRequest?.id;
    setSigningFrame(null);
    if (requestId) void syncRequest(requestId, true);
  }, [detail, syncRequest]);

  // Escape closes whichever layer is on top.
  useEffect(() => {
    if (!showCreate && !detail && !signingFrame) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (signingFrame) closeSigningFrame();
      else if (detail) setDetail(null);
      else closeCreate();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showCreate, detail, signingFrame, closeCreate, closeSigningFrame]);

  // Picking the document's employee fills the Employee signer with them.
  useEffect(() => {
    if (!employeeId) return;
    const employee = employees.find((e) => e.id === employeeId);
    if (!employee) return;
    setSigners((prev) => {
      const next = [...prev];
      if (next.length === 0) next.push(emptySigner('Employee'));
      // Only the row that is meant to hold the employee gets overwritten.
      next[0] = {
        ...next[0],
        role: next[0].role || 'Employee',
        kind: 'directory',
        employeeId: employee.id,
        name: employee.full_name || '',
        email: employee.company_email || employee.personal_email || '',
      };
      return next;
    });
  }, [employeeId, employees]);

  const updateSigner = (index: number, patch: Partial<SignerRow>) => {
    setSigners((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));

    // Renaming a role must carry its placed fields along, or the boxes silently
    // become orphans that no submitter will ever see.
    const previousRole = signers[index]?.role?.trim();
    const nextRole = patch.role?.trim();
    if (previousRole && nextRole && previousRole !== nextRole) {
      setOneOff((prev) => ({
        ...prev,
        fields: prev.fields.map((field) =>
          field.role === previousRole
            ? { ...field, role: nextRole, name: `${nextRole} ${field.type}` }
            : field
        ),
      }));
    }
  };

  /** The obvious person for a role, so the operator rarely has to pick twice. */
  const preferredForRole = useCallback(
    (role: string): any | undefined => {
      if (role.trim().toLowerCase() === 'guest') return undefined;
      const candidates = employees.filter((emp) => matchesRole(emp, role));
      const owner = employees.find((e) => e.id === employeeId);
      if (role.toLowerCase() === 'manager' && owner?.manager_id) {
        const manager = candidates.find((emp) => emp.id === owner.manager_id);
        if (manager) return manager;
      }
      return candidates.length === 1 ? candidates[0] : undefined;
    },
    [employees, employeeId]
  );

  const addSigner = () => {
    const used = new Set(signers.map((s) => s.role.trim().toLowerCase()));
    const role = ROLE_OPTIONS.find((r) => !used.has(r.toLowerCase())) || 'Witness';
    const preferred = preferredForRole(role);
    setSigners((prev) => [
      ...prev,
      {
        ...emptySigner(role, role.toLowerCase() === 'guest' ? 'guest' : 'directory'),
        employeeId: preferred?.id,
        name: preferred?.full_name || '',
        email: preferred?.company_email || preferred?.personal_email || '',
      },
    ]);
  };

  /** Choosing a role switches the row between directory picking and free text. */
  const changeSignerRole = (index: number, role: string) => {
    if (role.trim().toLowerCase() === 'guest') {
      updateSigner(index, { role, kind: 'guest', employeeId: undefined, name: '', email: '' });
      return;
    }

    const preferred = preferredForRole(role);
    updateSigner(index, {
      role,
      kind: 'directory',
      employeeId: preferred?.id,
      name: preferred?.full_name || '',
      email: preferred?.company_email || preferred?.personal_email || '',
    });
  };

  /** Picking someone from the directory fills the row from their record. */
  const pickDirectoryEmployee = (index: number, employeeId: string) => {
    const employee = employees.find((e) => e.id === employeeId);
    if (!employee) {
      updateSigner(index, { employeeId: undefined, name: '', email: '' });
      return;
    }
    updateSigner(index, {
      employeeId: employee.id,
      name: employee.full_name || '',
      email: employee.company_email || employee.personal_email || '',
    });
  };

  const removeSigner = (index: number) => {
    setSigners((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  };

  const documentLabel = (row: any) => {
    if (row.document_name) return row.document_name;
    const fallback = WORKFLOW_LABELS[row.template_code];
    return fallback ? tr(fallback.id, fallback.en) : row.template_code || '-';
  };

  const handleFile = async (file: File | null) => {
    setFormError(null);
    if (!file) {
      setOneOff({ file: null, base64: '', name: '', fields: [] });
      return;
    }
    if (!/\.pdf$/i.test(file.name)) {
      setFormError(tr('Dokumen harus berformat PDF.', 'The document must be a PDF.'));
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setFormError(tr('Ukuran file maksimal 15 MB.', 'Maximum file size is 15 MB.'));
      return;
    }
    try {
      const base64 = await fileToBase64(file);
      setOneOff({ file, base64, name: file.name.replace(/\.pdf$/i, ''), fields: [] });
    } catch {
      setFormError(tr('Gagal membaca file.', 'Failed to read the file.'));
    }
  };

  // A role with no field never becomes a DocuSeal submitter, so the request can
  // never complete. Only the signers actually being sent need a field.
  const rolesMissingFields = useMemo(() => {
    const placed = new Set(oneOff.fields.map((f) => f.role.toLowerCase()));
    return signers
      .map((s) => s.role.trim())
      .filter((role) => role && !placed.has(role.toLowerCase()));
  }, [oneOff.fields, signers]);

  // Signers need a role, a name and a plausible email before we can send.
  const incompleteSigners = useMemo(
    () =>
      signers.filter(
        (s) => !s.role.trim() || !s.name.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.email.trim())
      ),
    [signers]
  );

  const duplicateRoles = useMemo(() => {
    const seen = new Set<string>();
    const dupes = new Set<string>();
    for (const signer of signers) {
      const role = signer.role.trim().toLowerCase();
      if (!role) continue;
      if (seen.has(role)) dupes.add(signer.role.trim());
      seen.add(role);
    }
    return Array.from(dupes);
  }, [signers]);

  const canSubmit =
    Boolean(employeeId) &&
    Boolean(oneOff.base64) &&
    oneOff.fields.length > 0 &&
    signers.length > 0 &&
    incompleteSigners.length === 0 &&
    duplicateRoles.length === 0 &&
    rolesMissingFields.length === 0 &&
    !submitting;

  /** What still blocks leaving each step, shown instead of a dead button. */
  const stepProblems = useMemo(() => {
    const people: string[] = [];
    if (!employeeId) people.push(tr('Pilih karyawan pemilik dokumen.', 'Choose the employee this is for.'));
    if (incompleteSigners.length > 0) {
      people.push(
        tr(
          'Lengkapi nama dan email setiap penandatangan.',
          'Complete every signer’s name and email.'
        )
      );
    }
    if (duplicateRoles.length > 0) {
      people.push(
        tr(`Peran duplikat: ${duplicateRoles.join(', ')}.`, `Duplicate roles: ${duplicateRoles.join(', ')}.`)
      );
    }

    const document: string[] = [];
    if (!oneOff.base64) document.push(tr('Unggah file PDF.', 'Upload a PDF file.'));

    const placement: string[] = [];
    if (oneOff.base64 && rolesMissingFields.length > 0) {
      placement.push(
        tr(
          `Belum ada field untuk: ${rolesMissingFields.join(', ')}.`,
          `No field yet for: ${rolesMissingFields.join(', ')}.`
        )
      );
    }

    return [people, document, placement, []];
  }, [employeeId, incompleteSigners, duplicateRoles, oneOff.base64, rolesMissingFields, tr]);

  const canAdvance = stepProblems[step].length === 0;

  const goNext = () => {
    if (!canAdvance) {
      setFormError(stepProblems[step][0]);
      return;
    }
    setFormError(null);
    setStep((s) => Math.min(WIZARD_STEPS.length - 1, s + 1));
  };

  const goBack = () => {
    setFormError(null);
    setStep((s) => Math.max(0, s - 1));
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    if (!oneOff.base64) {
      setFormError(tr('Pilih file PDF dokumen.', 'Choose the document PDF file.'));
      return;
    }
    if (oneOff.fields.length === 0) {
      setFormError(
        tr(
          'Tempatkan minimal satu field tanda tangan pada dokumen.',
          'Place at least one signing field on the document.'
        )
      );
      return;
    }
    if (rolesMissingFields.length > 0) {
      setFormError(
        tr(
          `Tempatkan minimal satu field untuk setiap penandatangan. Belum ada field untuk: ${rolesMissingFields.join(
            ', '
          )}.`,
          `Place at least one field for every signer. Missing a field for: ${rolesMissingFields.join(', ')}.`
        )
      );
      return;
    }
    if (incompleteSigners.length > 0) {
      setFormError(
        tr(
          'Setiap penandatangan wajib punya nama, email yang valid, dan peran.',
          'Every signer needs a name, a valid email and a role.'
        )
      );
      return;
    }
    if (duplicateRoles.length > 0) {
      setFormError(
        tr(
          `Peran penandatangan harus unik. Duplikat: ${duplicateRoles.join(', ')}.`,
          `Signer roles must be unique. Duplicate: ${duplicateRoles.join(', ')}.`
        )
      );
      return;
    }

    setSubmitting(true);

    try {
      let parsedPrefill: Record<string, unknown> | undefined;
      if (prefill.trim()) {
        try {
          parsedPrefill = JSON.parse(prefill);
        } catch {
          throw new Error(tr('Prefill harus berupa JSON yang valid.', 'Prefill must be valid JSON.'));
        }
      }

      const employeeName = employees.find((e) => e.id === employeeId)?.full_name || employeeId;
      // Fields placed for a role that is not being sent would create a DocuSeal
      // role with no submitter, so only the chosen roles' fields go along.
      const chosenRoleKeys = new Set(signers.map((s) => s.role.trim().toLowerCase()));
      const sentFields = oneOff.fields.filter((f) => chosenRoleKeys.has(f.role.toLowerCase()));

      const res = await apiFetch('/hr/signing-requests', {
        method: 'POST',
        body: JSON.stringify({
          employeeId,
          document: {
            name: oneOff.name || `${documentLabel({ template_code: templateCode })} - ${employeeName}`,
            code: templateCode,
            pdfBase64: oneOff.base64,
            fields: sentFields,
          },
          dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
          // Exactly the signers listed in the form — employee or guest.
          signers: signers.map((s) => ({
            role: s.role.trim(),
            email: s.email.trim(),
            name: s.name.trim(),
          })),
          sendEmail,
          prefill: parsedPrefill,
          idempotencyKey: `${templateCode}-${employeeId}-${Date.now()}`,
        }),
      });

      setMsg({
        type: 'success',
        text: sendEmail
          ? tr('Dokumen terkirim dan email tanda tangan dikirim.', 'Document sent and signing emails delivered.')
          : tr(
              'Dokumen terkirim. Bagikan tautan tanda tangan secara manual.',
              'Document sent. Share the signing links manually.'
            ),
      });
      closeCreate();
      await load(true);
      if (res.signingRequestId) openDetailSynced(res.signingRequestId);
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownload = async (document: any) => {
    try {
      await downloadFile(
        `/hr/signing-documents/${document.id}/download`,
        `${document.kind}-${document.signingRequestId || document.signing_request_id}.pdf`
      );
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    }
  };

  const handleDeleteRequest = async (request: any, force = false) => {
    const label = request.employee_name || request.employee_id;
    const confirmation = force
      ? tr(
          `Hapus pengajuan untuk ${label}? Dokumen bertanda tangan dan bukti auditnya akan ikut dihapus permanen.`,
          `Delete the request for ${label}? Signed documents and audit evidence will be permanently removed.`
        )
      : tr(`Hapus pengajuan untuk ${label}?`, `Delete the request for ${label}?`);
    if (!window.confirm(confirmation)) {
      return;
    }
    try {
      await apiFetch(`/hr/signing-requests/${request.id}${force ? '?force=true' : ''}`, { method: 'DELETE' });
      setMsg({ type: 'success', text: tr('Pengajuan dihapus.', 'Request deleted.') });
      setDetail(null);
      await load(true);
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    }
  };

  const handleSupersede = async (request: any) => {
    const reason = window.prompt(tr('Alasan penggantian (wajib):', 'Reason for replacing (required):'));
    if (!reason?.trim()) return;
    try {
      await apiFetch(`/hr/signing-requests/${request.id}/supersede`, {
        method: 'POST',
        body: JSON.stringify({ reason: reason.trim() }),
      });
      setMsg({ type: 'success', text: tr('Pengajuan ditandai digantikan.', 'Request marked superseded.') });
      setDetail(null);
      await load(true);
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    }
  };

  const handleResend = async (request: any) => {
    try {
      const res = await apiFetch(`/hr/signing-requests/${request.id}/resend`, { method: 'POST' });
      setMsg({
        type: 'success',
        text: res.message || tr('Tautan tanda tangan diperbarui.', 'Signing links refreshed.'),
      });
      await load(true);
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    }
  };

  const statusLabel = (status: string) =>
    STATUS_LABELS[status] ? tr(STATUS_LABELS[status].id, STATUS_LABELS[status].en) : status;

  const progressOf = (row: any) => {
    const total = Number(row.signer_total || 0);
    const signed = Number(row.signer_signed || 0);
    return { total, signed, complete: total > 0 && signed >= total };
  };

  const isOverdue = (row: any) =>
    row.due_at && !CLOSED_STATUSES.includes(row.status)
      ? new Date(row.due_at).getTime() < Date.now()
      : false;

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">
            {tr('Dokumen & Tanda Tangan', 'Documents & Signing')}
          </h1>
          <p className="text-xs text-slate-500">
            {tr(
              'Unggah dokumen, tempatkan tanda tangan, lalu kirim untuk ditandatangani.',
              'Upload a document, place the signatures, then send it for signing.'
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
            title={tr('Muat ulang', 'Refresh')}
            aria-label={tr('Muat ulang', 'Refresh')}
          >
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
          </button>
          {canCreate && (
            <button
              onClick={openCreate}
              className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-md transition hover:bg-blue-700"
            >
              <Plus size={16} />
              {tr('Minta Tanda Tangan', 'Request Signature')}
            </button>
          )}
        </div>
      </div>

      {msg && (
        <div
          className={`flex items-center gap-2 rounded-2xl border p-4 text-xs shadow-2xs ${
            msg.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-rose-200 bg-rose-50 text-rose-800'
          }`}
        >
          {msg.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          <span className="flex-1 font-medium">{msg.text}</span>
          <button onClick={() => setMsg(null)} className="font-bold" aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-2xs">
        <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 p-4">
          {[
            { key: 'all', label: tr('Semua', 'All'), count: counts.all },
            { key: 'open', label: tr('Perlu Tindakan', 'Action needed'), count: counts.open },
            { key: 'completed', label: tr('Selesai', 'Completed'), count: counts.completed },
            { key: 'declined', label: tr('Ditolak', 'Declined'), count: counts.declined },
          ].map((filter) => (
            <button
              key={filter.key}
              onClick={() => setStatusFilter(filter.key)}
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[10px] font-bold transition ${
                statusFilter === filter.key ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span>{filter.label}</span>
              <span className={`rounded-full px-1.5 py-0.5 text-[9px] ${statusFilter === filter.key ? 'bg-white/20' : 'bg-white'}`}>
                {filter.count}
              </span>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <TableSkeleton rows={6} columns={6} />
            </table>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-blue-50 text-blue-600">
              <PenLine size={24} />
            </div>
            <p className="mt-3 text-sm font-bold text-slate-900">
              {statusFilter === 'all'
                ? tr('Belum ada pengajuan', 'No signing requests yet')
                : tr('Tidak ada pengajuan di filter ini', 'No requests in this filter')}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {statusFilter === 'all'
                ? tr(
                    'Unggah dokumen pertama untuk mulai meminta tanda tangan.',
                    'Upload your first document to start collecting signatures.'
                  )
                : tr('Coba pilih filter lain.', 'Try a different filter.')}
            </p>
            {canCreate && statusFilter === 'all' && (
              <button
                onClick={openCreate}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-blue-700"
              >
                <Plus size={14} /> {tr('Minta Tanda Tangan', 'Request Signature')}
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-5 py-3 font-bold">{tr('Karyawan', 'Employee')}</th>
                    <th className="px-3 py-3 font-bold">{tr('Dokumen', 'Document')}</th>
                    <th className="px-3 py-3 font-bold">{tr('Penandatangan', 'Signers')}</th>
                    <th className="px-3 py-3 font-bold">{tr('Batas Waktu', 'Due')}</th>
                    <th className="px-3 py-3 text-center font-bold">{tr('Status', 'Status')}</th>
                    <th className="px-5 py-3 text-right font-bold">{tr('Aksi', 'Action')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((row) => {
                    const progress = progressOf(row);
                    return (
                      <tr
                        key={row.id}
                        className="cursor-pointer transition hover:bg-slate-50/80"
                        onClick={() => openDetailSynced(row.id)}
                      >
                        <td className="px-5 py-3">
                          <div className="font-bold text-slate-900">{row.employee_name || row.employee_id}</div>
                          <div className="text-[10px] text-slate-400">{row.employee_nik || ''}</div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                              <FileText size={12} />
                            </span>
                            <span className="font-medium text-slate-800">{documentLabel(row)}</span>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          {progress.total === 0 ? (
                            <span className="text-slate-400">-</span>
                          ) : (
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200">
                                <div
                                  className={`h-full rounded-full ${progress.complete ? 'bg-emerald-500' : 'bg-blue-500'}`}
                                  style={{ width: `${(progress.signed / progress.total) * 100}%` }}
                                />
                              </div>
                              <span className="whitespace-nowrap text-[10px] font-bold text-slate-600">
                                {progress.signed}/{progress.total}
                              </span>
                            </div>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3">
                          {row.due_at ? (
                            <span className={isOverdue(row) ? 'font-bold text-rose-600' : 'text-slate-600'}>
                              {formatDate(row.due_at)}
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold ${
                              STATUS_STYLES[row.status] || STATUS_STYLES.draft
                            }`}
                          >
                            {statusLabel(row.status)}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <button
                            className="rounded-lg px-2.5 py-1 text-[10px] font-bold text-blue-600 hover:bg-blue-50"
                            onClick={(e) => {
                              e.stopPropagation();
                              openDetailSynced(row.id);
                            }}
                          >
                            {tr('Detail', 'Detail')}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-slate-100 md:hidden">
              {filtered.map((row) => {
                const progress = progressOf(row);
                return (
                  <div key={row.id} className="space-y-2 p-4 active:bg-slate-50" onClick={() => openDetailSynced(row.id)}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-bold text-slate-900">
                          {row.employee_name || row.employee_id}
                        </div>
                        <div className="truncate text-[11px] text-slate-500">{documentLabel(row)}</div>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${
                          STATUS_STYLES[row.status] || STATUS_STYLES.draft
                        }`}
                      >
                        {statusLabel(row.status)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-slate-400">
                      {progress.total > 0 && (
                        <span className="font-bold text-slate-600">
                          {progress.signed}/{progress.total} {tr('tanda tangan', 'signed')}
                        </span>
                      )}
                      {row.due_at && (
                        <span
                          className={`inline-flex items-center gap-1 ${isOverdue(row) ? 'font-bold text-rose-600' : ''}`}
                        >
                          <Clock size={11} /> {formatDate(row.due_at)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* CREATE REQUEST WIZARD — one question per step, so nothing has to be
          understood all at once. Opens wide because step 3 needs the page. */}
      {showCreate && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/50 backdrop-blur-[2px] sm:items-center sm:p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeCreate();
          }}
        >
          <div
            className="flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-h-[92vh] sm:rounded-3xl"
            role="dialog"
            aria-modal="true"
            aria-label={tr('Minta Tanda Tangan', 'Request Signature')}
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                  <PenLine size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {tr(WIZARD_STEPS[step].id, WIZARD_STEPS[step].en)}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {tr(
                      `Langkah ${step + 1} dari ${WIZARD_STEPS.length}`,
                      `Step ${step + 1} of ${WIZARD_STEPS.length}`
                    )}
                  </p>
                </div>
              </div>
              <button
                onClick={closeCreate}
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            {/* Progress rail — clickable back to any step already reached. */}
            <div className="flex shrink-0 items-center gap-1 px-5 py-2.5">
              {WIZARD_STEPS.map((item, index) => (
                <button
                  key={item.en}
                  type="button"
                  onClick={() => {
                    if (index <= step) setStep(index);
                  }}
                  disabled={index > step}
                  className={`group flex flex-1 items-center gap-1.5 ${
                    index <= step ? 'cursor-pointer' : 'cursor-default'
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-black transition ${
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
                  {index < WIZARD_STEPS.length - 1 && (
                    <span className="h-px flex-1 bg-slate-200" />
                  )}
                </button>
              ))}
            </div>

            <form onSubmit={handleCreate} className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
                {/* STEP 1 — who signs */}
                {step === 0 && (
                  <div className="space-y-4 text-xs">
                    <div>
                      <label className="mb-1 block font-semibold text-slate-700">
                        {tr('Dokumen ini untuk siapa?', 'Who is this document for?')}{' '}
                        <span className="text-rose-500">*</span>
                      </label>
                      <select
                        required
                        value={employeeId}
                        onChange={(e) => setEmployeeId(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 p-2.5 font-medium focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                      >
                        <option value="">{tr('Pilih karyawan', 'Select employee')}</option>
                        {employees.map((emp) => (
                          <option key={emp.id} value={emp.id}>
                            {emp.full_name} ({emp.nik})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-700">
                          {tr('Siapa saja yang menandatangani?', 'Who has to sign?')}
                        </span>
                        <button
                          type="button"
                          onClick={addSigner}
                          className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-700 transition hover:bg-blue-100"
                        >
                          <Plus size={11} /> {tr('Tambah', 'Add')}
                        </button>
                      </div>

                      <div className="space-y-2">
                        {signers.map((signer, index) => (
                          <SignerCard
                            key={signer.id}
                            signer={signer}
                            employees={employees}
                            canRemove={signers.length > 1}
                            tr={tr}
                            onChangeRole={(role) => changeSignerRole(index, role)}
                            onPickEmployee={(id) => pickDirectoryEmployee(index, id)}
                            onSetGuest={() =>
                              updateSigner(index, { kind: 'guest', employeeId: undefined, name: '', email: '' })
                            }
                            onPatch={(patch) => updateSigner(index, patch)}
                            onRemove={() => removeSigner(index)}
                          />
                        ))}

                        <datalist id="signer-role-options">
                          {ROLE_OPTIONS.map((role) => (
                            <option key={role} value={role} />
                          ))}
                        </datalist>

                        {duplicateRoles.length > 0 && (
                          <p className="flex items-start gap-1.5 text-[10px] font-medium leading-relaxed text-rose-600">
                            <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                            {tr(
                              `Peran harus unik. Duplikat: ${duplicateRoles.join(', ')}.`,
                              `Roles must be unique. Duplicate: ${duplicateRoles.join(', ')}.`
                            )}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* STEP 2 — what is being signed */}
                {step === 1 && (
                  <div className="space-y-4 text-xs">
                    <div>
                      <label className="mb-1 block font-semibold text-slate-700">
                        {tr('Jenis Dokumen', 'Document Type')}
                      </label>
                      <select
                        value={templateCode}
                        onChange={(e) => setTemplateCode(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 p-2.5 font-medium focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                      >
                        {WORKFLOW_OPTIONS.map((option) => (
                          <option key={option.code} value={option.code}>
                            {tr(option.id, option.en)}
                          </option>
                        ))}
                      </select>
                    </div>

                    {!oneOff.file ? (
                      <label
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => {
                          event.preventDefault();
                          handleFile(event.dataTransfer.files?.[0] || null);
                        }}
                        className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center transition hover:border-blue-400 hover:bg-blue-50/40"
                      >
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-blue-600 shadow-sm">
                          <Upload size={20} />
                        </div>
                        <span className="mt-3 text-sm font-bold text-slate-800">
                          {tr('Unggah dokumen PDF', 'Upload a PDF document')}
                        </span>
                        <span className="mt-1 text-[11px] text-slate-500">
                          {tr(
                            'Tarik file ke sini atau klik untuk memilih. Maks. 15 MB.',
                            'Drag a file here or click to choose. Max 15 MB.'
                          )}
                        </span>
                        <input
                          type="file"
                          accept=".pdf"
                          className="hidden"
                          onChange={(event) => handleFile(event.target.files?.[0] || null)}
                        />
                      </label>
                    ) : (
                      <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-rose-600 shadow-sm">
                          <FileText size={16} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-bold text-slate-900">{oneOff.file.name}</div>
                          <div className="text-[10px] text-slate-500">{formatBytes(oneOff.file.size)}</div>
                        </div>
                        <label className="cursor-pointer rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[10px] font-bold text-slate-700 hover:bg-slate-100">
                          {tr('Ganti', 'Change')}
                          <input
                            type="file"
                            accept=".pdf"
                            className="hidden"
                            onChange={(event) => handleFile(event.target.files?.[0] || null)}
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => handleFile(null)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                          aria-label={tr('Hapus file', 'Remove file')}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* STEP 3 — where the signatures go */}
                {step === 2 && (
                  <div className="space-y-3">
                    <SigningFieldPlacer
                      file={oneOff.file}
                      fields={oneOff.fields}
                      roles={signers.map((s) => s.role.trim()).filter(Boolean)}
                      onChange={(fields) => setOneOff({ ...oneOff, fields })}
                    />
                  </div>
                )}

                {/* STEP 4 — review and send */}
                {step === 3 && (
                  <div className="space-y-4 text-xs">
                    <div className="rounded-xl border border-slate-200 p-3">
                      <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                        <Users size={12} /> {tr('Penandatangan', 'Signers')}
                      </div>
                      <div className="space-y-1">
                        {signers.map((signer) => (
                          <div key={signer.id} className="flex items-baseline gap-2">
                            <span className="w-16 shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-center text-[9px] font-bold text-slate-600">
                              {signer.role || '—'}
                            </span>
                            <span className="min-w-0 flex-1 truncate font-semibold text-slate-800">
                              {signer.name || '—'}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-[10px] text-slate-500">
                              {signer.email || '—'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 p-3">
                      <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                        <FileText size={12} /> {tr('Dokumen', 'Document')}
                      </div>
                      <div className="truncate font-semibold text-slate-800">
                        {oneOff.name || documentLabel({ template_code: templateCode })}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {oneOff.file?.name} · {oneOff.fields.length} {tr('field', 'fields')}
                      </div>
                    </div>

                    <div>
                      <label className="mb-1 block font-semibold text-slate-700">{tr('Batas Waktu', 'Due Date')}</label>
                      <input
                        type="date"
                        value={dueAt}
                        onChange={(e) => setDueAt(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 p-2.5 font-medium focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                      />
                    </div>

                    <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-slate-200 p-2.5">
                      <input
                        type="checkbox"
                        checked={sendEmail}
                        onChange={(e) => setSendEmail(e.target.checked)}
                        className="mt-0.5"
                      />
                      <span>
                        <span className="block font-semibold text-slate-700">
                          {tr('Kirim email tanda tangan', 'Send signing emails')}
                        </span>
                        <span className="block text-[10px] text-slate-500">
                          {tr(
                            'Penandatangan menerima tautan dari email openHR.',
                            'Signers receive the link from openHR email.'
                          )}
                        </span>
                      </span>
                    </label>

                    <details className="rounded-xl border border-slate-200 p-2.5">
                      <summary className="cursor-pointer text-[11px] font-semibold text-slate-600">
                        {tr('Isian otomatis (opsional)', 'Prefill values (optional)')}
                      </summary>
                      <textarea
                        rows={3}
                        value={prefill}
                        onChange={(e) => setPrefill(e.target.value)}
                        placeholder='{"Position":"Engineer","Start Date":"2026-12-01"}'
                        className="mt-2 w-full rounded-lg border border-slate-300 p-2 font-mono text-[10px]"
                      />
                      <p className="mt-1 text-[10px] text-slate-500">
                        {tr(
                          'Pasangan nama field dan nilai dalam format JSON.',
                          'Field name and value pairs in JSON format.'
                        )}
                      </p>
                    </details>
                  </div>
                )}
              </div>

              {/* Footer — readiness checklist plus the primary action. */}
              <div className="shrink-0 border-t border-slate-200 bg-white px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 sm:pb-3">
                {formError && (
                  <div className="mb-2 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-[11px] font-medium text-rose-800">
                    <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                    <span className="flex-1">{formError}</span>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2 text-[10px]">
                    {/* Show what is missing right where the decision is made. */}
                    {stepProblems[step].length > 0 ? (
                      <span className="inline-flex items-center gap-1 font-semibold text-slate-400">
                        <span className="h-2.5 w-2.5 rounded-full border border-current" />
                        {stepProblems[step][0]}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 font-semibold text-emerald-600">
                        <Check size={11} /> {tr('Siap', 'Ready')}
                      </span>
                    )}
                  </div>

                  <div className="ml-auto flex items-center gap-2">
                    <button
                      type="button"
                      onClick={step === 0 ? closeCreate : goBack}
                      className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
                    >
                      {step === 0 ? tr('Batal', 'Cancel') : tr('Kembali', 'Back')}
                    </button>
                    {step < WIZARD_STEPS.length - 1 ? (
                      <button
                        type="button"
                        onClick={goNext}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-bold text-white shadow-md transition hover:bg-slate-800"
                      >
                        {tr('Lanjut', 'Next')} <ChevronRight size={13} />
                      </button>
                    ) : (
                      <button
                        type="submit"
                        disabled={!canSubmit}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white shadow-md transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
                      >
                        <Send size={13} />
                        {submitting ? tr('Mengirim...', 'Sending...') : tr('Kirim', 'Send')}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DETAIL MODAL */}
      {detail && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/50 backdrop-blur-[2px] sm:items-center sm:p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) setDetail(null);
          }}
        >
          <div
            className="flex max-h-[94vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-h-[92vh] sm:rounded-3xl"
            role="dialog"
            aria-modal="true"
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 p-5">
              <div className="min-w-0">
                <h3 className="truncate text-base font-bold text-slate-900">
                  {documentLabel(detail.signingRequest)}
                </h3>
                <p className="truncate text-[11px] text-slate-500">
                  {detail.signingRequest.employee?.full_name || detail.signingRequest.employee_id}
                </p>
              </div>
              <button
                onClick={() => setDetail(null)}
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold ${
                    STATUS_STYLES[detail.signingRequest.status] || STATUS_STYLES.draft
                  }`}
                >
                  {statusLabel(detail.signingRequest.status)}
                </span>
                {detail.signingRequest.due_at && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-slate-500">
                    <Clock size={11} /> {tr('Batas', 'Due')} {formatDate(detail.signingRequest.due_at)}
                  </span>
                )}
              </div>

              <div>
                <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  <Users size={12} /> {tr('Penandatangan', 'Signers')}
                </div>
                <div className="space-y-2">
                  {(detail.signers || []).map((signer: any) => (
                    <div key={signer.id} className="rounded-xl border border-slate-200 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-xs font-bold text-slate-900">
                            {signer.name} <span className="font-normal text-slate-400">({signer.role})</span>
                          </div>
                          <div className="truncate text-[10px] text-slate-500">{signer.email}</div>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            signer.status === 'completed'
                              ? 'bg-emerald-100 text-emerald-700'
                              : signer.status === 'declined'
                                ? 'bg-rose-100 text-rose-700'
                                : signer.status === 'opened'
                                  ? 'bg-indigo-100 text-indigo-700'
                                  : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {SIGNER_STATUS_LABELS[signer.status]
                            ? tr(SIGNER_STATUS_LABELS[signer.status].id, SIGNER_STATUS_LABELS[signer.status].en)
                            : signer.status}
                        </span>
                      </div>
                      {signer.signing_url && signer.status !== 'completed' && (
                        <button
                          onClick={() =>
                            setSigningFrame({
                              url: signer.signing_url,
                              title: `${signer.name} · ${signer.role}`,
                            })
                          }
                          className="mt-2 inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-700 transition hover:bg-blue-100"
                        >
                          <PenLine size={11} /> {tr('Tanda tangani', 'Sign')}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  <FileText size={12} /> {tr('Dokumen Tersimpan', 'Stored Documents')}
                </div>
                {(detail.documents || []).length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-200 p-3 text-[11px] leading-relaxed text-slate-400">
                    {tr(
                      'Dokumen tersedia setelah semua pihak menandatangani.',
                      'Documents become available once everyone signs.'
                    )}
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {detail.documents.map((doc: any) => (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-[11px] font-bold text-slate-800">{doc.kind}</div>
                          <div className="truncate font-mono text-[9px] text-slate-400">
                            {doc.byteSize ? formatBytes(doc.byteSize) : ''}
                            {doc.sha256 ? ` · ${doc.sha256.slice(0, 12)}…` : ''}
                          </div>
                        </div>
                        <button
                          onClick={() => handleDownload({ ...doc, signingRequestId: detail.signingRequest.id })}
                          className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700 transition hover:bg-emerald-100"
                        >
                          <Download size={11} /> {tr('Unduh', 'Download')}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {detail.signingRequest.last_error && (
                <p className="rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-[10px] font-medium text-rose-700">
                  {detail.signingRequest.last_error}
                </p>
              )}
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 sm:pb-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {detail.signingRequest.docuseal_submission_id && (
                  <button
                    onClick={() => syncRequest(detail.signingRequest.id, false)}
                    disabled={syncing}
                    className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-1.5 text-[11px] font-bold text-blue-700 transition hover:bg-blue-100 disabled:opacity-60"
                    title={tr('Ambil status terbaru dari DocuSeal', 'Pull the latest status from DocuSeal')}
                  >
                    <RefreshCw size={11} className={syncing ? 'animate-spin' : ''} />
                    {syncing ? tr('Menyinkron...', 'Syncing...') : tr('Sinkronkan', 'Sync')}
                  </button>
                )}
                {OPEN_STATUSES.includes(detail.signingRequest.status) && (
                  <button
                    onClick={() => handleResend(detail.signingRequest)}
                    className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 transition hover:bg-slate-200"
                  >
                    {tr('Kirim Ulang', 'Resend')}
                  </button>
                )}
                {OPEN_STATUSES.includes(detail.signingRequest.status) && (
                  <button
                    onClick={() => handleSupersede(detail.signingRequest)}
                    className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] font-bold text-amber-700 transition hover:bg-amber-100"
                  >
                    {tr('Gantikan', 'Supersede')}
                  </button>
                )}
                {(() => {
                  const status = detail.signingRequest.status;
                  const isEvidence = status === 'completed' || status === 'partially_signed';
                  // Signed requests are evidence: only an HR admin may destroy them.
                  if (isEvidence && !isOwnerAdmin) return null;
                  return (
                    <button
                      onClick={() => handleDeleteRequest(detail.signingRequest, isEvidence)}
                      className="inline-flex items-center gap-1 rounded-lg bg-rose-50 px-2.5 py-1.5 text-[11px] font-bold text-rose-700 transition hover:bg-rose-100"
                      title={
                        isEvidence
                          ? tr(
                              'Hapus permanen termasuk dokumen bertanda tangan',
                              'Permanently delete including signed documents'
                            )
                          : tr(
                              'Hanya untuk pengajuan yang belum ditandatangani',
                              'Only for requests that have not been signed'
                            )
                      }
                    >
                      <Trash2 size={11} /> {tr('Hapus', 'Delete')}
                    </button>
                  );
                })()}
              </div>
              <button
                onClick={() => setDetail(null)}
                className="rounded-xl bg-slate-900 px-5 py-2 text-xs font-bold text-white transition hover:bg-slate-800"
              >
                {tr('Tutup', 'Close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SIGNING FRAME — DocuSeal is framed directly so the signer can sign
          without leaving the HR app. */}
      {signingFrame && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-900/50 backdrop-blur-[2px] sm:items-center sm:p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeSigningFrame();
          }}
        >
          <div
            className="flex h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:h-[88vh] sm:rounded-3xl"
            role="dialog"
            aria-modal="true"
          >
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                  <PenLine size={16} />
                </div>
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-bold text-slate-900">
                    {tr('Tanda Tangan Dokumen', 'Sign Document')}
                  </h3>
                  <p className="truncate text-[11px] text-slate-500">{signingFrame.title}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <a
                  href={signingFrame.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                  title={tr('Buka di tab baru', 'Open in new tab')}
                >
                  <ExternalLink size={16} />
                </a>
                <button
                  onClick={closeSigningFrame}
                  className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <iframe
              src={signingFrame.url}
              title={signingFrame.title}
              className="min-h-0 flex-1 border-0 bg-slate-50"
              allow="camera; microphone; clipboard-write"
            />
          </div>
        </div>
      )}
    </div>
  );
};
