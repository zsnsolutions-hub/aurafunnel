// AuraEngine/lib/webhooks.ts
//
// Phase 4.3 (UI side) — workspace webhook endpoint CRUD.

import { supabase } from './supabase';

export interface WebhookEndpoint {
  id: string;
  workspace_id: string;
  created_by: string | null;
  url: string;
  secret: string;
  description: string | null;
  event_types: string[];
  enabled: boolean;
  failure_count: number;
  disabled_at: string | null;
  last_attempt_at: string | null;
  last_success_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WebhookDelivery {
  id: string;
  endpoint_id: string;
  workspace_id: string;
  event_type: string;
  payload: unknown;
  status: 'pending' | 'succeeded' | 'failed' | 'dead' | 'processing';
  attempt_count: number;
  last_status_code: number | null;
  last_error: string | null;
  next_attempt_at: string;
  succeeded_at: string | null;
  created_at: string;
}

/** Curated event-type catalogue surfaced in the UI. Empty event_types[] on
 *  the endpoint = subscribe to all of these. */
export const WEBHOOK_EVENTS = [
  'lead.created',
  'lead.updated',
  'lead.deleted',
  'sequence.started',
  'sequence.completed',
  'email.sent',
  'email.opened',
  'email.clicked',
  'email.bounced',
  'campaign.launched',
] as const;
export type WebhookEvent = typeof WEBHOOK_EVENTS[number];

/** Browser-side secret mint. URL-safe, 32 random bytes → 43 chars base64url. */
export function mintWebhookSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function listWebhookEndpoints(workspaceId: string): Promise<WebhookEndpoint[]> {
  const { data, error } = await supabase
    .from('webhook_endpoints')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as WebhookEndpoint[];
}

export async function createWebhookEndpoint(opts: {
  workspaceId: string;
  url: string;
  description?: string;
  eventTypes?: string[];
}): Promise<WebhookEndpoint> {
  if (!/^https:\/\//i.test(opts.url)) throw new Error('URL must start with https://');
  const secret = mintWebhookSecret();
  const { data, error } = await supabase
    .from('webhook_endpoints')
    .insert({
      workspace_id: opts.workspaceId,
      url:          opts.url,
      secret,
      description:  opts.description ?? null,
      event_types:  opts.eventTypes ?? [],
    })
    .select()
    .single();
  if (error) throw error;
  return data as WebhookEndpoint;
}

export async function updateWebhookEndpoint(
  id: string,
  patch: Partial<Pick<WebhookEndpoint, 'url' | 'description' | 'event_types' | 'enabled'>>,
): Promise<WebhookEndpoint> {
  if (patch.url && !/^https:\/\//i.test(patch.url)) throw new Error('URL must start with https://');
  const { data, error } = await supabase
    .from('webhook_endpoints')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as WebhookEndpoint;
}

export async function deleteWebhookEndpoint(id: string): Promise<void> {
  const { error } = await supabase.from('webhook_endpoints').delete().eq('id', id);
  if (error) throw error;
}

export async function listRecentDeliveries(
  endpointId: string,
  limit = 20,
): Promise<WebhookDelivery[]> {
  const { data, error } = await supabase
    .from('webhook_deliveries')
    .select('*')
    .eq('endpoint_id', endpointId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as WebhookDelivery[];
}

/** Re-queue a failed/dead delivery for one more attempt. */
export async function retryDelivery(deliveryId: string): Promise<void> {
  const { error } = await supabase
    .from('webhook_deliveries')
    .update({
      status: 'pending',
      next_attempt_at: new Date().toISOString(),
    })
    .eq('id', deliveryId);
  if (error) throw error;
}

/** Fire a synthetic test event into the endpoint. Goes through the same
 *  fan-out path as real events. */
export async function sendTestEvent(opts: {
  workspaceId: string;
  endpointId: string;
}): Promise<void> {
  // We can't directly target one endpoint from queue_webhook_event (it
  // fans out by workspace+event_type), so insert a webhook_delivery row
  // directly. Service-role only normally, but RLS on webhook_deliveries
  // currently has no INSERT policy for users, so this will need a small
  // RPC. Inline approach: enqueue via queue_webhook_event with a unique
  // event_type and rely on the endpoint's filter being open or matching.
  // For Phase 4.3.UI v1 we accept the limitation: test events only fire
  // if event_types is empty (subscribe-to-all) OR contains 'test.ping'.
  const { error } = await supabase.rpc('queue_webhook_event', {
    p_workspace_id: opts.workspaceId,
    p_event_type:   'test.ping',
    p_payload:      { test: true, sent_at: new Date().toISOString() },
  });
  if (error) throw error;
}
