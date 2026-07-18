# Scaliyo — Bugs & Technical Debt Register

> Priority: **P0** security/data-loss/blocking · **P1** critical workflow · **P2** important usability/operational · **P3** improvement. Complexity: S/M/L/XL. All findings evidence-based (read-only).

---

## P0 — Security / data loss / system-blocking

### BUG-037 — Admin RPCs callable by anyone (unauthenticated privilege escalation) ⭐ most severe — ✅ FIXED
> **Remediated (migration `20260817100000_fix_admin_rpc_authz.sql`):** all 8 `admin_*` RPCs now authorize on `auth.uid()` (not `p_admin_id`), attribute audit to `auth.uid()`, the feature-flag guard is unconditional, and EXECUTE is REVOKED from PUBLIC/anon. Verified end-to-end: non-admin → `Unauthorized`; anon → `42501 permission denied`. Original finding below for reference.

- **Module:** Admin / RLS / Billing. **Description:** every `admin_*` `SECURITY DEFINER` RPC authorizes on a **caller-supplied `p_admin_id`** (not `auth.uid()`), and `EXECUTE` is granted to `anon` + `authenticated`. Admin UUIDs are publicly readable (profiles `USING(true)` + anon grant on `role`). So anyone can look up an admin id and call `admin_grant_credits(p_workspace_id:=<self>, p_amount:=999999, p_admin_id:=<admin id>)` — or change any plan, override entitlements, flip global feature flags.
- **Business impact:** unlimited free credits, plan tampering, feature-flag control — direct financial fraud + platform compromise. **User impact:** any actor can escalate.
- **Cause:** authz uses an untrusted parameter; over-broad EXECUTE grants; public admin-id enumeration. **Files:** `admin_*` RPCs (migration `20260730100000` + originals), `pg_proc.proacl`; callers `pages/admin/UserManagement.tsx:100`, `AdminOpsCenter.tsx:1572,1723`, `CommandCenter/AdminCommandCenterPage.tsx:764,824,941`.
- **Fix:** authorize on `auth.uid()`; drop `p_admin_id` as an authz source; `REVOKE EXECUTE … FROM anon` (gate behind `is_admin()`). **Complexity:** S–M. **Dependencies:** none. **Do this first.**

### BUG-038 — `subscriptions` table self-writable (entitlement escalation) — ✅ FIXED (migration 20260817110000)
- **Module:** Billing / RLS. **Description:** `INSERT` policy is `public, with_check=true`; `UPDATE` has no WITH CHECK → a user can set their own `plan`/`credits_total`/`status`. Client reads these for gating → self-grant bypasses entitlement checks.
- **Impact:** free plan/credits. **Files:** subscriptions RLS; `lib/workspaceSnapshot.ts:51`, `lib/seatLimits.ts`.
- **Fix:** drop public INSERT; WITH CHECK pinning entitlement columns to service-role. **Complexity:** S.

### BUG-001 — Cross-tenant profile PII read — ✅ FIXED (migration 20260817110000)
- **Module:** Auth / RLS. **Description:** `profiles` retains a legacy `SELECT USING (true)` policy for `authenticated`; the PII lockdown only fixed `anon`. Any logged-in user can read every user's email, `businessProfile`, `stripe_customer_id`.
- **Business impact:** GDPR/CCPA breach, competitive data exposure. **User impact:** all users' PII readable by any user.
- **Cause:** legacy policy never dropped; permissive policies OR together. **Files:** `migrations/20260218000000_core_schema.sql:112`, `20260512220000_profiles_pii_anon_lockdown.sql`.
- **Fix:** drop `USING(true)`; add own/co-member/admin SELECT policy. **Complexity:** S. **Dependencies:** none.

### BUG-002 — Stripe webhook fails open — ✅ FIXED (fail-closed + constant-time + timestamp; requires STRIPE_WEBHOOK_SECRET set)
- **Module:** Billing. **Description:** `verifyStripeSignature` returns `true` when `STRIPE_WEBHOOK_SECRET` is empty; forged events could grant subscriptions/credits. Also non-constant-time compare, no timestamp tolerance (replay).
- **Impact:** financial fraud / free entitlements. **Cause:** backward-compat fallback. **Files:** `supabase/functions/billing-webhook/index.ts:20,51,328`.
- **Fix:** fail-closed when secret missing; constant-time compare; timestamp check; confirm secret set in prod. **Complexity:** S. **Dependencies:** secret must be configured.

### BUG-003 — Client-supplied credit amounts — ✅ FIXED (server allow-list in billing-checkout)
- **Module:** Billing. **Description:** credit-package `credits` + `price_cents` taken verbatim from client and granted via webhook metadata; a modified client can buy huge credits for 1¢.
- **Impact:** revenue loss / abuse. **Cause:** no server-side allow-list. **Files:** `billing-checkout/index.ts:116-148`, `billing-webhook/index.ts:125-172`.
- **Fix:** validate `{credits, price_cents}` against a server package table. **Complexity:** S. **Dependencies:** none.

### BUG-004 — Account deletion is fake (no erasure) — ✅ FIXED (purge_user_data + delete-account); scheduled PII retention still TODO
- **Module:** Profile / Privacy. **Description:** "Delete account" waits 2s and signs out; deletes no data. No erasure path exists.
- **Impact:** GDPR/CCPA right-to-erasure not met; misleads users. **Cause:** unimplemented. **Files:** `ProfilePage.tsx:378-383`.
- **Fix:** real deletion + PII purge (leads, inbound_emails, call recordings, profile). **Complexity:** M. **Dependencies:** retention policy (BUG-014).

---

## P1 — Critical business workflow

### BUG-005 — Lead notes / tasks / activity not persisted (silent data loss)
- **Module:** Leads/CRM. **Description:** notes, tasks, and the LeadManagement activity log live only in local React state; typed data is lost on reload. `lead_notes` table exists but is never read/written.
- **Impact:** users lose CRM work; erodes trust. **Cause:** handlers only `setState`. **Files:** `LeadProfile.tsx:553-567`, `LeadManagement.tsx:1187-1195`.
- **Fix:** persist to `lead_notes` (+ a tasks table). **Complexity:** M. **Dependencies:** none.
- ✅ **FIXED (Phase 4.A/4.B):** notes now persist to `lead_notes` (`lib/leadNotes.ts`) and tasks to the new canonical `tasks` table (migration `20260818150000`, `lib/tasks.ts`) — both wired into `LeadProfile` with load-on-mount + optimistic add/toggle/delete. RLS verified live (owner CRUD; spoofed `created_by` blocked; cross-tenant read = 0). Both survive reloads. **Remaining:** LeadManagement activity log persistence + unified activity timeline (Phase 4.C).

### BUG-006 — Latent double-send in email pipeline
- **Module:** Email send. **Description:** `process-email-writing-queue` calls `finalize_email_sequence_run` (inserts `scheduled_emails`, triggers `process-scheduled-emails`) while `process-sequence-sends` independently sends the same `written` items. Dormant today, but if finalize succeeds concurrently, recipients get two emails.
- **Impact:** duplicate outreach, spam complaints, deliverability harm. **Cause:** two send paths never reconciled after architecture change. **Files:** `process-email-writing-queue/index.ts:285-303`, `migrations/20260302163816_email_writer_queue.sql:171-232`.
- **Fix:** remove the finalize+scheduled-emails tail; make `process-sequence-sends` the sole sender. **Complexity:** M. **Dependencies:** none.

### BUG-007 — Gmail OAuth is a broken stub
- **Module:** Senders. **Description:** `connect-gmail-oauth` returns a consent URL but there's **no callback** to exchange the code; even if completed, "gmail" sends via SMTP, not the Gmail API. Users click "Connect Gmail" and nothing usable results.
- **Impact:** advertised sender doesn't work. **Cause:** incomplete. **Files:** `connect-gmail-oauth/index.ts:59-83`; no callback fn; `send-email/index.ts:704-712`.
- **Fix:** add token-exchange callback + Gmail-API send, or remove the card and route to Custom SMTP. **Complexity:** M. **Dependencies:** Google app config.

### BUG-008 — Social publishing never works in prod (demo mode)
- **Module:** Social. **Description:** Meta/LinkedIn OAuth-start have a demo fallback inserting `demo_token`; with apps unconfigured, all `social_accounts` are demo and every publish fails ("Invalid OAuth access token"). Accounts look "connected."
- **Impact:** a core marketing feature is non-functional; misleading UI. **Cause:** OAuth apps not configured + no demo/real distinction. **Files:** `meta-oauth-start/index.ts:39-70`, `linkedin-oauth-start/index.ts:39-68`, `social-post-now/index.ts`.
- **Fix:** configure + app-review OAuth apps; add a "demo vs connected" UI state. **Complexity:** M (config) / S (UI). **Dependencies:** Meta/LinkedIn app review.

### BUG-009 — Team invites have no working path
- **Module:** Teams. **Description:** two disconnected team systems; no UI creates invites; Team Hub `acceptInvite` never called; accepting a Strategy-Hub invite grants no Team Hub access.
- **Impact:** collaboration/multi-seat unusable. **Cause:** two half-built systems. **Files:** `teamHubApi.ts:727,757`, `hooks/useTeamInvites.ts`, `GlobalInviteBanner.tsx`.
- **Fix:** unify to one team model; build invite-send + email + server-side accept. **Complexity:** L. **Dependencies:** tenancy reconciliation.

### BUG-010 — Twilio webhooks unauthenticated — ✅ FIXED (_shared/twilio.ts, fail-closed)
- **Module:** VOIP. **Description:** `twilio-incoming`, `twilio-call-status`, `twilio-voicemail` accept unsigned POSTs and write `lead_call_logs` via admin client — spoofable.
- **Impact:** forged call logs / data injection. **Cause:** missing signature check. **Files:** `supabase/functions/twilio-{incoming,call-status,voicemail}/index.ts`.
- **Fix:** verify `X-Twilio-Signature` with `TWILIO_AUTH_TOKEN`. **Complexity:** S. **Dependencies:** Twilio activation.

### BUG-011 — OAuth social tokens stored plaintext
- **Module:** Social / secrets. **Description:** tokens stored raw in `*_encrypted`-named columns (no encryption).
- **Impact:** token theft if DB/row exposed. **Cause:** encryption never implemented. **Files:** `meta-oauth-callback/index.ts:115,139,151`, `linkedin-oauth-callback/index.ts:122`.
- **Fix:** encrypt at rest (pgsodium/Vault). **Complexity:** M. **Dependencies:** none.

### BUG-012 — Team self-join via RLS — ✅ FIXED (accept_team_invite RPC + dropped INSERT policy)
- **Module:** Teams / RLS. **Description:** `team_members` INSERT policy checks only `user_id = auth.uid()`; accept doesn't verify invite ownership server-side → join arbitrary team.
- **Impact:** unauthorized team access. **Files:** `migrations/20260228500000...`, `useTeamInvites.ts:82-85`.
- **Fix:** `SECURITY DEFINER accept_team_invite` validating a pending invite; server-side seat check. **Complexity:** M.

### BUG-013 — Client-supplied Stripe price/plan — ✅ FIXED (plan resolved server-side from price id)
- **Module:** Billing. **Description:** `stripe_price_id`/`plan_name` from client, not validated to match; brief spoof window before webhook self-corrects.
- **Impact:** cheaper plan than paid tier. **Files:** `billing-checkout/index.ts:89,104-108`, `billing-webhook/index.ts:70`.
- **Fix:** resolve price→plan server-side; ignore client plan name. **Complexity:** S.

### BUG-014 — No PII retention/erasure policy
- **Module:** Privacy. **Description:** no lifecycle/purge for leads, inbound emails, call recordings; data export is mock.
- **Impact:** compliance exposure. **Fix:** define retention + purge jobs + real DSAR export. **Complexity:** L.

### BUG-015 — Exposed secrets pending rotation
- **Module:** Secrets. **Description:** Mails.so API key exposed (rotate); `sbp_` Supabase tokens exposed (revoke).
- **Impact:** unauthorized use. **Fix:** rotate/revoke (user action). **Complexity:** S. **Dependencies:** user.

---

## P1 (additional — from admin/security trace)

### BUG-039 — SendGrid/Mailchimp webhooks use wrong signature algorithm + fail open — ✅ FIXED (ECDSA + query-secret; enforcement pending secrets)
- **Module:** Webhooks. `webhooks-sendgrid` HMAC-SHA256 (SendGrid signs **ECDSA**) → real signatures never verify; both fail open → effectively unauthenticated writes to `email_events`/`email_dlq`. **Fix:** ECDSA for SendGrid; fail closed. **Complexity:** M.

### BUG-040 — `audit_logs` cross-tenant readable — ✅ FIXED (migration 20260817110000)
- **Module:** Audit / RLS. `SELECT USING (auth.uid() IS NOT NULL)` → any authenticated user reads all tenants' + admins' audit rows. **Fix:** drop that policy. **Complexity:** S.

### BUG-041 — Third-party secrets plaintext in client-readable tables — ✅ FIXED (column-scoped grants; browser exposure closed; at-rest encryption still TODO)
- **Module:** Secrets. `integrations.credentials` + `email_provider_configs.api_key/smtp_pass` are plaintext, owner-SELECTable, and read back into the browser. **Fix:** service-role-only secrets table; never return to client. **Complexity:** M.

### BUG-042 — Goal-executor wait-resume path likely broken — ✅ FIXED (service-role branch)
- **Module:** Automation. The resume cron sends a service-role token but `goal-executor/index.ts:47-53` demands a **user** token and 401s (no service-role branch, unlike `goal-replanner`). Paused/waiting goals likely never resume. **Fix:** add a service-role branch. **Complexity:** S.

## P2 — Important usability / operational

### BUG-043 — Notifications are not a real system
- **Module:** Notifications. No `notifications` table DDL in the migration chain (only a stray index); **zero** reads/writes/delivery anywhere; the header bell opens `DailyBriefing.tsx` (self-contained, contains a `Math.random()` mock, "mark read" just closes). **Fix:** build a real notifications table + generation + delivery, or remove the UI. **Complexity:** L.

### BUG-044 — v1-analytics cross-workspace opens/clicks leak — ✅ FIXED (email_messages inner-join scoping)
- **Module:** Public API. `opens_in_range`/`clicks_in_range` query `email_events` with no workspace filter → cross-tenant counts. **Fix:** scope via `email_messages`. **Complexity:** S.

### BUG-045 — Analytics fabricated ROI + stub exports
- **Module:** Analytics. `ClientDashboard.tsx:282-308` fabricates `contentPerformance` ROI; `engagementAnalytics`/`revenueForecast` null; PDF/PPTX export, share-links, scheduled reports, and alert rules are stubs (localStorage, never fire). **Fix:** wire or remove. **Complexity:** M.

### BUG-016 — AI reads user-level profile, not active business (cross-business bleed)
- **Module:** AI. Generators inject `profiles.businessProfile` (per-user) not `business_profiles` (per-business); memory tables lack `business_id`. In multi-business, Business B's emails carry Business A's positioning. **Files:** `lib/gemini.ts:36-66`, `lib/memory.ts:269-328`. **Fix:** unify business brain + add `business_id` to memory. **Complexity:** L.

### BUG-017 — Business-profile analysis inaccurate
- **Module:** AI. Prompt tells the model to crawl but grounding is disabled; only 7 fixed paths; SPA blind spot; no schema-constrained decode → thin/failed profiles. **Files:** `lib/gemini.ts:1017-1287`, `fetch-page/index.ts`. **Fix:** align prompt to scrape-then-extract, expand fetch (sitemap/headless), add `responseSchema`. **Complexity:** L.

### BUG-018 — Real lead intelligence hidden behind default-off flag
- **Module:** Leads. The honest scorer/research/next-action are gated by `lead_intelligence` (off), so users see a placeholder `+5` score. **Fix:** enable by default / surface real score. **Complexity:** S.

### BUG-019 — AI credit-ceiling bypass paths
- **Module:** AI/billing. `ai-chat-stream`, `process-email-writing-queue`, `preview-sequence-email`, goal-steps, `image-gen` bypass `enforce_ai_proxy_quota`. **Fix:** route through the ceiling or add metering. **Complexity:** M.

### BUG-020 — `process-scheduled-emails` has no cron
- **Module:** Email. Only invoked by the (dormant) finalize path → delayed `scheduled_emails` would never send. **Fix:** add cron or delete the path (see BUG-006). **Complexity:** S.

### BUG-021 — Plan/limit config drift
- **Module:** Billing. Plans defined in 5+ places; Scale email cap 40000 (UI) vs 50000 (enforced). **Fix:** single source (`plans` table). **Complexity:** M.

### BUG-022 — VOIP credit gate client-side only
- **Module:** VOIP. `twilio-voice`/`twilio-incoming` don't re-check credits; inbound not gated. **Fix:** server-side enforcement. **Complexity:** M.

### BUG-023 — Multi-business scoping inert by default
- **Module:** Tenancy. `multi_business` off → switcher doesn't filter data; leads cutover incomplete (legacy `client_id` path dominates). **Fix:** finish cutover, enable scoping. **Complexity:** L.

### BUG-024 — `gemini-3-flash-preview` uncentralized (deprecation risk)
- **Module:** AI. goal-executor/goal-replanner hardcode a preview model outside `aiConfig`; if it deprecates (like 2.0-flash did), goals fail silently. **Fix:** shared edge model config + GA model + healthcheck. **Complexity:** S.

### BUG-025 — `image-gen` dead stub referencing nonexistent table
- **Module:** AI. Returns an SVG placeholder, writes to `image_gen_generated_images` (doesn't exist), no credit gate, never invoked. **Fix:** delete (real path is `lib/imageGen.ts`). **Complexity:** S.

### BUG-026 — Team Hub role escalation + self-serve flags — ✅ FIXED (owner-only promote; owner/admin flag writes; admin-only business_profiles)
- **Module:** RLS. `teamhub_flow_members` UPDATE doesn't validate target role; `workspace_feature_flags` self-serve INSERT/UPDATE. **Fix:** validate target role; decide flag ownership. **Complexity:** M.

### BUG-027 — QuickLaunch/campaign attribution data-starved
- **Module:** Email analytics. Few `email_messages` carry `sequence_id`/`subject_variant` → A/B stats + autopause empty in practice. **Fix:** ensure attribution stamped on all sends; validate at volume. **Complexity:** S.

### BUG-028 — Kanban has no drag-and-drop
- **Module:** Leads UX. Board only has a "next stage" button. **Fix:** add DnD (dnd-kit already a dep). **Complexity:** M.

---

## P3 — Improvements / optimization
- **BUG-029** — Duplicate/overlapping pages (content trio; two team systems; two enrichment functions). Consolidate. (M)
- **BUG-030** — Confusing terminology (workspace/business/team; two "credits"; Apollo implies discovery). Rename/clarify. (S)
- **BUG-031** — Dev "Schema Required" screen can reach end-users on certain auth errors. Remove. (S)
- **BUG-032** — Imagen generation history not persisted (`fetchGenerationHistory` returns `[]`). Add gallery. (S)
- **BUG-033** — OAuth `state` rows (`social_post_events`) never expired/cleaned. Add TTL. (S)
- **BUG-034** — Accessibility gaps (icon-button labels, focus states, keyboard nav, reduced-motion). A11y pass. (M)
- **BUG-035** — Inbound VOIP reverse-lookup scans up to 2000 leads client-side per call. Server RPC + index. (M)
- **BUG-036** — Sequence writer on Gemini directly diverges from proxy routing; email templates table has no UI; `workspace_entitlements`/`usage_events`/`apollo_*` unused tables. Consolidate/remove. (M)

---

## Debt themes
1. **Half-finished features presented as complete** (notes, Gmail, social, team invites, account deletion).
2. **Three tenancy models + duplicated config** — the root of many bugs (workspace_id NOT NULL breakages recurred in import, admin RPCs, sequence runs).
3. **Security shortcuts at trust boundaries** (fail-open webhook, client-trusted billing, unsigned Twilio, plaintext tokens, profile PII policy).
4. **AI context not business-isolated** and analysis grounding mismatched.
5. **Two email send paths** and orphaned scheduled-email path.
