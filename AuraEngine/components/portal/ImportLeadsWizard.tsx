import React, { useState, useRef, useCallback, useMemo } from 'react';
import { UploadIcon, CheckIcon, XIcon, AlertTriangleIcon } from '../Icons';
import {
  autoMapColumns,
  checkContactsCapacity,
  executeImport,
  CORE_FIELDS,
  type ColumnMapping,
  type DedupeStrategy,
  type ImportResult,
  type ContactsCapacity,
} from '../../lib/leadImporter';

// ── Props ───────────────────────────────────────────────────────────────────

interface ImportLeadsWizardProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  planName: string;
  onImportComplete: () => void;
}

// ── Types ───────────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3 | 4;

interface ParsedFile {
  fileName: string;
  fileType: string;
  headers: string[];
  rows: Record<string, string>[];
}

// ── Step labels ─────────────────────────────────────────────────────────────

const STEPS = [
  { num: 1, label: 'Upload' },
  { num: 2, label: 'Map Columns' },
  { num: 3, label: 'Options' },
  { num: 4, label: 'Results' },
] as const;

// ── Component ───────────────────────────────────────────────────────────────

const ImportLeadsWizard: React.FC<ImportLeadsWizardProps> = ({
  isOpen, onClose, userId, planName, onImportComplete,
}) => {
  const fileRef = useRef<HTMLInputElement>(null);

  // Wizard state
  const [step, setStep] = useState<Step>(1);
  const [parsedFile, setParsedFile] = useState<ParsedFile | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [dedupe, setDedupe] = useState<DedupeStrategy>('merge');
  const [capacity, setCapacity] = useState<ContactsCapacity | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');
  const [parseError, setParseError] = useState('');

  // ── Reset ──
  const reset = useCallback(() => {
    setStep(1);
    setParsedFile(null);
    setMapping({});
    setDedupe('merge');
    setCapacity(null);
    setImporting(false);
    setResult(null);
    setError('');
    setParseError('');
    if (fileRef.current) fileRef.current.value = '';
  }, []);

  // ── Parse file (CSV or XLSX) ──
  const handleFile = useCallback(async (file: File) => {
    setParseError('');
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';

    try {
      let headers: string[] = [];
      let rows: Record<string, string>[] = [];

      if (ext === 'csv') {
        const text = await file.text();
        const parsed = parseCSVText(text);
        headers = parsed.headers;
        rows = parsed.rows;
      } else if (ext === 'xlsx' || ext === 'xls') {
        const XLSX = await import('xlsx');
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
        if (json.length === 0) {
          setParseError('File is empty or has no data rows.');
          return;
        }
        headers = Object.keys(json[0]);
        rows = json.map(r => {
          const row: Record<string, string> = {};
          for (const k of headers) row[k] = String(r[k] ?? '');
          return row;
        });
      } else {
        setParseError('Unsupported file type. Please upload .csv, .xlsx, or .xls');
        return;
      }

      if (headers.length === 0 || rows.length === 0) {
        setParseError('No data rows found in file.');
        return;
      }

      const autoMap = autoMapColumns(headers);
      setParsedFile({ fileName: file.name, fileType: ext, headers, rows });
      setMapping(autoMap);
    } catch (e) {
      setParseError(`Failed to parse file: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  // ── Mapping helpers ──
  const updateMapping = useCallback((header: string, value: string) => {
    setMapping(prev => ({ ...prev, [header]: value as ColumnMapping[string] }));
  }, []);

  const assignedFields = useMemo(() => {
    const set = new Set<string>();
    for (const v of Object.values(mapping)) {
      if (v !== 'skip') set.add(v);
    }
    return set;
  }, [mapping]);

  const hasDuplicateTargets = useMemo(() => {
    const seen = new Set<string>();
    for (const v of Object.values(mapping)) {
      if (v === 'skip') continue;
      if (v.startsWith('custom:')) continue; // custom fields can repeat labels but are unique by name
      if (seen.has(v)) return true;
      seen.add(v);
    }
    return false;
  }, [mapping]);

  // ── Step navigation ──
  const goToStep2 = useCallback(() => {
    if (parsedFile) setStep(2);
  }, [parsedFile]);

  const goToStep3 = useCallback(async () => {
    setError('');
    try {
      const cap = await checkContactsCapacity(userId, planName);
      setCapacity(cap);
    } catch {
      // Non-blocking — show capacity as unknown
      setCapacity(null);
    }
    setStep(3);
  }, [userId, planName]);

  const goBack = useCallback(() => {
    setStep(prev => (prev > 1 ? (prev - 1) as Step : prev));
  }, []);

  // ── Execute import ──
  const runImport = useCallback(async () => {
    if (!parsedFile) return;
    setImporting(true);
    setError('');
    try {
      const res = await executeImport(
        userId,
        mapping,
        parsedFile.rows,
        { dedupe_strategy: dedupe, plan_name: planName },
        parsedFile.fileName,
        parsedFile.fileType,
      );
      setResult(res);
      setStep(4);
      onImportComplete();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  }, [parsedFile, mapping, dedupe, userId, planName, onImportComplete]);

  // ── Mapped count for summary ──
  const mappedCount = useMemo(() =>
    Object.values(mapping).filter(v => v !== 'skip').length,
  [mapping]);

  const rowCount = parsedFile?.rows.length ?? 0;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-md" onClick={() => !importing && (reset(), onClose())} />
      <div className="relative bg-white w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 max-h-[90vh] flex flex-col">

        {/* ── Header ── */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <UploadIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 font-heading">Import Leads</h2>
              <p className="text-xs text-slate-400">CSV, XLSX, or XLS files supported</p>
            </div>
          </div>
          <button
            onClick={() => { reset(); onClose(); }}
            disabled={importing}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* ── Step indicator ── */}
        <div className="px-6 py-3 bg-slate-50/80 border-b border-slate-100 flex items-center space-x-1 shrink-0">
          {STEPS.map((s, i) => (
            <React.Fragment key={s.num}>
              {i > 0 && <div className="flex-1 h-px bg-slate-200" />}
              <div className={`flex items-center space-x-1.5 px-2 py-1 rounded-lg text-xs font-bold transition-colors ${
                s.num === step ? 'bg-indigo-100 text-indigo-700' :
                s.num < step ? 'text-emerald-600' : 'text-slate-400'
              }`}>
                {s.num < step ? (
                  <CheckIcon className="w-3.5 h-3.5" />
                ) : (
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    s.num === step ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'
                  }`}>{s.num}</span>
                )}
                <span className="hidden sm:inline">{s.label}</span>
              </div>
            </React.Fragment>
          ))}
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-start space-x-2">
              <AlertTriangleIcon className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* ───────── Step 1: Upload ───────── */}
          {step === 1 && (
            <div className="space-y-4">
              <div
                className="border-2 border-dashed border-slate-200 rounded-xl p-10 text-center hover:border-indigo-300 transition-colors cursor-pointer"
                onClick={() => fileRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={handleDrop}
              >
                <UploadIcon className="w-10 h-10 mx-auto text-slate-300 mb-3" />
                <p className="text-sm font-semibold text-slate-600">
                  {parsedFile ? parsedFile.fileName : 'Drag & drop or click to upload'}
                </p>
                <p className="text-xs text-slate-400 mt-1">Supports .csv, .xlsx, .xls</p>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                  onChange={handleFileInput}
                />
              </div>

              {parseError && <p className="text-sm text-red-500 font-medium">{parseError}</p>}

              {parsedFile && (
                <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
                  <div className="flex items-center space-x-2">
                    <CheckIcon className="w-4 h-4 text-emerald-600" />
                    <span className="text-sm font-bold text-emerald-800">
                      {parsedFile.rows.length.toLocaleString()} rows &middot; {parsedFile.headers.length} columns detected
                    </span>
                  </div>
                  <button
                    onClick={() => { setParsedFile(null); setMapping({}); if (fileRef.current) fileRef.current.value = ''; }}
                    className="text-xs text-slate-400 hover:text-slate-600 font-medium"
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ───────── Step 2: Column Mapper ───────── */}
          {step === 2 && parsedFile && (
            <div className="space-y-4">
              {hasDuplicateTargets && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start space-x-2">
                  <AlertTriangleIcon className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                  <p className="text-sm text-amber-700">Multiple columns are mapped to the same field. Each core field should only be mapped once.</p>
                </div>
              )}

              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    <tr>
                      <th className="px-4 py-3">File Column</th>
                      <th className="px-4 py-3">Map To</th>
                      <th className="px-4 py-3">Preview</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {parsedFile.headers.map(header => {
                      const current = mapping[header] ?? 'skip';
                      const isAuto = autoMapColumns(parsedFile.headers)[header] === current && current !== 'skip';
                      const preview = parsedFile.rows.slice(0, 3).map(r => r[header]).filter(Boolean).join(', ');

                      return (
                        <tr key={header} className="hover:bg-slate-50/50">
                          <td className="px-4 py-2.5">
                            <div className="flex items-center space-x-2">
                              <span className="text-slate-800 font-medium text-xs">{header}</span>
                              {isAuto && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-700">
                                  Auto
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-2.5">
                            <select
                              value={current}
                              onChange={e => updateMapping(header, e.target.value)}
                              className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            >
                              <option value="skip">— Skip —</option>
                              <optgroup label="Core Fields">
                                {CORE_FIELDS.map(f => (
                                  <option
                                    key={f.value}
                                    value={f.value}
                                    disabled={assignedFields.has(f.value) && current !== f.value}
                                  >
                                    {f.label}{assignedFields.has(f.value) && current !== f.value ? ' (used)' : ''}
                                  </option>
                                ))}
                              </optgroup>
                              <optgroup label="Custom">
                                <option value={`custom:${header.toLowerCase().replace(/\s+/g, '_')}`}>
                                  Custom: {header}
                                </option>
                              </optgroup>
                            </select>
                          </td>
                          <td className="px-4 py-2.5 text-xs text-slate-400 truncate max-w-[200px]">
                            {preview || '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Preview of first 5 mapped rows */}
              {mappedCount > 0 && (
                <div>
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Mapped Data Preview (first 5 rows)</h4>
                  <div className="border border-slate-200 rounded-xl overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        <tr>
                          {Object.entries(mapping).filter(([, v]) => v !== 'skip').map(([h, field]) => (
                            <th key={h} className="px-3 py-2 whitespace-nowrap">
                              {CORE_FIELDS.find(f => f.value === field)?.label ?? field.replace('custom:', '')}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {parsedFile.rows.slice(0, 5).map((row, i) => (
                          <tr key={i} className="hover:bg-slate-50/50">
                            {Object.entries(mapping).filter(([, v]) => v !== 'skip').map(([h]) => (
                              <td key={h} className="px-3 py-1.5 text-slate-600 truncate max-w-[150px]">
                                {row[h] || '—'}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ───────── Step 3: Options ───────── */}
          {step === 3 && (
            <div className="space-y-5">
              {/* Capacity bar */}
              {capacity && (
                <div>
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Contact Capacity</h4>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                    <div className="flex items-center justify-between text-xs mb-2">
                      <span className="text-slate-600 font-medium">
                        {capacity.current.toLocaleString()} / {capacity.max.toLocaleString()} contacts used
                      </span>
                      <span className="font-bold text-slate-800">
                        {capacity.remaining.toLocaleString()} remaining
                      </span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all ${
                          capacity.remaining < rowCount ? 'bg-amber-500' :
                          capacity.current / capacity.max > 0.8 ? 'bg-amber-400' : 'bg-indigo-500'
                        }`}
                        style={{ width: `${Math.min(100, (capacity.current / capacity.max) * 100)}%` }}
                      />
                    </div>
                    {capacity.remaining < rowCount && (
                      <p className="text-xs text-amber-600 font-medium mt-2 flex items-center space-x-1">
                        <AlertTriangleIcon className="w-3.5 h-3.5" />
                        <span>
                          Only {capacity.remaining.toLocaleString()} slots available.
                          {rowCount - capacity.remaining > 0 && ` ${(rowCount - capacity.remaining).toLocaleString()} rows will be skipped.`}
                        </span>
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Dedupe strategy */}
              <div>
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Duplicate Handling</h4>
                <div className="space-y-2">
                  {([
                    { value: 'merge' as const, label: 'Merge', desc: 'Fill in blank fields on existing contacts. Existing data is preserved.' },
                    { value: 'overwrite' as const, label: 'Overwrite', desc: 'Replace existing data with imported values. Blanks in import are ignored.' },
                    { value: 'skip' as const, label: 'Skip Duplicates', desc: 'Do not modify existing contacts. Only import new ones.' },
                  ]).map(opt => (
                    <label
                      key={opt.value}
                      className={`flex items-start space-x-3 p-3 border rounded-xl cursor-pointer transition-colors ${
                        dedupe === opt.value
                          ? 'border-indigo-300 bg-indigo-50/50'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="dedupe"
                        value={opt.value}
                        checked={dedupe === opt.value}
                        onChange={() => setDedupe(opt.value)}
                        className="mt-0.5 accent-indigo-600"
                      />
                      <div>
                        <p className="text-sm font-bold text-slate-800">{opt.label}</p>
                        <p className="text-xs text-slate-500">{opt.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Summary */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Import Summary</h4>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-2xl font-bold text-slate-800">{rowCount.toLocaleString()}</p>
                    <p className="text-[10px] text-slate-500 font-medium">Total Rows</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-indigo-600">{mappedCount}</p>
                    <p className="text-[10px] text-slate-500 font-medium">Fields Mapped</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-slate-800">{parsedFile?.headers.length ?? 0}</p>
                    <p className="text-[10px] text-slate-500 font-medium">Total Columns</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ───────── Step 4: Results ───────── */}
          {step === 4 && result && (
            <div className="space-y-4">
              <div className="text-center py-4">
                <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <CheckIcon className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 font-heading">Import Complete</h3>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-emerald-700">{result.imported_count}</p>
                  <p className="text-[10px] text-emerald-600 font-bold uppercase">Imported</p>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-blue-700">{result.updated_count}</p>
                  <p className="text-[10px] text-blue-600 font-bold uppercase">Updated</p>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-slate-600">{result.skipped_count}</p>
                  <p className="text-[10px] text-slate-500 font-bold uppercase">Skipped</p>
                </div>
              </div>

              {/* Skipped rows detail */}
              {result.skipped_rows.length > 0 && (
                <SkippedRowsDetail rows={result.skipped_rows} />
              )}

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-500 text-center">
                Contacts: {result.contacts_before.toLocaleString()} → {result.contacts_after.toLocaleString()} / {result.plan_limit.toLocaleString()} limit
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between shrink-0">
          <div>
            {step > 1 && step < 4 && (
              <button
                onClick={goBack}
                disabled={importing}
                className="px-4 py-2 text-slate-600 font-semibold text-sm hover:text-slate-800 transition-colors disabled:opacity-50"
              >
                Back
              </button>
            )}
          </div>
          <div className="flex items-center space-x-3">
            {step < 4 && (
              <button
                onClick={() => { reset(); onClose(); }}
                disabled={importing}
                className="px-4 py-2 text-slate-600 font-semibold text-sm hover:text-slate-800 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            )}

            {step === 1 && (
              <button
                onClick={goToStep2}
                disabled={!parsedFile}
                className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-sm shadow-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Continue
              </button>
            )}

            {step === 2 && (
              <button
                onClick={goToStep3}
                disabled={mappedCount === 0 || hasDuplicateTargets}
                className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-sm shadow-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Continue
              </button>
            )}

            {step === 3 && (
              <button
                onClick={runImport}
                disabled={importing}
                className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-sm shadow-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {importing ? 'Importing...' : `Import ${rowCount.toLocaleString()} Rows`}
              </button>
            )}

            {step === 4 && (
              <button
                onClick={() => { reset(); onClose(); }}
                className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-sm shadow-lg hover:bg-indigo-700 transition-colors"
              >
                Done
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Skipped rows expandable detail ──────────────────────────────────────────

const SkippedRowsDetail: React.FC<{ rows: ImportResult['skipped_rows'] }> = ({ rows }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between bg-slate-50 hover:bg-slate-100 transition-colors"
      >
        <span className="text-xs font-bold text-slate-600">
          {rows.length} skipped row{rows.length !== 1 ? 's' : ''}
        </span>
        <svg className={`w-4 h-4 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {expanded && (
        <div className="max-h-48 overflow-y-auto divide-y divide-slate-50">
          {rows.map((r, i) => (
            <div key={i} className="px-4 py-2 flex items-center justify-between text-xs">
              <span className="text-slate-600">Row {r.row}</span>
              <span className={`px-2 py-0.5 rounded-md font-bold ${
                r.reason === 'duplicate' ? 'bg-blue-50 text-blue-600' :
                r.reason === 'plan_limit' ? 'bg-amber-50 text-amber-600' :
                'bg-slate-100 text-slate-500'
              }`}>
                {r.reason === 'duplicate' ? 'Duplicate' :
                 r.reason === 'plan_limit' ? 'Plan Limit' : r.reason}
              </span>
              {r.identifier && (
                <span className="text-slate-400 truncate max-w-[150px]">{r.identifier}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ── CSV parser (handles quoted fields) ──────────────────────────────────────

function parseCSVText(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { headers: [], rows: [] };

  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          current += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ',') {
          result.push(current.trim());
          current = '';
        } else {
          current += ch;
        }
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseLine(lines[0]);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cols = parseLine(lines[i]);
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = cols[j] ?? '';
    }
    rows.push(row);
  }

  return { headers, rows };
}

export default React.memo(ImportLeadsWizard);
