// AuraEngine/lib/businesses.ts
//
// Client data layer for the multi-business system (Growth Platform v2, Phase A).
// Reads/writes the `businesses` table and its RPCs (create_business /
// get_or_create_default_business) added by migration 20260711100000. RLS scopes
// every read to the caller's business_members, so no client-side tenant filter
// is needed here.

import { supabase } from './supabase';
import { resolveWorkspaceForUser } from './memory';

export interface Business {
  id: string;
  workspace_id: string;
  name: string;
  website: string | null;
  industry: string | null;
  description: string | null;
  logo_url: string | null;
  default_tone: string | null;
  status: 'active' | 'archived';
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** All active businesses the current user can access (RLS-scoped), oldest first. */
export async function listBusinesses(): Promise<Business[]> {
  const { data, error } = await supabase
    .from('businesses')
    .select('*')
    .eq('status', 'active')
    .order('created_at', { ascending: true });
  if (error) {
    console.warn('[businesses] list failed:', error.message);
    return [];
  }
  return (data ?? []) as Business[];
}

/** Ensure the user has at least one business; returns its id. */
export async function getOrCreateDefaultBusinessId(): Promise<string | null> {
  const { data, error } = await supabase.rpc('get_or_create_default_business');
  if (error) {
    console.warn('[businesses] default resolve failed:', error.message);
    return null;
  }
  return (data as string | null) ?? null;
}

export interface NewBusinessInput {
  name: string;
  website?: string | null;
  industry?: string | null;
  description?: string | null;
  defaultTone?: string | null;
}

/** Create a business (+ owner membership + empty profile) atomically via RPC. */
export async function createBusiness(input: NewBusinessInput): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Your session has expired. Please sign in again.');

  const workspaceId = await resolveWorkspaceForUser(user.id);
  if (!workspaceId) throw new Error('No workspace found for this account.');

  const { data, error } = await supabase.rpc('create_business', {
    p_workspace_id: workspaceId,
    p_name: input.name,
    p_website: input.website ?? null,
    p_industry: input.industry ?? null,
    p_description: input.description ?? null,
    p_default_tone: input.defaultTone ?? null,
  });
  if (error) throw new Error(error.message);
  return (data as string | null) ?? null;
}

export type BusinessPatch = Partial<
  Pick<Business, 'name' | 'website' | 'industry' | 'description' | 'default_tone' | 'logo_url' | 'status'>
>;

export async function updateBusiness(id: string, patch: BusinessPatch): Promise<void> {
  const { error } = await supabase
    .from('businesses')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

/** Soft-remove: archive (reversible). Hard delete is intentionally not exposed here. */
export async function archiveBusiness(id: string): Promise<void> {
  await updateBusiness(id, { status: 'archived' });
}
