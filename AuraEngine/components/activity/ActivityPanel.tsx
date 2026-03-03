/**
 * Activity Panel — persistent drawer showing job progress, errors, and retry actions.
 *
 * Mounted in authenticated layouts. Shows:
 * - Running/queued jobs with progress bars
 * - Recent completed/failed jobs
 * - Retry/cancel actions per job
 * - Job event details on expand
 *
 * Polls active jobs every 3s with backoff when idle.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Activity, X, ChevronRight, ChevronDown,
  CheckCircle, XCircle, Loader2, Clock, RotateCcw, Ban,
  Minimize2, Maximize2,
} from 'lucide-react';
import { Job, JobEvent, listJobs, getJobEvents, cancelJob } from '../../lib/jobs';
import { supabase } from '../../lib/supabase';

const JOB_TYPE_LABELS: Record<string, string> = {
  email_sequence: 'Email Sequence',
  bulk_import: 'Bulk Import',
  apollo_import: 'Apollo Import',
  apollo_search: 'Apollo Search',
  social_publish: 'Social Publish',
  analytics_refresh: 'Analytics Refresh',
  lead_enrichment: 'Lead Enrichment',
  invoice_send: 'Invoice Send',
  integration_validate: 'Integration Validation',
};

const STATUS_CONFIG: Record<string, { icon: React.ReactNode; color: string; bg: string }> = {
  queued:    { icon: <Clock size={14} />,              color: 'text-gray-500',    bg: 'bg-gray-50' },
  running:   { icon: <Loader2 size={14} className="animate-spin" />, color: 'text-indigo-600', bg: 'bg-indigo-50' },
  succeeded: { icon: <CheckCircle size={14} />,        color: 'text-emerald-600', bg: 'bg-emerald-50' },
  failed:    { icon: <XCircle size={14} />,            color: 'text-red-600',     bg: 'bg-red-50' },
  canceled:  { icon: <Ban size={14} />,                color: 'text-gray-400',    bg: 'bg-gray-50' },
};

export const ActivityPanel: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  const [events, setEvents] = useState<Record<string, JobEvent[]>>({});
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Get workspace ID
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setWorkspaceId(data.session.user.id);
    });
  }, []);

  // Poll jobs with adaptive interval
  const fetchJobs = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const data = await listJobs(workspaceId, { limit: 15 });
      setJobs(data);
    } catch {
      // Silent — don't break the panel on fetch errors
    }
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId) return;
    fetchJobs();

    const poll = () => {
      const hasActive = jobs.some(j => j.status === 'queued' || j.status === 'running');
      const interval = hasActive ? 3000 : 15000; // 3s when active, 15s when idle
      pollRef.current = setTimeout(async () => {
        await fetchJobs();
        poll();
      }, interval);
    };

    poll();
    return () => { if (pollRef.current) clearTimeout(pollRef.current); };
  }, [workspaceId, fetchJobs, jobs]);

  // Load events when expanding a job
  const toggleExpand = async (jobId: string) => {
    if (expandedJob === jobId) {
      setExpandedJob(null);
      return;
    }
    setExpandedJob(jobId);
    if (!events[jobId]) {
      try {
        const evts = await getJobEvents(jobId, 20);
        setEvents(prev => ({ ...prev, [jobId]: evts }));
      } catch {
        // Silent
      }
    }
  };

  const handleCancel = async (jobId: string) => {
    try {
      await cancelJob(jobId);
      await fetchJobs();
    } catch {
      // Silent
    }
  };

  const activeCount = jobs.filter(j => j.status === 'queued' || j.status === 'running').length;
  const failedCount = jobs.filter(j => j.status === 'failed').length;

  // Floating trigger button
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-full shadow-lg hover:shadow-xl transition-all group"
      >
        <Activity size={16} className={activeCount > 0 ? 'text-indigo-600 animate-pulse' : 'text-gray-400'} />
        <span className="text-sm font-medium text-gray-700">Activity</span>
        {activeCount > 0 && (
          <span className="w-5 h-5 flex items-center justify-center text-[10px] font-bold text-white bg-indigo-600 rounded-full">
            {activeCount}
          </span>
        )}
        {failedCount > 0 && (
          <span className="w-5 h-5 flex items-center justify-center text-[10px] font-bold text-white bg-red-500 rounded-full">
            {failedCount}
          </span>
        )}
      </button>
    );
  }

  // Panel drawer
  return (
    <div className={`fixed right-0 top-0 bottom-0 z-50 flex flex-col bg-white border-l border-gray-200 shadow-2xl transition-all ${minimized ? 'w-14' : 'w-96'}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50/80">
        {!minimized && (
          <>
            <div className="flex items-center gap-2">
              <Activity size={16} className="text-indigo-600" />
              <span className="text-sm font-semibold text-gray-900">Activity</span>
              {activeCount > 0 && (
                <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-md">{activeCount} active</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setMinimized(true)} className="p-1 text-gray-400 hover:text-gray-600"><Minimize2 size={14} /></button>
              <button onClick={() => setOpen(false)} className="p-1 text-gray-400 hover:text-gray-600"><X size={14} /></button>
            </div>
          </>
        )}
        {minimized && (
          <button onClick={() => setMinimized(false)} className="p-1 text-gray-400 hover:text-gray-600 mx-auto">
            <Maximize2 size={16} />
          </button>
        )}
      </div>

      {/* Job list */}
      {!minimized && (
        <div className="flex-1 overflow-y-auto">
          {jobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-6">
              <Activity size={24} className="text-gray-200 mb-3" />
              <p className="text-sm text-gray-400">No recent activity</p>
              <p className="text-xs text-gray-300 mt-1">Jobs will appear here when you start operations</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {jobs.map(job => {
                const config = STATUS_CONFIG[job.status] ?? STATUS_CONFIG.queued;
                const isExpanded = expandedJob === job.id;
                const progressPct = job.progress_total > 0
                  ? Math.round((job.progress_current / job.progress_total) * 100)
                  : 0;

                return (
                  <div key={job.id} className="group">
                    <button
                      onClick={() => toggleExpand(job.id)}
                      className="w-full text-left px-4 py-3 hover:bg-gray-50/50 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <div className={`mt-0.5 ${config.color}`}>{config.icon}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {JOB_TYPE_LABELS[job.type] ?? job.type}
                            </p>
                            {isExpanded ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
                          </div>

                          {/* Progress bar for running jobs */}
                          {job.status === 'running' && job.progress_total > 0 && (
                            <div className="mt-1.5">
                              <div className="flex items-center justify-between text-[10px] text-gray-400 mb-0.5">
                                <span>{job.progress_current}/{job.progress_total}</span>
                                <span>{progressPct}%</span>
                              </div>
                              <div className="w-full bg-gray-100 rounded-full h-1.5">
                                <div
                                  className="bg-indigo-600 h-1.5 rounded-full transition-all duration-300"
                                  style={{ width: `${progressPct}%` }}
                                />
                              </div>
                            </div>
                          )}

                          {/* Error message for failed jobs */}
                          {job.status === 'failed' && job.error && (
                            <p className="text-xs text-red-500 mt-1 truncate">{job.error}</p>
                          )}

                          {/* Timestamp */}
                          <p className="text-[10px] text-gray-400 mt-1">
                            {new Date(job.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                            {job.request_id && <span className="ml-2 font-mono">{job.request_id.slice(0, 8)}</span>}
                          </p>
                        </div>
                      </div>
                    </button>

                    {/* Expanded: events + actions */}
                    {isExpanded && (
                      <div className="px-4 pb-3 pl-11 space-y-2">
                        {/* Actions */}
                        <div className="flex items-center gap-2">
                          {(job.status === 'queued' || job.status === 'running') && (
                            <button
                              onClick={() => handleCancel(job.id)}
                              className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-600 hover:text-red-700"
                            >
                              <Ban size={11} /> Cancel
                            </button>
                          )}
                          {job.status === 'failed' && (
                            <button className="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-600 hover:text-indigo-700">
                              <RotateCcw size={11} /> Retry
                            </button>
                          )}
                        </div>

                        {/* Result */}
                        {job.result && (
                          <pre className="text-[10px] bg-gray-900 text-gray-100 p-2 rounded-lg overflow-x-auto max-h-24 overflow-y-auto">
                            {JSON.stringify(job.result, null, 2)}
                          </pre>
                        )}

                        {/* Events */}
                        {events[job.id] && events[job.id].length > 0 && (
                          <div className="space-y-1">
                            <p className="text-[10px] font-bold text-gray-500 uppercase">Events</p>
                            {events[job.id].map(evt => (
                              <div key={evt.id} className="flex items-start gap-2 text-[10px]">
                                <span className={
                                  evt.level === 'error' ? 'text-red-500' :
                                  evt.level === 'warn' ? 'text-amber-500' :
                                  'text-gray-400'
                                }>
                                  {evt.level === 'error' ? '!' : evt.level === 'warn' ? '?' : '-'}
                                </span>
                                <span className="text-gray-600">{evt.message}</span>
                                <span className="text-gray-300 ml-auto whitespace-nowrap">
                                  {new Date(evt.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
