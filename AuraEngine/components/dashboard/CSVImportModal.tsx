import React, { useState, useRef } from 'react';
import { UploadIcon } from '../Icons';
import { supabase } from '../../lib/supabase';

interface CSVImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  onImportComplete: () => void;
}

interface CSVRow {
  name: string;
  email: string;
  company: string;
  insights: string;
}

const parseCSV = (text: string): CSVRow[] => {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
  const nameIdx = headers.findIndex(h => h === 'name' || h === 'full name' || h === 'fullname');
  const emailIdx = headers.findIndex(h => h === 'email' || h === 'work email' || h === 'email address');
  const companyIdx = headers.findIndex(h => h === 'company' || h === 'company name' || h === 'organization');
  const insightsIdx = headers.findIndex(h => h === 'insights' || h === 'notes' || h === 'description');

  if (nameIdx === -1 || emailIdx === -1) return [];

  const rows: CSVRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim().replace(/"/g, ''));
    if (cols.length > Math.max(nameIdx, emailIdx)) {
      const name = cols[nameIdx];
      const email = cols[emailIdx];
      if (name && email) {
        rows.push({
          name,
          email,
          company: companyIdx >= 0 ? cols[companyIdx] || '' : '',
          insights: insightsIdx >= 0 ? cols[insightsIdx] || '' : ''
        });
      }
    }
  }
  return rows;
};

const CSVImportModal: React.FC<CSVImportModalProps> = ({ isOpen, onClose, userId, onImportComplete }) => {
  const [parsedRows, setParsedRows] = useState<CSVRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: number; failed: number } | null>(null);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError('');
    setImportResult(null);
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = parseCSV(text);
      if (rows.length === 0) {
        setError('Could not parse CSV. Ensure it has "name" and "email" columns.');
        setParsedRows([]);
      } else {
        setParsedRows(rows);
      }
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (parsedRows.length === 0) return;

    setImporting(true);
    setError('');

    const leadsToInsert = parsedRows.map(row => ({
      client_id: userId,
      name: row.name,
      email: row.email,
      company: row.company,
      insights: row.insights || 'Imported via CSV',
      score: Math.floor(Math.random() * 40) + 50,
      status: 'New' as const,
      lastActivity: 'Imported'
    }));

    const { data, error: insertErr } = await supabase
      .from('leads')
      .insert(leadsToInsert)
      .select();

    if (insertErr) {
      setError(insertErr.message);
      setImporting(false);
      return;
    }

    const successCount = data?.length || 0;
    setImportResult({ success: successCount, failed: parsedRows.length - successCount });

    await supabase.from('audit_logs').insert({
      user_id: userId,
      action: 'CSV_IMPORT',
      details: `Imported ${successCount} leads from ${fileName}`
    });

    setImporting(false);
    onImportComplete();
  };

  const handleReset = () => {
    setParsedRows([]);
    setFileName('');
    setImportResult(null);
    setError('');
    if (fileRef.current) fileRef.current.value = '';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-md" onClick={() => !importing && onClose()}></div>
      <div className="relative bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <UploadIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 font-heading">Import Leads from CSV</h2>
              <p className="text-xs text-slate-400">Upload a CSV file with name, email, company, and insights columns</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={importing}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-4">
          {!importResult ? (
            <>
              <div
                className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center hover:border-indigo-300 transition-colors cursor-pointer"
                onClick={() => fileRef.current?.click()}
              >
                <UploadIcon className="w-8 h-8 mx-auto text-slate-300 mb-3" />
                <p className="text-sm font-semibold text-slate-600">
                  {fileName || 'Click to upload CSV file'}
                </p>
                <p className="text-xs text-slate-400 mt-1">Required columns: name, email. Optional: company, insights</p>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>

              {error && (
                <p className="text-sm text-red-500 font-medium">{error}</p>
              )}

              {parsedRows.length > 0 && (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-slate-700">{parsedRows.length} leads ready to import</p>
                    <button onClick={handleReset} className="text-xs text-slate-400 hover:text-slate-600 font-medium">Clear</button>
                  </div>
                  <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-widest sticky top-0">
                        <tr>
                          <th className="px-4 py-3">Name</th>
                          <th className="px-4 py-3">Email</th>
                          <th className="px-4 py-3">Company</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {parsedRows.slice(0, 50).map((row, i) => (
                          <tr key={i} className="hover:bg-slate-50/50">
                            <td className="px-4 py-2 text-slate-800 font-medium">{row.name}</td>
                            <td className="px-4 py-2 text-slate-500">{row.email}</td>
                            <td className="px-4 py-2 text-slate-500">{row.company}</td>
                          </tr>
                        ))}
                        {parsedRows.length > 50 && (
                          <tr>
                            <td colSpan={3} className="px-4 py-2 text-center text-xs text-slate-400 italic">
                              ...and {parsedRows.length - 50} more
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-slate-900 font-heading">Import Complete</h3>
              <p className="text-sm text-slate-500 mt-1">{importResult.success} leads imported successfully{importResult.failed > 0 ? `, ${importResult.failed} failed` : ''}.</p>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-slate-100 flex items-center justify-end space-x-3">
          {importResult ? (
            <button
              onClick={() => { handleReset(); onClose(); }}
              className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-sm shadow-lg hover:bg-indigo-700 transition-colors"
            >
              Done
            </button>
          ) : (
            <>
              <button
                onClick={onClose}
                disabled={importing}
                className="px-4 py-2 text-slate-600 font-semibold text-sm hover:text-slate-800 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={parsedRows.length === 0 || importing}
                className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-sm shadow-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {importing ? 'Importing...' : `Import ${parsedRows.length} Leads`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default React.memo(CSVImportModal);
