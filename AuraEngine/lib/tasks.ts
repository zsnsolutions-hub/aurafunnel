// AuraEngine/lib/tasks.ts
//
// Persistent tasks / follow-ups (tasks table). Replaces the previous UI-only
// tasks that were lost on reload. RLS: insert requires
// is_workspace_member(workspace_id) AND created_by = auth.uid(); select/update/
// delete require is_workspace_member(workspace_id). business_id is stamped so the
// task follows the lead's business once per-business scoping is active.
import { supabase } from './supabase';
import { resolveWorkspaceId } from './tenancy';

export type TaskPriority = 'low' | 'normal' | 'high';
export type TaskStatus = 'open' | 'done' | 'cancelled';

export interface LeadTask {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt: string | null;
  assignedTo: string | null;
  createdBy: string | null;
  completedAt: string | null;
  createdAt: string;
}

const COLS = 'id, title, description, status, priority, due_at, assigned_to, created_by, completed_at, created_at';

function map(r: Record<string, unknown>): LeadTask {
  return {
    id: r.id as string,
    title: (r.title as string) ?? '',
    description: (r.description as string) ?? null,
    status: (r.status as TaskStatus) ?? 'open',
    priority: (r.priority as TaskPriority) ?? 'normal',
    dueAt: (r.due_at as string) ?? null,
    assignedTo: (r.assigned_to as string) ?? null,
    createdBy: (r.created_by as string) ?? null,
    completedAt: (r.completed_at as string) ?? null,
    createdAt: r.created_at as string,
  };
}

export async function listTasks(leadId: string): Promise<LeadTask[]> {
  const { data } = await supabase
    .from('tasks')
    .select(COLS)
    .eq('lead_id', leadId)
    .order('status', { ascending: true }) // open before done
    .order('due_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false });
  return (data ?? []).map(map);
}

export interface NewTask {
  title: string;
  description?: string | null;
  priority?: TaskPriority;
  dueAt?: string | null;
  assignedTo?: string | null;
  businessId?: string | null;
}

export async function addTask(userId: string, leadId: string, task: NewTask): Promise<LeadTask | null> {
  const workspaceId = await resolveWorkspaceId(userId);
  const { data, error } = await supabase
    .from('tasks')
    .insert({
      lead_id: leadId,
      workspace_id: workspaceId,
      business_id: task.businessId ?? null,
      created_by: userId,
      assigned_to: task.assignedTo ?? userId,
      title: task.title,
      description: task.description ?? null,
      priority: task.priority ?? 'normal',
      due_at: task.dueAt ?? null,
    })
    .select(COLS)
    .single();
  if (error || !data) { console.error('addTask failed:', error?.message); return null; }
  return map(data);
}

// Toggle done <-> open, stamping/clearing completed_at. Server updated_at trigger
// keeps updated_at fresh. Returns the updated row (null on failure).
export async function setTaskDone(id: string, done: boolean): Promise<LeadTask | null> {
  const { data, error } = await supabase
    .from('tasks')
    .update({ status: done ? 'done' : 'open', completed_at: done ? new Date().toISOString() : null })
    .eq('id', id)
    .select(COLS)
    .single();
  if (error || !data) { console.error('setTaskDone failed:', error?.message); return null; }
  return map(data);
}

export async function deleteTask(id: string): Promise<boolean> {
  const { error } = await supabase.from('tasks').delete().eq('id', id);
  if (error) console.error('deleteTask failed:', error.message);
  return !error;
}
