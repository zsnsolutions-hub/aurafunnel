import React from 'react';
import {
  ArrowLeftIcon, ArrowRightIcon, SendIcon, ShieldIcon, CheckIcon,
  XIcon, AlertTriangleIcon, BoltIcon, CalendarIcon, UsersIcon,
  BellIcon, EyeIcon, ActivityIcon, EditIcon, RefreshIcon, PlayIcon,
} from '../Icons';
import type { Lead } from '../../types';
import type { TestResult, ValidationItem, ActivationMode } from './types';
import type { BatchEmailSummary } from '../../lib/emailTracking';

interface WizardStep4Props {
  leads: Lead[];
  testLeadIds: Set<string>;
  selectedLeadCount: number;
  allFilteredSelected: boolean;
  emailSummaryMap: Map<string, BatchEmailSummary>;
  testRunning: boolean;
  testResults: TestResult | null;
  validations: ValidationItem[];
  validating: boolean;
  activationMode: ActivationMode;
  scheduleDate: string;
  scheduleTime: string;
  segmentFilter: string;
  monitorAlerts: boolean;
  onBack: () => void;
  onToggleLead: (id: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onTest: () => void;
  onValidate: () => void;
  onSave: () => void;
  onActivate: () => void;
  onActivationModeChange: (mode: ActivationMode) => void;
  onScheduleDateChange: (v: string) => void;
  onScheduleTimeChange: (v: string) => void;
  onSegmentFilterChange: (v: string) => void;
  onMonitorAlertsChange: (v: boolean) => void;
}

export const WizardStep4: React.FC<WizardStep4Props> = ({
  leads,
  testLeadIds,
  selectedLeadCount,
  allFilteredSelected,
  emailSummaryMap,
  testRunning,
  testResults,
  validations,
  validating,
  activationMode,
  scheduleDate,
  scheduleTime,
  segmentFilter,
  monitorAlerts,
  onBack,
  onToggleLead,
  onSelectAll,
  onDeselectAll,
  onTest,
  onValidate,
  onSave,
  onActivate,
  onActivationModeChange,
  onScheduleDateChange,
  onScheduleTimeChange,
  onSegmentFilterChange,
  onMonitorAlertsChange,
}) => (
  <div className="space-y-5">
    {/* Navigation */}
    <div className="flex items-center justify-between">
      <button onClick={onBack} className="flex items-center space-x-1.5 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all shadow-sm">
        <ArrowLeftIcon className="w-3.5 h-3.5" /><span>Back to Configure</span>
      </button>
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* ─── Test Panel ─── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
        <div className="px-6 py-5 border-b border-slate-100">
          <h3 className="font-black text-slate-900 font-heading">Send Campaign</h3>
          <p className="text-xs text-slate-400 mt-1">Select leads and send your campaign.</p>
        </div>
        <div className="px-6 py-5 space-y-4">
          {/* Select Test Leads */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-black text-slate-500 uppercase tracking-wider">Select Recipients</p>
              {leads.length > 0 && (
                <button
                  onClick={allFilteredSelected ? onDeselectAll : onSelectAll}
                  className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700"
                >
                  {allFilteredSelected ? 'Deselect All' : `Select All (${leads.length})`}
                </button>
              )}
            </div>
            {selectedLeadCount > 0 && (
              <p className="text-[10px] text-sky-600 font-bold mb-2">{selectedLeadCount} lead{selectedLeadCount !== 1 ? 's' : ''} selected</p>
            )}
            <div className="max-h-48 overflow-y-auto space-y-1.5 border border-slate-200 rounded-xl p-3">
              {leads.length > 0 ? leads.map(lead => (
                <label key={lead.id} className={`flex items-center space-x-2 cursor-pointer px-2 py-1.5 rounded-lg transition-colors ${testLeadIds.has(lead.id) ? 'bg-sky-50' : 'hover:bg-slate-50'}`}>
                  <input type="checkbox" checked={testLeadIds.has(lead.id)} onChange={() => onToggleLead(lead.id)} className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                  <span className="text-sm text-slate-700 flex-1 truncate">{lead.name}</span>
                  {!lead.email && <span className="text-[9px] font-black text-rose-500">NO EMAIL</span>}
                  {emailSummaryMap.get(lead.id)?.hasSent && <span className="text-[9px] font-black text-amber-600">EMAILED</span>}
                  <span className="text-xs text-slate-400">Score: {lead.score}</span>
                </label>
              )) : (
                <p className="text-xs text-slate-400 italic">No leads available. Add leads in the Lead Management page first.</p>
              )}
            </div>
          </div>

          {/* Test Actions */}
          <div className="flex items-center space-x-2">
            <button onClick={onTest} disabled={testRunning} className="flex-1 flex items-center justify-center space-x-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 disabled:opacity-50">
              {testRunning ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <SendIcon className="w-4 h-4" />}
              <span>{testRunning ? 'Sending...' : 'Send Campaign'}</span>
            </button>
            <button onClick={onValidate} disabled={validating} className="flex items-center justify-center space-x-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl text-sm font-bold hover:bg-slate-50 transition-all disabled:opacity-50">
              {validating ? <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin"></div> : <ShieldIcon className="w-4 h-4" />}
              <span>Validate</span>
            </button>
          </div>

          {/* Test Results */}
          {testResults && (
            <div className={`p-4 rounded-xl border ${testResults.passed ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
              <div className="flex items-center space-x-2 mb-3">
                {testResults.passed ? <CheckIcon className="w-5 h-5 text-emerald-600" /> : <AlertTriangleIcon className="w-5 h-5 text-rose-600" />}
                <p className={`text-sm font-black ${testResults.passed ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {testResults.passed ? 'Test Passed' : 'Issues Found'}
                </p>
                <span className="text-xs text-slate-500">
                  {testResults.stepsRun}/{testResults.stepsTotal} steps completed for &ldquo;{testResults.leadName}&rdquo; (Score: {testResults.leadScore})
                </span>
              </div>
              <div className="space-y-1">
                {testResults.details.map((d, i) => (
                  <div key={i} className="flex items-center space-x-2 text-xs">
                    {d.status === 'pass' && <CheckIcon className="w-3 h-3 text-emerald-500 shrink-0" />}
                    {d.status === 'fail' && <XIcon className="w-3 h-3 text-rose-500 shrink-0" />}
                    {d.status === 'skip' && <ArrowRightIcon className="w-3 h-3 text-amber-500 shrink-0" />}
                    <span className="text-slate-600">{d.step}</span>
                    <span className="text-slate-400">&mdash; {d.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Validation Results */}
          {validations.length > 0 && (
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
              <p className="text-xs font-black text-slate-500 uppercase tracking-wider mb-2">Validation Results</p>
              <div className="space-y-1.5">
                {validations.map((v, i) => (
                  <div key={i} className="flex items-center space-x-2 text-xs">
                    {v.status === 'pass' && <CheckIcon className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
                    {v.status === 'fail' && <XIcon className="w-3.5 h-3.5 text-rose-500 shrink-0" />}
                    {v.status === 'warn' && <AlertTriangleIcon className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                    <span className="font-semibold text-slate-700">{v.label}</span>
                    <span className="text-slate-400">&mdash; {v.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─── Activation Panel ─── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
        <div className="px-6 py-5 border-b border-slate-100">
          <h3 className="font-black text-slate-900 font-heading">Activation Rules</h3>
          <p className="text-xs text-slate-400 mt-1">Choose how and when this workflow goes live.</p>
        </div>
        <div className="px-6 py-5 space-y-4">
          {/* Activation Mode */}
          <div className="space-y-2">
            {([
              { mode: 'immediate' as ActivationMode, label: 'Activate Immediately', desc: 'Start processing leads right away', icon: <BoltIcon className="w-4 h-4" /> },
              { mode: 'scheduled' as ActivationMode, label: 'Schedule Activation', desc: 'Start at a specific date and time', icon: <CalendarIcon className="w-4 h-4" /> },
              { mode: 'segment' as ActivationMode, label: 'Only for Certain Segments', desc: 'Apply to specific lead segments only', icon: <UsersIcon className="w-4 h-4" /> },
            ]).map(opt => (
              <button
                key={opt.mode}
                onClick={() => onActivationModeChange(opt.mode)}
                className={`w-full p-4 rounded-xl border-2 text-left transition-all flex items-center space-x-3 ${
                  activationMode === opt.mode
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${activationMode === opt.mode ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                  {opt.icon}
                </div>
                <div>
                  <p className={`text-sm font-bold ${activationMode === opt.mode ? 'text-indigo-700' : 'text-slate-700'}`}>{opt.label}</p>
                  <p className="text-xs text-slate-400">{opt.desc}</p>
                </div>
              </button>
            ))}
          </div>

          {/* Schedule Fields */}
          {activationMode === 'scheduled' && (
            <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Date</label>
                <input type="date" value={scheduleDate} onChange={e => onScheduleDateChange(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Time</label>
                <input type="time" value={scheduleTime} onChange={e => onScheduleTimeChange(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
            </div>
          )}

          {/* Segment Filter */}
          {activationMode === 'segment' && (
            <div className="p-3 bg-slate-50 rounded-xl">
              <label className="block text-xs font-bold text-slate-600 mb-1">Target Segment</label>
              <select value={segmentFilter} onChange={e => onSegmentFilterChange(e.target.value)} className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                <option value="all">All Leads</option>
                <option value="hot">Hot Leads (Score 75+)</option>
                <option value="warm">Warm Leads (Score 50-74)</option>
                <option value="new">New Leads Only</option>
                <option value="contacted">Contacted Leads</option>
              </select>
            </div>
          )}

          {/* Monitoring */}
          <div className="pt-3 border-t border-slate-100">
            <p className="text-xs font-black text-slate-500 uppercase tracking-wider mb-3">Monitoring After Activation</p>
            <label className="flex items-center justify-between p-3 bg-emerald-50 rounded-xl border border-emerald-200 cursor-pointer mb-2">
              <div className="flex items-center space-x-2">
                <BellIcon className="w-4 h-4 text-emerald-600" />
                <span className="text-xs font-bold text-emerald-700">Alert on Failures</span>
              </div>
              <input type="checkbox" checked={monitorAlerts} onChange={e => onMonitorAlertsChange(e.target.checked)} className="w-4 h-4 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500" />
            </label>
            <div className="grid grid-cols-3 gap-2">
              <div className="p-2.5 bg-slate-50 rounded-lg text-center">
                <EyeIcon className="w-4 h-4 text-slate-500 mx-auto mb-1" />
                <p className="text-[10px] font-bold text-slate-500">Real-time view</p>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-lg text-center">
                <AlertTriangleIcon className="w-4 h-4 text-slate-500 mx-auto mb-1" />
                <p className="text-[10px] font-bold text-slate-500">Failure alerts</p>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-lg text-center">
                <ActivityIcon className="w-4 h-4 text-slate-500 mx-auto mb-1" />
                <p className="text-[10px] font-bold text-slate-500">Weekly review</p>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center space-x-2 pt-3">
            <button onClick={onSave} className="flex items-center justify-center space-x-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl text-sm font-bold hover:bg-slate-50 transition-all flex-1">
              <EditIcon className="w-4 h-4" />
              <span>Save Draft</span>
            </button>
            <button onClick={onTest} disabled={testRunning} className="flex items-center justify-center space-x-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl text-sm font-bold hover:bg-slate-50 transition-all flex-1 disabled:opacity-50">
              <RefreshIcon className="w-4 h-4" />
              <span>Send Again</span>
            </button>
            <button onClick={onActivate} className="flex items-center justify-center space-x-2 px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200 flex-1">
              <PlayIcon className="w-4 h-4" />
              <span>Activate</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
);
