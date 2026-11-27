import React, { useEffect, useMemo, useState } from 'react';
import { apiFetch, getToken } from '../../api';

interface ClassicTmsViewProps {
  tasks: any[];
  loading: boolean;
  counts: { inbox: number; assigned: number; approvals: number; results: number; overdue: number; total: number };
  employees: any[];
  referenceFields: string[];
  companyName: string;
  nextReferenceNo: string;
  selectedTaskId?: string;
  onNavigateTask: (taskId: string | null) => void;
  user: any;
  tab: 'inbox' | 'assigned' | 'approvals' | 'results' | 'all';
  setTab: (tab: 'inbox' | 'assigned' | 'approvals' | 'results' | 'all') => void;
  onRefresh: () => Promise<void>;
  flash: (type: 'ok' | 'err', text: string) => void;
  uploadAttachment: (taskId: string, file: File, activityId?: string) => Promise<void>;
}

const todayISO = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const nowTime = () => {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
};

const toDhm = (totalMin: number) => {
  const m = Math.max(0, Math.round(totalMin || 0));
  const days = Math.floor(m / 1440);
  const hours = Math.floor((m % 1440) / 60);
  const mins = m % 60;
  return { days, hours, mins };
};

const fromDhm = (d: number, h: number, m: number) => Math.max(0, d * 1440 + h * 60 + m);

const DhmRow: React.FC<{
  label: string;
  minutes: number;
  onChange: (minutes: number) => void;
}> = ({ label, minutes, onChange }) => {
  const { days, hours, mins } = toDhm(minutes);
  return (
    <div className="grid grid-cols-12 items-center gap-2 border-b border-slate-200 py-1.5 text-[11px]">
      <div className="col-span-4 font-semibold text-slate-700">
        {label} <span className="text-rose-600">***</span>
      </div>
      <div className="col-span-2 flex items-center gap-1">
        <input
          type="number"
          min={0}
          value={days}
          onChange={(e) => onChange(fromDhm(Number(e.target.value) || 0, hours, mins))}
          className="w-full rounded border border-slate-300 px-1.5 py-1 text-xs"
        />
        <span className="text-[10px] text-slate-500">Days</span>
      </div>
      <div className="col-span-3 flex items-center gap-1">
        <input
          type="number"
          min={0}
          max={23}
          value={hours}
          onChange={(e) => onChange(fromDhm(days, Number(e.target.value) || 0, mins))}
          className="w-full rounded border border-slate-300 px-1.5 py-1 text-xs"
        />
        <span className="text-[10px] text-slate-500">Hours</span>
      </div>
      <div className="col-span-3 flex items-center gap-1">
        <input
          type="number"
          min={0}
          max={59}
          value={mins}
          onChange={(e) => onChange(fromDhm(days, hours, Number(e.target.value) || 0))}
          className="w-full rounded border border-slate-300 px-1.5 py-1 text-xs"
        />
        <span className="text-[10px] text-slate-500">Min</span>
      </div>
    </div>
  );
};

export const ClassicTmsView: React.FC<ClassicTmsViewProps> = ({
  tasks,
  loading,
  counts,
  employees,
  referenceFields,
  companyName,
  nextReferenceNo,
  selectedTaskId,
  onNavigateTask,
  user,
  tab,
  setTab,
  onRefresh,
  flash,
  uploadAttachment,
}) => {
  const [classicMode, setClassicMode] = useState<'new' | 'list' | 'detail'>('new');
  const [submitting, setSubmitting] = useState(false);

  // Section A state
  const [aRemarks, setARemarks] = useState('NA');
  const [assigneeId, setAssigneeId] = useState(employees[0]?.id || '');
  const [ccId, setCcId] = useState('');
  const [bccId, setBccId] = useState('');
  const [a2Remarks, setA2Remarks] = useState('NA');
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState<string>('general');
  const [routerType, setRouterType] = useState<string>('adhoc');
  const [detailText, setDetailText] = useState('');
  const [a3Remarks, setA3Remarks] = useState('NA');
  const [refMeta, setRefMeta] = useState<Record<string, string>>({});
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium');
  const [dueDate, setDueDate] = useState(todayISO());
  const [dueTime, setDueTime] = useState('18:00');
  const [a4Remarks, setA4Remarks] = useState('NA');
  const [aFiles, setAFiles] = useState<File[]>([]);
  const [remMin, setRemMin] = useState(30);
  const [alert1Min, setAlert1Min] = useState(30);
  const [alert2Min, setAlert2Min] = useState(45);
  const [warnMin, setWarnMin] = useState(60);

  // Selected Task for Section B & C
  const [selected, setSelected] = useState<{ task: any; activities: any[]; attachments: any[] } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // B1 Take Action
  const [b1Status, setB1Status] = useState<'in_progress' | 'open'>('in_progress');
  const [b1Note, setB1Note] = useState('');
  const [b1File, setB1File] = useState<File | null>(null);

  // B2 Next Action
  const [b2NextBy, setB2NextBy] = useState('');
  const [b2Reason, setB2Reason] = useState('');
  const [b2Status, setB2Status] = useState<'in_progress' | 'open'>('in_progress');
  const [b2File, setB2File] = useState<File | null>(null);

  // B3 + B4 Reschedule & Reminders
  const [b3Date, setB3Date] = useState(todayISO());
  const [b3Time, setB3Time] = useState('18:00');
  const [b4Rem, setB4Rem] = useState(30);
  const [b4Alert1, setB4Alert1] = useState(30);
  const [b4Alert2, setB4Alert2] = useState(45);
  const [b4Warn, setB4Warn] = useState(60);

  // B5 Close
  const [b5Remarks, setB5Remarks] = useState('NA');
  const [b5MailBody, setB5MailBody] = useState('');
  const [b5GmailTo, setB5GmailTo] = useState('');
  const [b5File, setB5File] = useState<File | null>(null);

  // C Approval
  const [cRemarks, setCRemarks] = useState('');

  const empOptions = useMemo(
    () =>
      employees.map((e) => ({
        value: e.id,
        label: `${e.nik ? `${e.nik} - ` : ''}${e.full_name}`,
      })),
    [employees]
  );

  const currentEmp = employees.find((e) => e.id === user?.employeeId);
  const selectedAssignee = employees.find((e) => e.id === assigneeId);

  const resetNewForm = () => {
    setSelected(null);
    setARemarks('NA');
    setAssigneeId(employees[0]?.id || '');
    setCcId('');
    setBccId('');
    setA2Remarks('NA');
    setSubject('');
    setCategory('general');
    setRouterType('adhoc');
    setDetailText('');
    setA3Remarks('NA');
    setRefMeta({});
    setPriority('medium');
    setDueDate(todayISO());
    setDueTime('18:00');
    setA4Remarks('NA');
    setAFiles([]);
    setRemMin(30);
    setAlert1Min(30);
    setAlert2Min(45);
    setWarnMin(60);
    setShowHistory(false);
  };

  const openTask = async (taskId: string) => {
    setClassicMode('detail');
    setDetailLoading(true);
    try {
      const res = await apiFetch(`/tasks/${taskId}`);
      setSelected(res);
      const t = res.task;
      const [dPart, tPart] = String(t.due_at || '').split(' ');
      setSubject(t.title || '');
      setDetailText(t.description || '');
      setCategory(t.category || 'general');
      setRouterType(t.router || 'adhoc');
      setPriority(t.priority || 'medium');
      setAssigneeId(t.assignee_id || '');
      setCcId(t.watchers?.[0] || '');
      setBccId(t.watchers?.[1] || '');
      setRefMeta(t.reference_meta || {});
      setDueDate(dPart || todayISO());
      setDueTime(tPart || '18:00');
      setARemarks(t.remarks || 'NA');
      setRemMin(Number(t.reminder_minutes ?? 30));
      setAlert1Min(Number(t.alert1_minutes ?? 30));
      setAlert2Min(Number(t.alert2_minutes ?? 45));
      setWarnMin(Number(t.warning_minutes ?? 60));

      setB3Date(dPart || todayISO());
      setB3Time(tPart || '18:00');
      setB4Rem(Number(t.reminder_minutes ?? 30));
      setB4Alert1(Number(t.alert1_minutes ?? 30));
      setB4Alert2(Number(t.alert2_minutes ?? 45));
      setB4Warn(Number(t.warning_minutes ?? 60));
    } catch (err: any) {
      flash('err', err.message);
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    if (selectedTaskId) {
      if (selected?.task?.id !== selectedTaskId || classicMode !== 'detail') {
        openTask(selectedTaskId);
      }
    } else {
      setSelected(null);
      if (classicMode === 'detail') {
        setClassicMode('list');
      }
    }
  }, [selectedTaskId]);

  const handleSectionASubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !assigneeId || !dueDate) {
      flash('err', 'Subject, Assignee Code/Name, and Due Date are required.');
      return;
    }
    setSubmitting(true);
    try {
      const watchers = [ccId, bccId].filter(Boolean);
      const created = await apiFetch('/tasks', {
        method: 'POST',
        body: JSON.stringify({
          title: subject.trim(),
          description: detailText.trim(),
          category,
          router: routerType,
          priority,
          assignee_id: assigneeId,
          watchers,
          reference_meta: refMeta,
          due_at: `${dueDate} ${dueTime || '18:00'}`,
          reminder_minutes: remMin,
          alert1_minutes: alert1Min,
          alert2_minutes: alert2Min,
          warning_minutes: warnMin,
          remarks: [aRemarks, a2Remarks, a3Remarks, a4Remarks].filter((r) => r && r !== 'NA').join(' | '),
        }),
      });
      for (const f of aFiles) {
        await uploadAttachment(created.id, f);
      }
      flash('ok', `Submitted ${created.reference_no}`);
      setSubject('');
      setDetailText('');
      setRefMeta({});
      setAFiles([]);
      setClassicMode('list');
      setTab('assigned');
      await onRefresh();
    } catch (err: any) {
      flash('err', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const runTaskPost = async (url: string, payload: any, file?: File | null, msg = 'Updated') => {
    if (!selected) return;
    setSubmitting(true);
    try {
      const res = await apiFetch(url, { method: 'POST', body: JSON.stringify(payload) });
      if (file) await uploadAttachment(selected.task.id, file, res.activity_id);
      flash('ok', msg);
      await Promise.all([openTask(selected.task.id), onRefresh()]);
    } catch (err: any) {
      flash('err', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3 font-sans text-xs">
      {/* Classic Legacy Navigation Bar (hidden when inspecting a single task URL) */}
      {classicMode !== 'detail' ? (
      <div className="flex flex-wrap items-center gap-1 rounded border border-slate-300 bg-slate-100 p-1.5">
        <button
          type="button"
          onClick={() => {
            resetNewForm();
            setClassicMode('new');
            if (selectedTaskId) onNavigateTask(null);
          }}
          className={`rounded px-3 py-1.5 text-[11px] font-bold ${
            classicMode === 'new' ? 'bg-slate-800 text-white' : 'bg-white text-slate-700 border border-slate-300'
          }`}
        >
          Task New Assignment
        </button>
        <button
          type="button"
          onClick={() => {
            setTab('inbox');
            setClassicMode('list');
            if (selectedTaskId) onNavigateTask(null);
          }}
          className={`rounded px-3 py-1.5 text-[11px] font-bold ${
            classicMode === 'list' && tab === 'inbox'
              ? 'bg-slate-800 text-white'
              : 'bg-white text-slate-700 border border-slate-300'
          }`}
        >
          Task Outstanding ({counts.inbox})
        </button>
        <button
          type="button"
          onClick={() => {
            setTab('assigned');
            setClassicMode('list');
            if (selectedTaskId) onNavigateTask(null);
          }}
          className={`rounded px-3 py-1.5 text-[11px] font-bold ${
            classicMode === 'list' && tab === 'assigned'
              ? 'bg-slate-800 text-white'
              : 'bg-white text-slate-700 border border-slate-300'
          }`}
        >
          Task Outstanding Assignor ({counts.assigned})
        </button>
        <button
          type="button"
          onClick={() => {
            setTab('results');
            setClassicMode('list');
            if (selectedTaskId) onNavigateTask(null);
          }}
          className={`rounded px-3 py-1.5 text-[11px] font-bold ${
            classicMode === 'list' && tab === 'results'
              ? 'bg-slate-800 text-white'
              : 'bg-white text-slate-700 border border-slate-300'
          }`}
        >
          Inbox ({counts.results})
        </button>
      </div>
      ) : (
        <div className="flex items-center justify-between rounded border border-slate-300 bg-slate-100 px-3 py-2">
          <button
            type="button"
            onClick={() => {
              setSelected(null);
              setClassicMode('list');
              onNavigateTask(null);
            }}
            className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-800 hover:bg-slate-50"
          >
            ← Back to List
          </button>
          {selected && (
            <div className="font-mono text-[11px] font-bold text-slate-600">
              {selected.task.reference_no} · <span className="uppercase">{selected.task.status}</span>
            </div>
          )}
        </div>
      )}

      {/* Detail skeleton while opening a task */}
      {classicMode === 'detail' && detailLoading && (
        <div className="space-y-4">
          <div className="animate-pulse space-y-3 rounded border border-slate-300 bg-white p-4">
            <div className="h-5 w-64 rounded bg-slate-200" />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
              <div className="h-9 rounded bg-slate-100" />
              <div className="h-9 rounded bg-slate-100" />
              <div className="h-9 rounded bg-slate-100" />
              <div className="h-9 rounded bg-slate-100" />
            </div>
            <div className="h-24 rounded bg-slate-100" />
          </div>
          <div className="animate-pulse space-y-3 rounded border border-slate-300 bg-white p-4">
            <div className="h-5 w-56 rounded bg-slate-200" />
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <div className="h-36 rounded bg-slate-100" />
              <div className="h-36 rounded bg-slate-100" />
            </div>
          </div>
        </div>
      )}

      {/* SECTION A + B + C: Shown together in both Task New Assignment and Open Task */}
      {(classicMode === 'new' || (classicMode === 'detail' && !detailLoading && selected)) && (() => {
        const isDetail = classicMode === 'detail' && Boolean(selected);
        const activeTask = selected?.task;
        const bDisabled = !isDetail || activeTask?.status === 'approved' || submitting;
        return (
        <div className="space-y-4">
        <form onSubmit={handleSectionASubmit} className="space-y-3 rounded border border-slate-300 bg-white p-4">
          <div className="flex items-center justify-between border-b border-slate-300 pb-2">
            <div className="text-sm font-black uppercase text-slate-800">
              Section : A Task Details {isDetail ? `| ${activeTask.reference_no}` : ''}
            </div>
            {isDetail && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowHistory((v) => !v)}
                  className="rounded border border-slate-300 px-3 py-1 text-[11px] font-bold text-slate-700"
                >
                  History ({selected!.activities.length})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelected(null);
                    setClassicMode('list');
                    onNavigateTask(null);
                  }}
                  className="rounded border border-slate-300 px-3 py-1 text-[11px] font-bold text-slate-700"
                >
                  Back to List
                </button>
              </div>
            )}
          </div>

          <fieldset disabled={isDetail} className="space-y-3 disabled:opacity-90">
          {/* A1 */}
          <fieldset className="rounded border border-slate-300 p-3">
            <legend className="px-1.5 text-xs font-bold text-slate-800">A1 TMS Reference</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
              <div>
                <div className="text-[10px] font-semibold text-slate-500">Reference Number ***</div>
                <input readOnly value={isDetail ? activeTask.reference_no : nextReferenceNo} className="w-full rounded border border-slate-200 bg-slate-100 p-1.5 font-mono text-[11px] font-bold text-slate-700" />
              </div>
              <div>
                <div className="text-[10px] font-semibold text-slate-500">Date ***</div>
                <input readOnly value={isDetail ? String(activeTask.created_at || todayISO()).slice(0, 10) : todayISO()} className="w-full rounded border border-slate-200 bg-slate-100 p-1.5 text-[11px] text-slate-700" />
              </div>
              <div>
                <div className="text-[10px] font-semibold text-slate-500">Time ***</div>
                <input readOnly value={isDetail ? String(activeTask.created_at || nowTime()).slice(11, 16) || nowTime() : nowTime()} className="w-full rounded border border-slate-200 bg-slate-100 p-1.5 text-[11px] text-slate-700" />
              </div>
              <div>
                <div className="text-[10px] font-semibold text-slate-500">Remarks</div>
                <input value={aRemarks} onChange={(e) => setARemarks(e.target.value)} className="w-full rounded border border-slate-300 p-1.5 text-[11px]" />
              </div>
            </div>
          </fieldset>

          {/* A2 */}
          <fieldset className="rounded border border-slate-300 p-3 space-y-2">
            <legend className="px-1.5 text-xs font-bold text-slate-800">A2 TMS Assignor / Assignee Details</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div>
                <div className="text-[10px] font-semibold text-slate-500">*** Assignor Code / Name</div>
                <input
                  readOnly
                  disabled
                  value={`${currentEmp?.nik ? `${currentEmp.nik} - ` : ''}${currentEmp?.full_name || user?.name || ''}`}
                  className="w-full cursor-not-allowed rounded border border-slate-200 bg-slate-100 p-1.5 text-[11px] text-slate-600"
                />
              </div>
              <div>
                <div className="text-[10px] font-semibold text-slate-500">Company</div>
                <input
                  readOnly
                  disabled
                  value={companyName}
                  className="w-full cursor-not-allowed rounded border border-slate-200 bg-slate-100 p-1.5 text-[11px] text-slate-600"
                />
              </div>
              <div>
                <div className="text-[10px] font-semibold text-slate-500">Department</div>
                <input
                  readOnly
                  disabled
                  value={currentEmp?.department_name || '-'}
                  className="w-full cursor-not-allowed rounded border border-slate-200 bg-slate-100 p-1.5 text-[11px] text-slate-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div>
                <div className="text-[10px] font-semibold text-slate-500">*** Assignee Code / Name</div>
                <select
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                  className="w-full rounded border border-slate-300 bg-white p-1.5 text-[11px]"
                >
                  <option value="">select</option>
                  {empOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div className="text-[10px] font-semibold text-slate-500">Company</div>
                <input
                  readOnly
                  disabled
                  value={companyName}
                  className="w-full cursor-not-allowed rounded border border-slate-200 bg-slate-100 p-1.5 text-[11px] text-slate-600"
                />
              </div>
              <div>
                <div className="text-[10px] font-semibold text-slate-500">Department</div>
                <input
                  readOnly
                  disabled
                  value={selectedAssignee?.department_name || '-'}
                  className="w-full cursor-not-allowed rounded border border-slate-200 bg-slate-100 p-1.5 text-[11px] text-slate-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div>
                <div className="text-[10px] font-semibold text-slate-500">CC to</div>
                <select
                  value={ccId}
                  onChange={(e) => setCcId(e.target.value)}
                  className="w-full rounded border border-slate-300 bg-white p-1.5 text-[11px]"
                >
                  <option value="">Select...</option>
                  {empOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div className="text-[10px] font-semibold text-slate-500">BCC To</div>
                <select
                  value={bccId}
                  onChange={(e) => setBccId(e.target.value)}
                  className="w-full rounded border border-slate-300 bg-white p-1.5 text-[11px]"
                >
                  <option value="">Select...</option>
                  {empOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div className="text-[10px] font-semibold text-slate-500">Remarks</div>
                <input value={a2Remarks} onChange={(e) => setA2Remarks(e.target.value)} className="w-full rounded border border-slate-300 p-1.5 text-[11px]" />
              </div>
            </div>
          </fieldset>

          {/* A3 */}
          <fieldset className="rounded border border-slate-300 p-3 space-y-2">
            <legend className="px-1.5 text-xs font-bold text-slate-800">A3 TMS Details</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div>
                <div className="text-[10px] font-semibold text-slate-500">Subject ***</div>
                <input value={subject} onChange={(e) => setSubject(e.target.value)} className="w-full rounded border border-slate-300 p-1.5 text-[11px]" />
              </div>
              <div>
                <div className="text-[10px] font-semibold text-slate-500">Category</div>
                <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full rounded border border-slate-300 bg-white p-1.5 text-[11px]">
                  <option value="general">General</option>
                  <option value="technical">Technical / IT</option>
                  <option value="operations">Operations</option>
                  <option value="finance">Finance</option>
                  <option value="hr">HR</option>
                  <option value="safety">Safety / Compliance</option>
                </select>
              </div>
              <div>
                <div className="text-[10px] font-semibold text-slate-500">Routine</div>
                <select value={routerType} onChange={(e) => setRouterType(e.target.value)} className="w-full rounded border border-slate-300 bg-white p-1.5 text-[11px]">
                  <option value="adhoc">Adhoc</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
            </div>
            {referenceFields.length > 0 && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                {referenceFields.map((field) => (
                  <div key={field}>
                    <div className="text-[10px] font-semibold text-slate-500">{field}</div>
                    <input
                      value={refMeta[field] || ''}
                      onChange={(e) => setRefMeta((p) => ({ ...p, [field]: e.target.value }))}
                      placeholder="NA"
                      className="w-full rounded border border-slate-300 p-1.5 text-[11px]"
                    />
                  </div>
                ))}
              </div>
            )}
            <div>
              <div className="text-[10px] font-semibold text-slate-500">Detail ***</div>
              <textarea rows={2} value={detailText} onChange={(e) => setDetailText(e.target.value)} className="w-full rounded border border-slate-300 p-1.5 text-[11px]" />
            </div>
            <div>
              <div className="text-[10px] font-semibold text-slate-500">Remarks</div>
              <input value={a3Remarks} onChange={(e) => setA3Remarks(e.target.value)} className="w-full rounded border border-slate-300 p-1.5 text-[11px]" />
            </div>
          </fieldset>

          {/* A4 */}
          <fieldset className="rounded border border-slate-300 p-3 space-y-2">
            <legend className="px-1.5 text-xs font-bold text-slate-800">A4 TMS Schedule</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
              <div>
                <div className="text-[10px] font-semibold text-slate-500">Priority ***</div>
                <select value={priority} onChange={(e) => setPriority(e.target.value as any)} className="w-full rounded border border-slate-300 bg-white p-1.5 text-[11px]">
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              <div>
                <div className="text-[10px] font-semibold text-slate-500">To be completed on date ***</div>
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full rounded border border-slate-300 p-1.5 text-[11px]" />
              </div>
              <div>
                <div className="text-[10px] font-semibold text-slate-500">To be completed on time ***</div>
                <input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} className="w-full rounded border border-slate-300 p-1.5 text-[11px]" />
              </div>
              <div>
                <div className="text-[10px] font-semibold text-slate-500">Attachment</div>
                <input type="file" multiple onChange={(e) => setAFiles(Array.from(e.target.files || []))} className="w-full text-[10px]" />
              </div>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-slate-500">Remarks</div>
              <input value={a4Remarks} onChange={(e) => setA4Remarks(e.target.value)} className="w-full rounded border border-slate-300 p-1.5 text-[11px]" />
            </div>
          </fieldset>

          {/* A5 */}
          <fieldset className="rounded border border-slate-300 p-3">
            <legend className="px-1.5 text-xs font-bold text-slate-800">A5 Reminder & Alert</legend>
            <DhmRow label="Reminder" minutes={remMin} onChange={setRemMin} />
            <DhmRow label="Alert 1" minutes={alert1Min} onChange={setAlert1Min} />
            <DhmRow label="Alert 2" minutes={alert2Min} onChange={setAlert2Min} />
            <DhmRow label="Warning" minutes={warnMin} onChange={setWarnMin} />
          </fieldset>
          </fieldset>

          {!isDetail && (
            <div className="flex gap-2">
              <button type="submit" disabled={submitting} className="rounded bg-slate-800 px-4 py-1.5 font-bold text-white hover:bg-slate-700">
                Submit
              </button>
              <button type="button" onClick={() => setClassicMode('list')} className="rounded border border-slate-300 px-4 py-1.5 font-bold text-slate-700">
                Cancel
              </button>
            </div>
          )}
        </form>

        {/* SECTION B & C: Always visible below Section A */}
        <div className="space-y-3 rounded border border-slate-300 bg-white p-4">
          <div className="flex items-center justify-between border-b border-slate-300 pb-2">
            <div className="text-sm font-black uppercase text-slate-800">
              Section : B Action Details {isDetail ? `| ${activeTask.reference_no}` : ''}
            </div>
            {isDetail && (
              <button
                type="button"
                onClick={() => setShowHistory((v) => !v)}
                className="rounded border border-slate-300 px-3 py-1 text-[11px] font-bold text-slate-700"
              >
                History ({selected!.activities.length})
              </button>
            )}
          </div>

          {isDetail && showHistory && (
            <div className="rounded border border-slate-200 bg-slate-50 p-3 space-y-1.5">
              <div className="font-bold text-slate-800">History</div>
              {selected!.activities.map((a) => (
                <div key={a.id} className="text-[11px] text-slate-700">
                  [{String(a.created_at).slice(0, 16)}] <strong>{a.actor_name}</strong> ({a.action_type}): {a.note}
                </div>
              ))}
            </div>
          )}

          {isDetail && selected!.attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 text-[11px]">
              <span className="font-bold">Attachments:</span>
              {selected!.attachments.map((att) => (
                <a
                  key={att.id}
                  href={`${att.url}?token=${encodeURIComponent(getToken() || '')}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-700 underline"
                >
                  {att.file_name}
                </a>
              ))}
            </div>
          )}

          <div className={`grid grid-cols-1 gap-3 lg:grid-cols-2 ${!isDetail ? 'opacity-60' : ''}`}>
            {/* B1 Take Action */}
            <fieldset disabled={bDisabled} className="rounded border border-slate-300 p-3 space-y-2">
              <legend className="px-1.5 text-xs font-bold">B1 Take Action</legend>
              <select value={b1Status} onChange={(e) => setB1Status(e.target.value as any)} className="w-full rounded border border-slate-300 bg-white p-1.5">
                <option value="in_progress">In Progress</option>
                <option value="open">Open</option>
              </select>
              <textarea rows={2} value={b1Note} onChange={(e) => setB1Note(e.target.value)} placeholder="Action remarks..." className="w-full rounded border border-slate-300 p-1.5" />
              <input type="file" onChange={(e) => setB1File(e.target.files?.[0] || null)} className="w-full text-[10px]" />
              <button
                type="button"
                disabled={bDisabled}
                onClick={() => activeTask && runTaskPost(`/tasks/${activeTask.id}/action`, { status: b1Status, note: b1Note }, b1File, 'B1 Action submitted')}
                className="rounded bg-slate-800 px-3 py-1.5 font-bold text-white disabled:opacity-50"
              >
                Submit
              </button>
            </fieldset>

            {/* B2 Next Action */}
            <fieldset disabled={bDisabled} className="rounded border border-slate-300 p-3 space-y-2">
              <legend className="px-1.5 text-xs font-bold">B2 Next Action to be Taken</legend>
              <div className="text-[11px] text-slate-600">
                Reference No: <strong>{isDetail ? activeTask.reference_no : nextReferenceNo}</strong> | Task Detail: <strong>{isDetail ? activeTask.title : subject || '-'}</strong>
              </div>
              <select value={b2NextBy} onChange={(e) => setB2NextBy(e.target.value)} className="w-full rounded border border-slate-300 bg-white p-1.5">
                <option value="">Select...</option>
                {empOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <textarea rows={2} value={b2Reason} onChange={(e) => setB2Reason(e.target.value)} placeholder="Next Action Details to be taken / Reason***" className="w-full rounded border border-slate-300 p-1.5" />
              <select value={b2Status} onChange={(e) => setB2Status(e.target.value as any)} className="w-full rounded border border-slate-300 bg-white p-1.5">
                <option value="in_progress">In Progress</option>
                <option value="open">Open</option>
              </select>
              <input type="file" onChange={(e) => setB2File(e.target.files?.[0] || null)} className="w-full text-[10px]" />
              <button
                type="button"
                disabled={bDisabled}
                onClick={() => activeTask && runTaskPost(`/tasks/${activeTask.id}/handover`, { next_assignee_id: b2NextBy, reason: b2Reason, status: b2Status }, b2File, 'B2 Next Action submitted')}
                className="rounded bg-slate-800 px-3 py-1.5 font-bold text-white disabled:opacity-50"
              >
                Submit
              </button>
            </fieldset>

            {/* B3 + B4 Reschedule & Reminder */}
            <fieldset disabled={bDisabled} className="rounded border border-slate-300 p-3 space-y-2">
              <legend className="px-1.5 text-xs font-bold">B3 Reschedule & B4 Reminder & Alert</legend>
              <div className="grid grid-cols-2 gap-2">
                <input type="date" value={b3Date} onChange={(e) => setB3Date(e.target.value)} className="rounded border border-slate-300 p-1.5" />
                <input type="time" value={b3Time} onChange={(e) => setB3Time(e.target.value)} className="rounded border border-slate-300 p-1.5" />
              </div>
              <DhmRow label="Reminder" minutes={b4Rem} onChange={setB4Rem} />
              <DhmRow label="Alert 1" minutes={b4Alert1} onChange={setB4Alert1} />
              <DhmRow label="Alert 2" minutes={b4Alert2} onChange={setB4Alert2} />
              <DhmRow label="Warning" minutes={b4Warn} onChange={setB4Warn} />
              <button
                type="button"
                disabled={bDisabled}
                onClick={() =>
                  activeTask &&
                  runTaskPost(
                    `/tasks/${activeTask.id}/reschedule`,
                    {
                      due_at: `${b3Date} ${b3Time || '18:00'}`,
                      reminder_minutes: b4Rem,
                      alert1_minutes: b4Alert1,
                      alert2_minutes: b4Alert2,
                      warning_minutes: b4Warn,
                    },
                    null,
                    'B3/B4 Rescheduled'
                  )
                }
                className="rounded bg-slate-800 px-3 py-1.5 font-bold text-white disabled:opacity-50"
              >
                Submit
              </button>
            </fieldset>

            {/* B5 Close */}
            <fieldset disabled={bDisabled} className="rounded border border-slate-300 p-3 space-y-2">
              <legend className="px-1.5 text-xs font-bold">B5 TMS Close</legend>
              <div className="text-[11px] text-slate-600">
                Completed By ***: <strong>{currentEmp?.full_name || user?.name}</strong> | Date: {todayISO()} {nowTime()}
              </div>
              <textarea rows={2} value={b5Remarks} onChange={(e) => setB5Remarks(e.target.value)} placeholder="Remarks ***" className="w-full rounded border border-slate-300 p-1.5" />
              <input value={b5GmailTo} onChange={(e) => setB5GmailTo(e.target.value)} placeholder="Mail / Gmail to (comma-separated)..." className="w-full rounded border border-slate-300 p-1.5" />
              <textarea rows={2} value={b5MailBody} onChange={(e) => setB5MailBody(e.target.value)} placeholder="Mail Body: Enter your queries" className="w-full rounded border border-slate-300 p-1.5" />
              <input type="file" onChange={(e) => setB5File(e.target.files?.[0] || null)} className="w-full text-[10px]" />
              <button
                type="button"
                disabled={bDisabled}
                onClick={() =>
                  activeTask &&
                  runTaskPost(
                    `/tasks/${activeTask.id}/close`,
                    {
                      remarks: b5Remarks,
                      notify_emails: b5GmailTo.split(',').map((s) => s.trim()).filter(Boolean),
                      mail_body: b5MailBody,
                    },
                    b5File,
                    'B5 Closed / Sent for Approval'
                  )
                }
                className="rounded bg-emerald-700 px-3 py-1.5 font-bold text-white disabled:opacity-50"
              >
                Close
              </button>
            </fieldset>
          </div>
        </div>

        {/* SECTION C: Standalone Approval Details */}
        <div className={`space-y-3 rounded border border-slate-300 bg-white p-4 ${!isDetail ? 'opacity-60' : ''}`}>
          <div className="border-b border-slate-300 pb-2 text-sm font-black uppercase text-slate-800">
            Section : C Approval Details {isDetail ? `| ${activeTask.reference_no}` : ''}
          </div>
          <fieldset className="rounded border border-slate-300 p-3 space-y-2">
            <legend className="px-1.5 text-xs font-bold">C Approval</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-4 text-[11px]">
              <div>Reference No: <strong>{isDetail ? activeTask.reference_no : nextReferenceNo}</strong></div>
              <div>Task Detail: <strong>{isDetail ? activeTask.title : subject || '-'}</strong></div>
              <div>Date / Time: <strong>{todayISO()} {nowTime()}</strong></div>
              <div>Status: <strong className="uppercase">{isDetail ? activeTask.status : 'NEW'}</strong></div>
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <input
                disabled={!isDetail || activeTask?.status !== 'pending_approval'}
                value={cRemarks}
                onChange={(e) => setCRemarks(e.target.value)}
                placeholder="Approval remarks..."
                className="flex-1 rounded border border-slate-300 p-1.5 disabled:bg-slate-100"
              />
              <button
                type="button"
                disabled={!isDetail || activeTask?.status !== 'pending_approval' || submitting}
                onClick={() => activeTask && runTaskPost(`/tasks/${activeTask.id}/approve`, { decision: 'approve', remarks: cRemarks }, null, 'Section C Approved')}
                className="rounded bg-emerald-700 px-4 py-1.5 font-bold text-white disabled:opacity-50"
              >
                Approve
              </button>
              <button
                type="button"
                disabled={!isDetail || activeTask?.status !== 'pending_approval' || submitting}
                onClick={() => activeTask && runTaskPost(`/tasks/${activeTask.id}/approve`, { decision: 'return', remarks: cRemarks }, null, 'Returned to Assignee')}
                className="rounded bg-rose-700 px-4 py-1.5 font-bold text-white disabled:opacity-50"
              >
                Return
              </button>
            </div>
          </fieldset>
        </div>
        </div>
        );
      })()}

      {/* CLASSIC TABLE LIST */}
      {classicMode === 'list' && (
        <div className="overflow-x-auto rounded border border-slate-300 bg-white">
          <table className="w-full text-left text-[11px]">
            <thead className="bg-slate-800 text-white">
              <tr>
                <th className="px-3 py-2">Reference No</th>
                <th className="px-3 py-2">Subject / Task Detail</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2">Priority</th>
                <th className="px-3 py-2">Assignor</th>
                <th className="px-3 py-2">Assignee</th>
                <th className="px-3 py-2">Due Date/Time</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                Array.from({ length: 5 }).map((_, idx) => (
                  <tr key={`skel-${idx}`} className="animate-pulse">
                    <td className="px-3 py-2.5"><div className="h-3.5 w-28 rounded bg-slate-200" /></td>
                    <td className="px-3 py-2.5"><div className="h-3.5 w-48 rounded bg-slate-200" /></td>
                    <td className="px-3 py-2.5"><div className="h-3.5 w-16 rounded bg-slate-200" /></td>
                    <td className="px-3 py-2.5"><div className="h-3.5 w-14 rounded bg-slate-200" /></td>
                    <td className="px-3 py-2.5"><div className="h-3.5 w-24 rounded bg-slate-200" /></td>
                    <td className="px-3 py-2.5"><div className="h-3.5 w-24 rounded bg-slate-200" /></td>
                    <td className="px-3 py-2.5"><div className="h-3.5 w-24 rounded bg-slate-200" /></td>
                    <td className="px-3 py-2.5"><div className="h-3.5 w-20 rounded bg-slate-200" /></td>
                    <td className="px-3 py-2.5"><div className="h-6 w-12 rounded bg-slate-200" /></td>
                  </tr>
                ))
              ) : tasks.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-6 text-center text-slate-400">
                    No records found.
                  </td>
                </tr>
              ) : (
                tasks.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-mono font-bold">{t.reference_no}</td>
                    <td className="px-3 py-2 font-semibold">{t.title}</td>
                    <td className="px-3 py-2 uppercase">{t.category}</td>
                    <td className="px-3 py-2 uppercase">{t.priority}</td>
                    <td className="px-3 py-2">{t.assignor_name}</td>
                    <td className="px-3 py-2">{t.assignee_name}</td>
                    <td className="px-3 py-2">{t.due_at}</td>
                    <td className="px-3 py-2 uppercase font-bold">{t.status}</td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => onNavigateTask(t.id)}
                        className="rounded bg-blue-600 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-blue-700"
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

    </div>
  );
};
