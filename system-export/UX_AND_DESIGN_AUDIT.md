# Scaliyo — UX & Design Audit

> Focus: where the product *looks* complete but lacks a working operational workflow, plus standard UX heuristics. Evidence-based.

## 0. The defining UX problem: "looks complete, isn't wired"

Scaliyo's biggest UX risk is a **large gap between visual completeness and operational reality.** Multiple polished surfaces present as finished features but silently do nothing or fail:

| Surface | Looks like | Actually |
|---|---|---|
| Lead **notes / tasks / activity log** | A working CRM notebook | Local React state — **data vanishes on reload** (silent loss) |
| **Onboarding** "Setting up your workspace" | Provisioning progress | A timed animation; provisions nothing |
| Profile **API keys / 2FA / data export / delete account** | Security controls | Mock (localStorage token; fake delete that erases nothing) |
| **Social "connected" accounts** | Connected & ready | Demo tokens; **every publish fails** with no clear UI signal |
| **Lead scoring** number | AI score | Placeholder `+5`; the real scorer is hidden behind a default-off flag |
| **Lead discovery / search** | Find new leads | Local filter over existing rows; no data provider |
| **Business switcher** | Multi-business isolation | Does not filter data until `multi_business` flag is on |
| **VOIP call** button | Click to call | Dormant until Twilio secrets are set |

Fixing this perception gap (either wiring the workflows or clearly labeling them "coming soon / demo") is the single highest-leverage UX investment.

## 1. Navigation & Information Architecture
- **Too many top-level routes** (~35 portal routes) with overlapping purposes: `content` vs `content-studio` vs `image-studio`; `campaigns` vs `quick-launch`; `automation` vs `goals`; `businesses` vs `business-settings` vs `settings`. Users must learn which of several similar pages does what.
- **Duplicate campaign entry points** existed (Content vs Manage Campaigns) — reconciled this session by making "Manage Campaigns" primary and renaming the old one to "Content." Good; watch for recurrence.
- **Three tenancy concepts** (workspace, business, team) plus **two team systems** (Team Hub vs Strategy Hub) are exposed without a clear mental model — deeply confusing terminology.
- **Admin area** is well-separated (`/admin/*`, role-gated).

## 2. Dashboard usefulness
- Mission Control / Client Dashboard show real metrics for real activity, but on a fresh/low-activity account they are sparse. Some derived intel was intentionally de-fabricated (good — no more `Math.random()` dashboards), leaving honest but thin dashboards. **Empty-state guidance ("do X next") is weak.**

## 3. Mobile responsiveness
- A dedicated mobile shell exists (`/portal/mobile/*`: Home, Leads, LeadDetail, Campaigns, Activity, Goals, More) — a real subset, not just CSS. Desktop pages are Tailwind-responsive but complex tables/kanban are desktop-first. Parity between mobile and desktop feature sets is partial.

## 4. Loading & empty states
- Route-level `Suspense` + `PageFallback` and `lazyWithRetry` (guards against stale-chunk crashes after deploys — a real fix this codebase made). Good.
- Background jobs have durable indicators (enrichment watcher, job pollers). Good.
- **Empty states are inconsistent** — some pages explain what to do, others show blank tables. The intel placeholder page is honest but a dead-end.

## 5. Error messages & user feedback
- Toasts are used widely; the AddSenderModal now advances instantly (fixed this session — previously a hung capacity check made provider cards appear dead).
- **Silent failures are the main issue:** notes/tasks discard silently; social publish fails behind the scenes; fire-and-forget writes (onboarding profile save) surface only a toast on error.
- Some legacy dev artifacts leak into UI (a "Schema v10.5 Required" screen with copy-paste SQL on certain auth errors) — should never reach end-users.

## 6. Forms & validation
- Import wizard has solid auto-mapping + validation. Campaign builder has rich per-step editing, field pickers, A/B editors, previews.
- Client-side validation dominates; several forms (onboarding, profile) don't await/confirm persistence.
- Decorative controls (Remember-me, Terms checkbox) aren't wired.

## 7. Tables, filters, search
- Lead table/kanban: filters (status, tags, enrichment status, follow-up), bulk actions (tag, assign, add-to-campaign, status). Strong.
- **Kanban has no drag-and-drop** — stage change is a "next stage" button only (a discoverability/expectation gap for a board UI).
- **Search is local** (in-memory filter), not server search — fine at small scale, misleading as "find leads."

## 8. Modals & drawers
- The app has a consistent right-side drawer convention (`flex justify-end` + `animate-in slide-in-from-right`, e.g. BillingPage, and now AddSenderModal after this session's fix). Good, once consistent.
- Some flows still use centered modals; converging on the drawer pattern would improve consistency.

## 9. Accessibility
- Not systematically addressed: icon-only buttons (lucide) frequently lack explicit labels; focus states are default; no evidence of ARIA roles on custom widgets, keyboard nav for kanban, or reduced-motion handling on the animation-heavy onboarding. **A dedicated a11y pass is needed.**

## 10. Visual consistency & button hierarchy
- Tailwind design is generally cohesive (indigo/emerald accents, rounded cards). Button hierarchy is mostly clear (primary indigo, secondary ghost).
- Inconsistencies arise from the many near-duplicate pages (content trio) having slightly different layouts.

## 11. Long workflows
- Campaign creation → enroll → launch → monitor is multi-step but coherent (Quick Launch is a good fast-path on-ramp).
- Team collaboration is a **broken long workflow** (invite → accept → collaborate dead-ends across two systems).
- Business-profile setup is confusing (two stores, unclear which the AI uses).

## 12. Duplicate actions
- Content generation exists in ContentGen, ContentStudio, ImageStudio with overlapping capabilities.
- Two "generate lead research" functions; two business-profile editors; two credit systems surfaced differently.

## 13. Confusing terminology
- **workspace vs business vs team** (three tenancy words), **Team Hub vs Strategy Hub** (two team products), "credits" meaning two different counters, "Apollo" implying a discovery integration that doesn't exist.

## 14. Hard-to-discover features
- The **real lead intelligence** (signal-based score, research profile, next-best-action) is hidden behind `lead_intelligence` (off by default) — the app's best AI features are invisible to most users.
- Best-time send, A/B auto-optimize, reply-based winner metric are powerful but buried in campaign drawers.
- Image Studio is flag-gated (`image_studio`).

## 15. Looks-complete-but-no-workflow (consolidated)
1. Lead notes/tasks/activity (no persistence).
2. Team invites (no send path).
3. Social publishing (demo tokens fail).
4. Profile security tab (mock).
5. Account deletion (fake).
6. Lead discovery / Apollo (no provider).
7. AI-assisted calls (doesn't exist).
8. Automation/goals live mode (flag-gated; verify execution).
9. Workspace entitlements (admin sets them, nothing reads them).

## 16. Top UX recommendations
1. **Wire or label.** For every "looks complete" surface, either implement the workflow or add an explicit "Coming soon / Demo" state. Start with notes/tasks (persist to `lead_notes`) — this is silent data loss.
2. **Surface the real AI intel by default** (enable `lead_intelligence`, show the real score in the table).
3. **Collapse duplicate pages** — merge the content trio; keep one campaigns entry; unify the two team systems or hide the dead one.
4. **Fix terminology** — pick one tenant word for users; distinguish "demo connected" vs "connected" for social.
5. **Add drag-and-drop to the kanban** and real server-side lead search.
6. **Accessibility pass** — labels on icon buttons, focus states, keyboard nav, reduced-motion.
7. **Remove dev artifacts** (schema-required screen) from production paths.
8. **Improve empty states** with next-best-action guidance.
