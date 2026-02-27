import { supabase } from './supabase';
import { resolvePlanName } from './credits';
import { getOutboundLimits } from './planLimits';
import type { SenderAccount, SenderProvider } from '../types';

// ── Queries ──────────────────────────────────────────────────────────────────

/** List all sender accounts for the current workspace. */
export async function listSenderAccounts(workspaceId: string): Promise<SenderAccount[]> {
  const { data, error } = await supabase
    .from('sender_accounts')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as SenderAccount[];
}

/** Get outreach-enabled accounts only (excludes Mailchimp by default). */
export async function listOutreachAccounts(workspaceId: string): Promise<SenderAccount[]> {
  const { data, error } = await supabase
    .from('sender_accounts')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('use_for_outreach', true)
    .eq('status', 'connected')
    .order('is_default', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as SenderAccount[];
}

/** Get the default sender account. */
export async function getDefaultSender(workspaceId: string): Promise<SenderAccount | null> {
  const { data } = await supabase
    .from('sender_accounts')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('is_default', true)
    .maybeSingle();

  return data as SenderAccount | null;
}

// ── Mutations ────────────────────────────────────────────────────────────────

/** Check if the workspace can add more inboxes under their plan. */
export async function canAddInbox(workspaceId: string, planName: string): Promise<{ allowed: boolean; current: number; max: number }> {
  const resolved = resolvePlanName(planName);
  const limits = getOutboundLimits(resolved);

  const { count, error } = await supabase
    .from('sender_accounts')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('use_for_outreach', true)
    .neq('status', 'disabled');

  if (error) throw new Error(error.message);
  const current = count ?? 0;
  return { allowed: current < limits.maxInboxes, current, max: limits.maxInboxes };
}

/**
 * Add a new sender account (public metadata only).
 * Secrets are stored server-side via the connect_sender_account RPC
 * called from edge functions during OAuth/SMTP/API key flows.
 */
export async function addSenderAccount(params: {
  workspaceId: string;
  provider: SenderProvider;
  displayName: string;
  fromEmail: string;
  fromName?: string;
  useForOutreach?: boolean;
  metadata?: Record<string, unknown>;
}): Promise<SenderAccount> {
  const { data, error } = await supabase
    .from('sender_accounts')
    .insert({
      workspace_id: params.workspaceId,
      provider: params.provider,
      display_name: params.displayName,
      from_email: params.fromEmail,
      from_name: params.fromName ?? '',
      use_for_outreach: params.useForOutreach ?? (params.provider !== 'mailchimp'),
      metadata: params.metadata ?? {},
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as SenderAccount;
}

/** Set a sender account as the default. Clears previous default. */
export async function setDefaultSender(workspaceId: string, senderId: string): Promise<void> {
  // Clear existing default
  await supabase
    .from('sender_accounts')
    .update({ is_default: false })
    .eq('workspace_id', workspaceId)
    .eq('is_default', true);

  // Set new default
  const { error } = await supabase
    .from('sender_accounts')
    .update({ is_default: true })
    .eq('id', senderId)
    .eq('workspace_id', workspaceId);

  if (error) throw new Error(error.message);
}

/** Update sender account status. */
export async function updateSenderStatus(
  senderId: string,
  status: 'connected' | 'needs_reauth' | 'disabled',
): Promise<void> {
  const { error } = await supabase
    .from('sender_accounts')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', senderId);

  if (error) throw new Error(error.message);
}

/** Toggle warm-up for a sender account. */
export async function toggleWarmup(senderId: string, enabled: boolean): Promise<void> {
  const { error } = await supabase
    .from('sender_accounts')
    .update({ warmup_enabled: enabled, updated_at: new Date().toISOString() })
    .eq('id', senderId);

  if (error) throw new Error(error.message);
}

/** Remove a sender account. */
export async function removeSenderAccount(senderId: string): Promise<void> {
  const { error } = await supabase
    .from('sender_accounts')
    .delete()
    .eq('id', senderId);

  if (error) throw new Error(error.message);
}

/** Update display name / from name. */
export async function updateSenderDetails(
  senderId: string,
  updates: { display_name?: string; from_name?: string },
): Promise<void> {
  const { error } = await supabase
    .from('sender_accounts')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', senderId);

  if (error) throw new Error(error.message);
}

// ── Provider helpers ─────────────────────────────────────────────────────────

export const PROVIDER_META: Record<SenderProvider, {
  label: string;
  description: string;
  outreachSafe: boolean;
  complianceNote: string;
}> = {
  gmail: {
    label: 'Gmail / Google Workspace',
    description: 'Connect with OAuth. Best for personalized cold outreach.',
    outreachSafe: true,
    complianceNote: '',
  },
  smtp: {
    label: 'Custom SMTP',
    description: 'Any SMTP provider. App passwords recommended.',
    outreachSafe: true,
    complianceNote: '',
  },
  sendgrid: {
    label: 'SendGrid',
    description: 'Transactional sending via API. Great for high-volume.',
    outreachSafe: true,
    complianceNote: '',
  },
  mailchimp: {
    label: 'Mailchimp',
    description: 'For newsletters and marketing campaigns only.',
    outreachSafe: false,
    complianceNote: 'Mailchimp is designed for opt-in marketing emails. Do not use for cold outreach — this violates their acceptable use policy and will get your account banned.',
  },
};

/** Get human-readable provider label. */
export function getProviderLabel(provider: SenderProvider): string {
  return PROVIDER_META[provider]?.label ?? provider;
}
