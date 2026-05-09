// AuraEngine/lib/apiKeys.ts
//
// Phase 4.1 — Client helpers for API key management.
//
// Token generation happens client-side: we mint random bytes, base64url
// encode, prefix with "scal_", show the user the plaintext once, and
// only the SHA-256 hash is persisted server-side via the create_api_key
// RPC. The plaintext leaves browser memory the moment the user dismisses
// the "save it now" modal — there's no recovery path.

import { supabase } from './supabase';

export interface ApiKeyRow {
  id: string;
  workspace_id: string;
  created_by: string | null;
  label: string;
  key_prefix: string;
  scopes: string[];
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export const SCOPES = [
  'leads.read',
  'leads.write',
  'campaigns.read',
  'campaigns.write',
  'analytics.read',
] as const;
export type ApiScope = typeof SCOPES[number];

/**
 * Generate a fresh `scal_<43chars>` token in the browser. Uses
 * crypto.getRandomValues for entropy.
 */
export function mintTokenPlaintext(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  // base64url
  const b64 = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `scal_${b64}`;
}

export async function listApiKeys(workspaceId: string): Promise<ApiKeyRow[]> {
  const { data, error } = await supabase
    .from('api_keys')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as ApiKeyRow[];
}

/**
 * Mint a key locally, hand the plaintext to the SQL RPC for hashing+storage.
 * Returns { id, plaintext } — the caller MUST surface the plaintext to the
 * user immediately because we never see it again.
 */
export async function createApiKey(opts: {
  workspaceId: string;
  label: string;
  scopes: ApiScope[];
  expiresAt?: Date | null;
}): Promise<{ id: string; plaintext: string }> {
  const plaintext = mintTokenPlaintext();
  const { data, error } = await supabase.rpc('create_api_key', {
    p_workspace_id: opts.workspaceId,
    p_label:        opts.label,
    p_plaintext:    plaintext,
    p_scopes:       opts.scopes,
    p_expires_at:   opts.expiresAt ? opts.expiresAt.toISOString() : null,
  });
  if (error) throw error;
  return { id: data as string, plaintext };
}

export async function revokeApiKey(id: string): Promise<void> {
  const { error } = await supabase.rpc('revoke_api_key', { p_key_id: id });
  if (error) throw error;
}
