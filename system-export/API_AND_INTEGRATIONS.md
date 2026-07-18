# Scaliyo — API & Integrations Inventory

> Every internal edge function and external integration. Env-var **names** only (never values). Status reflects actual implementation.

## Internal Edge Functions (53)
Grouped by domain. All are Deno; most authenticate the caller JWT; webhooks deploy `--no-verify-jwt`.

| Domain | Functions |
|---|---|
| **AI** | `gemini-proxy` (provider-aware), `ai-generate` (SSE), `ai-chat-stream` (SSE), `enrich-lead`, `preview-sequence-email`, `process-email-writing-queue`, `fetch-page` (scraper), `image-gen` (stub) |
| **Email send/track** | `send-email`, `start-email-sequence-run`, `process-sequence-sends`, `process-scheduled-emails`, `email-track`, `tracking-redirect`, `ab-autopause` |
| **Inbox** | `inbound-email` (webhook), `poll-imap-inbox` |
| **Senders/validation** | `connect-smtp`, `connect-sendgrid`, `connect-gmail-oauth`, `connect-mailchimp-oauth`, `mails-validation-worker`, `verify-domain`, `validate-integration` |
| **Social** | `social-post-now`, `social-schedule`, `social-run-scheduler`, `meta-oauth-start`, `meta-oauth-callback`, `linkedin-oauth-start`, `linkedin-oauth-callback` |
| **VOIP** | `twilio-token`, `twilio-voice`, `twilio-call-status`, `twilio-incoming`, `twilio-voicemail` |
| **Billing** | `billing-checkout`, `billing-actions`, `billing-create-invoice`, `billing-webhook` |
| **Automation** | `goal-executor`, `goal-replanner` |
| **Public API** | `v1-leads`, `v1-campaigns`, `v1-sequences`, `v1-analytics` |
| **Webhooks in** | `webhooks-sendgrid`, `webhooks-mailchimp`, `webhook-dispatcher` (out) |
| **Auth/support/admin** | `auth-send-email`, `admin-audit-export`, `support-debug-integration`, `support-diagnostic-report` |

---

## External Integrations

### 1. Google / Gmail (OAuth)
- **Purpose:** connect a Gmail account as an outreach sender + (marketing intent) login OAuth.
- **Auth:** OAuth 2.0 authorization-code. **Env:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`.
- **Files:** `connect-gmail-oauth`; login OAuth via `supabase.auth.signInWithOAuth`.
- **Endpoints:** Google OAuth consent URL only.
- **Status:** 🔴 **Broken stub.** `connect-gmail-oauth` builds a consent URL but there is **no callback function** to exchange the code for tokens or create the sender account. Even if completed, `send-email` sends "gmail" via **SMTP** (`send-email/index.ts:704-712`), not the `gmail.send` API the OAuth scope grants — so the token would be unusable. **Workaround today:** connect Gmail as a Custom SMTP account (app password). Login-OAuth (Google/GitHub sign-in) is separate and works.
- **Security:** tokens stored in `sender_accounts`/`sender_account_secrets` — verify encryption.

### 2. Microsoft Outlook / Microsoft 365
- **Purpose (intended):** Outlook sender + calendar.
- **Status:** 🔴 **Missing entirely.** No Microsoft OAuth, no Graph API, no `outlook`/`microsoft` code anywhere. Only Gmail/SMTP/SendGrid/Mailchimp senders exist. **The brief's "Outlook connection" and "Outlook calendar" do not exist.**

### 3. Meta — Facebook & Instagram (Graph API)
- **Purpose:** publish posts to Facebook Pages + Instagram business accounts.
- **Auth:** OAuth 2.0; short→long-lived token swap; page tokens. **Env:** `META_APP_ID`, `META_APP_SECRET`, `OAUTH_REDIRECT_BASE`, `APP_BASE_URL`.
- **Files:** `meta-oauth-start`, `meta-oauth-callback`, `social-post-now` (publish).
- **Endpoints:** Graph **v21.0** — `/me/accounts`, `/{pageId}/feed`, `/{pageId}/photos`; IG: `/{igUserId}/media` → poll `status_code` → `/{igUserId}/media_publish`. Scopes: `pages_show_list, pages_read_engagement, pages_manage_posts, instagram_basic, instagram_content_publish, business_management`.
- **Data sent:** message/link/image_url + caption. **Received:** page/IG account list, `remote_post_id`.
- **Status:** ⚠️ **Code real, non-functional in prod.** OAuth-start has a **demo fallback** (inserts `demo_token` when env vars absent). All prod `social_accounts` are demo → every publish fails ("Invalid OAuth access token"). Needs app config + Meta app review for publishing scopes.
- **Security:** **P1** page tokens stored plaintext in `*_encrypted` columns; OAuth `state` (CSRF) stored as a `social_post_events` row, never expired.

### 4. LinkedIn (UGC Posts API)
- **Purpose:** publish posts as a member or organization.
- **Auth:** OAuth 2.0 (OpenID). **Env:** `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `OAUTH_REDIRECT_BASE`.
- **Files:** `linkedin-oauth-start`, `linkedin-oauth-callback`, `social-post-now`.
- **Endpoints:** `/v2/ugcPosts` (+ `registerUpload`→PUT→attach for images), `userinfo`, `organizationAcls`. Scopes: `openid profile email w_member_social r_organization_social w_organization_social r_basicprofile`.
- **Status:** ⚠️ **Code real, demo-mode in prod** (same `demo_token` fallback). Never published.

### 5. TikTok
- **Status:** 🔴 **Does not exist.** "tiktok" appears only as a content-tone channel string in `imageStudio.ts`. No OAuth, no publish path.

### 6. SendGrid (email delivery + events)
- **Purpose:** (a) system/auth email delivery; (b) an outreach sender option; (c) inbound event tracking.
- **Auth:** API key + webhook verification key. **Env:** `SENDGRID_API_KEY`, `SENDGRID_WEBHOOK_VERIFICATION_KEY`.
- **Files:** `auth-send-email` (fallback), `connect-sendgrid`, `send-email`, `webhooks-sendgrid`.
- **Endpoints:** SendGrid v3 mail send; Event Webhook (delivered/open/click/bounce/spam).
- **Status:** ✅ send **functional**; **⚠️ webhook verification broken (P1)** — `webhooks-sendgrid` uses HMAC-SHA256 but SendGrid signs with **ECDSA**, so real signatures never verify, and it **fails open** → effectively unauthenticated writes to `email_events`/`email_dlq`. Auth/system SendGrid path is near capacity; outreach should use per-workspace senders. **Fix:** implement ECDSA; fail closed.

### 7. SMTP (generic outreach sender)
- **Purpose:** connect any SMTP mailbox for outreach + IMAP reply polling.
- **Env (auth hook path):** `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`; per-workspace SMTP creds stored in `sender_account_secrets`.
- **Files:** `connect-smtp`, `send-email`, `poll-imap-inbox`.
- **Status:** ✅ **Functional** (validated server-side on connect; IMAP poller has connect/read timeouts). Primary working outreach + reply path.

### 8. Mailchimp
- **Purpose:** marketing-list sender (newsletters, not cold outreach). **Env:** `MAILCHIMP_WEBHOOK_SECRET`.
- **Files:** `connect-mailchimp-oauth`, `webhooks-mailchimp`.
- **Status:** ⚠️ Partial — connect + webhook (signature-verified) exist; marketing-only, compliance-gated in UI.

### 9. mails.so (email validation)
- **Purpose:** verify deliverability (valid/invalid/disposable/role), feed scoring + suppressions.
- **Auth:** API key. **Env:** `MAILS_SO_API_KEY` (**exposed — rotate**).
- **Files:** `mails-validation-worker`, feeds `email_validations`/`email_validation_log`.
- **Status:** ✅ Functional; **P1 key rotation pending.**

### 10. Lead-data provider (Apollo / PDL / etc.)
- **Status:** 🔴 **Missing.** No provider integration; `apollo_*` tables are dead scaffolding. Lead "discovery" is a local filter only.

### 11. Twilio (VOIP)
- **Purpose:** in-browser calling, inbound routing, voicemail, recordings.
- **Auth:** Account SID + API Key + Auth Token + TwiML App. **Env:** `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET`, `TWILIO_TWIML_APP_SID`, `TWILIO_CALLER_ID`.
- **Files:** `twilio-token`, `twilio-voice`, `twilio-call-status`, `twilio-incoming`, `twilio-voicemail`; client `@twilio/voice-sdk`.
- **Status:** ⚠️ **Built, dormant** (secrets unset; run `setup-twilio.sh`). **P1** most webhooks unauthenticated; client-side credit gate.

### 12. Stripe (payments)
- **Purpose:** subscription checkout + billing webhook + CRM invoicing (bill your own customers).
- **Auth:** secret key + webhook secret; per-user key optional (in `integrations`). **Env:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `VITE_STRIPE_PUBLISHABLE_KEY`.
- **Files:** `billing-checkout`, `billing-webhook`, `billing-actions`, `billing-create-invoice`; client `@stripe/stripe-js`.
- **Endpoints:** `/v1/customers`, `/v1/checkout/sessions`, `/v1/invoices`; webhook events (checkout/subscription/invoice).
- **Status:** ✅ **Functional**, **P0 security gaps**: fails-open webhook when secret unset; client-trusted price/credit amounts. CRM invoicing is real Stripe invoicing.

### 13. AI — Google Gemini + Imagen (+ OpenAI routing)
- **Purpose:** all text generation, vision, grounding, image generation.
- **Auth:** API keys. **Env:** `GEMINI_API_KEY`, `OPENAI_API_KEY`.
- **Files:** `gemini-proxy` (routes gpt-*→OpenAI, gemini-*/grounded/images→Gemini), plus direct-Gemini functions (see AI analysis).
- **Endpoints:** Gemini v1beta `generateContent`/`streamGenerateContent`, `generateImages` (Imagen 4), grounded tools (googleSearch/urlContext).
- **Status:** ✅ Functional; text on `gemini-2.5-flash`. **Retry/reliability:** proxy stream-accumulates to dodge an SDK hang; grounded via raw REST. Some paths bypass the credit ceiling.

### 14. ElevenLabs (voice widget)
- **Purpose:** conversational site/portal navigation assistant. **Env:** `VITE_ELEVENLABS_AGENT_ID`, `VITE_ELEVENLABS_PORTAL_AGENT_ID`, `VITE_ELEVENLABS_AUTH_AGENT_ID`.
- **Files:** `components/voice/VoiceAgent.tsx`, `VoiceAgentLauncher.tsx`; `@elevenlabs/react`.
- **Status:** ✅ Functional as a nav widget; **not** a call co-pilot.

### 15. Sentry (error monitoring)
- **Env:** `VITE_SENTRY_DSN`. **Status:** ✅ Frontend error capture (`@sentry/react`).

### 16. Supabase (platform)
- **Purpose:** Postgres + Auth + Storage + Edge Functions. **Env:** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `LEGACY_SERVICE_ROLE_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. **Status:** ✅ Core platform.

### 17. Calendar providers (Google/Outlook Calendar)
- **Status:** 🔴 **Missing.** `lead_meetings` stores meetings internally; there is **no external calendar sync** (no Google/Outlook Calendar API). Meetings are DB records only.

---

## Retry / error / rate-limit handling (cross-cutting)
- **Retries:** AI email writing retries ≤3 then marks `failed`; enrichment falls back grounded→ungrounded; email send has attempt counts + DLQ (`email_dlq`).
- **Rate limits:** AI 60/min (proxy), 30/min (ai-generate), 20/min (chat) via Postgres buckets (fail-open); API buckets; idempotency tables.
- **Timeouts:** IMAP poller (connect 10s / account 20s); fetch-page (10s/page, 20s overall); AI doc analysis (60s, 3 retries).
- **Outbound webhooks:** `webhook-dispatcher` + `webhook_deliveries` with retry state.

## Missing integrations (vs. product positioning)
Outlook/Microsoft 365, TikTok, external calendar sync (Google/Outlook), lead-data provider (Apollo/PDL), CRM sync (HubSpot/Salesforce), and AI call transcription/co-pilot — **all absent**.
