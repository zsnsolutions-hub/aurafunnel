/**
 * Enhanced audit logging for Admin Console actions.
 *
 * Builds on top of the existing audit_logs table and adminActions.ts pattern.
 * Adds: before/after diff, entity type/uid tracking, structured action taxonomy.
 */
import { supabase } from './supabase';

// ── Types ────────────────────────────────────────────────────

export interface AuditLogEntry {
  actor: string;           // auth.uid() of the admin performing the action
  action: AuditAction;     // structured action name
  entityType: EntityType;  // what kind of thing was changed
  entityUid?: string;      // ID of the specific entity
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  meta?: Record<string, unknown>;
}

export type AuditAction =
  // User management
  | 'user.role_change'
  | 'user.plan_change'
  | 'user.suspend'
  | 'user.unsuspend'
  | 'user.credit_grant'
  | 'user.credit_adjust'
  | 'user.usage_reset'
  | 'user.entitlement_update'
  // Config
  | 'config.update'
  | 'config.feature_flag_toggle'
  | 'plan.create'
  | 'plan.update'
  | 'plan.clone'
  // Data operations
  | 'data.import_run'
  | 'data.repair_action'
  | 'data.email_queue_kick'
  | 'data.scheduled_email_kick'
  | 'data.analytics_refresh'
  | 'data.stuck_items_reset'
  // Security
  | 'security.support_session_start'
  | 'security.support_session_end'
  | 'security.diagnostic_export'
  // DNA Registry
  | 'dna.create'
  | 'dna.update'
  | 'dna.delete'
  | 'dna.toggle_active'
  | 'dna.restore_version'
  // Generic fallback
  | 'admin.action';

export type EntityType =
  | 'user' | 'plan' | 'config' | 'feature_flag'
  | 'import_batch' | 'email_queue' | 'scheduled_email'
  | 'integration' | 'dna_blueprint' | 'support_session'
  | 'system';

// ── Sensitive field redaction ────────────────────────────────

const REDACT_KEYS = new Set([
  'token', 'secret', 'password', 'api_key', 'credentials',
  'access_token', 'refresh_token', 'private_key', 'smtp_password',
]);

function redact(obj: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (REDACT_KEYS.has(k.toLowerCase())) {
      clean[k] = '[REDACTED]';
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      clean[k] = redact(v as Record<string, unknown>);
    } else {
      clean[k] = v;
    }
  }
  return clean;
}

// ── Diff computation ─────────────────────────────────────────

function computeDiff(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
): Record<string, { from: unknown; to: unknown }> | null {
  if (!before || !after) return null;
  const diff: Record<string, { from: unknown; to: unknown }> = {};
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of allKeys) {
    const b = before[key];
    const a = after[key];
    if (JSON.stringify(b) !== JSON.stringify(a)) {
      diff[key] = { from: b, to: a };
    }
  }
  return Object.keys(diff).length > 0 ? diff : null;
}

// ── Core logger ──────────────────────────────────────────────

/**
 * Write a structured audit log entry. Never throws — audit should never block.
 *
 * Usage:
 *   await logAudit({
 *     actor: userId,
 *     action: 'user.role_change',
 *     entityType: 'user',
 *     entityUid: targetUserId,
 *     before: { role: 'CLIENT' },
 *     after: { role: 'ADMIN' },
 *   });
 */
export async function logAudit(entry: AuditLogEntry): Promise<void> {
  try {
    const diff = computeDiff(entry.before, entry.after);
    const details: Record<string, unknown> = {
      ...(entry.meta ? redact(entry.meta) : {}),
      entity_type: entry.entityType,
    };
    if (entry.before) details.before = redact(entry.before);
    if (entry.after) details.after = redact(entry.after);
    if (diff) details.diff = diff;

    await supabase.from('audit_logs').insert({
      user_id: entry.actor,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityUid ?? null,
      details,
    });
  } catch {
    // Audit logging must never block the calling operation
  }
}

// ── Convenience builders ─────────────────────────────────────

/** Log a user management action */
export function logUserAction(
  actor: string,
  action: AuditAction,
  targetUserId: string,
  before?: Record<string, unknown>,
  after?: Record<string, unknown>,
) {
  return logAudit({ actor, action, entityType: 'user', entityUid: targetUserId, before, after });
}

/** Log a config change */
export function logConfigAction(
  actor: string,
  action: AuditAction,
  entityUid: string,
  before?: Record<string, unknown>,
  after?: Record<string, unknown>,
) {
  return logAudit({ actor, action, entityType: 'config', entityUid, before, after });
}

/** Log a data/repair operation */
export function logDataOp(
  actor: string,
  action: AuditAction,
  meta?: Record<string, unknown>,
) {
  return logAudit({ actor, action, entityType: 'system', meta });
}
