# Scaliyo — Security & Privacy Audit

> Safe code/configuration review only — no penetration testing, no destructive tests. Severity: **P0** (critical: data exposure / privilege escalation / financial), **P1** (high), **P2** (medium), **P3** (low). No secret values included.

## Executive posture
The RLS *foundation* is mature (109/111 tables RLS-enabled, guard functions, a self-escalation trigger, a fail-closed AI credit ceiling), **but that foundation is undermined by a working, unauthenticated privilege-escalation exploit and several other critical holes.** The most severe: the `admin_*` RPCs trust a **caller-supplied admin id** and are executable by `anon`, so anyone can grant themselves unlimited credits or change any plan (BUG-037/finding 2.0). Also: `subscriptions` is self-writable, `audit_logs` is cross-tenant readable, third-party secrets are stored plaintext in client-readable tables, inbound webhooks fail open (and SendGrid/Mailchimp use the wrong signature algorithm), a live cross-tenant profile-PII policy, client-trusted billing amounts, unauthenticated Twilio webhooks, and privacy gaps (fake deletion, no PII retention). Findings are grouped by area with severity.

> ⚠️ **Correction note:** an earlier assumption in this package that "admin RPCs are backend-enforced" is **wrong** — see finding 2.0. Admin protection is frontend-only in practice.

---

## 1. Authentication & session management
- ✅ Supabase Auth (GoTrue) JWT; email/password + Google/GitHub OAuth; branded email via `auth-send-email` (standardwebhooks-verified).
- **P2 — auth email hook skips verification when `SEND_EMAIL_HOOK_SECRET` is unset** (`auth-send-email/index.ts:9`). Ensure the secret is set in prod so unsigned callers can't drive the email hook.
- ✅ Auth state machine is resilient (profile-read retries, non-fatal workspace check). Session persisted in sessionStorage for fast refresh — standard.
- **P3** — "Remember me" is decorative; password strength meter client-only.

## 2. Authorization & RLS
- **P0 — 2.0 Admin RPCs are callable by anyone (privilege escalation / financial fraud). — ✅ FIXED (migration `20260817100000`): now authorize on `auth.uid()`, EXECUTE revoked from PUBLIC/anon; exploit re-tested and blocked.** Every `admin_*` `SECURITY DEFINER` RPC (`admin_grant_credits`, `admin_change_user_plan`, `admin_update_entitlements`, `admin_update_feature_flag`, `admin_clone_plan`, `admin_update_plan`, `admin_adjust_credits_used`, `admin_reset_monthly_usage`) authorizes on a **caller-supplied `p_admin_id`** rather than `auth.uid()`, **AND `EXECUTE` is granted to `anon` + `authenticated`** (verified via `pg_proc.proacl`), **AND** admin UUIDs are publicly discoverable (profiles `USING(true)` + anon column grant on `role`). So any anonymous/authenticated actor can `select id from profiles where role='ADMIN'` then call `admin_grant_credits(p_workspace_id:=<self>, p_amount:=999999, p_admin_id:=<that admin id>)` — self-granting unlimited credits, upgrading any plan, overriding entitlements, or flipping global feature flags. The frontend passes `authUser.id`, but the DB never binds that. **Fix:** authorize on `auth.uid()`, drop `p_admin_id` as an authz source, and `REVOKE EXECUTE … FROM anon` (gate behind an `is_admin()` wrapper). **The single most urgent fix in the codebase.**
- **P1 — 2.1 `subscriptions` self-writable (entitlement escalation). — ✅ FIXED (migration 20260817110000): user INSERT/UPDATE policies removed; writes are service_role/trigger only.** `INSERT "Service can insert subscriptions"` is `roles={public}, with_check=true`; `UPDATE "Users can update own subscription"` has **no WITH CHECK**. A user can insert/update their own subscription row's `plan`/`credits_total`/`status`, bypassing client-side entitlement gating. **Fix:** drop the public INSERT policy; add a WITH CHECK pinning entitlement columns to service-role writes (billing-webhook only).
- **P1 — 2.2 `audit_logs` cross-tenant readable. — ✅ FIXED (migration 20260817110000): dropped the `auth.uid() IS NOT NULL` SELECT policy.** A `SELECT USING (auth.uid() IS NOT NULL)` policy lets any authenticated user read every tenant's + admins' audit rows (OR'd with the correct own/team/admin policies). **Fix:** drop that policy.
- ✅ Guard functions are `SECURITY DEFINER … STABLE SET search_path=public` — correct.
- ✅ `enforce_profile_privileged_columns` trigger blocks CLIENT→ADMIN / is_super_admin / plan self-escalation from direct PostgREST updates.
- **P0 — Cross-tenant profile PII read. — ✅ FIXED (migration 20260817110000): dropped `USING(true)`; own/tenant-co-member/admin reads; anon column-limited. Verified.** `profiles` retains a legacy `SELECT USING (true)` policy for the `authenticated` role (`core_schema.sql:112`), never dropped. The PII-lockdown migration only fixed the `anon` role. Because permissive policies are OR'd, **any logged-in user can `select *` from `profiles`** — reading every user's email, `businessProfile` JSONB, and `stripe_customer_id`. **Fix:** drop the `USING(true)` policy; replace with own/co-member/admin.
- **P1 — Team self-join. — ✅ FIXED: joins require a valid invite via SECURITY DEFINER accept_team_invite(); permissive INSERT policy dropped.** `team_members` INSERT policy checks only `user_id = auth.uid()`; `acceptInvite` doesn't verify the invite belongs to the caller server-side → a user can insert themselves into an arbitrary `team_id`. **Fix:** `SECURITY DEFINER accept_team_invite` that validates a pending invite.
- **P2 — Team Hub role escalation.** `teamhub_flow_members` UPDATE doesn't validate the *target* role; `owner` blocked only in UI.
- **P2 — Self-serve feature flags.** Any workspace member can INSERT/UPDATE `workspace_feature_flags` for their workspace — safe for UX toggles, unsafe if any flag becomes a paid entitlement.
- **P2 — `business_profiles` writable by any member** (not admin-only).

## 3. Tenant isolation
- **P1 — Three unreconciled tenancy models** (`workspaces`/`businesses`/`teams`) with the `workspace_id == user.id` convention assumed in some paths and resolved from `workspace_members` in others. Diverges under true multi-workspace; `workspace_id` NOT NULL with no default has repeatedly broken inserts.
- **P2 — Business scoping inert by default** — `multi_business` flag off means queries fall back to legacy per-user scoping; the intended per-business isolation doesn't run, and AI reads a single user-level business profile across all businesses (cross-business content bleed — see AI analysis).
- ✅ Cross-workspace data is otherwise RLS-blocked (except the profiles P0).

## 4. API security (public v1 API)
- ✅ **Well-built and secure overall.** Keys are stored **hashed** (SHA-256 via `verify_api_key`, checks revoked/expired), workspace is derived from the key (not the body), scopes enforced, every query/update constrained by `.eq("workspace_id", …)`, real Postgres-backed cluster rate limit (60/min/key), idempotency with request-hash conflict detection.
- **P2 — `v1-analytics` cross-workspace leak.** `opens_in_range`/`clicks_in_range` query `email_events` with **no workspace filter** (the table has no `workspace_id`) → counts aggregate across all tenants. **Fix:** join through `email_messages` to scope by workspace.
- **P2 — API rate-limit fails open** on RPC error (`_shared/api-auth.ts:34-46`) — availability tradeoff, note it.
- **P3** — the ProfilePage "API keys" tab generates a client-side `af_` localStorage token that is **not** the real `api_keys` credential — confusing and potentially misleading (users may think they have a working key).

## 5. Webhook verification
- **P1 — SendGrid/Mailchimp signature verification is broken and fails open. — ✅ FIXED: SendGrid now verifies ECDSA P-256 (validated by round-trip); Mailchimp uses a URL `?secret=`. Note: both secrets are unset in prod, so enforcement activates once they're set (like Stripe).** `webhooks-sendgrid` uses **HMAC-SHA256** but SendGrid actually signs with **ECDSA** — genuine signatures can never verify; and it fails open when the key is unset → effectively unauthenticated writes to `email_events`/`email_dlq`. `webhooks-mailchimp` checks an `x-mailchimp-signature` header Mailchimp does not send, and also fails open. **Fix:** implement SendGrid ECDSA verification; fail closed. (Corrects an earlier assumption that these were signature-verified.)
- **P0 — Stripe webhook fails OPEN. — ✅ FIXED: fail-closed + constant-time + 5-min timestamp tolerance; verified unsigned/forged → 403. Requires STRIPE_WEBHOOK_SECRET set.** `verifyStripeSignature` returns `true` when `STRIPE_WEBHOOK_SECRET` is empty (`billing-webhook:20`); if the secret is unset in prod, **anyone can POST forged events** to grant subscriptions/credits. Also non-constant-time comparison and no timestamp-tolerance (replay). **Fix:** fail-closed + constant-time + freshness check. Confirm the secret is set.
- **P1 — Twilio webhooks unauthenticated. — ✅ FIXED: X-Twilio-Signature verified (fail-closed, constant-time) on all 4 webhooks; spoofed POSTs return 403.** `twilio-incoming`, `twilio-call-status`, `twilio-voicemail` are public endpoints that write to `lead_call_logs` via the admin client with no `X-Twilio-Signature` check → spoofable. Only `twilio-voice` optionally validates. **Fix:** verify signatures with `TWILIO_AUTH_TOKEN`.
- **P1 — Inbound email secret optional.** `inbound-email` enforces `X-Inbound-Secret` only if `INBOUND_EMAIL_SECRET` is set; ensure it's configured before pointing a hosted provider at it.

## 6. Financial / billing integrity
- **P0 — Client-supplied credit amounts. — ✅ FIXED: validated against a server-side CREDIT_PACKAGES allow-list.** `billing-checkout` credit-package flow takes `credits` + `price_cents` verbatim from the client and grants them via webhook metadata → a modified client can request huge credits for 1¢. **Fix:** validate against a server-side package allow-list.
- **P1 — Client-supplied Stripe price/plan. — ✅ FIXED: plan_name/interval resolved from the plans table by price id; client plan_name ignored.** `stripe_price_id` and `plan_name` come from the client with no server validation that they match; the webhook trusts `metadata.plan_name` (self-corrected later by `subscription.updated`, but with a window). **Fix:** resolve price→plan server-side; ignore client plan name.

## 7. Input validation & abuse prevention
- ✅ Import RPC validates/caps/dedupes; AI functions cap input sizes; `fetch-page` has SSRF guards (blocks localhost/private IPs) and auth.
- ✅ Server-side AI credit ceiling (`enforce_ai_proxy_quota`, fail-closed, service-role only) is the real anti-abuse boundary; cluster-wide 60/min rate limit.
- **P2 — AI ceiling bypass paths.** `ai-chat-stream`, `process-email-writing-queue`, `preview-sequence-email`, goal-steps, and `image-gen` call Gemini directly and bypass `enforce_ai_proxy_quota` (client-side metering only). A modified client or a runaway cron could consume uncapped Gemini here.
- **P2 — image-gen rate limit is in-memory** (per-worker) → bypassable across serverless instances (the fn is a dead stub anyway).
- **P2 — VOIP credit gate is client-side only**; `twilio-voice`/`twilio-incoming` don't re-check; inbound calls aren't gated.

## 8. File-upload security
- ✅ Uploads go to Supabase Storage buckets (`social_media`, `blog-assets`, `media_assets`, `image-gen-assets`) with signed URLs. Verify bucket RLS/public-read settings per bucket (the stub-created `image-gen-assets` is public-readable). **P3** — add content-type/size validation and per-bucket access review.

## 9. Secret management
- ✅ Secrets are function/env secrets, not in the repo. SMTP/sender secrets in `sender_account_secrets` (verify encryption at rest).
- **P1 — Secrets stored plaintext in client-readable tables. — ✅ FIXED (browser exposure): column-scoped grants hide credentials/api_key/smtp_pass/OAuth tokens from anon/authenticated; service_role only. Verified. At-rest encryption still open.** Beyond social OAuth tokens (`*_encrypted` columns storing raw tokens in `social_accounts`), `integrations.credentials` (Slack/HubSpot/Salesforce/GA/Stripe keys) and `email_provider_configs.api_key`/`smtp_pass` are **plaintext, SELECTable by the owner, and read back into the browser** (prefilled into forms). Only the newer `sender_account_secrets` is correct (service-role-only, written via a SECURITY DEFINER RPC). No Vault/pgcrypto anywhere. **Fix:** move all live secrets behind a service-role-only secrets table; never return them to the client; encrypt at rest.
- **P1 — Known exposed secrets pending rotation** (from project records): the Mails.so API key `MAILS_SO_API_KEY` was exposed and must be rotated; exposed `sbp_` Supabase tokens must be revoked. **Action required (user).**
- **P2 — `LEGACY_SERVICE_ROLE_KEY`** fallback exists — plan removal after rotation.

## 10. Encryption
- TLS in transit (Nginx + Let's Encrypt). At rest: Supabase-managed disk encryption. **Gap:** application-level encryption for OAuth/SMTP tokens is missing (see §9).

## 11. PII, email & call data
- Leads (emails, phones, company intel), `inbound_emails` (reply content), `lead_call_logs` (+ recording URLs), `profiles` (email, stripe_customer_id) are all PII.
- **P0/privacy — Account deletion is fake — ✅ FIXED: real purge_user_data() + delete-account edge fn (verified). Scheduled PII retention/lifecycle still open.**  (`ProfilePage.handleDeleteAccount` waits 2s and signs out; deletes nothing). No data-erasure path exists → **GDPR/CCPA "right to erasure" is not met.**
- **P1/privacy — No PII retention policy or purge** for leads, inbound emails, or call recordings. Recordings are stored as Twilio URLs; no lifecycle.
- **P2 — Data export is mock**; no real DSAR export.

## 12. Logging of sensitive information
- Audit trails (`audit_logs`, `support_audit_logs`) capture security events; support access is time-boxed via `support_sessions`. ✅
- **P3 — Review edge-function `console.error` logs** for accidental PII/token logging (e.g., error bodies). Twilio/OAuth handlers echo provider errors — ensure no tokens are logged.

## 13. Rate limiting & audit trails
- ✅ AI rate limits (cluster-wide), API rate limits, idempotency, and a support-session audit trail.
- **P2** — no global per-user request throttling on non-AI edge functions.

## 14. Backup & recovery
- Relies on Supabase managed backups (verify PITR/backup cadence is enabled on the plan). **P2** — no documented restore runbook; the VPS deploy keeps 5 releases but that's app-only, not data.

---

## Prioritized remediation
| # | Sev | Finding | Fix |
|---|---|---|---|
| 0 | **P0** | **Admin RPCs callable by anyone (`p_admin_id` + anon EXECUTE)** | **Authorize on `auth.uid()`; REVOKE from anon — do this first** |
| 1 | P0 | `profiles USING(true)` cross-tenant PII read | Drop policy; own/co-member/admin scope |
| 1b | P1 | `subscriptions` self-writable | Drop public INSERT; WITH CHECK on entitlement cols |
| 1c | P1 | `audit_logs` cross-tenant SELECT | Drop `auth.uid() IS NOT NULL` policy |
| 1d | P1 | SendGrid/Mailchimp webhook wrong algo + fail-open | ECDSA for SendGrid; fail closed |
| 1e | P1 | Plaintext integrations/email-provider/OAuth secrets | Service-role-only secrets table; encrypt |
| 2 | P0 | Stripe webhook fails open when secret unset | Fail-closed + constant-time + timestamp check; confirm secret set |
| 3 | P0 | Client-supplied credit `{credits, price_cents}` | Validate against server allow-list |
| 4 | P0 | Account deletion is fake (no erasure) | Real deletion + PII purge (GDPR) |
| 5 | P1 | Client-supplied Stripe price/plan | Resolve server-side; ignore client plan name |
| 6 | P1 | Twilio webhooks unauthenticated | Verify `X-Twilio-Signature` |
| 7 | P1 | OAuth tokens stored plaintext | Encrypt at rest |
| 8 | P1 | Exposed Mails.so key + `sbp_` tokens | Rotate/revoke (user action) |
| 9 | P1 | Team self-join RLS | Server-side invite acceptance |
| 10 | P1 | No PII retention/erasure policy | Define + implement lifecycle |
| 11 | P2 | AI ceiling bypass paths | Route through `enforce_ai_proxy_quota` |
| 12 | P2 | VOIP credit gate client-side | Server-side enforcement |
