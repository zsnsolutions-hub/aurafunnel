import React, { useState, useEffect, useRef, useCallback } from 'react';
import { XIcon, CheckIcon, ClockIcon, SparklesIcon, AlertTriangleIcon, RefreshIcon } from '../Icons';
import {
  pollRunProgress,
  triggerWriterWorker,
  cancelRun,
  retryFailedItems,
  type EmailSequenceRun,
  type EmailSequenceRunItem,
} from '../../lib/emailWriterQueue';

interface EmailWriterProgressModalProps {
  isOpen: boolean;
  onClose: () => void;
  runId: string | null;
}

const STATUS_CONFIG = {
  pending: { icon: ClockIcon, color: 'text-slate-400', bg: 'bg-slate-50', label: 'Queued' },
  writing: { icon: SparklesIcon, color: 'text-indigo-500', bg: 'bg-indigo-50', label: 'Writing', animate: true },
  written: { icon: CheckIcon, color: 'text-emerald-500', bg: 'bg-emerald-50', label: 'Done' },
  failed: { icon: AlertTriangleIcon, color: 'text-red-500', bg: 'bg-red-50', label: 'Failed' },
} as const;

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

const EmailWriterProgressModal: React.FC<EmailWriterProgressModalProps> = ({
  isOpen,
  onClose,
  runId,
}) => {
  const [run, setRun] = useState<EmailSequenceRun | null>(null);
  const [items, setItems] = useState<EmailSequenceRunItem[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [cancelling, setCancelling] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(Date.now());

  // Polling loop
  useEffect(() => {
    if (!runId || !isOpen) return;

    startTimeRef.current = Date.now();

    const poll = async () => {
      const progress = await pollRunProgress(runId);
      setRun(progress.run);
      setItems(progress.items);

      // Trigger worker if still processing
      if (progress.run?.status === 'processing') {
        triggerWriterWorker(runId).catch(() => {});
      }

      // Stop polling when terminal
      if (
        progress.run &&
        ['completed', 'failed', 'cancelled'].includes(progress.run.status)
      ) {
        if (pollInterval.current) clearInterval(pollInterval.current);
      }
    };

    poll();
    const pollInterval = { current: setInterval(poll, 1500) };

    return () => {
      if (pollInterval.current) clearInterval(pollInterval.current);
    };
  }, [runId, isOpen]);

  // Elapsed time ticker
  useEffect(() => {
    if (!isOpen || !run) return;

    if (['completed', 'failed', 'cancelled'].includes(run.status)) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isOpen, run?.status]);

  const handleCancel = useCallback(async () => {
    if (!runId || cancelling) return;
    setCancelling(true);
    await cancelRun(runId);
    setCancelling(false);
  }, [runId, cancelling]);

  const handleRetry = useCallback(async () => {
    if (!runId || retrying) return;
    setRetrying(true);
    await retryFailedItems(runId);
    startTimeRef.current = Date.now();
    setRetrying(false);
  }, [runId, retrying]);

  if (!isOpen) return null;

  const isTerminal = run && ['completed', 'failed', 'cancelled'].includes(run.status);
  const pct = run && run.items_total > 0
    ? Math.round(((run.items_done + run.items_failed) / run.items_total) * 100)
    : 0;

  const statusBadge = run ? {
    processing: { text: 'Writing...', cls: 'bg-indigo-100 text-indigo-700' },
    completed: { text: 'Completed', cls: 'bg-emerald-100 text-emerald-700' },
    failed: { text: 'Failed', cls: 'bg-red-100 text-red-700' },
    cancelled: { text: 'Cancelled', cls: 'bg-slate-100 text-slate-600' },
    pending: { text: 'Starting...', cls: 'bg-amber-100 text-amber-700' },
  }[run.status] : null;

  // Group items by step for display
  const stepGroups = new Map<number, EmailSequenceRunItem[]>();
  for (const item of items) {
    const group = stepGroups.get(item.step_index) || [];
    group.push(item);
    stepGroups.set(item.step_index, group);
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div className="flex items-center space-x-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
              isTerminal ? 'bg-slate-100' : 'bg-indigo-100'
            }`}>
              <SparklesIcon className={`w-5 h-5 ${
                isTerminal ? 'text-slate-500' : 'text-indigo-600 animate-pulse'
              }`} />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900">
                {isTerminal ? 'AI Email Writing' : 'AI Writing Emails...'}
              </h2>
              {run && (
                <div className="flex items-center space-x-2 mt-0.5">
                  {statusBadge && (
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusBadge.cls}`}>
                      {statusBadge.text}
                    </span>
                  )}
                  <span className="text-[10px] text-slate-400">
                    {formatElapsed(elapsed)}
                  </span>
                </div>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Progress Bar */}
        {run && (
          <div className="px-5 pt-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-bold text-slate-700">
                {run.items_done} written
                {run.items_failed > 0 && (
                  <span className="text-red-500"> &middot; {run.items_failed} failed</span>
                )}
                <span className="text-slate-400"> &middot; {run.items_total} total</span>
              </span>
              <span className="text-xs font-bold text-indigo-600">{pct}%</span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}

        {/* Items List */}
        <div className="flex-1 overflow-y-auto px-5 py-3 max-h-64">
          {Array.from(stepGroups.entries())
            .sort(([a], [b]) => a - b)
            .map(([stepIdx, stepItems]) => (
              <div key={stepIdx} className="mb-3">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Step {stepIdx + 1}
                </div>
                <div className="space-y-1">
                  {stepItems.map((item) => {
                    const cfg = STATUS_CONFIG[item.status];
                    const Icon = cfg.icon;
                    return (
                      <div
                        key={item.id}
                        className={`flex items-center space-x-2.5 px-3 py-1.5 rounded-lg ${cfg.bg}`}
                      >
                        <Icon
                          className={`w-3.5 h-3.5 flex-shrink-0 ${cfg.color} ${
                            'animate' in cfg && cfg.animate ? 'animate-spin' : ''
                          }`}
                        />
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-semibold text-slate-700 truncate block">
                            {item.lead_name || item.lead_email}
                          </span>
                          {item.lead_company && (
                            <span className="text-[10px] text-slate-400 truncate block">
                              {item.lead_company}
                            </span>
                          )}
                        </div>
                        <span className={`text-[10px] font-bold ${cfg.color}`}>
                          {cfg.label}
                        </span>
                        {item.status === 'failed' && item.error_message && (
                          <span
                            className="text-[10px] text-red-400 truncate max-w-[120px]"
                            title={item.error_message}
                          >
                            {item.error_message.slice(0, 40)}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

          {items.length === 0 && (
            <div className="text-center py-8">
              <SparklesIcon className="w-8 h-8 text-indigo-300 mx-auto mb-2 animate-pulse" />
              <p className="text-xs text-slate-400">Initializing AI writer...</p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end space-x-2 px-5 py-4 border-t border-slate-100">
          {/* Cancel — visible during processing */}
          {run?.status === 'processing' && (
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className="px-4 py-2 text-xs font-bold text-red-600 border border-red-200 rounded-xl hover:bg-red-50 transition-all disabled:opacity-50"
            >
              {cancelling ? 'Cancelling...' : 'Cancel'}
            </button>
          )}

          {/* Retry Failed — visible when there are failed items */}
          {run && run.items_failed > 0 && ['completed', 'processing'].includes(run.status) && (
            <button
              onClick={handleRetry}
              disabled={retrying}
              className="flex items-center space-x-1.5 px-4 py-2 text-xs font-bold text-amber-600 border border-amber-200 rounded-xl hover:bg-amber-50 transition-all disabled:opacity-50"
            >
              <RefreshIcon className="w-3.5 h-3.5" />
              <span>{retrying ? 'Retrying...' : 'Retry Failed'}</span>
            </button>
          )}

          {/* Close — always visible */}
          <button
            onClick={onClose}
            className={`px-5 py-2 text-xs font-bold rounded-xl transition-all ${
              isTerminal
                ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {isTerminal ? 'Done' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EmailWriterProgressModal;
