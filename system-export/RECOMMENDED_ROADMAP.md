# Scaliyo — Recommended Roadmap

> Ordered for risk-first delivery. Complexity: **S**mall · **M**edium · **L**arge · **XL**. Each item ties to findings in `BUGS_AND_TECHNICAL_DEBT.md` / `GAP_ANALYSIS.md`.

---

## Phase 0 — Security & Data Integrity (do first, blocks GA)

### 0.0 Fix admin-RPC authorization + lock down `subscriptions` (BUG-037/038) ⭐ FIRST
- **Objective:** stop the unauthenticated privilege-escalation exploit — authorize every `admin_*` RPC on `auth.uid()` (drop `p_admin_id` as an authz source), `REVOKE EXECUTE … FROM anon`; drop the public `subscriptions` INSERT and add a WITH CHECK pinning entitlement columns to service-role.
- **User/Business value:** prevents anyone granting themselves unlimited credits / changing plans / flipping flags — direct fraud prevention.
- **Dependencies:** none. **Risks:** ensure the admin UI still passes (it already sends the caller's own id).
- **Acceptance:** a non-admin (and `anon`) cannot execute any `admin_*` RPC or self-modify `subscriptions`; admins still can via the UI (tested).
- **Order:** 0 (before everything). **Complexity:** S–M.

### 0.1 Close the cross-tenant profile PII leak (BUG-001)
- **Objective:** stop any authenticated user reading all `profiles`.
- **User value:** privacy. **Business value:** avoid GDPR/CCPA breach & reputational damage.
- **Dependencies:** none. **Risks:** ensure legitimate co-member/admin reads still work.
- **Acceptance:** a non-member cannot select another user's `profiles` row; co-members/admins can as intended (tested).
- **Order:** 1. **Complexity:** S.

### 0.2 Harden billing trust boundaries (BUG-002/003/013)
- **Objective:** fail-closed Stripe webhook; server-validate price/plan/credit amounts.
- **User/Business value:** prevents fraud & revenue loss.
- **Dependencies:** confirm `STRIPE_WEBHOOK_SECRET` set. **Risks:** breaking checkout if plan mapping incomplete.
- **Acceptance:** forged webhook rejected; tampered price/credits rejected; legitimate purchase grants correct plan/credits.
- **Order:** 2. **Complexity:** S–M.

### 0.3 Real account deletion + PII retention/erasure (BUG-004/014)
- **Objective:** implement true deletion + retention lifecycle + DSAR export.
- **Value:** compliance; user trust. **Dependencies:** 0.1. **Risks:** cascading deletes; backups.
- **Acceptance:** deletion removes/anonymizes all PII across leads/inbound/recordings/profile; export produces the user's data.
- **Order:** 5. **Complexity:** L.

### 0.4 Authenticate Twilio webhooks + encrypt OAuth tokens (BUG-010/011)
- **Value:** prevents spoofed writes + token theft. **Dependencies:** none. **Risks:** signature mismatch blocking legit calls.
- **Acceptance:** unsigned Twilio POST rejected; social tokens encrypted at rest.
- **Order:** 3. **Complexity:** S–M.

### 0.5 Rotate exposed secrets + tighten team RLS (BUG-015/012)
- **Value:** revoke exposed access; stop self-join. **Dependencies:** user action for rotation. **Risks:** downtime during rotation.
- **Acceptance:** old Mails.so key/`sbp_` tokens invalid; team join requires a valid invite server-side.
- **Order:** 4. **Complexity:** S.

### 0.6 Reconcile the tenancy model (BUG-023, foundational)
- **Objective:** pick one canonical tenant boundary (recommend **business_id**); make `workspace_id` derivation consistent; finish the leads cutover.
- **Value:** correct isolation; unblocks multi-business. **Dependencies:** 0.1. **Risks:** large migration; regression on `workspace_id==user.id` assumptions.
- **Acceptance:** all writes set the tenant key consistently; enabling multi-business filters data correctly; no NOT-NULL breakages.
- **Order:** 6. **Complexity:** XL.

---

## Phase 1 — Core CRM & Lead Intelligence

### 1.1 Persist notes/tasks/activities (BUG-005) — ✅ DONE (Phase 4.A–4.C)
- **Objective:** write to `lead_notes` + a tasks table; stop data loss.
- **User value:** trustworthy CRM. **Business value:** table-stakes retention.
- **Dependencies:** none. **Acceptance:** notes/tasks survive reload; appear in timeline. **Order:** 1. **Complexity:** M.
- ✅ Notes→`lead_notes`, tasks→`tasks`, activity log→`lead_activities`; unified `LeadProfile` timeline; deals→`deals` (4.E). All RLS-verified.

### 1.2 Surface the real lead score & intelligence (BUG-018) — ✅ DONE (Phase 4.D + 1.2)
- **Objective:** enable `lead_intelligence` by default; show the signal-based score in table/kanban.
- **Value:** the product's best AI becomes visible. **Dependencies:** validation data present. **Acceptance:** table shows real score; research/next-action visible. **Order:** 2. **Complexity:** S.
- ✅ Manual "Recalculate Score" calls the canonical `recalcLeadScore`; `lead_intelligence` is now ON by default so the Score/Research/Next-action panels show; a bulk "Score" action (`recalcLeadScoresBulk`) recomputes every lead in the business so the table/kanban show real scores. **Follow-on niceties:** reason on hover in the table; auto-score on import.

### 1.3 Deals / opportunities pipeline (GAP: convert) — 🟡 PARTIAL (Phase 4.E)
- **Objective:** add a `deals` table (value, stage, owner, close date) + forecast.
- **Value:** real CRM/convert. **Dependencies:** 1.1. **Risks:** scope creep. **Acceptance:** create/advance/close deals; pipeline value report. **Order:** 4. **Complexity:** L.
- ✅ `deals` table + `lib/deals.ts` + per-lead Deals tab (create/advance stage/win/lose/delete; open + weighted totals); `tasks.deal_id` FK wired. **Still TODO:** a standalone cross-lead pipeline board + org-wide forecast report.

### 1.4 Lead discovery integration (GAP: discover)
- **Objective:** wire a real provider (Apollo/PDL) into the `jobs`/`apollo_*` infra.
- **Value:** top-of-funnel. **Dependencies:** provider account, credits. **Risks:** data cost/compliance. **Acceptance:** search returns real prospects; import into leads. **Order:** 3. **Complexity:** L.

### 1.5 Kanban drag-and-drop + server search (BUG-028)
- **Value:** UX. **Dependencies:** none. **Acceptance:** DnD stage change; server-side lead search. **Order:** 5. **Complexity:** M.

---

## Phase 2 — AI Personalisation & Knowledge Architecture

### 2.1 Unify the business brain + business-scope memory (BUG-016)
- **Objective:** make `business_profiles` the single source; add `business_id` to `workspace_memory`/`lead_memory`/`campaign_memory`; every generator uses the active business.
- **Value:** stops cross-business content bleed. **Dependencies:** 0.6. **Risks:** backfill correctness. **Acceptance:** Business B generation never contains Business A facts; memory filtered by business. **Order:** 1. **Complexity:** L.

### 2.2 Fix business-profile analysis (BUG-017)
- **Objective:** align prompt to scrape-then-extract; expand `fetch-page` (sitemap/link discovery + headless render for SPAs); add `responseSchema`.
- **Value:** accurate auto-profiles. **Dependencies:** none. **Acceptance:** measured extraction completeness/accuracy up on a golden set; no `null` on common sites. **Order:** 2. **Complexity:** L.

### 2.3 Retrieval + reply-aware memory + structured validation (AI recommendations)
- **Objective:** embed business docs/winning emails/reply transcripts; retrieve per generation with source attribution + confidence; feed reply content into memory; zod-validate structured outputs.
- **Value:** grounded, learning personalization. **Dependencies:** 2.1. **Acceptance:** generations cite sources; replies influence later drafts; malformed outputs rejected/repaired. **Order:** 3. **Complexity:** XL.

### 2.4 Centralize edge model config + close credit-ceiling bypasses (BUG-019/024)
- **Value:** cost control + resilience. **Dependencies:** none. **Acceptance:** one model source for edge fns; all AI paths metered; model healthcheck. **Order:** 4. **Complexity:** M.

---

## Phase 3 — Email & Campaign Execution

### 3.1 Resolve the dual send-path (BUG-006/020)
- **Objective:** make `process-sequence-sends` the sole sender; remove finalize/scheduled-emails tail (or add its cron if kept).
- **Value:** eliminates double-send risk. **Dependencies:** none. **Acceptance:** one send path; no duplicate deliveries under load test. **Order:** 1. **Complexity:** M.

### 3.2 Fix/replace Gmail + add Outlook (BUG-007, GAP)
- **Objective:** complete Gmail OAuth (callback + Gmail-API send) or route to SMTP; add Microsoft Graph OAuth (or document SMTP workaround).
- **Value:** the two biggest mailbox providers work. **Dependencies:** app configs. **Acceptance:** connect + send verified for Gmail & Outlook. **Order:** 2. **Complexity:** M–L.

### 3.3 Email templates UI + attribution hardening (BUG-027, GAP)
- **Value:** reusable templates; reliable A/B data. **Dependencies:** none. **Acceptance:** template CRUD in campaigns; all sends stamp `sequence_id`/variant. **Order:** 3. **Complexity:** M.

---

## Phase 4 — Social Content & Publishing

### 4.1 Make social publishing real (BUG-008)
- **Objective:** configure + app-review Meta/LinkedIn apps; add a "demo vs connected" state; expire OAuth `state`.
- **Value:** social channel actually posts. **Dependencies:** platform app review (lead time). **Risks:** review rejection. **Acceptance:** a post publishes to FB/IG/LinkedIn with a real `remote_post_id`. **Order:** 1. **Complexity:** M (code) + external review.

### 4.2 TikTok + external calendar sync (GAP)
- **Value:** channel breadth + scheduling into user calendars. **Dependencies:** 4.1 patterns. **Acceptance:** TikTok connect+publish; Google/Outlook calendar sync for meetings/posts. **Order:** 2. **Complexity:** L.

### 4.3 Imagen history + media polish (BUG-032)
- **Value:** reusable creative. **Acceptance:** generation gallery persists. **Order:** 3. **Complexity:** S.

---

## Phase 5 — VOIP & AI Call Assistance

### 5.1 Activate & secure VOIP (BUG-010/022)
- **Objective:** run `setup-twilio.sh`; server-side credit gate; signed webhooks; indexed reverse-lookup RPC (BUG-035).
- **Value:** calling goes live safely. **Dependencies:** Phase 0.4. **Acceptance:** outbound/inbound/voicemail/recording work; credits enforced server-side. **Order:** 1. **Complexity:** M.

### 5.2 AI call assistance (GAP: AI-assisted calls)
- **Objective:** transcription (Twilio `<Transcription>` or record→Whisper) + LLM call summary into `lead_call_logs`; pre-call AI script from lead context.
- **Value:** the "AI-assisted calls" promise. **Dependencies:** 5.1, 2.x context. **Risks:** consent/recording law. **Acceptance:** each call yields a stored transcript + summary + suggested next step. **Order:** 2. **Complexity:** L.

---

## Phase 6 — Analytics, Collaboration & Enterprise Readiness

### 6.1 Unify & fix team collaboration (BUG-009/026)
- **Objective:** one team model; real invite-send + email + server-side accept; validated role changes.
- **Value:** multi-seat teams. **Dependencies:** 0.6. **Acceptance:** invite→email→accept→collaborate works end-to-end. **Order:** 1. **Complexity:** L.

### 6.2 Real RBAC + entitlements enforcement (GAP)
- **Objective:** functional roles (or explicitly drop them); wire `workspace_entitlements` into enforcement; reconcile plan config drift (BUG-021).
- **Value:** enterprise seat/permission control + correct monetization. **Dependencies:** 6.1. **Acceptance:** roles restrict capabilities server-side; plan limits derive from one source. **Order:** 2. **Complexity:** L.

### 6.3 Analytics: salesperson & deal reporting + retention (GAP)
- **Objective:** per-rep attribution/leaderboard; deal/revenue reporting; retention/health metrics.
- **Value:** the "convert & retain" analytics story. **Dependencies:** 1.3 deals. **Acceptance:** rep performance + pipeline value + retention dashboards. **Order:** 3. **Complexity:** L.

### 6.4 Consolidation & polish
- **Objective:** merge duplicate pages, fix terminology, remove dead code (`image-gen`, unused tables), a11y pass, remove dev artifacts (BUG-025/029/030/031/034/036).
- **Value:** clarity, maintainability. **Order:** 4. **Complexity:** M.

---

## Suggested global sequencing
**Phase 0 (all)** → **1.1, 1.2** (quick trust wins) → **3.1, 3.2** (email reliability) → **2.1, 2.2** (AI correctness) → **4.1** (social) → **5.1** (VOIP live) → **1.3/1.4** (CRM/discovery) → **2.3** (retrieval) → **5.2** (call AI) → **6.x** (enterprise). Ship Phase 0 before any GA/marketing push.
