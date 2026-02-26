import { supabase } from './supabase';

interface AuditEntry {
  session_id: string | null;
  admin_id: string;
  target_user_id: string;
  action: string;
  resource_type?: string;
  resource_id?: string;
  details?: Record<string, unknown>;
}

/**
 * Insert a row into support_audit_logs.
 * Silently swallows errors so callers don't break on audit failures.
 */
export async function logSupportAction(entry: AuditEntry): Promise<void> {
  try {
    await supabase.from('support_audit_logs').insert({
      session_id: entry.session_id,
      admin_id: entry.admin_id,
      target_user_id: entry.target_user_id,
      action: entry.action,
      resource_type: entry.resource_type ?? null,
      resource_id: entry.resource_id ?? null,
      details: entry.details ?? {},
    });
  } catch {
    // audit logging should never block the caller
  }
}
