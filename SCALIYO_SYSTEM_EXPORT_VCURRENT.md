# SCALIYO SYSTEM EXPORT — v2026.03.03

> Generated from repository state at commit `b77c2b1` (master).
> Intended audience: Senior engineers performing architecture review, performance optimization, and structural refactoring.

---

## TABLE OF CONTENTS

1. [Product Structure (UI → Modules)](#section-1--product-structure)
2. [Complete Workflow Maps](#section-2--complete-workflow-maps)
3. [Database Schema (Full)](#section-3--database-schema)
4. [Edge Functions / API Inventory](#section-4--edge-functions--api-inventory)
5. [Performance & Risk Analysis](#section-5--performance--risk-analysis)
6. [Architectural Summary](#section-6--architectural-summary)
7. [Clean Improvement Targets](#section-7--clean-improvement-targets)

---

# SECTION 1 — PRODUCT STRUCTURE

## 1.1 Route Map

### Public / Marketing
| Route | Page | Purpose |
|-------|------|---------|
| `/` | LandingPage | Marketing homepage |
| `/features` | FeaturesPage | Feature showcase |
| `/pricing` | PricingPage | Plan comparison |
| `/about` | AboutPage | Company info |
| `/contact` | ContactPage | Contact form |
| `/blog` | BlogPage | Public blog |
| `/blog/:slug` | BlogPostPage | Individual post |
| `/signup` | TrialSignupPage | Free trial registration |

### Auth
| Route | Page | Purpose |
|-------|------|---------|
| `/auth` | AuthPage | Login / signup |
| `/reset-password` | ResetPasswordPage | Password reset |
| `/auth/confirm` | ConfirmEmailPage | Email verification |

### Client Portal (`/portal`)
| Route | Sidebar Label | Page Component | Purpose |
|-------|--------------|----------------|---------|
| `/portal` | Home | ClientDashboard | KPI overview, hot leads, AI insights |
| `/portal/leads` | Leads | LeadManagement | Lead grid, bulk actions, filters |
| `/portal/leads/apollo` | Find Prospects | ApolloSearchPage | Apollo contact search + import |
| `/portal/leads/:leadId` | — | LeadProfile | Single lead detail, engagement, invoices |
| `/portal/intelligence` | Lead Insights | LeadIntelligence | Scoring factors, segmentation |
| `/portal/content` | Campaigns | ContentGen | Email/content generation, A/B testing |
| `/portal/content-studio` | Content Studio | ContentStudio | Multi-step email sequences, AI writer |
| `/portal/automation` | Automations | AutomationPage | Workflow builder + execution |
| `/portal/social-scheduler` | Social | SocialScheduler | Social post scheduling (Meta, LinkedIn) |
| `/portal/blog` | Blog Posts | BlogDrafts | Blog creation + AI generation |
| `/portal/analytics` | Reports | AnalyticsPage | Email, workflow, content analytics |
| `/portal/ai` | AI Assistant | AICommandCenter | Chat-based AI analysis |
| `/portal/strategy` | Tasks | TeamHub | Tasks, notes, team kanban |
| `/portal/team-hub` | Board View | TeamHubPage | Board-based project management |
| `/portal/integrations` | Integrations | IntegrationHub | Third-party connections |
| `/portal/sender-accounts` | Sender Accounts | SenderAccountsPage | Email inbox management |
| `/portal/model-training` | AI Settings | ModelTraining | Prompt library, tuning |
| `/portal/invoices` | Billing History | InvoicesPage | Invoice CRUD + packages |
| `/portal/billing` | Subscription | BillingPage | Plan management, Stripe checkout |
| `/portal/settings` | Settings | ProfilePage | Profile, business, security, API keys |
| `/portal/manual` | User Manual | UserManualPage | Feature documentation |
| `/portal/help` | Help Center | HelpCenterPage | Troubleshooting guides |
| `/portal/mobile` | — | MobileDashboard | Mobile-optimized view |

### Admin Portal (`/admin`)
| Route | Page | Purpose |
|-------|------|---------|
| `/admin` | AdminDashboard | Platform KPIs, conversion funnel |
| `/admin/users` | UserManagement | User list, plan management |
| `/admin/ai` | AIOperations | AI usage logs, cost analysis |
| `/admin/prompts` | PromptLab | Prompt editing + testing |
| `/admin/leads` | LeadsManagement | Cross-user lead view |
| `/admin/blog` | BlogManager | Blog CRUD + categories |
| `/admin/health` | SystemHealth | DB latency, service status |
| `/admin/audit` | AuditLogs | Activity log viewer |
| `/admin/pricing` | PricingManagement | Plan pricing editor |
| `/admin/settings` | AdminSettings | Platform config |
| `/admin/support` | SupportConsole | Support tools (super_admin) |

## 1.2 Detailed Screen Analysis

### ClientDashboard (`/portal`)
- **Purpose**: KPI overview, quick lead stats, AI-generated insights
- **Reads**: `profiles`, `leads`, `ai_usage_logs`, batch email summaries, campaign history
- **Writes**: Lead inserts, score updates, localStorage prefs
- **Actions**: Import leads (CSV), generate AI insights via Gemini, open lead actions

### LeadManagement (`/portal/leads`)
- **Purpose**: Lead grid with bulk operations
- **Reads**: `leads`, `lead_colors`, `color_overrides`, batch email summaries
- **Writes**: Lead status/tags, color overrides, bulk deletes
- **Actions**: Bulk export (Excel), bulk email/workflow, filter/search, grid/list toggle

### LeadProfile (`/portal/leads/:leadId`)
- **Purpose**: Single lead detail with engagement timeline
- **Reads**: Single lead, email engagement, workflow history, invoices
- **Writes**: Lead field updates, strategy notes, invoices, color overrides
- **Actions**: Send tracked email, generate research, execute workflow, create invoice

### ContentStudio (`/portal/content-studio`)
- **Purpose**: Multi-step email sequence creation with AI personalization
- **Reads**: `leads`, email performance, connected providers
- **Writes**: Email sequence runs, scheduled emails, AI writer queue items
- **Actions**: Generate email sequences, preview/edit variants, schedule campaigns
- **Background jobs**: `process-email-writing-queue` (Gemini AI), `process-scheduled-emails`

### AutomationPage (`/portal/automation`)
- **Purpose**: Visual workflow builder and execution
- **Reads**: `workflows`, `workflow_executions`, automation analytics
- **Writes**: Workflow CRUD, execution logs, lead status updates
- **Actions**: Create workflow, configure nodes, execute on selected leads

### SenderAccountsPage (`/portal/sender-accounts`)
- **Purpose**: Manage email sending inboxes
- **Reads**: `sender_accounts`, plan limits
- **Writes**: Create/delete accounts, set default, toggle warmup
- **Actions**: Connect Gmail (OAuth), SMTP, SendGrid, Mailchimp; set default; enable warmup

### IntegrationHub (`/portal/integrations`)
- **Purpose**: Third-party integration management
- **Reads**: `integrations`, `webhooks`, API keys, integration stats
- **Writes**: Integration CRUD, webhook CRUD
- **Actions**: Connect CRM/analytics/email, webhook management, credential validation

### InvoicesPage (`/portal/invoices`)
- **Purpose**: Client invoice management + reusable packages
- **Reads**: `invoices` + line items + packages (via `fetchInvoices`, `fetchPackages`)
- **Writes**: Create/void/resend invoices, package CRUD
- **Actions**: New invoice, preview, send via CRM or Stripe, copy payment link
- **KPIs**: Outstanding, Collected, Total (via `computeInvoiceKPIs`)

### AnalyticsPage (`/portal/analytics`)
- **Purpose**: Email, workflow, content, and AI analytics
- **Reads**: `email_messages`, `email_events`, `email_analytics_summary` (materialized view), `workflows`, `blog_posts`, `ai_usage_logs`
- **Writes**: Alert rules, report schedules (localStorage)
- **Actions**: Quick reports, custom report builder, date range selection, export (PDF/Excel/CSV)

### TeamHubPage (`/portal/team-hub`)
- **Purpose**: Kanban board project management with lead sync
- **Reads**: `teamhub_boards`, `teamhub_lists`, `teamhub_cards`, `teamhub_comments`, `teamhub_activity`
- **Writes**: Card CRUD, lane management, comments, member assignment
- **Actions**: Create flows from templates, kanban drag-drop, card inspector, lead linking
- **Background**: Trigger `trg_teamhub_card_lead_sync` syncs lead status on card moves

### BillingPage (`/portal/billing`)
- **Purpose**: Subscription management
- **Reads**: `plans`, user subscription, credits, usage metrics
- **Writes**: Subscription updates via Stripe checkout
- **Actions**: View plan, upgrade, view usage limits

---

# SECTION 2 — COMPLETE WORKFLOW MAPS

## 2.1 Lead Import Flow

```
Trigger: User uploads CSV/XLSX on LeadManagement or ClientDashboard
Steps:
  1. Frontend parses file, extracts headers
  2. autoMapColumns(headers[]) → regex-based field detection (12+ field types)
  3. User reviews/edits column mapping
  4. checkContactsCapacity(workspaceId, planName) → validate plan limit
  5. executeImport(workspaceId, mapping, rows[], options, fileName, fileType)
     └─ Chunks rows by 500
     └─ For each chunk: RPC import_leads_batch()
        ├─ Dedup by email (primary_email) + LinkedIn URL
        ├─ Strategy: merge | overwrite | skip
        ├─ Normalize custom_fields into JSONB
        └─ Upsert into leads table
  6. Return: imported_count, updated_count, skipped_count, skipped_rows[]
  7. UI refreshes lead list via React Query invalidation

DB writes: leads (upsert), import_batches (insert)
DB reads: leads (dedup check), profiles (plan check)
Edge functions: None (RPC only)
Failure handling: Per-row skip with reason logged in skipped_rows[]
Idempotency: Dedup by email prevents re-import of same contacts
```

## 2.2 Lead Research / AI Enrichment Flow

```
Trigger: User clicks "Research" on LeadProfile or bulk action
Steps:
  1. Frontend calls generateLeadResearch(lead) from gemini.ts
  2. Builds context: lead name, company, title, industry, website
  3. Calls Google Gemini API with research prompt
  4. Gemini returns: company overview, talking points, outreach angles
  5. Frontend saves result to lead.knowledgeBase or lead.insights (JSONB)
  6. Updates lead.updated_at

DB writes: leads (update insights/knowledgeBase)
DB reads: leads (current data)
External API: Google Gemini 2.0 Flash
Failure handling: Gemini errors surfaced to UI; lead data unchanged
Idempotency: Overwrites previous research; no duplicate risk
Credit cost: 2 AI credits per research call
```

## 2.3 Email Sequence Creation Flow

```
Trigger: User configures sequence in ContentStudio and clicks "Send"
Steps:
  1. User selects leads, configures steps (subject, body, delays)
  2. User sets config: tone, goal, cadence, from email, provider
  3. Frontend calls startEmailSequenceRun(leads[], steps[], config)
     └─ Edge function: start-email-sequence-run
        ├─ Validates plan limits (monthly email cap)
        ├─ Creates email_sequence_runs record (status: pending)
        ├─ Creates N×M email_sequence_run_items (leads × steps)
        │  └─ Batched in 500-item chunks
        └─ Returns run_id, items_total
  4. Frontend polls pollRunProgress(runId) every 2-5s
  5. Backend worker: process-email-writing-queue (triggered or cron)
     ├─ RPC reset_stuck_writing_items() → watchdog for orphaned items
     ├─ RPC claim_next_writing_item() → atomic claim-and-lock
     ├─ For each claimed item (up to 5 per invocation):
     │  ├─ Call Gemini API with lead context + template
     │  ├─ Parse JSON response → ai_subject, ai_body_html
     │  └─ Update item: status=written
     ├─ Check if all items done → RPC finalize_email_sequence_run()
     │  └─ Bulk INSERT into scheduled_emails with delay offsets
     └─ Trigger process-scheduled-emails
  6. process-scheduled-emails picks up due items (see 2.4)

DB writes: email_sequence_runs, email_sequence_run_items, scheduled_emails
DB reads: email_sequence_run_items (pending), profiles (plan)
Edge functions: start-email-sequence-run, process-email-writing-queue, process-scheduled-emails
External API: Google Gemini (email personalization)
Failure handling: 3 attempts per item; mark failed after 3
Idempotency: claim_next_writing_item uses FOR UPDATE SKIP LOCKED
```

## 2.4 Scheduled Email Sending Flow

```
Trigger: Cron (pg_cron) or chained from email writer finalization
Steps:
  1. process-scheduled-emails edge function invoked
  2. Query: scheduled_emails WHERE status='pending' AND scheduled_at <= now()
     ORDER BY scheduled_at ASC LIMIT 50
     └─ Uses partial index idx_scheduled_emails_pending
  3. Mark batch as status='processing'
  4. For each email:
     ├─ Call send-email edge function:
     │  ├─ Lookup provider credentials (sender_account_secrets or env vars)
     │  ├─ Create email_messages record
     │  ├─ instrumentEmailHtml: inject tracking pixel + rewrite links
     │  ├─ Insert email_links records for click tracking
     │  ├─ Send via provider (SendGrid API / SMTP / Gmail API)
     │  └─ Update email_messages with provider_message_id
     ├─ On success: update scheduled_emails status='sent', sent_at=now()
     └─ On failure: update status='failed', error_message=...
  5. Usage tracking: increment_usage RPC (idempotent via sourceEventId)

DB writes: scheduled_emails (status), email_messages, email_links
DB reads: scheduled_emails (due items), sender_account_secrets (creds)
Edge functions: process-scheduled-emails → send-email
External APIs: SendGrid, SMTP, Gmail
Failure handling: Per-email try/catch; failures don't block batch
Idempotency: status='processing' prevents re-pick; sourceEventId prevents double-count
```

## 2.5 Email Tracking Flow

```
Trigger: Recipient opens email or clicks link
Steps:
  OPEN TRACKING:
  1. Email client loads 1x1 tracking pixel: GET /t/p/{messageId}.png
  2. email-track edge function:
     ├─ Extract IP, User-Agent
     ├─ Bot detection (Googlebot, Bingbot, etc.)
     ├─ Apple Privacy detection (macOS/iOS patterns)
     ├─ In-memory dedup (10K entries, 60s TTL by IP+UA+messageId)
     └─ Fire-and-forget: RPC record_email_event(type='open')
  3. Return 1x1 transparent PNG

  CLICK TRACKING:
  1. Recipient clicks rewritten link: GET /t/c/{linkId}
  2. email-track edge function:
     ├─ Lookup email_links by linkId → get destination_url, message_id
     ├─ Same bot/privacy detection
     └─ Fire-and-forget: RPC record_email_event(type='click', link_id)
  3. 302 redirect to destination_url
  4. RPC side-effect: UPDATE email_links SET click_count = click_count + 1

  WEBHOOK TRACKING (SendGrid):
  1. SendGrid POSTs events to webhooks-sendgrid edge function
  2. HMAC-SHA256 signature verification
  3. For each event: match email_messages by provider_message_id
  4. Map event type: delivered→delivered, bounce→bounced, open→open, click→click
  5. RPC record_email_event() with metadata

  WEBHOOK TRACKING (Mailchimp):
  1. Mailchimp POSTs FormData to webhooks-mailchimp
  2. Match email_messages by to_email + provider='mailchimp'
  3. Same event mapping and recording

  AGGREGATION:
  1. email_analytics_summary materialized view refreshed via pg_cron
  2. Frontend queries: fetchEmailAnalytics() tries MV first, falls back to raw tables
  3. Per-lead: fetchLeadEmailEngagement() aggregates from email_events

DB writes: email_events (insert), email_links (click_count++), email_messages (status update on delivered/bounced)
DB reads: email_messages (lookup), email_links (lookup)
Edge functions: email-track, webhooks-sendgrid, webhooks-mailchimp
Idempotency: In-memory dedup cache (60s window) for pixel/clicks
```

## 2.6 Sender Account Connection Flow

```
Trigger: User clicks "Add Account" on SenderAccountsPage or IntegrationHub

GMAIL (OAuth):
  1. Frontend calls connect-gmail-oauth edge function
  2. Returns Google OAuth URL with scopes: gmail.send, userinfo.email
  3. User completes Google consent
  4. Google redirects to callback URL with auth code
  5. Backend exchanges code for access_token + refresh_token
  6. RPC connect_sender_account():
     ├─ INSERT sender_accounts (public metadata: from_email, display_name, status)
     └─ INSERT sender_account_secrets (tokens — no RLS, service_role only)

SENDGRID (API Key):
  1. Frontend calls connect-sendgrid edge function with apiKey
  2. Backend validates via GET /v3/user/profile
  3. RPC connect_sender_account() stores API key in sender_account_secrets

SMTP (Credentials):
  1. Frontend calls connect-smtp edge function with host/port/user/pass
  2. Backend performs full SMTP handshake (STARTTLS + AUTH LOGIN)
  3. RPC connect_sender_account() stores SMTP creds in sender_account_secrets

MAILCHIMP (API Key):
  1. Frontend calls connect-mailchimp-oauth with apiKey (format: xxx-us21)
  2. Backend validates via Mailchimp API
  3. RPC connect_sender_account() with use_for_outreach=false (marketing only)

DB writes: sender_accounts, sender_account_secrets
DB reads: None (RPC handles all)
Edge functions: connect-gmail-oauth, connect-sendgrid, connect-smtp, connect-mailchimp-oauth
External APIs: Google OAuth, SendGrid, SMTP servers, Mailchimp
Failure handling: Validation before storage; rollback on RPC failure
```

## 2.7 Integration Hub Email Connection Flow

```
The Integration Hub maps email providers to sender_accounts:

1. IntegrationHub page shows email category with providers
2. On connect: same edge functions as 2.6
3. integrations.ts useIntegrations() hook combines:
   ├─ integrations table (CRM, analytics, etc.)
   └─ email_provider_configs view → maps to sender_accounts for status display
4. Disconnecting via IntegrationHub calls removeSenderAccount()
5. Status synced: sender_accounts.status reflected in IntegrationHub cards

The IntegrationHub is a unified view; sender_accounts is the source of truth for email providers.
```

## 2.8 Usage & Limit Enforcement Flow

```
Trigger: Any outbound action (email send, LinkedIn action, AI credit use)

CHECK (pre-flight):
  1. checkEmailAllowed(workspaceId, senderId, planName)
     ├─ getSenderDailySent(senderId) → RPC get_sender_daily_sent
     │  └─ Compare against planLimits[plan].emailsPerDayPerInbox
     ├─ getMonthlyUsage(workspaceId) → RPC get_workspace_monthly_usage
     │  └─ Compare against planLimits[plan].emailsPerMonth
     └─ Return null (allowed) or LimitError

INCREMENT (post-send):
  2. trackEmailSend(workspaceId, senderId, sourceEventId)
     └─ incrementUsage(workspaceId, 'email_sent', sourceEventId)
        └─ RPC increment_usage:
           ├─ Check usage_events for sourceEventId (idempotency)
           ├─ If exists: return {already_tracked: true} — no double-count
           ├─ If new: INSERT usage_events + UPDATE workspace_usage_counters
           └─ Also: increment_sender_daily_sent (auto-resets on date change)

THRESHOLD WARNINGS:
  3. checkThreshold(workspaceId, planName)
     └─ Return warnings for any limit >80% (type, current, limit, percent)

Plan limits:
  Starter: 1 inbox, 40/day/inbox, 1000/month, 20 LinkedIn/day
  Growth:  5 inboxes, 60/day/inbox, 10000/month, 40 LinkedIn/day
  Scale:   15 inboxes, 80/day/inbox, 50000/month, 100 LinkedIn/day

Idempotency: sourceEventId (UUID) prevents duplicate increments — RPC checks usage_events table
```

## 2.9 Team Board → Lead Sync Flow

```
Trigger: Card moved between lanes on a lead-synced board

Steps:
  1. User drags card to new lane in TeamHubPage
  2. Frontend updates teamhub_cards.list_id
  3. DB trigger trg_teamhub_card_lead_sync fires
     └─ Function teamhub_sync_lead_on_move():
        ├─ Check if board template has lead_sync=true
        ├─ Lookup teamhub_item_leads for card → get lead_id
        ├─ Lookup template.status_map[new_lane_name] → target lead status
        └─ UPDATE leads SET status = target_status WHERE id = lead_id
  4. Lead status synced automatically

Templates with lead_sync:
  - Basic Workflow: To Do→new, Progress→contacted, Done→qualified
  - Sales Sprint: Prospecting→new, Contacted→contacted, Negotiation→qualified, Closed→converted

DB writes: leads (status update), teamhub_cards (list_id), teamhub_activity (log)
DB reads: teamhub_item_leads, teamhub_flow_templates, teamhub_lists
Failure handling: Trigger silently skips if no lead linked or no status_map match
Validation: trg_teamhub_check_lead_scope ensures lead owner is board member
```

## 2.10 Billing / Invoice / Finance KPI Flow

```
INVOICE CREATION:
  1. User creates invoice in InvoicesPage drawer
  2. createAndSendInvoice() → billing-create-invoice edge function
     ├─ Lookup lead email/name for Stripe customer
     ├─ Reuse or create Stripe customer
     ├─ Create Stripe invoice + line items
     ├─ Finalize and send via Stripe
     ├─ INSERT invoices record (status: open)
     └─ INSERT invoice_line_items
  3. Return hosted_url for payment

INVOICE SENDING (CRM):
  1. User clicks "Send Invoice" → sendInvoiceEmail()
  2. prepareInvoiceSend() → billing-actions edge function
  3. buildInvoiceEmailHtml() → HTML with payment CTA button
  4. sendTrackedEmail() → send via connected email provider
  5. Email tracked like any other (opens, clicks)

PAYMENT WEBHOOK:
  1. Stripe fires webhook → billing-webhook edge function
  2. Event mapping: invoice.paid → status='paid', invoice.voided → 'void'
  3. Update invoices table with status, paid_at, URLs

FINANCE KPIs:
  1. InvoicesPage loads all invoices
  2. computeInvoiceKPIs(invoices[]) — single-pass pure function:
     ├─ Outstanding = sum(total_cents) WHERE status='open'
     ├─ Collected = sum(total_cents) WHERE status='paid'
     └─ Void/draft/uncollectible excluded
  3. formatMoneyUSD(amountCents) at UI boundary

DB writes: invoices, invoice_line_items
DB reads: invoices, invoice_line_items, leads
Edge functions: billing-create-invoice, billing-actions, billing-webhook
External API: Stripe (customer, invoice, line item, finalize, send)
Idempotency: billing-webhook upserts by stripe_invoice_id
```

---

# SECTION 3 — DATABASE SCHEMA

## 3.1 Core Tables

### profiles
| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK, FK → auth.users(id) ON DELETE CASCADE |
| email | text | UNIQUE NOT NULL |
| name | text | |
| role | user_role | DEFAULT 'CLIENT' (ADMIN, CLIENT, GUEST) |
| status | text | DEFAULT 'active' |
| credits_total | integer | DEFAULT 500 |
| credits_used | integer | DEFAULT 0 |
| plan | text | DEFAULT 'Starter' |
| createdAt | timestamptz | NOT NULL DEFAULT now() |
| updated_at | timestamptz | DEFAULT now() |

### subscriptions
| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK |
| user_id | uuid | FK → profiles(id) ON DELETE CASCADE, UNIQUE NOT NULL |
| plan | text | DEFAULT 'Starter' |
| status | text | DEFAULT 'active' |
| expires_at | timestamptz | DEFAULT now() + 30 days |
| created_at | timestamptz | DEFAULT now() |

### leads
| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK |
| user_id | uuid | FK → profiles(id) ON DELETE CASCADE NOT NULL |
| client_id | uuid | FK → profiles(id) ON DELETE CASCADE |
| email | text | nullable |
| name | text | nullable |
| primary_email | text | canonical normalized email |
| emails | text[] | DEFAULT '{}' |
| first_name | text | |
| last_name | text | |
| company | text | |
| title | text | |
| phone | text | |
| primary_phone | text | |
| phones | text[] | DEFAULT '{}' |
| website | text | |
| industry | text | |
| company_size | text | |
| status | text | DEFAULT 'new' |
| score | integer | DEFAULT 0 |
| source | text | DEFAULT 'manual' |
| notes | text | |
| tags | text[] | DEFAULT '{}' |
| linkedin_url | text | |
| location | text | |
| last_activity | timestamptz | DEFAULT now() |
| import_batch_id | uuid | FK → import_batches(id) |
| imported_at | timestamptz | |
| custom_fields | jsonb | DEFAULT '{}' |
| created_at | timestamptz | DEFAULT now() |
| updated_at | timestamptz | DEFAULT now() |
| lastActivity | text | **LEGACY** — migrated to last_activity |

**Indexes:**
- `idx_leads_client_email` UNIQUE (client_id, lower(primary_email)) WHERE primary_email IS NOT NULL
- `idx_leads_client_linkedin` UNIQUE (client_id, lower(linkedin_url)) WHERE linkedin_url IS NOT NULL
- `idx_leads_primary_email_search` btree lower(primary_email) text_pattern_ops
- `idx_leads_first_name_search` btree lower(first_name) text_pattern_ops
- `idx_leads_last_activity` DESC NULLS LAST
- `idx_leads_client_created` (client_id, created_at DESC)

### import_batches
| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK |
| workspace_id | uuid | FK → profiles(id) ON DELETE CASCADE NOT NULL |
| file_name | text | NOT NULL |
| file_type | text | DEFAULT 'csv' |
| total_rows | integer | DEFAULT 0 |
| imported_count | integer | DEFAULT 0 |
| updated_count | integer | DEFAULT 0 |
| skipped_count | integer | DEFAULT 0 |
| skipped_rows | jsonb | DEFAULT '[]' |
| column_mapping | jsonb | DEFAULT '{}' |
| options | jsonb | DEFAULT '{}' |
| status | text | DEFAULT 'pending' |
| created_at | timestamptz | DEFAULT now() |
| completed_at | timestamptz | |

## 3.2 Email Tables

### sender_accounts
| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK |
| workspace_id | uuid | FK → profiles(id) ON DELETE CASCADE NOT NULL |
| provider | text | NOT NULL CHECK (gmail, smtp, sendgrid, mailchimp) |
| display_name | text | DEFAULT '' |
| from_email | text | NOT NULL |
| from_name | text | DEFAULT '' |
| status | text | DEFAULT 'connected' CHECK (connected, needs_reauth, disabled) |
| is_default | boolean | DEFAULT false |
| use_for_outreach | boolean | DEFAULT true |
| metadata | jsonb | DEFAULT '{}' |
| daily_sent_today | integer | DEFAULT 0 |
| daily_sent_date | date | DEFAULT CURRENT_DATE |
| warmup_enabled | boolean | DEFAULT false |
| warmup_daily_sent | integer | DEFAULT 0 |
| last_health_check_at | timestamptz | |
| health_score | integer | DEFAULT 100 |
| created_at | timestamptz | DEFAULT now() |
| updated_at | timestamptz | DEFAULT now() |

**Indexes:**
- `idx_sender_accounts_workspace`
- `idx_sender_accounts_lookup` (workspace_id, status, use_for_outreach)
- `idx_sender_accounts_default` UNIQUE (workspace_id) WHERE is_default = true

### sender_account_secrets
| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK |
| sender_account_id | uuid | FK → sender_accounts(id) ON DELETE CASCADE, UNIQUE NOT NULL |
| oauth_access_token | text | |
| oauth_refresh_token | text | |
| oauth_expires_at | timestamptz | |
| smtp_host | text | |
| smtp_port | integer | DEFAULT 587 |
| smtp_user | text | |
| smtp_pass | text | |
| api_key | text | |
| created_at | timestamptz | DEFAULT now() |
| updated_at | timestamptz | DEFAULT now() |

**RLS:** NO user-facing policies. Service role + SECURITY DEFINER only.

### scheduled_emails
| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK |
| owner_id | uuid | FK → auth.users(id) ON DELETE CASCADE NOT NULL |
| lead_id | uuid | FK → leads(id) ON DELETE SET NULL |
| to_email | text | NOT NULL |
| subject | text | NOT NULL |
| html_body | text | NOT NULL |
| scheduled_at | timestamptz | NOT NULL |
| status | text | DEFAULT 'pending' CHECK (pending, processing, sent, failed, cancelled) |
| block_index | integer | DEFAULT 0 |
| sequence_id | text | |
| from_email | text | |
| provider | text | |
| error_message | text | |
| sent_at | timestamptz | |
| created_at | timestamptz | DEFAULT now() |
| updated_at | timestamptz | DEFAULT now() |

**Indexes:**
- `idx_scheduled_emails_owner`
- `idx_scheduled_emails_status`
- `idx_scheduled_emails_pending` (scheduled_at) WHERE status = 'pending'
- `idx_scheduled_emails_sequence` (sequence_id) WHERE sequence_id IS NOT NULL
- `idx_sched_emails_owner_campaign` (owner_id, created_at DESC) WHERE sequence_id IS NOT NULL

### email_messages
| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK |
| lead_id | uuid | FK → leads(id) ON DELETE CASCADE NOT NULL |
| owner_id | uuid | FK → auth.users(id) ON DELETE CASCADE NOT NULL |
| provider | text | NOT NULL CHECK (sendgrid, mailchimp, gmail, smtp, manual) |
| provider_message_id | text | |
| subject | text | |
| to_email | text | NOT NULL |
| from_email | text | |
| status | text | DEFAULT 'sent' CHECK (sent, delivered, bounced, failed) |
| track_opens | boolean | DEFAULT true |
| track_clicks | boolean | DEFAULT true |
| created_at | timestamptz | DEFAULT now() |
| updated_at | timestamptz | DEFAULT now() |

**Indexes:**
- `idx_email_messages_lead_created` (lead_id, created_at DESC)
- `idx_email_messages_owner_id`
- `idx_email_messages_owner_created` (owner_id, created_at DESC)
- `idx_email_messages_provider_msg`

### email_events
| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK |
| message_id | uuid | FK → email_messages(id) ON DELETE CASCADE NOT NULL |
| link_id | uuid | FK → email_links(id) ON DELETE SET NULL |
| event_type | text | NOT NULL CHECK (open, click, delivered, bounced, unsubscribe, spam_report) |
| ip_address | text | |
| user_agent | text | |
| is_bot | boolean | DEFAULT false |
| is_apple_privacy | boolean | DEFAULT false |
| metadata | jsonb | DEFAULT '{}' |
| created_at | timestamptz | DEFAULT now() |

**Indexes:**
- `idx_email_events_msg_bot_type_ts` (message_id, is_bot, event_type, created_at)
- `idx_email_events_link_id`
- `idx_email_events_created` (created_at DESC)

### email_links
| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK |
| message_id | uuid | FK → email_messages(id) ON DELETE CASCADE NOT NULL |
| destination_url | text | NOT NULL |
| link_label | text | |
| link_index | integer | DEFAULT 0 |
| click_count | integer | DEFAULT 0 |
| created_at | timestamptz | DEFAULT now() |

**Indexes:** `idx_email_links_message_id`, `idx_email_links_message_clicks` (message_id, click_count DESC)

### email_sequence_runs
| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK |
| owner_id | uuid | FK → auth.users(id) ON DELETE CASCADE NOT NULL |
| workspace_id | uuid | |
| status | text | DEFAULT 'pending' CHECK (pending, processing, completed, failed, cancelled) |
| lead_count | integer | DEFAULT 0 |
| step_count | integer | DEFAULT 0 |
| items_total | integer | DEFAULT 0 |
| items_done | integer | DEFAULT 0 |
| items_failed | integer | DEFAULT 0 |
| sequence_config | jsonb | DEFAULT '{}' |
| started_at | timestamptz | |
| completed_at | timestamptz | |
| error_summary | text | |
| created_at | timestamptz | DEFAULT now() |
| updated_at | timestamptz | DEFAULT now() |

**Indexes:** `idx_esr_owner`, `idx_esr_status` (partial WHERE status IN ('pending','processing'))

### email_sequence_run_items
| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK |
| run_id | uuid | FK → email_sequence_runs(id) ON DELETE CASCADE NOT NULL |
| lead_id | uuid | FK → leads(id) ON DELETE SET NULL |
| step_index | integer | DEFAULT 0 |
| status | text | DEFAULT 'pending' CHECK (pending, writing, written, failed) |
| lead_email | text | NOT NULL |
| lead_name | text | |
| lead_company | text | |
| lead_context | jsonb | DEFAULT '{}' |
| template_subject | text | NOT NULL |
| template_body | text | NOT NULL |
| ai_subject | text | |
| ai_body_html | text | |
| delay_days | integer | DEFAULT 0 |
| attempt_count | integer | DEFAULT 0 |
| error_message | text | |
| locked_until | timestamptz | |
| created_at | timestamptz | DEFAULT now() |
| updated_at | timestamptz | DEFAULT now() |

**Indexes:** `idx_esri_run`, `idx_esri_pending` (partial), `idx_esri_run_status`

### email_analytics_summary (MATERIALIZED VIEW)
| Column | Type |
|--------|------|
| owner_id | uuid |
| analytics_date | date |
| total_sent | bigint |
| unique_opens | bigint |
| unique_clicks | bigint |
| total_open_events | bigint |
| total_click_events | bigint |

**Unique Index:** (owner_id, analytics_date)
**Refresh:** pg_cron (REFRESH MATERIALIZED VIEW CONCURRENTLY)

### email_templates
| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK |
| owner_id | uuid | FK → auth.users(id) ON DELETE CASCADE |
| name | text | NOT NULL |
| category | text | CHECK (welcome, follow_up, case_study, demo_invite, nurture, custom) |
| subject_template | text | DEFAULT '' |
| body_template | text | DEFAULT '' |
| is_default | boolean | DEFAULT false |
| created_at | timestamptz | DEFAULT now() |
| updated_at | timestamptz | DEFAULT now() |

## 3.3 Usage & Billing Tables

### workspace_usage_counters
| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK |
| workspace_id | uuid | FK → profiles(id) ON DELETE CASCADE NOT NULL |
| date_key | date | NOT NULL |
| month_key | text | NOT NULL ('YYYY-MM') |
| emails_sent | integer | DEFAULT 0 |
| linkedin_actions | integer | DEFAULT 0 |
| ai_credits_used | integer | DEFAULT 0 |
| warmup_emails_sent | integer | DEFAULT 0 |
| updated_at | timestamptz | DEFAULT now() |

**Constraint:** UNIQUE (workspace_id, date_key)
**Index:** `idx_workspace_usage_workspace_month` (workspace_id, month_key)

### usage_events
| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK |
| source_event_id | text | UNIQUE NOT NULL (idempotency key) |
| workspace_id | uuid | FK → profiles(id) ON DELETE CASCADE NOT NULL |
| event_type | text | CHECK (email_sent, linkedin_action, ai_credit, warmup_sent) |
| quantity | integer | DEFAULT 1 |
| sender_account_id | uuid | FK → sender_accounts(id) ON DELETE SET NULL |
| metadata | jsonb | DEFAULT '{}' |
| created_at | timestamptz | DEFAULT now() |

**Index:** `idx_usage_events_workspace_created` (workspace_id, created_at)

### invoices
| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK |
| owner_id | uuid | FK → auth.users(id) ON DELETE CASCADE NOT NULL |
| lead_id | uuid | FK → leads(id) ON DELETE CASCADE NOT NULL |
| stripe_customer_id | text | |
| stripe_invoice_id | text | |
| invoice_number | text | |
| status | text | DEFAULT 'draft' CHECK (draft, open, paid, void, uncollectible) |
| currency | text | DEFAULT 'usd' |
| subtotal_cents | integer | DEFAULT 0 |
| total_cents | integer | DEFAULT 0 |
| due_date | date | |
| notes | text | |
| stripe_hosted_url | text | |
| stripe_pdf_url | text | |
| paid_at | timestamptz | |
| created_at | timestamptz | DEFAULT now() |
| updated_at | timestamptz | DEFAULT now() |

**Indexes:** `idx_invoices_owner`, `idx_invoices_lead`, `idx_invoices_stripe_invoice`

### invoice_line_items
| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK |
| invoice_id | uuid | FK → invoices(id) ON DELETE CASCADE NOT NULL |
| description | text | NOT NULL |
| quantity | integer | DEFAULT 1 |
| unit_price_cents | integer | NOT NULL |
| amount_cents | integer | NOT NULL |
| created_at | timestamptz | DEFAULT now() |

### invoice_packages / invoice_package_items
Standard package template tables with owner_id, name, description, and line item structure mirroring invoice_line_items.

## 3.4 Team / Collaboration Tables

### teams
| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK |
| name | text | NOT NULL |
| owner_id | uuid | FK → auth.users(id) ON DELETE CASCADE NOT NULL |
| created_at | timestamptz | DEFAULT now() |

### team_members
| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK |
| team_id | uuid | FK → teams(id) ON DELETE CASCADE NOT NULL |
| user_id | uuid | FK → auth.users(id) ON DELETE CASCADE NOT NULL |
| role | text | DEFAULT 'member' CHECK (owner, admin, member) |
| joined_at | timestamptz | DEFAULT now() |

**Constraint:** UNIQUE (team_id, user_id)

### team_invites
| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK |
| team_id | uuid | FK → teams(id) ON DELETE CASCADE NOT NULL |
| email | text | NOT NULL |
| role | text | DEFAULT 'member' |
| invited_by | uuid | FK → auth.users(id) NOT NULL |
| status | text | DEFAULT 'pending' CHECK (pending, accepted, declined) |
| created_at | timestamptz | DEFAULT now() |
| expires_at | timestamptz | DEFAULT now() + 7 days |

### teamhub_boards, teamhub_lists, teamhub_cards, teamhub_comments, teamhub_activity, teamhub_card_members, teamhub_flow_members, teamhub_invites, teamhub_item_leads, teamhub_flow_templates
Full kanban board system with role-based access (owner, admin, member, viewer), card-lead linking, activity logging, and lead status sync via triggers.

### strategy_tasks
| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK |
| user_id | uuid | FK → auth.users(id) NOT NULL |
| team_id | uuid | FK → teams(id) ON DELETE SET NULL |
| title | text | NOT NULL |
| priority | text | DEFAULT 'normal' CHECK (urgent, high, normal, low) |
| deadline | date | |
| completed | boolean | DEFAULT false |
| status | text | DEFAULT 'todo' CHECK (todo, in_progress, done) |
| lead_id | uuid | |
| assigned_to | uuid | FK → auth.users(id) |
| created_at | timestamptz | DEFAULT now() |

### strategy_notes
| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK |
| user_id | uuid | FK → auth.users(id) NOT NULL |
| team_id | uuid | FK → teams(id) ON DELETE SET NULL |
| lead_id | uuid | FK → leads(id) ON DELETE SET NULL |
| content | text | NOT NULL |
| lead_name | text | **LEGACY** — migrated to lead_id |
| author_name | text | |
| created_at | timestamptz | DEFAULT now() |

## 3.5 Automation Tables

### workflows
| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK |
| user_id | uuid | FK → auth.users(id) NOT NULL |
| name | text | DEFAULT 'Untitled Workflow' |
| description | text | DEFAULT '' |
| status | text | DEFAULT 'draft' CHECK (active, paused, draft) |
| nodes | jsonb | DEFAULT '[]' |
| stats | jsonb | DEFAULT '{"leadsProcessed":0,...}' |
| created_at | timestamptz | DEFAULT now() |
| updated_at | timestamptz | DEFAULT now() |

### workflow_executions
| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK |
| workflow_id | uuid | FK → workflows(id) ON DELETE CASCADE NOT NULL |
| user_id | uuid | FK → auth.users(id) NOT NULL |
| lead_id | uuid | FK → leads(id) ON DELETE SET NULL |
| status | text | DEFAULT 'running' CHECK (running, success, failed, skipped) |
| current_node | text | |
| steps | jsonb | DEFAULT '[]' |
| started_at | timestamptz | DEFAULT now() |
| completed_at | timestamptz | |
| error_message | text | |

## 3.6 Social Media Tables

- **social_accounts**: OAuth credentials for Meta/LinkedIn
- **social_posts**: Scheduled/published posts
- **social_post_targets**: Per-channel distribution (facebook_page, instagram, linkedin_member, linkedin_org)
- **social_post_events**: Audit log (scheduled, started, published, failed)
- **tracking_links**: URL shortener with slug → destination
- **tracking_events**: Click events with referrer, user_agent, ip_hash

## 3.7 Content Tables

- **blog_posts**: Author, category, content, SEO settings, AI metadata
- **blog_categories**: Name, slug, description
- **guest_post_outreach**: External blog pitching
- **guest_contributors**: External writer management
- **user_prompts**: AI prompt library (28 system prompts seeded)
- **user_prompt_versions**: Prompt version history

## 3.8 Integration Tables

- **integrations**: Third-party connections (UNIQUE owner_id + provider)
- **webhooks**: Outgoing webhook configurations

## 3.9 Audit

- **audit_logs**: user_id, action, entity_type, entity_id, payload, workspace_id

## 3.10 Key RPC Functions

| Function | Purpose |
|----------|---------|
| `record_email_event()` | SECURITY DEFINER — insert email_events + side effects |
| `claim_next_writing_item()` | Atomic claim with FOR UPDATE SKIP LOCKED |
| `reset_stuck_writing_items()` | Watchdog for orphaned writing items |
| `finalize_email_sequence_run()` | Convert written items → scheduled_emails |
| `increment_usage()` | Idempotent counter increment with sourceEventId |
| `increment_sender_daily_sent()` | Per-sender daily counter with auto-reset |
| `get_workspace_monthly_usage()` | Monthly totals by workspace |
| `get_workspace_daily_usage()` | Daily totals by workspace |
| `get_sender_daily_sent()` | Sender daily count with auto-reset |
| `connect_sender_account()` | Atomic create sender + secrets |
| `import_leads_batch()` | Bulk import with dedup + plan limits |
| `get_board_snapshot()` | Single RPC replaces 7 separate queries |
| `teamhub_user_flow_role()` | Get user's role on a board |

## 3.11 Schema Issues Identified

**Duplicate/Legacy Fields:**
- `leads.lastActivity` (text) — migrated to `leads.last_activity` (timestamptz)
- `strategy_notes.lead_name` — migrated to `lead_id` FK
- `leads.email` + `leads.name` — legacy, replaced by `primary_email` + `first_name`/`last_name`
- `leads.user_id` vs `leads.client_id` — both reference profiles, unclear distinction

**Deprecated Tables:**
- `outbound_usage` — replaced by workspace_usage_counters + usage_events (drop after 2026-04-03)

**Missing Indexes:**
- `email_events` has no index for standalone `created_at` range queries without `message_id` filter (current `idx_email_events_created` exists but unused by any query)
- `scheduled_emails` no composite for `(owner_id, status)` — campaign status filtering

**Normalization Issues:**
- `email_sequence_run_items` denormalizes `lead_email`, `lead_name`, `lead_company` from leads table (acceptable for snapshot-at-queue-time)
- `social_accounts` stores encrypted tokens in same table as public metadata (vs sender_accounts which separates secrets)

---

# SECTION 4 — EDGE FUNCTIONS / API INVENTORY

## 4.1 Edge Functions

| # | Name | Method | Auth | Tables R/W | External APIs | Idempotent |
|---|------|--------|------|------------|---------------|------------|
| 1 | apollo-search | POST | JWT | R: — / W: apollo_search_logs | Apollo API | Yes |
| 2 | apollo-import | POST | JWT | R: leads / W: leads, apollo_import_logs, audit_logs | — | No (dedup) |
| 3 | auth-send-email | POST | None (trigger) | — | SendGrid | No |
| 4 | billing-create-invoice | POST | JWT | R: leads, invoices, integrations / W: invoices, invoice_line_items | Stripe | No |
| 5 | billing-actions | POST | JWT | R: invoices, leads, integrations / W: invoices | Stripe | No |
| 6 | billing-webhook | POST | Stripe sig | W: invoices | — | Yes (upsert) |
| 7 | connect-gmail-oauth | POST | JWT | — | Google OAuth | Yes |
| 8 | connect-sendgrid | POST | JWT | W: sender_accounts (RPC) | SendGrid | No |
| 9 | connect-smtp | POST | JWT | W: sender_accounts (RPC) | SMTP servers | No |
| 10 | connect-mailchimp-oauth | POST | JWT | W: sender_accounts (RPC) | Mailchimp | No |
| 11 | email-track | GET | None | R: email_links / W: email_events (RPC) | — | Partial (60s) |
| 12 | image-gen | POST | JWT | W: image_gen tables | — | No |
| 13 | linkedin-oauth-start | POST | JWT | R: social_accounts / W: social_post_events | LinkedIn OAuth | Yes |
| 14 | linkedin-oauth-callback | GET | State | R: social_post_events / W: social_accounts | LinkedIn API | No |
| 15 | meta-oauth-start | POST | JWT | R: social_accounts / W: social_post_events | Meta OAuth | Yes |
| 16 | meta-oauth-callback | GET | State | R: social_post_events / W: social_accounts | Meta Graph API | No |
| 17 | process-email-writing-queue | POST | Service | R/W: email_sequence_run_items, runs | Gemini | No |
| 18 | process-scheduled-emails | POST | Service | R/W: scheduled_emails / W: email_messages | → send-email | No |
| 19 | send-email | POST | JWT/Service | R: creds / W: email_messages, email_links | SendGrid, SMTP, Gmail | No |
| 20 | social-post-now | POST | JWT | R: social_accounts / W: social_posts, targets, events | Facebook, Instagram, LinkedIn | No |
| 21 | social-schedule | POST | JWT | W: social_posts, targets, events | — | No |
| 22 | social-run-scheduler | POST | Cron | R/W: social_posts, targets | Facebook, Instagram, LinkedIn | No |
| 23 | start-email-sequence-run | POST | JWT | W: email_sequence_runs, run_items | — | No |
| 24 | tracking-redirect | GET | None | R: tracking_links / W: tracking_events | — | Partial |
| 25 | validate-integration | POST | JWT | — | Slack, HubSpot, Salesforce, GA4, Stripe | Yes |
| 26 | webhooks-sendgrid | POST | HMAC | R: email_messages, email_links / W: email_events | — | Partial |
| 27 | webhooks-mailchimp | POST/GET | None | R: email_messages, email_links / W: email_events | — | Partial |

## 4.2 Cron Jobs

| Job | Schedule | Edge Function | Purpose |
|-----|----------|---------------|---------|
| Social scheduler | Every 1 min | social-run-scheduler | Publish due social posts |
| Email analytics refresh | pg_cron | — (SQL) | REFRESH MATERIALIZED VIEW CONCURRENTLY email_analytics_summary |
| Email writer watchdog | On-demand | process-email-writing-queue | reset_stuck_writing_items RPC |

## 4.3 Webhook Endpoints

| Provider | Endpoint | Auth | Events |
|----------|----------|------|--------|
| Stripe | billing-webhook | HMAC-SHA256 | invoice.paid, invoice.voided, invoice.finalized, invoice.marked_uncollectible |
| SendGrid | webhooks-sendgrid | HMAC-SHA256 | delivered, bounce, open, click, unsubscribe, spamreport |
| Mailchimp | webhooks-mailchimp | None | send, open, click, bounce, unsubscribe |
| Google | connect-gmail-oauth (callback) | OAuth state | Auth code exchange |
| LinkedIn | linkedin-oauth-callback | OAuth state | Auth code exchange |
| Meta | meta-oauth-callback | OAuth state | Auth code exchange |

## 4.4 Environment Variables

```
SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
SENDGRID_API_KEY, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
GEMINI_API_KEY, APOLLO_API_KEY
GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET
META_APP_ID, META_APP_SECRET
SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
SITE_URL, APP_BASE_URL, TRACKING_BASE_URL, OAUTH_REDIRECT_BASE
SENDGRID_WEBHOOK_VERIFICATION_KEY
```

---

# SECTION 5 — PERFORMANCE & RISK ANALYSIS

## 5.1 Sequential Sending Loops

**process-scheduled-emails** processes up to 50 emails sequentially in a for-loop, calling send-email edge function for each. With ~500ms per send, a full batch takes ~25 seconds. Under heavy load this becomes the bottleneck.

**Risk:** Timeout on edge function (30s default) if batch is large or provider is slow.
**Fix:** Parallel sending with concurrency limit (e.g., Promise.allSettled with pool of 5).

## 5.2 N+1 Query Patterns

**fetchBatchEmailSummary** chunks lead IDs by 50, then for each chunk issues 2 queries (messages + events). With 500 leads, this is 20 query pairs.

**fetchCampaignPerformance** queries scheduled_emails, then email_messages, then email_events — 3 sequential queries where the second depends on the first.

**executeWorkflow** loops leads, and for each lead loops nodes. Each node may issue DB queries (read lead, send email, update status). For 100 leads × 5 nodes = 500 potential DB round-trips.

## 5.3 Polling Loops

**pollRunProgress** (emailWriterQueue.ts) polls every 2-5 seconds via frontend. No server-sent events or websocket. Acceptable for now but doesn't scale if many users run sequences simultaneously.

## 5.4 Duplicate Logic

**Resolved in PR-4:** formatCents/formatDollars consolidated to `formatMoneyUSD`. KPI computation consolidated to `computeInvoiceKPIs`.

**Remaining:**
- `send-email` edge function has its own link rewriting + pixel injection logic, duplicating `instrumentEmailHtml()` in emailTracking.ts (server vs client implementations).
- `social-post-now` and `social-run-scheduler` share ~80% identical publishing logic (Facebook, Instagram, LinkedIn API calls).

## 5.5 Potential Race Conditions

- **Default sender account**: `setDefaultSender()` clears all defaults then sets one — non-atomic. Two concurrent calls could leave zero or two defaults.
- **scheduled_emails processing**: Mitigated by status='processing' guard, but if edge function crashes mid-batch, emails stay stuck in 'processing' with no watchdog.
- **claim_next_writing_item**: Properly uses FOR UPDATE SKIP LOCKED — no race.
- **Inbox rotation (selectInbox)**: Reads daily_sent counts, but between read and send another process could also select the same inbox, slightly exceeding daily cap.

## 5.6 Missing Indexes

- `scheduled_emails(owner_id, status)` — campaign status filtering in UI
- `email_events(created_at DESC)` exists but is unused by any production query
- `social_posts(status, scheduled_at)` — scheduler query could benefit from composite

## 5.7 Credential Duplication Risk

- `integrations.credentials` (JSONB) stores API keys in a user-accessible RLS table
- `sender_account_secrets` correctly isolates secrets from RLS
- `social_accounts` stores encrypted tokens in same table as public metadata
- **Risk:** `integrations` table has RLS allowing user SELECT, which means encrypted credentials are readable client-side

## 5.8 Event Table Growth

- `email_events`: Unbounded growth. High-volume senders generate thousands of events per month. No TTL or archival strategy.
- `tracking_events`: Unbounded. Every social link click appends a row.
- `audit_logs`: Unbounded. Workflow executions + teamhub activity mirrors.
- **Risk:** Query performance degrades as tables grow. Materialized view refresh time increases.

## 5.9 RLS / Security Weaknesses

- `integrations` table: User can SELECT own rows which contain `credentials` JSONB (may include API keys)
- `social_accounts`: Encrypted tokens stored in user-readable columns
- `send-email` edge function: Falls back to env var credentials if no per-user config — all users share the same SendGrid key
- `webhooks-mailchimp`: No signature verification (unlike SendGrid/Stripe)
- `email-track`: Public endpoint with no rate limiting (bot detection only)

---

# SECTION 6 — ARCHITECTURAL SUMMARY

## 6.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    FRONTEND (React 19)                    │
│  Vite 6 + TypeScript + Tailwind CSS + React Router       │
│  ┌─────────┐ ┌──────────┐ ┌───────────┐ ┌────────────┐ │
│  │  Pages   │ │Components│ │  Lib/*.ts  │ │React Query │ │
│  │ (Portal) │ │  (UI)    │ │(Biz Logic)│ │  (Cache)   │ │
│  └────┬─────┘ └────┬─────┘ └─────┬─────┘ └─────┬──────┘ │
└───────┼────────────┼──────────────┼─────────────┼────────┘
        │            │              │             │
        ▼            ▼              ▼             ▼
┌─────────────────────────────────────────────────────────┐
│                    SUPABASE LAYER                         │
│  ┌──────────┐ ┌───────────┐ ┌──────────┐ ┌───────────┐ │
│  │ PostgREST│ │Edge Funcs │ │   Auth   │ │  Storage  │ │
│  │  (RLS)   │ │  (Deno)   │ │  (JWT)   │ │  (S3)     │ │
│  └────┬─────┘ └─────┬─────┘ └────┬─────┘ └─────┬─────┘ │
│       │             │            │              │        │
│       ▼             ▼            ▼              ▼        │
│  ┌──────────────────────────────────────────────────┐   │
│  │              PostgreSQL (RLS + RPCs)               │   │
│  │  54+ tables, 12+ RPCs, 5+ triggers               │   │
│  │  Materialized views, pg_cron                      │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
        │              │              │
        ▼              ▼              ▼
┌──────────┐  ┌──────────────┐  ┌───────────┐
│  Stripe  │  │  Email APIs  │  │  Social   │
│(Payments)│  │SendGrid/SMTP │  │Meta/LI API│
│          │  │Gmail/Mailchi │  │           │
└──────────┘  └──────────────┘  └───────────┘
        │
        ▼
┌──────────────┐
│ Google Gemini │
│  (AI/NLP)    │
└──────────────┘
```

## 6.2 Email Sending Architecture

```
USER ACTION
    │
    ▼
┌──────────────────┐     ┌───────────────────┐
│ Single Send      │     │ Sequence Send     │
│ (sendTrackedEmail│     │ (startEmailSeq...)│
│  → send-email EF)│     │  → start-email-.. │
└────────┬─────────┘     └────────┬──────────┘
         │                        │
         │                        ▼
         │               ┌───────────────────┐
         │               │ AI Writer Queue   │
         │               │ process-email-    │
         │               │ writing-queue     │
         │               │ (Gemini → write)  │
         │               └────────┬──────────┘
         │                        │
         │                        ▼
         │               ┌───────────────────┐
         │               │ Scheduled Emails  │
         │               │ process-scheduled-│
         │               │ emails (cron/chain│
         │               └────────┬──────────┘
         │                        │
         ▼                        ▼
┌─────────────────────────────────────────┐
│            send-email EF                 │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐ │
│  │ Limit   │  │Instrument│  │ Send    │ │
│  │ Check   │→ │ HTML     │→ │ via     │ │
│  │(usage)  │  │(pixel+   │  │Provider │ │
│  │         │  │ links)   │  │         │ │
│  └─────────┘  └─────────┘  └─────────┘ │
└──────────────────┬──────────────────────┘
                   │
    ┌──────────────┼──────────────┐
    ▼              ▼              ▼
┌────────┐  ┌──────────┐  ┌──────────┐
│SendGrid│  │  SMTP    │  │  Gmail   │
│  API   │  │  Direct  │  │  API     │
└───┬────┘  └────┬─────┘  └────┬─────┘
    │            │              │
    ▼            ▼              ▼
┌─────────────────────────────────────┐
│         TRACKING LAYER               │
│  email-track EF (pixel + redirect)  │
│  webhooks-sendgrid / mailchimp      │
│         ↓                            │
│  record_email_event() RPC           │
│  → email_events table               │
│  → email_analytics_summary (MV)     │
└─────────────────────────────────────┘
```

## 6.3 Sender Account Architecture

```
┌──────────────────────────────────────────┐
│          sender_accounts (public)         │
│  workspace_id, provider, from_email      │
│  status, is_default, use_for_outreach    │
│  daily_sent_today, warmup_enabled        │
│  health_score                            │
│  ┌────────────────────────────────────┐  │
│  │   RLS: user can SELECT/UPDATE own  │  │
│  └────────────────────────────────────┘  │
└────────────────┬─────────────────────────┘
                 │ 1:1 FK
                 ▼
┌──────────────────────────────────────────┐
│       sender_account_secrets (private)    │
│  oauth_access_token, oauth_refresh_token │
│  smtp_host/port/user/pass, api_key       │
│  ┌────────────────────────────────────┐  │
│  │   RLS: NO user policies            │  │
│  │   Access via service_role only     │  │
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘

Connection flows:
  Gmail:     connect-gmail-oauth → Google OAuth → connect_sender_account RPC
  SendGrid:  connect-sendgrid → API key validation → connect_sender_account RPC
  SMTP:      connect-smtp → STARTTLS handshake → connect_sender_account RPC
  Mailchimp: connect-mailchimp-oauth → API validation → connect_sender_account RPC
                                                        (use_for_outreach=false)
```

## 6.4 Integration Hub Mapping

```
┌──────────────────────────────────────┐
│         IntegrationHub UI             │
│  Categories: CRM, Email, Analytics,  │
│  Payment, Communications             │
└──────┬──────────────┬────────────────┘
       │              │
       ▼              ▼
┌─────────────┐  ┌───────────────────┐
│ integrations│  │ sender_accounts   │
│   table     │  │   table           │
│ (CRM, GA,   │  │ (Gmail, SendGrid, │
│  Slack,     │  │  SMTP, Mailchimp) │
│  Stripe)    │  │                   │
└─────────────┘  └───────────────────┘

The IntegrationHub presents a unified view but the data lives in two tables.
Email providers → sender_accounts (source of truth)
Non-email integrations → integrations table
useIntegrations() hook merges both for display.
```

---

# SECTION 7 — CLEAN IMPROVEMENT TARGETS

## 7.1 Top 10 Structural Improvements

1. **Parallelize process-scheduled-emails**: Replace sequential for-loop with Promise.allSettled pool (concurrency=5). Reduces 50-email batch from ~25s to ~5s.

2. **Add watchdog for stuck scheduled_emails**: Emails stuck in status='processing' >5 min should be reset to 'pending'. No recovery mechanism exists today.

3. **Deduplicate social publishing logic**: `social-post-now` and `social-run-scheduler` share ~80% code. Extract to shared module.

4. **Move secrets from integrations table**: `integrations.credentials` JSONB is user-readable via RLS. Mirror the sender_accounts pattern: split into `integration_secrets` with no user RLS.

5. **Unify email instrumentation**: `send-email` edge function and `emailTracking.ts` both implement link rewriting. Make the edge function the sole instrumentation point.

6. **Add event table TTL/archival**: email_events, tracking_events, audit_logs need partition-by-month or TTL policy to prevent unbounded growth.

7. **Replace polling with Supabase Realtime**: `pollRunProgress()` polls every 2-5s. Subscribe to `email_sequence_runs` changes via Supabase Realtime channels.

8. **Clean up legacy lead fields**: Drop `leads.lastActivity`, `leads.email`, `leads.name` (keep `last_activity`, `primary_email`, `first_name`/`last_name`). Add NOT NULL constraints to canonical fields.

9. **Drop deprecated outbound_usage table**: Scheduled for 2026-04-03. Add migration to drop.

10. **Atomic default sender swap**: Replace clear-all-then-set-one with single UPDATE using a CTE to prevent race conditions leaving zero/multiple defaults.

## 7.2 Top 5 Performance Improvements

1. **Composite index scheduled_emails(owner_id, status)**: Campaign status filtering currently uses single-column owner_id index + heap filter.

2. **Batch email sending with connection reuse**: SMTP sends in process-scheduled-emails open a new connection per email. Pool connections for same provider.

3. **Materialized view for campaign performance**: `fetchCampaignPerformance` does 3 sequential queries. Pre-aggregate like email_analytics_summary.

4. **Reduce fetchBatchEmailSummary round-trips**: Current 50-lead chunks with 2 queries each = O(N/50 * 2) queries. Use a single RPC that joins messages + events server-side.

5. **Index social_posts(status, scheduled_at)**: social-run-scheduler queries due posts every minute. Composite index eliminates seq scan on growing table.

## 7.3 Top 5 Data Integrity Risks

1. **No FK on leads.user_id to auth.users**: Currently FK to profiles, but if profile deleted, leads cascade-delete. Consider ON DELETE RESTRICT.

2. **scheduled_emails 'processing' without timeout**: If edge function crashes, emails stuck forever. Need reset mechanism.

3. **Sender daily_sent counter race**: Read-then-increment is not atomic. Two concurrent sends could both pass the cap check then both increment.

4. **Invoice status driven by webhooks only**: If Stripe webhook fails, invoice stays 'open' after payment. No reconciliation job.

5. **email_sequence_run_items orphan potential**: If `finalize_email_sequence_run` fails mid-way, some items become scheduled_emails but run status doesn't update.

## 7.4 Top 5 Security Improvements

1. **Move integration credentials to separate secrets table** with no user-facing RLS (mirrors sender_account_secrets pattern).

2. **Add signature verification to webhooks-mailchimp** (currently accepts any POST).

3. **Rate-limit email-track endpoint**: Public pixel/redirect endpoint has bot detection but no rate limiting. Abuse could inflate event counts.

4. **Encrypt social_accounts tokens at rest**: Currently stored as plaintext in user-readable RLS table.

5. **Audit credential access**: Log when sender_account_secrets are read by edge functions for security monitoring.

## 7.5 Suggested Migration Order

```
Phase 1 — Safety (Week 1):
  1. Add watchdog for stuck scheduled_emails (processing > 5 min)
  2. Atomic default sender swap (CTE-based)
  3. Move integration credentials to integration_secrets table
  4. Add Mailchimp webhook signature verification

Phase 2 — Performance (Week 2):
  5. Parallelize process-scheduled-emails (concurrency pool)
  6. Add composite index scheduled_emails(owner_id, status)
  7. Add composite index social_posts(status, scheduled_at)
  8. Replace pollRunProgress with Supabase Realtime

Phase 3 — Cleanup (Week 3):
  9. Deduplicate social publishing logic
  10. Unify email instrumentation to edge function only
  11. Clean up legacy lead fields (drop lastActivity, email, name)
  12. Drop outbound_usage table

Phase 4 — Scale (Week 4):
  13. Event table partitioning (email_events, tracking_events, audit_logs)
  14. fetchBatchEmailSummary → single server-side RPC
  15. Campaign performance materialized view
```

---

*End of export. Generated 2026-03-03 from commit b77c2b1.*
