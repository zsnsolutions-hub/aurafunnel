# Scaliyo — Voice Agent Navigation Map & User Guide

> Platform: Scaliyo AI-Powered B2B Growth Intelligence
> URL: https://scaliyo.com
> Portal base path: /portal
> Last updated: 2026-02-27

---

## PLATFORM OVERVIEW

Scaliyo is an AI-powered B2B sales and marketing platform. Users manage leads, generate email campaigns with AI, schedule social media posts, build automations, view analytics reports, and collaborate with teammates — all from a single portal. The platform has two UI modes: **Simplified** (fewer controls, recommended for new users) and **Advanced** (full power-user interface).

---

## GLOBAL FEATURES

### Command Palette
- Open with **Ctrl+K**, **Cmd+K**, or press **/** from any page
- Search for any page, action, or setting by name
- Keyboard navigation: Arrow keys to browse, Enter to select, Escape to close

### UI Mode Toggle
- **Ctrl+Shift+S** toggles between Simplified and Advanced mode
- Also accessible from the sidebar footer toggle switch
- Also accessible from Command Palette → "Switch to Simplified/Advanced Mode"
- Simplified mode hides power-user panels and merges Workspace + Billing sections into Settings

### Keyboard Navigation Shortcuts
- **G then D** → Dashboard
- **G then L** → Leads
- **G then I** → Lead Insights
- **G then A** → AI Assistant
- **G then C** → Content Studio
- **G then S** → Tasks
- **G then N** → Reports
- **G then T** → AI Settings
- **G then H** → Integrations
- **G then B** → Billing
- **?** → Help Center

---

## SIDEBAR NAVIGATION STRUCTURE

```
PRIMARY
├── Home                        /portal
├── Leads                       /portal/leads
│   ├── Find Prospects          /portal/leads/apollo
│   └── Lead Insights           /portal/intelligence
├── Campaigns                   /portal/content
│   ├── Content Studio          /portal/content-studio
│   └── Automations             /portal/automation
├── Social                      /portal/social-scheduler
│   └── Blog Posts              /portal/blog
└── Reports                     /portal/analytics

TOOLS
├── AI Assistant                /portal/ai
└── Tasks                       /portal/strategy
    └── Board View              /portal/team-hub

WORKSPACE
├── Integrations                /portal/integrations
└── AI Settings                 /portal/model-training  (hidden in Simplified mode)

BILLING
├── Subscription                /portal/billing
└── Billing History             /portal/invoices

SETTINGS
├── Settings                    /portal/settings
├── User Manual                 /portal/manual
└── Help Center                 /portal/help
```

In **Simplified mode**, the Workspace and Billing groups are merged under Settings, and AI Settings is hidden from the sidebar (still accessible via URL or Command Palette).

---

## PAGE REFERENCE

---

### 1. Home (Dashboard)

**Route:** `/portal`
**Nav label:** Home
**What it does:** The main dashboard. Shows a real-time snapshot of the user's lead pipeline, AI performance, and quick-access actions.

**What users see:**
- Greeting banner with the user's name and time of day
- Quick stats: total leads, hot leads, conversion rate, AI credits remaining
- Quick action buttons: Add Lead, Import CSV, Generate Content, Run AI Analysis
- AI Insights panel with automated pipeline observations
- Lead segmentation breakdown
- Live activity feed
- Email performance summary
- Onboarding activation checklist (for new users)

**In Advanced mode, also shows:** Pipeline health gauge, lead velocity chart, goals tracker, engagement analytics, revenue forecast, and AI deep analysis panel.

**Common user intents:**
- "Take me to my dashboard" → `/portal`
- "How many leads do I have?" → Dashboard quick stats
- "Show me my AI credits" → Dashboard stats or sidebar footer gauge
- "Add a new lead" → Dashboard quick actions → Add Lead

---

### 2. Leads

**Route:** `/portal/leads`
**Nav label:** Leads
**What it does:** The master list of all leads. Users browse, search, filter, and take bulk actions on their lead pipeline.

**What users see:**
- Total lead count in the header
- Search bar for finding leads by name, email, or company
- Two view modes: **Table** (list view) and **Kanban** (pipeline board grouped by funnel stage)
- Collapsible filter panel: filter by stage, score range, tags, date, or source
- Individual lead actions: view profile, edit, advance stage, send email, log activity
- Bulk actions: send campaign, assign, change status, tag, export, email, start workflow

**Key actions:**
- "Add Lead" button to create a lead manually
- "Import CSV" button to bulk-import from a file
- Star ratings show lead quality (1–5 stars based on score)
- Color-coded dots indicate funnel stage

**Common user intents:**
- "Show me my leads" → `/portal/leads`
- "I want to add a new lead" → Add Lead button on Leads page
- "Import leads from a CSV file" → Import CSV on Leads page
- "Show me my hot leads" → Filter by score or tag "Hot Lead"
- "Switch to kanban view" → Toggle to Kanban mode on Leads page

---

### 3. Find Prospects

**Route:** `/portal/leads/apollo`
**Nav label:** Find Prospects (under Leads)
**What it does:** A B2B contact search tool powered by the Apollo database. Users search for prospects by job title, company, industry, and more, then import selected contacts into their lead pipeline.

**What users see:**
- Search filters: job title, keywords, location, company location, employee count range, domain, industry, seniority, department, funding stage, revenue range, has-email toggle
- Quick-pick chips for common titles (CEO, CTO, VP Sales, Founder), industries (SaaS, FinTech), and locations (US, UK, Germany)
- Results list with contact cards showing name, title, company, email, and LinkedIn
- Select individual contacts or use bulk select
- "Import Selected" button adds chosen contacts to the Leads pipeline

**Common user intents:**
- "Find new prospects" → `/portal/leads/apollo`
- "Search for CTOs in SaaS companies" → Find Prospects with title and industry filters
- "Import these contacts into my pipeline" → Select + Import on Find Prospects

---

### 4. Lead Insights

**Route:** `/portal/intelligence`
**Nav label:** Lead Insights (under Leads)
**What it does:** AI-powered lead scoring and behavioral analytics. Users analyze which leads are most likely to convert and understand the signals behind each score.

**What users see:**
- Lead selector to pick a specific lead for deep analysis
- AI scoring factors with weight display: Email Engagement (25%), Website Activity (20%), Company Fit (18%), Social Signals (15%), Content Consumption (12%), Timing Patterns (10%)
- Score history chart showing a 56-day trend line
- Score classification buckets: Hot, Warm, Cool, Cold
- Three analysis tabs:
  - **Overview** — Score breakdown, pipeline distribution, scoring trends
  - **Engagement** — Email open/click heatmap by day of week and hour
  - **Signals** — Behavioral signal indicators and trigger events

**In Advanced mode, also shows:** Compare mode for side-by-side lead analysis, signal timeline chart.

**Common user intents:**
- "Show me lead insights" → `/portal/intelligence`
- "What's my best lead right now?" → Lead Insights → sort by score
- "Why is this lead scored high?" → Lead Insights → select lead → Overview tab
- "When do my leads open emails?" → Lead Insights → Engagement tab → heatmap

---

### 5. AI Assistant

**Route:** `/portal/ai`
**Nav label:** AI Assistant
**What it does:** A conversational AI chat interface connected to the user's lead and campaign data. Users ask natural-language questions and get data-grounded answers, action plans, and content suggestions.

**What users see:**
- Chat message thread with the AI
- Text input bar with send button
- Four AI persona modes (selectable from the top bar):
  - **Analyst** — Data-driven insights and metrics
  - **Strategist** — Action plans and priorities
  - **Coach** — Guidance and best practices
  - **Creative** — Content ideas and messaging
- Suggestion chips above the input (categorized: Analyze, Generate, Strategy, Report)
- Quick-reference sidebar showing top leads
- Message actions: copy, pin, export

**Common user intents:**
- "Open the AI assistant" → `/portal/ai`
- "Chat with AI about my pipeline" → AI Assistant
- "Ask AI to analyze my leads" → AI Assistant → Analyst mode
- "Get content ideas from AI" → AI Assistant → Creative mode
- "I need a strategy for my top leads" → AI Assistant → Strategist mode

---

### 6. Campaigns

**Route:** `/portal/content`
**Nav label:** Campaigns
**What it does:** A 5-step guided wizard for creating AI-generated email campaigns. Users select targets, configure tone and goals, generate content with AI, review and edit, then send or schedule.

**What users see — 5 wizard steps:**
1. **Start** — Choose content type and select target audience from leads
2. **Parameters** — Set tone, length, content focus (Problem→Solution, Features→Benefits, Story→CTA, Data→Insight), and goal (Demo, Download, Newsletter, Meeting, Trial, Webinar)
3. **Generate** — AI generates the campaign (animated progress: Analyzing → Crafting → Personalizing → Optimizing → Finalizing)
4. **Review** — Edit content blocks, create A/B variants, use writing assistant, add CTA buttons, generate images
5. **Deliver** — Send immediately, schedule for later, or save as draft; configure A/B test parameters; view calendar

**Key shortcuts:** Ctrl+G to generate (step 2), keys 1–5 to jump between steps, W to toggle writing assistant (step 4)

**Common user intents:**
- "Create a new email campaign" → `/portal/content`
- "Generate AI content for my leads" → Campaigns wizard
- "I want to write an outreach email" → Campaigns → Start step
- "Schedule an email campaign" → Campaigns → Deliver step

---

### 7. Content Studio

**Route:** `/portal/content-studio`
**Nav label:** Content Studio (under Campaigns)
**What it does:** A rich multi-variant editor for creating emails, LinkedIn posts, and sales proposals with AI suggestions, analytics, and A/B testing.

**What users see:**
- Content mode switcher (3 modes):
  - **Email Sequence** — Multi-step email drip with variant tabs per step
  - **LinkedIn Post** — Social post composer with character count
  - **Sales Proposal** — Full proposal with section builder
- Four view tabs:
  - **Editor** — Write and edit content directly
  - **Preview** — Rendered preview of the content
  - **Analytics** — Variant comparison (open rate, click rate, reply rate, conversion)
  - **Templates** — Pre-built template library to start from
- AI suggestions panel for word improvements, personalization, and CTA optimization
- A/B test configuration panel
- Image generator and CTA button builder

**Common user intents:**
- "Open the content editor" → `/portal/content-studio`
- "Write a LinkedIn post" → Content Studio → LinkedIn mode
- "Create a sales proposal" → Content Studio → Proposal mode
- "Compare my email variants" → Content Studio → Analytics tab
- "Use a template" → Content Studio → Templates tab

---

### 8. Automations

**Route:** `/portal/automation`
**Nav label:** Automations (under Campaigns)
**What it does:** A visual workflow builder for creating automated multi-step sequences that trigger actions on leads — like sending follow-up emails, updating scores, or assigning tasks — without writing code.

**What users see:**
- KPI stats bar: active workflows, total executions, success rate, leads enrolled
- Workflow list with status badges (draft, active, paused)
- "Create New" button launches a 4-step wizard:
  1. Configure trigger and name the workflow
  2. Build the workflow on a visual canvas (drag and connect nodes)
  3. Select target leads
  4. Review and activate
- Visual workflow canvas with draggable nodes
- Sidebar panels: execution log, node analytics, health monitor, ROI calculator

**Common user intents:**
- "Set up an automation" → `/portal/automation`
- "Create a follow-up email workflow" → Automations → Create New
- "Show my active workflows" → Automations list
- "How are my automations performing?" → Automations → stats bar or execution log

---

### 9. Social

**Route:** `/portal/social-scheduler`
**Nav label:** Social
**What it does:** A social media publishing hub for composing posts, attaching media, selecting platforms, and publishing immediately or scheduling for later.

**What users see — 3 tabs:**
- **Compose** — Write a post, pick platforms (Facebook, Instagram, LinkedIn), upload media, add a link with click tracking, set schedule or publish now, preview the post
- **History** — Published and scheduled post log with status indicators
- **Accounts** — Connect or disconnect social accounts via Meta OAuth and LinkedIn OAuth

**Common user intents:**
- "Schedule a social media post" → `/portal/social-scheduler`
- "Post to LinkedIn" → Social → Compose → select LinkedIn
- "Connect my Facebook account" → Social → Accounts tab
- "Show my scheduled posts" → Social → History tab

---

### 10. Blog Posts

**Route:** `/portal/blog`
**Nav label:** Blog Posts (under Social)
**What it does:** A markdown editor for drafting blog posts. Posts are submitted for admin review before publishing to the public Scaliyo blog.

**What users see:**
- Draft list with status badges (draft, pending review, published)
- Create new post form: title, content (markdown), slug, category, featured image, excerpt, SEO settings
- AI writing modes: Full Draft, Outline, Improve, Expand
- Tone selector: Professional, Conversational, Technical, Storytelling, Persuasive
- Content templates: How-To Guide, Case Study, Industry Insight, Listicle, Product Comparison
- Editor sub-tabs: Write and Preview
- SEO score panel (title length, keywords, content length, image, readability)
- Social sharing buttons and AI caption generator

**Common user intents:**
- "Write a blog post" → `/portal/blog`
- "Create a new draft" → Blog Posts → New Post
- "Generate a blog draft with AI" → Blog Posts → AI mode: Full Draft
- "Check my SEO score" → Blog Posts → SEO panel

---

### 11. Reports

**Route:** `/portal/analytics`
**Nav label:** Reports
**What it does:** A business intelligence dashboard and custom report builder. Users view real-time pipeline metrics, build reports, set up automated delivery, and configure smart alerts.

**What users see:**
- Date range presets: Last 7, 14, 30, or 90 days
- Available report types:
  - Performance Overview (pipeline health, conversion rates, scoring trends)
  - Lead Source Analysis
  - ROI & Cost Analysis (cost per lead, revenue attribution)
  - AI Effectiveness (scoring accuracy, content performance)
  - Email Campaign Report (open, click, reply rates)
  - Team Productivity (activity per user, task completion)
- Report builder modes: Quick (pre-configured) and Custom (3-step wizard: select type → configure metrics → preview/export)
- Export formats: PDF, Excel, CSV, PowerPoint
- Smart alerts: Hot Lead Detected (score > 80), Lead Stagnation Warning (no activity > 14 days), custom alert rules with email and in-app notifications

**Common user intents:**
- "Show me my analytics" → `/portal/analytics`
- "Run a performance report" → Reports → Performance Overview
- "Export a report as PDF" → Reports → report builder → Export → PDF
- "Set up an alert for hot leads" → Reports → Alerts → Hot Lead Detected
- "How are my email campaigns doing?" → Reports → Email Campaign Report

---

### 12. Tasks

**Route:** `/portal/strategy`
**Nav label:** Tasks
**What it does:** A task and notes management workspace for organizing follow-up actions, internal notes, and team assignments related to leads and campaigns.

**What users see — 3 tabs:**
- **Board** — Kanban board of tasks organized by status columns (To-Do, In Progress, Done, etc.) with drag-and-drop
- **Notes** — Rich text notes filterable by lead or author
- **Team** — Team member list with roles, invite new members

**Task fields:** Title, priority (Urgent, High, Normal, Low), deadline, status, assigned team member, linked lead, card color

**Common user intents:**
- "Show my tasks" → `/portal/strategy`
- "Create a new task" → Tasks → Add Task button
- "Show tasks assigned to me" → Tasks → Board tab
- "Add a note about a lead" → Tasks → Notes tab
- "Invite a teammate" → Tasks → Team tab

---

### 13. Board View

**Route:** `/portal/team-hub`
**Nav label:** Board View (under Tasks)
**What it does:** A multi-board project management workspace similar to Trello. Users create named "Flows" — each Flow is a standalone Kanban board with lists and cards for team collaboration.

**What users see:**
- Flow dashboard listing all boards with stats (item count, recent activity)
- Sort flows by: Recent, Name, or Items
- Search flows by name
- Create new Flow from blank or from a template
- Click a Flow to open the full board with lanes (columns) and cards (items)
- Card fields: title, description, priority, labels, assigned members, due date
- Members panel with role-based access (Owner, Admin, Member)
- Activity feed showing who did what

**Common user intents:**
- "Open my project boards" → `/portal/team-hub`
- "Create a new board" → Board View → Create Flow
- "Show me the marketing flow" → Board View → search or click the flow

---

### 14. Integrations

**Route:** `/portal/integrations`
**Nav label:** Integrations
**What it does:** The central hub for connecting external tools, managing API keys, and configuring webhooks.

**What users see:**
- Integration cards grid with connect/disconnect toggles
- Category filter tabs: All, CRM, Marketing, Comms, Analytics, Email, Payment
- Supported integrations: Salesforce, HubSpot, Mailchimp, SendGrid, Gmail SMTP, Custom SMTP, Zapier, Slack, and more
- API Keys manager: create, view, and revoke API keys with read or read/write permissions
- Webhooks manager: create webhook URLs, select event triggers, monitor success rates
- Sync history log with bidirectional record tracking
- Email provider setup wizard (SMTP, SendGrid, Mailchimp)

**Common user intents:**
- "Connect my CRM" → `/portal/integrations` → CRM category
- "Set up email sending" → Integrations → Email category → provider wizard
- "Create an API key" → Integrations → API Keys section
- "Add a webhook" → Integrations → Webhooks section
- "Check my sync history" → Integrations → Sync History panel

---

### 15. AI Settings

**Route:** `/portal/model-training`
**Nav label:** AI Settings (hidden in Simplified mode sidebar, still accessible via URL or Command Palette)
**What it does:** The prompt configuration panel for the AI engine. Users browse and customize the system prompts that power every AI feature in Scaliyo, and test changes live.

**What users see:**
- Left panel: prompt list grouped by category — sales outreach, analytics, email, content, lead research, blog, social, automation, strategy
- Right panel tabs:
  - **Test** — Run the selected prompt with test inputs and see live AI output
  - **History** — View previous test runs and prompt version history
- Prompt fields: display name, description, system instruction, prompt template, temperature slider, top-p slider, version number, active toggle
- Actions: edit prompts, test with sample data, restore previous versions, reset to system default

**Common user intents:**
- "Customize my AI prompts" → `/portal/model-training`
- "Change the tone of AI emails" → AI Settings → select email prompt → edit
- "Test a prompt" → AI Settings → select prompt → Test tab
- "Reset AI to default settings" → AI Settings → Reset to Default

---

### 16. Subscription

**Route:** `/portal/billing`
**Nav label:** Subscription (under Billing)
**What it does:** Plan management where users view their current tier, compare plans, upgrade or downgrade, and monitor AI credits and resource usage.

**What users see:**
- Current plan display with tier name and limits
- Plan comparison cards: Starter → Growth → Pro → Agency
- Upgrade/downgrade buttons (opens Stripe Checkout)
- Usage meters: AI Actions (credits used vs. total), contacts used, storage used, email credits
- Credit usage bar chart (30-day history)
- Feature comparison table across tiers

**Common user intents:**
- "Check my subscription" → `/portal/billing`
- "Upgrade my plan" → Subscription → Upgrade button
- "How many AI credits do I have left?" → Subscription → usage meter or sidebar gauge
- "Compare plans" → Subscription → plan comparison cards

---

### 17. Billing History

**Route:** `/portal/invoices`
**Nav label:** Billing History (under Billing)
**What it does:** A Stripe-powered invoice management tool. Users create, send, track, and manage invoices for their own clients, and define reusable service packages.

**What users see — 2 tabs:**
- **Invoices** — Invoice list with status filter (All, Open, Paid, Void), preview panel, resend and void actions
- **Packages** — Reusable service packages with name, description, line items, and pricing for fast invoice creation

**Key actions:** Create new invoice, filter by status, resend invoice email, void invoice, preview invoice, create/edit/delete packages, copy invoice link

**Common user intents:**
- "Show my invoices" → `/portal/invoices`
- "Create a new invoice" → Billing History → Create Invoice
- "Resend an invoice" → Billing History → select invoice → Resend
- "Set up a service package" → Billing History → Packages tab

---

### 18. Settings

**Route:** `/portal/settings`
**Nav label:** Settings
**What it does:** The user account settings hub for managing profile, business info, notifications, preferences, API keys, security, and pipeline colors.

**What users see — 7 tabs:**
- **Profile** — Name, email, avatar upload, delete account option
- **Business Profile** — Company name, website, industry, size, location, social links; AI-powered business analysis that auto-fills fields from a website URL
- **Notifications** — Email and in-app notification toggles per event type
- **Preferences** — Dashboard layout and display preferences
- **API Keys** — Create and manage personal API keys (read or read-write permissions)
- **Security** — Change password, two-factor authentication settings
- **Pipeline Colors** — Custom color themes for each funnel stage

Tabs are URL-addressable via query parameter (e.g., `/portal/settings?tab=security`).

**Common user intents:**
- "Go to settings" → `/portal/settings`
- "Update my profile" → Settings → Profile tab
- "Change my password" → Settings → Security tab
- "Set up my business profile" → Settings → Business Profile tab
- "Turn off email notifications" → Settings → Notifications tab
- "Customize my pipeline colors" → Settings → Pipeline Colors tab
- "Create an API key" → Settings → API Keys tab

---

### 19. Help Center

**Route:** `/portal/help`
**Nav label:** Help Center (under Settings)
**What it does:** Self-service support hub with troubleshooting guides, optimization tips, support ticket submission, training resources, keyboard shortcuts, and pro tips.

**What users see — 6 tabs:**
- **Troubleshooting** — Step-by-step resolution guides for common issues (CSV import errors, AI content failures, lead scoring problems, slow loading, email delivery issues)
- **Optimization** — Tips to improve pipeline performance, AI accuracy, and workflow efficiency
- **Get Support** — Submit a support request or contact the team; see support stats (average resolution time, satisfaction rate)
- **Training** — Video-style training modules grouped by skill level
- **Quick Reference** — All keyboard shortcuts organized by section (Global, Navigation, Lead Management, AI Assistant)
- **Pro Tips** — Power-user tips and best practices for maximizing the platform

**Common user intents:**
- "I need help" → `/portal/help`
- "My CSV import isn't working" → Help Center → Troubleshooting tab
- "Show me keyboard shortcuts" → Help Center → Quick Reference tab
- "Contact support" → Help Center → Get Support tab
- "How do I improve my lead scoring?" → Help Center → Optimization tab

---

### 20. User Manual

**Route:** `/portal/manual`
**Nav label:** User Manual (under Settings)
**What it does:** The complete reference manual for the Scaliyo platform. Users read structured documentation, track their reading progress, and explore topics from getting started through advanced features.

**What users see:**
- Sidebar with 18 navigable sections
- 6 category groups with article counts and estimated reading times:
  1. **Getting Started** — 7 articles, ~15 minutes
  2. **Core Features** — 18 articles, ~45 minutes
  3. **Automation & Team** — 12 articles, ~30 minutes
  4. **Advanced** — 14 articles, ~35 minutes
  5. **Templates & Strategy** — 8 articles, ~20 minutes
  6. **Competitive Intel** — 15 articles, ~25 minutes
- Reading progress tracker: visited sections are tracked with completion percentage per category
- AI-generated personalized reading recommendation based on coverage

**Common user intents:**
- "Show me the user manual" → `/portal/manual`
- "How do I set up automations?" → User Manual → Automation & Team section
- "Getting started guide" → User Manual → Getting Started section

---

## INTENT-TO-PAGE QUICK REFERENCE

This table maps common natural-language user requests to the correct page and action.

| User says | Go to | Action |
|-----------|-------|--------|
| "Take me to my dashboard" | `/portal` | — |
| "Show my leads" | `/portal/leads` | — |
| "Add a new lead" | `/portal/leads` | Click "Add Lead" |
| "Import leads from CSV" | `/portal/leads` | Click "Import CSV" |
| "Find new prospects" | `/portal/leads/apollo` | — |
| "Search for CEOs" | `/portal/leads/apollo` | Set title filter to CEO |
| "Show lead insights" | `/portal/intelligence` | — |
| "Which leads are hottest?" | `/portal/intelligence` | Sort by score descending |
| "Talk to the AI" | `/portal/ai` | — |
| "Ask AI for strategy advice" | `/portal/ai` | Switch to Strategist mode |
| "Create an email campaign" | `/portal/content` | Start wizard |
| "Write a LinkedIn post" | `/portal/content-studio` | Switch to LinkedIn mode |
| "Create a sales proposal" | `/portal/content-studio` | Switch to Proposal mode |
| "Set up an automation" | `/portal/automation` | Click "Create New" |
| "Schedule a social post" | `/portal/social-scheduler` | Compose tab |
| "Connect Facebook" | `/portal/social-scheduler` | Accounts tab |
| "Write a blog post" | `/portal/blog` | Click "New Post" |
| "Show my analytics" | `/portal/analytics` | — |
| "Run a performance report" | `/portal/analytics` | Select Performance Overview |
| "Export report as PDF" | `/portal/analytics` | Report builder → Export → PDF |
| "Show my tasks" | `/portal/strategy` | — |
| "Create a task" | `/portal/strategy` | Click "New Task" |
| "Open project boards" | `/portal/team-hub` | — |
| "Connect my CRM" | `/portal/integrations` | CRM category |
| "Set up email sending" | `/portal/integrations` | Email category |
| "Create an API key" | `/portal/integrations` | API Keys section |
| "Customize AI prompts" | `/portal/model-training` | — |
| "Check my subscription" | `/portal/billing` | — |
| "Upgrade my plan" | `/portal/billing` | Click Upgrade |
| "How many credits left?" | `/portal/billing` | Usage meter |
| "Create an invoice" | `/portal/invoices` | Click "Create Invoice" |
| "Go to settings" | `/portal/settings` | — |
| "Change my password" | `/portal/settings?tab=security` | — |
| "Update business profile" | `/portal/settings?tab=business_profile` | — |
| "I need help" | `/portal/help` | — |
| "Contact support" | `/portal/help` | Get Support tab |
| "Show keyboard shortcuts" | `/portal/help` | Quick Reference tab |
| "Read the manual" | `/portal/manual` | — |
| "Switch to simplified mode" | Any page | Ctrl+Shift+S or sidebar toggle |
| "Search for something" | Any page | Ctrl+K or / |

---

## ROUTE TABLE (machine-readable)

| Route | Page Title | Parent |
|-------|-----------|--------|
| `/portal` | Home | — |
| `/portal/leads` | Leads | — |
| `/portal/leads/apollo` | Find Prospects | Leads |
| `/portal/leads/:leadId` | Lead Profile | Leads |
| `/portal/intelligence` | Lead Insights | Leads |
| `/portal/content` | Campaigns | — |
| `/portal/content-studio` | Content Studio | Campaigns |
| `/portal/automation` | Automations | Campaigns |
| `/portal/social-scheduler` | Social | — |
| `/portal/blog` | Blog Posts | Social |
| `/portal/analytics` | Reports | — |
| `/portal/ai` | AI Assistant | — |
| `/portal/strategy` | Tasks | — |
| `/portal/team-hub` | Board View | Tasks |
| `/portal/integrations` | Integrations | — |
| `/portal/model-training` | AI Settings | — |
| `/portal/billing` | Subscription | — |
| `/portal/invoices` | Billing History | — |
| `/portal/settings` | Settings | — |
| `/portal/manual` | User Manual | Settings |
| `/portal/help` | Help Center | Settings |
