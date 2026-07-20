# Scaliyo — Database Schema

> Postgres (Supabase). 111 base tables · 1 materialized view · 105 functions/RPCs · 331 RLS policies · 207 indexes · 210 foreign keys · 3 enums. Full DDL in `DATABASE_SCHEMA.sql`. Schema only — no production data.

## 1. Enums

| Enum | Values | Used by |
|---|---|---|
| `user_role` | `ADMIN`, `CLIENT`, `GUEST` | `profiles.role` — platform-level role (admin routing + `is_admin()` RLS). `GUEST` effectively unused. |
| `workspace_role` | `owner`, `admin`, `member`, `viewer` | `workspace_members.role` |
| `post_status` | `draft`, `pending_review`, `published`, `archived` | `blog_posts` (review-first workflow) |

> Note: `business_members.role` and `team_members.role` are **CHECK-constrained text**, not enums — inconsistent with `workspace_role`.

## 2. Tables by Domain

### 2.1 Identity, tenancy & teams
| Table | Purpose | Key columns | Keys / notes |
|---|---|---|---|
| `profiles` | Per-user profile & platform role | `id`(=auth.uid), `role` user_role, `is_super_admin`, `plan`, `stripe_customer_id`, `businessProfile` jsonb, `preferences` jsonb, `name` | PK=auth.users.id. **⚠️ legacy `USING(true)` SELECT policy still live for `authenticated` → cross-tenant PII read (P0).** Privileged columns guarded by `enforce_profile_privileged_columns` trigger. |
| `workspaces` | Tenant container (id == user.id for solo) | `id`, `owner_id`, `name` | Created by `handle_new_user_workspace` trigger |
| `workspace_members` | Workspace membership | `workspace_id`, `user_id`, `role` workspace_role | `is_workspace_member()` |
| `workspace_invites` | Workspace invites | — | **Orphaned — no frontend/backend references** |
| `businesses` | Multiple businesses per workspace (v2) | `id`, `workspace_id`, `status` | `create_business` RPC; archive = soft delete |
| `business_members` | Business membership + role | `business_id`, `user_id`, `role`(owner/admin/member/viewer) | `is_business_member()`, `is_business_admin()` |
| `business_profiles` | Per-business AI "brain" (brand voice, positioning, sender/compliance) | `business_id`, brand fields | Any member can write (not admin-only). **Diverges from `profiles.businessProfile` JSON — dual unsynced store.** |
| `teams`, `team_members`, `team_invites` | "Strategy Hub" team model | `role` text CHECK | **No send-UI creates these; accept-only path; team_members INSERT policy self-joinable (P1).** |
| `teamhub_boards`/`_lists`/`_cards`/`_card_members`/`_comments`/`_flow_members`/`_flow_templates`/`_invites`/`_item_leads`/`_activity` | Team Hub kanban (separate from `teams`) | board/list/card graph | Real RBAC RLS (`teamhub_user_flow_role`); **invite-accept dead-ended, no email.** |

### 2.2 Leads & CRM
| Table | Purpose | Key columns | Notes |
|---|---|---|---|
| `leads` | Core lead record | `id`, `client_id`(owner), `workspace_id`, `business_id`, `primary_email`, `emails[]`, `company`, `status`, `score`, `tags[]`, `knowledgeBase` jsonb, `insights`, `custom_fields`, `assigned_to`, `last_activity` | RLS OR's legacy `client_id` + new `is_business_member(business_id)`. `score` is synced from the canonical scorer (`lead_scores`, Phase 4.D); `tags[]` + `assigned_to` are UI-settable (Phase: quick-actions). |
| `lead_scores` | Real signal-based score breakdown | fit/intent/engagement/quality/deliverability/urgency/risk sub-scores | Written by `leadScoring.ts`; surfaced only if `lead_intelligence` flag on |
| `lead_research_profiles` | Structured AI research (no-fabrication) | company/needs/outreach, `confidence` | Flag-gated |
| `lead_enrichment_jobs` | Durable background enrichment job state | `status`(queued/processing/done/error) | Polled by `LeadEnrichmentWatcher` |
| `lead_call_logs` | Call history (VOIP + manual) | `direction`, `outcome`, `duration_seconds`, `recording_url`, `call_sid`, `notes` | Functional |
| `lead_meetings` | Scheduled meetings | time, lead | Functional |
| `lead_notes` | Lead notes | — | **⚠️ UNUSED — UI keeps notes in local state, never persisted (data loss).** |
| `lead_tag_assignments`, `tags` | Normalized tags | — | **Unused — tags stored inline in `leads.tags[]`.** |
| `lead_stage_colors`, `lead_color_overrides` | Pipeline/lead color theming | — | Functional (`leadColors.ts`) |
| `lead_memory` | Per-lead AI memory | — | See AI analysis |
| `import_batches` | Import run summaries | counts, strategy | Written by `import_leads_batch` |
| `apollo_import_logs`, `apollo_search_logs` | Lead-discovery logs | — | **Dead scaffolding — no code writes them; no provider integration exists.** |
| `activity_feed` | Activity stream | — | Exists in DB; **not written by lead code** (verify consumers). |

### 2.3 Email, campaigns & inbox
`email_sequences`, `sequence_steps`, `sequence_enrollments`, `email_sequence_runs`, `email_sequence_run_items` (campaign engine); `email_messages`, `email_events`, `email_links`, `tracking_links`, `tracking_events` (send + tracking); `email_templates`; `scheduled_emails`; `inbound_emails`, `imap_poll_state` (inbox); `sender_accounts`, `sender_account_secrets`, `email_provider_configs` (senders); `email_validations`, `email_validation_log` (mails.so); `suppressions`, `email_dlq` (deliverability); `campaign_memory`. Materialized view `email_analytics_summary` aggregates opens/clicks per owner/day (refreshed every 10 min). *(Detailed status in COMPLETE_FEATURE_INVENTORY.md / email agent findings.)*

### 2.4 AI & knowledge
`ai_threads`, `ai_messages` (chat); `workspace_memory`, `lead_memory`, `campaign_memory` (memory layer); `ai_credit_usage`, `ai_proxy_usage`, `ai_usage_logs`, `workspace_ai_usage` (metering); `ai_rate_limit_buckets` (**RLS-off**, internal); `user_prompts`, `user_prompt_versions` (prompt/DNA registry); `generated_assets`, `media_assets` (AI content + uploads).

### 2.5 Social & content
`social_accounts` (**all rows are `demo_token` in prod**), `social_posts`, `social_post_targets`, `social_post_events`; `blog_posts`, `blog_categories`, `guest_contributors`+`guest_post_outreach` (**empty/planned**); `workspace_branding`, `workspace_domains`.

### 2.6 Billing & usage
`plans`, `subscriptions`, `credit_purchases`, `invoices`, `invoice_line_items`, `invoice_packages`, `invoice_package_items` (CRM invoicing), `usage_events` (**appears unwritten**), `workspace_usage_counters`, `workspace_entitlements` (**admin-write only, not read for enforcement**), `feature_flags` (global kill-switches), `workspace_feature_flags` (self-serve toggles), `config_settings`.

### 2.7 Automation, jobs, API & webhooks
`automation_goals`, `automation_plans`, `automation_step_runs` (goal executor); `workflows`, `workflow_executions`; `jobs`, `job_events`; `api_keys`, `api_idempotency`, `api_rate_limit_buckets` (**RLS-off**), `usage_events`; `webhook_endpoints`, `webhook_deliveries` (outbound); `integrations`.

### 2.8 Admin, support & audit
`audit_logs`, `support_audit_logs`, `support_sessions` (time-boxed impersonation via `has_active_support_session`), `notifications`, `voip_inbound_routes` (VOIP presence).

## 3. Views
- **`email_analytics_summary`** (materialized) — per `owner_id`/day: total_sent, unique_opens, unique_clicks (bot-filtered). Refreshed by cron `refresh-email-analytics` every 10 min. This is the analytics cache; no other views found.

## 4. Functions / RPCs (105 total) — notable
- **Authz helpers (SECURITY DEFINER):** `is_admin`, `is_super_admin`, `is_business_member`, `is_business_admin`, `is_workspace_member`, `is_team_member`, `teamhub_user_flow_role`, `has_active_support_session`.
- **Tenancy bootstrap:** `handle_new_user`, `handle_new_user_workspace`, `get_or_create_default_business`, `create_business`, `resolveWorkspaceForUser` (client).
- **Credits/limits (server-enforced):** `enforce_ai_proxy_quota` (fail-closed, service_role only), `consume_ai_rate_limit`, `increment_ai_usage`, `get_workspace_monthly_usage`, `workspace_has_flag`.
- **Leads/import:** `import_leads_batch`, `clear_business_profile`.
- **Admin (SECURITY DEFINER):** `admin_grant_credits`, `admin_change_user_plan`, `admin_update_plan`, `admin_clone_plan`, `admin_adjust_credits_used`, `admin_reset_monthly_usage`, `admin_update_entitlements`, `admin_update_feature_flag`.
- **Campaigns/analytics:** `campaign_variant_stats` (sent/opened/clicked/replied per variant), `relearn_best_send_hours`, `claim_due_social_posts`, `queue_webhook_event`.
- **Cron invokers:** `invoke_email_writing_queue`, `invoke_sequence_sends`, `invoke_webhook_dispatcher`, etc.

## 5. Triggers (notable)
- `enforce_profile_privileged_columns` **BEFORE UPDATE on `profiles`** — blocks non-admin end-users from changing `role`/`is_super_admin`/`plan` (self-escalation guard). Good.
- `update_updated_at` on `lead_notes`, `email_sequences`, `sequence_steps`, `jobs` (timestamp touch).
- `touch_automation_goals`, `log_goal_outcome_to_memory` (AFTER UPDATE on `automation_goals` → memory).
- Webhook-event triggers (migration 20260510000000) fire lead.created/updated, sequence.completed, email.* into `queue_webhook_event`.

## 6. Row-Level Security
- **109 / 111 tables RLS-enabled.** Only `ai_rate_limit_buckets` and `api_rate_limit_buckets` lack RLS (internal, service-role written) — acceptable.
- Scoping is **inconsistent across the three tenancy models**: leads/campaigns OR legacy `client_id`/`owner_id` with `is_business_member(business_id)`; usage/billing use `workspace_id = auth.uid()`; team hub uses flow-role functions.

## 7. Schema Analysis — Risks & Smells

### Unused / dead tables
`workspace_invites` (orphaned), `lead_notes` (UI never persists), `lead_tag_assignments` + `tags` (superseded by `leads.tags[]`), `apollo_import_logs` + `apollo_search_logs` (no producer), `usage_events` (unwritten), `guest_contributors` + `guest_post_outreach` (empty/planned), `workspace_entitlements` (written by admin, never read for enforcement).

### Duplicate / overlapping structures
- **Three tenancy models** (`workspaces` vs `businesses` vs `teams`) + **two team systems** (`teams/*` vs `teamhub_*`).
- **Two business-profile stores** (`profiles.businessProfile` JSON vs `business_profiles` table) — not kept in sync.
- **Plan/limit config duplicated in 5+ places** (DB `plans`, `_shared/plans.ts`, `lib/plans.ts`, `lib/credits.ts`, `config/creditLimits.ts`, hardcoded SQL ceiling) — confirmed drift (Scale email cap 40000 vs 50000).
- **Two credit counters** (`workspace_ai_usage` client + `ai_proxy_usage` server).
- **Two enrichment `generateLeadResearch` functions** (`lib/gemini.ts` vs `lib/leadResearch.ts`).

### Weak tenant isolation
- **`admin_*` RPCs authorize on a caller-supplied `p_admin_id` and are `EXECUTE`-granted to `anon` — anyone can grant credits / change plans / flip flags (P0, the worst finding).**
- **`subscriptions` self-writable:** public `INSERT with_check=true` + `UPDATE` without `WITH CHECK` → users self-grant plan/credits (P1).**
- **`audit_logs` `SELECT USING (auth.uid() IS NOT NULL)`** → any authenticated user reads all tenants' audit rows (P1).
- `profiles` `USING(true)` SELECT for authenticated — **cross-tenant PII exposure (P0)**.
- `team_members` INSERT self-joinable — a user can insert into an arbitrary `team_id` (P1).
- `teamhub_flow_members` UPDATE doesn't validate target role (escalation, P2).
- `workspace_feature_flags` are self-serve INSERT/UPDATE by any member — if any flag is meant to be a premium gate, it's bypassable.

### Data-integrity risks
- `workspace_id == user.id` convention assumed in some paths, resolved from `workspace_members` in others — diverges under true multi-workspace. `workspace_id` NOT NULL with no default has repeatedly broken inserts (import, admin RPCs, `email_sequence_runs` — all fixed reactively).
- Notes/tasks/activity-log data silently discarded (not a DB issue but a persistence gap against existing tables).
- Social tokens stored plaintext in `*_encrypted`-named columns.

### Missing indexes / performance
- Inbound VOIP reverse-lookup scans up to 2000 leads client-side per call (no server index/RPC).
- 207 indexes exist and prior cleanup removed redundant ones; review FK coverage on high-write audit tables (do not blindly index — see project convention).

### Tables supporting unfinished features
`automation_*`/`workflows` (goal executor — verify runtime), `guest_*` (guest blogging), `apollo_*` (lead discovery), `workspace_entitlements` (plan overrides), `email_dlq` (dead-letter — verify drain).

## 8. Soft-delete, audit fields, retention
- **Soft delete:** businesses use `status='archived'`; most tables hard-delete or cascade. No global soft-delete convention.
- **Audit fields:** most tables carry `created_at`/`updated_at`; `audit_logs` + `support_audit_logs` capture security events (workspace_id was recently made NOT NULL — several RPCs fixed to set it).
- **Retention:** cron GC on `api_idempotency`, `ai_rate_limit_buckets`, `api_rate_limit_buckets`. No documented retention/erasure policy for PII (leads, inbound_emails, call recordings) — a GDPR/CCPA gap (see SECURITY_AND_PRIVACY_AUDIT.md). Account deletion is currently **fake** (no data erasure).
