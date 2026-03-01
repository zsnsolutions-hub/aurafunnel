# Scaliyo — Database Schema

## 1. Tables

### 1.1 Core

#### `profiles`

User accounts and workspace configuration.

| Column | Type | Default | Constraints |
|--------|------|---------|-------------|
| `id` | UUID | — | PK, FK → `auth.users(id)` ON DELETE CASCADE |
| `email` | TEXT | — | UNIQUE NOT NULL |
| `name` | TEXT | `''` | NOT NULL |
| `role` | TEXT | `'CLIENT'` | NOT NULL. Values: `ADMIN`, `CLIENT`, `GUEST` |
| `status` | TEXT | `'active'` | NOT NULL. Values: `active`, `disabled` |
| `plan` | TEXT | `'Starter'` | |
| `credits_total` | INT | `100` | |
| `credits_used` | INT | `0` | |
| `businessProfile` | JSONB | — | Company info from onboarding |
| `is_super_admin` | BOOLEAN | `false` | |
| `ui_preferences` | JSONB | `'{}'` | |
| `createdAt` | TIMESTAMPTZ | `now()` | |
| `created_at` | TIMESTAMPTZ | `now()` | |
| `updated_at` | TIMESTAMPTZ | `now()` | |

**RLS Policies:**
- `Users can view own profile` — SELECT WHERE `id = auth.uid()`
- `Users can update own profile` — UPDATE WHERE `id = auth.uid()`
- `Users can insert own profile` — INSERT WHERE `id = auth.uid()`

---

#### `subscriptions`

Stripe-backed subscription tracking.

| Column | Type | Default | Constraints |
|--------|------|---------|-------------|
| `id` | UUID | `gen_random_uuid()` | PK |
| `user_id` | UUID | — | UNIQUE NOT NULL, FK → `auth.users(id)` ON DELETE CASCADE |
| `plan_name` | TEXT | `'Starter'` | |
| `plan` | TEXT | `'Starter'` | |
| `status` | TEXT | `'active'` | NOT NULL. Values: `active`, `past_due`, `canceled` |
| `created_at` | TIMESTAMPTZ | `now()` | |
| `expires_at` | TIMESTAMPTZ | — | |

**Indexes:** `idx_subscriptions_user_id(user_id)`

**RLS Policies:**
- SELECT/INSERT/UPDATE WHERE `user_id = auth.uid()`

---

#### `plans`

Available subscription plans.

| Column | Type | Default | Constraints |
|--------|------|---------|-------------|
| `id` | UUID | `gen_random_uuid()` | PK |
| `name` | TEXT | — | NOT NULL |
| `price` | TEXT | `'$0'` | NOT NULL |
| `credits` | INT | `0` | NOT NULL |
| `description` | TEXT | — | |
| `features` | TEXT[] | `'{}'` | |

**RLS Policies:**
- Anyone can SELECT
- Admins can INSERT/UPDATE/DELETE

---

#### `config_settings`

Global platform configuration.

| Column | Type | Default | Constraints |
|--------|------|---------|-------------|
| `key` | TEXT | — | PK |
| `value` | TEXT | — | |
| `updated_at` | TIMESTAMPTZ | `now()` | |

**RLS Policies:** Admins can manage

---

### 1.2 Leads

#### `leads`

Sales pipeline contacts.

| Column | Type | Default | Constraints |
|--------|------|---------|-------------|
| `id` | UUID | `gen_random_uuid()` | PK |
| `client_id` | UUID | — | NOT NULL, FK → `auth.users(id)` ON DELETE CASCADE |
| `name` | TEXT | — | NOT NULL |
| `email` | TEXT | `''` | NOT NULL |
| `first_name` | TEXT | — | |
| `last_name` | TEXT | — | |
| `company` | TEXT | `''` | NOT NULL |
| `title` | TEXT | — | |
| `score` | INT | `0` | NOT NULL |
| `status` | TEXT | `'New'` | NOT NULL. Values: `New`, `Contacted`, `Qualified`, `Converted`, `Lost` |
| `lastActivity` | TEXT | `''` | |
| `insights` | TEXT | `''` | |
| `knowledgeBase` | JSONB | `NULL` | AI research data: `{ aiResearchBrief, aiResearchedAt, title, industry, talkingPoints }` |
| `primary_email` | TEXT | — | |
| `emails` | TEXT[] | `'{}'` | |
| `primary_phone` | TEXT | — | |
| `phones` | TEXT[] | `'{}'` | |
| `linkedin_url` | TEXT | — | |
| `location` | TEXT | — | |
| `source` | TEXT | `'manual'` | |
| `industry` | TEXT | — | |
| `company_size` | TEXT | — | |
| `import_batch_id` | UUID | — | FK → `import_batches(id)` |
| `imported_at` | TIMESTAMPTZ | — | |
| `custom_fields` | JSONB | `'{}'` | |
| `created_at` | TIMESTAMPTZ | `now()` | |
| `updated_at` | TIMESTAMPTZ | `now()` | |

**Indexes:**
- `idx_leads_client_id(client_id)`
- `idx_leads_score(score DESC)`
- `idx_leads_client_created(client_id, created_at DESC)`
- `idx_leads_client_email(client_id, lower(primary_email)) WHERE primary_email IS NOT NULL`
- `idx_leads_client_linkedin(client_id, lower(linkedin_url)) WHERE linkedin_url IS NOT NULL`

**RLS Policies:**
- SELECT/INSERT/UPDATE/DELETE WHERE `client_id = auth.uid()`

---

#### `import_batches`

CSV/Apollo import tracking.

| Column | Type | Default | Constraints |
|--------|------|---------|-------------|
| `id` | UUID | `gen_random_uuid()` | PK |
| `workspace_id` | UUID | — | NOT NULL, FK → `profiles(id)` ON DELETE CASCADE |
| `file_name` | TEXT | — | NOT NULL |
| `file_type` | TEXT | `'csv'` | NOT NULL |
| `total_rows` | INT | `0` | NOT NULL |
| `imported_count` | INT | `0` | NOT NULL |
| `updated_count` | INT | `0` | NOT NULL |
| `skipped_count` | INT | `0` | NOT NULL |
| `skipped_rows` | JSONB | `'[]'` | |
| `column_mapping` | JSONB | `'{}'` | |
| `options` | JSONB | `'{}'` | |
| `status` | TEXT | `'pending'` | NOT NULL |
| `created_at` | TIMESTAMPTZ | `now()` | |
| `completed_at` | TIMESTAMPTZ | — | |

**RLS Policies:** Users can manage own import batches

---

#### `lead_stage_colors`

Per-user stage color mapping.

| Column | Type | Default | Constraints |
|--------|------|---------|-------------|
| `id` | UUID | `gen_random_uuid()` | PK |
| `owner_id` | UUID | — | NOT NULL, FK → `auth.users(id)` ON DELETE CASCADE |
| `stage` | TEXT | — | NOT NULL |
| `color_token` | TEXT | — | NOT NULL |
| `updated_at` | TIMESTAMPTZ | `now()` | |

**Constraints:** UNIQUE(`owner_id`, `stage`)

**Indexes:** `idx_lead_stage_colors_owner(owner_id)`

**RLS Policies:** SELECT/INSERT/UPDATE/DELETE WHERE `owner_id = auth.uid()`

---

#### `lead_color_overrides`

Per-lead color override.

| Column | Type | Default | Constraints |
|--------|------|---------|-------------|
| `id` | UUID | `gen_random_uuid()` | PK |
| `owner_id` | UUID | — | NOT NULL, FK → `auth.users(id)` ON DELETE CASCADE |
| `lead_id` | UUID | — | NOT NULL, FK → `leads(id)` ON DELETE CASCADE |
| `color_token` | TEXT | — | NOT NULL |
| `created_at` | TIMESTAMPTZ | `now()` | |

**Constraints:** UNIQUE(`owner_id`, `lead_id`)

**Indexes:** `idx_lead_color_overrides_owner(owner_id)`, `idx_lead_color_overrides_lead(lead_id)`

**RLS Policies:** SELECT/INSERT/UPDATE/DELETE WHERE `owner_id = auth.uid()`

---

### 1.3 Email Sending & Tracking

#### `sender_accounts`

Connected email sending accounts.

| Column | Type | Default | Constraints |
|--------|------|---------|-------------|
| `id` | UUID | `gen_random_uuid()` | PK |
| `workspace_id` | UUID | — | NOT NULL, FK → `profiles(id)` ON DELETE CASCADE |
| `provider` | TEXT | — | NOT NULL. Values: `gmail`, `smtp`, `sendgrid`, `mailchimp` |
| `display_name` | TEXT | `''` | NOT NULL |
| `from_email` | TEXT | — | NOT NULL |
| `from_name` | TEXT | `''` | NOT NULL |
| `status` | TEXT | `'connected'` | NOT NULL. Values: `connected`, `needs_reauth`, `disabled` |
| `is_default` | BOOLEAN | `false` | NOT NULL |
| `use_for_outreach` | BOOLEAN | `true` | NOT NULL |
| `metadata` | JSONB | `'{}'` | NOT NULL |
| `daily_sent_today` | INT | `0` | NOT NULL |
| `daily_sent_date` | DATE | `CURRENT_DATE` | NOT NULL |
| `warmup_enabled` | BOOLEAN | `false` | NOT NULL |
| `warmup_daily_sent` | INT | `0` | NOT NULL |
| `last_health_check_at` | TIMESTAMPTZ | — | |
| `health_score` | INT | `100` | 0-100 |
| `created_at` | TIMESTAMPTZ | `now()` | NOT NULL |
| `updated_at` | TIMESTAMPTZ | `now()` | NOT NULL |

**Indexes:**
- `idx_sender_accounts_workspace(workspace_id)`
- `idx_sender_accounts_lookup(workspace_id, status, use_for_outreach)`
- `idx_sender_accounts_default(workspace_id) WHERE is_default = true`

**RLS Policies:** SELECT/INSERT/UPDATE/DELETE WHERE `workspace_id = auth.uid()`

---

#### `sender_account_secrets`

Encrypted credentials for sender accounts. **No client-readable RLS policy.**

| Column | Type | Default | Constraints |
|--------|------|---------|-------------|
| `id` | UUID | `gen_random_uuid()` | PK |
| `sender_account_id` | UUID | — | NOT NULL UNIQUE, FK → `sender_accounts(id)` ON DELETE CASCADE |
| `oauth_access_token` | TEXT | — | |
| `oauth_refresh_token` | TEXT | — | |
| `oauth_expires_at` | TIMESTAMPTZ | — | |
| `smtp_host` | TEXT | — | |
| `smtp_port` | INT | `587` | |
| `smtp_user` | TEXT | — | |
| `smtp_pass` | TEXT | — | |
| `api_key` | TEXT | — | |
| `created_at` | TIMESTAMPTZ | `now()` | NOT NULL |
| `updated_at` | TIMESTAMPTZ | `now()` | NOT NULL |

**RLS Policies:** NO SELECT policy for `authenticated`. Only accessible via `SECURITY DEFINER` functions and `service_role`.

---

#### `email_messages`

Sent email records.

| Column | Type | Default | Constraints |
|--------|------|---------|-------------|
| `id` | UUID | `gen_random_uuid()` | PK |
| `lead_id` | UUID | — | NOT NULL, FK → `leads(id)` ON DELETE CASCADE |
| `owner_id` | UUID | — | NOT NULL, FK → `auth.users(id)` ON DELETE CASCADE |
| `provider` | TEXT | — | NOT NULL. CHECK IN (`sendgrid`, `mailchimp`, `gmail`, `smtp`, `manual`) |
| `provider_message_id` | TEXT | — | |
| `subject` | TEXT | — | |
| `to_email` | TEXT | — | NOT NULL |
| `from_email` | TEXT | — | |
| `status` | TEXT | `'sent'` | NOT NULL. CHECK IN (`sent`, `delivered`, `bounced`, `failed`) |
| `track_opens` | BOOLEAN | `true` | NOT NULL |
| `track_clicks` | BOOLEAN | `true` | NOT NULL |
| `created_at` | TIMESTAMPTZ | `now()` | NOT NULL |
| `updated_at` | TIMESTAMPTZ | `now()` | NOT NULL |

**Indexes:**
- `idx_email_messages_owner(owner_id)`
- `idx_email_messages_lead(lead_id)`

**RLS Policies:** SELECT/INSERT/UPDATE WHERE `owner_id = auth.uid()`

---

#### `email_links`

Tracked links within emails.

| Column | Type | Default | Constraints |
|--------|------|---------|-------------|
| `id` | UUID | `gen_random_uuid()` | PK |
| `message_id` | UUID | — | NOT NULL, FK → `email_messages(id)` ON DELETE CASCADE |
| `destination_url` | TEXT | — | NOT NULL |
| `link_label` | TEXT | — | |
| `link_index` | INT | `0` | NOT NULL |
| `click_count` | INT | `0` | NOT NULL |
| `created_at` | TIMESTAMPTZ | `now()` | NOT NULL |

**Indexes:** `idx_email_links_message(message_id)`

---

#### `email_events`

Open/click/bounce/unsubscribe events.

| Column | Type | Default | Constraints |
|--------|------|---------|-------------|
| `id` | UUID | `gen_random_uuid()` | PK |
| `message_id` | UUID | — | NOT NULL, FK → `email_messages(id)` ON DELETE CASCADE |
| `link_id` | UUID | — | FK → `email_links(id)` ON DELETE SET NULL |
| `event_type` | TEXT | — | NOT NULL. CHECK IN (`open`, `click`, `delivered`, `bounced`, `unsubscribe`, `spam_report`) |
| `ip_address` | TEXT | — | |
| `user_agent` | TEXT | — | |
| `is_bot` | BOOLEAN | `false` | |
| `is_apple_privacy` | BOOLEAN | `false` | |
| `metadata` | JSONB | `'{}'` | |
| `created_at` | TIMESTAMPTZ | `now()` | NOT NULL |

**Indexes:**
- `idx_email_events_message(message_id)`
- `idx_email_events_type(event_type)`

---

#### `email_provider_configs`

Legacy email provider credentials.

| Column | Type | Default | Constraints |
|--------|------|---------|-------------|
| `owner_id` | UUID | — | FK → `auth.users(id)` |
| `provider` | TEXT | — | |
| `is_active` | BOOLEAN | — | |
| `from_email` | TEXT | — | |
| `api_key` | TEXT | — | |
| `smtp_host` | TEXT | — | |

---

#### `email_templates`

Reusable email templates.

| Column | Type | Default | Constraints |
|--------|------|---------|-------------|
| `id` | UUID | `gen_random_uuid()` | PK |
| `owner_id` | UUID | — | FK → `auth.users(id)` ON DELETE CASCADE |
| `name` | TEXT | — | NOT NULL |
| `category` | TEXT | — | NOT NULL. Values: `welcome`, `follow_up`, `case_study`, `demo_invite`, `nurture`, `custom` |
| `subject_template` | TEXT | `''` | NOT NULL |
| `body_template` | TEXT | `''` | NOT NULL |
| `is_default` | BOOLEAN | `false` | NOT NULL |
| `created_at` | TIMESTAMPTZ | `now()` | NOT NULL |
| `updated_at` | TIMESTAMPTZ | `now()` | NOT NULL |

**Indexes:** `idx_email_templates_owner(owner_id)`, `idx_email_templates_category(category)`

**RLS Policies:**
- Public can read default templates (`is_default = true`)
- Users can CRUD own templates (`owner_id = auth.uid()`)

---

#### `scheduled_emails`

Email sequences and scheduled sends.

| Column | Type | Default | Constraints |
|--------|------|---------|-------------|
| `id` | UUID | `gen_random_uuid()` | PK |
| `owner_id` | UUID | — | NOT NULL, FK → `auth.users(id)` ON DELETE CASCADE |
| `lead_id` | UUID | — | FK → `leads(id)` ON DELETE SET NULL |
| `to_email` | TEXT | — | NOT NULL |
| `subject` | TEXT | — | NOT NULL |
| `html_body` | TEXT | — | NOT NULL |
| `scheduled_at` | TIMESTAMPTZ | — | NOT NULL |
| `status` | TEXT | `'pending'` | NOT NULL. CHECK IN (`pending`, `processing`, `sent`, `failed`, `cancelled`) |
| `block_index` | INT | `0` | NOT NULL |
| `sequence_id` | TEXT | — | |
| `error_message` | TEXT | — | |
| `sent_at` | TIMESTAMPTZ | — | |
| `created_at` | TIMESTAMPTZ | `now()` | NOT NULL |
| `updated_at` | TIMESTAMPTZ | `now()` | NOT NULL |

**Indexes:** `idx_scheduled_emails_status_scheduled(status, scheduled_at) WHERE status = 'pending'`

**RLS Policies:** SELECT/INSERT/UPDATE WHERE `owner_id = auth.uid()`

---

### 1.4 Automation

#### `workflows`

Automation pipelines.

| Column | Type | Default | Constraints |
|--------|------|---------|-------------|
| `id` | UUID | `gen_random_uuid()` | PK |
| `user_id` | UUID | — | NOT NULL, FK → `auth.users(id)` ON DELETE CASCADE |
| `team_id` | UUID | — | |
| `name` | TEXT | `'Untitled Workflow'` | NOT NULL |
| `description` | TEXT | `''` | |
| `status` | TEXT | `'draft'` | NOT NULL. Values: `active`, `paused`, `draft` |
| `nodes` | JSONB | `'[]'` | NOT NULL |
| `stats` | JSONB | `'{"leadsProcessed":0,"conversionRate":0,"timeSavedHrs":0,"roi":0}'` | NOT NULL |
| `created_at` | TIMESTAMPTZ | `now()` | NOT NULL |
| `updated_at` | TIMESTAMPTZ | `now()` | NOT NULL |

**Indexes:** `idx_workflows_user_id(user_id)`, `idx_workflows_status(status)`

**Trigger:** `update_workflows_updated_at` — auto-updates `updated_at` on row change

**RLS Policies:** SELECT/INSERT/UPDATE/DELETE WHERE `user_id = auth.uid()`

---

#### `workflow_executions`

Execution history and logs.

| Column | Type | Default | Constraints |
|--------|------|---------|-------------|
| `id` | UUID | `gen_random_uuid()` | PK |
| `workflow_id` | UUID | — | NOT NULL, FK → `workflows(id)` ON DELETE CASCADE |
| `user_id` | UUID | — | NOT NULL, FK → `auth.users(id)` ON DELETE CASCADE |
| `lead_id` | UUID | — | FK → `leads(id)` ON DELETE SET NULL |
| `status` | TEXT | `'running'` | NOT NULL. Values: `running`, `success`, `failed`, `skipped` |
| `current_node` | TEXT | — | |
| `steps` | JSONB | `'[]'` | NOT NULL |
| `started_at` | TIMESTAMPTZ | `now()` | NOT NULL |
| `completed_at` | TIMESTAMPTZ | — | |
| `error_message` | TEXT | — | |

**Indexes:** `idx_workflow_executions_workflow_id`, `idx_workflow_executions_user_id`, `idx_workflow_executions_lead_id`, `idx_workflow_executions_status`

**RLS Policies:** SELECT/INSERT WHERE `user_id = auth.uid()`

---

### 1.5 Usage & Quota Tracking

#### `workspace_ai_usage`

Monthly AI credit tracking per workspace.

| Column | Type | Default | Constraints |
|--------|------|---------|-------------|
| `id` | UUID | `gen_random_uuid()` | PK |
| `workspace_id` | UUID | — | NOT NULL, FK → `profiles(id)` ON DELETE CASCADE |
| `month_year` | TEXT | — | NOT NULL (e.g. `'2026-03'`) |
| `credits_used` | INT | `0` | NOT NULL |
| `tokens_used` | BIGINT | `0` | NOT NULL |
| `credits_limit` | INT | `0` | NOT NULL |
| `created_at` | TIMESTAMPTZ | `now()` | |
| `updated_at` | TIMESTAMPTZ | `now()` | |

**Constraints:** UNIQUE(`workspace_id`, `month_year`)

**Indexes:** `idx_workspace_ai_usage_lookup(workspace_id, month_year)`

**RLS Policies:** SELECT/INSERT/UPDATE WHERE `workspace_id = auth.uid()`

---

#### `workspace_usage_counters`

Consolidated daily/monthly usage counters.

| Column | Type | Default | Constraints |
|--------|------|---------|-------------|
| `id` | UUID | `gen_random_uuid()` | PK |
| `workspace_id` | UUID | — | NOT NULL, FK → `profiles(id)` ON DELETE CASCADE |
| `date_key` | DATE | — | NOT NULL |
| `month_key` | TEXT | — | NOT NULL (e.g. `'2026-03'`) |
| `emails_sent` | INT | `0` | NOT NULL |
| `linkedin_actions` | INT | `0` | NOT NULL |
| `ai_credits_used` | INT | `0` | NOT NULL |
| `warmup_emails_sent` | INT | `0` | NOT NULL |
| `updated_at` | TIMESTAMPTZ | `now()` | NOT NULL |

**Constraints:** UNIQUE(`workspace_id`, `date_key`)

**Indexes:** `idx_workspace_usage_workspace_month(workspace_id, month_key)`

**RLS Policies:** SELECT/INSERT/UPDATE WHERE `workspace_id = auth.uid()`

---

#### `outbound_usage`

Legacy per-inbox outbound tracking.

| Column | Type | Default | Constraints |
|--------|------|---------|-------------|
| `id` | UUID | `gen_random_uuid()` | PK |
| `workspace_id` | UUID | — | NOT NULL, FK → `profiles(id)` ON DELETE CASCADE |
| `inbox_id` | TEXT | — | |
| `channel` | TEXT | — | NOT NULL. CHECK IN (`email`, `linkedin`) |
| `period_type` | TEXT | — | NOT NULL. CHECK IN (`daily`, `monthly`) |
| `period_key` | TEXT | — | NOT NULL |
| `count` | INT | `0` | NOT NULL |
| `updated_at` | TIMESTAMPTZ | `now()` | |

**Constraints:** UNIQUE(`workspace_id`, `inbox_id`, `channel`, `period_type`, `period_key`)

---

#### `ai_usage_logs`

Per-request AI token tracking.

| Column | Type | Default | Constraints |
|--------|------|---------|-------------|
| `id` | UUID | `gen_random_uuid()` | PK |
| `user_id` | UUID | — | NOT NULL, FK → `auth.users(id)` ON DELETE CASCADE |
| `tokens_used` | INT | `0` | NOT NULL |
| `created_at` | TIMESTAMPTZ | `now()` | |

**Indexes:** `idx_ai_usage_logs_user_id(user_id)`

**RLS Policies:** SELECT/INSERT WHERE `user_id = auth.uid()`

---

### 1.6 Invoicing

#### `invoices`

| Column | Type | Default | Constraints |
|--------|------|---------|-------------|
| `id` | UUID | `gen_random_uuid()` | PK |
| `owner_id` | UUID | — | NOT NULL, FK → `auth.users(id)` ON DELETE CASCADE |
| `lead_id` | UUID | — | NOT NULL, FK → `leads(id)` ON DELETE CASCADE |
| `stripe_customer_id` | TEXT | — | |
| `stripe_invoice_id` | TEXT | — | |
| `invoice_number` | TEXT | — | |
| `status` | TEXT | `'draft'` | Values: `draft`, `open`, `paid`, `void`, `uncollectible` |
| `currency` | TEXT | `'usd'` | |
| `subtotal_cents` | INT | `0` | |
| `total_cents` | INT | `0` | |
| `due_date` | DATE | — | |
| `notes` | TEXT | — | |
| `stripe_hosted_url` | TEXT | — | |
| `stripe_pdf_url` | TEXT | — | |
| `sent_at` | TIMESTAMPTZ | — | |
| `sent_via` | TEXT | — | |
| `paid_at` | TIMESTAMPTZ | — | |
| `created_at` | TIMESTAMPTZ | `now()` | |
| `updated_at` | TIMESTAMPTZ | `now()` | |

**Indexes:** `idx_invoices_owner(owner_id)`, `idx_invoices_lead(lead_id)`, `idx_invoices_stripe_invoice(stripe_invoice_id)`

**RLS Policies:** SELECT/INSERT/UPDATE WHERE `owner_id = auth.uid()`

---

#### `invoice_line_items`

| Column | Type | Default | Constraints |
|--------|------|---------|-------------|
| `id` | UUID | `gen_random_uuid()` | PK |
| `invoice_id` | UUID | — | NOT NULL, FK → `invoices(id)` ON DELETE CASCADE |
| `description` | TEXT | — | NOT NULL |
| `quantity` | INT | `1` | |
| `unit_price_cents` | INT | — | NOT NULL |
| `amount_cents` | INT | — | NOT NULL |
| `created_at` | TIMESTAMPTZ | `now()` | |

**Indexes:** `idx_invoice_line_items_invoice(invoice_id)`

---

#### `invoice_packages`

Reusable service bundles.

| Column | Type | Default | Constraints |
|--------|------|---------|-------------|
| `id` | UUID | `gen_random_uuid()` | PK |
| `owner_id` | UUID | — | NOT NULL, FK → `auth.users(id)` ON DELETE CASCADE |
| `name` | TEXT | — | NOT NULL |
| `description` | TEXT | — | |
| `created_at` | TIMESTAMPTZ | `now()` | |
| `updated_at` | TIMESTAMPTZ | `now()` | |

**Indexes:** `idx_invoice_packages_owner(owner_id)`

**RLS Policies:** CRUD WHERE `owner_id = auth.uid()`

---

#### `invoice_package_items`

| Column | Type | Default | Constraints |
|--------|------|---------|-------------|
| `id` | UUID | `gen_random_uuid()` | PK |
| `package_id` | UUID | — | NOT NULL, FK → `invoice_packages(id)` ON DELETE CASCADE |
| `description` | TEXT | — | NOT NULL |
| `quantity` | INT | `1` | |
| `unit_price_cents` | INT | — | NOT NULL |

**Indexes:** `idx_invoice_package_items_package(package_id)`

---

### 1.7 Social Media

#### `social_accounts`

Connected social profiles.

| Column | Type | Default | Constraints |
|--------|------|---------|-------------|
| `id` | UUID | `gen_random_uuid()` | PK |
| `user_id` | UUID | — | NOT NULL, FK → `auth.users(id)` ON DELETE CASCADE |
| `provider` | TEXT | — | NOT NULL. CHECK IN (`meta`, `linkedin`) |
| `meta_page_id` | TEXT | — | |
| `meta_page_name` | TEXT | — | |
| `meta_page_access_token_encrypted` | TEXT | — | |
| `meta_ig_user_id` | TEXT | — | |
| `meta_ig_username` | TEXT | — | |
| `linkedin_member_urn` | TEXT | — | |
| `linkedin_org_urn` | TEXT | — | |
| `linkedin_org_name` | TEXT | — | |
| `linkedin_access_token_encrypted` | TEXT | — | |
| `token_expires_at` | TIMESTAMPTZ | — | |
| `created_at` | TIMESTAMPTZ | `now()` | |

**Indexes:** `idx_social_accounts_user(user_id)`, `idx_social_accounts_provider(user_id, provider)`

**RLS Policies:** CRUD WHERE `user_id = auth.uid()`

---

#### `social_posts`

Scheduled and published posts.

| Column | Type | Default | Constraints |
|--------|------|---------|-------------|
| `id` | UUID | `gen_random_uuid()` | PK |
| `user_id` | UUID | — | NOT NULL, FK → `auth.users(id)` ON DELETE CASCADE |
| `content_text` | TEXT | — | NOT NULL |
| `link_url` | TEXT | — | |
| `media_paths` | JSONB | — | |
| `scheduled_at` | TIMESTAMPTZ | — | |
| `timezone` | TEXT | `'Asia/Karachi'` | |
| `status` | TEXT | `'draft'` | NOT NULL. Values: `draft`, `scheduled`, `processing`, `completed`, `failed` |
| `created_at` | TIMESTAMPTZ | `now()` | |

**Indexes:** `idx_social_posts_user(user_id)`, `idx_social_posts_status(status)`, `idx_social_posts_scheduled(status, scheduled_at) WHERE status = 'scheduled'`

**RLS Policies:** CRUD WHERE `user_id = auth.uid()`

---

#### `social_post_targets`

Per-platform target for each post.

| Column | Type | Default | Constraints |
|--------|------|---------|-------------|
| `id` | UUID | `gen_random_uuid()` | PK |
| `post_id` | UUID | — | NOT NULL, FK → `social_posts(id)` ON DELETE CASCADE |
| `user_id` | UUID | — | NOT NULL, FK → `auth.users(id)` ON DELETE CASCADE |
| `channel` | TEXT | — | NOT NULL. Values: `facebook_page`, `instagram`, `linkedin_member`, `linkedin_org` |
| `target_id` | TEXT | — | NOT NULL |
| `target_label` | TEXT | — | |
| `status` | TEXT | `'pending'` | NOT NULL. Values: `pending`, `scheduled`, `processing`, `published`, `failed` |
| `remote_post_id` | TEXT | — | |
| `error_code` | TEXT | — | |
| `error_message` | TEXT | — | |
| `published_at` | TIMESTAMPTZ | — | |
| `created_at` | TIMESTAMPTZ | `now()` | |

**Indexes:** `idx_social_post_targets_post(post_id)`, `idx_social_post_targets_user(user_id)`, `idx_social_post_targets_status(status)`

**RLS Policies:** CRUD WHERE `user_id = auth.uid()`

---

#### `social_post_events`

Publishing audit log.

| Column | Type | Default | Constraints |
|--------|------|---------|-------------|
| `id` | UUID | `gen_random_uuid()` | PK |
| `user_id` | UUID | — | NOT NULL, FK → `auth.users(id)` ON DELETE CASCADE |
| `post_id` | UUID | — | NOT NULL, FK → `social_posts(id)` ON DELETE CASCADE |
| `target_id` | UUID | — | FK → `social_post_targets(id)` ON DELETE SET NULL |
| `event_type` | TEXT | — | NOT NULL. Values: `scheduled`, `started`, `published`, `failed`, `retry` |
| `payload` | JSONB | `'{}'` | |
| `created_at` | TIMESTAMPTZ | `now()` | |

**Indexes:** `idx_social_post_events_post(post_id)`, `idx_social_post_events_user(user_id)`

**RLS Policies:** SELECT WHERE `user_id = auth.uid()`

---

#### `tracking_links`

Short URL click tracking for social posts.

| Column | Type | Default | Constraints |
|--------|------|---------|-------------|
| `id` | UUID | `gen_random_uuid()` | PK |
| `user_id` | UUID | — | NOT NULL, FK → `auth.users(id)` ON DELETE CASCADE |
| `post_id` | UUID | — | FK → `social_posts(id)` ON DELETE SET NULL |
| `slug` | TEXT | — | NOT NULL UNIQUE |
| `destination_url` | TEXT | — | NOT NULL |
| `channel` | TEXT | — | |
| `created_at` | TIMESTAMPTZ | `now()` | |

**Indexes:** `idx_tracking_links_slug(slug)`, `idx_tracking_links_user(user_id)`, `idx_tracking_links_post(post_id)`

**RLS Policies:** CRUD WHERE `user_id = auth.uid()`

---

#### `tracking_events`

Click/visit events for tracking links.

| Column | Type | Default | Constraints |
|--------|------|---------|-------------|
| `id` | UUID | `gen_random_uuid()` | PK |
| `link_id` | UUID | — | NOT NULL, FK → `tracking_links(id)` ON DELETE CASCADE |
| `user_id` | UUID | — | NOT NULL, FK → `auth.users(id)` ON DELETE CASCADE |
| `referrer` | TEXT | — | |
| `user_agent` | TEXT | — | |
| `ip_hash` | TEXT | — | |
| `created_at` | TIMESTAMPTZ | `now()` | |

**Indexes:** `idx_tracking_events_link(link_id)`, `idx_tracking_events_user(user_id)`

**RLS Policies:** SELECT WHERE `user_id = auth.uid()`

---

### 1.8 Blog & Content

#### `blog_categories`

| Column | Type | Default | Constraints |
|--------|------|---------|-------------|
| `id` | UUID | `gen_random_uuid()` | PK |
| `name` | TEXT | — | UNIQUE NOT NULL |
| `slug` | TEXT | — | UNIQUE NOT NULL |
| `description` | TEXT | — | |
| `created_at` | TIMESTAMPTZ | `now()` | |

**RLS Policies:** Anyone can SELECT; admins can manage

---

#### `blog_posts`

| Column | Type | Default | Constraints |
|--------|------|---------|-------------|
| `id` | UUID | `gen_random_uuid()` | PK |
| `author_id` | UUID | — | FK → `auth.users(id)` ON DELETE SET NULL |
| `category_id` | UUID | — | FK → `blog_categories(id)` ON DELETE SET NULL |
| `contributor_id` | UUID | — | FK → `guest_contributors(id)` ON DELETE SET NULL |
| `title` | TEXT | — | NOT NULL |
| `slug` | TEXT | — | UNIQUE NOT NULL |
| `content` | TEXT | `''` | |
| `excerpt` | TEXT | — | |
| `featured_image` | TEXT | — | |
| `status` | TEXT | `'draft'` | NOT NULL. Values: `draft`, `pending_review`, `published`, `archived` |
| `visibility` | TEXT | `'public'` | |
| `seo_settings` | JSONB | — | |
| `ai_metadata` | JSONB | — | |
| `published_at` | TIMESTAMPTZ | — | |
| `created_at` | TIMESTAMPTZ | `now()` | |
| `updated_at` | TIMESTAMPTZ | `now()` | |

**Indexes:** `idx_blog_posts_slug(slug)`, `idx_blog_posts_status(status)`, `idx_blog_posts_author_created(author_id, created_at DESC)`, `idx_blog_posts_contributor(contributor_id)`

**RLS Policies:** Anyone can SELECT published posts; authors can manage own posts

---

#### `ai_prompts`

System-level AI prompts.

| Column | Type | Default | Constraints |
|--------|------|---------|-------------|
| `id` | UUID | `gen_random_uuid()` | PK |
| `name` | TEXT | — | NOT NULL |
| `template` | TEXT | `''` | NOT NULL |
| `version` | INT | `1` | NOT NULL |
| `is_active` | BOOLEAN | `true` | |
| `created_at` | TIMESTAMPTZ | `now()` | |

**RLS Policies:** Authenticated can SELECT active; admins can manage

---

#### `user_prompts`

User-customizable AI prompts.

| Column | Type | Default | Constraints |
|--------|------|---------|-------------|
| `id` | UUID | `gen_random_uuid()` | PK |
| `owner_id` | UUID | — | FK → `auth.users(id)` ON DELETE CASCADE |
| `prompt_key` | TEXT | — | NOT NULL |
| `category` | TEXT | — | NOT NULL. Values: `sales_outreach`, `analytics`, `email`, `content`, `lead_research`, `blog`, `social`, `automation`, `strategy` |
| `display_name` | TEXT | — | NOT NULL |
| `description` | TEXT | `''` | NOT NULL |
| `system_instruction` | TEXT | `''` | NOT NULL |
| `prompt_template` | TEXT | `''` | NOT NULL |
| `temperature` | REAL | `0.7` | NOT NULL |
| `top_p` | REAL | `0.9` | NOT NULL |
| `version` | INT | `1` | NOT NULL |
| `is_active` | BOOLEAN | `true` | NOT NULL |
| `is_default` | BOOLEAN | `false` | NOT NULL |
| `last_tested_at` | TIMESTAMPTZ | — | |
| `test_result` | TEXT | — | |
| `created_at` | TIMESTAMPTZ | `now()` | NOT NULL |
| `updated_at` | TIMESTAMPTZ | `now()` | NOT NULL |

**Indexes:** `idx_user_prompts_owner(owner_id)`, `idx_user_prompts_key(prompt_key)`, `idx_user_prompts_category(category)`, `idx_user_prompts_active_unique(owner_id, prompt_key) WHERE is_active = true`

**RLS Policies:** Public can read defaults; users can CRUD own prompts

---

#### `user_prompt_versions`

Prompt version history.

| Column | Type | Default | Constraints |
|--------|------|---------|-------------|
| `id` | UUID | `gen_random_uuid()` | PK |
| `prompt_id` | UUID | — | NOT NULL, FK → `user_prompts(id)` ON DELETE CASCADE |
| `owner_id` | UUID | — | FK → `auth.users(id)` ON DELETE CASCADE |
| `version` | INT | — | NOT NULL |
| `system_instruction` | TEXT | `''` | NOT NULL |
| `prompt_template` | TEXT | `''` | NOT NULL |
| `temperature` | REAL | `0.7` | NOT NULL |
| `top_p` | REAL | `0.9` | NOT NULL |
| `change_note` | TEXT | — | |
| `created_at` | TIMESTAMPTZ | `now()` | NOT NULL |

**Indexes:** `idx_user_prompt_versions_prompt(prompt_id)`

**RLS Policies:** SELECT/INSERT WHERE `owner_id = auth.uid()`

---

### 1.9 Guest Posting

#### `guest_post_outreach`

| Column | Type | Default | Constraints |
|--------|------|---------|-------------|
| `id` | UUID | `gen_random_uuid()` | PK |
| `user_id` | UUID | — | NOT NULL, FK → `auth.users(id)` ON DELETE CASCADE |
| `blog_name` | TEXT | — | NOT NULL |
| `blog_url` | TEXT | — | |
| `contact_name` | TEXT | — | |
| `contact_email` | TEXT | — | |
| `domain_authority` | INT | — | CHECK 0-100 |
| `monthly_traffic` | TEXT | — | |
| `status` | TEXT | `'researching'` | Values: `researching`, `pitched`, `accepted`, `writing`, `published`, `rejected` |
| `pitch_subject` | TEXT | — | |
| `pitch_body` | TEXT | — | |
| `notes` | TEXT | — | |
| `target_publish_date` | DATE | — | |
| `published_url` | TEXT | — | |
| `created_at` | TIMESTAMPTZ | `now()` | |
| `updated_at` | TIMESTAMPTZ | `now()` | |

**Indexes:** `idx_guest_post_outreach_user(user_id)`, `idx_guest_post_outreach_status(user_id, status)`

**RLS Policies:** CRUD WHERE `user_id = auth.uid()`

---

#### `guest_contributors`

| Column | Type | Default | Constraints |
|--------|------|---------|-------------|
| `id` | UUID | `gen_random_uuid()` | PK |
| `user_id` | UUID | — | NOT NULL, FK → `auth.users(id)` ON DELETE CASCADE |
| `name` | TEXT | — | NOT NULL |
| `email` | TEXT | — | NOT NULL |
| `bio` | TEXT | — | |
| `website` | TEXT | — | |
| `status` | TEXT | `'invited'` | Values: `invited`, `active`, `inactive` |
| `posts_submitted` | INT | `0` | |
| `posts_published` | INT | `0` | |
| `invited_at` | TIMESTAMPTZ | `now()` | |
| `created_at` | TIMESTAMPTZ | `now()` | |
| `updated_at` | TIMESTAMPTZ | `now()` | |

**Indexes:** `idx_guest_contributors_user(user_id)`, `idx_guest_contributors_status(user_id, status)`

**RLS Policies:** CRUD WHERE `user_id = auth.uid()`

---

### 1.10 Teams

#### `teams`

| Column | Type | Default | Constraints |
|--------|------|---------|-------------|
| `id` | UUID | `gen_random_uuid()` | PK |
| `name` | TEXT | — | NOT NULL |
| `owner_id` | UUID | — | NOT NULL, FK → `auth.users(id)` ON DELETE CASCADE |
| `created_at` | TIMESTAMPTZ | `now()` | |

**Indexes:** `idx_teams_owner_id(owner_id)`

**RLS Policies:** Team members can SELECT; owner can UPDATE

---

#### `team_members`

| Column | Type | Default | Constraints |
|--------|------|---------|-------------|
| `id` | UUID | `gen_random_uuid()` | PK |
| `team_id` | UUID | — | NOT NULL, FK → `teams(id)` ON DELETE CASCADE |
| `user_id` | UUID | — | NOT NULL, FK → `auth.users(id)` ON DELETE CASCADE |
| `role` | TEXT | `'member'` | NOT NULL. Values: `owner`, `admin`, `member` |
| `joined_at` | TIMESTAMPTZ | `now()` | |

**Constraints:** UNIQUE(`team_id`, `user_id`)

**Indexes:** `idx_team_members_team_id(team_id)`, `idx_team_members_user_id(user_id)`

**RLS Policies:** Team members can SELECT/INSERT/DELETE

---

#### `team_invites`

| Column | Type | Default | Constraints |
|--------|------|---------|-------------|
| `id` | UUID | `gen_random_uuid()` | PK |
| `team_id` | UUID | — | NOT NULL, FK → `teams(id)` ON DELETE CASCADE |
| `email` | TEXT | — | NOT NULL |
| `invited_by` | UUID | — | NOT NULL, FK → `auth.users(id)` ON DELETE CASCADE |
| `role` | TEXT | `'member'` | NOT NULL |
| `status` | TEXT | `'pending'` | NOT NULL. Values: `pending`, `accepted`, `declined` |
| `created_at` | TIMESTAMPTZ | `now()` | |
| `expires_at` | TIMESTAMPTZ | `now() + interval '7 days'` | |

**Constraints:** UNIQUE(`team_id`, `email`)

**RLS Policies:** Inviters/invitees can SELECT; team members can INSERT; invitees can UPDATE

---

### 1.11 Team Hub (Kanban)

#### `teamhub_boards`

| Column | Type | Default | Constraints |
|--------|------|---------|-------------|
| `id` | UUID | `gen_random_uuid()` | PK |
| `workspace_id` | UUID | — | |
| `name` | TEXT | `'Untitled Board'` | NOT NULL |
| `created_by` | UUID | — | NOT NULL, FK → `auth.users(id)` ON DELETE CASCADE |
| `template_id` | UUID | — | FK → `teamhub_flow_templates(id)` ON DELETE SET NULL |
| `created_at` | TIMESTAMPTZ | `now()` | NOT NULL |
| `updated_at` | TIMESTAMPTZ | `now()` | NOT NULL |

**Indexes:** `idx_teamhub_boards_created_by(created_by)`, `idx_teamhub_boards_workspace(workspace_id)`

**RLS Policies:** Flow members can SELECT; admins can UPDATE; owners can DELETE

---

#### `teamhub_lists`

| Column | Type | Default | Constraints |
|--------|------|---------|-------------|
| `id` | UUID | `gen_random_uuid()` | PK |
| `board_id` | UUID | — | NOT NULL, FK → `teamhub_boards(id)` ON DELETE CASCADE |
| `name` | TEXT | `'Untitled List'` | NOT NULL |
| `position` | INT | `0` | NOT NULL |
| `created_at` | TIMESTAMPTZ | `now()` | NOT NULL |
| `updated_at` | TIMESTAMPTZ | `now()` | NOT NULL |

**Indexes:** `idx_teamhub_lists_board(board_id)`

**RLS Policies:** Flow members can SELECT; admins can INSERT/UPDATE/DELETE

---

#### `teamhub_cards`

| Column | Type | Default | Constraints |
|--------|------|---------|-------------|
| `id` | UUID | `gen_random_uuid()` | PK |
| `board_id` | UUID | — | NOT NULL, FK → `teamhub_boards(id)` ON DELETE CASCADE |
| `list_id` | UUID | — | NOT NULL, FK → `teamhub_lists(id)` ON DELETE CASCADE |
| `title` | TEXT | — | NOT NULL |
| `description` | TEXT | — | |
| `position` | INT | `0` | NOT NULL |
| `due_date` | DATE | — | |
| `priority` | TEXT | — | CHECK IN (`low`, `medium`, `high`) |
| `labels` | JSONB | `'[]'` | |
| `is_archived` | BOOLEAN | `false` | NOT NULL |
| `created_by` | UUID | — | NOT NULL, FK → `auth.users(id)` ON DELETE CASCADE |
| `card_color` | TEXT | — | |
| `created_at` | TIMESTAMPTZ | `now()` | NOT NULL |
| `updated_at` | TIMESTAMPTZ | `now()` | NOT NULL |

**Indexes:** `idx_teamhub_cards_list(list_id)`, `idx_teamhub_cards_board(board_id)`, `idx_teamhub_cards_archived(is_archived)`

**RLS Policies:** Flow members can SELECT; members can INSERT/UPDATE/DELETE

---

#### `teamhub_comments`, `teamhub_activity`, `teamhub_card_members`

Standard supporting tables for card comments, activity audit log, and card member assignment. All scoped to flow membership via `teamhub_user_flow_role()`.

---

#### `teamhub_flow_members`

Flow-level RBAC.

| Column | Type | Default | Constraints |
|--------|------|---------|-------------|
| `id` | UUID | `gen_random_uuid()` | PK |
| `flow_id` | UUID | — | NOT NULL, FK → `teamhub_boards(id)` ON DELETE CASCADE |
| `user_id` | UUID | — | NOT NULL, FK → `auth.users(id)` ON DELETE CASCADE |
| `role` | TEXT | `'viewer'` | NOT NULL. Values: `owner`, `admin`, `member`, `viewer` |
| `created_at` | TIMESTAMPTZ | `now()` | NOT NULL |
| `updated_at` | TIMESTAMPTZ | `now()` | NOT NULL |

**Constraints:** UNIQUE(`flow_id`, `user_id`)

**Indexes:** `idx_teamhub_flow_members_flow(flow_id)`, `idx_teamhub_flow_members_user(user_id)`

---

#### `teamhub_invites`

| Column | Type | Default | Constraints |
|--------|------|---------|-------------|
| `id` | UUID | `gen_random_uuid()` | PK |
| `flow_id` | UUID | — | NOT NULL, FK → `teamhub_boards(id)` ON DELETE CASCADE |
| `email` | TEXT | — | NOT NULL |
| `role` | TEXT | `'member'` | NOT NULL. Values: `admin`, `member`, `viewer` |
| `invited_by` | UUID | — | NOT NULL, FK → `auth.users(id)` ON DELETE CASCADE |
| `status` | TEXT | `'pending'` | NOT NULL. Values: `pending`, `accepted` |
| `created_at` | TIMESTAMPTZ | `now()` | NOT NULL |

**Constraints:** UNIQUE(`flow_id`, `email`)

---

#### `teamhub_item_leads`

Link leads to kanban cards.

| Column | Type | Default | Constraints |
|--------|------|---------|-------------|
| `id` | UUID | `gen_random_uuid()` | PK |
| `item_id` | UUID | — | NOT NULL, FK → `teamhub_cards(id)` ON DELETE CASCADE |
| `lead_id` | UUID | — | NOT NULL, FK → `leads(id)` ON DELETE CASCADE |
| `is_active` | BOOLEAN | `true` | NOT NULL |
| `created_at` | TIMESTAMPTZ | `now()` | |

**Indexes:** `idx_item_leads_active_item(item_id) WHERE is_active`, `idx_item_leads_active_lead(lead_id) WHERE is_active`

**Constraints:** One active link per item; one active link per lead

---

#### `teamhub_flow_templates`

Board templates (system + user-created).

| Column | Type | Default | Constraints |
|--------|------|---------|-------------|
| `id` | UUID | `gen_random_uuid()` | PK |
| `name` | TEXT | — | NOT NULL |
| `type` | TEXT | `'system'` | NOT NULL. Values: `system`, `user` |
| `structure_json` | JSONB | `'{}'` | NOT NULL |
| `created_by` | UUID | — | FK → `profiles(id)` ON DELETE SET NULL |
| `created_at` | TIMESTAMPTZ | `now()` | |

**System templates:** Basic Workflow, Sales Sprint, Project Delivery

**RLS Policies:** Public can read system templates; users can CRUD own user templates

---

### 1.12 Integrations & Webhooks

#### `integrations`

| Column | Type | Default | Constraints |
|--------|------|---------|-------------|
| `id` | UUID | `gen_random_uuid()` | PK |
| `owner_id` | UUID | — | NOT NULL, FK → `auth.users(id)` ON DELETE CASCADE |
| `provider` | TEXT | — | NOT NULL |
| `category` | TEXT | — | NOT NULL |
| `status` | TEXT | `'disconnected'` | NOT NULL. Values: `connected`, `disconnected`, `error` |
| `credentials` | JSONB | `'{}'` | NOT NULL |
| `metadata` | JSONB | `'{}'` | NOT NULL |
| `created_at` | TIMESTAMPTZ | `now()` | |
| `updated_at` | TIMESTAMPTZ | `now()` | |

**Constraints:** UNIQUE(`owner_id`, `provider`)

**Indexes:** `idx_integrations_owner(owner_id)`

**RLS Policies:** CRUD WHERE `owner_id = auth.uid()`

---

#### `webhooks`

| Column | Type | Default | Constraints |
|--------|------|---------|-------------|
| `id` | UUID | `gen_random_uuid()` | PK |
| `owner_id` | UUID | — | NOT NULL, FK → `auth.users(id)` ON DELETE CASCADE |
| `name` | TEXT | — | NOT NULL |
| `url` | TEXT | — | NOT NULL |
| `trigger_event` | TEXT | — | NOT NULL |
| `is_active` | BOOLEAN | `true` | |
| `secret` | TEXT | — | |
| `last_fired` | TIMESTAMPTZ | — | |
| `success_rate` | REAL | `100.0` | |
| `fire_count` | INT | `0` | |
| `fail_count` | INT | `0` | |
| `created_at` | TIMESTAMPTZ | `now()` | |
| `updated_at` | TIMESTAMPTZ | `now()` | |

**Indexes:** `idx_webhooks_owner(owner_id)`

**RLS Policies:** CRUD WHERE `owner_id = auth.uid()`

---

### 1.13 Strategy Hub

#### `strategy_tasks`

| Column | Type | Default | Constraints |
|--------|------|---------|-------------|
| `id` | UUID | `gen_random_uuid()` | PK |
| `user_id` | UUID | — | NOT NULL, FK → `auth.users(id)` ON DELETE CASCADE |
| `title` | TEXT | — | NOT NULL |
| `priority` | TEXT | `'normal'` | NOT NULL. Values: `urgent`, `high`, `normal`, `low` |
| `deadline` | DATE | — | |
| `completed` | BOOLEAN | `false` | NOT NULL |
| `lead_id` | UUID | — | |
| `assigned_to` | UUID | — | FK → `auth.users(id)` ON DELETE SET NULL |
| `team_id` | UUID | — | FK → `teams(id)` ON DELETE SET NULL |
| `status` | TEXT | `'todo'` | NOT NULL. Values: `todo`, `in_progress`, `done` |
| `card_color` | TEXT | — | |
| `created_at` | TIMESTAMPTZ | `now()` | |

**Indexes:** `idx_strategy_tasks_user_id(user_id)`, `idx_strategy_tasks_status(status)`

**RLS Policies:** Users can CRUD own tasks; team members can view/update team tasks

---

#### `strategy_notes`

| Column | Type | Default | Constraints |
|--------|------|---------|-------------|
| `id` | UUID | `gen_random_uuid()` | PK |
| `user_id` | UUID | — | NOT NULL, FK → `auth.users(id)` ON DELETE CASCADE |
| `content` | TEXT | — | NOT NULL |
| `lead_name` | TEXT | — | |
| `team_id` | UUID | — | FK → `teams(id)` ON DELETE SET NULL |
| `author_name` | TEXT | — | |
| `card_color` | TEXT | — | |
| `created_at` | TIMESTAMPTZ | `now()` | |

**Indexes:** `idx_strategy_notes_user_id(user_id)`

**RLS Policies:** Users can CRUD own notes; team members can view/insert team notes

---

### 1.14 Support (Super Admin)

#### `support_sessions`

| Column | Type | Default | Constraints |
|--------|------|---------|-------------|
| `id` | UUID | `gen_random_uuid()` | PK |
| `admin_id` | UUID | — | NOT NULL, FK → `profiles(id)` ON DELETE CASCADE |
| `target_user_id` | UUID | — | NOT NULL, FK → `profiles(id)` ON DELETE CASCADE |
| `reason` | TEXT | `''` | NOT NULL |
| `access_level` | TEXT | `'read_only'` | NOT NULL. CHECK IN (`read_only`, `debug`) |
| `started_at` | TIMESTAMPTZ | `now()` | NOT NULL |
| `expires_at` | TIMESTAMPTZ | `now() + interval '2 hours'` | NOT NULL |
| `ended_at` | TIMESTAMPTZ | — | |
| `is_active` | BOOLEAN | `true` | NOT NULL |
| `metadata` | JSONB | `'{}'` | |
| `created_at` | TIMESTAMPTZ | `now()` | NOT NULL |

---

#### `support_audit_logs`

| Column | Type | Default | Constraints |
|--------|------|---------|-------------|
| `id` | UUID | `gen_random_uuid()` | PK |
| `session_id` | UUID | — | FK → `support_sessions(id)` ON DELETE SET NULL |
| `admin_id` | UUID | — | NOT NULL, FK → `profiles(id)` ON DELETE CASCADE |
| `target_user_id` | UUID | — | NOT NULL, FK → `profiles(id)` ON DELETE CASCADE |
| `action` | TEXT | — | NOT NULL |
| `resource_type` | TEXT | — | |
| `resource_id` | TEXT | — | |
| `details` | JSONB | `'{}'` | |
| `created_at` | TIMESTAMPTZ | `now()` | NOT NULL |

---

### 1.15 Audit

#### `audit_logs`

| Column | Type | Default | Constraints |
|--------|------|---------|-------------|
| `id` | UUID | `gen_random_uuid()` | PK |
| `user_id` | UUID | — | FK → `auth.users(id)` ON DELETE SET NULL |
| `team_id` | UUID | — | FK → `teams(id)` ON DELETE SET NULL |
| `action` | TEXT | — | NOT NULL |
| `details` | TEXT | — | |
| `created_at` | TIMESTAMPTZ | `now()` | |

**Indexes:** `idx_audit_logs_user_id(user_id)`, `idx_audit_logs_created_at(created_at DESC)`, `idx_audit_logs_user_created(user_id, created_at DESC)`

**RLS Policies:** SELECT/INSERT WHERE `user_id = auth.uid()`; team members can view team audit logs

---

## 2. Materialized Views

#### `email_analytics_summary`

Pre-aggregated email analytics for fast dashboard queries.

```sql
SELECT
  em.owner_id,
  DATE(em.created_at) AS analytics_date,
  COUNT(DISTINCT em.id) AS total_sent,
  COUNT(DISTINCT CASE WHEN ee.event_type = 'open' AND ee.is_bot = false
        THEN ee.message_id END) AS unique_opens,
  COUNT(DISTINCT CASE WHEN ee.event_type = 'click' AND ee.is_bot = false
        THEN ee.message_id END) AS unique_clicks,
  COUNT(CASE WHEN ee.event_type = 'open' AND ee.is_bot = false THEN 1 END)
        AS total_open_events,
  COUNT(CASE WHEN ee.event_type = 'click' AND ee.is_bot = false THEN 1 END)
        AS total_click_events
FROM email_messages em
LEFT JOIN email_events ee ON em.id = ee.message_id
GROUP BY em.owner_id, DATE(em.created_at);
```

**Unique Index:** `ON email_analytics_summary(owner_id, analytics_date)`

**Refresh:** Every 10 minutes via pg_cron

---

## 3. Triggers

| Trigger | Table | Function | Purpose |
|---------|-------|----------|---------|
| `update_workflows_updated_at` | `workflows` | `update_workflows_updated_at()` | Auto-update `updated_at` on row modification |

---

## 4. Scheduled Jobs (pg_cron)

| Job | Schedule | Action |
|-----|----------|--------|
| Social post scheduler | Every 1 minute | Invokes Edge Function `social-run-scheduler` |
| Scheduled email processor | Every 1 minute | Invokes Edge Function `process-scheduled-emails` |
| Email analytics refresh | Every 10 minutes | `REFRESH MATERIALIZED VIEW CONCURRENTLY email_analytics_summary` |

---

## 5. Storage Buckets

| Bucket | Access | Size Limit | Purpose |
|--------|--------|------------|---------|
| `blog-assets` | Public read | — | Blog post images |
| `image-gen-assets` | Public read | 10 MB | AI-generated images |
| `social_media` | Private | — | Social media post attachments |
| `avatars` | Public read | — | User profile pictures |

---

## 6. Usage Counter Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    USAGE TRACKING LAYER                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  AI Credits (monthly)          Email Sending                    │
│  ┌───────────────────┐         ┌──────────────────────────┐    │
│  │ workspace_ai_usage │         │ sender_accounts          │    │
│  │ - credits_used     │         │ - daily_sent_today       │    │
│  │ - tokens_used      │         │ - daily_sent_date        │    │
│  │ - credits_limit    │         │ - warmup_daily_sent      │    │
│  └───────────────────┘         └──────────────────────────┘    │
│  RPC: increment_ai_usage       RPC: increment_sender_daily_sent│
│                                RPC: get_sender_daily_sent       │
│                                                                 │
│  Workspace Totals (daily+monthly)                               │
│  ┌───────────────────────────┐                                  │
│  │ workspace_usage_counters   │                                  │
│  │ - emails_sent              │                                  │
│  │ - linkedin_actions         │                                  │
│  │ - ai_credits_used          │                                  │
│  │ - warmup_emails_sent       │                                  │
│  └───────────────────────────┘                                  │
│  RPC: increment_workspace_usage                                 │
│  RPC: get_workspace_monthly_usage                               │
│                                                                 │
│  Legacy Per-Inbox (daily+monthly)                               │
│  ┌───────────────────────────┐                                  │
│  │ outbound_usage             │                                  │
│  │ - channel (email/linkedin) │                                  │
│  │ - period_type (daily/mo)   │                                  │
│  │ - count                    │                                  │
│  └───────────────────────────┘                                  │
│  RPC: increment_outbound_usage                                  │
│                                                                 │
│  Per-Request Logging                                            │
│  ┌───────────────────────────┐                                  │
│  │ ai_usage_logs              │                                  │
│  │ - tokens_used per request  │                                  │
│  └───────────────────────────┘                                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

Plan Limits Enforced By:
  Starter:  1,000 credits │ 1,000 contacts │ 2,000 emails/mo
  Growth:   6,000 credits │ 10,000 contacts │ 15,000 emails/mo
  Scale:   20,000 credits │ 50,000 contacts │ 40,000 emails/mo
```
