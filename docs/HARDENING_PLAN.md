# Scaliyo Security + Performance Hardening Plan

**Date**: 2026-03-06
**Scope**: Final hardening sprint before ship — security, performance, observability
**Approach**: Concrete tasks with exact code, prioritized P0/P1/P2

---

## Table of Contents

- [SECTION A: Security Hardening](#section-a-security-hardening)
- [SECTION B: Performance Optimization](#section-b-performance-optimization)
- [SECTION C: Reliability + Observability](#section-c-reliability--observability)
- [SECTION D: Ship Checklist](#section-d-ship-checklist)
- [SECTION E: Rollout Plan](#section-e-rollout-plan)

---

## Current State Assessment

### Already Solid

| Area | Status |
|------|--------|
| Workspace model + `is_workspace_member()` helper | Done — 14 tables migrated |
| `sender_account_secrets` — no client RLS | Done |
| Stripe webhook HMAC verification | Done |
| SendGrid webhook HMAC verification | Done |
| Audit logging with `REDACT_KEYS` set | Done |
| Nginx security headers (HSTS, X-Frame-Options, etc.) | Done |
| AI streaming via SSE (`useAiStream` + edge function) | Done |
| Realtime for jobs + email runs (with polling fallback) | Done |
| Lazy-loaded routes (90+ pages) | Done |
| React Query with centralized cache keys/staleTimes | Done |
| Redis cache layer (backend workers) | Done |

### Critical Gaps Found

| # | Gap | Severity |
|---|-----|----------|
| 1 | `ai_threads`, `ai_messages`, `sender_accounts`, `workspace_usage_counters` RLS use `workspace_id = auth.uid()` — **OLD pattern**, bypasses team membership | P0 |
| 2 | `jobs` table has duplicate RLS — old `created_by = auth.uid()` policies AND new `is_workspace_member()` policies both active | P0 |
| 3 | `job_events_insert` policy: `WITH CHECK (true)` — any user can insert events into ANY job | P0 |
| 4 | `idempotency_keys` SELECT policy broken: checks `profiles.id = auth.uid()` not workspace membership | P0 |
| 5 | Edge functions CORS: `Access-Control-Allow-Origin: *` on ALL functions | P0 |
| 6 | No input validation (zod) in any edge function | P0 |
| 7 | Edge functions validate JWT but NOT workspace membership | P0 |
| 8 | `send-email` reads stale `email_provider_configs` table, not `sender_account_secrets` | P0 |
| 9 | `send-email` returns HTTP 200 for all errors (auth failures, validation errors) | P1 |
| 10 | `apollo-search` rate limit is in-memory (resets on cold start) | P1 |
| 11 | `tracking-redirect` — no URL validation (open redirect risk) | P1 |
| 12 | No CSP header in nginx | P1 |
| 13 | No HTML sanitization for AI-generated email content | P1 |
| 14 | No `console.log` blocking in production frontend | P2 |
| 15 | No `unique(workspace_id, lower(email))` on leads | P1 |
| 16 | Missing composite indexes for hot paths | P1 |

---

## SECTION A: Security Hardening

### A1. Fix RLS Policies (P0)

**Problem**: 4 tables created after the workspace migration use `workspace_id = auth.uid()` instead of `is_workspace_member(workspace_id)`. This breaks team access — only the workspace owner can see data, not team members.

**Migration**: `20260307000000_fix_rls_workspace_membership.sql`

```sql
-- ════════════════════════════════════════════════════════════════
-- Fix RLS: Replace workspace_id = auth.uid() with is_workspace_member()
-- Affected tables: ai_threads, ai_messages, sender_accounts,
--                  workspace_usage_counters, jobs (duplicate cleanup),
--                  job_events, idempotency_keys
-- ════════════════════════════════════════════════════════════════

-- ── ai_threads ──────────────────────────────────────────────

DROP POLICY IF EXISTS "threads_owner_all" ON ai_threads;

CREATE POLICY "ws_ai_threads_select" ON ai_threads FOR SELECT
  USING (is_workspace_member(workspace_id));
CREATE POLICY "ws_ai_threads_insert" ON ai_threads FOR INSERT
  WITH CHECK (is_workspace_member(workspace_id));
CREATE POLICY "ws_ai_threads_update" ON ai_threads FOR UPDATE
  USING (is_workspace_member(workspace_id));
CREATE POLICY "ws_ai_threads_delete" ON ai_threads FOR DELETE
  USING (is_workspace_member(workspace_id));

-- ── ai_messages ─────────────────────────────────────────────

DROP POLICY IF EXISTS "messages_owner_all" ON ai_messages;

CREATE POLICY "ws_ai_messages_select" ON ai_messages FOR SELECT
  USING (is_workspace_member(workspace_id));
CREATE POLICY "ws_ai_messages_insert" ON ai_messages FOR INSERT
  WITH CHECK (is_workspace_member(workspace_id));
CREATE POLICY "ws_ai_messages_update" ON ai_messages FOR UPDATE
  USING (is_workspace_member(workspace_id));
CREATE POLICY "ws_ai_messages_delete" ON ai_messages FOR DELETE
  USING (is_workspace_member(workspace_id));

-- ── sender_accounts ─────────────────────────────────────────

DROP POLICY IF EXISTS sender_accounts_select ON sender_accounts;
DROP POLICY IF EXISTS sender_accounts_insert ON sender_accounts;
DROP POLICY IF EXISTS sender_accounts_update ON sender_accounts;
DROP POLICY IF EXISTS sender_accounts_delete ON sender_accounts;

CREATE POLICY "ws_sender_accounts_select" ON sender_accounts FOR SELECT
  USING (is_workspace_member(workspace_id));
CREATE POLICY "ws_sender_accounts_insert" ON sender_accounts FOR INSERT
  WITH CHECK (is_workspace_member(workspace_id));
CREATE POLICY "ws_sender_accounts_update" ON sender_accounts FOR UPDATE
  USING (is_workspace_member(workspace_id));
CREATE POLICY "ws_sender_accounts_delete" ON sender_accounts FOR DELETE
  USING (is_workspace_member(workspace_id));

-- ── workspace_usage_counters ────────────────────────────────

DROP POLICY IF EXISTS workspace_usage_select ON workspace_usage_counters;
DROP POLICY IF EXISTS workspace_usage_insert ON workspace_usage_counters;
DROP POLICY IF EXISTS workspace_usage_update ON workspace_usage_counters;

CREATE POLICY "ws_usage_select" ON workspace_usage_counters FOR SELECT
  USING (is_workspace_member(workspace_id));
CREATE POLICY "ws_usage_insert" ON workspace_usage_counters FOR INSERT
  WITH CHECK (is_workspace_member(workspace_id));
CREATE POLICY "ws_usage_update" ON workspace_usage_counters FOR UPDATE
  USING (is_workspace_member(workspace_id));

-- ── jobs: remove old created_by policies, keep workspace ones ──

DROP POLICY IF EXISTS jobs_select ON jobs;
DROP POLICY IF EXISTS jobs_admin_select ON jobs;
DROP POLICY IF EXISTS jobs_insert ON jobs;

-- ws_jobs_select, ws_jobs_insert, ws_jobs_update, ws_jobs_admin_select
-- already exist from 20260305200002 — keep them

-- ── job_events: fix the wide-open INSERT policy ─────────────

DROP POLICY IF EXISTS job_events_insert ON job_events;

CREATE POLICY "ws_job_events_insert" ON job_events FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM jobs j
      WHERE j.id = job_id
        AND is_workspace_member(j.workspace_id)
    )
  );

-- ── idempotency_keys: fix broken SELECT policy ─────────────

DROP POLICY IF EXISTS idempotency_select ON idempotency_keys;
DROP POLICY IF EXISTS idempotency_insert ON idempotency_keys;

CREATE POLICY "ws_idempotency_select" ON idempotency_keys FOR SELECT
  USING (is_workspace_member(workspace_id));
CREATE POLICY "ws_idempotency_insert" ON idempotency_keys FOR INSERT
  WITH CHECK (is_workspace_member(workspace_id));
```

**Verification**:
```sql
-- Should return 0 (no tables using old pattern)
SELECT schemaname, tablename, policyname, qual
FROM pg_policies
WHERE qual LIKE '%workspace_id = auth.uid()%';
```

---

### A2. Database Constraints & Indexes (P1)

**Migration**: `20260307000001_hardening_constraints.sql`

```sql
-- ═══════════════════════════════════════════════════════════════
-- Hardening: unique constraints, missing FKs, composite indexes
-- ═══════════════════════════════════════════════════════════════

-- ── Unique lead per workspace + email ──────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_ws_email_unique
  ON leads (workspace_id, lower(email))
  WHERE email IS NOT NULL AND email != '';

-- ── Idempotency scoped by workspace + action ───────────────

CREATE UNIQUE INDEX IF NOT EXISTS idx_idempotency_ws_action
  ON idempotency_keys (workspace_id, action, request_id);

-- ── FK: ai_threads → workspaces (not profiles) ────────────

-- ai_threads currently references profiles(id) which is the old pattern.
-- Since workspace_id = user_id for existing users, this works but is wrong.
-- Fix: add FK to workspaces (profiles reference is still valid).
-- Note: Only add if not already referencing workspaces
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'ai_threads'
      AND constraint_type = 'FOREIGN KEY'
      AND constraint_name LIKE '%workspace%'
  ) THEN
    ALTER TABLE ai_threads
      ADD CONSTRAINT fk_ai_threads_workspace
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'ai_messages'
      AND constraint_type = 'FOREIGN KEY'
      AND constraint_name LIKE '%workspace%'
  ) THEN
    ALTER TABLE ai_messages
      ADD CONSTRAINT fk_ai_messages_workspace
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ── Hot-path composite indexes ─────────────────────────────

-- Jobs: Activity Panel queries by workspace + status + recent
CREATE INDEX IF NOT EXISTS idx_jobs_ws_status_updated
  ON jobs (workspace_id, status, updated_at DESC);

-- Leads: lead list sorted by score
CREATE INDEX IF NOT EXISTS idx_leads_ws_score
  ON leads (workspace_id, score DESC NULLS LAST, updated_at DESC);

-- Email events: workspace-scoped analytics
CREATE INDEX IF NOT EXISTS idx_email_events_ws_created
  ON email_events (workspace_id, created_at DESC)
  WHERE workspace_id IS NOT NULL;

-- Scheduled emails: cron processing
CREATE INDEX IF NOT EXISTS idx_scheduled_emails_ws_sched_status
  ON scheduled_emails (workspace_id, scheduled_at, status)
  WHERE status = 'pending';

-- Auto-cleanup old idempotency keys (enable via pg_cron)
-- SELECT cron.schedule('cleanup-idempotency', '0 4 * * *',
--   $$DELETE FROM idempotency_keys WHERE created_at < now() - interval '7 days'$$
-- );
```

---

### A3. Edge Function Security Overhaul (P0)

#### A3.1 Shared Auth + Validation Module

Create `supabase/functions/_shared/auth.ts`:

```typescript
// supabase/functions/_shared/auth.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// ── CORS: restrict to known origins ─────────────────────────
const ALLOWED_ORIGINS = new Set([
  'https://scaliyo.com',
  'https://app.scaliyo.com',
  'http://localhost:5173',  // dev only — remove before final ship
]);

export function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  const allowed = ALLOWED_ORIGINS.has(origin) ? origin : '';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-request-id',
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin',
  };
}

export function getServiceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

// ── Auth: verify JWT + return user ──────────────────────────
interface AuthResult {
  user: { id: string; email?: string };
  workspaceId: string;
}

export async function authenticateRequest(req: Request): Promise<AuthResult> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) throw new AuthError('Missing authorization header', 401);

  const supabase = getServiceClient();
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) throw new AuthError('Invalid token', 401);

  // Workspace = user's default workspace (user.id for now)
  // TODO: support workspace switching via X-Workspace-ID header
  const workspaceId = user.id;

  return { user: { id: user.id, email: user.email }, workspaceId };
}

// ── Workspace membership check ──────────────────────────────
export async function verifyWorkspaceMembership(
  userId: string,
  workspaceId: string,
): Promise<void> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from('workspace_members')
    .select('user_id')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!data) {
    throw new AuthError('Not a member of this workspace', 403);
  }
}

// ── Idempotency check ───────────────────────────────────────
export async function checkIdempotency(
  workspaceId: string,
  action: string,
  requestId: string | null,
): Promise<{ cached: true; response: unknown } | { cached: false }> {
  if (!requestId) return { cached: false };

  const supabase = getServiceClient();
  const { data } = await supabase
    .from('idempotency_keys')
    .select('response')
    .eq('request_id', requestId)
    .eq('workspace_id', workspaceId)
    .eq('action', action)
    .maybeSingle();

  if (data?.response) return { cached: true, response: data.response };
  return { cached: false };
}

export async function saveIdempotency(
  workspaceId: string,
  action: string,
  requestId: string,
  response: unknown,
): Promise<void> {
  const supabase = getServiceClient();
  await supabase.from('idempotency_keys').upsert({
    request_id: requestId,
    workspace_id: workspaceId,
    action,
    response,
  });
}

// ── Rate limiting (Redis-backed via backend) ────────────────
// Edge functions call the backend rate-limit endpoint
export async function checkRateLimit(
  workspaceId: string,
  action: string,
  maxRequests: number,
  windowSeconds: number,
): Promise<boolean> {
  // Fallback in-memory rate limit until Redis endpoint is ready
  const key = `${workspaceId}:${action}`;
  const now = Date.now();
  const timestamps = rateLimitMap.get(key) ?? [];
  const window = windowSeconds * 1000;
  const recent = timestamps.filter(t => now - t < window);
  if (recent.length >= maxRequests) return false;
  recent.push(now);
  rateLimitMap.set(key, recent);
  return true;
}

const rateLimitMap = new Map<string, number[]>();

// ── Error types ─────────────────────────────────────────────
export class AuthError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = 'AuthError';
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RateLimitError';
  }
}

// ── JSON error response helper ──────────────────────────────
export function errorResponse(
  req: Request,
  error: unknown,
): Response {
  const cors = getCorsHeaders(req);
  if (error instanceof AuthError) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: error.status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
  if (error instanceof ValidationError) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
  if (error instanceof RateLimitError) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 429,
      headers: { ...cors, 'Content-Type': 'application/json', 'Retry-After': '60' },
    });
  }
  // Unexpected error — don't leak internals
  console.error('Unhandled edge function error:', error);
  return new Response(JSON.stringify({ error: 'Internal server error' }), {
    status: 500,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

// ── Structured logging with redaction ───────────────────────
const REDACT_PATTERNS = /token|secret|password|api_key|access_token|refresh_token|smtp_pass|private_key/i;

export function safeLog(level: 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>) {
  const clean = meta ? redactObject(meta) : undefined;
  const entry = { level, message, ts: new Date().toISOString(), ...clean };
  if (level === 'error') console.error(JSON.stringify(entry));
  else if (level === 'warn') console.warn(JSON.stringify(entry));
  else console.log(JSON.stringify(entry));
}

function redactObject(obj: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (REDACT_PATTERNS.test(k)) {
      clean[k] = '[REDACTED]';
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      clean[k] = redactObject(v as Record<string, unknown>);
    } else {
      clean[k] = v;
    }
  }
  return clean;
}
```

#### A3.2 Fix `send-email` to Use `sender_account_secrets` (P0)

The current `send-email` function reads from the stale `email_provider_configs` table. Fix `loadProviderCreds` to use the new sender_accounts + sender_account_secrets system:

```typescript
// In send-email/index.ts — replace loadProviderCreds()

async function loadProviderCreds(
  supabaseAdmin: ReturnType<typeof createClient>,
  workspaceId: string,
  provider: string,
  senderAccountId?: string,
): Promise<ProviderCreds & { from_email?: string; from_name?: string }> {
  // Query sender_accounts joined with secrets via service_role
  let query = supabaseAdmin
    .from('sender_accounts')
    .select(`
      id, from_email, from_name, provider,
      sender_account_secrets (
        oauth_access_token, oauth_refresh_token, oauth_expires_at,
        smtp_host, smtp_port, smtp_user, smtp_pass, api_key
      )
    `)
    .eq('workspace_id', workspaceId)
    .eq('status', 'connected');

  if (senderAccountId) {
    query = query.eq('id', senderAccountId);
  } else if (provider) {
    query = query.eq('provider', provider);
  }

  const { data } = await query.eq('is_default', true).limit(1).maybeSingle();

  if (!data) {
    // Fallback: any account for this provider
    const { data: fallback } = await query.limit(1).maybeSingle();
    if (!fallback?.sender_account_secrets) {
      // Final fallback to env vars
      return getEnvFallbackCreds(provider);
    }
    return mapSecretsToCreds(fallback);
  }

  return mapSecretsToCreds(data);
}

function mapSecretsToCreds(row: any): ProviderCreds & { from_email?: string; from_name?: string } {
  const s = row.sender_account_secrets;
  return {
    from_email: row.from_email,
    from_name: row.from_name,
    api_key: s?.api_key ?? undefined,
    smtp_host: s?.smtp_host ?? undefined,
    smtp_port: s?.smtp_port ?? 587,
    smtp_user: s?.smtp_user ?? undefined,
    smtp_pass: s?.smtp_pass ?? undefined,
  };
}
```

Also fix: return proper HTTP status codes instead of always 200.

#### A3.3 Fix `apollo-search` Rate Limiting (P1)

Replace in-memory `rateLimitMap` with the shared `checkRateLimit` from `_shared/auth.ts`. For now this is still in-memory per-instance, but scoped by workspace+action rather than just userId. The key upgrade path is Redis (see Section B5).

#### A3.4 Fix CORS on All Edge Functions (P0)

Replace every instance of:
```typescript
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  ...
};
```

With:
```typescript
import { getCorsHeaders, errorResponse } from '../_shared/auth.ts';

// In handler:
const corsHeaders = getCorsHeaders(req);
```

**Affected files** (all 27 edge functions):
- ai-chat-stream, apollo-import, apollo-search, auth-send-email
- billing-actions, billing-create-invoice, billing-webhook
- connect-gmail-oauth, connect-mailchimp-oauth, connect-sendgrid, connect-smtp
- email-track, image-gen, linkedin-oauth-callback, linkedin-oauth-start
- meta-oauth-callback, meta-oauth-start
- process-email-writing-queue, process-scheduled-emails
- send-email, social-post-now, social-run-scheduler, social-schedule
- start-email-sequence-run, tracking-redirect
- validate-integration, webhooks-mailchimp, webhooks-sendgrid

**Exception**: `tracking-redirect`, `email-track`, `billing-webhook`, `webhooks-sendgrid`, `webhooks-mailchimp` are public/webhook endpoints — keep `*` CORS but add HMAC/signature verification requirements.

---

### A4. Open Redirect Protection (P1)

**Problem**: `tracking-redirect` fetches `destination_url` from DB and 302-redirects to it. A compromised or malicious row could redirect to phishing sites.

**Fix** in `tracking-redirect/index.ts`:

```typescript
// Add URL validation before redirect
function isAllowedRedirect(url: string): boolean {
  try {
    const parsed = new URL(url);
    // Block dangerous protocols
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    // Block internal/reserved IPs
    const hostname = parsed.hostname;
    if (hostname === 'localhost' || hostname.startsWith('127.') ||
        hostname.startsWith('10.') || hostname.startsWith('192.168.') ||
        hostname.startsWith('169.254.') || hostname === '0.0.0.0') return false;
    return true;
  } catch {
    return false;
  }
}

// In handler, before redirect:
if (!isAllowedRedirect(link.destination_url)) {
  safeLog('warn', 'Blocked suspicious redirect', {
    slug, destination: link.destination_url,
  });
  return Response.redirect(APP_BASE_URL || '/', 302);
}
```

---

### A5. HTML Sanitization for AI Email Content (P1)

Create `supabase/functions/_shared/sanitizeHtml.ts`:

```typescript
// Allowlist-based HTML sanitizer for email content
const ALLOWED_TAGS = new Set([
  'p', 'br', 'b', 'strong', 'i', 'em', 'u', 'a', 'ul', 'ol', 'li',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'div', 'img', 'table',
  'thead', 'tbody', 'tr', 'td', 'th', 'blockquote', 'pre', 'code', 'hr',
]);

const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(['href', 'title', 'target', 'rel']),
  img: new Set(['src', 'alt', 'width', 'height', 'style']),
  td: new Set(['colspan', 'rowspan', 'style', 'align', 'valign']),
  th: new Set(['colspan', 'rowspan', 'style', 'align', 'valign']),
  span: new Set(['style']),
  div: new Set(['style']),
  table: new Set(['style', 'width', 'cellpadding', 'cellspacing', 'border']),
  '*': new Set(['class', 'style']),
};

const DANGEROUS_PATTERNS = [
  /javascript\s*:/gi,
  /vbscript\s*:/gi,
  /data\s*:/gi,
  /on\w+\s*=/gi,       // onclick, onerror, onload, etc.
  /<script/gi,
  /<\/script/gi,
  /<iframe/gi,
  /<object/gi,
  /<embed/gi,
  /<form/gi,
  /expression\s*\(/gi,  // CSS expression()
  /url\s*\(\s*["']?\s*javascript/gi,
];

export function sanitizeEmailHtml(html: string): string {
  let sanitized = html;

  // Remove dangerous patterns
  for (const pattern of DANGEROUS_PATTERNS) {
    sanitized = sanitized.replace(pattern, '');
  }

  // Remove disallowed tags (keep content, strip tag)
  sanitized = sanitized.replace(/<\/?(\w+)([^>]*)>/g, (match, tag, attrs) => {
    const lower = tag.toLowerCase();
    if (!ALLOWED_TAGS.has(lower)) return '';

    // Filter attributes
    const allowedForTag = new Set([
      ...(ALLOWED_ATTRS[lower] || []),
      ...(ALLOWED_ATTRS['*'] || []),
    ]);

    const cleanAttrs = (attrs as string).replace(
      /(\w[\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/g,
      (attrMatch, name, v1, v2, v3) => {
        if (!allowedForTag.has(name.toLowerCase())) return '';
        const value = v1 ?? v2 ?? v3 ?? '';
        // Block javascript: URLs in href/src
        if ((name === 'href' || name === 'src') && /^\s*javascript\s*:/i.test(value)) {
          return '';
        }
        return attrMatch;
      }
    );

    if (match.startsWith('</')) return `</${lower}>`;
    return `<${lower}${cleanAttrs}>`;
  });

  return sanitized;
}
```

**Usage**: Call `sanitizeEmailHtml()` in `send-email` before instrumenting HTML:
```typescript
const sanitizedHtml = sanitizeEmailHtml(html_body);
const instrumentedHtml = instrumentHtml(sanitizedHtml, ...);
```

And in `process-email-writing-queue` before storing AI-generated email bodies.

---

### A6. CSP Header for Nginx (P1)

Add to both server blocks in `nginx/aurafunnel.conf`:

```nginx
# In the SPA fallback location blocks:
add_header Content-Security-Policy "default-src 'self'; script-src 'self' https://www.googletagmanager.com https://www.google-analytics.com https://elevenlabs.io; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https: blob:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://generativelanguage.googleapis.com https://www.google-analytics.com https://elevenlabs.io; frame-src 'self' https://js.stripe.com; frame-ancestors 'self';" always;
```

---

### A7. Console.log Blocking in Production (P2)

Add to `AuraEngine/index.tsx`:

```typescript
// Block accidental console logging of secrets in production
if (import.meta.env.PROD) {
  const noop = () => {};
  const originalLog = console.log;
  const originalWarn = console.warn;

  const REDACT_RE = /token|secret|password|api_key|access_token|refresh_token/i;

  function redactArgs(args: unknown[]): unknown[] {
    return args.map(arg => {
      if (typeof arg === 'string' && REDACT_RE.test(arg)) return '[REDACTED]';
      if (arg && typeof arg === 'object') {
        try {
          const str = JSON.stringify(arg);
          if (REDACT_RE.test(str)) return '[Object with sensitive data REDACTED]';
        } catch { /* non-serializable */ }
      }
      return arg;
    });
  }

  console.log = (...args: unknown[]) => originalLog(...redactArgs(args));
  console.warn = (...args: unknown[]) => originalWarn(...redactArgs(args));
  // Keep console.error unmodified for error reporting
}
```

---

## SECTION B: Performance Optimization

### B1. React Query Tuning (P1)

**File**: `AuraEngine/lib/queryClient.ts`

```typescript
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 10 * 60_000,
      refetchOnWindowFocus: false,  // ← CHANGED: disable globally, enable per-query
      refetchOnReconnect: true,
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 15_000),
    },
    mutations: {
      retry: 0,
    },
  },
});
```

Then selectively enable `refetchOnWindowFocus: true` only on queries that need it:
- Dashboard KPIs
- Jobs list (already realtime)
- Lead counts

**Workspace snapshot gating** — ensure all queries check for workspaceId:

```typescript
// Example pattern for all workspace-scoped queries:
useQuery({
  queryKey: cacheKeys.leads(workspaceId!),
  queryFn: () => fetchLeads(workspaceId!),
  enabled: !!workspaceId,  // ← gate on workspace
  staleTime: staleTimes.fast,
});
```

### B2. Missing Database Indexes (P1)

Already covered in migration `20260307000001_hardening_constraints.sql` above. Key additions:
- `jobs(workspace_id, status, updated_at DESC)`
- `leads(workspace_id, score DESC, updated_at DESC)`
- `email_events(workspace_id, created_at DESC)`
- `scheduled_emails(workspace_id, scheduled_at, status) WHERE status='pending'`

### B3. Backend Redis Rate Limiting Endpoint (P1)

Create a lightweight endpoint that edge functions can call for durable rate limiting.

**File**: `backend/src/index.ts` — add rate limit route:

```typescript
import { redis } from './cache/redis.js';
import { redisKeys, redisTTL } from './cache/keys.js';

// Rate limit check endpoint for edge functions
app.post('/internal/rate-limit', async (req, res) => {
  const authHeader = req.headers['x-internal-secret'];
  if (authHeader !== process.env.INTERNAL_API_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { workspace_id, action, max_requests, window_seconds } = req.body;
  const key = redisKeys.rateLimit(workspace_id, action);

  const current = await redis.incr(key);
  if (current === 1) {
    await redis.expire(key, window_seconds);
  }

  const allowed = current <= max_requests;
  const remaining = Math.max(0, max_requests - current);

  res.json({ allowed, remaining, current });
});
```

Edge functions call this endpoint instead of in-memory maps:

```typescript
// In _shared/auth.ts — upgrade checkRateLimit:
export async function checkRateLimit(
  workspaceId: string,
  action: string,
  maxRequests: number,
  windowSeconds: number,
): Promise<boolean> {
  try {
    const backendUrl = Deno.env.get('BACKEND_INTERNAL_URL');
    const secret = Deno.env.get('INTERNAL_API_SECRET');
    if (!backendUrl || !secret) return true; // fail open if not configured

    const res = await fetch(`${backendUrl}/internal/rate-limit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Secret': secret,
      },
      body: JSON.stringify({
        workspace_id: workspaceId,
        action,
        max_requests: maxRequests,
        window_seconds: windowSeconds,
      }),
    });

    const data = await res.json();
    return data.allowed;
  } catch {
    return true; // fail open on network error
  }
}
```

**Rate limit configuration per edge function**:

| Function | Max Requests | Window |
|----------|-------------|--------|
| apollo-search | 10 | 60s |
| ai-chat-stream | 20 | 60s |
| send-email | 50 | 60s |
| image-gen | 5 | 60s |
| validate-integration | 10 | 300s |

### B4. Lazy-Mount Heavy Overlays (P1)

Verify that CommandPalette, DailyBriefing, and VoiceAgent are only mounted when needed. Based on App.tsx, VoiceAgentLauncher is already lazy-loaded. Verify others are similarly gated.

Check in the ClientLayout component:
```typescript
// CommandPalette should be:
const CommandPalette = lazy(() => import('../CommandPalette'));

// Only render when open:
{isCommandPaletteOpen && (
  <Suspense fallback={null}>
    <CommandPalette onClose={() => setIsCommandPaletteOpen(false)} />
  </Suspense>
)}
```

### B5. Workspace Snapshot Server-Side Caching (P1)

The `fetchWorkspaceSnapshot` function already exists client-side. Add Redis caching via the backend:

```typescript
// backend/src/index.ts — add cached snapshot endpoint

app.get('/internal/workspace-snapshot/:workspaceId', async (req, res) => {
  const { workspaceId } = req.params;
  const cacheKey = redisKeys.workspaceSnapshot(workspaceId);

  // Try cache first
  const cached = await getCached(cacheKey);
  if (cached) return res.json(cached);

  // Fetch from DB (use service_role client)
  // ... parallel queries similar to frontend's fetchWorkspaceSnapshot
  // Cache with TTL
  await redis.set(cacheKey, JSON.stringify(snapshot), 'EX', redisTTL.standard);
  res.json(snapshot);
});
```

---

## SECTION C: Reliability + Observability

### C1. Standardized Error Taxonomy (P0)

Create `supabase/functions/_shared/errors.ts`:

```typescript
export const ErrorCodes = {
  // Auth
  ERR_UNAUTHENTICATED: { code: 'ERR_UNAUTHENTICATED', status: 401, message: 'Authentication required' },
  ERR_UNAUTHORIZED: { code: 'ERR_UNAUTHORIZED', status: 403, message: 'Insufficient permissions' },
  ERR_RLS: { code: 'ERR_RLS', status: 403, message: 'Access denied by row-level security' },

  // Rate limits
  ERR_RATE_LIMIT: { code: 'ERR_RATE_LIMIT', status: 429, message: 'Rate limit exceeded' },

  // Validation
  ERR_VALIDATION: { code: 'ERR_VALIDATION', status: 400, message: 'Invalid input' },
  ERR_MISSING_FIELD: { code: 'ERR_MISSING_FIELD', status: 400, message: 'Required field missing' },

  // Provider
  ERR_PROVIDER_AUTH: { code: 'ERR_PROVIDER_AUTH', status: 502, message: 'Provider authentication failed' },
  ERR_PROVIDER_TIMEOUT: { code: 'ERR_PROVIDER_TIMEOUT', status: 504, message: 'Provider request timed out' },
  ERR_PROVIDER_ERROR: { code: 'ERR_PROVIDER_ERROR', status: 502, message: 'Provider returned an error' },

  // Internal
  ERR_INTERNAL: { code: 'ERR_INTERNAL', status: 500, message: 'Internal server error' },
  ERR_TIMEOUT: { code: 'ERR_TIMEOUT', status: 504, message: 'Request timed out' },
  ERR_NOT_FOUND: { code: 'ERR_NOT_FOUND', status: 404, message: 'Resource not found' },

  // Idempotency
  ERR_DUPLICATE: { code: 'ERR_DUPLICATE', status: 409, message: 'Duplicate request' },
} as const;

export type ErrorCode = keyof typeof ErrorCodes;

export function makeErrorResponse(
  code: ErrorCode,
  detail?: string,
  corsHeaders?: Record<string, string>,
): Response {
  const def = ErrorCodes[code];
  return new Response(
    JSON.stringify({
      error: {
        code: def.code,
        message: detail || def.message,
      },
    }),
    {
      status: def.status,
      headers: { ...(corsHeaders ?? {}), 'Content-Type': 'application/json' },
    },
  );
}
```

**Frontend** — update error handling in `useAiStream`, `api.ts`, etc. to parse error codes:

```typescript
// lib/api.ts — add error parser
export interface ApiError {
  code: string;
  message: string;
}

export function parseApiError(response: any): ApiError {
  if (response?.error?.code) return response.error;
  if (response?.error && typeof response.error === 'string') {
    return { code: 'ERR_UNKNOWN', message: response.error };
  }
  return { code: 'ERR_UNKNOWN', message: 'An unexpected error occurred' };
}

// Map error codes to user-friendly messages
export const errorMessages: Record<string, string> = {
  ERR_RATE_LIMIT: 'You\'re doing that too fast. Please wait a moment.',
  ERR_PROVIDER_AUTH: 'Your email provider credentials need to be reconnected.',
  ERR_UNAUTHENTICATED: 'Your session expired. Please sign in again.',
  ERR_VALIDATION: 'Please check your input and try again.',
};
```

### C2. Correlation IDs End-to-End (P1)

**Frontend** already has `requestId.ts`. Ensure all edge function calls include it:

```typescript
// lib/api.ts — wrap all Supabase function calls
export async function invokeEdge<T>(
  functionName: string,
  body: Record<string, unknown>,
  opts?: { requestId?: string },
): Promise<T> {
  const requestId = opts?.requestId ?? getRequestId();
  const { data: { session } } = await supabase.auth.getSession();

  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${functionName}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        'X-Request-ID': requestId,
      },
      body: JSON.stringify({ ...body, request_id: requestId }),
    },
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw Object.assign(new Error(err?.error?.message ?? 'Request failed'), {
      code: err?.error?.code ?? 'ERR_UNKNOWN',
      requestId,
    });
  }

  return response.json();
}
```

**Edge functions** — read and log X-Request-ID:

```typescript
// In _shared/auth.ts, add:
export function getRequestId(req: Request): string {
  return req.headers.get('X-Request-ID') ?? crypto.randomUUID();
}
```

### C3. Cron Health Monitoring (P2)

**Migration**: `20260307000002_cron_heartbeat.sql`

```sql
CREATE TABLE IF NOT EXISTS cron_heartbeats (
  function_name TEXT PRIMARY KEY,
  last_run_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_status   TEXT NOT NULL DEFAULT 'ok' CHECK (last_status IN ('ok', 'error')),
  run_count     BIGINT NOT NULL DEFAULT 0,
  error_count   BIGINT NOT NULL DEFAULT 0,
  last_error    TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE cron_heartbeats ENABLE ROW LEVEL SECURITY;

-- Only admins can read
CREATE POLICY cron_heartbeats_admin_select ON cron_heartbeats
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'ADMIN')
  );

-- SECURITY DEFINER function for cron jobs to call
CREATE OR REPLACE FUNCTION record_cron_heartbeat(
  p_function_name TEXT,
  p_status TEXT DEFAULT 'ok',
  p_error TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO cron_heartbeats (function_name, last_run_at, last_status, run_count, error_count, last_error, updated_at)
  VALUES (p_function_name, now(), p_status, 1,
          CASE WHEN p_status = 'error' THEN 1 ELSE 0 END,
          p_error, now())
  ON CONFLICT (function_name)
  DO UPDATE SET
    last_run_at = now(),
    last_status = p_status,
    run_count = cron_heartbeats.run_count + 1,
    error_count = cron_heartbeats.error_count + CASE WHEN p_status = 'error' THEN 1 ELSE 0 END,
    last_error = COALESCE(p_error, cron_heartbeats.last_error),
    updated_at = now();
END;
$$;
```

Edge function cron jobs call this at end of each run:
```typescript
// At end of process-scheduled-emails, social-run-scheduler, etc.
await supabaseAdmin.rpc('record_cron_heartbeat', {
  p_function_name: 'process-scheduled-emails',
  p_status: errors.length > 0 ? 'error' : 'ok',
  p_error: errors.length > 0 ? errors[0].message : null,
});
```

---

## SECTION D: Ship Checklist

### Security Verification

| # | Check | How to Test | Expected |
|---|-------|-------------|----------|
| 1 | RLS isolation — member vs non-member | Create user B not in user A's workspace. Query A's leads using B's token. | Empty result, no error |
| 2 | RLS isolation — old policies removed | `SELECT * FROM pg_policies WHERE qual LIKE '%workspace_id = auth.uid()%'` | 0 rows |
| 3 | sender_account_secrets blocked from client | `supabase.from('sender_account_secrets').select('*')` with anon/authenticated key | Permission denied |
| 4 | No secrets in localStorage | `Object.keys(localStorage).forEach(k => console.log(k, localStorage[k].substring(0,50)))` | No tokens/secrets visible (only `sb-*-auth-token` which is Supabase's managed token) |
| 5 | Stripe webhook signature | Send POST to billing-webhook with invalid `stripe-signature` header | 403 |
| 6 | SendGrid webhook signature | Send POST to webhooks-sendgrid with invalid signature headers | 403 |
| 7 | Edge function CORS | `curl -H "Origin: https://evil.com" -I <edge-function-url>` | No `Access-Control-Allow-Origin` header (empty) |
| 8 | Rate limit enforcement | Send 11 requests to apollo-search in <60s | 429 on 11th request |
| 9 | Open redirect blocked | Insert `tracking_links` row with `destination_url = 'javascript:alert(1)'` and hit redirect | Redirects to app base URL |
| 10 | HTML sanitization | Send email with `<script>alert(1)</script>` in body | Script tag stripped |

### Performance Verification

| # | Check | How to Test | Target |
|---|-------|-------------|--------|
| 1 | Dashboard LCP | Lighthouse on `/portal` (good network) | <= 2.5s |
| 2 | TTFB for cached endpoints | `curl -w "%{time_starttransfer}" <snapshot-endpoint>` (2nd request) | <= 300ms |
| 3 | No polling when Realtime connected | Open Activity Panel, check Network tab | No periodic XHR; WebSocket messages only |
| 4 | AI streaming stable | Start AI chat, wait 3 minutes | Completes without freeze/refresh |
| 5 | Route lazy loading | Network tab → navigate between routes | Chunks loaded on demand, not all upfront |
| 6 | No refetch storm on tab switch | Switch away and back to portal tab | At most 2-3 queries (dashboard, snapshot), not 10+ |

### "No Refresh Needed" Flows

| # | Flow | How to Test | Expected |
|---|------|-------------|----------|
| 1 | AI assistant long response | Ask complex question, wait for 2-3 min response | Streams in progressively, no hang |
| 2 | Email sequence writing | Start a sequence run with 5 emails | Progress modal updates via Realtime, no polling needed |
| 3 | Social post scheduling | Schedule a post for 1 min from now | Status updates arrive via Realtime |
| 4 | Integration connect | Connect Slack webhook | Validation result appears without refresh |
| 5 | Lead import | Import 50 leads via Apollo | Job progress updates live in Activity Panel |

---

## SECTION E: Rollout Plan

### Feature Flags

Implement via a `feature_flags` table + runtime check:

```sql
CREATE TABLE IF NOT EXISTS feature_flags (
  key          TEXT PRIMARY KEY,
  enabled      BOOLEAN NOT NULL DEFAULT false,
  rollout_pct  INTEGER NOT NULL DEFAULT 0 CHECK (rollout_pct BETWEEN 0 AND 100),
  description  TEXT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO feature_flags (key, enabled, rollout_pct, description) VALUES
  ('REALTIME_JOBS', true, 100, 'Realtime subscriptions for jobs table'),
  ('AI_STREAMING', true, 100, 'SSE streaming for AI responses'),
  ('WORKSPACE_TENANCY_ENFORCED', true, 100, 'Workspace-based RLS policies'),
  ('REDIS_CACHE', false, 0, 'Redis caching for backend endpoints'),
  ('STRICT_CORS', false, 0, 'Origin-restricted CORS on edge functions'),
  ('DURABLE_RATE_LIMIT', false, 0, 'Redis-backed rate limiting'),
  ('CSP_HEADER', false, 0, 'Content-Security-Policy header in nginx')
ON CONFLICT DO NOTHING;
```

Frontend check:
```typescript
export async function isFeatureEnabled(key: string, workspaceId?: string): Promise<boolean> {
  const { data } = await supabase
    .from('feature_flags')
    .select('enabled, rollout_pct')
    .eq('key', key)
    .single();

  if (!data?.enabled) return false;
  if (data.rollout_pct >= 100) return true;

  // Deterministic rollout based on workspace ID
  if (!workspaceId) return false;
  const hash = Array.from(workspaceId).reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return (hash % 100) < data.rollout_pct;
}
```

### Rollout Phases

#### Phase 1: Internal (Day 1-2)
- Enable: `WORKSPACE_TENANCY_ENFORCED` (100%)
- Enable: `STRICT_CORS` (100%)
- Deploy RLS fix migration
- Deploy constraints + indexes migration
- Test with internal accounts
- **Rollback**: Revert migration (re-create old policies)

#### Phase 2: Beta (Day 3-5)
- Enable: `REDIS_CACHE` (25% → 50% → 100%)
- Enable: `DURABLE_RATE_LIMIT` (50% → 100%)
- Enable: `CSP_HEADER` (100%)
- Deploy HTML sanitization + error taxonomy
- Monitor error rates in Sentry
- **Rollback**: Set flag to 0%, revert to in-memory rate limits

#### Phase 3: All Users (Day 6-7)
- All flags at 100%
- Remove feature flag checks from hot paths (bake in as default)
- Clean up old `email_provider_configs` references
- Monitor for 48h
- **Rollback**: Revert nginx config for CSP, disable Redis cache flag

### Rollback Steps

| Change | How to Rollback |
|--------|----------------|
| RLS migration | Run reverse migration re-creating old `workspace_id = auth.uid()` policies |
| CORS restriction | Set `STRICT_CORS` flag to false; edge functions fall back to `*` |
| Rate limiting | Set `DURABLE_RATE_LIMIT` flag to false; falls back to in-memory |
| CSP header | Remove `add_header Content-Security-Policy` line from nginx, reload |
| Redis cache | Set `REDIS_CACHE` flag to false; requests bypass cache |
| Error taxonomy | Error responses remain backward-compatible (still JSON with `error` field) |

---

## Priority Summary

### P0 — Must Ship (Blocking)

1. **A1**: Fix RLS policies (ai_threads, ai_messages, sender_accounts, usage_counters, jobs, job_events, idempotency)
2. **A3.1**: Shared auth module for edge functions (CORS fix, JWT + workspace validation)
3. **A3.2**: Fix send-email to use sender_account_secrets
4. **C1**: Standardized error taxonomy (error codes + frontend parsing)

### P1 — Ship Week (High Impact)

5. **A2**: Unique constraint on leads(workspace_id, email), hot-path indexes
6. **A3.3**: Rate limit upgrade (Redis-backed via backend)
7. **A4**: Open redirect protection in tracking-redirect
8. **A5**: HTML sanitization for AI email content
9. **A6**: CSP header in nginx
10. **B1**: React Query tuning (disable global refetchOnWindowFocus)
11. **B3**: Backend Redis rate limiting endpoint
12. **C2**: Correlation IDs end-to-end

### P2 — Nice to Have (Polish)

13. **A7**: Console.log redaction in production
14. **B4**: Lazy-mount verification for heavy overlays
15. **B5**: Workspace snapshot server-side caching
16. **C3**: Cron health monitoring table
