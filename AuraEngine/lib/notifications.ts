// AuraEngine/lib/notifications.ts
//
// In-app notifications (notifications table). RLS scopes every row to the
// caller (user_id = auth.uid()), so these queries need no explicit user filter.
// Rows are written server-side (e.g. deliver-task-reminders); the client only
// reads and marks them read.
import { supabase } from './supabase';

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  message: string | null;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

function map(r: Record<string, unknown>): AppNotification {
  return {
    id: r.id as string,
    type: (r.type as string) ?? 'info',
    title: (r.title as string) ?? '',
    message: (r.message as string) ?? null,
    link: (r.link as string) ?? null,
    isRead: Boolean(r.is_read),
    createdAt: r.created_at as string,
  };
}

export async function listNotifications(limit = 20): Promise<AppNotification[]> {
  const { data } = await supabase
    .from('notifications')
    .select('id, type, title, message, link, is_read, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data ?? []).map(map);
}

export async function unreadCount(): Promise<number> {
  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('is_read', false);
  return count ?? 0;
}

export async function markRead(id: string): Promise<void> {
  await supabase.from('notifications').update({ is_read: true }).eq('id', id);
}

export async function markAllRead(): Promise<void> {
  await supabase.from('notifications').update({ is_read: true }).eq('is_read', false);
}
