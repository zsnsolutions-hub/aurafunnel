import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';
import type { Integration, WebhookConfig } from '../types';

// ─── Integration CRUD ───

export async function fetchIntegrations(): Promise<Integration[]> {
  const { data, error } = await supabase
    .from('integrations')
    .select('*')
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch integrations:', error.message);
    return [];
  }

  return (data || []).map(row => ({
    id: row.id,
    provider: row.provider,
    category: row.category,
    status: row.status,
    credentials: row.credentials || {},
    metadata: row.metadata || {},
    updated_at: row.updated_at,
  }));
}

export async function fetchIntegration(provider: string): Promise<Integration | null> {
  const { data, error } = await supabase
    .from('integrations')
    .select('*')
    .eq('provider', provider)
    .limit(1)
    .single();

  if (error || !data) return null;

  return {
    id: data.id,
    provider: data.provider,
    category: data.category,
    status: data.status,
    credentials: data.credentials || {},
    metadata: data.metadata || {},
    updated_at: data.updated_at,
  };
}

export async function upsertIntegration(
  provider: string,
  category: string,
  credentials: Record<string, string>,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('integrations')
    .upsert({
      owner_id: user.id,
      provider,
      category,
      status: 'connected',
      credentials,
      metadata: { ...metadata, lastValidated: new Date().toISOString() },
      updated_at: new Date().toISOString(),
    }, { onConflict: 'owner_id,provider' });

  if (error) throw new Error(`Failed to save integration: ${error.message}`);
}

export async function disconnectIntegration(provider: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('integrations')
    .update({ status: 'disconnected', updated_at: new Date().toISOString() })
    .eq('owner_id', user.id)
    .eq('provider', provider);

  if (error) throw new Error(`Failed to disconnect integration: ${error.message}`);
}

// ─── Webhook CRUD ───

export async function fetchWebhooks(): Promise<WebhookConfig[]> {
  const { data, error } = await supabase
    .from('webhooks')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch webhooks:', error.message);
    return [];
  }

  return (data || []).map(row => ({
    id: row.id,
    name: row.name,
    url: row.url,
    trigger_event: row.trigger_event,
    is_active: row.is_active,
    secret: row.secret || undefined,
    last_fired: row.last_fired || undefined,
    success_rate: row.success_rate ?? 100,
    fire_count: row.fire_count ?? 0,
    fail_count: row.fail_count ?? 0,
  }));
}

export async function upsertWebhook(webhook: Partial<WebhookConfig> & { name: string; url: string; trigger_event: string }): Promise<WebhookConfig> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const row: Record<string, unknown> = {
    owner_id: user.id,
    name: webhook.name,
    url: webhook.url,
    trigger_event: webhook.trigger_event,
    is_active: webhook.is_active ?? true,
    secret: webhook.secret || null,
    updated_at: new Date().toISOString(),
  };

  if (webhook.id) {
    row.id = webhook.id;
  }

  const { data, error } = await supabase
    .from('webhooks')
    .upsert(row, { onConflict: 'id' })
    .select()
    .single();

  if (error) throw new Error(`Failed to save webhook: ${error.message}`);

  return {
    id: data.id,
    name: data.name,
    url: data.url,
    trigger_event: data.trigger_event,
    is_active: data.is_active,
    secret: data.secret || undefined,
    last_fired: data.last_fired || undefined,
    success_rate: data.success_rate ?? 100,
    fire_count: data.fire_count ?? 0,
    fail_count: data.fail_count ?? 0,
  };
}

export async function deleteWebhook(id: string): Promise<void> {
  const { error } = await supabase
    .from('webhooks')
    .delete()
    .eq('id', id);

  if (error) throw new Error(`Failed to delete webhook: ${error.message}`);
}

export async function updateWebhookStats(id: string, success: boolean): Promise<void> {
  const { data: current } = await supabase
    .from('webhooks')
    .select('fire_count, fail_count')
    .eq('id', id)
    .single();

  const fireCount = (current?.fire_count ?? 0) + 1;
  const failCount = (current?.fail_count ?? 0) + (success ? 0 : 1);
  const successRate = fireCount > 0 ? ((fireCount - failCount) / fireCount) * 100 : 100;

  await supabase
    .from('webhooks')
    .update({
      fire_count: fireCount,
      fail_count: failCount,
      success_rate: parseFloat(successRate.toFixed(1)),
      last_fired: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
}

// ─── Validation (calls edge function) ───

export async function validateIntegration(
  provider: string,
  credentials: Record<string, string>
): Promise<{ success: boolean; error?: string; details?: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { success: false, error: 'Not authenticated' };

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/validate-integration`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ provider, credentials }),
    });

    return await res.json();
  } catch (err) {
    return { success: false, error: `Network error: ${(err as Error).message}` };
  }
}

// ─── React Hook: useIntegrations ───

export interface IntegrationStatus {
  provider: string;
  category: string;
  status: 'connected' | 'disconnected' | 'error';
  lastSync?: string;
}

export function useIntegrations() {
  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([]);
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Load non-email integrations from `integrations` table
      const nonEmail = await fetchIntegrations();

      // Load email provider configs from `email_provider_configs` table
      const { data: emailData } = await supabase
        .from('email_provider_configs')
        .select('provider, is_active, updated_at');

      const emailStatuses: IntegrationStatus[] = (emailData || []).map((row: any) => ({
        provider: row.provider,
        category: 'email',
        status: row.is_active ? 'connected' as const : 'disconnected' as const,
        lastSync: row.updated_at,
      }));

      const nonEmailStatuses: IntegrationStatus[] = nonEmail.map(i => ({
        provider: i.provider,
        category: i.category,
        status: i.status,
        lastSync: i.updated_at,
      }));

      setIntegrations([...nonEmailStatuses, ...emailStatuses]);

      // Load webhooks
      const wh = await fetchWebhooks();
      setWebhooks(wh);
    } catch (err) {
      console.error('useIntegrations load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { integrations, webhooks, loading, refetch: load };
}
