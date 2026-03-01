# Scaliyo — System Overview

## 1. Product Summary

Scaliyo is an AI-powered B2B growth intelligence platform that helps sales teams, SDRs, and agencies automate outbound prospecting, lead management, content generation, and multi-channel outreach. It combines AI-driven lead scoring, personalized content generation (via Google Gemini), multi-provider email sending with deliverability tracking, LinkedIn/social scheduling, and team collaboration into a single SPA backed by Supabase, Stripe, and a Node.js worker service.

**Live URL:** https://scaliyo.com
**Stack:** React 19 + TypeScript + Vite 6 + Tailwind CSS + Supabase (Auth/Postgres/Edge Functions) + Stripe + Google Gemini + Nginx

---

## 2. Key Modules

| Module | Purpose | Primary Files |
|--------|---------|---------------|
| **Lead Management** | Import, score, segment, tag, and manage B2B leads. CSV/Apollo import with deduplication. Color-coded pipeline stages. | `pages/portal/LeadManagement.tsx`, `lib/leadImporter.ts` |
| **AI Content Generation** | Generate personalized emails, blog posts, landing pages, social posts, proposals, and ad copy via Gemini. A/B testing, quality scoring, tone control. | `pages/portal/ContentGen.tsx`, `pages/portal/ContentStudio.tsx`, `lib/gemini.ts` |
| **Email Sending & Tracking** | Multi-provider email sending (Gmail OAuth, SMTP, SendGrid, Mailchimp) with pixel-based open tracking, click tracking via link rewriting, bounce/spam detection. | `lib/sendingEngine.ts`, `lib/emailTracking.ts`, Edge Function `send-email` |
| **Workflow Automation** | Visual workflow builder with triggers (score change, status change, lead created, time elapsed, tag added) and actions (send email, update status, notify Slack, sync CRM). | `pages/portal/AutomationPage.tsx`, `lib/automationEngine.ts` |
| **Analytics & Reporting** | Email performance, lead source analysis, ROI, AI effectiveness, team productivity. Materialized view for fast aggregation. Export to PDF/Excel/CSV/PPTX. | `pages/portal/AnalyticsPage.tsx`, `hooks/useAnalyticsData.ts` |
| **Lead Intelligence** | AI-powered company research, talking points generation, risk factor identification, outreach angle recommendations. Server-side scraping pipeline. | `pages/portal/LeadIntelligence.tsx`, `backend/src/research/` |
| **Social Media Scheduler** | Multi-platform publishing (LinkedIn, Facebook, Instagram) with OAuth, scheduling, click tracking, draft auto-save. | `pages/portal/SocialScheduler.tsx`, Edge Functions `social-*` |
| **Team Hub** | Kanban-style project management with boards, lists, cards, comments, member assignment, activity log, lead linking, and flow templates. | `pages/portal/team-hub/TeamHubPage.tsx`, `lib/teamHubApi.ts` |
| **Apollo Search** | Search Apollo.io for B2B leads by title, location, company, seniority, department. Direct import into lead database. | `pages/portal/ApolloSearchPage.tsx`, Edge Functions `apollo-*` |
| **Billing & Subscriptions** | Stripe-backed billing with three tiers (Starter/Growth/Scale). Credit-based usage model, invoicing, plan management. | `pages/portal/BillingPage.tsx`, Edge Functions `billing-*` |
| **Integration Hub** | Connect CRM (Salesforce, HubSpot, Pipedrive), email providers, calendar, Slack, Zapier. Webhook management, API key management. | `pages/portal/IntegrationHub.tsx`, `lib/integrations.ts` |
| **Image Generation** | AI-powered image generation for newsletters, pricing tables, product showcase. Brand color/logo customization. | Edge Function `image-gen` |
| **Admin Panel** | Platform KPIs, user management, AI operations, prompt lab, system health, audit logs, blog manager, pricing management, super-admin support console. | `pages/admin/*` |

---

## 3. User Roles & Permissions

### Application Roles

| Role | Scope | Capabilities |
|------|-------|--------------|
| **CLIENT** | Default role | Full portal access: leads, content, email, automation, analytics, billing, integrations, team hub |
| **ADMIN** | Platform administrator | Everything in CLIENT + admin panel: user management, AI operations, prompt lab, system health, audit logs, blog manager, pricing management |
| **SUPER_ADMIN** | Flag on ADMIN (`is_super_admin = true`) | Everything in ADMIN + support console (read-only/debug access to any user's data) |
| **GUEST** | Reserved (future) | Limited read access |

### Team Roles (within Team Hub)

| Role | Capabilities |
|------|-------------|
| **Owner** | Full control, delete team/flow, manage all members |
| **Admin** | Create/edit/delete lists, cards, members. Manage invites. |
| **Member** | Create/edit cards, add comments, move items |
| **Viewer** | Read-only access to flow data |

### Data Isolation

- **Row-Level Security (RLS)** on all user-facing tables
- Users can only access their own data (`client_id = auth.uid()` or `owner_id = auth.uid()`)
- Team data accessible to team members via `is_team_member()` helper function
- Secrets table (`sender_account_secrets`) has **no client-readable policy** — only server-side `SECURITY DEFINER` functions can read it

---

## 4. Core User Flows

### Flow 1: Trial Signup → Onboarding → First Value

```
Landing Page → TrialSignupPage (email + password)
  → ConfirmEmailPage (email verification)
  → AuthPage (login)
  → OnboardingPage (4 steps):
      Step 1: Select role (SDR/BDR, RevOps, Agency, Founder) + team size
      Step 2: Enter company info (name, website, industry)
      Step 3: Define primary goal (leads, scoring, outreach, visibility)
      Step 4: Processing animation → redirect to dashboard
  → ClientDashboard (first value)
```

### Flow 2: Lead Import → AI Scoring → Content → Send → Track

```
Import leads (CSV upload / Apollo search / manual entry)
  → Auto-scoring (0-100 scale based on engagement, company signals)
  → Select lead(s) → Generate personalized content (email/LinkedIn/blog)
  → Configure sender account → Send with tracking enabled
  → Monitor opens/clicks/replies in Analytics
  → Trigger follow-up workflows based on engagement
```

### Flow 3: Workflow Automation

```
Create automation (wizard-driven)
  → Define trigger (score_change, status_change, lead_created, time_elapsed, tag_added)
  → Add condition nodes (if score > 80, if status = Qualified, etc.)
  → Chain actions (send_email, update_status, add_tag, assign_user, sync_CRM, notify_slack)
  → Activate workflow
  → Monitor execution logs, conversion rate, ROI
```

### Flow 4: Billing & Upgrades

```
User starts on Starter plan (limited credits/contacts/emails)
  → Hits usage limit or wants advanced features
  → BillingPage → Select new plan
  → Stripe Checkout → Payment
  → Plan upgrades immediately, credits replenish
  → Subscription tracked in `subscriptions` table
```

### Pricing Tiers

| Feature | Starter ($29/mo) | Growth ($79/mo) | Scale ($199/mo) |
|---------|-------------------|-----------------|-----------------|
| AI Credits/month | 1,000 | 6,000 | 20,000 |
| Contacts | 1,000 | 10,000 | 50,000 |
| Emails/month | 2,000 | 15,000 | 40,000 |
| Seats | 1 | 3 | 10+ |
| Storage (MB) | 1,000 | 10,000 | 50,000 |
| Warm-up | Manual guidance | Automated | Advanced + inbox monitoring |
| AI Features | Basic | AI drafts, personalization | Advanced AI, API/webhooks |
| Annual Discount | 15% | 15% | 15% |

### Credit Costs (per operation)

| Operation | Credits |
|-----------|---------|
| Email sequence | 3 |
| Content generation | 2 |
| Lead research | 2 |
| Lead scoring | 1 |
| Dashboard insights | 1 |
| Blog content | 3 |
| Image generation | 2 |
| Batch generation | 5 |

**1 AI credit = 800 tokens.** Hard stop when credits reach 0.

---

## 5. Key Background Jobs

### BullMQ Workers (Node.js Backend)

| Worker | Queue | Concurrency | Rate Limit | Job Types |
|--------|-------|-------------|------------|-----------|
| **AI Worker** | `ai-generation` | 3 | 10 jobs/60s | `email_sequence`, `blog_content`, `content_generation` |
| **Data Worker** | `data-processing` | 2 | — | `bulk_import`, `lead_enrichment`, `analytics_refresh` |

#### AI Worker (`backend/src/workers/ai-queue.ts`)
- Receives job with `{ type, userId, params }`
- Updates `ai_jobs` table status to `processing`
- Calls Gemini API for generation
- Stores result + token count
- Updates status to `completed` or `failed`

#### Data Worker (`backend/src/workers/data-queue.ts`)
- **`bulk_import`**: Batch-inserts leads in chunks of 100, reports progress
- **`lead_enrichment`**: Runs `runResearchJob()` — fetches company website via `safeFetchHtml()`, extracts signals via Cheerio (title, description, headings, body text, emails, phones, social links), persists to `leads.knowledgeBase`
- **`analytics_refresh`**: Calls `refresh_email_analytics` RPC to refresh materialized view

### Supabase Edge Function Cron Jobs

| Job | Schedule | Edge Function | Purpose |
|-----|----------|---------------|---------|
| **Social Post Scheduler** | Every minute | `social-run-scheduler` | Finds due scheduled social posts, publishes to LinkedIn/Meta, updates status |
| **Scheduled Email Processor** | Every minute | `process-scheduled-emails` | Sends pending scheduled emails via appropriate provider, updates status |
| **Analytics Refresh** | Every 10 minutes | — (pg_cron SQL) | Refreshes `email_analytics_summary` materialized view |

### Email Warm-up

- **Starter tier**: Manual guidance (documentation/tips)
- **Growth tier**: Automated warm-up with configurable ramp schedule. Sends low-volume emails that gradually increase. Tracked via `warmup_daily_sent` on `sender_accounts` and `warmup_emails_sent` on `workspace_usage_counters`.
- **Scale tier**: Advanced warm-up + inbox health monitoring. `health_score` (0-100) and `last_health_check_at` on `sender_accounts`.

### Usage Tracking

| Counter | Table | Granularity | RPC |
|---------|-------|-------------|-----|
| AI credits used | `workspace_ai_usage` | Monthly | `increment_ai_usage` |
| Emails sent (workspace) | `workspace_usage_counters` | Daily + Monthly | `increment_workspace_usage` |
| Emails sent (per sender) | `sender_accounts.daily_sent_today` | Daily (auto-reset) | `increment_sender_daily_sent` |
| LinkedIn actions | `workspace_usage_counters` | Daily + Monthly | `increment_workspace_usage` |
| Outbound usage (legacy) | `outbound_usage` | Daily + Monthly | `increment_outbound_usage` |

---

## 6. Architecture Diagram

```
                    ┌────────────────────────────────────┐
                    │         Nginx (HTTP/2 + SSL)       │
                    │        scaliyo.com / :443           │
                    └──────────┬─────────────────────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
    ┌─────────▼──────┐  ┌─────▼──────┐  ┌──────▼──────────┐
    │  React SPA     │  │  Express   │  │  Supabase Edge  │
    │  (Vite build)  │  │  Backend   │  │  Functions      │
    │  Static files  │  │  :4000     │  │  (Deno Deploy)  │
    └────────┬───────┘  └──────┬─────┘  └───────┬─────────┘
             │                 │                 │
             │          ┌──────▼─────┐           │
             │          │   Redis    │           │
             │          │  (BullMQ)  │           │
             │          └──────┬─────┘           │
             │                 │                 │
             └────────┬────────┼────────┬────────┘
                      │        │        │
               ┌──────▼────────▼────────▼──────┐
               │      Supabase (Postgres)      │
               │   Auth / RLS / RPC / Storage  │
               └───────────────────────────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
    ┌─────────▼──────┐  ┌─────▼──────┐  ┌──────▼──────────┐
    │  Google Gemini │  │   Stripe   │  │  External APIs  │
    │  (AI/LLM)     │  │  (Billing) │  │  Apollo/Social  │
    └────────────────┘  └────────────┘  └─────────────────┘
```

---

## 7. Deployment

| Component | Detail |
|-----------|--------|
| **VPS** | Ubuntu 24.04 at `108.181.203.196` |
| **Web Server** | Nginx 1.24, HTTP/2, SSL via Let's Encrypt/Certbot |
| **CI/CD** | GitHub Actions on push to `master` |
| **Deploy Strategy** | Zero-downtime symlink swap (`/var/www/scaliyo/current` -> latest release) |
| **Releases** | `/var/www/scaliyo/releases/` (keeps last 5) |
| **Backend** | Node.js process managed by systemd |
| **Database** | Supabase managed Postgres |
| **Cache/Queue** | Redis (local) for BullMQ job queues and response caching |
