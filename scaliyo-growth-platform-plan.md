# Scaliyo → Growth Platform: Developer-Ready Build Plan

> **Implementation Plan · Complete Growth & Marketing Platform**

A safe, incremental plan to evolve the existing Scaliyo (AuraEngine) codebase into a full AI-powered growth workspace — lead CRM, connected inbox, email/blog/social studios, campaign orchestration, and team approval — **without a rebuild**. Every item is tagged against what the code actually does today, and Phase 0 removes fabricated data before any new feature ships.

| | |
|---|---|
| **Basis** | full 24-section code audit |
| **Approach** | incremental, feature-flagged |
| **Phases** | 0–10 |
| **New tables** | ~20 |
| **New edge fns** | ~14 |

**Status legend:** **[EXISTS]** real & usable · **[PARTIAL]** real but incomplete · **[MOCK]** UI only / fabricated · **[MISSING]** greenfield · **[edge]** lives in out-of-repo edge fn

**Contents:** [A. Executive Summary](#a-executive-summary) · [B. Product Direction](#b-product-direction) · [C. Current Code Gaps](#c-current-code-gaps--real--mock--missing) · [D. New Module Map](#d-new-module-map) · [E. Database Plan](#e-database-plan) · [F. Backend / Edge Plan](#f-backend--edge-function-plan) · [G. Frontend Plan](#g-frontend--ui-plan) · [H. AI Workflow Plan](#h-ai-workflow-plan) · [I. Integration Plan](#i-integration-plan) · [J. Team Workflow Plan](#j-team-workflow--approval-plan-15) · [K. Security / Compliance](#k-security--compliance-fixes--do-these-first-3) · [L. Phased Roadmap](#l-phased-roadmap-safe-incremental) · [M. Testing Checklist](#m-testing-checklist) · [N. Remaining Questions](#n-remaining-questions)

---

## A. Executive Summary

Scaliyo today is an **AI content + email-outreach tool with a lead-list CRM veneer**. The bones you need for a growth platform already exist — a server-side Gemini engine, a business-profile analyzer, an email send/track pipeline, a blog drafting flow with a real `pending_review` approval step, a social scheduler skeleton, a Team Hub kanban, and an AI Goals planner. The gap to "Complete Growth & Marketing Platform" is mostly **(1) trust** (delete fabricated scores/analytics, fix critical RLS, add unsubscribe/suppression), **(2) real connectivity** (Gmail/Outlook OAuth inbox + reply capture, IG/FB/TikTok publishing, blog CMS publishing, email validation), and **(3) unification** (one Business Brain + scoped knowledge bases feeding one Campaign Studio with team approval).

The plan is deliberately incremental: **Phase 0 hardens security and strips fake data** so the platform is honest and safe; then each Studio ships behind a feature flag on top of a shared **Business Brain** and **on-demand knowledge bases**. Nothing here requires a rebuild — every phase extends existing files or adds additive tables/edge functions with a clean rollback.

**The one architectural spine** that makes all of this coherent: an `ai-context-builder` edge function that assembles a small, scoped **AI context packet** (business brain + the relevant knowledge base + lead/campaign facts) and every generation feature — email, reply, blog, social — draws from it. Build that spine in Phase 1–2 and the Studios become thin.

---

## B. Product Direction

Reposition from "AI outbound tool" to **"the AI growth workspace where a team turns a business profile into on-brand campaigns across email, blog, and social — and manages the replies."** The organizing ideas:

1. **Business Brain first** — One canonical Business Profile ("Brand Brain") grounds every AI action. Nothing is written until the brain has enough context (with a visible confidence score).
2. **Lead is the cockpit** — Every lead profile hosts an **AI Command Center** and a **Response Assistant** — research, write, handle replies, spin up campaign/blog/social ideas, all in context.
3. **One campaign, many channels** — A Campaign Studio produces email + blog + social assets from a single brief, all routed through **team approval** before send/publish.
4. **Honest by construction** — No fabricated scores, signals, or analytics. Every number traces to a real event; every AI output carries a source + confidence.
5. **On-demand intelligence** — Heavy lead knowledge is built only when the user asks (Research Lead / Build Knowledge), never automatically per import — controls cost and latency.
6. **Compliance is a feature** — Working unsubscribe, suppression on every send path, optional email validation with clear risk gating, real sender identity.

Marketing must be reconciled to this reality (the recent "early-access" rewrite of the marketing site is the right instinct — extend it): drop unbuilt claims (200M contacts, verified-data enrichment, LinkedIn/SMS, "14-day trial") until the corresponding phase ships, then re-add them truthfully.

---

## C. Current Code Gaps — real / mock / missing

| Capability | Status | Evidence / note |
|------------|--------|-----------------|
| Lead import (CSV/XLSX) + dedupe | **[EXISTS]** | `leadImporter.ts` (merge/overwrite/skip); dedupe key in edge RPC |
| Lead scoring | **[MOCK]** | `Math.random()*40+60` (`LeadManagement.tsx:628`); no model |
| Buying signals / engagement timeline / conversion / deal size | **[MOCK]** | fabricated from score (`LeadProfile.tsx:118,591`; `LeadIntelligence.tsx:63`) |
| Lead notes / tasks / activity | **[MOCK]** | local state, never persisted (`LeadProfile.tsx:546,189`) |
| Lead assignment / ownership | **[MOCK]** | hardcoded `TEAM_MEMBERS`; `setInterval` fake (`LeadManagement.tsx:131`) |
| Business profile analyzer (website → profile) | **[EXISTS]** | `analyzeBusinessFromWeb`, per-field confidence (`gemini.ts:942`) |
| Lead website research (AI) | **[EXISTS]** | `generateLeadResearch`, grounded (`gemini.ts:588`) |
| Email/sequence/content generation (Gemini, proxied) | **[EXISTS]** | 15+ features via `gemini-proxy` |
| Email send + open/click tracking | **[PARTIAL]** | client pipeline real; worker is [edge]; rotation dead |
| Suppression / unsubscribe | **[PARTIAL]** | suppression only in QuickLaunch; unsubscribe link dead (`gemini.ts:121`) |
| Email validation (Mails.so etc.) | **[MISSING]** | Not found in current codebase |
| Connected inbox (Gmail/Outlook OAuth + reply sync) | **[MISSING]** | Gmail = App-Password SMTP send only; no IMAP/OAuth inbox |
| Lead responses / reply capture & analysis | **[MISSING]** | Not found; response rate hardcoded 0 |
| Blog drafting + approval (`pending_review`) | **[PARTIAL]** | `BlogDrafts.tsx` real approval; publishes only to Scaliyo's own blog |
| Blog external publishing (WordPress/Webflow/Shopify) | **[MISSING]** | Not found |
| Social generation (LinkedIn/Twitter/Facebook captions) | **[PARTIAL]** | `gemini.ts:1933` — captions for blog sharing only |
| Instagram / Facebook / TikTok publishing + scheduler | **[MISSING]** | `social_posts` skeleton exists; no IG/FB/TikTok publisher; TikTok absent |
| Campaign (unified multi-channel) | **[MISSING]** | only per-channel flows today |
| Content calendar (unified) | **[MISSING]** | Team Hub task calendar only |
| Team approval (non-blog) | **[MISSING]** | approval exists for blog only |
| Analytics | **[MOCK]** | `Math.random()` dashboards; delivered==sent; per-campaign faked |
| Team Hub kanban / AI Goals planner | **[EXISTS]** | real; genuine collaboration + orchestration bases |
| Billing / credits | **[PARTIAL]** | two disconnected stores; client-side enforce; free seats |

---

## D. New Module Map

| Module | Route | Built on | New work |
|--------|-------|----------|----------|
| **Growth Command Center** | `/portal` | MissionControl | Replace mock widgets w/ real cross-channel status (pending approvals, scheduled content, reply queue, credit/AI usage) |
| **Lead CRM** | `/portal/leads` | LeadManagement/Profile | Real notes/tasks/activity/assignment; drop mock score/signals |
| **Lead AI Command Center** | tab in Lead Profile | AICommandCenter + gemini.ts | Context-aware action grid (§H) |
| **Connected Inbox** | `/portal/inbox` | senderAccounts | Gmail/Outlook OAuth, send/draft/schedule, reply sync (§I) |
| **Email Studio** | `/portal/email` | ContentGen/ContentStudio | Unify writers; preview=send parity; approval + schedule + validation |
| **Blog Studio** | `/portal/blog` | BlogDrafts | SEO fields, media, calendar, CMS publish workers |
| **Social Studio** | `/portal/social` | SocialScheduler | IG/FB/TikTok generation + preview + publish workers |
| **Campaign Studio** | `/portal/campaigns` | new | Multi-channel brief → assets → approval → schedule |
| **Content Calendar** | `/portal/calendar` | Team Hub calendar view | Unified schedule across email/blog/social |
| **Team Collaboration** | `/portal/team`, review queue | Team Hub | Real assignment, comments, approvals, mentions (§J) |
| **Business Brain** | `/portal/brand` | ProfilePage analyzer | Full profile + knowledge bases + AI context preview (§H) |
| **Integrations** | `/portal/integrations` | IntegrationHub | Real OAuth accounts; strip mock panels |
| **Analytics** | `/portal/analytics` | analyticsQueries | Real metrics only (§20) |
| **Admin / Security** | `/admin` | admin console | RLS fixes, real health, audit |

---

## E. Database Plan

All new tables carry `workspace_id uuid not null` (the chosen single tenant key), `created_by`, `created_at`/`updated_at`, and an RLS policy `workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())` for CRUD, plus role checks where noted. Commit all of these as real migrations under `supabase/migrations/` (Phase 0 also commits the ~55 existing uncommitted tables).

| Table | Key fields | Notes / RLS / index |
|-------|-----------|---------------------|
| `business_profiles` | workspace_id (uniq), company, website, products jsonb, audience jsonb, tone, offers jsonb, faqs jsonb, case_studies jsonb, objections jsonb, competitors jsonb, sender_name, sender_email, postal_address, confidence numeric, ai_summary text | 1/workspace; owner/admin write. Replaces `profiles.businessProfile` JSONB (migrate). |
| `knowledge_bases` | id, workspace_id, scope `workspace\|lead\|campaign\|content\|reply`, ref_id, version int, freshness_at, confidence, created_by, last_refreshed_at, ai_summary text | Index (scope, ref_id). One row per scoped entity; rebuilt on demand. |
| `knowledge_documents` | id, knowledge_base_id, source_type `website\|social\|paste\|upload\|email\|inbox`, raw_ref (url/storage path), extracted_text, tokens, checksum, created_by | The raw sources; enrichment reads these. Storage bucket for uploads. |
| `lead_research_profiles` | id, lead_id, knowledge_base_id, brief jsonb, sources jsonb, confidence, researched_by, researched_at, status | On-demand only. FK lead. Supersedes `leads.knowledgeBase` AI blob. |
| `lead_responses` | id, lead_id, direction `inbound\|outbound`, source `pasted\|gmail\|outlook`, subject, body, received_at, intent, sentiment, buying_stage, urgency, objection, category, ai_summary, message_ref | Index (lead_id, received_at). Feeds Response Assistant. |
| `ai_context_packets` | id, workspace_id, subject_type, subject_id, packet jsonb (compact), token_count, built_at, expires_at, inputs_hash | Cache for `ai-context-builder`; TTL + hash-invalidation. Cuts AI latency/cost. |
| `generated_assets` | id, workspace_id, kind `email\|blog\|ig\|fb\|tiktok\|reply`, campaign_id, lead_id, title, body, meta jsonb, status, model, tokens, created_by, source_context_id | Every AI output persists here (source-tracked). Feeds approvals. |
| `marketing_campaigns` | id, workspace_id, name, goal, offer, product, tone, channels text[], audience_query jsonb, schedule jsonb, owner_id, status, analytics jsonb | The unifying object. Status machine (§14). |
| `campaign_assets` | id, campaign_id, asset_id→generated_assets, channel, order, schedule_at, status | Join campaign↔assets. |
| `scheduled_content` | id, workspace_id, asset_id, channel, scheduled_at, status `scheduled\|processing\|published\|failed`, publish_job_id, target_account_id | Partial index (scheduled_at) WHERE status='scheduled'. Powers calendar + workers. |
| `email_validations` | id, lead_id, email, provider, status, deliverability, reason, disposable bool, risky bool, invalid bool, checked_at, raw_response jsonb | Index (email). One-per-email cache + history. §11 gating. |
| `suppressions` | id, workspace_id, email (uniq/ws), reason `unsub\|bounce\|complaint\|manual`, source, created_at | Global block list; checked by every send path (§K). |
| `lead_notes` | id, lead_id, author_id, body, mentions uuid[], created_at | Replaces mock notes. |
| `lead_tasks` | id, lead_id, assignee_id, title, due_at, status, priority, created_by | Real tasks + reminders (worker). |
| `lead_activities` | id, lead_id, type, actor_id, ref_type, ref_id, meta jsonb, created_at | Real timeline (status changes, sends, opens, notes). Replaces fabricated timeline. |
| `content_approvals` | id, workspace_id, asset_id\|campaign_id, requested_by, reviewer_id, status `pending\|approved\|rejected\|changes`, decided_at, comment | Generalizes blog `pending_review` to all content. |
| `team_comments` | id, workspace_id, target_type, target_id, author_id, body, mentions uuid[], created_at | Comments on assets/campaigns/leads. |
| `integration_accounts` | id, workspace_id, provider `gmail\|outlook\|instagram\|facebook\|tiktok\|wordpress\|webflow\|shopify`, external_id, display, scopes, status, token_ref (Vault), connected_by, expires_at | **Tokens in Vault/pgsodium, never plaintext, never returned to browser.** |
| `publishing_jobs` | id, workspace_id, scheduled_content_id, provider, attempt, status, error, external_post_id, ran_at | Retry/backoff for blog/social/email publish. DLQ. |
| `inbox_messages` | id, workspace_id, integration_account_id, external_id, thread_id, direction, from, to, subject, snippet, body_ref, lead_id?, is_reply, received_at | Synced mail. Index (integration_account_id, received_at); link to lead by from-email. |

**Migration notes:** all additive (safe). Migrate `profiles.businessProfile`→`business_profiles` and `leads.knowledgeBase`→`lead_research_profiles` with a dual-read shim for one release. Pick `workspace_id` as the single tenant key and backfill `leads.client_id`→`workspace_id`.

---

## F. Backend / Edge Function Plan

All are Supabase Edge Functions (Deno), JWT-authenticated, workspace-scoped, and — critically — **re-enforce credits, suppression, and validation server-side** (never trust the client pre-check). Commit them to `supabase/functions/`.

| Function | Input → Output | Responsibilities |
|----------|----------------|------------------|
| `ai-context-builder` | {subject_type, subject_id} → context packet | Assemble compact packet (business brain + scoped KB + facts); cache to `ai_context_packets`; emit missing-context warnings + confidence. **The spine.** |
| `business-profile-analyzer` | {website, socials, pasted, doc refs} → profile fields+confidence | Extends existing `analyzeBusinessFromWeb`; writes `business_profiles` + `knowledge_documents`. |
| `lead-research-worker` | {lead_id, sources} → research profile (async job) | On-demand only; grounded crawl; writes `lead_research_profiles`+KB; refund credits on hard fail. |
| `gmail-oauth-callback` / `outlook-oauth-callback` | OAuth code → stored account | Exchange code, store tokens in Vault, create `integration_accounts`. PKCE; least-scope. |
| `inbox-sync-worker` | cron → new `inbox_messages` | Gmail history API / Graph delta; detect replies from leads; attach to lead; trigger Response Assistant. |
| `send-email-worker` | scheduled_emails/campaign → sent | Suppression + validation gate + per-inbox cap + pacing/rotation (port `sendingEngine.ts`) + unsubscribe token; via Gmail/Outlook/SMTP; write `email_messages`. |
| `mails-validation-worker` | {emails[]} → validations | Call Mails.so server-side; upsert `email_validations`; single + bulk. |
| `blog-publish-worker` | scheduled_content → external post | WordPress/Webflow/Shopify/webhook publish; retry via `publishing_jobs`; store external id. |
| `social-publish-worker` | scheduled_content → IG/FB/TikTok post | Graph/TikTok APIs; media upload; retry/backoff; status back to calendar. |
| `campaign-scheduler` | cron → enqueue due assets | Fan campaign schedule into `scheduled_content` per channel; respects approval status. |
| `approval-notification-worker` | approval events → notify | Notify reviewers/owner (email/in-app) on submit/approve/reject/changes. |
| `unsubscribe-handler` | signed token → suppression | Public endpoint; verify HMAC token; write `suppressions`; confirmation page. |
| `suppression-checker` | {emails[]} → allow/block map | Shared gate used by send/campaign/validation; single source of truth. |
| **+ harden** `gemini-proxy` | — | Server-side credit re-check + deduct + real token logging (fixes the metering holes). |

---

## G. Frontend / UI Plan

- **Growth Command Center** — `MissionControl.tsx` rebuilt: real tiles — approvals awaiting me, scheduled content (next 7d), reply queue, campaign status, credit/AI usage. No `Math.random()`.
- **Lead Profile — AI tab** — New `LeadCommandCenter.tsx` tab: action grid (§H7) reading the lead context packet; each action opens a preview→edit→save/send/schedule flow.
- **Lead Profile — Response tab** — New `LeadResponse.tsx`: paste-or-synced reply, intent/sentiment/category analysis, drafted reply, status/task updates (§H8).
- **Business Brain** — New `BrandBrainPage.tsx`: profile editor + website/social/paste/upload analysis, AI context preview, confidence meter, knowledge-base manager.
- **Email Studio** — Refactor `ContentGen`/`ContentStudio`→`EmailStudio.tsx`: cold/follow-up/reply/newsletter writers, sequence builder, **preview=send parity**, approval, schedule, validate.
- **Blog Studio** — Extend `BlogDrafts.tsx`: SEO fields (meta/keyword), featured image, internal-link suggestions, comments, calendar, CMS publish targets, status chips.
- **Social Studio** — Extend `SocialScheduler.tsx`: IG/FB/TikTok generators, platform previews, media upload, calendar, approval, publish/retry, connection status.
- **Campaign Studio** — New `CampaignStudio.tsx`: brief → audience → generate multi-channel assets → preview → submit for approval → schedule → track.
- **Content Calendar** — New `ContentCalendar.tsx`: month/week view over `scheduled_content` across all channels; drag to reschedule.
- **Team Review Queue** — New `ReviewQueue.tsx`: everything `pending` approval, filters by channel/owner, approve/reject/request-changes + comments.
- **Integration Settings** — Rework `IntegrationHub.tsx`: real OAuth connect cards for Gmail/Outlook/IG/FB/TikTok/CMS; delete mock health/usage panels.
- **Analytics** — `AnalyticsPage.tsx`: real-only metrics (§20); remove random panels; add validation-health + campaign + content reports.

**Cross-cutting UI:** add a global **toast layer** (fixes silent failures), field-level validation, "why disabled" tooltips, and a shared `PreviewPane` that renders exactly what the send/publish worker will use.

---

## H. AI Workflow Plan

### H1 · Business Profile / Brand Brain (§5)

Extend the existing analyzer into the canonical grounding source. Fields: company, website analysis, products/services, target audience, brand tone, offers, FAQs, case studies, objections, competitors, **compliance sender details + postal address**, AI context preview, AI confidence score. **Rule enforced in code:** every generation edge call first loads the business brain; if confidence < threshold or sender/postal missing, the UI shows a "complete your brand brain" gate before writing.

### H2 · Separate Knowledge Bases (§6)

Five scopes in `knowledge_bases`: **workspace**, **lead**, **campaign**, **content**, **reply/conversation**. Each row: source, version, freshness date, confidence, created_by, last_refreshed, raw source ref (`knowledge_documents`), AI summary.

> **Hard rule — no automatic heavy lead knowledge.** Lead KB is created/refreshed **only** on explicit user action: `Research Lead` `Build Lead Knowledge` `Analyze Lead Website` `Analyze Lead Social Profiles` `Prepare AI Command Center`. Import never triggers it. Each action enqueues `lead-research-worker` and shows progress; results cache with a freshness date and a "refresh" control.

### H3 · Lead-Level AI Command Center (§7)

An action grid inside every lead profile. Each action calls `ai-context-builder` for the lead, then generates. Auto-included context: lead details, lead website, social links, lead research, **business profile**, previous emails sent, pasted/synced replies, notes, campaign goal, email-validation status.

| Action | Output → destination |
|--------|----------------------|
| Generate cold / follow-up / reply email | `generated_assets` → Email Studio preview |
| Analyze pasted response · Suggest next action | `lead_responses` analysis + recommendation |
| Create task · Create campaign angle · Create blog idea | `lead_tasks` / campaign brief / blog idea |
| Create IG/FB/TikTok post idea · Summarize lead | `generated_assets` / lead summary panel |
| Improve previous email · Handle objections · Meeting-request reply | revised draft → preview |

### H4 · Lead Response Assistant (§8)

**Flow:** `no synced reply → paste` → `store on lead` → `analyze intent/sentiment/objection/stage/urgency` → `draft reply` → `preview/edit/save/send/schedule` → `optional status + task`

Categories: Interested · Pricing request · More info · Objection · Meeting request · Not interested · Wrong person · Unsubscribe (→ writes `suppressions`). Stored in `lead_responses`; drafts land in `generated_assets`.

### H5 · AI Performance & Trust Fixes (§19)

- **Background jobs** for research/publish (no blocking UI); **cached research** + **small context packets** via `ai_context_builder`.
- **Structured JSON outputs** (Gemini `responseSchema`) replacing brittle `===FIELD===` parsing; kills the "NEURAL TIMEOUT saved as content" bug.
- **Source tracking + confidence + missing-context warnings** on every output; **retry/failure** handling with credit refund.
- **Server-side credit metering + real token logging** in `gemini-proxy`; **no fabricated metrics** anywhere.

---

## I. Integration Plan

### I1 · Connected Inbox — Gmail & Outlook (§9)

OAuth (Gmail API + Microsoft Graph), tokens in Vault via `integration_accounts` (never plaintext, never to browser). Capabilities: send, save draft, schedule, sync sent, sync replies, attach replies to lead, detect lead replies → trigger Response Assistant, respect suppression + optional validation warning, track opens/clicks/replies where the provider allows. `inbox-sync-worker` runs on cron (Gmail `history.list` / Graph delta).

### I2 · Email Validation — Mails.so (§11)

Server-side `mails-validation-worker` only. Single, bulk, on-import, on-manual-create, pre-send, per-lead button, campaign summary. Store full record (§E). Gating: **unvalidated** = warn+allow · **valid** = allow · **risky** = strong warning + owner/admin override · **invalid** = block by default (admin override) · **unsub/bounce/complaint** = always block.

### I3 · Blog Publishing (§12)

Statuses Draft→In Review→Approved→Scheduled→Published→Failed→Needs Revision. Targets: WordPress (REST), Webflow (CMS API), Shopify blog, custom webhook, manual HTML/Markdown export — via `blog-publish-worker` + `publishing_jobs` retry. SEO fields, featured image (reuse Imagen), internal-link suggestions, team comments, approval, schedule.

### I4 · Social Publishing — IG / FB / TikTok (§13)

Generators (IG caption, FB post, TikTok caption + video script, Reel script, carousel copy, hashtags) → platform-specific preview → media upload → calendar → approval → `social-publish-worker` (Instagram Graph, Facebook Graph, TikTok Content Posting API) with failed-publish retry + connection status. **[MISSING]** today — build the publisher + connection cards; reuse existing caption generation.

---

## J. Team Workflow & Approval Plan (§15)

Make collaboration real: lead assignment + owner, persisted notes/tasks, @mentions, activity timeline, follow-up reminders, comments on generated assets, approval workflow with revision requests, a team dashboard + review queue. Approval is **required** before any email/campaign/blog/social send or publish (generalize the existing blog `pending_review` via `content_approvals`).

| Role | Leads/CRM | Create content | Approve | Send/Publish | Billing/Integrations/Admin |
|------|-----------|----------------|---------|--------------|----------------------------|
| **Owner** | full | yes | yes | yes | full |
| **Admin** | full | yes | yes | yes | integrations + admin; billing view |
| **Manager** | team's leads | yes | yes | yes (approved) | no |
| **Marketer** | assigned | yes (blog/social/email) | no | after approval | no |
| **Sales** | assigned | emails/replies | no | after approval | no |
| **Reviewer** | read | comment only | yes | no | no |
| **Viewer** | read | no | no | no | no |

Enforce in RLS + edge functions, not just UI. Reconcile the two existing team-role systems into this one matrix.

---

## K. Security & Compliance Fixes — do these first (§3)

> **Phase 0 blocks everything else.** These are exploitable or legal issues confirmed in-repo; ship them before any new module.

| Fix | Sev | Action |
|-----|-----|--------|
| Self-promotion to super-admin | **CRIT** | `profiles` UPDATE: add `WITH CHECK(auth.uid()=id)` + `REVOKE UPDATE(role,is_super_admin,plan,credits_*,status)` from authenticated |
| Forged admin/plan rows | **CRIT** | Remove `WITH CHECK(true)` INSERT on `profiles`/`subscriptions` |
| Team hijack | **CRIT** | Scope `team_members` INSERT/DELETE to team owner/admin |
| Audit-log exposure | **CRIT** | Scope `audit_logs` SELECT to own/team; INSERT service-role only; fix schema drift |
| Plaintext SMTP/API secrets | **HIGH** | Encrypt (Vault/pgsodium); stop returning to browser (`IntegrationHub.tsx:441`) |
| Missing unsubscribe | **CRIT** | Signed token + `unsubscribe-handler` + suppression write; real postal address required |
| Suppression not enforced | **HIGH** | Shared `suppression-checker` called by every send path |
| Fake analytics / scores / signals | **CRIT** | Delete all `Math.random()`/hardcoded intelligence; show real or honest empty |
| Credit enforcement client-side | **HIGH** | Re-check + deduct in `gemini-proxy`; paid seats via Stripe |
| Schema/edge fns not in git | **HIGH** | Commit live schema → `supabase/migrations/` + all edge fns |
| Account deletion / GDPR export | **HIGH** | Add self-serve delete + data export |

---

## L. Phased Roadmap (safe, incremental)

### PHASE 0 · Security, compliance, schema & fake-data cleanup — RISK: high value / low code-risk
- **Goals:** Platform is safe + honest before new features. All §K fixes.
- **Files:** SQL policies; `LeadManagement`/`LeadProfile`/`LeadIntelligence`/`ClientDashboard`/`AnalyticsPage` (strip mock); `gemini-proxy`; `IntegrationHub`
- **DB:** RLS fixes; commit live schema + edge fns; encrypt secrets; add `suppressions`
- **Backend:** `unsubscribe-handler`, `suppression-checker`; proxy credit re-check
- **Frontend:** Remove fabricated UI; add toast layer; empty states
- **Test:** RLS negative suite; no-random-in-render lint; unsubscribe→suppression E2E
- **Complexity:** Medium · **rollback:** policy revert; additive tables

### PHASE 1 · Business Profile / Brand Brain + context spine — RISK: med
- **Goals:** Canonical business brain + `ai-context-builder` spine + 5 knowledge-base scopes
- **DB:** `business_profiles`, `knowledge_bases`, `knowledge_documents`, `ai_context_packets`
- **Backend:** `ai-context-builder`, `business-profile-analyzer` (extend existing)
- **Frontend:** `BrandBrainPage` + confidence/preview; brand-brain gate before generation
- **Test:** context packet size/hash cache; confidence gating; migrate profiles blob
- **Complexity:** Med-High · additive

### PHASE 2 · Lead-Level AI Command Center + on-demand lead knowledge — RISK: med
- **Goals:** Action grid in lead profile; on-demand research only; real notes/tasks/activity/assignment
- **DB:** `lead_research_profiles`, `lead_notes`, `lead_tasks`, `lead_activities`, `generated_assets`
- **Backend:** `lead-research-worker` (async)
- **Frontend:** `LeadCommandCenter` tab; replace mock CRM surfaces with real
- **Test:** no auto-research on import; refund on fail; assignment persists
- **Complexity:** Med

### PHASE 3 · Connected Inbox — Gmail & Outlook — RISK: high (OAuth/PII)
- **Goals:** OAuth connect, send/draft/schedule, reply sync → lead, trigger Response Assistant
- **DB:** `integration_accounts`, `inbox_messages`, `lead_responses`
- **Backend:** `gmail-oauth-callback`, `outlook-oauth-callback`, `inbox-sync-worker`, `send-email-worker`
- **Frontend:** Connected Inbox page; Lead Response tab (§H4)
- **Test:** token in Vault only; reply→lead linkage; suppression honored on send
- **Complexity:** High

### PHASE 4 · Email validation (Mails.so) — RISK: low
- **Goals:** Optional validation with risk gating everywhere emails are used
- **DB:** `email_validations`
- **Backend:** `mails-validation-worker`
- **Frontend:** Validate button (lead), import/create hooks, pre-send warning, campaign summary
- **Test:** gating matrix (unval/valid/risky/invalid/blocked); bulk throughput
- **Complexity:** Low-Med

### PHASE 5 · Email Studio — RISK: med
- **Goals:** Unified writers; preview=send parity; approval + schedule + validation; sequences
- **DB:** `content_approvals`, `scheduled_content`
- **Backend:** reuse `send-email-worker`; `approval-notification-worker`
- **Frontend:** `EmailStudio` (refactor ContentGen/Studio); shared PreviewPane
- **Test:** preview == send-time personalization; approval blocks send
- **Complexity:** Med

### PHASE 6 · Blog Studio + external publishing — RISK: med
- **Goals:** SEO drafting, media, approval, schedule, WordPress/Webflow/Shopify/webhook publish
- **DB:** `scheduled_content`, `publishing_jobs`, blog SEO cols
- **Backend:** `blog-publish-worker`, `campaign-scheduler`
- **Frontend:** Extend `BlogDrafts`→Blog Studio; Content Calendar
- **Test:** status machine; publish retry/backoff; external id stored
- **Complexity:** Med

### PHASE 7 · Social Studio — Instagram / Facebook / TikTok — RISK: high (platform APIs)
- **Goals:** Generate + preview + schedule + publish across IG/FB/TikTok with retry
- **DB:** reuse `scheduled_content`/`publishing_jobs`/`integration_accounts`
- **Backend:** `social-publish-worker`
- **Frontend:** Extend `SocialScheduler`→Social Studio; platform previews; connection cards
- **Test:** media upload; per-platform limits; failed-publish retry; token refresh
- **Complexity:** High (app review per platform)

### PHASE 8 · Campaign Studio — RISK: med
- **Goals:** One brief → multi-channel assets → approval → schedule → track → AI next-actions
- **DB:** `marketing_campaigns`, `campaign_assets`
- **Backend:** `campaign-scheduler` (fan-out)
- **Frontend:** `CampaignStudio`; Review Queue integration
- **Test:** status machine; approval gates fan-out; per-channel schedule
- **Complexity:** Med

### PHASE 9 · Team collaboration & approvals — RISK: med
- **Goals:** Real roles matrix, comments, mentions, review queue, reminders, team dashboard
- **DB:** `team_comments`, `content_approvals` (generalized); role reconciliation
- **Backend:** `approval-notification-worker`; reminders
- **Frontend:** `ReviewQueue`, team dashboard, comment threads
- **Test:** role permission matrix (RLS + edge); mention notifications
- **Complexity:** Med

### PHASE 10 · Real analytics & reporting — RISK: low
- **Goals:** Real metrics only across email/validation/campaign/blog/social/lead/team/AI/credits
- **DB:** materialized views / rollups from real events
- **Backend:** refresh workers; fix delivered/bounce/reply math
- **Frontend:** `AnalyticsPage` real widgets + exports
- **Test:** numbers reconcile to raw events; no random; export works
- **Complexity:** Med

---

## M. Testing Checklist

**Security / tenancy (Phase 0)**
- Negative RLS: cross-tenant read/write blocked on every new table.
- Cannot self-set role/is_super_admin/plan/credits.
- Cannot INSERT self into another team; audit_logs not cross-tenant.
- Tokens never leave Vault / never in browser network.

**Compliance**
- Unsubscribe token → suppression; suppressed never re-mailed on any path.
- Postal address required before send; footer present.
- Validation gating matrix (unval/valid/risky/invalid/blocked).

**AI / knowledge**
- No lead research on import; only on explicit actions; refresh works.
- Every generation uses business brain + right KB; missing-context warning fires.
- Server-side credit deduct + real token log; refund on failure; no "NEURAL TIMEOUT".
- Structured JSON parses; source + confidence present.

**Channels & workflow**
- Preview == send/publish output for email/blog/social.
- Approval blocks send/publish until approved; reject/changes loop works.
- Publish retry/backoff; external id stored; failed status surfaced.
- Inbox reply → correct lead → Response Assistant triggered.
- Analytics reconcile to real events; no random values (snapshot test).

**[MED]** There's almost no automated coverage today — stand up the RLS negative suite and the suppression/preview-parity tests first (highest risk, lowest effort).

---

## N. Remaining Questions

1. **Provide the edge functions + live schema** (still out-of-repo) — Phase 0 depends on committing them; several enforcement questions (does `gemini-proxy` re-check credits? does the send worker exist?) can't be closed until then.
2. Email validation provider: confirm **Mails.so** vs alternative, and the plan/quota (affects bulk/import validation cost).
3. Social scope: are you posting as a **Business/Creator** account (required for IG/FB Graph publishing + TikTok Content Posting API)? App-review timelines will gate Phase 7.
4. Blog CMS priority order (WordPress first?) — build one publisher end-to-end before the rest.
5. Inbox depth: full two-way sync (read all mail) or reply-detection only? Affects Google/Microsoft OAuth scopes + verification burden.
6. Confirm the **single tenant key** (recommend `workspace_id`) and green-light the `leads.client_id` backfill.
7. Credit model for the new AI-heavy actions (research/validation/publish) — per-action costs + who can override risky sends.
8. Marketing reconciliation: OK to remove unbuilt claims now and re-add per phase?

---

*Scaliyo Growth-Platform build plan · grounded in the full 24-section code audit · incremental & feature-flagged · every phase additive with a clean rollback · items dependent on out-of-repo edge functions marked [edge].*
