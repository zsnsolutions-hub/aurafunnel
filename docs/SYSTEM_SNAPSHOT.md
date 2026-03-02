# SYSTEM_SNAPSHOT.md — Scaliyo Architecture Export

> Generated 2026-03-02. Covers the full production state of the Scaliyo codebase.

---

## 1. Product / Module Map

| Module | Route(s) | Screens | Responsibility |
|--------|----------|---------|----------------|
| **Marketing Site** | `/`, `/features`, `/pricing`, `/blog`, `/about`, `/contact` | 7 pages | Public landing, SEO, pricing, blog |
| **Auth & Onboarding** | `/auth`, `/signup`, `/onboarding`, `/reset-password`, `/auth/confirm` | 5 pages | Sign-up, login, 5-step onboarding wizard (role, profile, integrations) |
| **Dashboard** | `/portal` | ClientDashboard (46.8 KB) | KPI row, AI insights, activity feed, lead segmentation, email performance, activation checklist, import wizard |
| **Lead Management** | `/portal/leads`, `/portal/leads/:leadId`, `/portal/leads/apollo` | LeadManagement, LeadProfile, ApolloSearchPage | Lead table, filtering, CSV import, Apollo search/import, per-lead AI research, email engagement |
| **Content Studio** | `/portal/content-studio` | ContentStudio (43 KB) | Email sequence builder, AI generation (Gemini), send/schedule, A/B variants, LinkedIn/proposal modes |
| **Content Gen (legacy)** | `/portal/content` | ContentGen (69 KB) | Multi-step content wizard, template selection, audience selection |
| **Email Campaigns** | (embedded in Content Studio) | EmailWriterProgressModal | AI writing queue, progress polling, cancel/retry |
| **Automation** | `/portal/automation` | AutomationPage (73 KB) | Visual workflow canvas (React Flow), trigger/action config, execution logs, health panel, ROI calculator |
| **Analytics** | `/portal/analytics` | AnalyticsPage (65 KB) | 6 report types, custom date ranges, 6 viz types, alerting, scheduled reports, PDF/Excel/CSV/PPTX export |
| **Lead Intelligence** | `/portal/intelligence` | LeadIntelligence | AI scoring factors, score history, smart segments, insights panel |
| **AI Command Center** | `/portal/ai` | AICommandCenter | Prompt management, multi-persona AI (analyst, strategist, coach, creative) |
| **Team Hub (Strategy)** | `/portal/strategy` | TeamHub (57 KB) | Kanban board, tasks, notes, team management, lead-linked tasks, email badges |
| **Team Hub (Boards)** | `/portal/team-hub` | TeamHubPage + 15 sub-components | Multi-board Kanban, RBAC (owner/admin/member/viewer), card comments, lead linking with auto-sync, calendar/list views |
| **Social Scheduler** | `/portal/social-scheduler` | SocialScheduler (73 KB) | Multi-platform (Meta, LinkedIn, Instagram), composer, media upload, scheduling, OAuth connection, publish status |
| **Blog Drafts** | `/portal/blog` | BlogDrafts | Draft management, guest contributor integration |
| **Invoicing** | `/portal/invoices` | InvoicesPage (51 KB) | Invoice CRUD, Stripe integration, package manager, lead-linked invoices |
| **Billing** | `/portal/billing` | BillingPage (49 KB) | Plan comparison, credit usage, Stripe checkout, invoice history |
| **Integrations** | `/portal/integrations` | IntegrationHub | SendGrid, Gmail, SMTP, Mailchimp, Slack, HubSpot, Salesforce, GA, Stripe connection + validation |
| **Sender Accounts** | `/portal/sender-accounts` | SenderAccountsPage | Email sender CRUD (Gmail OAuth, SMTP, SendGrid, Mailchimp), warmup, health scores |
| **Settings** | `/portal/settings` | ProfilePage | User profile, business profile, preferences |
| **Model Training** | `/portal/model-training` | ModelTraining | AI model customization |
| **Admin Portal** | `/admin/*` | 10 pages | Dashboard, user management, AI ops, prompt lab, blog manager, system health, audit logs, pricing management, support console |

### Tech Stack
- **Frontend**: React 19, TypeScript, Vite 6, Tailwind CSS, TanStack Query, React Flow
- **Backend**: Supabase (PostgreSQL + RLS + Edge Functions), 27 Deno edge functions
- **AI**: Google Gemini (gemini-3-flash-preview client-side, gemini-2.0-flash server-side)
- **Email**: SendGrid, Gmail OAuth, raw SMTP, Mailchimp
- **Payments**: Stripe (invoicing + subscriptions)
- **Social**: Meta Graph API v21.0, LinkedIn v2 API
- **Prospecting**: Apollo People Search API
- **Monitoring**: Sentry, custom PerfPanel (dev)

---

## 2. End-to-End Workflows

### 2a. Lead Import + Dedupe + Validation

```
CSV/XLSX file  ──or──  Apollo Search API
       │                      │
       ▼                      ▼
ImportLeadsWizard       ApolloSearchPage
  (4-step wizard)        (apollo-search edge fn)
       │                      │
       ▼                      ▼
 leadImporter.ts         apollo-import edge fn
  executeImport()          (server-side dedup)
       │                      │
       ▼                      ▼
 import_leads_batch()    Direct INSERT into leads
  (SECURITY DEFINER RPC)
       │
       ▼
    leads table
```

**Trigger**: User uploads CSV/XLSX in ImportLeadsWizard, or clicks "Import" on Apollo search results.

**Steps (CSV path)**:
1. **File parsing**: `leadImporter.ts` parses CSV/XLSX, detects headers via regex `AUTO_MAP_RULES` (20+ patterns for name, email, company, LinkedIn, etc.)
2. **Column mapping UI**: User confirms/adjusts auto-detected mappings. Custom fields stored as `custom:fieldName`.
3. **Capacity check**: `checkContactsCapacity()` queries `leads` count for workspace, compares to `TIER_LIMITS[plan].contacts` (Starter: 1000, Growth: 10000, Scale: 50000).
4. **Batch insert**: `executeImport()` chunks rows into batches of 500, calls `import_leads_batch` RPC.
5. **Server-side dedup** (in `import_leads_batch` RPC):
   - Match on `lower(primary_email)` first, then `lower(linkedin_url)`, then `lower(primary_phone)`
   - Strategy: `skip` (keep existing), `merge` (update nulls only), `overwrite` (replace all)
   - Enforces plan contact limit server-side
   - Splits `full_name` into `first_name`/`last_name`
6. **Result**: Returns `{batch_id, imported_count, updated_count, skipped_count, skipped_rows[{row, reason}]}`.

**Steps (Apollo path)**:
1. `apollo-search` edge function proxies to `api.apollo.io/api/v1/mixed_people/api_search` with filters.
2. User selects contacts, clicks Import.
3. `apollo-import` edge function deduplicates: checks existing email, LinkedIn URL, and company+name combos.
4. Computes lead score from data completeness (email +25, LinkedIn +20, title +15, company +15, phone +10, location +5).
5. Within-batch dedup prevents duplicates in same import.
6. Writes to `leads` table, logs to `apollo_import_logs` and `audit_logs`.

**Data written**: `leads`, `import_batches`, `apollo_import_logs`, `apollo_search_logs`, `audit_logs`.

**Failure handling**: Individual row failures are accumulated in `skipped_rows` array with reasons; import continues. Plan limit exceeded returns error before any insert. Fallback insert (without `knowledgeBase` column) handles schema mismatch.

**Idempotency**: Dedup by email/LinkedIn/phone ensures re-imports don't create duplicates.

---

### 2b. Lead Enrichment / Research (AI + APIs)

```
LeadProfile page
       │
       ▼
generateLeadResearch()
  (lib/gemini.ts)
       │
       ▼
Google Gemini API
  (gemini-3-flash-preview)
  + Google Search grounding
       │
       ▼
parseLeadResearchResponse()
       │
       ▼
UPDATE leads SET knowledgeBase = {...}
```

**Trigger**: User views a lead profile and clicks "Research" (or auto-triggers on profile load).

**Steps**:
1. **Build research prompt**: Extracts lead name, company, email domain, existing insights, social URLs.
2. **Call Gemini** via `@google/genai` SDK (client-side, `gemini-3-flash-preview`):
   - Uses Google Search grounding tool for live web data
   - System instruction: "Website Intelligence Agent" that crawls up to 50 pages per domain
   - Targets: About, Services, Products, Pricing, Contact, Team, FAQ pages
   - Confidence scoring: 1.0 (explicit) → 0.7 (implied) → 0.4 (partial) → 0.0 (not found)
3. **Parse structured JSON response** into `KnowledgeBase`:
   - `identity`: business_name, tagline, description, founded_year, type
   - `industry`: primary/secondary industries, keywords, confidence_score
   - `offerings.services[]`: name, summary, categories, target_customers
   - `offerings.products[]`: name, type, features, integrations
   - `pricing`: model, plans[], confidence_score
   - `contact`: primary_email, phone, support_email, sales_email
   - `locations`: headquarters, other_locations
   - `social_links`: linkedin, facebook, instagram, twitter, youtube
   - `lead_context`: talking_points, outreach_angle, risk_factors
4. **Write to DB**: `UPDATE leads SET knowledgeBase = {parsed}, insights = {summary}` via Supabase client.

**Credit cost**: 2 credits per research call (`consumeCredits(CREDIT_COSTS.lead_research)`).

**Retry**: `MAX_RETRIES = 3` with `TIMEOUT_MS = 15000` per call. AbortController creates timeout signal.

**Failure handling**: Parse errors fall back to raw text storage in `knowledgeBase.extraNotes`. Gemini failures surface as user-visible error banners.

**Data read**: `leads` (for existing context). **Data written**: `leads.knowledgeBase`, `leads.insights`, `profiles.credits_used`.

---

### 2c. Email Sequence Generation + Scheduling + Sending + Tracking + Analytics

This is the most complex workflow, spanning 9 files and 5 edge functions.

```
ContentStudio UI
  handleGenerateWithAI()      ← Step 1: Generate templates
       │
       ▼
  Gemini API (client-side)
  generateEmailSequence()
       │
       ▼
  User edits steps/variants   ← Step 2: Review & customize
       │
       ▼
  handleSendEmails()          ← Step 3: Start campaign
       │
       ▼
  start-email-sequence-run    ← Edge Function #1
  (creates run + items)
       │
       ▼
  EmailWriterProgressModal    ← Step 4: Poll progress
  polls every 1.5s
       │
       ▼
  process-email-writing-queue ← Edge Function #2 (triggered per poll)
  (claims item → Gemini → marks written)
       │  loop up to 5 items per invocation
       ▼
  finalize_email_sequence_run ← RPC (when all items done)
  (INSERT INTO scheduled_emails)
       │
       ▼
  process-scheduled-emails    ← Edge Function #3 (triggered + pg_cron)
       │
       ▼
  send-email                  ← Edge Function #4
  (SendGrid / SMTP)
       │
       ▼
  email-track                 ← Edge Function #5
  (open pixel + click redirect)
       │
       ▼
  webhooks-sendgrid           ← Edge Function #6
  (delivered, bounced, etc.)
       │
       ▼
  email_analytics_summary     ← Materialized view (pg_cron every 10 min)
```

#### Step 1: Template Generation
- **Trigger**: User clicks "Generate with AI" in ContentStudio.
- **Credit cost**: 3 credits (`email_sequence`).
- **Flow**: `generateEmailSequence(leads, config, businessProfile)` → Gemini client-side → parsed into `EmailStep[]` with subject, body, delay.
- **Config**: goal (book_meeting/demo/nurture), cadence (daily/2d/3d/weekly), tone, sequence length (3-7).

#### Step 2: Review
- User edits subject/body per step, can create A/B variants, adjusts delays.

#### Step 3: Start Campaign
- **Trigger**: User clicks Send Now / Schedule in send modal.
- **Pre-flight**: `checkEmailLimit(inboxId)` validates daily per-inbox + monthly total against plan limits.
- **Edge function**: `start-email-sequence-run` POST:
  1. Authenticates JWT, extracts `user.id`.
  2. Queries `outbound_usage` for current month's email_count vs plan limit (Starter: 500, Growth: 2500, Scale: 10000, Enterprise: 50000).
  3. INSERT `email_sequence_runs` (status: processing).
  4. Batch INSERT `email_sequence_run_items` in chunks of 500 (cartesian: leads × steps, each pending).
  5. Returns `{run_id, items_total}`.
- **Data written**: `email_sequence_runs`, `email_sequence_run_items`.

#### Step 4: AI Writing (async polling)
- **UI**: `EmailWriterProgressModal` opens, polls every 1.5s via `pollRunProgress(runId)`.
- Each poll also calls `triggerWriterWorker(runId)` → POST to `process-email-writing-queue`.
- **Worker logic** (per invocation, batch of 5):
  1. `reset_stuck_writing_items()` watchdog: resets items with expired lock (<3 attempts → pending, >=3 → failed).
  2. Loop: `claim_next_writing_item(run_id)` RPC (FOR UPDATE SKIP LOCKED, 5-min lock, attempt_count++).
  3. Build prompt: system instruction (expert B2B copywriter, <200 words, HTML) + business context + prospect details + template.
  4. Call Gemini REST API (`gemini-2.0-flash`, server-side) with `responseMimeType: "application/json"` and structured schema.
  5. On success: UPDATE item → status=written, ai_subject, ai_body_html.
  6. On failure: if attempts<3 → status=pending (retry), else → status=failed.
  7. Increment `email_sequence_runs.items_done`.
  8. If no pending/writing items remain → call `finalize_email_sequence_run(run_id)`.

#### Step 5: Finalization (RPC)
- **`finalize_email_sequence_run`**: INSERT INTO `scheduled_emails` from all written items, mapping `delay_days → scheduled_at = now() + interval`, using `sequence_config->>'from_email'` and `->>'provider'`.
- Updates run status=completed.
- Worker then POSTs to `process-scheduled-emails` to send step-0 emails immediately.

#### Step 6: Sending
- **`process-scheduled-emails`**: Queries `scheduled_emails WHERE status=pending AND scheduled_at <= now()`, limit 50. Marks as processing, then for each: calls `send-email` edge function.
- **`send-email`**:
  1. Loads provider creds: per-user `email_provider_configs` → fallback to env vars (`SENDGRID_API_KEY`, `SMTP_*`).
  2. Creates `email_messages` record.
  3. Extracts links → INSERT `email_links` for click tracking.
  4. Instruments HTML: rewrites `<a href>` to `/t/c/{linkId}`, injects 1x1 pixel at `</body>`.
  5. Sends via SendGrid (`/v3/mail/send`) or raw SMTP (STARTTLS on 587/25, SMTPS on 465).
  6. Updates `email_messages` with `provider_message_id`.

#### Step 7: Tracking
- **Open pixel**: GET `/t/p/{messageId}.png` → bot detection (20+ patterns) → dedup (60s window) → `record_email_event` RPC → returns 1x1 PNG.
- **Click redirect**: GET `/t/c/{linkId}` → lookup `email_links.destination_url` → log event → 302 redirect.
- **Webhooks**: `webhooks-sendgrid` receives delivered/bounce/open/click/unsubscribe/spam events, verifies HMAC-SHA256 signature, maps to `record_email_event` RPC.

#### Step 8: Analytics
- `email_analytics_summary` materialized view refreshed every 10 min via pg_cron.
- Client-side: `fetchOwnerEmailPerformance()` (last 200 emails with open/click counts), `fetchLeadEmailEngagement()` (per-lead aggregation), `fetchBatchEmailSummary()` (bulk, chunks of 50).

**Retry/idempotency**: Writer queue uses FOR UPDATE SKIP LOCKED + attempt_count + locked_until for exactly-once processing. Stuck items reset by watchdog. Tracking events deduplicated by 60s IP+UA window. SendGrid webhook has HMAC signature verification.

---

### 2d. Team Boards / Team Hub — Tasks Linked to Leads

```
TeamHubPage
       │
       ▼
  get_board_snapshot() RPC  ← Single RPC for full board state
       │
       ├── teamhub_boards
       ├── teamhub_lists (lanes)
       ├── teamhub_cards (items)
       ├── teamhub_comments
       ├── teamhub_card_members
       ├── teamhub_flow_members (RBAC)
       └── teamhub_item_leads (lead links)
              │
              ▼
         Drag card to new lane
              │
              ▼
         trg_teamhub_card_lead_sync (trigger)
              │
              ▼
         UPDATE leads SET status = lane_status_map[new_lane]
```

**Trigger**: User opens Team Hub, creates boards, adds cards, links to leads.

**Board creation**:
1. INSERT `teamhub_boards` with `workspace_id`, `created_by`, optional `template_id`.
2. INSERT `teamhub_flow_members` (creator as owner).
3. If template (e.g., "Sales Sprint"): create lanes from `teamhub_flow_templates.structure_json`.

**Card lifecycle**:
1. INSERT `teamhub_cards` (title, description, priority, due_date, labels).
2. Assign members via `teamhub_card_members`.
3. Add comments via `teamhub_comments`.
4. Link leads via `teamhub_item_leads` (enforced by `trg_teamhub_check_lead_scope`: card can only link to leads owned by a board member).

**Lead-card sync** (bidirectional):
- **Card → Lead**: `trg_teamhub_card_lead_sync` fires AFTER UPDATE OF list_id on `teamhub_cards`. Looks up `teamhub_flow_templates.structure_json.lane_status_map`, maps new lane name to lead status (e.g., "Qualified" lane → lead status "Qualified"), updates `leads.status`.
- Only fires when board has `lead_sync = true` in its template.

**Activity audit**:
- Every board action INSERT into `teamhub_activity`.
- `trg_teamhub_activity_to_audit` trigger mirrors to `audit_logs` (with entity_type, entity_id, workspace_id, payload).

**RBAC**:
- Roles: owner, admin, member, viewer.
- `teamhub_user_flow_role(board_id)` RPC used in all RLS policies.
- Owners/admins: full CRUD on lanes, cards, members.
- Members: CRUD on cards, comments.
- Viewers: read-only.

**Invitations**: INSERT `teamhub_invites` (email, role, board_id). Invitee accepts → INSERT `teamhub_flow_members`.

**`get_board_snapshot` RPC**: Single call returns full board state (board metadata, lanes, cards with comment counts, member details, lead links) as JSONB. Avoids N+1 client queries.

**Data read**: `teamhub_boards`, `teamhub_lists`, `teamhub_cards`, `teamhub_comments`, `teamhub_card_members`, `teamhub_flow_members`, `teamhub_item_leads`, `leads`, `teamhub_flow_templates`.
**Data written**: Same tables + `teamhub_activity`, `audit_logs`, `leads.status` (via trigger).

---

### 2e. Billing / Credits Usage Metering + Limits

```
User action (AI gen, email send, etc.)
       │
       ├── AI credits path ──────────────────┐
       │   checkAiAllowed()                  │
       │   → workspace_ai_usage              │
       │   trackAiUsage()                    │
       │   → increment_ai_usage() RPC       │
       │                                     │
       ├── Email limits path ────────────────┤
       │   checkEmailAllowed()               │
       │   → outbound_usage                  │
       │   trackEmailSend()                  │
       │   → increment_outbound_usage() RPC  │
       │                                     │
       ├── Credit deduction path ────────────┤
       │   consumeCredits(amount)            │
       │   → consume_credits() RPC           │
       │   → profiles.credits_used           │
       │                                     │
       └── Plan limit path ──────────────────┘
           TIER_LIMITS[plan].contacts
           TIER_LIMITS[plan].emails
           TIER_LIMITS[plan].storage
```

**Three independent metering systems**:

#### A. AI Credits (per workspace per month)
- **Table**: `workspace_ai_usage` (workspace_id, month_year, credits_used, tokens_used, credits_limit).
- **Conversion**: 1 credit = 800 Gemini tokens. `tokensToCredits(tokens) = Math.ceil(tokens/800)`.
- **Plan limits**: Starter: 0 (no AI), Growth: 2000/mo, Scale: 8000/mo.
- **Pre-check**: `checkAiAllowed()` in `aiUsage.service.ts` → returns `AiLimitError` if exhausted.
- **Post-deduction**: `trackAiUsage()` → `increment_ai_usage()` RPC (UPSERT with atomic increment).
- **Warnings**: `checkAiThreshold()` returns warning at 80%, critical at 95%.
- **Hook**: `useAiCredits()` wraps `checkAi()`, `recordUsage()`, `refresh()`.

#### B. Outbound Email/LinkedIn Limits (per workspace per inbox per day/month)
- **Table**: `outbound_usage` (workspace_id, inbox_id, channel, period_type, period_key, count).
- **Limits by plan**:
  | | Starter | Growth | Scale |
  |---|---|---|---|
  | Inboxes | 1 | 5 | 15 |
  | Emails/day/inbox | 40 | 60 | 80 |
  | Emails/month | 1000 | 10000 | 50000 |
  | LinkedIn/day | 20 | 40 | 100 |
  | LinkedIn/month | 600 | 1200 | 3000 |
- **Pre-check**: `checkEmailAllowed(workspaceId, inboxId, planName)` in `usageTracker.ts`.
- **Post-track**: `trackEmailSend()` → `increment_outbound_usage()` RPC (increments both daily + monthly rows).
- **Hook**: `useUsageLimits(userId, plan)` → `checkEmail()`, `checkLinkedIn()`, `warnings[]`.

#### C. General Credits (per user)
- **Table**: `profiles` (credits_total, credits_used).
- **Costs**: email_sequence: 3, content_gen: 2, lead_research: 2, content_suggestions: 1, lead_scoring: 1, dashboard_insights: 1, image_gen: 2, batch_gen: 5, etc.
- **Deduction**: `consumeCredits(amount)` → `consume_credits(amount)` RPC.
- **Reset**: credits_used reset to 0 on plan upgrade.

#### D. Contact Limit Enforcement
- **Pre-import**: `checkContactsCapacity()` counts leads WHERE client_id = user.id, compares to `TIER_LIMITS[plan].contacts`.
- **Server-side**: `import_leads_batch()` RPC re-validates server-side.

#### Stripe Billing
- **Payment**: `processStripePayment()` → updates `profiles.plan`, `credits_total`, `credits_used`.
- **Invoicing**: `billing-create-invoice` edge fn → Stripe customer + invoice + line items → finalize → send.
- **Webhook**: `billing-webhook` handles `invoice.paid/voided/finalized/uncollectible` → updates `invoices` table.

**Failure handling**: All limit checks are pre-flight (reject before action). Atomic RPCs (UPSERT + increment) prevent race conditions. Overage pricing defined but not currently auto-billed (manual upgrade prompt via `UpgradeModal`).

---

## 3. Background Jobs

| Job | Schedule | Edge Function / Mechanism | Purpose |
|-----|----------|---------------------------|---------|
| Email analytics refresh | Every 10 min | pg_cron → `REFRESH MATERIALIZED VIEW CONCURRENTLY email_analytics_summary` | Pre-aggregate email metrics |
| Social post scheduler | Every 1 min | pg_cron → `social-run-scheduler` edge fn | Publish scheduled social posts |
| Email writer queue | On-demand (client poll) | `process-email-writing-queue` edge fn | AI-write pending email items |
| Scheduled email sender | On-demand (post-finalize trigger) | `process-scheduled-emails` edge fn | Send due emails |
| Stuck item watchdog | Per writer invocation | `reset_stuck_writing_items()` RPC | Reset stuck writing items |

---

## 4. Current Bottlenecks (Inferred)

### Performance
1. **N+1 in `fetchBatchEmailSummary`**: Chunks leads into batches of 50, each making a separate Supabase query. For 500 leads, that's 10 sequential round-trips. Should use a single RPC with array input.

2. **Client-side polling for email writer**: Each 1.5s poll triggers a full `email_sequence_run_items` SELECT + a POST to the writer worker. For a 100-item run, that's ~70 polls × 2 queries each = 140 DB round-trips. Supabase Realtime subscriptions would eliminate polling.

3. **`email_analytics_summary` refresh**: REFRESH MATERIALIZED VIEW CONCURRENTLY every 10 min works, but the underlying query joins `email_messages` + `email_events` (unbounded growth). No date partition or retention policy.

4. **Sequential email sending in `process-scheduled-emails`**: Sends emails one-by-one in a for loop. Each calls `send-email` (another edge function → HTTP round-trip → provider API). For 50 emails, latency compounds. Should batch or parallelize.

5. **`generateLeadResearch` is client-side**: Gemini call with Google Search grounding happens in the browser. Large responses (50-page crawls) can timeout or exhaust mobile bandwidth. Should be an edge function.

### Data Integrity
6. **Duplicate outbound_usage tables**: Both `outbound_usage` and `workspace_usage_counters` track similar metrics. The sender_accounts migration introduced `workspace_usage_counters` but the email tracking code still writes to `outbound_usage`.

7. **`email_messages` schema mismatch**: The perf indexes reference columns (owner_id, created_at) but the email_messages table was created in a deprecated migration that may not match current usage in `send-email`.

8. **Legacy + modern lead fields**: `leads` table has both `email` and `primary_email`, both `name` and `first_name`/`last_name`, both `lastActivity` (TEXT) and `last_activity` (TIMESTAMPTZ). Client code reads both.

### Architecture
9. **No dead-letter queue**: Failed scheduled_emails stay in `failed` status forever. No retry mechanism or escalation. Same for social_post_targets.

10. **Overfetching in ContentStudio**: `handleGenerateWithAI` sends all leads (not just selected) to Gemini for context. For a 10,000-lead workspace, this serializes thousands of leads into a prompt.

11. **`social-post-now` and `social-run-scheduler` duplicate publishing logic**: Both contain identical Facebook/Instagram/LinkedIn publish code (~200 lines). A shared module would prevent divergence.

---

## 5. Improvement Opportunities

### High Impact
1. **Replace email writer polling with Supabase Realtime**: Subscribe to `email_sequence_run_items` changes. Eliminates 140+ unnecessary DB queries per run and reduces latency from 1.5s polling to near-instant updates.

2. **Parallelize `process-scheduled-emails`**: Use `Promise.allSettled()` with concurrency limit (e.g., 10) instead of sequential for-loop. Cuts 50-email batch from ~50s to ~5s.

3. **Move lead research to edge function**: Eliminates client-side Gemini timeouts, reduces bandwidth, enables caching, and allows server-side rate limiting.

4. **Consolidate usage tracking**: Pick one system (`workspace_usage_counters` or `outbound_usage`) and migrate. The dual-write is a bug waiting to happen.

5. **Add `email_events` partition or retention**: Partition by month or add a rolling DELETE for events older than 90 days. Without this, the analytics materialized view refresh will degrade over time.

### Medium Impact
6. **Batch `fetchBatchEmailSummary`**: Replace N chunked queries with a single RPC: `SELECT lead_id, count(*), ... FROM email_messages WHERE lead_id = ANY($1) GROUP BY lead_id`.

7. **Normalize legacy lead fields**: Add a migration to copy `email → primary_email`, `name → first_name/last_name` for existing rows, then deprecate legacy columns. Update all client queries to use new columns.

8. **Extract shared social publishing module**: Deduplicate ~200 lines between `social-post-now` and `social-run-scheduler` into a shared Deno module.

9. **Add scheduled email retry**: Implement exponential backoff for failed scheduled_emails (e.g., retry after 5m, 30m, 2h) with max 3 attempts before permanent failure.

10. **ContentStudio lead selection for AI**: Only pass `selectedLeadIds` (not all leads) to the email generation prompt. Reduces token usage and cost by 10-100x for large workspaces.
