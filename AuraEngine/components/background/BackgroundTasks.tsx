// AuraEngine/components/background/BackgroundTasks.tsx
//
// A tiny app-level manager for long-running work (e.g. AI lead-research
// enrichment) that must keep running when the user navigates away from the page
// that started it. The provider is mounted once at the app root, so the task
// closure lives outside any route component and is never unmounted by
// navigation. A floating widget shows each running task with a live timer.

import React, { createContext, useContext, useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, CheckCircle2, AlertCircle, X } from 'lucide-react';

export type BgTaskStatus = 'running' | 'done' | 'error';
export interface BgTask {
  id: string;
  label: string;
  startedAt: number;
  endedAt?: number;
  status: BgTaskStatus;
  error?: string;
}

interface BackgroundTasksValue {
  tasks: BgTask[];
  /** Run `fn` as a tracked background task. Resolves/rejects with fn's result. */
  runTask: <T>(label: string, fn: () => Promise<T>) => Promise<T>;
  dismiss: (id: string) => void;
  /** Add/update a task tracked externally (e.g. a server-side job polled from
   *  the DB), keyed by a stable id. */
  upsertExternalTask: (task: BgTask) => void;
  removeExternalTask: (id: string) => void;
}

const BackgroundTasksContext = createContext<BackgroundTasksValue | null>(null);

let taskSeq = 0;

export const BackgroundTasksProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tasks, setTasks] = useState<BgTask[]>([]);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => () => { Object.values(timers.current).forEach(clearTimeout); }, []);

  const dismiss = useCallback((id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id));
    if (timers.current[id]) { clearTimeout(timers.current[id]); delete timers.current[id]; }
  }, []);

  const scheduleRemoval = useCallback((id: string, ms: number) => {
    timers.current[id] = setTimeout(() => {
      setTasks(prev => prev.filter(t => t.id !== id));
      delete timers.current[id];
    }, ms);
  }, []);

  const runTask = useCallback(<T,>(label: string, fn: () => Promise<T>): Promise<T> => {
    const id = `bg-${++taskSeq}`;
    setTasks(prev => [...prev, { id, label, startedAt: Date.now(), status: 'running' }]);
    return fn().then(
      (result) => {
        setTasks(prev => prev.map(t => t.id === id ? { ...t, status: 'done', endedAt: Date.now() } : t));
        scheduleRemoval(id, 6000);
        return result;
      },
      (err) => {
        const msg = err instanceof Error ? err.message : String(err);
        setTasks(prev => prev.map(t => t.id === id ? { ...t, status: 'error', endedAt: Date.now(), error: msg } : t));
        scheduleRemoval(id, 12000);
        throw err;
      },
    );
  }, [scheduleRemoval]);

  const upsertExternalTask = useCallback((task: BgTask) => {
    setTasks(prev => prev.some(t => t.id === task.id)
      ? prev.map(t => t.id === task.id ? { ...t, ...task } : t)
      : [...prev, task]);
  }, []);

  const removeExternalTask = useCallback((id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <BackgroundTasksContext.Provider value={{ tasks, runTask, dismiss, upsertExternalTask, removeExternalTask }}>
      {children}
      <BackgroundTasksIndicator tasks={tasks} onDismiss={dismiss} />
    </BackgroundTasksContext.Provider>
  );
};

export function useBackgroundTasks(): BackgroundTasksValue {
  const ctx = useContext(BackgroundTasksContext);
  if (!ctx) {
    // No provider (e.g. isolated tests) — no-op that still runs the work.
    return {
      tasks: [],
      runTask: (_label, fn) => fn(),
      dismiss: () => {},
      upsertExternalTask: () => {},
      removeExternalTask: () => {},
    };
  }
  return ctx;
}

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const BackgroundTasksIndicator: React.FC<{ tasks: BgTask[]; onDismiss: (id: string) => void }> = ({ tasks, onDismiss }) => {
  // 1s ticker so the running timers update.
  const [, setNow] = useState(Date.now());
  useEffect(() => {
    if (!tasks.some(t => t.status === 'running')) return;
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, [tasks]);

  if (tasks.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 w-72 max-w-[calc(100vw-2rem)] pointer-events-none">
      {tasks.map(t => {
        const elapsed = (t.endedAt ?? Date.now()) - t.startedAt;
        return (
          <div
            key={t.id}
            className="pointer-events-auto flex items-center gap-3 rounded-2xl border bg-white/95 backdrop-blur px-4 py-3 shadow-lg border-slate-200 animate-in slide-in-from-bottom-2 fade-in duration-300"
          >
            <div className="shrink-0">
              {t.status === 'running' && <Loader2 className="w-4 h-4 text-indigo-600 animate-spin" />}
              {t.status === 'done' && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
              {t.status === 'error' && <AlertCircle className="w-4 h-4 text-rose-600" />}
            </div>
            <div className="min-w-0 flex-grow">
              <p className="text-sm font-semibold text-slate-800 truncate">{t.label}</p>
              <p className="text-[11px] text-slate-500 tabular-nums">
                {t.status === 'running' && `Working… ${formatElapsed(elapsed)}`}
                {t.status === 'done' && `Done in ${formatElapsed(elapsed)}`}
                {t.status === 'error' && (t.error ? `Failed — ${t.error}` : 'Failed')}
              </p>
            </div>
            {t.status !== 'running' && (
              <button onClick={() => onDismiss(t.id)} className="shrink-0 text-slate-400 hover:text-slate-600" aria-label="Dismiss">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default BackgroundTasksProvider;
