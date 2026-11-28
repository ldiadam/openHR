import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  Briefcase,
  Building,
  Calendar,
  Clock,
  ShieldCheck,
  CreditCard,
  HeartPulse,
  FileText,
  Wallet,
  Receipt,
  Users,
  RefreshCw,
  UserCircle,
  AlertTriangle,
} from 'lucide-react';
import { apiFetch, getToken } from '../api';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { PageSkeleton } from '../components/Skeleton';

const Section: React.FC<{ title: string; icon: React.ElementType; children: React.ReactNode; action?: React.ReactNode }> = ({
  title,
  icon: Icon,
  children,
  action,
}) => (
  <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-2xs">
    <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-5 py-3.5">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
          <Icon size={15} />
        </span>
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{title}</h2>
      </div>
      {action}
    </div>
    <div className="p-5">{children}</div>
  </section>
);

const Field: React.FC<{ label: string; value?: React.ReactNode; mono?: boolean; className?: string }> = ({
  label,
  value,
  mono,
  className = '',
}) => (
  <div className={className}>
    <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
    <dd className={`mt-0.5 text-xs font-semibold text-slate-800 ${mono ? 'font-mono' : ''}`}>
      {value === undefined || value === null || value === '' ? '-' : value}
    </dd>
  </div>
);

const statusPill = (status?: string) => {
  switch (status) {
    case 'paid':
      return 'bg-emerald-100 text-emerald-800';
    case 'locked':
      return 'bg-purple-100 text-purple-800';
    case 'calculated':
      return 'bg-blue-100 text-blue-800';
    case 'approved':
      return 'bg-emerald-100 text-emerald-800';
    case 'rejected':
      return 'bg-rose-100 text-rose-800';
    case 'pending':
      return 'bg-amber-100 text-amber-800';
    default:
      return 'bg-slate-100 text-slate-700';
  }
};

export const HREmployeeDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isOwnerAdmin, isFinance } = useAuth();
  const { t, tr, formatDate, formatCurrency } = useLanguage();

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await apiFetch(`/employees/${id}/profile`);
      setData(res);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  if (loading) return <PageSkeleton cards={4} rows={8} />;
  if (error) {
    return (
      <div className="rounded-3xl border border-rose-200 bg-rose-50 p-8 text-center">
        <AlertTriangle className="mx-auto text-rose-500" size={28} />
        <p className="mt-2 text-sm font-bold text-rose-800">{error}</p>
        <button
          onClick={() => navigate('/employees')}
          className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white"
        >
          {tr('Kembali ke Daftar Karyawan', 'Back to Employee List')}
        </button>
      </div>
    );
  }

  const emp = data.employee;
  const canSeeMoney = data.canSeeMoney;
  const initials = (emp.full_name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w: string) => w[0])
    .join('')
    .toUpperCase();

  const totalAllowances = Number(emp.fixed_allowances || 0);
  const annualLeave = (data.leaveBalances || []).find((b: any) => b.leave_type_code === 'annual');

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <button
          onClick={() => navigate('/employees')}
          className="inline-flex items-center gap-1 font-medium text-slate-600 transition hover:text-slate-900"
        >
          <ArrowLeft size={13} />
          {t.nav.employees}
        </button>
        <span className="text-slate-300">/</span>
        <span className="font-semibold text-slate-800">{emp.full_name}</span>
      </div>

      {/* Identity header */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-900 p-6 text-white shadow-xl md:p-8">
        <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-blue-400/10 blur-2xl" />
        <div className="relative flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-xl font-black backdrop-blur">
              {initials}
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-black tracking-tight md:text-2xl">{emp.full_name}</h1>
              <p className="mt-0.5 text-xs text-blue-100/80">
                {emp.nik} · {emp.job_title}
                {emp.department_name ? ` · ${emp.department_name}` : ''}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] font-bold">
                <span className="rounded-full bg-white/15 px-2.5 py-1 uppercase tracking-wide">{emp.employment_status}</span>
                <span className="rounded-full bg-white/15 px-2.5 py-1 uppercase tracking-wide">{emp.lifecycle_status}</span>
                <span className="rounded-full bg-white/15 px-2.5 py-1">{emp.ptkp_status}</span>
                {emp.user_role && (
                  <span className="rounded-full bg-white/15 px-2.5 py-1">{tr('Peran', 'Role')}: {emp.user_role}</span>
                )}
                {emp.level_name && (
                  <span className="rounded-full bg-white/25 px-2.5 py-1">
                    {emp.level_code} · {emp.level_name}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {emp.company_email && (
              <a
                href={`mailto:${emp.company_email}`}
                className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-2 text-[11px] font-bold backdrop-blur transition hover:bg-white/20"
              >
                <Mail size={13} /> {emp.company_email}
              </a>
            )}
            {emp.phone && (
              <a
                href={`tel:${emp.phone}`}
                className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-2 text-[11px] font-bold backdrop-blur transition hover:bg-white/20"
              >
                <Phone size={13} /> {emp.phone}
              </a>
            )}
            <button
              onClick={() => load(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-[11px] font-bold text-slate-900 transition hover:bg-blue-50"
            >
              <RefreshCw size={13} /> {tr('Muat Ulang', 'Refresh')}
            </button>
          </div>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-3xl border border-slate-200/80 bg-white p-4 shadow-2xs">
          <span className="text-[11px] font-semibold text-slate-400">{t.employees.baseSalary}</span>
          <div className="mt-1 truncate text-lg font-black tabular-nums text-emerald-600">
            {canSeeMoney ? formatCurrency(emp.base_salary) : '•••••'}
          </div>
        </div>
        <div className="rounded-3xl border border-slate-200/80 bg-white p-4 shadow-2xs">
          <span className="text-[11px] font-semibold text-slate-400">{t.employees.fixedAllowances}</span>
          <div className="mt-1 truncate text-lg font-black tabular-nums text-slate-900">
            {canSeeMoney ? formatCurrency(totalAllowances) : '•••••'}
          </div>
        </div>
        <div className="rounded-3xl border border-slate-200/80 bg-white p-4 shadow-2xs">
          <span className="text-[11px] font-semibold text-slate-400">{tr('Sisa Cuti Tahunan', 'Annual Leave Left')}</span>
          <div className="mt-1 text-lg font-black text-blue-700">
            {annualLeave ? `${annualLeave.remaining_days} / ${annualLeave.total_entitled}` : '-'}
            {annualLeave && <span className="ml-1 text-[10px] font-semibold text-slate-400">{tr('hari', 'days')}</span>}
          </div>
        </div>
        <div className="rounded-3xl border border-slate-200/80 bg-white p-4 shadow-2xs">
          <span className="text-[11px] font-semibold text-slate-400">{tr('Masa Kerja', 'Tenure')}</span>
          <div className="mt-1 text-lg font-black text-slate-900">
            {(() => {
              if (!emp.join_date) return '-';
              const join = new Date(`${emp.join_date}T00:00:00`);
              const now = new Date();
              let months = (now.getFullYear() - join.getFullYear()) * 12 + (now.getMonth() - join.getMonth());
              if (now.getDate() < join.getDate()) months -= 1;
              if (months < 0) return '-';
              const y = Math.floor(months / 12);
              const m = months % 12;
              return y > 0 ? `${y}${tr('th', 'y')} ${m}${tr('bln', 'm')}` : `${m}${tr('bln', 'm')}`;
            })()}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Personal / identity */}
        <Section title={tr('Data Pribadi', 'Personal Data')} icon={UserCircle}>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Field label={tr('Kewarganegaraan', 'Nationality')} value={emp.is_foreign_worker ? `TKA (${emp.nationality || 'WNA'})` : 'WNI'} />
            <Field label={tr('Jenis Kelamin', 'Gender')} value={emp.gender === 'male' ? tr('Laki-laki', 'Male') : emp.gender === 'female' ? tr('Perempuan', 'Female') : emp.gender} />
            <Field label={tr('Tempat Lahir', 'Place of Birth')} value={emp.place_of_birth} />
            <Field label={tr('Tanggal Lahir', 'Date of Birth')} value={emp.date_of_birth ? formatDate(emp.date_of_birth) : '-'} />
            <Field label={tr('Agama', 'Religion')} value={emp.religion} />
            <Field label={tr('Status Pernikahan', 'Marital Status')} value={emp.marital_status} />
            <Field label={tr('Nomor KTP', 'KTP Number')} value={emp.ktp_number} mono />
            <Field label="NPWP" value={emp.npwp_number} mono />
            {emp.is_foreign_worker === 1 && (
              <>
                <Field label={tr('Nomor Paspor', 'Passport Number')} value={emp.passport_number} mono />
                <Field label={tr('Masa Berlaku Paspor', 'Passport Expiry')} value={emp.passport_expiry_date} />
                <Field label={tr('KITAS / KITAP', 'KITAS / KITAP')} value={emp.kitas_kitap_number} mono />
              </>
            )}
            <Field label={tr('Alamat Domisili', 'Domicile Address')} value={emp.address} className="col-span-2" />
            <Field label={tr('Email Pribadi', 'Personal Email')} value={emp.personal_email} className="col-span-2" />
          </dl>
        </Section>

        {/* Employment */}
        <Section title={tr('Data Kepegawaian', 'Employment Data')} icon={Briefcase}>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Field label={tr('Departemen', 'Department')} value={emp.department_name} />
            <Field label={tr('Cabang', 'Branch')} value={emp.branch_name} />
            <Field label={tr('Atasan Langsung', 'Direct Manager')} value={emp.manager_name} />
            <Field
              label={tr('Level Karyawan', 'Employee Level')}
              value={emp.level_name ? `${emp.level_code} · ${emp.level_name} (Rank ${emp.level_rank})` : '-'}
            />
            {emp.bound_device_id && (
              <div className="col-span-2 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <div>
                  <div className="text-[11px] font-semibold text-slate-500">{tr('Perangkat Terikat', 'Bound Mobile Device')}</div>
                  <div className="text-xs font-bold text-slate-800">{emp.bound_device_label || emp.bound_device_id}</div>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    await apiFetch(`/employees/${emp.id}/unbind-device`, { method: 'POST' });
                    window.location.reload();
                  }}
                  className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-[11px] font-bold text-red-600 hover:bg-red-50"
                >
                  {tr('Reset Perangkat', 'Unbind Device')}
                </button>
              </div>
            )}
            <Field label={tr('Status Kepegawaian', 'Employment Status')} value={`${emp.employment_status} (${emp.lifecycle_status})`} />
            <Field label={t.employees.joinDate} value={emp.join_date ? formatDate(emp.join_date) : '-'} />
            <Field label={tr('Awal Kontrak', 'Contract Start')} value={emp.contract_start_date ? formatDate(emp.contract_start_date) : '-'} />
            <Field label={t.employees.contractEnd} value={emp.contract_end_date ? formatDate(emp.contract_end_date) : '-'} />
            <Field label={tr('Tanggal Resign', 'Resignation Date')} value={emp.resignation_date ? formatDate(emp.resignation_date) : '-'} />
            <Field label={tr('Hari Kerja Terakhir', 'Last Working Date')} value={emp.last_working_date ? formatDate(emp.last_working_date) : '-'} />
            <Field
              label={tr('Pola Shift', 'Shift Pattern')}
              value={
                emp.shift_name
                  ? `${emp.shift_name} (${String(emp.shift_start).slice(0, 5)} - ${String(emp.shift_end).slice(0, 5)})`
                  : `${tr('Jam Kantor Normal', 'Normal Office Hours')} (08:30 - 17:30)`
              }
            />
          </dl>
        </Section>

        {/* Payroll & statutory */}
        <Section title={tr('Payroll & Kepatuhan', 'Payroll & Statutory')} icon={ShieldCheck}>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Field label={t.employees.baseSalary} value={canSeeMoney ? formatCurrency(emp.base_salary) : '•••••'} />
            <Field label={t.employees.fixedAllowances} value={canSeeMoney ? formatCurrency(totalAllowances) : '•••••'} />
            <Field label={tr('Status PTKP', 'PTKP Status')} value={emp.ptkp_status} />
            <Field
              label={tr('Skema PPh 21', 'PPh 21 Scheme')}
              value={emp.pays_own_tax || emp.tax_scheme === 'self_paid' ? tr('Disetor Sendiri (Mandiri)', 'Self-Paid') : tr('Dipotong Perusahaan (TER)', 'Withheld by Company (TER)')}
            />
            <Field
              label={t.employees.bpjsKes}
              value={emp.has_bpjs_kes === 0 ? tr('Tidak Ikut', 'Not Enrolled') : emp.bpjs_kesehatan_number || tr('Terdaftar', 'Registered')}
            />
            <Field
              label={t.employees.bpjsTk}
              value={emp.has_bpjs_tk === 0 || !emp.has_bpjs_tk ? tr('Tidak Ikut', 'Not Enrolled') : emp.bpjs_tk_number || tr('Terdaftar', 'Registered')}
            />
            <Field label={tr('Basis Upah BPJS', 'BPJS Wage Basis')} value={emp.bpjs_wage_basis ? formatCurrency(emp.bpjs_wage_basis) : '-'} />
            <Field label={tr('Dikecualikan dari Payroll', 'Excluded from Payroll')} value={emp.exclude_from_payroll ? tr('Ya', 'Yes') : tr('Tidak', 'No')} />
          </dl>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
              <CreditCard size={12} /> {tr('Rekening Payroll', 'Payroll Bank Account')}
            </div>
            {canSeeMoney ? (
              <>
                <div className="mt-1 text-xs font-bold text-slate-800">
                  {emp.bank_name || '-'} · <span className="font-mono">{emp.bank_account_number || '-'}</span>
                </div>
                <div className="text-[11px] text-slate-500">{emp.bank_account_holder || '-'}</div>
                {(emp.bank_branch_name || emp.bank_swift_code) && (
                  <div className="mt-1 text-[10px] text-slate-400">
                    {emp.bank_branch_name || ''} {emp.bank_swift_code ? `· SWIFT ${emp.bank_swift_code}` : ''}
                  </div>
                )}
              </>
            ) : (
              <div className="mt-1 flex items-start gap-1.5 text-[11px] text-slate-500">
                <ShieldCheck size={13} className="mt-0.5 shrink-0 text-slate-400" />
                <span>
                  {tr(
                    'Data rekening disembunyikan. Hanya Admin dan Finance yang dapat melihat nomor rekening payroll.',
                    'Bank details are hidden. Only Admin and Finance can view payroll account numbers.'
                  )}
                </span>
              </div>
            )}
          </div>

          {emp.fixed_allowances_detail && emp.fixed_allowances_detail !== '[]' && (
            <div className="mt-3">
              <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                {tr('Rincian Tunjangan Tetap', 'Fixed Allowance Breakdown')}
              </div>
              <ul className="mt-1 space-y-1">
                {(() => {
                  try {
                    const items = JSON.parse(emp.fixed_allowances_detail);
                    if (!Array.isArray(items) || items.length === 0) return <li className="text-[11px] text-slate-400">-</li>;
                    return items.map((it: any, i: number) => (
                      <li key={i} className="flex items-center justify-between rounded-lg bg-slate-50 px-2.5 py-1 text-[11px]">
                        <span className="text-slate-600">{it.name}</span>
                        <span className="font-bold tabular-nums text-slate-800">{canSeeMoney ? formatCurrency(it.amount) : '•••••'}</span>
                      </li>
                    ));
                  } catch {
                    return <li className="text-[11px] text-slate-400">-</li>;
                  }
                })()}
              </ul>
            </div>
          )}
        </Section>

        {/* Leave balances */}
        <Section title={`${tr('Saldo Cuti', 'Leave Balances')} ${new Date().getFullYear()}`} icon={Calendar}>
          {data.leaveBalances.length === 0 ? (
            <p className="text-xs text-slate-400">{tr('Belum ada saldo cuti.', 'No leave balances yet.')}</p>
          ) : (
            <div className="space-y-2">
              {data.leaveBalances.map((b: any) => {
                const pct = b.total_entitled > 0 ? Math.min(100, (b.remaining_days / b.total_entitled) * 100) : 0;
                return (
                  <div key={b.id}>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-slate-700">{b.leave_type_name}</span>
                      <span className="tabular-nums text-slate-500">
                        <span className="font-black text-slate-900">{b.remaining_days}</span> / {b.total_entitled}
                        <span className="ml-1 text-slate-400">({tr('terpakai', 'used')} {b.used_days})</span>
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-blue-500" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Section>
      </div>

      {/* Payroll history */}
      <Section
        title={tr('Riwayat Payroll', 'Payroll History')}
        icon={Wallet}
        action={
          <Link to="/payroll" className="text-[11px] font-bold text-blue-600 hover:underline">
            {tr('Buka Payroll', 'Open Payroll')}
          </Link>
        }
      >
        {data.payrollHistory.length === 0 ? (
          <p className="text-xs text-slate-400">{tr('Belum ada riwayat payroll.', 'No payroll history yet.')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="py-2 pr-3 font-bold">{tr('Periode', 'Period')}</th>
                  <th className="px-3 py-2 font-bold">{tr('Status', 'Status')}</th>
                  <th className="px-3 py-2 text-center font-bold">{tr('Hari', 'Days')}</th>
                  {canSeeMoney && <th className="px-3 py-2 text-right font-bold">{t.payroll.grossEarnings}</th>}
                  {canSeeMoney && <th className="px-3 py-2 text-right font-bold">{t.payroll.totalDeductions}</th>}
                  {canSeeMoney && <th className="py-2 pl-3 text-right font-bold text-blue-700">{t.payroll.takeHomePay}</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.payrollHistory.map((p: any) => (
                  <tr key={p.id} className="hover:bg-slate-50/70">
                    <td className="py-2.5 pr-3">
                      <div className="font-bold text-slate-900">{p.period_title}</div>
                      <div className="text-[10px] text-slate-400">
                        {formatDate(p.period_start)} → {formatDate(p.period_end)}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusPill(p.run_status)}`}>
                        {p.run_status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center tabular-nums text-slate-600">
                      {p.days_worked ?? '-'} / {p.expected_working_days ?? '-'}
                    </td>
                    {canSeeMoney && (
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{formatCurrency(p.gross_earnings)}</td>
                    )}
                    {canSeeMoney && (
                      <td className="px-3 py-2.5 text-right tabular-nums text-rose-600">{formatCurrency(p.total_deductions)}</td>
                    )}
                    {canSeeMoney && (
                      <td className="py-2.5 pl-3 text-right font-black tabular-nums text-blue-700">
                        {formatCurrency(p.take_home_pay)}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Kasbon */}
        <Section title={tr('Kasbon / Pinjaman', 'Cash Advances')} icon={Receipt}>
          {data.kasbon.length === 0 ? (
            <p className="text-xs text-slate-400">{tr('Tidak ada kasbon aktif.', 'No cash advances.')}</p>
          ) : (
            <div className="space-y-2">
              {data.kasbon.map((k: any) => (
                <div key={k.id} className="rounded-2xl border border-slate-200 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-xs font-bold text-slate-900">{k.reason}</div>
                      <div className="text-[10px] text-slate-400">
                        {formatDate(k.created_at)} · {k.total_instalments}× {tr('cicilan', 'installments')}
                      </div>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${statusPill(k.status)}`}>{k.status}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[11px]">
                    <span className="text-slate-500">
                      {tr('Sisa', 'Remaining')}:{' '}
                      <span className="font-bold tabular-nums text-slate-900">{canSeeMoney ? formatCurrency(k.remaining_amount) : '•••••'}</span>
                    </span>
                    <span className="text-slate-400">
                      {tr('Dari', 'of')} {canSeeMoney ? formatCurrency(k.amount) : '•••••'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Claims */}
        <Section title={tr('Klaim Biaya', 'Expense Claims')} icon={Receipt}>
          {data.claims.length === 0 ? (
            <p className="text-xs text-slate-400">{tr('Tidak ada klaim biaya.', 'No expense claims.')}</p>
          ) : (
            <div className="space-y-2">
              {data.claims.map((cl: any) => (
                <div key={cl.id} className="flex items-start justify-between gap-2 rounded-2xl border border-slate-200 p-3">
                  <div className="min-w-0">
                    <div className="truncate text-xs font-bold text-slate-900">{cl.description}</div>
                    <div className="text-[10px] text-slate-400">
                      {cl.category} · {formatDate(cl.expense_date || cl.created_at)}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-xs font-black tabular-nums text-slate-900">{formatCurrency(cl.amount)}</div>
                    <span className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${statusPill(cl.status)}`}>
                      {cl.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Recent attendance */}
        <Section title={tr('Presensi Terakhir', 'Recent Attendance')} icon={Clock}>
          {data.recentAttendance.length === 0 ? (
            <p className="text-xs text-slate-400">{tr('Belum ada data presensi.', 'No attendance records yet.')}</p>
          ) : (
            <div className="space-y-1.5">
              {data.recentAttendance.map((a: any) => (
                <div key={a.date} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/60 px-2.5 py-1.5 text-[11px]">
                  <span className="font-semibold text-slate-700">{formatDate(a.date)}</span>
                  <span className="font-mono text-slate-600">
                    {a.clock_in_time || '--:--'} → {a.clock_out_time || '--:--'}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusPill(a.status)}`}>{a.status}</span>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Documents */}
        <Section title={tr('Dokumen Karyawan', 'Employee Documents')} icon={FileText}>
          {!(isOwnerAdmin || isFinance) ? (
            <p className="text-xs text-slate-400">{tr('Hanya admin yang dapat melihat dokumen.', 'Only admins can view documents.')}</p>
          ) : data.documents.length === 0 ? (
            <p className="text-xs text-slate-400">{tr('Belum ada dokumen yang diunggah.', 'No documents uploaded yet.')}</p>
          ) : (
            <div className="space-y-1.5">
              {data.documents.map((doc: any) => (
                <a
                  key={doc.id}
                  href={`/api/employees/${emp.id}/documents/${doc.id}?token=${getToken()}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between rounded-lg border border-slate-200 px-2.5 py-2 text-[11px] transition hover:bg-slate-50"
                >
                  <span className="min-w-0 truncate font-semibold text-slate-700">
                    {doc.file_name}
                    <span className="ml-1 font-normal text-slate-400">· {doc.document_type}</span>
                  </span>
                  <span className="shrink-0 font-bold text-blue-600">{tr('Lihat', 'View')}</span>
                </a>
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
};
