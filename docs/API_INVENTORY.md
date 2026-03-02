# API_INVENTORY.md — Scaliyo Edge Functions & API Routes

> Generated 2026-03-02. All 27 Supabase Edge Functions + client-side RPC calls.

---

## Edge Function Summary

| # | Function | Auth | Method | External Deps |
|---|----------|------|--------|---------------|
| 1 | apollo-import | JWT | POST | — |
| 2 | apollo-search | JWT | POST | Apollo API |
| 3 | auth-send-email | None (Supabase Auth) | POST | SendGrid |
| 4 | billing-actions | JWT | POST | Stripe |
| 5 | billing-create-invoice | JWT | POST | Stripe |
| 6 | billing-webhook | Stripe HMAC | POST | — |
| 7 | connect-gmail-oauth | JWT | POST | Google OAuth |
| 8 | connect-mailchimp-oauth | JWT | POST | Mailchimp API |
| 9 | connect-sendgrid | JWT | POST | SendGrid API |
| 10 | connect-smtp | JWT | POST | SMTP server |
| 11 | email-track | None (public) | GET | — |
| 12 | image-gen | JWT | POST | Supabase Storage |
| 13 | linkedin-oauth-start | JWT | POST | LinkedIn OAuth |
| 14 | linkedin-oauth-callback | None (OAuth redirect) | GET | LinkedIn API |
| 15 | meta-oauth-start | JWT | POST | Meta OAuth |
| 16 | meta-oauth-callback | None (OAuth redirect) | GET | Meta Graph API |
| 17 | process-email-writing-queue | Service role | POST | Gemini API |
| 18 | process-scheduled-emails | Service role | POST | send-email (internal) |
| 19 | send-email | JWT or Service role | POST | SendGrid / SMTP |
| 20 | social-post-now | JWT | POST | Meta / LinkedIn APIs |
| 21 | social-run-scheduler | Service role | POST | Meta / LinkedIn APIs |
| 22 | social-schedule | JWT | POST | — |
| 23 | start-email-sequence-run | JWT | POST | — |
| 24 | tracking-redirect | None (public) | GET | — |
| 25 | validate-integration | JWT | POST | Slack / HubSpot / Salesforce / Stripe / GA |
| 26 | webhooks-mailchimp | None (webhook) | POST | — |
| 27 | webhooks-sendgrid | HMAC-SHA256 | POST | — |

---

## Detailed Function Specifications

### 1. apollo-import

**Path**: `/functions/v1/apollo-import`
**Auth**: JWT Bearer token → `getUser()`
**Rate limit**: 10 req/min per user (in-memory)

**Input**:
```json
{
  "contacts": [{
    "email": "string",
    "linkedin_url": "string",
    "title": "string",
    "first_name": "string",
    "last_name": "string",
    "name": "string",
    "headline": "string",
    "city": "string",
    "state": "string",
    "country": "string",
    "organization": { "name": "string", "website_url": "string", "industry": "string", "estimated_num_employees": "number" },
    "phone_numbers": [{ "number": "string" }]
  }],
  "search_log_id": "string | null"
}
```

**Output**:
```json
{
  "imported": 5,
  "skipped": 2,
  "failed": 0,
  "duplicates": [{ "name": "John Doe", "reason": "Email already exists" }],
  "imported_leads": [{ "id": "uuid", "name": "string", "email": "string", "company": "string", "score": 75 }]
}
```

**DB reads**: `leads` (dedup check by email, LinkedIn, company+name)
**DB writes**: `leads` (insert), `apollo_import_logs`, `audit_logs`
**Side effects**: Creates new leads with computed score; logs import.
**Error handling**: Fallback insert without knowledgeBase if first attempt fails.

---

### 2. apollo-search

**Path**: `/functions/v1/apollo-search`
**Auth**: JWT Bearer token
**Rate limit**: 10 req/min per user
**External**: `https://api.apollo.io/api/v1/mixed_people/api_search` (APOLLO_API_KEY env var)

**Input**:
```json
{
  "person_titles": ["CEO", "CTO"],
  "q_keywords": "SaaS",
  "person_locations": ["United States"],
  "organization_locations": ["California"],
  "employee_ranges": ["11-50", "51-200"],
  "q_organization_domains": ["example.com"],
  "person_seniorities": ["c_suite", "vp"],
  "person_departments": ["Engineering"],
  "contact_email_status": ["verified"],
  "organization_revenue_min": 1000000,
  "organization_revenue_max": 50000000,
  "page": 1,
  "per_page": 25
}
```

**Output**:
```json
{
  "people": [{ "id": "string", "name": "string", "email": "string", "title": "string", "linkedin_url": "string", "organization": { "name": "string" } }],
  "pagination": { "page": 1, "per_page": 25, "total_entries": 150, "total_pages": 6 },
  "search_log_id": "uuid | null"
}
```

**DB writes**: `apollo_search_logs` (query + result count)
**Side effects**: None beyond logging.

---

### 3. auth-send-email

**Path**: `/functions/v1/auth-send-email`
**Auth**: None (called by Supabase Auth system internally)
**External**: SendGrid `/v3/mail/send` (AUTH_SENDER_EMAIL, SENDGRID_API_KEY env vars)

**Input**:
```json
{
  "user": { "email": "user@example.com" },
  "email_data": { "email_action_type": "signup | recovery | email_change | invite", "token_hash": "string" }
}
```

**Output**: `{ "success": true }` or `{ "error": "string" }`

**Side effects**: Sends branded HTML email with verification/reset link. Token TTL: signup/invite 24h, recovery 1h.

---

### 4. billing-actions

**Path**: `/functions/v1/billing-actions`
**Auth**: JWT Bearer token
**External**: Stripe API (per-user key from `integrations` table, fallback to STRIPE_SECRET_KEY env)

**Input**:
```json
{ "action": "resend | void | send_email", "invoice_id": "uuid" }
```

**Output (resend/void)**: `{ "success": true }`
**Output (send_email)**: `{ "success": true, "invoice_number": "string", "total_cents": 5000, "lead_email": "string", "hosted_url": "string" }`

**DB reads**: `invoices` (verify ownership), `leads` (for send_email), `integrations` (Stripe key lookup)
**DB writes**: `invoices` (sent_at, sent_via, status)
**Stripe calls**: `POST /v1/invoices/{id}/send`, `POST /v1/invoices/{id}/void`

---

### 5. billing-create-invoice

**Path**: `/functions/v1/billing-create-invoice`
**Auth**: JWT Bearer token
**External**: Stripe API

**Input**:
```json
{
  "lead_id": "uuid",
  "line_items": [{ "description": "Consulting", "quantity": 2, "unit_price_cents": 15000 }],
  "due_date": "2026-04-01",
  "notes": "Optional internal note"
}
```

**Output**: `{ "success": true, "invoice_id": "uuid", "hosted_url": "string | null" }`

**DB reads**: `leads` (verify ownership + get email)
**DB writes**: `invoices`, `invoice_line_items`
**Stripe calls**: Create/get customer → create invoice → add line items → finalize → send
**Side effects**: Stripe customer created if not exists; invoice emailed to lead.

---

### 6. billing-webhook

**Path**: `/functions/v1/billing-webhook`
**Auth**: Stripe webhook HMAC-SHA256 signature verification
**Events**: `invoice.paid`, `invoice.voided`, `invoice.marked_uncollectible`, `invoice.finalized`

**Input**: Stripe webhook payload (array of events)
**Output**: `{ "received": true }`

**DB writes**: `invoices` (status, paid_at, hosted_url, pdf_url)
**Side effects**: None beyond DB updates.

---

### 7. connect-gmail-oauth

**Path**: `/functions/v1/connect-gmail-oauth`
**Auth**: JWT Bearer token
**External**: Google OAuth2

**Input**: `{ "workspaceId": "uuid", "hint": "user@gmail.com" }`
**Output**: `{ "authUrl": "https://accounts.google.com/o/oauth2/..." }`

**Scopes**: `gmail.send`, `userinfo.email`
**Side effects**: Returns OAuth URL only; actual callback handled elsewhere.

---

### 8. connect-mailchimp-oauth

**Path**: `/functions/v1/connect-mailchimp-oauth`
**Auth**: JWT Bearer token
**External**: Mailchimp API (validates key with `GET /3.0/`)

**Input**: `{ "workspaceId": "uuid", "apiKey": "xxx-dc" }`
**Output**: `{ "success": true }`

**DB writes**: Calls `connect_sender_account()` RPC
**Side effects**: Stores Mailchimp account as sender (use_for_outreach = false).

---

### 9. connect-sendgrid

**Path**: `/functions/v1/connect-sendgrid`
**Auth**: JWT Bearer token
**External**: SendGrid API (validates with `GET /v3/user/profile`)

**Input**: `{ "workspaceId": "uuid", "apiKey": "SG.xxx", "fromEmail": "me@co.com", "fromName": "My Name" }`
**Output**: `{ "success": true }`

**DB writes**: Calls `connect_sender_account()` RPC
**Side effects**: Stores SendGrid account as sender (use_for_outreach = true).

---

### 10. connect-smtp

**Path**: `/functions/v1/connect-smtp`
**Auth**: JWT Bearer token
**External**: Target SMTP server (full handshake test)

**Input**: `{ "workspaceId": "uuid", "host": "smtp.example.com", "port": 587, "user": "string", "pass": "string", "fromEmail": "string", "fromName": "string" }`
**Output**: `{ "success": true }`

**Validation**: Connects to SMTP, performs EHLO, STARTTLS (587/25) or SMTPS (465), AUTH LOGIN.
**DB writes**: Calls `connect_sender_account()` RPC

---

### 11. email-track

**Path**: `/functions/v1/email-track`
**Auth**: None (public)
**Method**: GET

**Endpoints**:
- **Open pixel**: `/t/p/{messageId}.png` → Returns 1x1 transparent PNG
- **Click redirect**: `/t/c/{linkId}` → 302 redirect to `email_links.destination_url`

**DB reads**: `email_links` (click tracking)
**DB writes**: `record_email_event()` RPC (fire-and-forget)

**Bot detection**: 20+ UA patterns (GoogleBot, BingBot, Apple Mail Privacy Protection, etc.)
**Dedup**: 60-second window per IP+UA+message prevents duplicate events.

---

### 12. image-gen

**Path**: `/functions/v1/image-gen`
**Auth**: JWT Bearer token
**Rate limit**: 10 req/min per user

**Action: generate**
```json
{
  "action": "generate",
  "moduleType": "newsletter | pricing | products | services",
  "prompt": "string",
  "aspectRatio": "1:1 | 4:5 | 16:9",
  "n": 1-4,
  "brand": { "colors": { "primary": "#hex" }, "logoAssetId": "uuid", "brandName": "string" }
}
```
**Output**: `{ "generationId": "uuid", "images": [{ "id": "uuid", "baseImageUrl": "string", "finalImageUrl": "string" }] }`

**Action: save-to-module**
```json
{ "action": "save-to-module", "generatedImageId": "uuid", "moduleType": "string", "moduleId": "string" }
```

**DB writes**: `image_gen_generated_images`, `image_gen_module_attachments`
**Storage**: Uploads to `image-gen-assets` bucket
**Note**: Currently uses StubProvider (SVG placeholder). Real provider (DALL-E) slot exists but is not implemented.

---

### 13. linkedin-oauth-start

**Path**: `/functions/v1/linkedin-oauth-start`
**Auth**: JWT Bearer token

**Input**: None (uses auth header)
**Output**: `{ "url": "https://www.linkedin.com/oauth/v2/authorization?...", "state": "uuid" }`

**Scopes**: `openid profile email w_member_social r_organization_social w_organization_social r_basicprofile`
**DB writes**: `social_post_events` (stores CSRF state)
**Demo mode**: Returns demo URNs if LINKEDIN_CLIENT_ID not set.

---

### 14. linkedin-oauth-callback

**Path**: `/functions/v1/linkedin-oauth-callback`
**Auth**: None (OAuth redirect)
**Method**: GET

**Query params**: `code`, `state`, `error`

**Flow**: Validate state → exchange code → get member profile → get org pages → upsert `social_accounts`
**DB reads**: `social_post_events` (state validation)
**DB writes**: `social_accounts` (upsert), `social_post_events`
**Redirect**: To `/#/portal/social-scheduler` with success/error query param.

---

### 15. meta-oauth-start

**Path**: `/functions/v1/meta-oauth-start`
**Auth**: JWT Bearer token

**Output**: `{ "url": "https://www.facebook.com/v21.0/dialog/oauth?...", "state": "uuid" }`

**Scopes**: `pages_show_list pages_read_engagement pages_manage_posts instagram_basic instagram_content_publish business_management`
**DB writes**: `social_post_events` (state)
**Demo mode**: Returns demo page/IG IDs if META_APP_ID not set.

---

### 16. meta-oauth-callback

**Path**: `/functions/v1/meta-oauth-callback`
**Auth**: None (OAuth redirect)
**Method**: GET

**Flow**: Validate state → exchange code → short-lived token → long-lived token (~60 days) → fetch pages → check IG business accounts → upsert `social_accounts` per page.
**DB writes**: `social_accounts` (one per Facebook page, with IG if available), `social_post_events`

---

### 17. process-email-writing-queue

**Path**: `/functions/v1/process-email-writing-queue`
**Auth**: Service role (internal)
**External**: Gemini REST API (`gemini-2.0-flash`, GEMINI_API_KEY env)

**Input**: `{ "run_id": "uuid | null" }` (optional scope)
**Output**: `{ "processed": 5, "remaining": 12 }`

**Batch size**: 5 items per invocation
**DB reads**: `email_sequence_runs` (config cache), `email_sequence_run_items` (via `claim_next_writing_item` RPC)
**DB writes**: `email_sequence_run_items` (status, ai_subject, ai_body_html), `email_sequence_runs` (items_done, items_failed)
**RPCs called**: `reset_stuck_writing_items()`, `claim_next_writing_item()`, `finalize_email_sequence_run()`
**Side effects**: Calls `process-scheduled-emails` after finalization to send immediate emails.
**Retry**: Items retried up to 3 times. Watchdog resets stuck items with expired locks.

---

### 18. process-scheduled-emails

**Path**: `/functions/v1/process-scheduled-emails`
**Auth**: Service role (internal)

**Input**: None (queries DB for due emails)
**Output**: `{ "processed": 10, "sent": 8, "failed": 2 }`

**Logic**: SELECT `scheduled_emails` WHERE status=pending AND scheduled_at <= now(), limit 50. Mark as processing. For each, POST to `send-email` with service role key. Update status to sent/failed.
**DB reads/writes**: `scheduled_emails`

---

### 19. send-email

**Path**: `/functions/v1/send-email`
**Auth**: JWT or service role (dual path)
**External**: SendGrid (`/v3/mail/send`) or SMTP server

**Input**:
```json
{
  "to_email": "string (required)",
  "subject": "string (required)",
  "html_body": "string (required)",
  "lead_id": "uuid",
  "from_email": "string",
  "provider": "sendgrid | smtp (default: sendgrid)",
  "track_opens": true,
  "track_clicks": true,
  "owner_id": "uuid (required for service role path)"
}
```

**Output**: `{ "success": true, "message_id": "uuid", "provider_message_id": "string" }`

**DB reads**: `email_provider_configs` (per-user creds, fallback to env vars)
**DB writes**: `email_messages`, `email_links` (for tracked URLs)
**HTML instrumentation**: Rewrites `<a href>` to tracking URLs, injects open pixel.
**Provider fallback**: Per-user config → env vars (SENDGRID_API_KEY, SMTP_*).

---

### 20. social-post-now

**Path**: `/functions/v1/social-post-now`
**Auth**: JWT Bearer token
**External**: Meta Graph API v21.0, LinkedIn v2 API

**Input**:
```json
{
  "content_text": "string",
  "link_url": "string",
  "media_paths": ["path/to/file"],
  "targets": [{ "channel": "facebook_page | instagram | linkedin_member | linkedin_org", "target_id": "string", "target_label": "string" }],
  "track_clicks": true
}
```

**Output**: `{ "post_id": "uuid", "status": "completed | failed", "results": [{ "target_id": "string", "channel": "string", "status": "published | failed", "id": "remote_id", "error": "string" }] }`

**DB reads**: `social_accounts` (tokens)
**DB writes**: `social_posts`, `social_post_targets`, `social_post_events`
**Storage**: Gets signed URLs for media (1h TTL)
**Publishing per platform**:
- Facebook: POST `/v21.0/{pageId}/photos` or `/feed`
- Instagram: Create container → poll status (10× 2s) → publish
- LinkedIn: Register upload → PUT image bytes → POST `/v2/ugcPosts`

---

### 21. social-run-scheduler

**Path**: `/functions/v1/social-run-scheduler`
**Auth**: Service role (pg_cron every 1 min)
**External**: Meta Graph API, LinkedIn API (same publish logic as social-post-now)

**Input**: None
**Output**: `{ "processed": 3 }`

**Logic**: Claim due posts (status=scheduled, scheduled_at <= now) → publish to each target → update statuses.
**DB reads/writes**: `social_posts`, `social_post_targets`, `social_accounts`, `social_post_events`

---

### 22. social-schedule

**Path**: `/functions/v1/social-schedule`
**Auth**: JWT Bearer token

**Input**:
```json
{
  "content_text": "string",
  "link_url": "string",
  "media_paths": ["string"],
  "targets": [{ "channel": "string", "target_id": "string" }],
  "scheduled_at": "2026-03-15T10:00:00Z",
  "timezone": "America/New_York",
  "track_clicks": true
}
```

**Output**: `{ "post_id": "uuid", "status": "scheduled", "scheduled_at": "string" }`

**DB writes**: `social_posts` (status=scheduled), `social_post_targets` (status=scheduled), `social_post_events`, optionally `tracking_links`.
**Side effects**: Post stored for later processing by `social-run-scheduler`.

---

### 23. start-email-sequence-run

**Path**: `/functions/v1/start-email-sequence-run`
**Auth**: JWT Bearer token

**Input**:
```json
{
  "leads": [{ "id": "uuid", "email": "string", "name": "string", "company": "string", "score": 75, "status": "New", "insights": "string", "knowledgeBase": {}, "industry": "string", "title": "string" }],
  "steps": [{ "stepIndex": 0, "delayDays": 0, "subject": "template subject", "body": "template body" }],
  "config": { "tone": "professional", "goal": "book a meeting", "fromEmail": "string", "fromName": "string", "provider": "sendgrid", "businessProfile": {}, "sendMode": "now" }
}
```

**Output**: `{ "run_id": "uuid", "items_total": 6 }`

**Pre-flight**: Checks `outbound_usage` + plan limits (Starter: 500, Growth: 2500, Scale: 10000, Enterprise: 50000 emails/month).
**DB reads**: `profiles` (plan), `outbound_usage` (current month)
**DB writes**: `email_sequence_runs`, `email_sequence_run_items` (chunked inserts of 500)
**Error**: 429 if monthly limit would be exceeded.

---

### 24. tracking-redirect

**Path**: `/functions/v1/tracking-redirect`
**Auth**: None (public)
**Method**: GET

**Input**: `?slug=abc123` or path-based slug extraction
**Output**: 302 redirect to `tracking_links.destination_url`

**DB reads**: `tracking_links` (by slug)
**DB writes**: `tracking_events` (hashed IP + UA, fire-and-forget)

---

### 25. validate-integration

**Path**: `/functions/v1/validate-integration`
**Auth**: JWT Bearer token

**Input**: `{ "provider": "slack | hubspot | salesforce | ga | stripe", "credentials": { ... } }`
**Output**: `{ "success": true }` or `{ "success": false, "error": "Invalid API key" }`

**Validation per provider**:
- **Slack**: POST test message to webhook URL
- **HubSpot**: GET `/crm/v3/objects/contacts` with API key
- **Salesforce**: GET `/services/data/` with access token
- **Stripe**: GET `/v1/balance` with secret key (validates format + access)
- **GA**: POST to `/debug/mp/collect` with measurement_id + apiSecret

---

### 26. webhooks-mailchimp

**Path**: `/functions/v1/webhooks-mailchimp`
**Auth**: None (Mailchimp webhook)
**Method**: GET (validation) / POST (events)

**Events mapped**: send→delivered, open→open, click→click, hard_bounce/soft_bounce→bounced
**DB reads**: `email_messages` (match by to_email + provider), `email_links` (match clicked URL)
**DB writes**: `record_email_event()` RPC
**Always returns 200** to prevent Mailchimp retry storms.

---

### 27. webhooks-sendgrid

**Path**: `/functions/v1/webhooks-sendgrid`
**Auth**: HMAC-SHA256 signature (`x-twilio-email-event-webhook-signature` header)

**Events mapped**: delivered, bounce→bounced, open, click, unsubscribe, spamreport→spam_report
**DB reads**: `email_messages` (by provider_message_id), `email_links` (match URL)
**DB writes**: `record_email_event()` RPC with metadata (sg_event_id, sg_message_id, reason, status)

---

## Client-Side RPC Calls (Supabase Direct)

| RPC Function | Called From | Purpose |
|---|---|---|
| `consume_credits(amount)` | `lib/credits.ts` | Deduct AI credits |
| `increment_ai_usage(...)` | `lib/aiUsage.service.ts` | Track monthly AI token usage |
| `increment_outbound_usage(...)` | `lib/usageTracker.ts` | Track daily/monthly email sends |
| `import_leads_batch(...)` | `lib/leadImporter.ts` | Bulk lead import with dedup |
| `record_email_event(...)` | Edge functions (email-track, webhooks) | Log email open/click/bounce |
| `claim_next_writing_item(...)` | `process-email-writing-queue` | Atomically claim pending item |
| `reset_stuck_writing_items()` | `process-email-writing-queue` | Watchdog for stuck items |
| `finalize_email_sequence_run(...)` | `process-email-writing-queue` | Insert scheduled_emails on completion |
| `connect_sender_account(...)` | connect-* edge functions | Store sender credentials |
| `increment_sender_daily_sent(...)` | Sender tracking | Daily send counter |
| `increment_workspace_usage(...)` | Workspace tracking | Consolidated usage counters |
| `get_workspace_monthly_usage(...)` | Usage dashboard | Monthly totals |
| `get_board_snapshot(...)` | Team Hub | Full board state in one call |
| `teamhub_user_flow_role(...)` | RLS policies | Check user's board role |

---

## Client-Side API Invocations (fetch / supabase.functions.invoke)

| Client File | Target | Method |
|---|---|---|
| `lib/emailWriterQueue.ts` | `start-email-sequence-run` | `fetch()` with JWT |
| `lib/emailWriterQueue.ts` | `process-email-writing-queue` | `fetch()` with JWT |
| `lib/emailTracking.ts` | `send-email` | `fetch()` with JWT |
| `lib/sendingEngine.ts` | `send-email` | `supabase.functions.invoke()` |
| `lib/apollo.ts` | `apollo-search` | `supabase.functions.invoke()` |
| `lib/apollo.ts` | `apollo-import` | `supabase.functions.invoke()` |
| `lib/integrations.ts` | `validate-integration` | `fetch()` with JWT |
| `hooks/useCreatePost.ts` | `social-post-now` / `social-schedule` | `supabase.functions.invoke()` |
| `pages/portal/SenderAccountsPage.tsx` | connect-* functions | `supabase.functions.invoke()` |

---

## Environment Variables (Edge Function Secrets)

| Secret | Used By | Purpose |
|---|---|---|
| SUPABASE_URL | All functions | Supabase project URL |
| SUPABASE_SERVICE_ROLE_KEY | All functions | Service role for privileged DB access |
| SUPABASE_ANON_KEY | Client-side | Anonymous key for RLS-scoped access |
| SENDGRID_API_KEY | send-email, auth-send-email | Global SendGrid fallback |
| GEMINI_API_KEY | process-email-writing-queue | Gemini REST API |
| APOLLO_API_KEY | apollo-search | Apollo People Search |
| STRIPE_SECRET_KEY | billing-actions, billing-create-invoice | Global Stripe fallback |
| TRACKING_BASE_URL | send-email, email-track | Base URL for tracking pixels/links |
| OAUTH_REDIRECT_BASE | connect-gmail-oauth, linkedin/meta callbacks | OAuth redirect base |
| SITE_URL | auth-send-email | Verification link base URL |
| AUTH_SENDER_EMAIL | auth-send-email | From address for auth emails |
| AUTH_SENDER_NAME | auth-send-email | From name for auth emails |
