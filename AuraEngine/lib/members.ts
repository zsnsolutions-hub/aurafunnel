// AuraEngine/lib/members.ts
//
// List the members of the caller's workspace (for assignment pickers etc.).
// Two-step (workspace_members → profiles) rather than a PostgREST embed, since
// there is no direct FK from workspace_members to profiles for an implicit join.
import { supabase } from './supabase';
import { resolveWorkspaceId } from './tenancy';

export interface WorkspaceMember {
  userId: string;
  name: string;
  email: string;
  role: string | null;
}

export async function listWorkspaceMembers(userId: string): Promise<WorkspaceMember[]> {
  const workspaceId = await resolveWorkspaceId(userId);
  const { data: rows } = await supabase
    .from('workspace_members')
    .select('user_id, role')
    .eq('workspace_id', workspaceId);
  const ids = (rows ?? []).map(r => r.user_id as string);
  if (ids.length === 0) return [];
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, name, full_name, email')
    .in('id', ids);
  const byId = new Map((profiles ?? []).map(p => [p.id as string, p]));
  return ids.map(id => {
    const p = byId.get(id) as { name?: string; full_name?: string; email?: string } | undefined;
    const role = (rows ?? []).find(r => r.user_id === id)?.role as string | undefined;
    return {
      userId: id,
      name: p?.name || p?.full_name || p?.email || 'Member',
      email: p?.email || '',
      role: role ?? null,
    };
  });
}
