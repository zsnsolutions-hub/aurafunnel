# DATA_MODEL.md — Scaliyo Database Schema

> Generated 2026-03-02. Supabase PostgreSQL with Row-Level Security. 42 migration files, 40+ tables.

---

## Table of Contents

1. [Core Tables](#1-core-tables)
2. [Lead Management](#2-lead-management)
3. [Email System](#3-email-system)
4. [AI Email Writer Queue](#4-ai-email-writer-queue)
5. [Automation & Workflows](#5-automation--workflows)
6. [AI & Prompts](#6-ai--prompts)
7. [Integrations & Webhooks](#7-integrations--webhooks)
8. [Invoicing](#8-invoicing)
9. [Social Media](#9-social-media)
10. [Team Hub (Strategy)](#10-team-hub-strategy)
11. [Team Hub (Boards)](#11-team-hub-boards)
12. [Lead Import](#12-lead-import)
13. [Sender Accounts & Usage](#13-sender-accounts--usage)
14. [Blog & Content](#14-blog--content)
15. [Miscellaneous](#15-miscellaneous)
16. [Functions & Triggers](#16-functions--triggers)
17. [Materialized Views](#17-materialized-views)
18. [Storage Buckets](#18-storage-buckets)
19. [pg_cron Jobs](#19-pg_cron-jobs)
20. [Event & Audit Tables](#20-event--audit-tables)
21. [Entity Relationship Diagram](#21-entity-relationship-diagram)
22. [Improvement Opportunities](#22-improvement-opportunities)

---

## 1. Core Tables

### profiles
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK, FK → auth.users(id) ON DELETE CASCADE | |
| email | TEXT | UNIQUE NOT NULL | |
| name | TEXT | | |
| role | user_role | DEFAULT 'CLIENT' | Enum: ADMIN, CLIENT, GUEST |
| status | TEXT | DEFAULT 'active' | |
| credits_total | INTEGER | DEFAULT 500 | Plan credits |
| credits_used | INTEGER | DEFAULT 0 | |
| plan | TEXT | DEFAULT 'Starter' | Starter, Growth, Scale |
| createdAt | TIMESTAMPTZ | NOT NULL DEFAULT now() | Legacy naming |
| updated_at | TIMESTAMPTZ | DEFAULT now() | |
| ui_preferences | JSONB | DEFAULT '{}' | Simplified/advanced mode |
| is_super_admin | BOOLEAN | | Admin flag |

**RLS**: Public SELECT; UPDATE own; co-members can view.
**Trigger**: `handle_new_user()` creates profile + subscription on `auth.users` INSERT.

### subscriptions
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| user_id | UUID | UNIQUE NOT NULL FK → auth.users |
| plan | TEXT | DEFAULT 'Starter' |
| status | TEXT | DEFAULT 'active' | active, past_due, canceled |
| expires_at | TIMESTAMPTZ | DEFAULT now() + 30 days |
| created_at | TIMESTAMPTZ | DEFAULT now() |

**Index**: `idx_subscriptions_user_id`
**RLS**: SELECT own.

### audit_logs
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| user_id | UUID | FK → auth.users ON DELETE SET NULL |
| action | TEXT | NOT NULL |
| details | TEXT | |
| created_at | TIMESTAMPTZ | DEFAULT now() |
| team_id | UUID | FK → teams (strategy hub) |
| entity_type | TEXT | card, list, board (v2) |
| entity_id | UUID | |
| workspace_id | UUID | |
| payload | JSONB | |

**Indexes**: user_id, created_at DESC, (entity_type, entity_id), workspace_id, action, (user_id, created_at DESC)
**RLS**: Own + admin + team member access.
**Writers**: apollo-import, import_leads_batch, teamhub_mirror_activity_to_audit trigger.

---

## 2. Lead Management

### leads
| Column | Type | Constraints | Source |
|--------|------|-------------|--------|
| id | UUID | PK | core |
| client_id | UUID | NOT NULL FK → auth.users | core |
| email | TEXT | | core (legacy) |
| primary_email | TEXT | | importer |
| emails | TEXT[] | DEFAULT '{}' | importer |
| name | TEXT | | core (legacy) |
| first_name | TEXT | | importer |
| last_name | TEXT | | importer |
| company | TEXT | | core |
| title | TEXT | | importer |
| phone | TEXT | | core |
| primary_phone | TEXT | | importer |
| phones | TEXT[] | DEFAULT '{}' | importer |
| website | TEXT | | core |
| industry | TEXT | | importer |
| company_size | TEXT | | importer |
| linkedin_url | TEXT | | importer |
| location | TEXT | | importer |
| source | TEXT | DEFAULT 'manual' | importer |
| status | TEXT | DEFAULT 'new' | core | New, Contacted, Qualified, Converted, Lost |
| score | INTEGER | DEFAULT 0 | core | 0-100 |
| notes | TEXT | | core |
| tags | TEXT[] | DEFAULT '{}' | core |
| lastActivity | TEXT | | core (legacy TEXT) |
| last_activity | TIMESTAMPTZ | DEFAULT now() | importer |
| insights | TEXT | | core |
| knowledgeBase | JSONB | DEFAULT NULL | core |
| import_batch_id | UUID | FK → import_batches | importer |
| imported_at | TIMESTAMPTZ | | importer |
| custom_fields | JSONB | DEFAULT '{}' | importer |
| created_at | TIMESTAMPTZ | DEFAULT now() | core |
| updated_at | TIMESTAMPTZ | DEFAULT now() | importer |

**Indexes**:
- `idx_leads_client_id` ON client_id
- `idx_leads_score` ON score DESC
- `idx_leads_client_email` UNIQUE ON (client_id, lower(primary_email)) WHERE NOT NULL
- `idx_leads_client_linkedin` UNIQUE ON (client_id, lower(linkedin_url)) WHERE NOT NULL
- `idx_leads_client_created` ON (client_id, created_at DESC)

**RLS**: Own leads (client_id = uid); admin view all.

### lead_stage_colors
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| owner_id | UUID | NOT NULL FK → auth.users |
| stage | TEXT | NOT NULL |
| color_token | TEXT | NOT NULL |
| updated_at | TIMESTAMPTZ | |

**Unique**: (owner_id, stage)

### lead_color_overrides
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| owner_id | UUID | NOT NULL FK → auth.users |
| lead_id | UUID | NOT NULL FK → leads |
| color_token | TEXT | NOT NULL |

**Unique**: (owner_id, lead_id)

---

## 3. Email System

### email_templates
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| owner_id | UUID | FK → auth.users (NULL = system) |
| name | TEXT | NOT NULL |
| category | TEXT | NOT NULL | welcome, follow_up, case_study, demo_invite, nurture, custom |
| subject_template | TEXT | NOT NULL DEFAULT '' |
| body_template | TEXT | NOT NULL DEFAULT '' |
| is_default | BOOLEAN | DEFAULT false |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

**Indexes**: owner_id, category
**Seed data**: 6 default templates.

### email_messages
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| owner_id | UUID | FK → auth.users |
| lead_id | UUID | FK → leads |
| provider | TEXT | sendgrid, smtp, gmail |
| provider_message_id | TEXT | From provider response |
| subject | TEXT | |
| to_email | TEXT | |
| from_email | TEXT | |
| status | TEXT | sent, failed |
| track_opens | BOOLEAN | |
| track_clicks | BOOLEAN | |
| created_at | TIMESTAMPTZ | |

**Index**: `idx_email_messages_owner_created` ON (owner_id, created_at DESC)
**Writers**: `send-email` edge function.

### email_links
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| message_id | UUID | FK → email_messages |
| destination_url | TEXT | Original URL |
| link_label | TEXT | Anchor text |
| link_index | INTEGER | Position in email |
| click_count | INTEGER | Aggregate clicks |

**Index**: `idx_email_links_message_clicks` ON (message_id, click_count DESC)
**Writers**: `send-email` edge function.

### email_events
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| message_id | UUID | FK → email_messages |
| link_id | UUID | FK → email_links (clicks only) |
| event_type | TEXT | open, click, delivered, bounced, unsubscribe, spam_report |
| is_bot | BOOLEAN | Bot detection flag |
| ip_address | TEXT | |
| user_agent | TEXT | |
| metadata | JSONB | Provider-specific data |
| created_at | TIMESTAMPTZ | |

**Index**: `idx_email_events_message_type_bot` ON (message_id, event_type, is_bot)
**Writers**: `email-track` (opens/clicks), `webhooks-sendgrid`, `webhooks-mailchimp` via `record_email_event()` RPC.

### scheduled_emails
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| owner_id | UUID | FK → auth.users |
| lead_id | UUID | FK → leads |
| to_email | TEXT | |
| subject | TEXT | |
| html_body | TEXT | |
| from_email | TEXT | |
| provider | TEXT | |
| scheduled_at | TIMESTAMPTZ | When to send |
| sent_at | TIMESTAMPTZ | When actually sent |
| block_index | INTEGER | Step number |
| sequence_id | TEXT | Run ID for grouping |
| status | TEXT | pending, processing, sent, failed, cancelled |
| error_message | TEXT | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

**Writers**: `finalize_email_sequence_run()` RPC, `scheduleEmailBlock()` client, `process-scheduled-emails` edge fn.

### email_provider_configs
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| owner_id | UUID | FK → auth.users |
| provider | TEXT | sendgrid, mailchimp, smtp, gmail |
| is_active | BOOLEAN | |
| api_key | TEXT | |
| smtp_host | TEXT | |
| smtp_port | INTEGER | |
| smtp_user | TEXT | |
| smtp_pass | TEXT | |
| from_email | TEXT | |
| from_name | TEXT | |
| webhook_key | TEXT | |

**Unique**: (owner_id, provider)
**RLS**: Own only; support session read access.

---

## 4. AI Email Writer Queue

### email_sequence_runs
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| owner_id | UUID | NOT NULL FK → auth.users |
| workspace_id | UUID | |
| status | TEXT | DEFAULT 'pending' | pending, processing, completed, failed, cancelled |
| lead_count | INT | DEFAULT 0 |
| step_count | INT | DEFAULT 0 |
| items_total | INT | DEFAULT 0 |
| items_done | INT | DEFAULT 0 |
| items_failed | INT | DEFAULT 0 |
| sequence_config | JSONB | DEFAULT '{}' | tone, goal, fromEmail, provider, businessProfile |
| started_at | TIMESTAMPTZ | |
| completed_at | TIMESTAMPTZ | |
| error_summary | TEXT | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

**Indexes**: owner_id; status WHERE IN (pending, processing)
**RLS**: Own SELECT/INSERT/UPDATE; service_role full.

### email_sequence_run_items
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| run_id | UUID | NOT NULL FK → email_sequence_runs CASCADE |
| lead_id | UUID | FK → leads SET NULL |
| step_index | INT | DEFAULT 0 |
| status | TEXT | DEFAULT 'pending' | pending, writing, written, failed |
| lead_email | TEXT | NOT NULL |
| lead_name | TEXT | |
| lead_company | TEXT | |
| lead_context | JSONB | DEFAULT '{}' | Denormalized lead snapshot |
| template_subject | TEXT | NOT NULL |
| template_body | TEXT | NOT NULL |
| ai_subject | TEXT | Gemini output |
| ai_body_html | TEXT | Gemini output |
| delay_days | INT | DEFAULT 0 |
| attempt_count | INT | DEFAULT 0 |
| error_message | TEXT | |
| locked_until | TIMESTAMPTZ | 5-min write lock |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

**Indexes**: run_id; (status, locked_until) WHERE IN (pending, writing); (run_id, status)
**RLS**: Own via run subquery; service_role full.

---

## 5. Automation & Workflows

### workflows
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| user_id | UUID | NOT NULL FK → auth.users |
| team_id | UUID | |
| name | TEXT | DEFAULT 'Untitled Workflow' |
| description | TEXT | DEFAULT '' |
| status | TEXT | DEFAULT 'draft' | active, paused, draft |
| nodes | JSONB | DEFAULT '[]' | React Flow node definitions |
| stats | JSONB | DEFAULT '{...}' | leadsProcessed, conversionRate, timeSavedHrs, roi |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

**Trigger**: `update_workflows_updated_at` auto-sets updated_at.

### workflow_executions
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| workflow_id | UUID | NOT NULL FK → workflows CASCADE |
| user_id | UUID | NOT NULL FK → auth.users |
| lead_id | UUID | FK → leads SET NULL |
| status | TEXT | DEFAULT 'running' | running, success, failed, skipped |
| current_node | TEXT | |
| steps | JSONB | DEFAULT '[]' | Execution log |
| started_at | TIMESTAMPTZ | |
| completed_at | TIMESTAMPTZ | |
| error_message | TEXT | |

---

## 6. AI & Prompts

### user_prompts
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| owner_id | UUID | FK → auth.users (NULL = system) |
| prompt_key | TEXT | NOT NULL |
| category | TEXT | NOT NULL | sales_outreach, analytics, email, content, lead_research, blog, social, automation, strategy |
| display_name | TEXT | NOT NULL |
| description | TEXT | DEFAULT '' |
| system_instruction | TEXT | DEFAULT '' |
| prompt_template | TEXT | DEFAULT '' |
| temperature | REAL | DEFAULT 0.7 |
| top_p | REAL | DEFAULT 0.9 |
| version | INTEGER | DEFAULT 1 |
| is_active | BOOLEAN | DEFAULT true |
| is_default | BOOLEAN | DEFAULT false |
| last_tested_at | TIMESTAMPTZ | |
| test_result | TEXT | |

**Unique**: (owner_id, prompt_key) WHERE is_active
**Seed data**: 28 default prompts.

### user_prompt_versions
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| prompt_id | UUID | FK → user_prompts CASCADE |
| owner_id | UUID | FK → auth.users |
| version | INTEGER | |
| system_instruction | TEXT | |
| prompt_template | TEXT | |
| temperature | REAL | |
| top_p | REAL | |
| change_note | TEXT | |
| created_at | TIMESTAMPTZ | |

### workspace_ai_usage
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| workspace_id | UUID | NOT NULL FK → profiles |
| month_year | TEXT | NOT NULL | 'YYYY-MM' |
| credits_used | INTEGER | DEFAULT 0 |
| tokens_used | BIGINT | DEFAULT 0 |
| credits_limit | INTEGER | DEFAULT 0 |

**Unique**: (workspace_id, month_year)
**RPC**: `increment_ai_usage()` — atomic UPSERT.

---

## 7. Integrations & Webhooks

### integrations
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| owner_id | UUID | NOT NULL FK → auth.users |
| provider | TEXT | NOT NULL |
| category | TEXT | NOT NULL |
| status | TEXT | DEFAULT 'disconnected' | connected, disconnected, error |
| credentials | JSONB | DEFAULT '{}' |
| metadata | JSONB | DEFAULT '{}' |

**Unique**: (owner_id, provider)

### webhooks
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| owner_id | UUID | NOT NULL FK → auth.users |
| name | TEXT | NOT NULL |
| url | TEXT | NOT NULL |
| trigger_event | TEXT | NOT NULL |
| is_active | BOOLEAN | DEFAULT true |
| secret | TEXT | |
| last_fired | TIMESTAMPTZ | |
| success_rate | REAL | DEFAULT 100.0 |
| fire_count | INTEGER | DEFAULT 0 |
| fail_count | INTEGER | DEFAULT 0 |

---

## 8. Invoicing

### invoices
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| owner_id | UUID | NOT NULL FK → auth.users |
| lead_id | UUID | NOT NULL FK → leads |
| stripe_customer_id | TEXT | |
| stripe_invoice_id | TEXT | |
| invoice_number | TEXT | |
| status | TEXT | DEFAULT 'draft' | draft, open, paid, void, uncollectible |
| currency | TEXT | DEFAULT 'usd' |
| subtotal_cents | INTEGER | DEFAULT 0 |
| total_cents | INTEGER | DEFAULT 0 |
| due_date | DATE | |
| notes | TEXT | |
| stripe_hosted_url | TEXT | |
| stripe_pdf_url | TEXT | |
| paid_at | TIMESTAMPTZ | |
| sent_at | TIMESTAMPTZ | |
| sent_via | TEXT | |

**Indexes**: owner_id, lead_id, stripe_invoice_id

### invoice_line_items
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| invoice_id | UUID | NOT NULL FK → invoices CASCADE |
| description | TEXT | NOT NULL |
| quantity | INTEGER | DEFAULT 1 |
| unit_price_cents | INTEGER | NOT NULL |
| amount_cents | INTEGER | NOT NULL |

### invoice_packages / invoice_package_items
Reusable line-item bundles. Same structure as invoices but with package grouping.

---

## 9. Social Media

### social_accounts
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| user_id | UUID | NOT NULL FK → auth.users |
| provider | TEXT | NOT NULL | meta, linkedin |
| meta_page_id | TEXT | |
| meta_page_name | TEXT | |
| meta_page_access_token_encrypted | TEXT | |
| meta_ig_user_id | TEXT | |
| meta_ig_username | TEXT | |
| linkedin_member_urn | TEXT | |
| linkedin_org_urn | TEXT | |
| linkedin_org_name | TEXT | |
| linkedin_access_token_encrypted | TEXT | |
| token_expires_at | TIMESTAMPTZ | |

### social_posts
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| user_id | UUID | NOT NULL FK → auth.users |
| content_text | TEXT | NOT NULL |
| link_url | TEXT | |
| media_paths | JSONB | |
| scheduled_at | TIMESTAMPTZ | |
| timezone | TEXT | DEFAULT 'Asia/Karachi' |
| status | TEXT | DEFAULT 'draft' | draft, scheduled, processing, completed, failed |

**Index**: `idx_social_posts_scheduled` ON (status, scheduled_at) WHERE status = 'scheduled'

### social_post_targets
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| post_id | UUID | FK → social_posts CASCADE |
| user_id | UUID | FK → auth.users |
| channel | TEXT | facebook_page, instagram, linkedin_member, linkedin_org |
| target_id | TEXT | Channel-specific ID |
| target_label | TEXT | |
| status | TEXT | DEFAULT 'pending' | pending, scheduled, processing, published, failed |
| remote_post_id | TEXT | |
| error_code | TEXT | |
| error_message | TEXT | |
| published_at | TIMESTAMPTZ | |

### tracking_links
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| user_id | UUID | FK → auth.users |
| post_id | UUID | FK → social_posts SET NULL |
| slug | TEXT | UNIQUE NOT NULL |
| destination_url | TEXT | NOT NULL |
| channel | TEXT | |

### tracking_events
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| link_id | UUID | FK → tracking_links CASCADE |
| user_id | UUID | FK → auth.users |
| referrer | TEXT | |
| user_agent | TEXT | |
| ip_hash | TEXT | Anonymized |

---

## 10. Team Hub (Strategy)

### teams
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| name | TEXT | NOT NULL |
| owner_id | UUID | NOT NULL FK → auth.users |

### team_members
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| team_id | UUID | FK → teams CASCADE |
| user_id | UUID | FK → auth.users |
| role | TEXT | DEFAULT 'member' | owner, admin, member |

**Unique**: (team_id, user_id)

### team_invites
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| team_id | UUID | FK → teams CASCADE |
| email | TEXT | NOT NULL |
| invited_by | UUID | FK → auth.users |
| status | TEXT | DEFAULT 'pending' |
| role | TEXT | |
| expires_at | TIMESTAMPTZ | DEFAULT now() + 7 days |

**Unique**: (team_id, email)

### strategy_tasks
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| user_id | UUID | NOT NULL FK → auth.users |
| title | TEXT | NOT NULL |
| priority | TEXT | DEFAULT 'normal' | urgent, high, normal, low |
| deadline | DATE | |
| completed | BOOLEAN | DEFAULT false |
| status | TEXT | DEFAULT 'todo' | todo, in_progress, done |
| lead_id | UUID | FK → leads |
| assigned_to | UUID | FK → auth.users |
| team_id | UUID | FK → teams |

### strategy_notes
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| user_id | UUID | NOT NULL FK → auth.users |
| content | TEXT | NOT NULL |
| lead_name | TEXT | |
| team_id | UUID | FK → teams |
| author_name | TEXT | |

---

## 11. Team Hub (Boards)

### teamhub_boards
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| workspace_id | UUID | NOT NULL FK → profiles CASCADE |
| name | TEXT | DEFAULT 'Untitled Board' |
| created_by | UUID | NOT NULL FK → auth.users |
| template_id | UUID | FK → teamhub_flow_templates |

### teamhub_lists (lanes)
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| board_id | UUID | NOT NULL FK → teamhub_boards CASCADE |
| name | TEXT | DEFAULT 'Untitled List' |
| position | INT | DEFAULT 0 |

### teamhub_cards (items)
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| board_id | UUID | NOT NULL FK → teamhub_boards CASCADE |
| list_id | UUID | NOT NULL FK → teamhub_lists CASCADE |
| title | TEXT | NOT NULL |
| description | TEXT | |
| position | INT | DEFAULT 0 |
| due_date | DATE | |
| priority | TEXT | | low, medium, high |
| labels | JSONB | DEFAULT '[]' |
| is_archived | BOOLEAN | DEFAULT false |
| created_by | UUID | NOT NULL FK → auth.users |

**Trigger**: `trg_teamhub_card_lead_sync` — AFTER UPDATE OF list_id → auto-sync linked lead status via `lane_status_map`.

### teamhub_comments
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| card_id | UUID | NOT NULL FK → teamhub_cards CASCADE |
| user_id | UUID | NOT NULL FK → auth.users |
| body | TEXT | NOT NULL |

### teamhub_card_members
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| card_id | UUID | FK → teamhub_cards CASCADE |
| user_id | UUID | FK → auth.users |

**Unique**: (card_id, user_id)

### teamhub_flow_members (RBAC)
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| board_id | UUID | FK → teamhub_boards CASCADE |
| user_id | UUID | FK → auth.users |
| role | TEXT | DEFAULT 'viewer' | owner, admin, member, viewer |

**Unique**: (board_id, user_id)

### teamhub_invites
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| board_id | UUID | FK → teamhub_boards CASCADE |
| email | TEXT | NOT NULL |
| role | TEXT | DEFAULT 'member' |
| invited_by | UUID | FK → auth.users |
| status | TEXT | DEFAULT 'pending' |

**Unique**: (board_id, email)

### teamhub_activity
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| board_id | UUID | FK → teamhub_boards CASCADE |
| card_id | UUID | FK → teamhub_cards SET NULL |
| actor_id | UUID | FK → auth.users |
| action_type | TEXT | NOT NULL |
| meta_json | JSONB | DEFAULT '{}' |

**Trigger**: `trg_teamhub_activity_to_audit` mirrors to `audit_logs`.

### teamhub_item_leads
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| item_id | UUID | FK → teamhub_cards |
| lead_id | UUID | FK → leads |
| is_active | BOOLEAN | |

**Trigger**: `trg_teamhub_check_lead_scope` validates lead ownership.

### teamhub_flow_templates
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| name | TEXT | |
| type | TEXT | system, custom |
| structure_json | JSONB | lanes, lead_sync, lane_status_map |

**Seed**: "Sales Sprint" template with lead_sync enabled.

---

## 12. Lead Import

### import_batches
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| workspace_id | UUID | NOT NULL FK → profiles |
| file_name | TEXT | NOT NULL |
| file_type | TEXT | DEFAULT 'csv' |
| total_rows | INTEGER | DEFAULT 0 |
| imported_count | INTEGER | DEFAULT 0 |
| updated_count | INTEGER | DEFAULT 0 |
| skipped_count | INTEGER | DEFAULT 0 |
| skipped_rows | JSONB | DEFAULT '[]' |
| column_mapping | JSONB | DEFAULT '{}' |
| options | JSONB | DEFAULT '{}' | dedupe_strategy, plan_name |
| status | TEXT | DEFAULT 'pending' | pending, processing, completed |
| completed_at | TIMESTAMPTZ | |

---

## 13. Sender Accounts & Usage

### sender_accounts
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| workspace_id | UUID | NOT NULL FK → profiles |
| provider | TEXT | gmail, smtp, sendgrid, mailchimp |
| display_name | TEXT | |
| from_email | TEXT | NOT NULL |
| from_name | TEXT | |
| status | TEXT | DEFAULT 'connected' | connected, needs_reauth, disabled |
| is_default | BOOLEAN | DEFAULT false |
| use_for_outreach | BOOLEAN | DEFAULT true |
| metadata | JSONB | DEFAULT '{}' |
| daily_sent_today | INTEGER | DEFAULT 0 |
| daily_sent_date | DATE | DEFAULT CURRENT_DATE |
| warmup_enabled | BOOLEAN | DEFAULT false |
| health_score | INTEGER | DEFAULT 100 |

**Unique**: workspace_id WHERE is_default (only one default per workspace)

### sender_account_secrets
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| sender_account_id | UUID | UNIQUE FK → sender_accounts CASCADE |
| oauth_access_token | TEXT | |
| oauth_refresh_token | TEXT | |
| oauth_expires_at | TIMESTAMPTZ | |
| smtp_host | TEXT | |
| smtp_port | INTEGER | DEFAULT 587 |
| smtp_user | TEXT | |
| smtp_pass | TEXT | |
| api_key | TEXT | |

**RLS**: No client access (service_role only via SECURITY DEFINER functions).

### outbound_usage
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| workspace_id | UUID | FK → profiles |
| inbox_id | TEXT | |
| channel | TEXT | email, linkedin |
| period_type | TEXT | daily, monthly |
| period_key | TEXT | YYYY-MM-DD or YYYY-MM |
| count | INTEGER | DEFAULT 0 |

**Unique**: (workspace_id, inbox_id, channel, period_type, period_key)
**RPC**: `increment_outbound_usage()` — atomic UPSERT.

### workspace_usage_counters
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| workspace_id | UUID | FK → profiles |
| date_key | DATE | |
| month_key | TEXT | YYYY-MM |
| emails_sent | INTEGER | DEFAULT 0 |
| linkedin_actions | INTEGER | DEFAULT 0 |
| ai_credits_used | INTEGER | DEFAULT 0 |
| warmup_emails_sent | INTEGER | DEFAULT 0 |

**Unique**: (workspace_id, date_key)

---

## 14. Blog & Content

### blog_categories
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| name | TEXT | UNIQUE NOT NULL |
| slug | TEXT | UNIQUE NOT NULL |
| description | TEXT | |

**Seed**: Product News, AI Strategy, Success Stories.

### blog_posts
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| author_id | UUID | NOT NULL FK → profiles CASCADE |
| category_id | UUID | FK → blog_categories SET NULL |
| title | TEXT | NOT NULL |
| slug | TEXT | UNIQUE NOT NULL |
| content | TEXT | NOT NULL |
| excerpt | TEXT | |
| featured_image | TEXT | |
| status | post_status | DEFAULT 'draft' | draft, pending_review, published, archived |
| visibility | TEXT | DEFAULT 'public' |
| seo_settings | JSONB | |
| ai_metadata | JSONB | |
| published_at | TIMESTAMPTZ | |
| contributor_id | UUID | FK → guest_contributors SET NULL |

### guest_post_outreach
Tracks guest posting opportunities (blog_name, contact, DA score, status pipeline: researching→pitched→accepted→published).

### guest_contributors
External writer profiles (name, email, bio, posts_submitted, posts_published).

---

## 15. Miscellaneous

### image_gen_generated_images / image_gen_module_attachments
AI image generation storage and module linking.

### support_sessions
Admin support session tracking for user impersonation (read-only).

### apollo_search_logs / apollo_import_logs
Apollo API activity logging.

---

## 16. Functions & Triggers

### SECURITY DEFINER Functions (19 total)

| Function | Returns | Purpose |
|----------|---------|---------|
| `handle_new_user()` | trigger | Create profile + subscription on signup |
| `get_category_post_counts()` | TABLE | Blog category stats |
| `is_team_member(team_id)` | boolean | Team membership check |
| `increment_ai_usage(...)` | integer | Atomic AI credit increment |
| `increment_sender_daily_sent(sender_id)` | integer | Daily send counter |
| `increment_workspace_usage(...)` | void | Consolidated usage UPSERT |
| `get_workspace_monthly_usage(...)` | TABLE | Monthly usage totals |
| `get_sender_daily_sent(sender_id)` | integer | Daily send count with auto-reset |
| `connect_sender_account(...)` | UUID | Create sender + secrets |
| `import_leads_batch(...)` | JSONB | Bulk import with dedup |
| `claim_next_writing_item(run_id)` | SETOF items | Atomic queue claim (SKIP LOCKED) |
| `reset_stuck_writing_items()` | void | Watchdog for stuck items |
| `finalize_email_sequence_run(run_id)` | void | Insert scheduled_emails on completion |
| `teamhub_user_flow_role(board_id)` | TEXT | User's board role (for RLS) |
| `get_board_snapshot(board_id)` | JSONB | Full board state in one call |
| `teamhub_sync_lead_on_move()` | trigger | Auto-sync lead status on card move |
| `teamhub_mirror_activity_to_audit()` | trigger | Mirror board activity to audit_logs |
| `teamhub_check_lead_link_scope()` | trigger | Enforce lead ownership on link |
| `record_email_event(...)` | void | Log email tracking events |

### Triggers

| Trigger | Table | Event | Purpose |
|---------|-------|-------|---------|
| `on_auth_user_created` | auth.users | AFTER INSERT | Create profile + subscription |
| `trigger_workflows_updated_at` | workflows | BEFORE UPDATE | Auto-timestamp |
| `trg_teamhub_activity_to_audit` | teamhub_activity | AFTER INSERT | Mirror to audit_logs |
| `trg_teamhub_card_lead_sync` | teamhub_cards | AFTER UPDATE OF list_id | Sync lead status |
| `trg_teamhub_check_lead_scope` | teamhub_item_leads | BEFORE INSERT/UPDATE | Ownership check |

---

## 17. Materialized Views

### email_analytics_summary
```sql
SELECT owner_id, DATE(created_at) AS analytics_date,
  COUNT(DISTINCT id) AS total_sent,
  COUNT(DISTINCT CASE WHEN event_type='open' AND NOT is_bot THEN message_id END) AS unique_opens,
  COUNT(DISTINCT CASE WHEN event_type='click' AND NOT is_bot THEN message_id END) AS unique_clicks,
  ...
FROM email_messages LEFT JOIN email_events ...
GROUP BY owner_id, analytics_date
```
**Unique index**: (owner_id, analytics_date) for REFRESH CONCURRENTLY
**Refresh**: pg_cron every 10 minutes

---

## 18. Storage Buckets

| Bucket | Public Read | Purpose |
|--------|------------|---------|
| `blog-assets` | Yes | Blog featured images |
| `image-gen-assets` | Yes | AI-generated images |
| `social_media` | No (user-scoped) | Social post media |

---

## 19. pg_cron Jobs

| Job | Schedule | SQL |
|-----|----------|-----|
| refresh-email-analytics | `*/10 * * * *` | `REFRESH MATERIALIZED VIEW CONCURRENTLY email_analytics_summary` |
| social-run-scheduler | `* * * * *` | `SELECT net.http_post('{SUPABASE_URL}/functions/v1/social-run-scheduler', ...)` |

---

## 20. Event & Audit Tables

These tables function as the system's event log. Understanding who writes to them is critical for debugging and auditing.

| Table | Writers | Event Types |
|-------|---------|-------------|
| **audit_logs** | apollo-import, import_leads_batch RPC, teamhub_mirror_activity_to_audit trigger, TeamHub UI | User actions, imports, board changes |
| **email_events** | email-track edge fn, webhooks-sendgrid, webhooks-mailchimp (all via `record_email_event` RPC) | open, click, delivered, bounced, unsubscribe, spam_report |
| **social_post_events** | linkedin/meta-oauth-start (state storage), social-post-now, social-schedule, social-run-scheduler | scheduled, started, published, failed, retry |
| **tracking_events** | tracking-redirect edge fn | Link clicks with referrer, UA, hashed IP |
| **teamhub_activity** | Team Hub UI (client-side inserts) | card_create, card_move, card_update, comment_add, list_create, etc. |
| **workflow_executions** | automationEngine.ts (client-side) | Workflow run logs with step-by-step results |
| **apollo_search_logs** | apollo-search edge fn | Search queries and result counts |
| **apollo_import_logs** | apollo-import edge fn | Import results and stats |
| **import_batches** | import_leads_batch RPC | CSV/XLSX import metadata and results |

---

## 21. Entity Relationship Diagram

```
auth.users
  ├── profiles (1:1)
  │     ├── subscriptions (1:1)
  │     ├── workspace_ai_usage (1:N by month)
  │     ├── workspace_usage_counters (1:N by date)
  │     ├── outbound_usage (1:N by inbox×period)
  │     ├── sender_accounts (1:N)
  │     │     └── sender_account_secrets (1:1)
  │     ├── teamhub_boards (1:N via workspace_id)
  │     └── import_batches (1:N)
  │
  ├── leads (1:N via client_id)
  │     ├── email_messages (1:N)
  │     │     ├── email_links (1:N)
  │     │     └── email_events (1:N)
  │     ├── scheduled_emails (1:N)
  │     ├── invoices (1:N)
  │     │     └── invoice_line_items (1:N)
  │     ├── strategy_tasks (N:1 via lead_id)
  │     ├── teamhub_item_leads (N:M bridge)
  │     └── lead_color_overrides (1:1 per owner)
  │
  ├── email_sequence_runs (1:N via owner_id)
  │     └── email_sequence_run_items (1:N)
  │
  ├── workflows (1:N)
  │     └── workflow_executions (1:N)
  │
  ├── teams (1:N via owner_id)
  │     ├── team_members (1:N)
  │     ├── team_invites (1:N)
  │     ├── strategy_tasks (1:N via team_id)
  │     └── strategy_notes (1:N via team_id)
  │
  ├── teamhub_boards (1:N via created_by)
  │     ├── teamhub_lists (1:N)
  │     │     └── teamhub_cards (1:N)
  │     │           ├── teamhub_comments (1:N)
  │     │           ├── teamhub_card_members (1:N)
  │     │           └── teamhub_item_leads (1:N)
  │     ├── teamhub_flow_members (1:N)
  │     ├── teamhub_invites (1:N)
  │     └── teamhub_activity (1:N)
  │
  ├── social_accounts (1:N)
  ├── social_posts (1:N)
  │     ├── social_post_targets (1:N)
  │     └── social_post_events (1:N)
  │
  ├── integrations (1:N)
  ├── webhooks (1:N)
  ├── email_provider_configs (1:N)
  ├── email_templates (1:N)
  ├── user_prompts (1:N)
  │     └── user_prompt_versions (1:N)
  ├── blog_posts (1:N via author_id)
  ├── guest_contributors (1:N)
  ├── guest_post_outreach (1:N)
  ├── audit_logs (1:N)
  └── lead_stage_colors (1:N)
```

---

## 22. Improvement Opportunities

### Schema Cleanup

1. **Normalize legacy lead fields**: The `leads` table has 6 redundant column pairs: `email`/`primary_email`, `name`/`first_name+last_name`, `lastActivity`(TEXT)/`last_activity`(TIMESTAMPTZ), `phone`/`primary_phone`. Migration plan:
   - Add `UPDATE leads SET primary_email = COALESCE(primary_email, email), ...` for backfill.
   - Update all client queries to use new columns (`queries.ts` LEAD_COLUMNS, `emailTracking.ts`, all edge functions).
   - Drop legacy columns after one release cycle.

2. **Consolidate usage tracking**: `outbound_usage` and `workspace_usage_counters` both track email sends. The `usageTracker.ts` writes to `outbound_usage` but `sender_accounts` migration introduced `workspace_usage_counters`. Pick one — `workspace_usage_counters` is more comprehensive (includes AI + warmup). Migrate `checkEmailAllowed()` to read from it.

3. **Add `workspace_id` to leads table**: Currently uses `client_id` (FK to auth.users). When multi-workspace support is added, this becomes a bottleneck. Add `workspace_id` column now, default to `client_id`, update RLS policies.

### Missing Indexes

4. **`scheduled_emails`**: No index on `(status, scheduled_at)`. The `process-scheduled-emails` function queries `WHERE status='pending' AND scheduled_at <= now()` — sequential scan on large tables. Add: `CREATE INDEX idx_scheduled_emails_due ON scheduled_emails(status, scheduled_at) WHERE status = 'pending'`.

5. **`email_events`**: No index on `(created_at)` for time-range queries in the materialized view refresh. Add: `CREATE INDEX idx_email_events_created ON email_events(created_at)`.

6. **`email_messages` by lead_id**: `fetchLeadEmailEngagement()` queries by lead_id but no index exists. Add: `CREATE INDEX idx_email_messages_lead ON email_messages(lead_id) WHERE lead_id IS NOT NULL`.

### Data Integrity

7. **`strategy_notes.lead_name` is denormalized TEXT**: Should be `lead_id UUID FK → leads`. Currently stores the lead's name as a string — breaks if lead is renamed or deleted. Same for `strategy_tasks.lead_id` which is nullable without FK constraint enforcement.

8. **`email_provider_configs` vs `sender_accounts`**: Two tables store overlapping email credentials. `email_provider_configs` is used by the legacy `send-email` flow; `sender_accounts` + `sender_account_secrets` was introduced later with better design (secrets separated, health scores, warmup). Migrate `send-email` to read from `sender_account_secrets` and deprecate `email_provider_configs`.

9. **No retention policy on event tables**: `email_events`, `tracking_events`, `social_post_events`, `teamhub_activity` grow unbounded. Add pg_cron jobs to archive/delete events older than 90 days, or partition by month.

### Performance

10. **`get_board_snapshot` is good but incomplete**: This RPC correctly avoids N+1 by fetching the full board in one call. Apply the same pattern to email analytics: create `get_lead_email_summary(lead_ids UUID[])` RPC that returns aggregated open/click counts, replacing the N-query pattern in `fetchBatchEmailSummary`.

11. **Materialized view refresh**: `email_analytics_summary` joins all `email_messages` × `email_events` without date bounds. As data grows, refresh time will increase. Add `WHERE created_at > now() - interval '90 days'` to the view definition, or switch to incremental aggregation table updated by `record_email_event()`.

12. **`social-post-now` Instagram polling**: Polls 10 times with 2s sleep (20s total) waiting for media container to be ready. This blocks the edge function. Use a two-phase approach: create container, return immediately, let `social-run-scheduler` pick up pending publishes.
