// AuraEngine/lib/invitations.ts
//
// Client wrapper for the ONE canonical invitation workflow (workspace_invites).
// All writes go through SECURITY DEFINER RPCs — the client cannot self-join a
// workspace or business, and cannot create/accept/revoke without authorization.
// Replaces the two disconnected team-invite paths (team_invites / teamhub_invites).
import { supabase } from './supabase';

export type WorkspaceRole = 'admin' | 'member' | 'viewer';

export interface WorkspaceInvite {
  id: string;
  workspace_id: string;
  email: string;
  role: WorkspaceRole;
  business_id: string | null;
  name: string | null;
  status: 'pending' | 'accepted' | 'revoked';
  expires_at: string | null;
  created_at: string;
}

/** Owner/admin only (enforced server-side). Returns the invite id + token, or an
 *  error message. The token is what the invitee uses to accept. */
export async function createInvite(
  email: string,
  role: WorkspaceRole = 'member',
  businessId?: string | null,
  name?: string | null,
): Promise<{ inviteId: string; token: string } | { error: string }> {
  const { data, error } = await supabase.rpc('create_workspace_invite', {
    p_email: email,
    p_role: role,
    p_business_id: businessId ?? null,
    p_name: name ?? null,
  });
  if (error) return { error: error.message };
  if (!data?.success) return { error: data?.message ?? 'Could not create invite' };
  return { inviteId: data.invite_id, token: data.token };
}

/** Accept an invite by its token (the invitee's email must match). */
export async function acceptInvite(token: string): Promise<{ workspaceId: string; businessId: string | null } | { error: string }> {
  const { data, error } = await supabase.rpc('accept_workspace_invite', { p_token: token });
  if (error) return { error: error.message };
  if (!data?.success) return { error: data?.message ?? 'Could not accept invite' };
  return { workspaceId: data.workspace_id, businessId: data.business_id ?? null };
}

/** Owner/admin only. Marks the invite revoked. */
export async function revokeInvite(inviteId: string): Promise<{ ok: true } | { error: string }> {
  const { data, error } = await supabase.rpc('revoke_workspace_invite', { p_invite_id: inviteId });
  if (error) return { error: error.message };
  if (!data?.success) return { error: data?.message ?? 'Could not revoke invite' };
  return { ok: true };
}

/** List invites the caller can see (their workspace's, if owner/admin; or their own). */
export async function listInvites(status?: WorkspaceInvite['status']): Promise<WorkspaceInvite[]> {
  let q = supabase
    .from('workspace_invites')
    .select('id, workspace_id, email, role, business_id, name, status, expires_at, created_at')
    .order('created_at', { ascending: false });
  if (status) q = q.eq('status', status);
  const { data } = await q;
  return (data ?? []) as WorkspaceInvite[];
}

/** Pending invites addressed to the current user's email (for an accept banner). */
export async function myPendingInvites(email: string): Promise<WorkspaceInvite[]> {
  const { data } = await supabase
    .from('workspace_invites')
    .select('id, workspace_id, email, role, business_id, name, status, expires_at, created_at')
    .eq('status', 'pending')
    .ilike('email', email)
    .order('created_at', { ascending: false });
  return (data ?? []) as WorkspaceInvite[];
}
