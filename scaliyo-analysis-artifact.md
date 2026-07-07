# Scaliyo — Developer-Ready System Audit

> **Full-System Audit · Scaliyo (AuraEngine)**

A code-truth audit of the Scaliyo B2B growth-intelligence platform: what it actually does, where the code diverges from the marketing, the security & compliance holes, and a safe, prioritized path to fix them. Synthesized from a full read of the `AuraEngine/` frontend repo, all committed SQL, and every service module.

| | |
|---|---|
| **Stack** | React 19 · TS · Vite · Tailwind · Supabase · Stripe · Gemini |
| **Pages** | ~85 |
| **Service modules** | 60+ (`lib/`) |
| **Committed tables** | ~35 |
| **Tables queried** | ~90 |
| **Edge functions in repo** | 0 |

> ⚠️ **Read this first — two structural blind spots bound the entire audit.**
> **(1)** `supabase/functions/` is **empty** — the whole edge-function tier (`gemini-proxy`, `start-email-sequence-run`, `process-email-writing-queue`, `send-email`, `billing-checkout`, the Stripe webhook handler, tracking pixel/redirect) lives out-of-repo and is unverifiable here.
> **(2)** ~55 load-bearing tables + most RPCs have no `CREATE TABLE` in the repo and there is no `supabase/migrations/` history — a fresh `db reset` produces a broken app.
> Findings that hinge on that server code are marked **[edge/unverified]**. Closing the audit requires uploading `supabase/functions/` and the live schema dump.

**Severity legend:** **[CRIT]** exploitable / legal / data-integrity · **[HIGH]** revenue / trust / correctness · **[MED]** reliability / UX · **[LOW]** polish · **[GOOD]** done right

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Product Positioning Review](#2-product-positioning-review--marketing-vs-code)
3. [Current System Map](#3-current-system-map)
4. [Full Module Inventory](#4-full-module-inventory)
5. [Database & Data Flow Analysis](#5-database--data-flow-analysis)
6. [Lead Generation Audit](#6-lead-generation-audit)
7. [Lead Enrichment Audit](#7-lead-enrichment-audit)
8. [Outreach / Campaign Audit](#8-outreach--campaign-audit)
9. [CRM / Pipeline Audit](#9-crm--pipeline-audit)
10. [AI Features Audit](#10-ai-features-audit)
11. [Roles & Permissions Audit](#11-roles--permissions-audit)
12. [API Inventory](#12-api-inventory)
13. [Frontend / UI Audit](#13-frontend--ui-audit)
14. [Reports & Analytics Audit](#14-reports--analytics-audit)
15. [Billing / Credits Audit](#15-billing--credits-audit)
16. [Security & Compliance Audit](#16-security--compliance-audit)
17. [Performance & Scalability](#17-performance--scalability)
18. [Missing Features](#18-missing-features-impact--priority)
19. [Recommended Database Changes](#19-recommended-database-changes)
20. [Recommended Backend / API Changes](#20-recommended-backend--api-changes)
21. [Recommended Frontend Changes](#21-recommended-frontend-changes)
22. [Prioritized Roadmap](#22-prioritized-roadmap-safe-phased)
23. [Testing / QA Checklist](#23-testing--qa-checklist)
24. [Questions / Unknowns Found in the Codebase](#24-questions--unknowns-found-in-the-codebase)

---

## 1. Executive Summary

**What Scaliyo is, in code:** a single-workspace **AI content + email-outreach tool with a lead-list CRM veneer**, built on Supabase with a Google-Gemini content engine (proxied server-side) and a Stripe-billed credit system. It genuinely does: CSV/XLSX lead import (with dedupe), one real AI enrichment (website research), AI generation of email sequences / blog / social / images, an email send-and-track pipeline, a Trello-style Team Hub, an AI "Goals" planner, and admin/support consoles.

**What it is *not*, despite the marketing:** it is **not a lead-generation or data platform**. It cannot find, search, or enrich a single prospect from any database — the only data provider (Apollo) was retired. And a large amount of the "intelligence" a user sees is **fabricated**: lead scores are `Math.random()`, "buying signals" are `if(score>=70)` branches, engagement timelines are invented, and several dashboards/billing screens render random or hardcoded data as if it were real.

### The 10 things to fix first

| # | Finding | Sev | Evidence |
|---|---------|-----|----------|
| 1 | Any user can self-promote to super-admin — `profiles` UPDATE has no `WITH CHECK`/column grants | **CRIT** | `supabase-schema.sql:31`; `admin-rls.sql:66` |
| 2 | `WITH CHECK(true)` INSERT on `profiles` & `subscriptions` → forge admin profiles / free plans | **CRIT** | `supabase-fix-auth.sql:84` |
| 3 | `audit_logs` readable & forgeable by **every** authenticated user (cross-tenant) | **CRIT** | `supabase-schema.sql:181` |
| 4 | Any user can join/leave **any** team → read its leads (open `team_members` INSERT) | **CRIT** | `supabase-migration-v3.sql:234` |
| 5 | No functional unsubscribe (dead `href="#"`) + no guaranteed postal address → CAN-SPAM/GDPR | **CRIT** | `lib/gemini.ts:104,121` |
| 6 | Fabricated data shown as real: scores, buying signals, engagement, dashboard analytics, invoices | **CRIT** | `LeadManagement.tsx:628`; `LeadIntelligence.tsx:63` |
| 7 | Marketing sells absent products: AI prospecting/200M contacts, verified data, LinkedIn/SMS, warm-up | **CRIT** | `FeatureClusters.tsx:21`; `PricingPage.tsx:27` |
| 8 | Revenue leaks: free extra seats; AI credit enforcement client-side only; unmetered image/automation AI | **HIGH** | `seatLimits.ts:107`; `credits.ts:134`; `imageGen.ts` |
| 9 | Schema & edge functions not in source control — DB unreproducible; audit writes silently fail | **HIGH** | no `supabase/migrations/`; empty `functions/` |
| 10 | Secrets (SMTP pass / API keys) stored & round-tripped to browser in plaintext | **HIGH** | `email-providers.sql:11`; `IntegrationHub.tsx:441` |

**Bottom line:** the engineering foundations that *are* present are often well-built (server-side AI proxy, RLS-scoped read-only support impersonation, a real webhook/API key design, credit pre-checks). But the product is sold as something materially larger than it is, several core "intelligence" surfaces are simulated, and a handful of in-repo RLS policies collapse the entire tenant/role model. The priorities are, in order: **close the RLS holes, stop shipping fabricated data, reconcile the marketing, then commit the schema/edge functions so the rest becomes verifiable.**

---

## 2. Product Positioning Review — marketing vs. code

Publicly Scaliyo is an "AI-powered B2B growth intelligence platform for lead generation, enrichment, prospecting, and outreach." The code supports the **outreach** and **AI content** claims; it does **not** support the lead-generation, prospecting, enrichment-data, or multi-channel claims.

| Marketed capability | Reality in code | Verdict |
|---------------------|-----------------|---------|
| "AI Prospect Discovery — 200M+ contacts", "finds leads" | No contact DB, no search, no provider. Apollo retired (`App.tsx:320`). Leads only enter via CSV/XLSX/manual. | **FALSE** |
| "Verified emails, phones, tech stack, firmographics" | Zero verification; no firmographic/tech source; `employeeCount` left blank (`gemini.ts:906`). | **FALSE** |
| "50+ real-time buying signals", "predictive lead scoring 94%" | No signals tracked. "Signals" are `if(score>=X)` literals; score is `Math.random()*40+60`. | **FABRICATED** |
| "Multi-channel: Email, LinkedIn, SMS, calls" + per-plan LinkedIn quotas | Email only. LinkedIn = quota-counting scaffolding with no sender. No SMS/calls. | **FALSE** |
| "Automated warm-up + ramp schedule" (Growth/Scale) | A boolean `warmup_enabled` toggle + a counter. No ramp logic in repo **[edge/unverified]**. | **UNBACKED** |
| "14-day free trial" | `trialApi.ts` is a bare `signUp` wrapper — no trial state/expiry. | **FALSE** |
| "AI Deep Research" prospect briefs | Real — Gemini website crawl w/ Google-Search grounding (`gemini.ts:588`). | **TRUE** |
| "AI email/sequence/content generation" | Real — 15+ Gemini features, server-proxied. | **TRUE** |
| Email sending, open/click tracking, sequences | Real client pipeline (send worker itself is **[edge/unverified]**). | **TRUE** |

> ⚠️ **Legal exposure:** Selling per-plan "LinkedIn actions/day", "verified emails/phones", and a "14-day trial" that don't exist is a false-advertising / consumer-protection risk, compounded by charging for it. Either build these or remove the claims from `PricingPage.tsx`, `FeatureClusters.tsx`, `Features.tsx`, `Comparison.tsx`, and `credits.ts` plan features. (Note: the marketing site was recently rewritten toward honest "early-access" framing — extend that pass to the pricing/feature claims.)

---

## 3. Current System Map

**Public (marketing)**
- Landing, Features, Pricing, About, Contact, Blog/BlogPost (`pages/marketing/*`) under `MarketingLayout`
- Signup (`TrialSignupPage`) → `/auth` (login/OAuth/reset/confirm)

**Portal (CLIENT)**
- MissionControl + ClientDashboard (two home screens), QuickLaunch, LeadManagement/LeadProfile/LeadIntelligence, ContentGen/ContentStudio, Automation, Goals, TeamHub, SocialScheduler, ImageGen
- Analytics, Billing/Invoices, Integrations, ApiKeys/ApiDocs, Webhooks, Branding, SenderAccounts, Profile, ModelTraining ("AI Settings"), AICommandCenter (copilot)
- Separate mobile tree `/portal/mobile/*` (7 screens)

**Admin (ADMIN)**
- Admin Console (Overview/Users/Config/Health/Security/DataOps/Audit/Reports), legacy AdminDashboard, PricingManagement, prompt-lab "DNA" registry, AIOperations, AuditLogs

**Support (SUPER-ADMIN)**
- `/admin/support` — RLS-scoped, time-boxed (2h), read-only customer investigation + diagnostics

**AI & background (mostly out-of-repo)**
- `gemini-proxy` (all LLM/Imagen), the email send worker + AI-writer queue, Stripe checkout/webhooks, tracking pixel/redirect, goal-executor/replanner, webhook dispatcher — all referenced by the client, none present in the repo.

---

## 4. Full Module Inventory

| Module | Role | Real / Mock | Key files | Headline issue |
|--------|------|-------------|-----------|----------------|
| Lead Import | CLIENT | Real | `leadImporter.ts`, `ImportLeadsWizard.tsx` | Dedupe key lives in out-of-repo RPC |
| Lead List / CRM | CLIENT | Real+mock | `LeadManagement`, `LeadProfile` | Scores/notes/tasks/activity/assignment are mock |
| Lead Enrichment | CLIENT | Real (1 feature) | `gemini.ts:588`, `LeadProfile.tsx:424` | Only AI website research; no verified data |
| Content / Sequence Gen | CLIENT | Real | `ContentGen`, `ContentStudio`, `gemini.ts` | Preview vars ≠ send-time vars |
| QuickLaunch | CLIENT | Real | `QuickLaunchPage.tsx` | Only path enforcing suppression/dedup |
| Email Send/Track | CLIENT | Real (worker edge) | `emailTracking.ts`, `emailWriterQueue.ts` | Rotation engine dead; per-inbox cap bypassed |
| Sender Accounts | CLIENT | Real | `senderAccounts.ts`, `IntegrationHub` | Plaintext creds round-trip to browser |
| Automation | CLIENT | Actions real, triggers not | `automationEngine.ts`, `AutomationPage` | No event/cron trigger; manual runs only |
| Goals (AI planner) | CLIENT | Real | `goals.ts`, `GoalsPage.tsx` | Executor/replanner are edge fns |
| Team Hub | CLIENT | Real | `team-hub/**`, `teamHubApi.ts` | All tables out-of-repo |
| Social Scheduler | CLIENT | Real+publisher edge | `SocialScheduler.tsx`, `-social-scheduler.sql` | Publisher out-of-repo |
| Analytics | CLIENT | Real+mock | `AnalyticsPage`, `analyticsQueries.ts` | Random/naive metrics; export stubbed |
| Billing/Credits | CLIENT | Real Stripe redirect + mock UI | `stripe.ts`, `credits.ts`, `BillingPage` | 2 credit stores; fake card/invoices |
| Integrations Hub | CLIENT | Thin real core, mock shell | `IntegrationHub.tsx`, `integrations.ts` | No sync engine; mock panels |
| Public API / Keys | API | Real design, edge runtime | `apiKeys.ts`, `ApiDocsPage` | Key verify/scope enforcement out-of-repo |
| Webhooks | CLIENT | Real CRUD, edge dispatch | `webhooks.ts`, `WebhooksPage` | Test-event can't target one endpoint |
| Admin Console | ADMIN | Real + mock panels | `admin/console/*` | Client-gated; some hardcoded "healthy" |
| Support Console | SUPER | Real (well-gated) | `support/SupportConsole.tsx` | PII reads unlogged; tab files dead |
| Prompt "DNA" lab | ADMIN | Orphaned | `admin/prompt-lab/*`, `dna.ts` | Never wired into live generation |
| Voice agent | CLIENT | Real | `voice/VoiceAgent.tsx` | ElevenLabs; nav-only tools |

---

## 5. Database & Data Flow Analysis

**[HIGH] The DB is not reproducible from source control.**
~35 tables are defined in root `supabase-*.sql`; the app queries **~90**. ~55 load-bearing tables (`workspaces`, `workspace_members`, `sender_accounts`, all `teamhub_*`, `integrations`, `webhook_endpoints`, `invoices`, `user_prompts`, `api_keys`, `jobs`, `import_batches`, `workspace_ai_usage`…) and most RPCs have no definition in the repo. No `supabase/migrations/` history.
**Fix:** dump the live schema into `supabase/migrations/`; commit RPCs and edge functions. Until then the committed `leads`/`plans` DDL is stale vs `types.ts`.

### Tenancy — four different keys, mid-migration

| Isolation column | Tables |
|------------------|--------|
| `client_id`→profiles | `leads` only |
| `owner_id`→auth.users | `email_messages, email_provider_configs, scheduled_emails, email_sequence_runs, lead_stage_colors, lead_color_overrides` |
| `user_id`→auth.users | `ai_usage_logs, strategy_*, workflows, workflow_executions, apollo_*, social_*, image_gen_*` |
| `workspace_id` | `outbound_usage` (FK→**profiles.id**, i.e. = user!), `email_sequence_runs` (no FK), + uncommitted `sender_accounts/workspace_*/teamhub_*` |

**[MED]** `workspace_id` means two different things across tables. Reconcile to one tenant model.

### Key RLS & schema defects (in-repo)

- **[CRIT]** `audit_logs` SELECT/INSERT = `auth.uid() IS NOT NULL` → any user reads/forges all tenants' logs (`supabase-schema.sql:181`).
- **[CRIT]** `team_members` INSERT/DELETE = `auth.uid() IS NOT NULL` → join any team, read its leads (`-v3.sql:234`).
- **[CRIT]** `profiles`/`subscriptions` INSERT `WITH CHECK(true)` (`-fix-auth.sql:84`).
- **[HIGH]** Secrets plaintext: `email_provider_configs.api_key/smtp_pass/webhook_key` (`-email-providers.sql:11`), `integrations.credentials`.
- **[MED]** **Audit schema drift**: loggers write `entity_type/entity_id/resource_type` + object `details`, but committed `audit_logs` only has `details TEXT` → structured writes error & are swallowed (silent no-op) against committed schema.
- **[MED]** No soft delete anywhere; aggressive `ON DELETE CASCADE`; no retention/TTL on unbounded `email_events/ai_usage_logs/tracking_events/audit_logs`.
- **[LOW]** Duplicate columns: `profiles."createdAt"`+`created_at`; `subscriptions.plan`+`plan_name`, `current_period_end`+`expires_at`. Plan stored in 3 places (drift-prone).
- **[LOW]** Missing indexes on `leads(status)`, `leads(primary_email)`, `email_messages(status/to_email)`. `CREATE INDEX CONCURRENTLY` inside a transactional script will error.

### Data flow (tables at each hop)

**Visitor→Signup** `auth.users`+trigger→`profiles`(500cr,'Starter')+`subscriptions`. **→Workspace** `create_my_workspace` RPC→`workspaces`+`workspace_members` *[uncommitted]*. **→Leads** import→`leads`(`client_id`). **→Enrichment** AI writes `leads.knowledgeBase`; usage→`ai_usage_logs`/`workspace_ai_usage`. **→Sequence** `email_sequence_runs`→`email_sequence_run_items`→`scheduled_emails`. **→Send** edge worker→`email_messages` via `email_provider_configs`/`sender_accounts`. **→Track** `email_links`→`email_events` (open/click/bounce) via `record_email_event`. **→Reports** `email_analytics_summary` MV (pg_cron). **Broken hops in committed schema:** Workspace, Send, Track, most of the team layer.

---

## 6. Lead Generation Audit

**[CRIT] There is no lead generation — only import.**
No prospecting, company search, decision-maker discovery, or contact database. Apollo retired (`App.tsx:320`), advanced tables dropped (`-drop-apollo-adv.sql`), no data-provider integration exists. Every lead is user-supplied via CSV/XLSX (`ImportLeadsWizard.tsx`) or manual create (`LeadManagement.tsx:616`).

**[CRIT] Lead scores are random; downstream "intelligence" is fabricated.**
Manual create: `score = Math.floor(Math.random()*40)+60` (`LeadManagement.tsx:628`); only other change is a manual +5 button. No AI/rules/behavioral scoring. From that random seed the UI derives fake buying signals ("Decision-maker identified" = `if score>=70`, `LeadProfile.tsx:600`), a fabricated 60-day score history with invented events (`LeadIntelligence.tsx:63`), and mock deal size / conversion probability.
**Fix:** either build a real scorer (behavioral signals from `email_events` + firmographic weights, or a Gemini scorer — the `lead_scoring` credit cost already exists but is never consumed) or remove the fabricated surfaces. Do not ship random data labeled as intelligence.

**Exists & honest:** CSV/XLSX import with regex auto-mapping + `merge/overwrite/skip` dedupe (`leadImporter.ts:16`), plan contact caps (`checkContactsCapacity`), 500-row chunking; post-import list filters (status/score/activity/size/tag/engagement). **Missing:** ICP builder (the only one, `apollo_adv_saved_filters`, was dropped), paste import, bulk generation, AI lead suggestions.

---

## 7. Lead Enrichment Audit

**One real feature:** AI website research (`generateLeadResearch`, `gemini.ts:588`) — user saves a lead with a URL → Gemini crawls the site with **Google-Search + URL-context grounding** → structured brief (identity, industry, offerings, pricing, socials, talking points, outreach angle, risk factors) into `knowledgeBase.aiResearchBrief`; freshness via `aiResearchedAt`; 2 credits charged before the call. This is the strongest AI feature.

**[HIGH] Everything else marketed as "enrichment" is missing:**
- No email verification (MX/SMTP), no phone validation.
- No firmographic provider (revenue/funding/headcount) — `employeeCount` left blank (`gemini.ts:906`).
- No tech-stack detection, no intent/buying-signal feed, no LinkedIn/social scraping (URLs are user-entered).
- No per-field source/confidence stored (the model returns confidence, `parseLeadResearchResponse` discards it); no retry-refund (credits kept on failure); dedupe/merge only at import.

**Fix (data quality):** integrate a verification provider (e.g. an email-verify + firmographic API) via an edge function; store per-field `{value, source, confidence, fetched_at}`; refund credits on hard failure; add a re-enrich freshness policy.

---

## 8. Outreach / Campaign Audit

**[CRIT] No functional unsubscribe + no guaranteed postal address.**
The CAN-SPAM footer's opt-out is a dead `<a href="#">Unsubscribe</a>` (`gemini.ts:121`); no unsubscribe page/token/handler in repo. Physical address only included if `businessProfile.address` happens to be set (`gemini.ts:104`). Direct CAN-SPAM / GDPR / CASL violation.
**Fix:** per-recipient signed unsubscribe token + landing page + suppression write (edge fn); require a validated postal address before any send.

**[HIGH] Deliverability protections are dead or bypassed code.**
`lib/sendingEngine.ts` (inbox rotation, per-inbox caps, 3–12s send jitter) is **never imported**. The live path is `emailTracking.ts`, which sends in a tight loop with no pacing; the per-inbox daily cap is skipped because the live path passes a non-UUID inbox id (`usageTracker.ts:138`). Warm-up is a boolean toggle, not a ramp. No bounce-rate/complaint circuit breaker; no reply tracking (response rate hardcoded `0`).

**[HIGH] Suppression enforced on only one send path.**
Dedup + suppression (bounced/failed/unsubscribed/complained) runs only in `QuickLaunchPage.tsx:381`. The primary `ContentGen`/`ContentStudio` paths can re-mail bounced/unsubscribed contacts. No dedicated suppression table (computed on the fly); no global blocklist.
**Fix:** extract the QuickLaunch suppression into a shared `lib/suppression.ts` and call it from every send path; add a persistent `suppressions` table populated by unsubscribe/bounce/complaint events.

**Other:** **[MED]** "A/B test" copies the body verbatim + appends " - Alternative" (no split routing/metrics, `ContentGen.tsx:720`). **[MED]** Preview personalization uses a different map than send-time → preview shows values the send won't (`ContentGen.tsx:295`); templates use tags (`{{pain_point}}`) not in the resolver → blank at send. No team-approval workflow for outreach (only for blog drafts). **[GOOD]** unresolved `{{tags}}` are stripped before send; bot/Apple-privacy filtering on opens.

---

## 9. CRM / Pipeline Audit

**[CRIT] Notes, tasks, activity timeline, and assignment are mock/ephemeral:**
- Activity tab is **fabricated** — `deriveEngagementTimeline` invents events from score (`LeadProfile.tsx:118`).
- Notes tab is local state that **never persists** (`LeadProfile.tsx:546`); tasks are hardcoded mock (`:189`). No notes/tasks/activity tables for leads.
- Assignment is cosmetic: `TEAM_MEMBERS` hardcoded fake names (`LeadManagement.tsx:131`); bulk "Assign" is a `setInterval` progress simulation with no DB write.

**[HIGH]** Single Lead object, 5 hardcoded stages (`types.ts:160`), no Deal/Opportunity entity, no amount/close-date, no won/lost reasons, no drag-and-drop on the leads kanban (linear next-stage only), no weighted forecast (per-lead "deal size" is AI mock).

**[MED]** Automation actions are real (email/status/tag/Slack/HubSpot/Salesforce) but **triggers never auto-fire** — no cron/event listener; manual runs only; `wait` node doesn't wait (`automationEngine.ts:288`).

**[GOOD]** Real: CSV import+dedupe, status persistence + audit, the AI **Goals** planner, and **Team Hub** (drag-and-drop kanban with template-gated lead-status sync) — the one genuine configurable-pipeline surface. A professional CRM here needs: opportunities, configurable pipelines, persistent notes/tasks/reminders, real activity logging, rep ownership + round-robin, and forecasting.

---

## 10. AI Features Audit

**Provider:** Google Gemini, fully server-proxied (`gemini-proxy`). Text = `gemini-2.5-flash` (deliberate GA-stable pin, `aiConfig.ts`), image = `imagen-4.0`. Prompts resolve user-override → system-default → inline fallback (`promptResolver.ts`, 28 registered prompts). 15+ features: per-lead content, email sequences, content-by-category, automated personalization, lead research, business-profile analysis, dashboard insights, command-center copilot (4 personas), content suggestions, pipeline strategy, blog, social captions, guest-post pitch, workflow optimization, image gen.

**[HIGH] Credit metering has holes; tokens never recorded; no universal log.**
Enforcement is correct (`consumeCredits` checks `remaining<cost` **before** the call) but lives in the page layer, not in `gemini.ts`. Unmetered (free AI) paths: **image generation** (the `image_generation:3` cost is display-only), **automation-time personalization** (`automationEngine.ts:383`), the email-writer queue, and likely `pipeline_strategy`/`workflow_optimization`. `consumeCredits` always passes `p_tokens:0` → token usage discarded. Only 2 pages write `ai_usage_logs` → admin AI dashboards under-report.

**[MED] The "DNA" prompt-lab is orphaned; some outputs are fabricated/brittle.**
`buildPromptFromDNA` has zero call sites — tone sliders, guardrails, and output-schema enforcement never reach production; the live editor is `ModelTraining.tsx`. Content "suggestions" show invented impact metrics ("+12% opens"); a failed generation can save the literal `"NEURAL TIMEOUT"` string as content (`gemini.ts:222`); brittle `===FIELD===` delimiter parsing instead of JSON schema.
**Fix:** centralize metering + logging in the proxy (record real tokens); wire or delete the DNA system; use Gemini `responseSchema` (structured JSON) for sequences/strategy/research; drop fabricated metrics; align test vs prod model.

**[GOOD]** server-side key, GA-stable pin, grounded research/analysis with strong anti-hallucination prompts, graceful template fallback in automated personalization. **Suggested new AI:** real lead scoring, inbound reply/intent classification + auto-draft replies, grounded blog (add search tool), output validation everywhere.

---

## 11. Roles & Permissions Audit

**Roles:** platform `UserRole = ADMIN | CLIENT | GUEST` (GUEST unused) + boolean `is_super_admin`; two parallel team-role systems (legacy `TeamRole` and Flow `owner/admin/member/viewer`). Authorization is **client-side render gating** (`App.tsx`, `permissions.ts`) over RLS; the code even documents that RLS is the real boundary.

**[CRIT] Self privilege-escalation to super-admin.**
`profiles` UPDATE = `USING (auth.uid()=id)` with **no `WITH CHECK` and no column grants** (`supabase-schema.sql:31`; admin variant `admin-rls.sql:66`). Any user: `update({role:'ADMIN', is_super_admin:true, credits_total:9_999_999})` on their own row → passes the CHECK constraint → full cross-tenant admin + support powers.
**Fix:** add `WITH CHECK (auth.uid()=id)` and `REVOKE UPDATE (role,is_super_admin,plan,credits_total,credits_used,status)` from `authenticated`; move those mutations to SECURITY DEFINER RPCs.

- **[CRIT]** `WITH CHECK(true)` INSERT on `profiles`/`subscriptions` (forge admin rows / free plans); open `team_members` INSERT/DELETE (team hijack).
- **[HIGH]** RLS for the uncommitted `workspace_*/sender_accounts/webhook_endpoints/flows/team_*` tables can't be verified — the entire front end assumes membership-scoped RLS exists on them; must be confirmed server-side.
- **[MED]** Role hydrated from `sessionStorage` before revalidation (`useAuthMachine.ts:48`) — cosmetic alone, amplifies the above pre-RLS.
- **[GOOD]** Support impersonation is read-only, RLS-scoped, 2h time-boxed, dual-audited.

---

## 12. API Inventory

Two surfaces: (a) a real **public REST API** design (runtime out-of-repo), (b) the internal **edge functions / RPCs** the client calls. All auth is Supabase JWT (bearer).

### Public REST API (`ApiDocsPage.tsx`, `apiKeys.ts`)

| Endpoint | Methods | Auth | Scope | Status |
|----------|---------|------|-------|--------|
| `v1-leads` | GET/POST/PATCH | API key (`scal_`, SHA-256 stored) | `leads.read/write` | design real, runtime *[edge]* |
| `v1-sequences` | GET/POST/PATCH | API key | `campaigns.*` | *[edge]* |
| `v1-campaigns` | GET | API key | `campaigns.read` | *[edge]* |
| `v1-analytics` | GET | API key | `analytics.read` | *[edge]* |

Idempotency keys, cursor pagination, workspace-scoping, 60/min rate limit are documented. Keys minted client-side, hash-only persisted, scoped, revocable — a genuine design. **[HIGH]** verify hashing/`verify_api_key`/scope + rate limiter in the (absent) edge fns.

### Internal edge functions / RPCs the client depends on (all *[edge/unverified]*)

| Function / RPC | Purpose | Side effects | Missing-check risk |
|----------------|---------|--------------|--------------------|
| `gemini-proxy` | All LLM/Imagen calls | Gemini spend | Must re-check credits or unlimited free AI |
| `start-email-sequence-run` / `process-email-writing-queue` | AI-writer queue → scheduled_emails | AI spend, sends | Unmetered; suppression/limit re-check unknown |
| `send-email` | SMTP/API transmit | Real email | Unsubscribe honoring, per-inbox cap |
| `billing-checkout` + Stripe webhook | Checkout, fulfillment | Plan/credit grants | Whole fulfillment path unverifiable |
| `increment_ai_usage` / `increment_usage` / `consume_credits` | Usage/credit counters | Balance mutation | Atomic clamp vs TOCTOU race |
| `create_api_key`/`revoke_api_key`, `queue_webhook_event`, `admin_*`, `create_my_workspace`, `import_leads_batch` | Keys, webhooks, admin, workspace, import | Various | Authorization + dedupe logic all server-side |

---

## 13. Frontend / UI Audit

- **[HIGH]** **No toast/notification layer.** Many catches log to console with zero user feedback (`OnboardingPage.tsx:119`, `LeadManagement.tsx:534`, mobile fetches); optimistic status rollbacks revert silently — actions appear to succeed when they failed.
- **[HIGH]** `Math.random()` panels rendered as real analytics on `ClientDashboard` (velocity, engagement, revenue forecast, content quality). Trust/integrity risk.
- **[MED]** Validation is native HTML5 only (no field-level messages, no URL/phone format checks). Disabled buttons never explain why (Onboarding, QuickLaunch, ContentGen).
- **[MED]** Mobile: a separate `/portal/mobile/*` tree exists but the redirect fires only on bare `/portal`; ~25 desktop screens have no mobile version and the mobile FAB routes into desktop layouts. `MobileLeadDetail` is read-only.
- **[MED]** Two overlapping home dashboards (`/portal` MissionControl vs `/portal/dashboard` ClientDashboard); no global 404/offline handling.
- **[GOOD]** Empty states are well-covered and distinguish "no data" vs "no match"; skeleton loaders are consistent on React-Query pages; a root `ErrorBoundary` exists.

---

## 14. Reports & Analytics Audit

**[HIGH] Multiple wrong or fabricated metrics presented as real:**
- **delivered == sent, bounce rate = 0** on the materialized-view path (`analyticsQueries.ts:139`); only the raw fallback computes real values → two paths disagree.
- **Per-campaign open/click = one global average** copied to every campaign (`:298`).
- **Reply rate** advertised but never tracked; **cost-per-lead** listed but never computed; **team performance** uses hardcoded fake names; "AI accuracy" actually shows token counts; benchmarks are hardcoded constants.
- Admin vs client email funnels use different definitions (total vs unique; separate `sent`/`delivered` statuses) → surfaces don't reconcile.

**[MED]** Export: only CSV is real; Excel/PPTX/PDF fall through to `alert("…server-side in production")`; "schedule report" only writes an audit row; share link is a throwaway string. **[GOOD]** `financeAggregator.ts` (lead-invoice KPIs) and `lib/insights.ts` (deterministic stats) are correct. **Missing reports:** real deliverability (bounce/spam/reply from webhooks), CAC/CPL/ROI, per-user performance, working multi-format + scheduled export.

---

## 15. Billing / Credits Audit

Plans (single source `config/creditLimits.ts`): Free/Starter/Growth/Scale — 200/2k/10k/40k credits, $0/$29/$79/$199, contacts 5/1k/10k/50k, seats 1/1/3/10. Marketing PricingPage derives from the same constants **[GOOD]**.

**[HIGH] Revenue leaks & two disconnected credit stores:**
- **Free extra seats**: `purchaseExtraSeat` writes `subscriptions.extra_seats` + audit only — no Stripe charge (`seatLimits.ts:107`).
- **Displayed ≠ enforced credits**: BillingPage shows `profiles.credits_total−credits_used`; enforcement uses `workspace_ai_usage` — never reconciled.
- **Enforcement client-side only** (from repo): if `gemini-proxy` doesn't re-check credits, direct calls = unlimited free AI. TOCTOU race in deduct. Usage-limit allow-checks (`usageTracker.ts`) are dead code (test-only callers).

- **[HIGH]** "14-day trial" has no implementation (`trialApi.ts`); no dunning/failed-payment/`past_due` handling.
- **[MED]** Faked payment card (`•••• 4242`) + client-fabricated "Paid" invoices (`BillingPage.tsx:144,639`). Admin-editable DB plan prices can desync from hardcoded enforced limits.
- **[GOOD]** Credit pre-check is before the call; add-on packs route through real Stripe; seats don't multiply volume.

*Note:* `invoices.ts`/`InvoicesPage` is a **separate product** (users invoicing their own leads), not Scaliyo's subscription billing — well-structured.

---

## 16. Security & Compliance Audit

**Done right [GOOD]:**
- Gemini/provider keys server-side only; no secret is `VITE_`-prefixed; anon/publishable keys only.
- Bearer-JWT auth → CSRF largely N/A.
- Support impersonation read-only, RLS-scoped, time-boxed, dual-audited.
- Webhook HMAC signing + API-key hashing designs are sound.

**Critical / High:**
- **[CRIT]** `profiles` self-privesc; `WITH CHECK(true)` inserts; open `team_members`; cross-tenant `audit_logs`.
- **[CRIT]** Dead unsubscribe + missing postal address (CAN-SPAM/GDPR).
- **[HIGH]** Plaintext secrets at rest + round-tripped to browser (`IntegrationHub.tsx:441`).
- **[HIGH]** No account-deletion / GDPR export path despite UI claiming it.

**Other:**
- **[MED]** One `dangerouslySetInnerHTML` (CTA builder) with partial escaping (quotes/scheme not handled) — self-XSS today but the string also goes into outgoing email; no sanitizer library anywhere.
- **[MED]** `cancelScheduledEmail` updates by `id` with no `owner_id` filter (RLS-dependent); HubSpot API called directly from the browser with the user's key (`LeadManagement.tsx:583`).
- **[MED]** Support-agent PII reads (leads/subscription/email history) are **unlogged**; audit writers swallow errors; full prod SQL schema shipped in bundle & rendered on error (`AuthPage.tsx:10-221`).
- **[LOW]** No client rate limiting (must live in edge); `searchUsers` PostgREST filter interpolation (super-admin only).

---

## 17. Performance & Scalability

- **[MED]** Missing indexes on high-cardinality filters: `leads(status)`, `leads(primary_email)` (import dedupe), `email_messages(status/to_email)` — full scans at volume.
- **[MED]** Unbounded growth tables with no retention: `email_events`, `ai_usage_logs`, `tracking_events`, `audit_logs`.
- **[MED]** Batch send is a serial loop with no pacing (`emailTracking.ts:462`); bulk import chunks at 500 (good) but runs client-driven.
- **[LOW]** `email_analytics_summary` MV depends on `pg_cron`; stale silently if disabled. `CREATE INDEX CONCURRENTLY` in a transactional script errors.
- **[GOOD]** React-Query caching + route code-splitting + partial indexes for queue polling; `lib/api.ts` wrapper has 10s timeout + 3 retries on 5xx.
- *[edge/unverified]* Queue drain, cron cadence, send throughput, and API rate limiting all live in the absent edge/cron layer.

---

## 18. Missing Features (impact · priority)

| Feature | Why it matters | Priority | Risk to add |
|---------|----------------|----------|-------------|
| Functional unsubscribe + suppression table | Legal (CAN-SPAM/GDPR); protects sending reputation | **P0** | Low |
| Real lead scoring (behavioral + firmographic/AI) | Core value prop; today it's random | **P1** | Med |
| Persistent notes / tasks / activity log | Table-stakes CRM; currently mock | **P1** | Low |
| Real rep ownership + assignment | Team selling; currently cosmetic | **P1** | Low |
| Email verification + firmographic enrichment | Matches "verified data" claim | **P1** | Med (3rd-party) |
| Event-driven automation triggers (cron/listener) | Automation is manual-only today | **P1** | Med |
| Deal/Opportunity object + pipeline value/forecast | Real CRM + honest revenue reporting | **P2** | Med |
| Account deletion / GDPR export | Legal; claimed in UI | **P1** | Low |
| Toast/notification layer | Silent failures erode trust | **P2** | Low |
| Reply/inbound tracking | "Reply rate" is advertised but 0 | **P2** | Med (IMAP) |
| Working multi-format + scheduled report export | Enterprise expectation; stubbed | **P3** | Low |
| ICP builder (with a real data source) | Would make "prospecting" true | **P3** | High (needs provider) |

---

## 19. Recommended Database Changes

### Fix (security) — highest priority
- `ALTER POLICY` `profiles` UPDATE add `WITH CHECK (auth.uid()=id)`; `REVOKE UPDATE(role,is_super_admin,plan,credits_total,credits_used,status)` from `authenticated`.
- Drop/replace `WITH CHECK(true)` INSERT on `profiles`/`subscriptions` (trigger is SECURITY DEFINER — not needed).
- Scope `team_members` INSERT/DELETE to team owner/admin; scope `audit_logs` SELECT to own/team rows + make INSERT service-role/definer only.
- Encrypt `email_provider_configs` secrets + `integrations.credentials` (pgsodium/Vault), stop returning them to the client.

### Add (structure)
- New tables: `suppressions`, `lead_notes`, `lead_tasks`, `lead_activities`, `lead_assignments`(or `leads.owner_user_id`), `opportunities`, `email_replies`.
- New columns: `subscriptions.stripe_customer_id/stripe_subscription_id/cancel_at/trial_ends_at/extra_seats`; `leads.owner_user_id`; per-field enrichment provenance JSON.
- Indexes: `leads(status)`, `leads(primary_email)`, `email_messages(status)`, `email_messages(to_email)`.
- Retention/TTL jobs on `email_events/ai_usage_logs/tracking_events/audit_logs`.

### Reconcile / migrate
- **Commit the live schema** into `supabase/migrations/` (this unblocks everything else). Pick one tenant key; migrate `leads.client_id`→`workspace_id` consistently.
- Deduplicate `profiles."createdAt"`/`created_at` and `subscriptions` plan/period pairs; single source of truth for plan (drop `profiles.plan` or make it a view).
- Migration notes: all RLS/column-grant changes are backward-compatible reads; the tenant-key migration needs a backfill + dual-read window.

---

## 20. Recommended Backend / API Changes

| Area | Change | Enforce |
|------|--------|---------|
| `gemini-proxy` | Re-check + deduct credits server-side; record real tokens; universal AI log. Never trust the client's pre-check. | credits, per-op cost |
| `send-email` worker | Honor suppression + unsubscribe tokens; enforce per-inbox daily caps & pacing/rotation (port `sendingEngine.ts` logic here); bounce/complaint circuit breaker. | caps, opt-out, warm-up |
| Seats | Route `purchaseExtraSeat` through Stripe (subscription item update); no client-side `extra_seats` write. | payment |
| Stripe webhook | Implement `checkout.session.completed`, `invoice.paid/payment_failed`, `subscription.updated/deleted`, dunning + `past_due` transitions. | fulfillment |
| Trial | Real trial state (`trial_ends_at`, `trialing` status) + expiry enforcement, or drop the claim. | entitlement |
| Automation | Add a scheduler/event listener (pg_cron or edge cron) so triggers actually fire; make `wait` nodes durable. | — |
| API keys / webhooks | Confirm hash verify, scope checks, rate limiter, HMAC signing, backoff scheduler exist in edge fns. | authz, limits |

**Testing per change:** credit-bypass attempt (direct proxy call w/o pre-check), suppression honored on every send path, seat purchase creates a Stripe line item, webhook idempotency, trial expiry blocks AI, cross-tenant RLS negative tests.

---

## 21. Recommended Frontend Changes

| Page/Component | Change | Benefit |
|----------------|--------|---------|
| ClientDashboard, AnalyticsPage, LeadProfile, LeadIntelligence | Remove all `Math.random()`/hardcoded "analytics/signals/scores"; show real values or an honest empty state. | Data integrity / trust |
| LeadProfile | Persist notes/tasks to new tables; render real `audit_logs`/`email_events` as the activity timeline. | Real CRM |
| LeadManagement | Replace hardcoded `TEAM_MEMBERS` + fake bulk-assign with real workspace members + persisted assignment. | Team selling |
| Global | Add a toast layer; surface every caught error; make optimistic rollbacks visible. | No silent failures |
| BillingPage | Show real Stripe payment method + real invoices (from webhook data); reconcile displayed credits to the enforced store. | Correct billing |
| ContentGen/ContentStudio | Call the shared suppression module before send; unify preview vs send-time personalization maps. | Compliance / fidelity |
| PricingPage/Features | Remove claims for absent features (LinkedIn/SMS/verified data/trial) or gate behind "coming soon". | Legal |
| CTAButtonBuilderModal | Escape quotes + validate `http(s)` scheme before injecting/emailing. | XSS hardening |
| Mobile shell | Route deep mobile links to mobile screens or gracefully degrade; add missing states. | Mobile UX |

**Validation to add:** field-level messages, URL/phone format, "why disabled" tooltips. **Test:** error-path toasts, rollback visibility, suppression on send, no random values in snapshot tests.

---

## 22. Prioritized Roadmap (safe, phased)

| Phase | Focus | Key tasks | Cx | Rollback |
|-------|-------|-----------|----|----------|
| **1** | Docs + reproducibility + critical bugs | Commit live schema + edge fns to git; fix audit-log schema drift; document tenant model. No behavior change. | Low | Trivial (additive) |
| **2** | Security / permission cleanup | RLS fixes (profiles WITH CHECK + column grants, subscriptions/profiles inserts, team_members, audit_logs); encrypt secrets; account-deletion/GDPR export. | Med | Policy revert; test with negative RLS suite first |
| **3** | Compliance + data integrity | Functional unsubscribe + suppression table wired into every send path; postal-address requirement; **remove fabricated data** (scores/signals/analytics/invoices). | Med | Feature-flag the new send guard |
| **4** | Deliverability | Server-side per-inbox caps + pacing/rotation + warm-up ramp + bounce/complaint breaker; align pricing claims. | Med-High | Shadow-run new sender before cutover |
| **5** | CRM depth | Persistent notes/tasks/activity, real assignment/ownership, event-driven automation triggers; optional Deal object. | Med | New tables additive; UI behind flag |
| **6** | AI workflow | Centralize metering+logging in proxy (real tokens); wire or delete DNA; structured JSON outputs; real lead scoring; reply classification. | Med | Proxy change is server-side, reversible |
| **7** | Billing / credits / limits | Reconcile the two credit stores; real trial; dunning/webhook fulfillment; paid seats via Stripe; server-enforced usage limits. | Med-High | Run new metering in report-only mode first |
| **8** | Reports + admin | Fix delivered/bounce/per-campaign/reply/CPL math; real per-user reports; working exports; replace hardcoded admin "health/security". | Med | Additive; verify vs raw tables |
| **9** | Performance / scale | Indexes, retention/TTL jobs, server-side batch send, split CONCURRENTLY migrations, verify cron. | Low-Med | Indexes concurrently; TTL reversible |

---

## 23. Testing / QA Checklist

**Security / multi-tenant**
- Negative RLS: user A cannot read/update B's leads, profiles, audit_logs, scheduled_emails, subscriptions.
- Privesc attempt: `update profiles set role/is_super_admin` is rejected.
- Team hijack: cannot INSERT self into another team.
- Credit bypass: direct `gemini-proxy` call without pre-check is blocked/deducted.
- Support session: reads outside an active 2h session are denied; PII reads are logged.

**Functional**
- Import: dedupe merge/overwrite/skip; contact-cap enforced; chunked large files.
- Send: suppression honored on ContentGen/ContentStudio/QuickLaunch; unsubscribe token works; per-inbox cap; no double-send.
- Sequence: delays → real dates; edited steps persist; add/remove/reorder.
- AI: every feature deducts credits + logs tokens; failure refunds; no "NEURAL TIMEOUT" saved.
- Billing: trial expiry blocks AI; seat purchase charges Stripe; webhook idempotency; failed-payment → past_due.

**Reports / data integrity**
- No `Math.random()` reaches a rendered metric (snapshot/lint test).
- delivered/bounce/open/reply computed from events; per-campaign rates differ per campaign.
- Client vs admin funnels reconcile.

**UI / edge cases**
- Every caught error surfaces a toast; optimistic rollbacks visible.
- Empty vs no-match states; disabled-button reasons.
- Mobile deep links; offline/404; a11y on dialogs (focus trap/escape).

**[MED]** There is essentially no automated test coverage today (only a few `lib/__tests__` files). Start with the security negative-tests and the send-suppression tests — highest risk, lowest effort.

---

## 24. Questions / Unknowns Found in the Codebase

To close the audit, these must be answered (mostly by uploading the missing server code):

1. **Upload `supabase/functions/`** — especially `gemini-proxy` (does it re-check & deduct credits?), `send-email` / the queue processors (do they honor suppression, per-inbox caps, warm-up?), and the **Stripe webhook handler** (fulfillment/dunning?).
2. **Upload the live schema dump / missing migrations** — the ~55 uncommitted tables + RPCs (`increment_ai_usage`, `import_leads_batch`, `create_my_workspace`, `admin_*`, `consume_credits`). Do the workspace/team/flow tables carry membership-scoped RLS?
3. Was `audit_logs` reshaped out-of-repo (to add `entity_type`/JSON `details`)? If not, structured audit logging is silently failing.
4. Does the real `leads` dedupe key = `primary_email`, and does `import_leads_batch` merge safely?
5. Is warm-up actually implemented anywhere, or is the pricing claim unbacked?
6. Where do Stripe-purchased add-on credits land — `profiles.credits_total` or `workspace_ai_usage`? (Two stores; UI reads the other one.)
7. Is there any server-side rate limiting on the public API and edge functions?
8. Product decision: build the lead-generation/prospecting layer, or reposition the marketing to match an "import + AI outreach" product?

---

*Scaliyo full-system audit · compiled from a complete read of the `AuraEngine/` frontend, committed SQL, and 60+ service modules · line references approximate to the reviewed revision · findings dependent on out-of-repo edge functions are marked [edge/unverified].*
