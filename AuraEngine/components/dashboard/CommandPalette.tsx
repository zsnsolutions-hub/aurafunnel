import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { User } from '../../types';
import {
  TargetIcon, SparklesIcon, CreditCardIcon, CogIcon, BoltIcon, EditIcon,
  PieChartIcon, GitBranchIcon, HelpCircleIcon, BookOpenIcon, UsersIcon,
  BrainIcon, MessageIcon, SlidersIcon, PlugIcon, PlusIcon, ChartIcon,
  MailIcon, DownloadIcon, RefreshIcon, KeyIcon, FilterIcon, SendIcon, CalendarIcon
} from '../Icons';

interface CommandPaletteProps {
  user: User;
  open: boolean;
  onClose: () => void;
}

interface CommandItem {
  id: string;
  label: string;
  description: string;
  category: 'navigation' | 'action' | 'shortcut';
  icon: React.ReactNode;
  shortcut?: string;
  action: () => void;
}

const CommandPalette: React.FC<CommandPaletteProps> = ({ user, open, onClose }) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const commands: CommandItem[] = useMemo(() => [
    // Navigation
    { id: 'nav-dashboard', label: 'Main Dashboard', description: 'Go to main dashboard', category: 'navigation', icon: <TargetIcon className="w-4 h-4" />, shortcut: 'G D', action: () => navigate('/portal') },
    { id: 'nav-leads', label: 'Lead Management', description: 'View and manage leads', category: 'navigation', icon: <UsersIcon className="w-4 h-4" />, shortcut: 'G L', action: () => navigate('/portal/leads') },
    { id: 'nav-intelligence', label: 'Lead Intelligence', description: 'AI lead scoring dashboard', category: 'navigation', icon: <BrainIcon className="w-4 h-4" />, shortcut: 'G I', action: () => navigate('/portal/intelligence') },
    { id: 'nav-ai', label: 'AI Command Center', description: 'Chat with AI assistant', category: 'navigation', icon: <MessageIcon className="w-4 h-4" />, shortcut: 'G A', action: () => navigate('/portal/ai') },
    { id: 'nav-neural', label: 'Neural Studio', description: 'AI content generation', category: 'navigation', icon: <SparklesIcon className="w-4 h-4" />, action: () => navigate('/portal/content') },
    { id: 'nav-content-studio', label: 'Content Studio', description: 'Multi-variant email editor', category: 'navigation', icon: <EditIcon className="w-4 h-4" />, shortcut: 'G C', action: () => navigate('/portal/content-studio') },
    { id: 'nav-strategy', label: 'Strategy Hub', description: 'Campaign strategies', category: 'navigation', icon: <BoltIcon className="w-4 h-4" />, shortcut: 'G S', action: () => navigate('/portal/strategy') },
    { id: 'nav-blog', label: 'Guest Posts', description: 'Blog drafts & publishing', category: 'navigation', icon: <EditIcon className="w-4 h-4" />, action: () => navigate('/portal/blog') },
    { id: 'nav-analytics', label: 'Analytics Hub', description: 'Performance analytics', category: 'navigation', icon: <PieChartIcon className="w-4 h-4" />, shortcut: 'G N', action: () => navigate('/portal/analytics') },
    { id: 'nav-automation', label: 'Automation Engine', description: 'Workflow automation', category: 'navigation', icon: <GitBranchIcon className="w-4 h-4" />, action: () => navigate('/portal/automation') },
    { id: 'nav-training', label: 'AI Prompt Studio', description: 'Customize AI prompts and templates', category: 'navigation', icon: <SlidersIcon className="w-4 h-4" />, action: () => navigate('/portal/model-training') },
    { id: 'nav-integrations', label: 'Integration Hub', description: 'Connected systems & APIs', category: 'navigation', icon: <PlugIcon className="w-4 h-4" />, action: () => navigate('/portal/integrations') },
    { id: 'nav-social', label: 'Social Scheduler', description: 'Schedule & publish social posts', category: 'navigation', icon: <SendIcon className="w-4 h-4" />, action: () => navigate('/portal/social-scheduler') },
    { id: 'nav-billing', label: 'Billing & Tiers', description: 'Subscription management', category: 'navigation', icon: <CreditCardIcon className="w-4 h-4" />, action: () => navigate('/portal/billing') },
    { id: 'nav-help', label: 'Help Center', description: 'FAQs and support', category: 'navigation', icon: <HelpCircleIcon className="w-4 h-4" />, shortcut: '?', action: () => navigate('/portal/help') },
    { id: 'nav-manual', label: 'User Manual', description: 'Platform documentation', category: 'navigation', icon: <BookOpenIcon className="w-4 h-4" />, action: () => navigate('/portal/manual') },
    { id: 'nav-settings', label: 'Account Settings', description: 'Profile & preferences', category: 'navigation', icon: <CogIcon className="w-4 h-4" />, action: () => navigate('/portal/settings') },
    // Actions
    { id: 'act-add-lead', label: 'Add New Lead', description: 'Create a new lead manually', category: 'action', icon: <PlusIcon className="w-4 h-4" />, action: () => navigate('/portal/leads') },
    { id: 'act-generate', label: 'Generate Content', description: 'Open AI content generator', category: 'action', icon: <SparklesIcon className="w-4 h-4" />, action: () => navigate('/portal/content') },
    { id: 'act-report', label: 'Run Analytics Report', description: 'Generate performance report', category: 'action', icon: <ChartIcon className="w-4 h-4" />, action: () => navigate('/portal/analytics') },
    { id: 'act-email', label: 'Compose Email Sequence', description: 'Open email sequence builder', category: 'action', icon: <MailIcon className="w-4 h-4" />, action: () => navigate('/portal/content-studio') },
    { id: 'act-social-post', label: 'Schedule Social Post', description: 'Compose and schedule a social media post', category: 'action', icon: <CalendarIcon className="w-4 h-4" />, action: () => navigate('/portal/social-scheduler') },
    { id: 'act-import', label: 'Import Leads (CSV)', description: 'Bulk import leads from file', category: 'action', icon: <DownloadIcon className="w-4 h-4" />, action: () => navigate('/portal/leads') },
    { id: 'act-train', label: 'Open Prompt Studio', description: 'Customize AI prompts and templates', category: 'action', icon: <RefreshIcon className="w-4 h-4" />, action: () => navigate('/portal/model-training') },
  ], [navigate]);

  const filteredCommands = useMemo(() => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase();
    return commands.filter(c =>
      c.label.toLowerCase().includes(q) ||
      c.description.toLowerCase().includes(q) ||
      c.category.includes(q)
    );
  }, [commands, query]);

  // Group by category
  const grouped = useMemo(() => {
    const groups: Record<string, CommandItem[]> = {};
    filteredCommands.forEach(c => {
      if (!groups[c.category]) groups[c.category] = [];
      groups[c.category].push(c);
    });
    return groups;
  }, [filteredCommands]);

  const flatItems = useMemo(() => filteredCommands, [filteredCommands]);

  // Reset on open
  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, flatItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && flatItems[selectedIndex]) {
      e.preventDefault();
      flatItems[selectedIndex].action();
      onClose();
    } else if (e.key === 'Escape') {
      onClose();
    }
  }, [flatItems, selectedIndex, onClose]);

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (!open) return null;

  const categoryLabels: Record<string, string> = {
    navigation: 'Navigate To',
    action: 'Quick Actions',
    shortcut: 'Shortcuts',
  };

  let itemCounter = -1;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]" onClick={onClose}>
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Search Input */}
        <div className="flex items-center px-5 border-b border-slate-100">
          <FilterIcon className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search commands, pages, actions..."
            className="flex-1 px-3 py-4 text-sm text-slate-700 bg-transparent outline-none placeholder-slate-400"
          />
          <kbd className="px-2 py-0.5 bg-slate-100 text-slate-400 rounded text-[10px] font-bold">ESC</kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[400px] overflow-y-auto py-2">
          {flatItems.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <p className="text-sm text-slate-400 font-semibold">No results found</p>
              <p className="text-xs text-slate-300 mt-1">Try a different search term</p>
            </div>
          ) : (
            Object.entries(grouped).map(([category, items]: [string, CommandItem[]]) => (
              <div key={category}>
                <p className="px-5 pt-3 pb-1 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                  {categoryLabels[category] || category}
                </p>
                {items.map(item => {
                  itemCounter++;
                  const idx = itemCounter;
                  return (
                    <button
                      key={item.id}
                      data-index={idx}
                      onClick={() => { item.action(); onClose(); }}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={`w-full flex items-center space-x-3 px-5 py-2.5 text-left transition-colors ${
                        selectedIndex === idx ? 'bg-indigo-50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <span className={`shrink-0 ${selectedIndex === idx ? 'text-indigo-600' : 'text-slate-400'}`}>
                        {item.icon}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold truncate ${selectedIndex === idx ? 'text-indigo-700' : 'text-slate-700'}`}>
                          {item.label}
                        </p>
                        <p className="text-[11px] text-slate-400 truncate">{item.description}</p>
                      </div>
                      {item.shortcut && (
                        <div className="flex items-center space-x-1 shrink-0">
                          {item.shortcut.split(' ').map((k, i) => (
                            <kbd key={i} className="px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded text-[10px] font-bold min-w-[20px] text-center">
                              {k}
                            </kbd>
                          ))}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-2.5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <div className="flex items-center space-x-3 text-[10px] text-slate-400">
            <span className="flex items-center space-x-1">
              <kbd className="px-1 py-0.5 bg-white border border-slate-200 rounded text-[9px]">↑↓</kbd>
              <span>Navigate</span>
            </span>
            <span className="flex items-center space-x-1">
              <kbd className="px-1 py-0.5 bg-white border border-slate-200 rounded text-[9px]">↵</kbd>
              <span>Select</span>
            </span>
            <span className="flex items-center space-x-1">
              <kbd className="px-1 py-0.5 bg-white border border-slate-200 rounded text-[9px]">Esc</kbd>
              <span>Close</span>
            </span>
          </div>
          <span className="text-[10px] text-slate-400 font-semibold">{flatItems.length} results</span>
        </div>
      </div>
    </div>
  );
};

export default React.memo(CommandPalette);
