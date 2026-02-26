import React, { useState } from 'react';
import { FileDown, Check, Eye, EyeOff, Plug, Mail, Target, Globe, User } from 'lucide-react';
import { useSupport } from '../../../components/support/SupportProvider';
import { exportDiagnosticReport, downloadJson, getTargetIntegrations, getTargetEmailConfigs, getTargetLeads, getTargetWebhooks, getTargetProfile } from '../../../lib/support';

const allSections = [
  { id: 'profile', label: 'Profile' },
  { id: 'subscription', label: 'Subscription' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'email_configs', label: 'Email Configs' },
  { id: 'webhooks', label: 'Webhooks' },
  { id: 'leads_summary', label: 'Leads Summary' },
  { id: 'audit_logs', label: 'Audit Logs' },
];

interface PreviewData {
  profileName?: string;
  profileEmail?: string;
  integrationCount?: number;
  emailConfigCount?: number;
  leadCount?: number;
  webhookCount?: number;
}

const DiagnosticExportTab: React.FC = () => {
  const { activeSession, viewingAsUser, logAction } = useSupport();
  const [selected, setSelected] = useState<Set<string>>(new Set(allSections.map((s) => s.id)));
  const [generating, setGenerating] = useState(false);
  const [done, setDone] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleGenerate = async () => {
    if (!activeSession) return;
    setGenerating(true);
    setDone(false);
    try {
      const response = await exportDiagnosticReport(
        activeSession.target_user_id,
        Array.from(selected),
      );
      const report = response.report ?? response;
      const filename = `diagnostic_${viewingAsUser?.email || activeSession.target_user_id}_${new Date().toISOString().slice(0, 10)}.json`;
      downloadJson(report, filename);
      await logAction('export_diagnostic_report_ui', 'diagnostic_report', undefined, {
        sections: Array.from(selected),
      });
      setDone(true);
      setTimeout(() => setDone(false), 3000);
    } finally {
      setGenerating(false);
    }
  };

  const handleTogglePreview = async () => {
    if (showPreview) {
      setShowPreview(false);
      return;
    }
    if (!activeSession) return;
    setShowPreview(true);
    if (!previewData) {
      setPreviewLoading(true);
      try {
        const uid = activeSession.target_user_id;
        const [profile, integrations, emailConfigs, leads, webhooks] = await Promise.all([
          getTargetProfile(uid),
          getTargetIntegrations(uid),
          getTargetEmailConfigs(uid),
          getTargetLeads(uid),
          getTargetWebhooks(uid),
        ]);
        setPreviewData({
          profileName: profile?.name || 'Unknown',
          profileEmail: profile?.email || 'Unknown',
          integrationCount: integrations.length,
          emailConfigCount: emailConfigs.length,
          leadCount: leads.length,
          webhookCount: webhooks.length,
        });
      } finally {
        setPreviewLoading(false);
      }
    }
  };

  if (!activeSession) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
        <p className="text-slate-400 text-sm">No active session.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider mb-4">
          Diagnostic Report for {viewingAsUser?.email || activeSession.target_user_id}
        </h2>
        <p className="text-xs text-slate-500 mb-6">
          Select the sections to include in the export. All credentials will be masked automatically.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
          {allSections.map((section) => (
            <button
              key={section.id}
              onClick={() => toggle(section.id)}
              className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-xs font-bold transition-all ${
                selected.has(section.id)
                  ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                  : 'border-slate-200 bg-white text-slate-400 hover:border-slate-300'
              }`}
            >
              <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                selected.has(section.id) ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300'
              }`}>
                {selected.has(section.id) && <Check size={10} className="text-white" />}
              </div>
              {section.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleGenerate}
            disabled={generating || selected.size === 0}
            className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            {generating ? (
              <>Generating...</>
            ) : done ? (
              <>
                <Check size={16} />
                Downloaded!
              </>
            ) : (
              <>
                <FileDown size={16} />
                Generate & Download Report
              </>
            )}
          </button>
          <button
            onClick={handleTogglePreview}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-colors ${
              showPreview
                ? 'bg-slate-700 text-white hover:bg-slate-800'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {showPreview ? <EyeOff size={16} /> : <Eye size={16} />}
            {showPreview ? 'Hide Preview' : 'Preview'}
          </button>
        </div>
      </div>

      {/* Live Preview Pane */}
      {showPreview && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider mb-4">Report Preview</h3>
          {previewLoading ? (
            <div className="text-sm text-slate-400">Loading preview...</div>
          ) : previewData ? (
            <div className="space-y-4">
              {selected.has('profile') && (
                <div className="bg-slate-50 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-slate-400 mb-2">
                    <User size={14} />
                    <span className="text-[10px] font-black uppercase tracking-wider">Profile</span>
                  </div>
                  <p className="text-sm font-bold text-slate-900">{previewData.profileName}</p>
                  <p className="text-xs text-slate-500">{previewData.profileEmail}</p>
                </div>
              )}
              {selected.has('integrations') && (
                <div className="bg-slate-50 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-slate-400 mb-2">
                    <Plug size={14} />
                    <span className="text-[10px] font-black uppercase tracking-wider">Integrations</span>
                  </div>
                  <p className="text-sm font-bold text-slate-900">{previewData.integrationCount} integration{previewData.integrationCount !== 1 ? 's' : ''}</p>
                </div>
              )}
              {selected.has('email_configs') && (
                <div className="bg-slate-50 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-slate-400 mb-2">
                    <Mail size={14} />
                    <span className="text-[10px] font-black uppercase tracking-wider">Email Configs</span>
                  </div>
                  <p className="text-sm font-bold text-slate-900">{previewData.emailConfigCount} config{previewData.emailConfigCount !== 1 ? 's' : ''}</p>
                </div>
              )}
              {selected.has('leads_summary') && (
                <div className="bg-slate-50 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-slate-400 mb-2">
                    <Target size={14} />
                    <span className="text-[10px] font-black uppercase tracking-wider">Leads Summary</span>
                  </div>
                  <p className="text-sm font-bold text-slate-900">{previewData.leadCount} lead{previewData.leadCount !== 1 ? 's' : ''}</p>
                </div>
              )}
              {selected.has('webhooks') && (
                <div className="bg-slate-50 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-slate-400 mb-2">
                    <Globe size={14} />
                    <span className="text-[10px] font-black uppercase tracking-wider">Webhooks</span>
                  </div>
                  <p className="text-sm font-bold text-slate-900">{previewData.webhookCount} webhook{previewData.webhookCount !== 1 ? 's' : ''}</p>
                </div>
              )}
              {selected.has('subscription') && (
                <div className="bg-slate-50 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-slate-400 mb-2">
                    <span className="text-[10px] font-black uppercase tracking-wider">Subscription</span>
                  </div>
                  <p className="text-xs text-slate-500">Included in export (credentials masked)</p>
                </div>
              )}
              {selected.has('audit_logs') && (
                <div className="bg-slate-50 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-slate-400 mb-2">
                    <span className="text-[10px] font-black uppercase tracking-wider">Audit Logs</span>
                  </div>
                  <p className="text-xs text-slate-500">Included in export</p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-400">No preview data available.</p>
          )}
        </div>
      )}
    </div>
  );
};

export default DiagnosticExportTab;
