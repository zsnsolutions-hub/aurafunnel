import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { User } from '../../types';

const STORAGE_KEY = 'scaliyo_activation_checklist';
const ONBOARDING_TS_KEY = 'scaliyo_onboarding_ts';
const DISMISSED_KEY = 'scaliyo_activation_dismissed';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

interface ChecklistItem {
  id: string;
  label: string;
  route?: string;
  autoComplete?: boolean;
}

const CHECKLIST_ITEMS: ChecklistItem[] = [
  { id: 'account', label: 'Create account', autoComplete: true },
  { id: 'lead', label: 'Add your first lead', route: '/portal/leads' },
  { id: 'content', label: 'Generate AI content', route: '/portal/content' },
  { id: 'automation', label: 'Set up an automation', route: '/portal/automation' },
  { id: 'integration', label: 'Connect an integration', route: '/portal/integrations' },
];

interface ActivationChecklistProps {
  user: User;
}

const ActivationChecklist: React.FC<ActivationChecklistProps> = ({ user }) => {
  const navigate = useNavigate();
  const [completed, setCompleted] = useState<Record<string, boolean>>({});
  const [collapsed, setCollapsed] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [visible, setVisible] = useState(false);

  // Load state from localStorage
  useEffect(() => {
    // Check if dismissed
    if (localStorage.getItem(DISMISSED_KEY) === 'true') {
      setDismissed(true);
      return;
    }

    // Check if within 7-day window
    const ts = localStorage.getItem(ONBOARDING_TS_KEY);
    if (!ts) {
      // No onboarding timestamp — check if onboarding was completed at all
      const onboardingDone = localStorage.getItem('scaliyo_onboarding_complete');
      if (!onboardingDone) {
        setVisible(false);
        return;
      }
      // Onboarding done but no timestamp (skipped) — show for 7 days from now
      localStorage.setItem(ONBOARDING_TS_KEY, new Date().toISOString());
      setVisible(true);
    } else {
      const elapsed = Date.now() - new Date(ts).getTime();
      if (elapsed > SEVEN_DAYS_MS) {
        setVisible(false);
        return;
      }
      setVisible(true);
    }

    // Load completed items
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setCompleted(JSON.parse(stored));
      } else {
        // Auto-complete account creation
        const initial = { account: true };
        setCompleted(initial);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
      }
    } catch {
      setCompleted({ account: true });
    }
  }, []);

  const toggleItem = useCallback((id: string) => {
    setCompleted((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const dismiss = useCallback(() => {
    setDismissed(true);
    localStorage.setItem(DISMISSED_KEY, 'true');
  }, []);

  if (dismissed || !visible) return null;

  const completedCount = CHECKLIST_ITEMS.filter((item) => completed[item.id]).length;
  const progress = Math.round((completedCount / CHECKLIST_ITEMS.length) * 100);

  return (
    <div className="fixed bottom-6 right-6 z-50 w-80 animate-in slide-in-from-bottom-4 fade-in duration-500">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl shadow-slate-200/50 overflow-hidden">
        {/* Header */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors"
        >
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 bg-gradient-to-br from-teal-400 to-indigo-500 rounded-xl flex items-center justify-center flex-shrink-0">
              <svg className="w-4.5 h-4.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="text-left">
              <h3 className="text-sm font-bold text-slate-800">Getting Started</h3>
              <p className="text-xs text-slate-400">{completedCount}/{CHECKLIST_ITEMS.length} complete</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-xs font-bold text-teal-600">{progress}%</span>
            <svg
              className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${collapsed ? '' : 'rotate-180'}`}
              fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </div>
        </button>

        {/* Progress bar */}
        <div className="h-1 bg-slate-100">
          <div
            className="h-full bg-gradient-to-r from-teal-400 to-indigo-500 transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Checklist items */}
        {!collapsed && (
          <div className="p-3 space-y-1">
            {CHECKLIST_ITEMS.map((item) => {
              const done = !!completed[item.id];
              return (
                <div
                  key={item.id}
                  className={`flex items-center space-x-3 p-2.5 rounded-xl transition-colors ${
                    done ? 'opacity-60' : 'hover:bg-slate-50 cursor-pointer'
                  }`}
                  onClick={() => {
                    if (!done && item.route) {
                      navigate(item.route);
                    }
                  }}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!item.autoComplete) toggleItem(item.id);
                    }}
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all duration-200 ${
                      done
                        ? 'bg-teal-500 border-teal-500'
                        : 'border-slate-300 hover:border-teal-400'
                    }`}
                  >
                    {done && (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    )}
                  </button>
                  <span className={`text-sm ${done ? 'text-slate-400 line-through' : 'text-slate-700 font-medium'}`}>
                    {item.label}
                  </span>
                  {!done && item.route && (
                    <svg className="w-3.5 h-3.5 text-slate-300 ml-auto" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                  )}
                </div>
              );
            })}

            {/* Dismiss */}
            <button
              onClick={dismiss}
              className="w-full text-center text-xs text-slate-400 hover:text-slate-600 pt-2 pb-1 transition-colors"
            >
              Dismiss checklist
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ActivationChecklist;
