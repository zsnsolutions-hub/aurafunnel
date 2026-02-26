import React, { useState } from 'react';
import {
  Search, Activity, Wrench, ScrollText, FileDown, History,
} from 'lucide-react';
import { useSupport } from '../../components/support/SupportProvider';
import WorkspaceBrowserTab from './tabs/WorkspaceBrowserTab';
import ActiveSessionTab from './tabs/ActiveSessionTab';
import IntegrationDebuggerTab from './tabs/IntegrationDebuggerTab';
import LogsEventsTab from './tabs/LogsEventsTab';
import DiagnosticExportTab from './tabs/DiagnosticExportTab';
import SupportHistoryTab from './tabs/SupportHistoryTab';

type SupportTab = 'browser' | 'session' | 'debug' | 'logs' | 'export' | 'history';

const tabs: { id: SupportTab; label: string; icon: React.ReactNode }[] = [
  { id: 'browser',  label: 'Workspace Browser', icon: <Search size={16} /> },
  { id: 'session',  label: 'Active Session',    icon: <Activity size={16} /> },
  { id: 'debug',    label: 'Integration Debug',  icon: <Wrench size={16} /> },
  { id: 'logs',     label: 'Logs & Events',      icon: <ScrollText size={16} /> },
  { id: 'export',   label: 'Diagnostic Export',   icon: <FileDown size={16} /> },
  { id: 'history',  label: 'Support History',     icon: <History size={16} /> },
];

const SupportConsole: React.FC = () => {
  const [activeTab, setActiveTab] = useState<SupportTab>('browser');
  const { activeSession } = useSupport();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Support Console</h1>
        <p className="text-sm text-slate-500 mt-1">
          Internal support tool for troubleshooting customer workspaces
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 overflow-x-auto">
        {tabs.map((tab) => {
          const needsSession = tab.id !== 'browser' && tab.id !== 'history';
          const disabled = needsSession && !activeSession;
          return (
            <button
              key={tab.id}
              onClick={() => !disabled && setActiveTab(tab.id)}
              disabled={disabled}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : disabled
                  ? 'text-slate-300 cursor-not-allowed'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'browser'  && <WorkspaceBrowserTab onSessionStarted={() => setActiveTab('session')} />}
        {activeTab === 'session'  && <ActiveSessionTab />}
        {activeTab === 'debug'    && <IntegrationDebuggerTab />}
        {activeTab === 'logs'     && <LogsEventsTab />}
        {activeTab === 'export'   && <DiagnosticExportTab />}
        {activeTab === 'history'  && <SupportHistoryTab />}
      </div>
    </div>
  );
};

export default SupportConsole;
