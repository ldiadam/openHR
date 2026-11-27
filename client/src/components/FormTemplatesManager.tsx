import React, { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  Upload,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { apiFetch, API_BASE, downloadFile, getToken } from '../api';
import { useLanguage } from '../context/LanguageContext';
import { previewSampleLeaveFormPdf } from '../utils/leaveFormPdf';
import {
  CLAIM_TEMPLATE_PLACEHOLDERS,
  ClaimColumnType,
  ClaimSheetColumn,
  ClaimSheetSignature,
  ClaimSheetTemplateConfig,
  ClaimSignatureSource,
  DEFAULT_CLAIM_SHEET_TEMPLATE,
  DEFAULT_LEAVE_FORM_TEMPLATE,
  FormTemplateMode,
  LeaveFormTemplateConfig,
  buildCurrencyNumberFormat,
  parseClaimSheetTemplate,
  parseLeaveFormTemplate,
} from '../../../shared/formTemplates';

const COLUMN_TYPE_LABELS: Record<ClaimColumnType, { id: string; en: string }> = {
  seq: { id: 'No. Urut', en: 'Row #' },
  date: { id: 'Tanggal', en: 'Date' },
  description: { id: 'Deskripsi', en: 'Description' },
  category_label: { id: 'Nama Kategori', en: 'Category Name' },
  category_bucket: { id: 'Kolom Kategori', en: 'Category Bucket' },
  unpaid_salary: { id: 'Unpaid / Gaji', en: 'Unpaid / Salary' },
  amount: { id: 'Nominal Tunggal', en: 'Single Amount' },
  row_total: { id: 'Total Baris', en: 'Row Total' },
  other_bucket: { id: 'Lainnya (Sisa)', en: 'Others Bucket' },
  cost_centre: { id: 'Cost Centre', en: 'Cost Centre' },
  project_ref: { id: 'Project Ref', en: 'Project Ref' },
  remarks: { id: 'Catatan', en: 'Remarks' },
};

export const FormTemplatesManager: React.FC = () => {
  const { tr } = useLanguage();
  const [subTab, setSubTab] = useState<'claim_sheet' | 'leave_form'>('claim_sheet');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [claimMode, setClaimMode] = useState<FormTemplateMode>('builder');
  const [claimConfig, setClaimConfig] = useState<ClaimSheetTemplateConfig>(structuredClone(DEFAULT_CLAIM_SHEET_TEMPLATE));
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [detectedPlaceholders, setDetectedPlaceholders] = useState<string[]>([]);
  const [detectedSheets, setDetectedSheets] = useState<string[]>([]);

  const [leaveConfig, setLeaveConfig] = useState<LeaveFormTemplateConfig>(structuredClone(DEFAULT_LEAVE_FORM_TEMPLATE));
  const [leaveMeta, setLeaveMeta] = useState<{ letterhead: any; departments: string[]; leaveTypes: string[] }>({
    letterhead: { name: 'Company Name', address: '', email: '', phone: '', regNo: '' },
    departments: [],
    leaveTypes: [],
  });

  const loadAll = async () => {
    setLoading(true);
    try {
      const [claimRes, leaveRes, leaveFormCfg] = await Promise.all([
        apiFetch('/templates/claim_sheet'),
        apiFetch('/templates/leave_form'),
        apiFetch('/leave/form/config').catch(() => null),
      ]);
      setClaimMode(claimRes.mode === 'custom_xlsx' ? 'custom_xlsx' : 'builder');
      setClaimConfig(parseClaimSheetTemplate(claimRes.config));
      setUploadedFileName(claimRes.fileName || null);
      setDetectedPlaceholders(claimRes.placeholders || []);
      setDetectedSheets(claimRes.sheets || []);

      setLeaveConfig(parseLeaveFormTemplate(leaveRes.config));
      if (leaveFormCfg) {
        setLeaveMeta({
          letterhead: leaveFormCfg.letterhead || { name: 'Company', address: '', email: '', phone: '', regNo: '' },
          departments: (leaveFormCfg.departments || []).map((d: any) => d.name),
          leaveTypes: (leaveFormCfg.leaveTypes || []).map((l: any) => l.name),
        });
      }
    } catch (err: any) {
      setBanner({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleSaveBuilder = async (key: 'claim_sheet' | 'leave_form') => {
    setSaving(true);
    setBanner(null);
    try {
      const payload = key === 'claim_sheet' ? claimConfig : leaveConfig;
      const res = await apiFetch(`/templates/${key}`, {
        method: 'PUT',
        body: JSON.stringify({ config: payload }),
      });
      if (key === 'claim_sheet') {
        setClaimMode('builder');
        setClaimConfig(parseClaimSheetTemplate(res.config));
      } else {
        setLeaveConfig(parseLeaveFormTemplate(res.config));
      }
      setBanner({ type: 'success', text: tr('Template berhasil disimpan.', 'Template saved successfully.') });
    } catch (err: any) {
      setBanner({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async (key: 'claim_sheet' | 'leave_form') => {
    if (!window.confirm(tr('Kembalikan template ini ke pengaturan awal?', 'Reset this template to system defaults?'))) return;
    setSaving(true);
    setBanner(null);
    try {
      const res = await apiFetch(`/templates/${key}/reset`, { method: 'POST' });
      if (key === 'claim_sheet') {
        setClaimMode('builder');
        setClaimConfig(parseClaimSheetTemplate(res.config));
        setUploadedFileName(null);
        setDetectedPlaceholders([]);
        setDetectedSheets([]);
      } else {
        setLeaveConfig(parseLeaveFormTemplate(res.config));
      }
      setBanner({ type: 'success', text: res.message || tr('Template direset.', 'Template reset.') });
    } catch (err: any) {
      setBanner({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleUploadXlsx = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setBanner(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await apiFetch('/templates/claim_sheet/upload', {
        method: 'POST',
        body: form,
      });
      setClaimMode('custom_xlsx');
      setUploadedFileName(res.fileName);
      setDetectedPlaceholders(res.placeholders || []);
      setDetectedSheets(res.sheets || []);
      setBanner({
        type: 'success',
        text: tr('Template Excel custom aktif untuk semua ekspor Claim Sheet.', 'Custom Excel template is now active for Claim Sheet exports.'),
      });
    } catch (err: any) {
      setBanner({ type: 'error', text: err.message });
    } finally {
      setUploading(false);
    }
  };

  const handlePreviewClaimExcel = async () => {
    setPreviewing(true);
    setBanner(null);
    try {
      const token = getToken();
      const response = await fetch(`${API_BASE}/templates/claim_sheet/preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          mode: claimMode,
          config: claimConfig,
        }),
      });
      if (!response.ok) {
        const err = (await response.json().catch(() => ({}))) as any;
        throw new Error(err.error || 'Preview failed');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Claim_Sheet_Preview.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setBanner({ type: 'error', text: err.message });
    } finally {
      setPreviewing(false);
    }
  };

  const handlePreviewLeavePdf = async () => {
    setPreviewing(true);
    try {
      await previewSampleLeaveFormPdf(leaveConfig, leaveMeta.letterhead, leaveMeta.departments, leaveMeta.leaveTypes);
    } catch (err: any) {
      setBanner({ type: 'error', text: err.message });
    } finally {
      setPreviewing(false);
    }
  };

  const moveColumn = (index: number, delta: -1 | 1) => {
    setClaimConfig((prev) => {
      const next = [...prev.columns];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...prev, columns: next };
    });
  };

  const updateColumn = (index: number, patch: Partial<ClaimSheetColumn>) => {
    setClaimConfig((prev) => ({
      ...prev,
      columns: prev.columns.map((c, idx) => (idx === index ? { ...c, ...patch } : c)),
    }));
  };

  const addCustomBucketColumn = () => {
    setClaimConfig((prev) => ({
      ...prev,
      columns: [
        ...prev.columns,
        {
          id: `col_custom_${Date.now().toString(36)}`,
          header: 'Custom',
          type: 'category_bucket',
          visible: true,
          width: 16,
          align: 'left',
          keywords: ['custom'],
        },
      ],
    }));
  };

  const removeColumn = (index: number) => {
    setClaimConfig((prev) => ({
      ...prev,
      columns: prev.columns.filter((_, idx) => idx !== index),
    }));
  };

  const updateSignature = (index: number, patch: Partial<ClaimSheetSignature>) => {
    setClaimConfig((prev) => ({
      ...prev,
      signatures: prev.signatures.map((s, idx) => (idx === index ? { ...s, ...patch } : s)),
    }));
  };

  const addSignature = () => {
    setClaimConfig((prev) => ({
      ...prev,
      signatures: [
        ...prev.signatures,
        { id: `sig_${Date.now().toString(36)}`, label: 'REVIEWED BY', source: 'custom', customName: '' },
      ],
    }));
  };

  const removeSignature = (index: number) => {
    setClaimConfig((prev) => ({
      ...prev,
      signatures: prev.signatures.filter((_, idx) => idx !== index),
    }));
  };

  const updateListItem = (
    field: 'adminClashFlags' | 'deptHeadFlags' | 'policyNotes',
    index: number,
    value: string
  ) => {
    setLeaveConfig((prev) => ({
      ...prev,
      [field]: prev[field].map((item, idx) => (idx === index ? value : item)),
    }));
  };

  const addListItem = (field: 'adminClashFlags' | 'deptHeadFlags' | 'policyNotes') => {
    setLeaveConfig((prev) => ({
      ...prev,
      [field]: [...prev[field], ''],
    }));
  };

  const removeListItem = (field: 'adminClashFlags' | 'deptHeadFlags' | 'policyNotes', index: number) => {
    setLeaveConfig((prev) => ({
      ...prev,
      [field]: prev[field].filter((_, idx) => idx !== index),
    }));
  };

  if (loading) {
    return (
      <div className="bg-white rounded-3xl border border-slate-200/80 p-8 text-center text-xs text-slate-400">
        {tr('Memuat template formulir...', 'Loading form templates...')}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-3xl border border-slate-200/80 shadow-2xs p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-black text-base text-slate-900">
            {tr('Desainer Format Formulir & Ekspor', 'Form & Export Template Studio')}
          </h2>
          <p className="text-xs text-slate-500">
            {tr(
              'Atur kolom, kategori, warna, tanda tangan, dan tata letak Claim Sheet Excel serta Leave Form PDF sesuai standar perusahaan Anda.',
              'Customize columns, categories, colors, signatures, and layout for Claim Sheet Excel and Leave Application PDF.'
            )}
          </p>
        </div>

        <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => {
              setSubTab('claim_sheet');
              setBanner(null);
            }}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
              subTab === 'claim_sheet' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileSpreadsheet size={14} />
            <span>Claim Sheet (.xlsx)</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setSubTab('leave_form');
              setBanner(null);
            }}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
              subTab === 'leave_form' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileText size={14} />
            <span>Leave Form (.pdf)</span>
          </button>
        </div>
      </div>

      {banner && (
        <div
          className={`flex items-center gap-2 rounded-2xl border p-3 text-xs font-medium ${
            banner.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-rose-200 bg-rose-50 text-rose-800'
          }`}
        >
          {banner.type === 'success' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
          <span className="flex-1">{banner.text}</span>
        </div>
      )}

      {/* ==================== CLAIM SHEET TAB ==================== */}
      {subTab === 'claim_sheet' && (
        <div className="space-y-5">
          {/* Mode selector */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setClaimMode('builder')}
              className={`text-left rounded-2xl border p-4 transition cursor-pointer ${
                claimMode === 'builder'
                  ? 'border-blue-500 bg-blue-50/70'
                  : 'border-slate-200 bg-slate-50/60 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-slate-900">
                  {tr('1. Visual Builder (Kolom & Gaya Dinamis)', '1. Visual Builder (Dynamic Columns & Style)')}
                </span>
                {claimMode === 'builder' && (
                  <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-bold text-white">
                    {tr('Aktif', 'Active')}
                  </span>
                )}
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                {tr(
                  'Ubah urutan kolom, nama header, pemetaan kategori, warna header/total, serta blok tanda tangan langsung dari web.',
                  'Reorder columns, rename headers, map expense categories, style colors, and customize signatures directly here.'
                )}
              </p>
            </button>

            <button
              type="button"
              onClick={() => setClaimMode('custom_xlsx')}
              className={`text-left rounded-2xl border p-4 transition cursor-pointer ${
                claimMode === 'custom_xlsx'
                  ? 'border-blue-500 bg-blue-50/70'
                  : 'border-slate-200 bg-slate-50/60 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-slate-900">
                  {tr('2. Unggah Template .xlsx Sendiri', '2. Upload Custom .xlsx Template')}
                </span>
                {claimMode === 'custom_xlsx' && (
                  <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-bold text-white">
                    {tr('Aktif', 'Active')}
                  </span>
                )}
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                {tr(
                  'Gunakan file Excel milik perusahaan dengan placeholder {{employee_name}}, {{#claims}}, {{amount}}, dll.',
                  'Upload your own styled Excel workbook with {{employee_name}}, {{#claims}}, {{amount}}, etc. placeholders.'
                )}
              </p>
            </button>
          </div>

          {claimMode === 'custom_xlsx' ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-bold text-slate-900">
                    {tr('File Template .xlsx Perusahaan', 'Company .xlsx Template File')}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {uploadedFileName
                      ? `${tr('Terpasang', 'Uploaded')}: ${uploadedFileName} (${detectedSheets.join(', ')})`
                      : tr('Belum ada file custom yang diunggah.', 'No custom .xlsx file uploaded yet.')}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => downloadFile('/templates/claim_sheet/starter-xlsx', 'Claim_Template_Starter.xlsx')}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
                  >
                    <Download size={14} />
                    <span>{tr('Unduh Starter .xlsx', 'Download Starter .xlsx')}</span>
                  </button>
                  <label className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800 cursor-pointer">
                    <Upload size={14} />
                    <span>{uploading ? tr('Mengunggah...', 'Uploading...') : tr('Unggah .xlsx', 'Upload .xlsx')}</span>
                    <input type="file" accept=".xlsx" onChange={handleUploadXlsx} className="hidden" />
                  </label>
                </div>
              </div>

              {detectedPlaceholders.length > 0 && (
                <div>
                  <div className="text-[11px] font-bold text-slate-700 mb-1.5">
                    {tr('Placeholder Terdeteksi di File Anda:', 'Detected Placeholders in Uploaded File:')}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {detectedPlaceholders.map((tok) => (
                      <span
                        key={tok}
                        className="rounded-lg bg-emerald-100 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-800"
                      >
                        {tok}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div className="text-[11px] font-bold text-slate-700 mb-1.5">
                  {tr('Daftar Placeholder yang Didukung:', 'Supported Placeholders:')}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {CLAIM_TEMPLATE_PLACEHOLDERS.map((tok) => (
                    <span
                      key={tok}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 font-mono text-[10px] text-slate-600"
                    >
                      {tok}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Header & Style */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
                <div className="text-xs font-bold text-slate-900">
                  {tr('Judul, Mata Uang & Warna', 'Header, Currency & Colors')}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                      {tr('Pola Judul Dokumen', 'Title Pattern')}
                    </label>
                    <input
                      type="text"
                      value={claimConfig.titlePattern}
                      onChange={(e) => setClaimConfig((p) => ({ ...p, titlePattern: e.target.value }))}
                      className="w-full rounded-xl border border-slate-300 bg-white p-2 text-xs font-semibold"
                    />
                    <div className="mt-1 flex flex-wrap gap-1">
                      {['{{company_name}}', '{{year}}', '{{month_name}}', '{{period_label}}', '{{employee_name}}'].map((tk) => (
                        <button
                          key={tk}
                          type="button"
                          onClick={() => setClaimConfig((p) => ({ ...p, titlePattern: `${p.titlePattern} ${tk}`.trim() }))}
                          className="rounded bg-slate-200/80 px-1.5 py-0.5 font-mono text-[10px] text-slate-700 hover:bg-slate-300 cursor-pointer"
                        >
                          +{tk}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                      {tr('Nama Sheet Utama', 'Main Sheet Name')}
                    </label>
                    <input
                      type="text"
                      value={claimConfig.sheetName}
                      onChange={(e) => setClaimConfig((p) => ({ ...p, sheetName: e.target.value }))}
                      className="w-full rounded-xl border border-slate-300 bg-white p-2 text-xs font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                      {tr('Subjudul (Baris 2)', 'Subtitle (Row 2)')}
                    </label>
                    <input
                      type="text"
                      value={claimConfig.subtitleLabel}
                      onChange={(e) => setClaimConfig((p) => ({ ...p, subtitleLabel: e.target.value }))}
                      className="w-full rounded-xl border border-slate-300 bg-white p-2 text-xs font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                      {tr('Label Mata Uang', 'Currency Label')}
                    </label>
                    <input
                      type="text"
                      value={claimConfig.currencyLabel}
                      onChange={(e) => setClaimConfig((p) => ({ ...p, currencyLabel: e.target.value }))}
                      className="w-full rounded-xl border border-slate-300 bg-white p-2 text-xs font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                      {tr('Simbol Mata Uang', 'Currency Symbol')}
                    </label>
                    <input
                      type="text"
                      value={claimConfig.currencySymbol}
                      onChange={(e) => {
                        const sym = e.target.value;
                        setClaimConfig((p) => ({
                          ...p,
                          currencySymbol: sym,
                          numberFormat: buildCurrencyNumberFormat(sym),
                        }));
                      }}
                      className="w-full rounded-xl border border-slate-300 bg-white p-2 text-xs font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                      {tr('Label Total Sum', 'Total Sum Label')}
                    </label>
                    <input
                      type="text"
                      value={claimConfig.totalSumLabel}
                      onChange={(e) => setClaimConfig((p) => ({ ...p, totalSumLabel: e.target.value }))}
                      className="w-full rounded-xl border border-slate-300 bg-white p-2 text-xs font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                      {tr('Label Grand Total', 'Grand Total Label')}
                    </label>
                    <input
                      type="text"
                      value={claimConfig.grandTotalLabel}
                      onChange={(e) => setClaimConfig((p) => ({ ...p, grandTotalLabel: e.target.value }))}
                      className="w-full rounded-xl border border-slate-300 bg-white p-2 text-xs font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                      {tr('Warna Latar Header/Total', 'Header & Total Fill')}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={`#${claimConfig.headerFillColor}`}
                        onChange={(e) => {
                          const hex = e.target.value.replace('#', '').toUpperCase();
                          setClaimConfig((p) => ({ ...p, headerFillColor: hex, totalFillColor: hex }));
                        }}
                        className="h-8 w-10 rounded border border-slate-300 cursor-pointer"
                      />
                      <span className="font-mono text-[11px] text-slate-600">#{claimConfig.headerFillColor}</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-4 pt-1 text-xs">
                  <label className="inline-flex items-center gap-2 font-semibold text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={claimConfig.includeSalaryRow}
                      onChange={(e) => setClaimConfig((p) => ({ ...p, includeSalaryRow: e.target.checked }))}
                    />
                    <span>{tr('Sertakan baris gaji (bila aktif)', 'Include Salary row (when enabled)')}</span>
                  </label>
                  <label className="inline-flex items-center gap-2 font-semibold text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={claimConfig.includeAttendanceSheet}
                      onChange={(e) => setClaimConfig((p) => ({ ...p, includeAttendanceSheet: e.target.checked }))}
                    />
                    <span>{tr('Sertakan sheet kedua (Attendance)', 'Include second sheet (Attendance)')}</span>
                  </label>
                </div>
              </div>

              {/* Dynamic Columns */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-slate-900">
                      {tr('Kolom Tabel & Pemetaan Kategori', 'Table Columns & Category Mapping')}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {tr(
                        'Atur urutan, tampilkan/sembunyikan, atau tambah kolom kategori baru.',
                        'Reorder, show/hide, rename headers, or add new category bucket columns.'
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={addCustomBucketColumn}
                    className="inline-flex items-center gap-1 rounded-xl bg-slate-900 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-slate-800 cursor-pointer"
                  >
                    <Plus size={13} />
                    <span>{tr('Tambah Kolom Kategori', 'Add Category Column')}</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {claimConfig.columns.map((col, idx) => (
                    <div
                      key={col.id}
                      className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center rounded-xl border border-slate-200 bg-white p-2.5 text-xs"
                    >
                      <div className="md:col-span-1 flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={col.visible}
                          onChange={(e) => updateColumn(idx, { visible: e.target.checked })}
                          title={tr('Tampilkan kolom', 'Show column')}
                        />
                        <button
                          type="button"
                          onClick={() => moveColumn(idx, -1)}
                          disabled={idx === 0}
                          className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                        >
                          <ArrowUp size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveColumn(idx, 1)}
                          disabled={idx === claimConfig.columns.length - 1}
                          className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                        >
                          <ArrowDown size={13} />
                        </button>
                      </div>
                      <div className="md:col-span-3">
                        <input
                          type="text"
                          value={col.header}
                          onChange={(e) => updateColumn(idx, { header: e.target.value })}
                          placeholder="Header"
                          className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs font-bold"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <select
                          value={col.type}
                          onChange={(e) => updateColumn(idx, { type: e.target.value as ClaimColumnType })}
                          className="w-full rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold"
                        >
                          {Object.entries(COLUMN_TYPE_LABELS).map(([k, lbl]) => (
                            <option key={k} value={k}>
                              {tr(lbl.id, lbl.en)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="md:col-span-1">
                        <input
                          type="number"
                          min={4}
                          max={80}
                          value={col.width}
                          onChange={(e) => updateColumn(idx, { width: Number(e.target.value) || 12 })}
                          title={tr('Lebar kolom', 'Column width')}
                          className="w-full rounded-lg border border-slate-200 px-2 py-1 text-[11px]"
                        />
                      </div>
                      <div className="md:col-span-4">
                        {(col.type === 'category_bucket' || col.type === 'unpaid_salary') ? (
                          <input
                            type="text"
                            value={(col.keywords || []).join(', ')}
                            onChange={(e) =>
                              updateColumn(idx, {
                                keywords: e.target.value
                                  .split(',')
                                  .map((s) => s.trim().toLowerCase())
                                  .filter(Boolean),
                              })
                            }
                            placeholder={tr('Kata kunci: transport, bensin, ...', 'Keywords: transport, fuel, ...')}
                            className="w-full rounded-lg border border-slate-200 px-2 py-1 text-[11px]"
                          />
                        ) : (
                          <span className="text-[10px] text-slate-400">
                            {tr('Otomatis dari data klaim', 'Auto-mapped from claim field')}
                          </span>
                        )}
                      </div>
                      <div className="md:col-span-1 flex justify-end">
                        {claimConfig.columns.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeColumn(idx)}
                            className="p-1 text-rose-500 hover:bg-rose-50 rounded cursor-pointer"
                            title={tr('Hapus kolom', 'Remove column')}
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Signatures */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-slate-900">
                    {tr('Baris Tanda Tangan (Footer)', 'Signature Lines (Footer)')}
                  </div>
                  <button
                    type="button"
                    onClick={addSignature}
                    className="inline-flex items-center gap-1 rounded-xl border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
                  >
                    <Plus size={12} />
                    <span>{tr('Tambah Baris', 'Add Line')}</span>
                  </button>
                </div>
                <div className="space-y-2">
                  {claimConfig.signatures.map((sig, idx) => (
                    <div key={sig.id} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                      <input
                        type="text"
                        value={sig.label}
                        onChange={(e) => updateSignature(idx, { label: e.target.value })}
                        className="sm:col-span-4 rounded-xl border border-slate-300 bg-white p-2 text-xs font-bold"
                        placeholder="PREPARED BY"
                      />
                      <select
                        value={sig.source}
                        onChange={(e) => updateSignature(idx, { source: e.target.value as ClaimSignatureSource })}
                        className="sm:col-span-4 rounded-xl border border-slate-300 bg-white p-2 text-xs font-semibold"
                      >
                        <option value="applicant">{tr('Nama Pemohon / Karyawan', 'Applicant / Employee Name')}</option>
                        <option value="manager">{tr('Atasan Langsung (Checked By)', 'Direct Manager (Checked By)')}</option>
                        <option value="director">{tr('Direktur / Penyetuju', 'Director / Approver')}</option>
                        <option value="custom">{tr('Teks Kustom', 'Custom Name')}</option>
                      </select>
                      {sig.source === 'custom' ? (
                        <input
                          type="text"
                          value={sig.customName || ''}
                          onChange={(e) => updateSignature(idx, { customName: e.target.value })}
                          placeholder={tr('Nama / jabatan...', 'Name / title...')}
                          className="sm:col-span-3 rounded-xl border border-slate-300 bg-white p-2 text-xs"
                        />
                      ) : (
                        <div className="sm:col-span-3 text-[11px] text-slate-400 px-2">
                          {tr('Diisi otomatis', 'Resolved automatically')}
                        </div>
                      )}
                      <div className="sm:col-span-1 flex justify-end">
                        <button
                          type="button"
                          onClick={() => removeSignature(idx)}
                          className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg cursor-pointer"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Action bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handlePreviewClaimExcel}
                disabled={previewing}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer disabled:opacity-50"
              >
                <Eye size={14} />
                <span>{previewing ? tr('Menyiapkan...', 'Generating...') : tr('Pratinjau Sample .xlsx', 'Preview Sample .xlsx')}</span>
              </button>
              <button
                type="button"
                onClick={() => handleReset('claim_sheet')}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 cursor-pointer disabled:opacity-50"
              >
                <RotateCcw size={14} />
                <span>{tr('Reset Default', 'Reset Default')}</span>
              </button>
            </div>
            {claimMode === 'builder' && (
              <button
                type="button"
                onClick={() => handleSaveBuilder('claim_sheet')}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-blue-700 cursor-pointer disabled:opacity-50"
              >
                <Save size={14} />
                <span>{saving ? tr('Menyimpan...', 'Saving...') : tr('Simpan Template Claim Sheet', 'Save Claim Sheet Template')}</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* ==================== LEAVE FORM TAB ==================== */}
      {subTab === 'leave_form' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-3 text-xs">
            <div className="text-xs font-bold text-slate-900">
              {tr('Tata Letak Halaman & Header', 'Page Layout & Header')}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                  {tr('Judul Formulir', 'Form Title')}
                </label>
                <input
                  type="text"
                  value={leaveConfig.formTitle}
                  onChange={(e) => setLeaveConfig((p) => ({ ...p, formTitle: e.target.value }))}
                  className="w-full rounded-xl border border-slate-300 bg-white p-2 text-xs font-semibold"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                  {tr('Ukuran Kertas', 'Paper Size')}
                </label>
                <select
                  value={leaveConfig.paperSize}
                  onChange={(e) => setLeaveConfig((p) => ({ ...p, paperSize: e.target.value === 'letter' ? 'letter' : 'a4' }))}
                  className="w-full rounded-xl border border-slate-300 bg-white p-2 text-xs font-semibold"
                >
                  <option value="a4">A4</option>
                  <option value="letter">Letter</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                  {tr('Warna Aksen', 'Accent Color')}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={leaveConfig.accentColor}
                    onChange={(e) => setLeaveConfig((p) => ({ ...p, accentColor: e.target.value.toUpperCase() }))}
                    className="h-8 w-10 rounded border border-slate-300 cursor-pointer"
                  />
                  <span className="font-mono text-[11px] text-slate-600">{leaveConfig.accentColor}</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                  {tr('Tampilan Departemen', 'Departments Display')}
                </label>
                <select
                  value={leaveConfig.departmentDisplay}
                  onChange={(e) => setLeaveConfig((p) => ({ ...p, departmentDisplay: e.target.value === 'text' ? 'text' : 'checkboxes' }))}
                  className="w-full rounded-xl border border-slate-300 bg-white p-2 text-xs font-semibold"
                >
                  <option value="checkboxes">{tr('Daftar Checkbox Semua Departemen', 'Checkbox Grid (All Departments)')}</option>
                  <option value="text">{tr('Teks Tunggal Departemen Pemohon', 'Single Text Value')}</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                  {tr('Tampilan Jenis Cuti', 'Leave Types Display')}
                </label>
                <select
                  value={leaveConfig.leaveTypeDisplay}
                  onChange={(e) => setLeaveConfig((p) => ({ ...p, leaveTypeDisplay: e.target.value === 'text' ? 'text' : 'checkboxes' }))}
                  className="w-full rounded-xl border border-slate-300 bg-white p-2 text-xs font-semibold"
                >
                  <option value="checkboxes">{tr('Daftar Checkbox Semua Jenis Cuti', 'Checkbox Grid (All Types)')}</option>
                  <option value="text">{tr('Teks Tunggal Jenis Cuti', 'Single Text Value')}</option>
                </select>
              </div>
              <div className="flex flex-wrap items-center gap-3 pt-4">
                <label className="inline-flex items-center gap-1.5 font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={leaveConfig.showLogo}
                    onChange={(e) => setLeaveConfig((p) => ({ ...p, showLogo: e.target.checked }))}
                  />
                  <span>{tr('Logo Kop', 'Show Logo')}</span>
                </label>
                <label className="inline-flex items-center gap-1.5 font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={leaveConfig.showRegNo}
                    onChange={(e) => setLeaveConfig((p) => ({ ...p, showRegNo: e.target.checked }))}
                  />
                  <span>{tr('No. Reg / NPWP', 'Show Reg No.')}</span>
                </label>
              </div>
            </div>
          </div>

          {/* Field Labels */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-3 text-xs">
            <div className="text-xs font-bold text-slate-900">
              {tr('Label Kolom Pemohon & Bagian Persetujuan', 'Applicant Field Labels & Approval Sections')}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                ['referenceLabel', tr('Label No. Referensi', 'Reference Label')],
                ['dateLabel', tr('Label Tanggal', 'Date Label')],
                ['applicantNameLabel', tr('Label Nama Pemohon', 'Applicant Name Label')],
                ['leaveFromLabel', tr('Label Dari Tanggal', 'Leave From Label')],
                ['leaveToLabel', tr('Label Sampai Tanggal', 'Leave To Label')],
                ['departmentLabel', tr('Label Departemen', 'Department Label')],
                ['leaveTypeLabel', tr('Label Jenis Cuti', 'Leave Type Label')],
                ['reasonLabel', tr('Label Alasan', 'Reason Label')],
                ['applicantSignatureLabel', tr('Label Tanda Tangan Pemohon', 'Applicant Signature Label')],
                ['adminSectionTitle', tr('Judul Bagian Persetujuan', 'Approval Section Heading')],
                ['approvedLabel', tr('Label Disetujui', 'Approved Label')],
                ['notApprovedLabel', tr('Label Ditolak', 'Not Approved Label')],
                ['managementHeading', tr('Judul Manajemen', 'Management Heading')],
                ['managementSignatureLabel', tr('Label Tanda Tangan Manajemen', 'Management Signature Label')],
                ['notesHeading', tr('Judul Catatan Kebijakan', 'Notes Heading')],
              ].map(([key, label]) => (
                <div key={key}>
                  <label className="block text-[10px] font-semibold text-slate-500 mb-1">{label}</label>
                  <input
                    type="text"
                    value={(leaveConfig as any)[key]}
                    onChange={(e) => setLeaveConfig((p) => ({ ...p, [key]: e.target.value }))}
                    className="w-full rounded-xl border border-slate-300 bg-white p-2 text-xs font-semibold"
                  />
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-4 pt-2">
              <label className="inline-flex items-center gap-2 font-semibold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={leaveConfig.showAdminCheck}
                  onChange={(e) => setLeaveConfig((p) => ({ ...p, showAdminCheck: e.target.checked }))}
                />
                <span>{tr('Tampilkan Bagian Admin Check', 'Show Administrative Check Section')}</span>
              </label>
              <label className="inline-flex items-center gap-2 font-semibold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={leaveConfig.showDeptHead}
                  onChange={(e) => setLeaveConfig((p) => ({ ...p, showDeptHead: e.target.checked }))}
                />
                <span>{tr('Tampilkan Bagian Department Head', 'Show Department Head Section')}</span>
              </label>
              <label className="inline-flex items-center gap-2 font-semibold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={leaveConfig.showManagement}
                  onChange={(e) => setLeaveConfig((p) => ({ ...p, showManagement: e.target.checked }))}
                />
                <span>{tr('Tampilkan Bagian Management', 'Show Management Section')}</span>
              </label>
            </div>
          </div>

          {/* Admin & Dept Head Checklist Flags */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900">
                  {tr('Checklist Pemeriksaan Admin', 'Admin Clash Checklist')}
                </span>
                <button
                  type="button"
                  onClick={() => addListItem('adminClashFlags')}
                  className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2 py-1 text-[10px] font-bold text-white cursor-pointer"
                >
                  <Plus size={12} /> {tr('Tambah', 'Add')}
                </button>
              </div>
              <input
                type="text"
                value={leaveConfig.adminCheckHeading}
                onChange={(e) => setLeaveConfig((p) => ({ ...p, adminCheckHeading: e.target.value }))}
                className="w-full rounded-xl border border-slate-300 bg-white p-2 text-xs font-bold"
              />
              <input
                type="text"
                value={leaveConfig.adminCheckPrompt}
                onChange={(e) => setLeaveConfig((p) => ({ ...p, adminCheckPrompt: e.target.value }))}
                className="w-full rounded-xl border border-slate-300 bg-white p-2 text-[11px]"
              />
              <div className="space-y-1.5">
                {leaveConfig.adminClashFlags.map((flag, idx) => (
                  <div key={idx} className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={flag}
                      onChange={(e) => updateListItem('adminClashFlags', idx, e.target.value)}
                      className="flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => removeListItem('adminClashFlags', idx)}
                      className="p-1.5 text-rose-500 hover:bg-rose-50 rounded cursor-pointer"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900">
                  {tr('Checklist Department Head', 'Dept Head Issue Checklist')}
                </span>
                <button
                  type="button"
                  onClick={() => addListItem('deptHeadFlags')}
                  className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2 py-1 text-[10px] font-bold text-white cursor-pointer"
                >
                  <Plus size={12} /> {tr('Tambah', 'Add')}
                </button>
              </div>
              <input
                type="text"
                value={leaveConfig.deptHeadHeading}
                onChange={(e) => setLeaveConfig((p) => ({ ...p, deptHeadHeading: e.target.value }))}
                className="w-full rounded-xl border border-slate-300 bg-white p-2 text-xs font-bold"
              />
              <input
                type="text"
                value={leaveConfig.deptHeadPrompt}
                onChange={(e) => setLeaveConfig((p) => ({ ...p, deptHeadPrompt: e.target.value }))}
                className="w-full rounded-xl border border-slate-300 bg-white p-2 text-[11px]"
              />
              <div className="space-y-1.5">
                {leaveConfig.deptHeadFlags.map((flag, idx) => (
                  <div key={idx} className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={flag}
                      onChange={(e) => updateListItem('deptHeadFlags', idx, e.target.value)}
                      className="flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => removeListItem('deptHeadFlags', idx)}
                      className="p-1.5 text-rose-500 hover:bg-rose-50 rounded cursor-pointer"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Policy Notes */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-2.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900">
                {tr('Catatan Kebijakan di Bagian Bawah Formulir', 'Footer Policy Notes')}
              </span>
              <button
                type="button"
                onClick={() => addListItem('policyNotes')}
                className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1 text-[10px] font-bold text-white cursor-pointer"
              >
                <Plus size={12} /> {tr('Tambah Catatan', 'Add Note')}
              </button>
            </div>
            <div className="space-y-1.5">
              {leaveConfig.policyNotes.map((note, idx) => (
                <div key={idx} className="flex items-center gap-1.5">
                  <span className="w-5 text-center font-bold text-slate-400">{idx + 1}.</span>
                  <input
                    type="text"
                    value={note}
                    onChange={(e) => updateListItem('policyNotes', idx, e.target.value)}
                    className="flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => removeListItem('policyNotes', idx)}
                    className="p-1.5 text-rose-500 hover:bg-rose-50 rounded cursor-pointer"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handlePreviewLeavePdf}
                disabled={previewing}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer disabled:opacity-50"
              >
                <Eye size={14} />
                <span>{previewing ? tr('Menyiapkan...', 'Generating...') : tr('Pratinjau Sample PDF', 'Preview Sample PDF')}</span>
              </button>
              <button
                type="button"
                onClick={() => handleReset('leave_form')}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 cursor-pointer disabled:opacity-50"
              >
                <RotateCcw size={14} />
                <span>{tr('Reset Default', 'Reset Default')}</span>
              </button>
            </div>
            <button
              type="button"
              onClick={() => handleSaveBuilder('leave_form')}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-blue-700 cursor-pointer disabled:opacity-50"
            >
              <Save size={14} />
              <span>{saving ? tr('Menyimpan...', 'Saving...') : tr('Simpan Template Leave Form', 'Save Leave Form Template')}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
