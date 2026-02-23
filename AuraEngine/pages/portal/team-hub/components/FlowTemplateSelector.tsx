import React, { useState, useEffect } from 'react';
import { X, Loader2, LayoutGrid, Zap, Briefcase, FolderOpen, Layers, Trash2, Link2 } from 'lucide-react';
import type { FlowTemplate } from '../teamHubApi';
import * as api from '../teamHubApi';

const TEMPLATE_ICONS: Record<string, React.ReactNode> = {
  'Basic Workflow': <LayoutGrid size={20} />,
  'Sales Sprint': <Zap size={20} />,
  'Project Delivery': <Briefcase size={20} />,
};

const TEMPLATE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  'Basic Workflow': { bg: 'bg-indigo-50', text: 'text-indigo-600', border: 'border-indigo-200' },
  'Sales Sprint': { bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-200' },
  'Project Delivery': { bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200' },
};

const DEFAULT_COLOR = { bg: 'bg-violet-50', text: 'text-violet-600', border: 'border-violet-200' };

interface FlowTemplateSelectorProps {
  onSelect: (templateId: string, name: string) => void;
  onBlank: (name: string) => void;
  onClose: () => void;
}

const FlowTemplateSelector: React.FC<FlowTemplateSelectorProps> = ({ onSelect, onBlank, onClose }) => {
  const [templates, setTemplates] = useState<FlowTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [flowName, setFlowName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api.fetchFlowTemplates()
      .then(t => setTemplates(t))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const systemTemplates = templates.filter(t => t.type === 'system');
  const userTemplates = templates.filter(t => t.type === 'user');

  const handleSelect = async (template: FlowTemplate) => {
    const name = flowName.trim() || template.name;
    setCreating(true);
    onSelect(template.id, name);
  };

  const handleBlank = () => {
    const name = flowName.trim() || 'Untitled Flow';
    setCreating(true);
    onBlank(name);
  };

  const handleDeleteTemplate = async (id: string) => {
    try {
      await api.deleteFlowTemplate(id);
      setTemplates(prev => prev.filter(t => t.id !== id));
    } catch (err) {
      console.error('Failed to delete template:', err);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
            <div>
              <h3 className="text-base font-bold text-slate-800">Create New Flow</h3>
              <p className="text-xs text-slate-500 mt-0.5">Choose a template or start from scratch</p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all"
            >
              <X size={18} />
            </button>
          </div>

          {/* Flow name input */}
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5 block">
              Flow Name
            </label>
            <input
              autoFocus
              value={flowName}
              onChange={e => setFlowName(e.target.value)}
              placeholder="e.g. Q1 Marketing, Product Roadmap..."
              className="w-full px-4 py-2.5 text-sm bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-all placeholder-slate-400"
            />
          </div>

          {/* Templates */}
          <div className="max-h-[380px] overflow-y-auto px-6 py-4 space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={20} className="text-slate-300 animate-spin" />
              </div>
            ) : (
              <>
                {/* Blank flow */}
                <button
                  onClick={handleBlank}
                  disabled={creating}
                  className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-dashed border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/30 transition-all text-left group disabled:opacity-50"
                >
                  <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-indigo-100 group-hover:text-indigo-500 transition-colors shrink-0">
                    <FolderOpen size={22} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-700 group-hover:text-indigo-600 transition-colors">
                      Blank Flow
                    </p>
                    <p className="text-[11px] text-slate-400">Start from scratch — add your own lanes</p>
                  </div>
                </button>

                {/* System templates */}
                {systemTemplates.length > 0 && (
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">System Templates</p>
                    <div className="space-y-2">
                      {systemTemplates.map(t => {
                        const colors = TEMPLATE_COLORS[t.name] || DEFAULT_COLOR;
                        const icon = TEMPLATE_ICONS[t.name] || <Layers size={20} />;
                        const lanes = t.structure_json.lanes || [];
                        const hasSync = t.structure_json.lead_sync;

                        return (
                          <button
                            key={t.id}
                            onClick={() => handleSelect(t)}
                            disabled={creating}
                            className={`w-full flex items-center gap-4 p-4 rounded-xl border ${colors.border} hover:shadow-md transition-all text-left group disabled:opacity-50`}
                          >
                            <div className={`w-12 h-12 rounded-xl ${colors.bg} flex items-center justify-center ${colors.text} shrink-0`}>
                              {icon}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-bold text-slate-700">{t.name}</p>
                                {hasSync && (
                                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[8px] font-bold bg-indigo-100 text-indigo-600">
                                    <Link2 size={8} />
                                    Lead Sync
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-400 mt-0.5">
                                {lanes.map(l => l.name).join(' → ')}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* User templates */}
                {userTemplates.length > 0 && (
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">Your Templates</p>
                    <div className="space-y-2">
                      {userTemplates.map(t => {
                        const lanes = t.structure_json.lanes || [];

                        return (
                          <div
                            key={t.id}
                            className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:shadow-sm transition-all group"
                          >
                            <button
                              onClick={() => handleSelect(t)}
                              disabled={creating}
                              className="flex-1 flex items-center gap-3 text-left disabled:opacity-50"
                            >
                              <div className="w-10 h-10 rounded-lg bg-violet-50 flex items-center justify-center text-violet-500 shrink-0">
                                <Layers size={18} />
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-slate-700">{t.name}</p>
                                <p className="text-[10px] text-slate-400 truncate">
                                  {lanes.map(l => l.name).join(' → ')}
                                </p>
                              </div>
                            </button>
                            <button
                              onClick={() => handleDeleteTemplate(t.id)}
                              className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default FlowTemplateSelector;
