# Scaliyo — Complete Feature Inventory

> Status legend: ✅ Fully functional · 🟡 Partially implemented · 🎨 UI-only/placeholder · 🔴 Broken · 👻 Planned/referenced but missing. Roles: all portal features are CLIENT-owned (own data) unless noted; ADMIN sees all via admin RLS.

---

## A. Authentication & Onboarding

**Authentication** — ✅ · Purpose: account access. Route `/auth`, `/reset-password`, `/auth/confirm`. Files `pages/portal/AuthPage.tsx`, `hooks/useAuthMachine.ts`, `components/auth/AuthGate.tsx`. Backend `supabase.auth` (GoTrue) + `auth-send-email`. Tables `auth.users`, `profiles`, `workspaces`, `subscriptions`. Integrations Google/GitHub OAuth, SendGrid/SMTP. Limitation: "remember me"/Terms decorative; a dev "Schema Required" screen can leak on certain errors. Rec: remove dev artifacts.

**Onboarding** — 🟡 (cosmetic) · Route `/onboarding`. File `OnboardingPage.tsx`. Writes `profiles.businessProfile` JSON + a **localStorage** completion flag. The "setting up workspace" step provisions nothing. Rec: actually provision, persist flag server-side, sync to `business_profiles`.

**User profile / settings** — 🟡 · Route `/portal/settings`. File `ProfilePage.tsx` (3253 lines). Real: name, business-profile JSON, AI enrichment wizard (credit-gated), logo upload, require-validation toggle. 🎨 Mock: API keys (localStorage `af_` token), 2FA (UI only), notifications/preferences (localStorage), **account deletion (fake — deletes nothing)**, session activity/usage/export (mock). Rec: implement or hide mock tabs; wire real deletion (privacy).

---

## B. Tenancy, Businesses & Teams

**Multi-business** — ✅ CRUD / 🟡 scoping · Route `/portal/businesses`, `/portal/business-settings`. Files `BusinessesPage.tsx`, `BusinessSettingsPage.tsx`, `components/business/BusinessProvider.tsx`, `lib/businesses.ts`. Backend `create_business`, `get_or_create_default_business`. Tables `businesses`, `business_members`, `business_profiles`. Limitation: **`multi_business` flag off by default → switching doesn't filter data** (honest banner warns). Rec: finish the leads cutover, enable scoping.

**Workspaces** — ✅ (implicit) · Tables `workspaces`, `workspace_members`. `workspace.id == user.id` convention. No real management UI. `workspace_invites` orphaned.

**Team Hub (kanban)** — 🟡 · Route `/portal/team-hub`. Files `pages/portal/team-hub/*`, `teamHubApi.ts`, `hooks/useFlowPermissions.ts`. Tables `teamhub_boards/lists/cards/flow_members/...`. Real RBAC RLS; boards/cards work. **Invite-accept dead-ended (no email, `acceptInvite` never called).**

**Team / Strategy Hub invites** — 🔴 · Tables `teams`, `team_members`, `team_invites`. Accept path exists (`GlobalInviteBanner`) but **no send UI creates invites**; accepting grants `team_members` which gives no Team Hub access. Rec: unify the two team systems, build invite-send + email, server-side accept.

**RBAC** — 🟡 · Roles: platform `ADMIN/CLIENT/GUEST` (+super-admin), workspace/business `owner/admin/member/viewer`, team-hub flow roles. Backend-enforced via RLS + guard functions. **No functional job roles (sales/marketing/billing) exist.** See ROLES_AND_PERMISSIONS.md.

---

## C. Leads & CRM

**Lead discovery / search** — 🔴/👻 · Route `/portal/leads`. The search box is a **local filter**; **no data-provider integration exists** ("Apollo" = dead scaffolding). Rec: integrate a provider or remove Apollo tables.

**Lead import (CSV/XLSX)** — ✅ · Files `lib/leadImporter.ts`, `ImportLeadsWizard`. Backend `import_leads_batch` RPC. Tables `leads`, `import_batches`, `audit_logs`. Robust (dedupe, multi-email, caps, Website header). Limitation: doesn't score/enrich new leads (`score=0`).

**Lead export** — ✅ (basic) · Client-side CSV blob (fixed 6 columns). No field selection.

**Lead enrichment** — ✅ · Files `enrich-lead` fn, `LeadEnrichmentWatcher`. Table `lead_enrichment_jobs`, `leads`. Durable background job; Gemini grounded (googleSearch+urlContext); credit-gated (fail-closed). Survives reload.

**Lead scoring** — ✅ (Phase 4.D + Roadmap 1.2) · Real signal-based scorer `lib/leadScoring.ts` (`recalcLeadScore` / `recalcLeadScoresBulk`) → `lead_scores` + synced `leads.score`; `+5` placeholder gone. `lead_intelligence` is now **ON by default**, so the Score/Research/Next-action panels show on every lead; a bulk **"Score"** action on the Leads page recomputes all leads in the business so the table/kanban reflect real scores. AI research/next-action still gated behind explicit credit-gated buttons.

**Lead research profile** — 🟡 (hidden) · `lib/leadResearch.ts` → `lead_research_profiles`; strict no-fabrication + confidence. Flag-gated (`lead_intelligence`).

**Next-best-action** — 🟡 (hidden) · `components/leads/NextActionPanel.tsx` + `contextPacket.ts`. AI over business-scoped context packet. Flag-gated.

**Company/contact intelligence** — 🟡 · Enrichment writes `leads.knowledgeBase`/`insights`. No third-party firmographic provider.

**Pipeline / CRM** — 🟡→✅ · `leads.status` enum (New/Contacted/Qualified/Converted/Lost). Kanban with **next-stage button (no drag-drop)**. **Deals now exist** (Phase 4.E): `deals` table + `lib/deals.ts` + a Deals tab on the lead profile with value, stage (discovery→won/lost), probability, expected close, and open/weighted pipeline totals. (A standalone cross-lead pipeline board is still a future add; deals are currently managed per-lead.)

**Notes** — ✅ (Phase 4.A) · Persisted to `lead_notes` (`lib/leadNotes.ts`); load-on-mount + add/delete; RLS by workspace membership + author. Survives reload.

**Tasks / reminders / follow-ups** — ✅ (Phase 4.B) · Persisted to the canonical `tasks` table (migration `20260818150000`, `lib/tasks.ts`): lead-scoped, assignable, due_at/priority/status/completed_at, per-business. Add/toggle/delete + real due labels in `LeadProfile`. Reminder delivery (`reminder_at`) column exists; not yet wired to a sender.

**Activities / activity log** — ✅ (Phase 4.C) · LeadManagement "Log Activity" modal now persists to `lead_activities` (`lib/leadActivities.ts`; loads history on open). The `LeadProfile` timeline aggregates **real** events — created, validation, calls, meetings, inbound replies, **plus notes, tasks and the freeform activity log**. Status changes → `audit_logs`.

**Calls / meetings (records)** — ✅ · `lead_call_logs`, `lead_meetings` persisted (manual + VOIP).

**Tags & colors** — ✅ · Inline `leads.tags[]`; `lead_stage_colors`/`lead_color_overrides`. (`lead_tag_assignments`/`tags` tables unused.)

**Public Leads API** — ✅ · `v1-leads` (GET/POST/PATCH, api-key auth, idempotency, cross-workspace guard).

---

## D. AI & Knowledge

**AI Command Center (chat)** — ✅ (no credit ceiling) · Route `/portal/ai`. Backend `ai-chat-stream` (SSE, Gemini 2.5-flash). Tables `ai_threads`, `ai_messages`.

**Business analysis (auto-fill profile)** — 🟡 (accuracy issues) · Files `lib/gemini.ts:analyzeBusinessFromWeb/Document`, `fetch-page`. Root causes of inaccuracy: prompt tells model to crawl but grounding disabled; only 7 fixed paths; SPA blind spot; no schema-constrained decode. See AI_SYSTEM_ANALYSIS.md.

**AI recommendations / dashboard insights** — 🟡 · `generateDashboardInsights`, `suggestNextAction` (grounded, credit-gated).

**Knowledge bases** — 🟡 · Per-business `business_profiles` (under-consumed) vs per-user `profiles.businessProfile` (over-used). **Not synced; not business-isolated in memory tables.** Rec: unify + add `business_id` to memory.

**AI memory** — 🟡 · `workspace_memory`/`lead_memory`/`campaign_memory` — **workspace-scoped, no business_id**; not injected into the send pipeline; reply content never captured.

**Prompt / DNA registry** — ✅ (admin) · Route `/admin/prompts`. Tables `user_prompts`, `user_prompt_versions`. Per-user prompt overrides.

**Model training / prompt-lab** — 🟡 · Route `/portal/model-training`. Uses `gemini-flash-lite-latest` (fixed from retired model this session).

**Image generation (text→image)** — ✅ · `lib/imageGen.ts` Imagen 4 via proxy, credit-gated. No history persisted. (The `image-gen` edge fn is a 🔴 dead stub writing to a nonexistent table.)

**Image→content (vision)** — ✅ · Route `/portal/image-studio`. Gemini vision → channel copy → `generated_assets`. Flag-gated `image_studio`.

**Voice assistant (ElevenLabs)** — ✅ (nav widget) · Site/portal navigation assistant. **Not** a call co-pilot.

---

## E. Email, Campaigns & Inbox

**Compose / preview / send single email** — ✅ · `send-email` (SendGrid API + hand-rolled SMTP), open-pixel + click tracking, suppression + sender-health gating. Preview via `preview-sequence-email`.

**Campaigns / sequences** — ✅ · Route `/portal/campaigns`. Files `CampaignsPage.tsx`, `lib/campaigns.ts`. Multi-step, delays, A/B subject+body, merge fields, AI/verbatim, send window, best-time. Tables `email_sequences`, `sequence_steps`, `sequence_enrollments`.

**Quick Launch** — ✅ · Route `/portal/quick-launch`. Fast on-ramp; creates a real managed campaign (verified this session).

**3-stage send pipeline** — ✅ (with latent hazard) · `start-email-sequence-run` → `process-email-writing-queue` (AI write / verbatim) → `process-sequence-sends` (send). **🔴 Latent double-send hazard:** the writer still calls `finalize_email_sequence_run`→`scheduled_emails` while `process-sequence-sends` also sends the same items (dormant today). `process-scheduled-emails` has **no cron**. Rec: remove the finalize tail.

**A/B analytics + auto-optimize** — ✅ (data-starved) · `campaign_variant_stats` (sent/opened/clicked/replied), `ab-autopause` (z-test, reply-aware). Needs real campaign volume; currently 0 attributed messages.

**Best-time send + re-learning** — ✅ · Per-lead modal open-hour; `relearn_best_send_hours` cron (added this session).

**Email templates** — 🎨 (backend-only) · `email_templates` table + CRUD exists but **no user-facing UI**; used only by the automation engine.

**Sender accounts** — ✅ (SMTP/SendGrid) / 🔴 (Gmail) · Route `/portal/sender-accounts`. `connect-smtp` ✅, `connect-sendgrid` ✅, `connect-mailchimp-oauth` 🟡 (marketing-only), `connect-gmail-oauth` **🔴 broken stub (no callback)**, **Outlook 👻 missing** (SMTP workaround only). Health scoring + daily caps enforced.

**Email validation** — ✅ · `mails-validation-worker` (real mails.so calls, 176 in DB), 30-day cache, send-decision gate. Flag-gated `email_validation`. **Key rotation pending.**

**Domain verification** — ✅ · `verify-domain` (Cloudflare DoH DNS checks) for `workspace_domains`.

**Unified inbox / reply tracking** — ✅ · Route `/portal/inbox`. `inbound-email` webhook + `poll-imap-inbox` (IMAP for SMTP senders). Reply→variant attribution (this session). Limitation: only IMAP senders or a configured hosted webhook.

**Tracking** — ✅ · `email-track`/`tracking-redirect` → `email_events`/`email_links`; `email_analytics_summary` MV.

---

## F. Social, Blog & Content

**Social publishing** — 🟡 (code real) / 🔴 (prod demo-mode) · Route `/portal/social-scheduler`. `social-post-now`/`social-schedule`/`social-run-scheduler`. Facebook/Instagram/LinkedIn Graph calls are real, but **all prod accounts are `demo_token` → every publish fails**. **TikTok 👻 missing.** Rec: configure OAuth apps + app review.

**Social scheduling** — ✅ (mechanically) · cron `social-run-scheduler` every 5 min, `claim_due_social_posts`.

**Blog** — ✅ · Portal authoring (`BlogDrafts.tsx`), admin moderation (`BlogManager.tsx`), marketing render (`/blog`, `/blog/:slug`). Review-first workflow. Tables `blog_posts`, `blog_categories`. Guest-contributor tables 👻 empty.

**Content generation** — ✅ · `ContentGen.tsx`, `ContentStudio.tsx` (credit-gated).

**Media assets** — ✅ · Supabase Storage buckets (`social_media`, `blog-assets`, `media_assets`).

**Calendar / publishing schedule** — 🟡 · Social scheduler has a schedule; **no external calendar sync** (Google/Outlook Calendar 👻). `lead_meetings` are DB-only.

---

## G. VOIP

**Outbound calling** — ✅ (dormant) · `LeadCallPanel`, `twilio-token/voice/call-status`. Credit-gated (3, client-side). Blocked on Twilio secrets.

**Multi-number picker** — ✅ · Real.

**Inbound calling + routing** — ✅ (dormant) · `twilio-incoming`, presence in `voip_inbound_routes`.

**Voicemail** — ✅ (dormant) · `twilio-voicemail`.

**Call outcomes / notes** — ✅ · Manual "Log Call" works today; auto-derived from DialStatus.

**Call recordings** — ✅ (dormant) · Dual-channel; URL saved.

**Call transcription / AI co-pilot / summaries / scripts** — 👻 **Missing.** No transcription, no AI assistance during calls.

**Calls view** — ✅ · Route `/portal/calls`; create-lead-from-unknown-caller.

---

## H. Billing & Subscriptions

**Subscription checkout** — ✅ (security gaps) · `billing-checkout` → Stripe Checkout. **P1** client-supplied price/plan. Annual billing unreachable from UI.

**Credit purchase** — ✅ (insecure) · **P0** client-supplied `{credits, price_cents}`.

**Stripe webhook** — ✅ (fails open) · **P0** verification bypassed when secret unset; non-constant-time; no replay check.

**Plans / entitlements / feature flags** — 🟡 · Plans duplicated in 5+ places (drift). `feature_flags` (global kill-switches), `workspace_feature_flags` (self-serve toggles), `workspace_entitlements` (**admin-write, never read for enforcement**). Premium features **not** plan-gated — monetization is quantitative (credits + email caps).

**Credits (dual counter)** — ✅ · Client `workspace_ai_usage` (bypassable) + server `ai_proxy_usage` (`enforce_ai_proxy_quota`, fail-closed, the real ceiling). Some AI paths bypass the ceiling.

**CRM invoicing** — ✅ · `billing-create-invoice`/`billing-actions`; real Stripe invoices to your own customers. Tables `invoices`, `invoice_line_items`, `invoice_packages`.

---

## I. Automation, API, Webhooks, Admin

**Automation / goals** — 🟡 · Route `/portal/automation`, `/portal/goals`. `goal-executor`, `goal-replanner` (on `gemini-3-flash-preview`). Tables `automation_goals`, `automation_plans`, `automation_step_runs`. Crons for drift/replan/resume exist. Live mode flag-gated. Goal lead-ops are workspace-wide (not business-scoped). Rec: verify runtime, scope by business.

**Workflows** — 🟡 · `workflows`, `workflow_executions`, `jobs`, `job_events`. Verify runtime usage.

**Public API** — ✅ · `v1-leads/campaigns/sequences/analytics`, `api_keys`, idempotency, rate limits. Route `/portal/api-keys`, `/portal/api-docs`.

**Outbound webhooks** — ✅ · Route `/portal/webhooks`. `webhook_endpoints`/`webhook_deliveries`/`webhook-dispatcher`; `queue_webhook_event` fires lead/email/sequence events.

**Inbound webhooks** — ✅/🟡 · SendGrid/Mailchimp (verified), Stripe (fail-open), Twilio (unverified), inbound-email.

**Integrations hub** — 🟡 · Route `/portal/integrations`. `validate-integration`, `verify-domain`, `integrations` table.

**Notifications** — 👻 **Missing (UI-only)** · No `notifications` table in the migration chain; **nothing reads/writes/delivers** notifications; the header bell opens `DailyBriefing.tsx` (self-contained, contains a `Math.random()` mock, "mark read" just closes). Not a real system. Rec: build it or remove the bell.

**Analytics / reporting** — 🟡 · Route `/portal/analytics`, dashboards. `email_analytics_summary` MV, tracking events. Real campaign analytics; **no salesperson/deal reporting.**

**Branding / domains** — 🟡 · Route `/portal/branding`. `workspace_branding`, `workspace_domains`, vanity TLS.

**Admin console** — 🟡 (UI real, **backend authz P0-broken**) · Routes `/admin/*` (users, AI ops, prompts, leads, blog, audit, settings, pricing, console, ops, command, support). Frontend RBAC is real (`is_admin()` reads). **But `admin_*` write RPCs authorize on a caller-supplied `p_admin_id` and are `EXECUTE`-granted to `anon` → any actor can run them (BUG-037, P0).** Rec: authorize on `auth.uid()`, REVOKE from anon.

**Audit logs** — ✅ · `audit_logs`, `support_audit_logs`; `admin-audit-export`. Time-boxed support impersonation (`support_sessions`).

**Security / privacy controls** — 🟡 · Strong RLS + guard functions + self-escalation trigger; but P0 profile-PII policy, mock account deletion, no PII retention. See SECURITY_AND_PRIVACY_AUDIT.md.
