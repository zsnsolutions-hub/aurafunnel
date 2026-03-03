import { supabase } from './supabase';
import { logSupportAction } from './supportAudit';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ActionResult {
  success: boolean;
  message: string;
  data?: unknown;
  requestId: string;
  durationMs: number;
}

export interface ActionOptions {
  /** If true, skip the actual mutation and only validate + return what would happen. */
  dryRun?: boolean;
  /** Support session ID — if provided, also logs to support_audit_logs. */
  supportSessionId?: string | null;
  /** Target user ID for support audit log context. */
  targetUserId?: string;
}

// ── Sensitive field redaction ────────────────────────────────────────────────

const REDACT_KEYS = new Set([
  'token', 'secret', 'password', 'api_key', 'credentials',
  'access_token', 'refresh_token', 'private_key', 'smtp_password',
  'sender_account_secrets',
]);

function redactPayload(obj: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (REDACT_KEYS.has(k.toLowerCase())) {
      clean[k] = '[REDACTED]';
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      clean[k] = redactPayload(v as Record<string, unknown>);
    } else {
      clean[k] = v;
    }
  }
  return clean;
}

// ── Request ID generator ────────────────────────────────────────────────────

function generateRequestId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `req_${ts}_${rand}`;
}

// ── Core action executor ────────────────────────────────────────────────────

/**
 * Execute an admin RPC with full audit logging, redaction, and error handling.
 */
export async function executeRpc(
  adminId: string,
  rpcName: string,
  params: Record<string, unknown>,
  actionLabel: string,
  opts: ActionOptions = {},
): Promise<ActionResult> {
  const requestId = generateRequestId();
  const startMs = performance.now();
  const redacted = redactPayload(params);

  if (opts.dryRun) {
    return {
      success: true,
      message: `[DRY RUN] Would call ${rpcName} with ${JSON.stringify(redacted)}`,
      requestId,
      durationMs: 0,
    };
  }

  try {
    const { data, error } = await supabase.rpc(rpcName, params);
    const durationMs = Math.round(performance.now() - startMs);

    if (error) {
      // Log failure to audit
      await logAudit(adminId, actionLabel + '_FAILED', {
        rpc: rpcName, params: redacted, error: error.message, requestId,
      });
      return { success: false, message: error.message, requestId, durationMs };
    }

    const result = data as { success?: boolean; message?: string } | null;
    if (result && result.success === false) {
      return { success: false, message: result.message || 'RPC returned failure', data: result, requestId, durationMs };
    }

    // Support audit if session active
    if (opts.supportSessionId && opts.targetUserId) {
      await logSupportAction({
        session_id: opts.supportSessionId,
        admin_id: adminId,
        target_user_id: opts.targetUserId,
        action: actionLabel,
        details: { rpc: rpcName, params: redacted, result: data, requestId },
      });
    }

    return {
      success: true,
      message: result?.message || `${actionLabel} completed`,
      data: result,
      requestId,
      durationMs,
    };
  } catch (err) {
    const durationMs = Math.round(performance.now() - startMs);
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, message: msg, requestId, durationMs };
  }
}

/**
 * Execute an admin edge function with full audit logging.
 */
export async function executeEdgeFn(
  adminId: string,
  fnName: string,
  payload: Record<string, unknown>,
  actionLabel: string,
  opts: ActionOptions = {},
): Promise<ActionResult> {
  const requestId = generateRequestId();
  const startMs = performance.now();
  const redacted = redactPayload(payload);

  if (opts.dryRun) {
    return {
      success: true,
      message: `[DRY RUN] Would invoke ${fnName} with ${JSON.stringify(redacted)}`,
      requestId,
      durationMs: 0,
    };
  }

  try {
    const res = await supabase.functions.invoke(fnName, { body: payload });
    const durationMs = Math.round(performance.now() - startMs);

    if (res.error) {
      await logAudit(adminId, actionLabel + '_FAILED', {
        fn: fnName, params: redacted, error: res.error.message, requestId,
      });
      return { success: false, message: res.error.message, requestId, durationMs };
    }

    // Log success
    await logAudit(adminId, actionLabel, {
      fn: fnName, params: redacted, requestId,
    });

    if (opts.supportSessionId && opts.targetUserId) {
      await logSupportAction({
        session_id: opts.supportSessionId,
        admin_id: adminId,
        target_user_id: opts.targetUserId,
        action: actionLabel,
        details: { fn: fnName, params: redacted, requestId },
      });
    }

    return {
      success: true,
      message: `${actionLabel} completed`,
      data: res.data,
      requestId,
      durationMs,
    };
  } catch (err) {
    const durationMs = Math.round(performance.now() - startMs);
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, message: msg, requestId, durationMs };
  }
}

/**
 * Execute a direct Supabase table mutation with audit logging.
 */
export async function executeMutation(
  adminId: string,
  actionLabel: string,
  mutationFn: () => Promise<{ error: { message: string } | null }>,
  auditDetails: Record<string, unknown>,
  opts: ActionOptions = {},
): Promise<ActionResult> {
  const requestId = generateRequestId();
  const startMs = performance.now();
  const redacted = redactPayload(auditDetails);

  if (opts.dryRun) {
    return {
      success: true,
      message: `[DRY RUN] Would execute ${actionLabel}`,
      requestId,
      durationMs: 0,
    };
  }

  try {
    const { error } = await mutationFn();
    const durationMs = Math.round(performance.now() - startMs);

    if (error) {
      await logAudit(adminId, actionLabel + '_FAILED', { ...redacted, error: error.message, requestId });
      return { success: false, message: error.message, requestId, durationMs };
    }

    await logAudit(adminId, actionLabel, { ...redacted, requestId });

    if (opts.supportSessionId && opts.targetUserId) {
      await logSupportAction({
        session_id: opts.supportSessionId,
        admin_id: adminId,
        target_user_id: opts.targetUserId,
        action: actionLabel,
        details: { ...redacted, requestId },
      });
    }

    return { success: true, message: `${actionLabel} completed`, requestId, durationMs };
  } catch (err) {
    const durationMs = Math.round(performance.now() - startMs);
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, message: msg, requestId, durationMs };
  }
}

// ── Audit helper ────────────────────────────────────────────────────────────

async function logAudit(
  adminId: string,
  action: string,
  details: Record<string, unknown>,
): Promise<void> {
  try {
    await supabase.from('audit_logs').insert({
      user_id: adminId,
      action,
      resource_type: details.resource_type ?? 'admin_action',
      resource_id: details.resource_id ?? null,
      details: redactPayload(details),
    });
  } catch {
    // audit should never block
  }
}
