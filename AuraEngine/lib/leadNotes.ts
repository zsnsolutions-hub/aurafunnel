// AuraEngine/lib/leadNotes.ts
//
// Persistent lead notes (lead_notes). Replaces the previous UI-only notes that
// were lost on reload. RLS: insert requires is_workspace_member(workspace_id)
// AND author_id = auth.uid(); delete/update require author_id = auth.uid().
import { supabase } from './supabase';
import { resolveWorkspaceId } from './tenancy';

export interface LeadNote {
  id: string;
  text: string;
  createdAt: string;
  authorId: string | null;
  isAi: boolean;
}

function map(r: Record<string, unknown>): LeadNote {
  return {
    id: r.id as string,
    text: (r.content as string) ?? '',
    createdAt: r.created_at as string,
    authorId: (r.author_id as string) ?? null,
    isAi: Boolean(r.is_ai_generated),
  };
}

export async function listNotes(leadId: string): Promise<LeadNote[]> {
  const { data } = await supabase
    .from('lead_notes')
    .select('id, content, created_at, author_id, is_ai_generated')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false });
  return (data ?? []).map(map);
}

export async function addNote(userId: string, leadId: string, content: string, isAi = false): Promise<LeadNote | null> {
  const workspaceId = await resolveWorkspaceId(userId);
  const { data, error } = await supabase
    .from('lead_notes')
    .insert({ lead_id: leadId, workspace_id: workspaceId, author_id: userId, content, is_ai_generated: isAi })
    .select('id, content, created_at, author_id, is_ai_generated')
    .single();
  if (error || !data) { console.error('addNote failed:', error?.message); return null; }
  return map(data);
}

export async function deleteNote(id: string): Promise<boolean> {
  const { error } = await supabase.from('lead_notes').delete().eq('id', id);
  if (error) console.error('deleteNote failed:', error.message);
  return !error;
}
