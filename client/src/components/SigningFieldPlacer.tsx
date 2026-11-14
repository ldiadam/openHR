import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Trash2, AlertTriangle, Check, CheckCircle2, Clock, Plus } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

/**
 * Drag-to-place signing fields on a PDF/DOCX page.
 *
 * Coordinates are stored normalized (0..1, origin top-left) so the same value
 * works regardless of the rendered pixel size. The API converts the 1-based page
 * shown here into DocuSeal's 0-based page and into its `areas` field shape.
 */

/** Roles are free-form labels; these are only the suggested built-ins. */
export const SUGGESTED_ROLES = ['Employee', 'Manager', 'HR'] as const;

export type PlacementRole = string;

export const PLACEMENT_FIELD_TYPES = [
  'signature',
  'initials',
  'date',
  'datenow',
  'text',
  'checkbox',
  'stamp',
] as const;

export type PlacementFieldType = (typeof PLACEMENT_FIELD_TYPES)[number];

export interface PlacedField {
  id: string;
  name: string;
  type: PlacementFieldType;
  role: PlacementRole;
  required: boolean;
  /** 1-based page, as shown in the UI. */
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface SigningFieldPlacerProps {
  file: File | null;
  fields: PlacedField[];
  onChange: (fields: PlacedField[]) => void;
  /** Roles the document will actually be sent to. Defaults to the built-ins. */
  roles?: string[];
}

const KNOWN_ROLE_STYLES: Record<string, { box: string; chip: string }> = {
  Employee: { box: 'border-blue-500 bg-blue-500/15 text-blue-900', chip: 'bg-blue-100 text-blue-800' },
  Manager: { box: 'border-emerald-500 bg-emerald-500/15 text-emerald-900', chip: 'bg-emerald-100 text-emerald-800' },
  HR: { box: 'border-purple-500 bg-purple-500/15 text-purple-900', chip: 'bg-purple-100 text-purple-800' },
};

/** Extra colours so arbitrary roles (guest, auditor, notary…) stay distinguishable. */
const EXTRA_ROLE_STYLES = [
  { box: 'border-amber-500 bg-amber-500/15 text-amber-900', chip: 'bg-amber-100 text-amber-800' },
  { box: 'border-rose-500 bg-rose-500/15 text-rose-900', chip: 'bg-rose-100 text-rose-800' },
  { box: 'border-teal-500 bg-teal-500/15 text-teal-900', chip: 'bg-teal-100 text-teal-800' },
  { box: 'border-indigo-500 bg-indigo-500/15 text-indigo-900', chip: 'bg-indigo-100 text-indigo-800' },
  { box: 'border-cyan-500 bg-cyan-500/15 text-cyan-900', chip: 'bg-cyan-100 text-cyan-800' },
];

const roleStyle = (role: string) => {
  const known = KNOWN_ROLE_STYLES[role];
  if (known) return known;
  let hash = 0;
  for (let i = 0; i < role.length; i++) hash = (hash * 31 + role.charCodeAt(i)) >>> 0;
  return EXTRA_ROLE_STYLES[hash % EXTRA_ROLE_STYLES.length];
};

const MIN_SIZE = 0.03;

export const SigningFieldPlacer: React.FC<SigningFieldPlacerProps> = ({ file, fields, onChange, roles }) => {
  const { tr } = useLanguage();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pageWrapRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ id: string; mode: 'move' | 'resize'; startX: number; startY: number; origin: PlacedField } | null>(null);

  const [pdf, setPdf] = useState<any>(null);
  const [pageCount, setPageCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [draftRole, setDraftRole] = useState<PlacementRole>(roles?.[0] || 'Employee');
  const [draftType, setDraftType] = useState<PlacementFieldType>('signature');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPdf(null);
    setPageCount(0);
    setPage(1);
    setError(null);

    if (!file) return;

    // DOCX cannot be rendered in the browser without a converter; placement is
    // only meaningful for PDFs in this app.
    if (!/\.pdf$/i.test(file.name)) {
      setError(
        tr(
          'Pratinjau hanya tersedia untuk PDF. Dokumen DOCX memakai tag {{Signature;role=Employee}} di dalam file.',
          'Preview is only available for PDF. DOCX documents use {{Signature;role=Employee}} tags inside the file.'
        )
      );
      return;
    }

    setLoading(true);
    (async () => {
      try {
        const pdfjs: any = await import('pdfjs-dist');
        // Worker is served as a static asset to keep the main bundle small.
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

        const buffer = await file.arrayBuffer();
        const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
        if (cancelled) return;
        setPdf(doc);
        setPageCount(doc.numPages);
      } catch (err: any) {
        if (!cancelled) {
          setError(
            tr('Gagal memuat PDF: ', 'Failed to load PDF: ') + (err?.message || String(err))
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [file, tr]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!pdf || !canvasRef.current) return;
      try {
        const pdfPage = await pdf.getPage(page);
        if (cancelled) return;

        const viewport = pdfPage.getViewport({ scale: 1 });
        const maxWidth = Math.min(720, pageWrapRef.current?.clientWidth || 720);
        const scale = maxWidth / viewport.width;
        const scaled = pdfPage.getViewport({ scale });

        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');
        if (!context) return;

        canvas.width = scaled.width;
        canvas.height = scaled.height;
        canvas.style.width = '100%';
        canvas.style.height = 'auto';

        await pdfPage.render({ canvasContext: context, viewport: scaled }).promise;
      } catch {
        // Rendering errors surface through the load error state above.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pdf, page]);

  const pageFields = useMemo(() => fields.filter((field) => field.page === page), [fields, page]);

  const clamp = (value: number) => Math.min(1, Math.max(0, value));

  const toNormalized = useCallback(
    (clientX: number, clientY: number) => {
      const rect = pageWrapRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
      return {
        x: clamp((clientX - rect.left) / rect.width),
        y: clamp((clientY - rect.top) / rect.height),
      };
    },
    []
  );

  const addFieldAt = (clientX: number, clientY: number) => {
    const { x, y } = toNormalized(clientX, clientY);
    const w = draftType === 'signature' || draftType === 'stamp' ? 0.24 : 0.15;
    const h = draftType === 'signature' || draftType === 'stamp' ? 0.06 : 0.04;

    const field: PlacedField = {
      id: `fld-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: `${draftRole} ${draftType}`,
      type: draftType,
      role: draftRole,
      required: true,
      page,
      x: clamp(x - w / 2),
      y: clamp(y - h / 2),
      w,
      h,
    };

    onChange([...fields, field]);
    setSelectedId(field.id);
  };

  const updateField = (id: string, patch: Partial<PlacedField>) => {
    onChange(fields.map((field) => (field.id === id ? { ...field, ...patch } : field)));
  };

  const removeField = (id: string) => {
    onChange(fields.filter((field) => field.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const beginDrag = (
    event: React.PointerEvent,
    field: PlacedField,
    mode: 'move' | 'resize'
  ) => {
    event.stopPropagation();
    event.preventDefault();
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
    setSelectedId(field.id);
    dragRef.current = {
      id: field.id,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      origin: field,
    };
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    const rect = pageWrapRef.current?.getBoundingClientRect();
    if (!drag || !rect || rect.width === 0 || rect.height === 0) return;

    const dx = (event.clientX - drag.startX) / rect.width;
    const dy = (event.clientY - drag.startY) / rect.height;

    if (drag.mode === 'move') {
      updateField(drag.id, {
        x: clamp(drag.origin.x + dx),
        y: clamp(drag.origin.y + dy),
      });
    } else {
      updateField(drag.id, {
        w: clamp(Math.max(MIN_SIZE, drag.origin.w + dx)),
        h: clamp(Math.max(MIN_SIZE, drag.origin.h + dy)),
      });
    }
  };

  const endDrag = () => {
    dragRef.current = null;
  };

  // Keep the draft role pointing at a signer that still exists.
  useEffect(() => {
    if (!roles || roles.length === 0) return;
    if (!roles.includes(draftRole)) setDraftRole(roles[0]);
  }, [roles, draftRole]);

  const selected = fields.find((field) => field.id === selectedId) || null;

  // Offer the signer roles first, then any role already used on the document.
  const availableRoles = useMemo(() => {
    const set = new Set<string>(roles && roles.length > 0 ? roles : [...SUGGESTED_ROLES]);
    for (const field of fields) set.add(field.role);
    return Array.from(set).filter(Boolean);
  }, [roles, fields]);

  // Roles the operator still has to place at least one field for.
  const missingRoles = useMemo(
    () => (roles || []).filter((role) => !fields.some((field) => field.role === role)),
    [roles, fields]
  );

  return (
    <div className="space-y-3">
      {/* Step 1 — who signs here. Role is chosen with taps, never typed. */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-[11px]">
        <div className="mb-1.5 font-bold uppercase tracking-wide text-slate-500">
          {tr('Buat field untuk', 'Place a field for')}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {availableRoles.map((role) => {
            const active = draftRole === role;
            return (
              <button
                key={role}
                type="button"
                onClick={() => setDraftRole(role)}
                aria-pressed={active}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-bold transition ${
                  active
                    ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                    : `border-slate-200 bg-white hover:border-slate-400 ${roleStyle(role).chip}`
                }`}
              >
                {active && <Check size={11} />}
                {role}
              </button>
            );
          })}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-2">
          <label className="font-semibold text-slate-500">{tr('Jenis', 'Type')}</label>
          <select
            value={draftType}
            onChange={(e) => setDraftType(e.target.value as PlacementFieldType)}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1 font-semibold text-slate-700"
          >
            {PLACEMENT_FIELD_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <span className="ml-auto text-[10px] text-slate-400">
            {tr('Klik dokumen untuk menaruh', 'Click the document to place')}
          </span>
        </div>
      </div>

      {!file && (
        <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-[11px] text-slate-400">
          {tr('Pilih file PDF terlebih dahulu untuk menempatkan field.', 'Choose a PDF file first to place fields.')}
        </p>
      )}

      {file && loading && (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 p-10 text-[11px] text-slate-500">
          <Loader2 size={16} className="animate-spin" />
          {tr('Memuat pratinjau...', 'Loading preview...')}
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-800">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {file && !loading && !error && pdf && (
        <>
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-slate-300 px-2 py-1 font-bold disabled:opacity-40"
              >
                ‹
              </button>
              <span className="font-semibold text-slate-600">
                {tr('Halaman', 'Page')} {page} / {pageCount}
              </span>
              <button
                type="button"
                disabled={page >= pageCount}
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                className="rounded-lg border border-slate-300 px-2 py-1 font-bold disabled:opacity-40"
              >
                ›
              </button>
            </div>
            <span className="text-slate-400">
              {fields.length} {tr('field ditempatkan', 'fields placed')}
            </span>
          </div>

          <div
            ref={pageWrapRef}
            className="relative mx-auto w-full max-w-[720px] select-none overflow-hidden rounded-lg border border-slate-300 bg-white"
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerLeave={endDrag}
            onClick={(event) => {
              // Ignore clicks that land on an existing field box.
              if ((event.target as HTMLElement).closest('[data-field-box]')) return;
              addFieldAt(event.clientX, event.clientY);
            }}
          >
            <canvas ref={canvasRef} className="block w-full" />

            {pageFields.map((field) => {
              const style = roleStyle(field.role);
              return (
                <div
                  key={field.id}
                  data-field-box
                  onPointerDown={(event) => beginDrag(event, field, 'move')}
                  className={`absolute flex cursor-move items-center justify-center overflow-hidden rounded border-2 text-[9px] font-bold ${style.box} ${
                    selectedId === field.id ? 'ring-2 ring-offset-1 ring-slate-900' : ''
                  }`}
                  style={{
                    left: `${field.x * 100}%`,
                    top: `${field.y * 100}%`,
                    width: `${field.w * 100}%`,
                    height: `${field.h * 100}%`,
                  }}
                  title={`${field.role} · ${field.type}`}
                >
                  <span className="pointer-events-none truncate px-1">
                    {field.role} {field.type}
                  </span>
                  <span
                    onPointerDown={(event) => beginDrag(event, field, 'resize')}
                    className="absolute bottom-0 right-0 h-2.5 w-2.5 cursor-se-resize rounded-tl bg-slate-900/70"
                  />
                </div>
              );
            })}
          </div>

          {selected && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-900/15 bg-slate-50 p-2.5 text-[11px]">
              <span className="font-bold text-slate-700">{tr('Field terpilih:', 'Selected field:')}</span>
              <select
                value={selected.role}
                onChange={(e) => updateField(selected.id, { role: e.target.value })}
                className="rounded-lg border border-slate-300 px-2 py-1 font-semibold"
              >
                {availableRoles.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
                {!availableRoles.includes(selected.role) && (
                  <option value={selected.role}>{selected.role}</option>
                )}
              </select>
              <select
                value={selected.type}
                onChange={(e) => updateField(selected.id, { type: e.target.value as PlacementFieldType })}
                className="rounded-lg border border-slate-300 px-2 py-1 font-semibold"
              >
                {PLACEMENT_FIELD_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-1 font-medium text-slate-600">
                <input
                  type="checkbox"
                  checked={selected.required}
                  onChange={(e) => updateField(selected.id, { required: e.target.checked })}
                />
                {tr('Wajib', 'Required')}
              </label>
              <button
                type="button"
                onClick={() => removeField(selected.id)}
                className="ml-auto inline-flex items-center gap-1 rounded-lg bg-rose-50 px-2 py-1 font-bold text-rose-700 hover:bg-rose-100"
              >
                <Trash2 size={11} /> {tr('Hapus', 'Remove')}
              </button>
            </div>
          )}
        </>
      )}

      {/* Step 2 — per-signer status, so nobody has to count boxes. */}
      {roles && roles.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-2.5">
          <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
            {missingRoles.length === 0 ? (
              <CheckCircle2 size={12} className="text-emerald-600" />
            ) : (
              <Clock size={12} className="text-amber-600" />
            )}
            {missingRoles.length === 0
              ? tr('Semua penandatangan punya field', 'Every signer has a field')
              : tr(
                  `${missingRoles.length} penandatangan belum punya field`,
                  `${missingRoles.length} signer(s) still need a field`
                )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {roles.map((role) => {
              const count = fields.filter((field) => field.role === role).length;
              return (
                <button
                  key={role}
                  type="button"
                  onClick={() => {
                    const first = fields.find((field) => field.role === role);
                    if (first) {
                      setPage(first.page);
                      setSelectedId(first.id);
                    } else {
                      setDraftRole(role);
                    }
                  }}
                  className={`inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-bold transition ${
                    count > 0
                      ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                      : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                  }`}
                >
                  {count > 0 ? <Check size={11} /> : <Plus size={11} />}
                  {role}
                  <span className="opacity-60">{count > 0 ? count : tr('0', '0')}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
