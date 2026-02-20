import React from 'react';
import { UsersIcon } from '../Icons';
import type { Lead } from '../../types';
import type { BatchEmailSummary } from '../../lib/emailTracking';

interface TargetLeadsPanelProps {
  leads: Lead[];
  filteredLeads: Lead[];
  leadsWithEmail: Lead[];
  testLeadIds: Set<string>;
  selectedLeadCount: number;
  allFilteredSelected: boolean;
  showLeadPanel: boolean;
  leadScoreFilter: number;
  leadStatusFilter: string;
  emailSummaryMap: Map<string, BatchEmailSummary>;
  onTogglePanel: () => void;
  onScoreFilterChange: (v: number) => void;
  onStatusFilterChange: (v: string) => void;
  onToggleLead: (id: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
}

export const TargetLeadsPanel: React.FC<TargetLeadsPanelProps> = ({
  leads,
  filteredLeads,
  leadsWithEmail,
  testLeadIds,
  selectedLeadCount,
  allFilteredSelected,
  showLeadPanel,
  leadScoreFilter,
  leadStatusFilter,
  emailSummaryMap,
  onTogglePanel,
  onScoreFilterChange,
  onStatusFilterChange,
  onToggleLead,
  onSelectAll,
  onDeselectAll,
}) => (
  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
    <button
      onClick={onTogglePanel}
      className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors rounded-2xl"
    >
      <div className="flex items-center space-x-3">
        <div className="w-9 h-9 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center">
          <UsersIcon className="w-5 h-5" />
        </div>
        <div className="text-left">
          <h3 className="font-black text-slate-900 font-heading text-sm">Target Leads</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            {selectedLeadCount > 0
              ? `${selectedLeadCount} lead${selectedLeadCount !== 1 ? 's' : ''} selected · ${leadsWithEmail.filter(l => testLeadIds.has(l.id)).length} with email`
              : leads.length > 0
                ? `${leads.length} leads available — select who receives emails`
                : 'No leads in pipeline — add leads first'}
          </p>
        </div>
      </div>
      <div className="flex items-center space-x-3">
        {selectedLeadCount > 0 && (
          <span className="px-2.5 py-1 bg-sky-100 text-sky-700 rounded-full text-[10px] font-black">
            {selectedLeadCount} selected
          </span>
        )}
        <svg className={`w-4 h-4 text-slate-400 transition-transform ${showLeadPanel ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </button>

    {showLeadPanel && (
      <div className="px-6 pb-5 border-t border-slate-100">
        {/* Filters & Actions */}
        <div className="flex flex-wrap items-center gap-3 py-4">
          <div className="flex items-center space-x-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Min Score</label>
            <input
              type="number"
              min={0}
              max={100}
              value={leadScoreFilter}
              onChange={e => onScoreFilterChange(Number(e.target.value) || 0)}
              className="w-16 px-2 py-1.5 border border-slate-200 rounded-lg text-xs text-center focus:ring-2 focus:ring-sky-500 outline-none"
            />
          </div>
          <div className="flex items-center space-x-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Status</label>
            <select
              value={leadStatusFilter}
              onChange={e => onStatusFilterChange(e.target.value)}
              className="px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-sky-500 outline-none"
            >
              <option value="all">All Statuses</option>
              <option value="New">New</option>
              <option value="Contacted">Contacted</option>
              <option value="Qualified">Qualified</option>
              <option value="Proposal">Proposal</option>
              <option value="Won">Won</option>
              <option value="Lost">Lost</option>
            </select>
          </div>
          <div className="flex-1" />
          <span className="text-[10px] text-slate-400 font-medium">
            {filteredLeads.length} lead{filteredLeads.length !== 1 ? 's' : ''} match filters
            {filteredLeads.length !== leadsWithEmail.length && ` · ${filteredLeads.filter(l => !l.email).length} without email`}
          </span>
          <button
            onClick={allFilteredSelected ? onDeselectAll : onSelectAll}
            className="px-3 py-1.5 text-[11px] font-bold rounded-lg border transition-all hover:bg-slate-50"
          >
            {allFilteredSelected ? 'Deselect All' : 'Select All'}
          </button>
        </div>

        {/* Lead List */}
        {filteredLeads.length > 0 ? (
          <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
            {filteredLeads.map(lead => {
              const isSelected = testLeadIds.has(lead.id);
              const hasEmail = !!lead.email;
              const emailed = emailSummaryMap.get(lead.id);
              return (
                <label
                  key={lead.id}
                  className={`flex items-center px-4 py-3 cursor-pointer transition-colors ${
                    isSelected ? 'bg-sky-50' : 'hover:bg-slate-50'
                  } ${!hasEmail ? 'opacity-50' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggleLead(lead.id)}
                    className="w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500 shrink-0"
                  />
                  <div className="ml-3 flex-1 min-w-0">
                    <div className="flex items-center space-x-2">
                      <span className="text-sm font-bold text-slate-800 truncate">{lead.name}</span>
                      {!hasEmail && (
                        <span className="px-1.5 py-0.5 bg-rose-100 text-rose-600 rounded text-[9px] font-black shrink-0">NO EMAIL</span>
                      )}
                      {emailed?.hasSent && (
                        <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[9px] font-black shrink-0">EMAILED</span>
                      )}
                    </div>
                    <div className="flex items-center space-x-2 mt-0.5">
                      {lead.company && <span className="text-[11px] text-slate-400 truncate">{lead.company}</span>}
                      {lead.email && <span className="text-[11px] text-slate-300 truncate">{lead.email}</span>}
                    </div>
                  </div>
                  <div className="flex items-center space-x-3 shrink-0 ml-3">
                    <span className={`text-xs font-black ${
                      lead.score >= 75 ? 'text-emerald-600' : lead.score >= 50 ? 'text-amber-600' : 'text-slate-400'
                    }`}>
                      {lead.score}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                      lead.status === 'Qualified' ? 'bg-emerald-50 text-emerald-600'
                      : lead.status === 'Contacted' ? 'bg-sky-50 text-sky-600'
                      : lead.status === 'New' ? 'bg-indigo-50 text-indigo-600'
                      : 'bg-slate-50 text-slate-500'
                    }`}>
                      {lead.status || 'New'}
                    </span>
                  </div>
                </label>
              );
            })}
          </div>
        ) : (
          <div className="py-8 text-center border border-dashed border-slate-200 rounded-xl">
            <UsersIcon className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-bold text-slate-500">No leads match filters</p>
            <p className="text-xs text-slate-400 mt-1">
              {leads.length === 0
                ? 'Add leads in the Lead Management page first.'
                : 'Try adjusting the score or status filters above.'}
            </p>
          </div>
        )}

        {/* Selection summary */}
        {selectedLeadCount > 0 && (
          <div className="mt-3 flex items-center justify-between px-1">
            <p className="text-xs text-slate-500">
              <strong className="text-slate-700">{selectedLeadCount}</strong> lead{selectedLeadCount !== 1 ? 's' : ''} will be processed when you click <strong>Send Campaign</strong>
            </p>
            <button
              onClick={onDeselectAll}
              className="text-[11px] text-rose-500 font-bold hover:text-rose-600 transition-colors"
            >
              Clear selection
            </button>
          </div>
        )}
      </div>
    )}
  </div>
);
