// AuraEngine/pages/portal/WebhooksPage.tsx
//
// Phase 4.3 (UI) — workspace webhook endpoint management.

import React, { useEffect, useState, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Webhook, Plus, Trash2, Power, AlertTriangle, CheckCircle, Send, Clipboard, Check,
  ChevronDown, ChevronRight, RefreshCw,
} from 'lucide-react';
import type { User } from '../../types';
import { supabase } from '../../lib/supabase';
import {
  listWebhookEndpoints, createWebhookEndpoint, updateWebhookEndpoint,
  deleteWebhookEndpoint, listRecentDeliveries, retryDelivery, sendTestEvent,
  WEBHOOK_EVENTS, type WebhookEndpoint,
} from '../../lib/webhooks';

interface LayoutContext { user: User }

const STATUS_TONE: Record<string, string> = {
  succeeded: 'emerald', pending: 'slate', processing: 'indigo',
  failed: 'amber', dead: 'rose',
};

const WebhooksPage: React.FC = () => {
  const { user } = useOutletContext<LayoutContext>();

  const { data: workspaceId = null } = useQuery<string | null>({
    queryKey: ['webhooks-workspace', user.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', user.id)
        .order('joined_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      return (data?.workspace_id as string | undefined) ?? null;
    },
    staleTime: 5 * 60_000,
  });

  const [endpoints, setEndpoints] = useState<WebhookEndpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [secretJustRevealed, setSecretJustRevealed] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try { setEndpoints(await listWebhookEndpoints(workspaceId)); }
    finally { setLoading(false); }
  }, [workspaceId]);

  useEffect(() => { refresh(); }, [refresh]);

  const toggle = async (e: WebhookEndpoint) => {
    await updateWebhookEndpoint(e.id, { enabled: !e.enabled });
    refresh();
  };

  const remove = async (e: WebhookEndpoint) => {
    if (!confirm(`Delete "${e.url}"? Pending deliveries will be cancelled.`)) return;
    await deleteWebhookEndpoint(e.id);
    refresh();
  };

  const test = async (e: WebhookEndpoint) => {
    if (!workspaceId) return;
    try {
      await sendTestEvent({ workspaceId, endpointId: e.id });
      alert('Test event queued. It will be delivered on the next dispatcher tick (≤ 1 minute). Open this endpoint to view delivery status.');
    } catch (err) {
      alert((err as Error).message);
    }
  };

  return (
    <div className="px-6 py-8 max-w-5xl mx-auto space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Webhook size={20} className="text-indigo-500" />
            Webhooks
          </h1>
          <p className="text-slate-600 mt-2 max-w-xl">
            Subscribe HTTPS endpoints to events from your workspace. Payloads are
            signed with HMAC-SHA256; verify the <code className="font-mono text-xs">X-Scaliyo-Signature</code> header
            to confirm authenticity.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          disabled={!workspaceId}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-50"
        >
          <Plus size={16} /> Add endpoint
        </button>
      </header>

      <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-700">
        <p className="font-semibold mb-1">Verifying the signature</p>
        <pre className="text-xs bg-white border border-slate-200 rounded-lg p-2 overflow-x-auto"><code>{`# header:  X-Scaliyo-Signature: t=<unix>,v1=<hex hmac-sha256(t.body, secret)>
expected = hmac_sha256(secret, f"{ts}.{body}")
assert hmac.compare_digest(expected, sig)`}</code></pre>
        <p className="text-xs text-slate-500 mt-2">
          Backoff schedule: 1m → 5m → 30m → 2h → 12h → dead at 5 attempts.
          Endpoints auto-disable after 50 consecutive failures.
        </p>
      </div>

      {loading ? (
        <div className="h-24 rounded-2xl bg-slate-100 animate-pulse" />
      ) : endpoints.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
          No webhook endpoints yet. Add one to start receiving event notifications.
        </div>
      ) : (
        <div className="space-y-3">
          {endpoints.map((e) => (
            <EndpointCard
              key={e.id}
              endpoint={e}
              expanded={expanded === e.id}
              onExpand={() => setExpanded(expanded === e.id ? null : e.id)}
              onToggle={() => toggle(e)}
              onTest={() => test(e)}
              onDelete={() => remove(e)}
            />
          ))}
        </div>
      )}

      {showCreate && workspaceId && (
        <CreateModal
          workspaceId={workspaceId}
          onClose={() => setShowCreate(false)}
          onCreated={(secret) => {
            setShowCreate(false);
            setSecretJustRevealed(secret);
            refresh();
          }}
        />
      )}

      {secretJustRevealed && (
        <SecretRevealModal
          secret={secretJustRevealed}
          onClose={() => setSecretJustRevealed(null)}
        />
      )}
    </div>
  );
};

// ── Endpoint card with expandable deliveries section ────────────────────

const EndpointCard: React.FC<{
  endpoint: WebhookEndpoint;
  expanded: boolean;
  onExpand: () => void;
  onToggle: () => void;
  onTest: () => void;
  onDelete: () => void;
}> = ({ endpoint: e, expanded, onExpand, onToggle, onTest, onDelete }) => {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white">
      <div className="p-4 flex items-start gap-3">
        <button onClick={onExpand} className="mt-1 text-slate-400 hover:text-slate-700">
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm text-slate-900 truncate">{e.url}</span>
            {e.enabled ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold">
                <CheckCircle size={10} /> Enabled
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[10px] font-bold">
                Disabled
              </span>
            )}
            {e.failure_count > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[10px] font-bold">
                <AlertTriangle size={10} /> {e.failure_count} fails
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">{e.description ?? 'No description'}</p>
          <div className="flex flex-wrap gap-1 mt-2">
            {e.event_types.length === 0 ? (
              <span className="text-[10px] text-slate-400 italic">all events</span>
            ) : e.event_types.map((t) => (
              <span key={t} className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[10px] font-mono">{t}</span>
            ))}
          </div>
          <div className="flex gap-3 mt-2 text-[10px] text-slate-400">
            <span>Last success: {e.last_success_at ? new Date(e.last_success_at).toLocaleString() : 'never'}</span>
            <span>Last attempt: {e.last_attempt_at ? new Date(e.last_attempt_at).toLocaleString() : 'never'}</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onTest} className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50" title="Send test">
            <Send size={14} />
          </button>
          <button onClick={onToggle} className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50" title={e.enabled ? 'Disable' : 'Enable'}>
            <Power size={14} />
          </button>
          <button onClick={onDelete} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50" title="Delete">
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      {expanded && <DeliveriesPanel endpointId={e.id} />}
    </div>
  );
};

// ── Recent deliveries panel ─────────────────────────────────────────────

const DeliveriesPanel: React.FC<{ endpointId: string }> = ({ endpointId }) => {
  const { data: deliveries = [], isLoading, refetch } = useQuery({
    queryKey: ['webhook-deliveries', endpointId],
    queryFn: () => listRecentDeliveries(endpointId, 20),
    staleTime: 10_000,
  });

  return (
    <div className="border-t border-slate-100 px-4 py-3 bg-slate-50/50">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Recent deliveries</p>
        <button onClick={() => refetch()} className="text-xs text-indigo-600 hover:underline inline-flex items-center gap-1">
          <RefreshCw size={11} /> Refresh
        </button>
      </div>
      {isLoading ? (
        <div className="h-12 bg-slate-100 rounded animate-pulse" />
      ) : deliveries.length === 0 ? (
        <p className="text-xs text-slate-400 italic py-2">No deliveries yet.</p>
      ) : (
        <div className="space-y-1">
          {deliveries.map((d) => {
            const tone = STATUS_TONE[d.status] ?? 'slate';
            return (
              <div key={d.id} className="flex items-center gap-2 text-xs py-1.5 px-2 rounded hover:bg-white">
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold bg-${tone}-50 text-${tone}-700 shrink-0`}>{d.status}</span>
                <span className="font-mono text-slate-700 shrink-0">{d.event_type}</span>
                <span className="text-slate-400 shrink-0">attempt {d.attempt_count}</span>
                {d.last_status_code != null && <span className="text-slate-400 shrink-0">HTTP {d.last_status_code}</span>}
                <span className="text-slate-500 truncate flex-1">{d.last_error || ''}</span>
                <span className="text-slate-400 shrink-0">{new Date(d.created_at).toLocaleString()}</span>
                {(d.status === 'failed' || d.status === 'dead') && (
                  <button
                    onClick={async () => { await retryDelivery(d.id); refetch(); }}
                    className="text-indigo-600 hover:underline shrink-0"
                  >
                    retry
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ── Create-endpoint modal ──────────────────────────────────────────────

const CreateModal: React.FC<{
  workspaceId: string;
  onClose: () => void;
  onCreated: (secret: string) => void;
}> = ({ workspaceId, onClose, onCreated }) => {
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [eventTypes, setEventTypes] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleEvt = (t: string) =>
    setEventTypes((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]);

  const handleCreate = async () => {
    setError(null);
    if (!url.trim()) { setError('URL is required'); return; }
    setCreating(true);
    try {
      const created = await createWebhookEndpoint({
        workspaceId,
        url: url.trim(),
        description: description.trim() || undefined,
        eventTypes,
      });
      onCreated(created.secret);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-4">
        <h3 className="text-lg font-bold text-slate-900">Add webhook endpoint</h3>

        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">URL (https only)</label>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://api.yourapp.com/webhooks/scaliyo"
            className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-indigo-500"
            autoFocus
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Description (optional)</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What this integration does"
            className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">
            Events ({eventTypes.length === 0 ? 'all' : eventTypes.length + ' selected'})
          </label>
          <div className="grid grid-cols-2 gap-1 max-h-44 overflow-y-auto p-2 rounded-xl border border-slate-200">
            {WEBHOOK_EVENTS.map((t) => (
              <label key={t} className="flex items-center gap-2 text-xs cursor-pointer p-1 rounded hover:bg-slate-50">
                <input type="checkbox" checked={eventTypes.includes(t)} onChange={() => toggleEvt(t)} />
                <span className="font-mono">{t}</span>
              </label>
            ))}
          </div>
          <p className="text-[10px] text-slate-400 mt-1">Select none to subscribe to all events.</p>
        </div>

        {error && <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-2">{error}</div>}

        <div className="flex items-center gap-2 pt-2">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold hover:bg-slate-50">Cancel</button>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="flex-1 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-50"
          >
            {creating ? 'Creating…' : 'Create endpoint'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── "Save this secret now" modal ───────────────────────────────────────

const SecretRevealModal: React.FC<{ secret: string; onClose: () => void }> = ({ secret, onClose }) => {
  const [copied, setCopied] = useState(false);
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="text-amber-500 shrink-0" size={22} />
          <div>
            <h3 className="text-lg font-bold text-slate-900">Save this signing secret</h3>
            <p className="text-sm text-slate-600 mt-1">
              You'll need this to verify the <code className="font-mono text-xs">X-Scaliyo-Signature</code> header
              on incoming webhook requests. It won't be shown again — anyone with the
              endpoint id can copy from here, but the secret value never leaves this dialog.
            </p>
          </div>
        </div>
        <pre className="bg-slate-900 text-emerald-300 rounded-xl p-3 font-mono text-xs break-all whitespace-pre-wrap">{secret}</pre>
        <div className="flex items-center gap-2">
          <button
            onClick={async () => { await navigator.clipboard.writeText(secret); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800"
          >
            {copied ? <><Check size={14} /> Copied</> : <><Clipboard size={14} /> Copy</>}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold hover:bg-slate-50">I've saved it</button>
        </div>
      </div>
    </div>
  );
};

export default WebhooksPage;
