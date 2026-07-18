# Scaliyo — System Export / Review Package

## What this is
A comprehensive, evidence-based analysis of the Scaliyo (aurafunnel) application for product, technical, UX, security, and business review. It documents what is **actually implemented** — not merely what pages/buttons/tables exist — and clearly labels features as fully functional, partial, UI-only, broken, or missing.

## Repository & scope
- **Repo:** aurafunnel (Scaliyo) — app code in `AuraEngine/`, backend in `supabase/functions/` + `supabase/migrations/`.
- **Branch:** `master` · **Commit:** `d8e1762` · **Analysis date:** 2026-07-16.
- **Live schema:** Supabase project `utvydxqiqedaaxmmpfpf` (read-only introspection).
- **Scale analysed:** ~50 portal/admin/marketing routes, 53 edge functions, 152 migrations, 111 tables, 105 DB functions, 331 RLS policies, 3 enums, 1 materialized view, 16 cron jobs, ~17 external integrations.

## Contents
| File | Purpose |
|---|---|
| `EXECUTIVE_SUMMARY.md` | What Scaliyo does, positioning, strengths/weaknesses, top risks, top-10 priorities |
| `COMPLETE_FEATURE_INVENTORY.md` | Every module/feature with status, files, tables, integrations, limitations |
| `USER_WORKFLOWS.md` | 24 end-to-end workflows with triggers, system actions, failures, Mermaid diagrams |
| `DATABASE_SCHEMA.md` | Tables by domain, enums, views, functions, triggers, RLS, schema-risk analysis |
| `DATABASE_SCHEMA.sql` | Full schema-only SQL (no data/secrets) |
| `ARCHITECTURE.md` | Stack, multi-tenancy, and 9 Mermaid architecture/flow diagrams |
| `API_AND_INTEGRATIONS.md` | Every internal fn + external integration, auth, endpoints, status |
| `AI_SYSTEM_ANALYSIS.md` | Every AI capability traced; grounding, isolation, validation; stronger-architecture recs |
| `ROLES_AND_PERMISSIONS.md` | Role model, permission matrices, frontend-only vs backend-enforced checks |
| `UX_AND_DESIGN_AUDIT.md` | Navigation, IA, states, accessibility, "looks-complete-but-not-wired" surfaces |
| `SECURITY_AND_PRIVACY_AUDIT.md` | Safe code/config security review with P0–P3 findings + remediation |
| `BUGS_AND_TECHNICAL_DEBT.md` | Structured issue register (36 issues, P0–P3, with fixes/complexity) |
| `GAP_ANALYSIS.md` | Current system vs. the stated vision, capability-by-capability |
| `RECOMMENDED_ROADMAP.md` | Phase 0–6 roadmap with objectives/value/risks/acceptance/complexity |
| `FEATURE_MATRIX.csv` | Spreadsheet: module × feature × frontend/backend/db/integration status |
| `ROUTES_AND_FILES.csv` | Route → page → purpose → files → API → tables → role → status |
| `ENVIRONMENT_VARIABLES.example` | Every required env-var name with a safe placeholder |
| `REVIEW_PACKAGE_README.md` | This file |

## How it was generated
- **Method:** direct read-only inspection of the codebase and the live database schema (no code changes, no deploys, no destructive tests). Analysis was fanned out across parallel deep-trace passes over each subsystem (auth/tenancy, leads/CRM, AI, email/campaigns/inbox, social/content, VOIP, billing, admin/security), then synthesized. Findings are backed by `file:line` references and, where noted, live-DB introspection.
- **Verbs used to classify status:** every feature was assessed by reading its **handler code and data path** — what happens on submit/click, whether it writes to the DB, and whether the backend/RLS enforces it — not by the presence of a page, button, or table.

## Assumptions & caveats
- Some agents experienced transient Supabase pooler connectivity drops mid-analysis; where a claim rests on migrations rather than a live re-query, it is noted inline in the relevant doc. Runtime facts (e.g., whether `STRIPE_WEBHOOK_SECRET` is set in prod) could not always be confirmed and are flagged as such.
- All eight subsystem deep-traces (auth/tenancy, leads/CRM, AI, email/campaigns/inbox, social/content, VOIP, billing, admin/security) completed and are fully integrated. The admin/security trace surfaced the package's **most severe finding** — the `admin_*` RPCs are callable by anyone (unauthenticated privilege escalation, BUG-037/finding 2.0) — plus self-writable `subscriptions`, cross-tenant `audit_logs`, broken SendGrid/Mailchimp webhook signatures, plaintext third-party secrets, and that notifications are not a real system. Docs written earlier were corrected accordingly (see the ⚠️ correction notes in `SECURITY_AND_PRIVACY_AUDIT.md` and `ROLES_AND_PERMISSIONS.md`).
- "Prod reality" statements (e.g., social accounts are demo tokens, 0 campaign-attributed messages) reflect the live schema/state at analysis time and may change as the app is used.
- Model/behavior notes reflect commit `d8e1762`; the app is under active development.

## Folders not analysed in depth
- `AuraEngine/supabase/` is a **stale duplicate** of the backend — `supabase/functions/` and `supabase/migrations/` at the repo root are the source of truth and were analysed. A few legacy `AuraEngine/supabase-migration-*.sql` files are referenced where they affect behavior.
- Marketing static pages, `node_modules`, and build artifacts were not deeply audited.

## How to use this package
- **Product/leadership:** start with `EXECUTIVE_SUMMARY.md` and `GAP_ANALYSIS.md`.
- **Engineering:** `BUGS_AND_TECHNICAL_DEBT.md` (P0 first), `ARCHITECTURE.md`, `DATABASE_SCHEMA.md`/`.sql`.
- **Security/compliance:** `SECURITY_AND_PRIVACY_AUDIT.md` + `ROLES_AND_PERMISSIONS.md`.
- **AI/ML:** `AI_SYSTEM_ANALYSIS.md`.
- **Design/UX:** `UX_AND_DESIGN_AUDIT.md` + `USER_WORKFLOWS.md`.
- **Planning:** `RECOMMENDED_ROADMAP.md`; track execution against `FEATURE_MATRIX.csv`.
- **Onboarding a new engineer:** `ROUTES_AND_FILES.csv` + `COMPLETE_FEATURE_INVENTORY.md` + `ENVIRONMENT_VARIABLES.example`.

## Safety
No secret values, API keys, tokens, passwords, or private customer records are included. `DATABASE_SCHEMA.sql` is schema-only (verified: 0 `COPY`/`INSERT` statements). `ENVIRONMENT_VARIABLES.example` lists variable **names** with placeholder values only.
