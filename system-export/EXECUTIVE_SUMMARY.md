# Scaliyo — Executive Summary

> Branch `master` · commit `d8e1762` · analysed 2026-07-16. Read-only review of the actual implementation (frontend, edge functions, database, integrations).

## What Scaliyo currently does
Scaliyo is an **AI-assisted B2B outreach and content platform**. In its working core, a user can: import leads (CSV/XLSX), enrich them with a grounded AI research job, build multi-step email campaigns with AI personalization / mail-merge / A/B testing / send-time optimization, send through their own SMTP or SendGrid, track opens/clicks and replies in a unified inbox, generate marketing content and images, author and publish a blog, invoice their own customers via Stripe, and manage it all behind a mature admin console with role-based Row-Level Security. It is built on React 19 + Supabase (Postgres + 53 Deno edge functions + Storage) with Google Gemini as the AI engine and Stripe, Twilio, Meta, LinkedIn, SendGrid, and mails.so as integrations.

## Primary target users
SMB and mid-market **sales and marketing teams / agencies** running outbound email + content programs — and, per the roadmap, agencies managing **multiple client businesses** from one account.

## Current product positioning
Marketed as a *"complete AI-powered growth and marketing platform"* spanning discover → understand → score → contact → nurture → call → convert → retain, across **multiple businesses and teams**.

## Core value proposition
AI-personalized, deliverability-aware outbound at scale with the lead intelligence and content generation attached — one tool instead of a separate enrichment tool, sequencer, content generator, and dialer.

## Strongest implemented capabilities
- **Email campaign engine** — a genuinely sophisticated 3-stage cron pipeline: AI-personalized or verbatim, A/B subject **and** body, reply-based winner + auto-optimize, per-recipient best-time send with re-learning, suppression + sender-health + daily caps. This is the product's crown jewel.
- **Lead enrichment** — a durable, grounded, credit-metered background job that survives navigation.
- **Deliverability & sending** — real SMTP/SendGrid, open/click tracking, unified inbox with IMAP polling and reply→variant attribution, real mails.so validation.
- **Content & blog** — working content/image generation (Imagen 4, vision) and a full draft→review→publish blog.
- **Platform maturity** — 109/111 tables under RLS, thoughtful guard functions, a self-escalation-blocking trigger, a fail-closed server-side AI credit ceiling, a public API with keys/idempotency, outbound webhooks, and a deep admin suite.

## Weakest / incomplete areas
- **Both ends of the funnel:** **lead discovery** (no data provider) and **convert/retain** (no deals/opportunities, no retention) are essentially missing.
- **Social publishing** is real code that **never works in production** (all accounts are demo tokens); **TikTok** doesn't exist.
- **Team collaboration** is broken (two disconnected team systems, no working invite path).
- **VOIP** is fully built but **dormant** (needs Twilio secrets); **AI call assistance doesn't exist**.
- **Gmail connect is a broken stub; Outlook is absent.**
- **Silent data loss:** lead notes/tasks/activity aren't persisted.
- **The best AI features (real lead score, research, next-action) are hidden behind a default-off flag**, so users see placeholders.
- **Multi-business isolation is flag-off by default**, and AI context leaks across businesses.

## Biggest risks
- **Security (P0 — severe):** the **`admin_*` RPCs are callable by anyone** — they authorize on a caller-supplied admin id, are `EXECUTE`-granted to `anon`, and admin ids are publicly readable, so **any anonymous user can grant themselves unlimited credits, change any plan, or flip global feature flags** (a working, unauthenticated financial-fraud exploit). Additionally: a live `USING(true)` policy on `profiles` exposes every user's email/business profile/Stripe id; `subscriptions` is **self-writable** (self-grant plan/credits); `audit_logs` is cross-tenant readable; the Stripe webhook **fails open** and SendGrid/Mailchimp webhooks use the **wrong signature algorithm**; credit/plan amounts are **client-supplied**; third-party secrets (integrations/email-provider/OAuth) are stored **plaintext in client-readable tables**; **account deletion is fake** (no GDPR erasure). Twilio webhooks are unsigned; an exposed Mails.so key/`sbp_` tokens await rotation.
- **Product:** the marketed promise materially exceeds the working product (discover/convert/retain/social/calls/teams). Shipping "looks complete but isn't wired" surfaces (notes, social, Gmail, deletion, AI calls) risks user trust.
- **Technical:** three overlapping tenancy models + a `workspace_id==user.id` assumption keep breaking inserts; plan config is duplicated in 5+ places with confirmed drift; a **latent double-send** hazard sits in the email pipeline.
- **UX:** heavy feature sprawl (~35 portal routes, duplicate content pages, confusing tenancy terminology) and hidden best-features.
- **Scalability:** client-side credit checks and some AI paths bypass the server ceiling; inbound-call reverse-lookup scans thousands of leads client-side; no caching layer beyond one analytics materialized view.

## Does the system support its "complete B2B growth platform" positioning?
**Not yet.** It is a **strong AI email-outreach + content platform with a mature backend**, but it is **not** the complete discover→convert→retain, multi-business, multi-team platform the marketing implies. The email/enrichment/content core is real and good; the funnel edges (discovery, CRM/deals, retention), social publishing, calling, and team collaboration are missing, broken, or dormant. With the Phase 0 security fixes and Phase 1–3 work, it can credibly claim "AI outreach + content"; the full "growth platform" claim requires Phases 4–6.

## Ten highest-priority improvements
1. ~~**Fix admin-RPC authorization**~~ — ✅ **DONE** (migration `20260817100000`): admin_* RPCs now authorize on `auth.uid()` with EXECUTE revoked from PUBLIC/anon; exploit verified blocked. **Still open:** lock down the self-writable `subscriptions` table (P1) and drop the cross-tenant `audit_logs` SELECT policy (P1).
2. **Remove the `profiles USING(true)` policy** + **fix billing trust boundaries** (fail-closed Stripe webhook, server-validated price/credit amounts) (P0, S–M).
3. **Implement real account deletion + PII retention/erasure** (P0, L — compliance).
4. **Persist lead notes/tasks/activities** — stop silent data loss (P1, M).
5. **Resolve the email double-send hazard** — single sender path (P1, M).
6. **Fix or replace Gmail connect and add Outlook** (P1, M–L).
7. **Make social publishing real** (configure/app-review OAuth) or clearly label it demo (P1, M + review).
8. **Reconcile the tenancy model & unify the business "brain"** so multi-business isolation is real and AI context can't bleed across businesses (P1/P2, XL).
9. **Surface the real lead intelligence by default** (unhide the signal-based score/research) (P2, S).
10. **Unify and fix team collaboration** (one team model, working invites) (P2, L).

> Full detail: see `COMPLETE_FEATURE_INVENTORY.md`, `SECURITY_AND_PRIVACY_AUDIT.md`, `AI_SYSTEM_ANALYSIS.md`, `BUGS_AND_TECHNICAL_DEBT.md`, `GAP_ANALYSIS.md`, and `RECOMMENDED_ROADMAP.md`.
