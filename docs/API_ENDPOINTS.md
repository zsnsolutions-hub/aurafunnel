# Scaliyo — API Endpoints

## 1. Express Backend (Node.js)

### `GET /health`

| Field | Detail |
|-------|--------|
| **Purpose** | Liveness/readiness probe |
| **Auth** | None (public) |
| **Input** | — |
| **Output** | `{ status: "ok"\|"error", redis: "connected"\|"error"\|"disconnected", uptime: number }` |
| **Tables** | None |
| **Side Effects** | None |
| **Rate Limit** | None |

---

## 2. Supabase RPCs (Remote Procedure Calls)

### 2.1 Authentication & Utility

#### `auth_email()`

| Field | Detail |
|-------|--------|
| **Purpose** | Get authenticated user's email address |
| **Auth** | `SECURITY DEFINER` — callable by any authenticated user |
| **Input** | None |
| **Output** | `TEXT` (email) |
| **Tables** | `auth.users` |
| **Side Effects** | None |

#### `check_email_exists(check_email TEXT)`

| Field | Detail |
|-------|--------|
| **Purpose** | Check if an email exists in the system (for team invites) |
| **Auth** | `SECURITY DEFINER` |
| **Input** | `check_email: TEXT` |
| **Output** | `BOOLEAN` |
| **Tables** | `profiles` |
| **Side Effects** | None |

#### `is_team_member(check_team_id UUID)`

| Field | Detail |
|-------|--------|
| **Purpose** | Check if authenticated user is a member of a team |
| **Auth** | `SECURITY DEFINER` |
| **Input** | `check_team_id: UUID` |
| **Output** | `BOOLEAN` |
| **Tables** | `team_members` |
| **Side Effects** | None |

#### `teamhub_user_flow_role(p_flow_id UUID)`

| Field | Detail |
|-------|--------|
| **Purpose** | Get authenticated user's role in a Team Hub flow |
| **Auth** | `SECURITY DEFINER` |
| **Input** | `p_flow_id: UUID` |
| **Output** | `TEXT` (`owner`, `admin`, `member`, `viewer`, or `NULL`) |
| **Tables** | `teamhub_flow_members` |
| **Side Effects** | None |

---

### 2.2 Blog & Content

#### `get_category_post_counts()`

| Field | Detail |
|-------|--------|
| **Purpose** | Get count of published blog posts per category |
| **Auth** | `SECURITY DEFINER` |
| **Input** | None |
| **Output** | `TABLE (category_id UUID, post_count BIGINT)` |
| **Tables** | `blog_posts`, `blog_categories` |
| **Side Effects** | None |

---

### 2.3 AI & Usage Tracking

#### `increment_ai_usage(p_workspace_id UUID, p_month_year TEXT, p_credits INT, p_tokens BIGINT, p_credits_limit INT)`

| Field | Detail |
|-------|--------|
| **Purpose** | Atomically increment workspace AI credit usage for a given month |
| **Auth** | `SECURITY DEFINER` |
| **Input** | `p_workspace_id: UUID`, `p_month_year: TEXT` (e.g. `'2026-03'`), `p_credits: INT`, `p_tokens: BIGINT`, `p_credits_limit: INT` |
| **Output** | `INT` (new `credits_used` total) |
| **Tables** | `workspace_ai_usage` (upsert) |
| **Side Effects** | Creates row if first usage in month |
| **Error Codes** | Returns current total even if limit exceeded (caller enforces hard stop) |

#### `consume_credits(amount INT)`

| Field | Detail |
|-------|--------|
| **Purpose** | Deduct credits from user's profile |
| **Auth** | `SECURITY DEFINER` |
| **Input** | `amount: INT` |
| **Output** | `JSONB { success: BOOLEAN, message: TEXT }` |
| **Tables** | `profiles` (`credits_used`) |
| **Side Effects** | Increments `credits_used` |

---

### 2.4 Email Sending & Limits

#### `increment_sender_daily_sent(p_sender_id UUID)`

| Field | Detail |
|-------|--------|
| **Purpose** | Increment per-sender daily email count (auto-resets on new day) |
| **Auth** | `SECURITY DEFINER` |
| **Input** | `p_sender_id: UUID` |
| **Output** | `INT` (new `daily_sent_today`) |
| **Tables** | `sender_accounts` |
| **Side Effects** | Resets counter if `daily_sent_date` is stale |

#### `get_sender_daily_sent(p_sender_id UUID)`

| Field | Detail |
|-------|--------|
| **Purpose** | Get daily sent count for a sender (auto-resets if new day) |
| **Auth** | `SECURITY DEFINER` |
| **Input** | `p_sender_id: UUID` |
| **Output** | `INT` |
| **Tables** | `sender_accounts` |
| **Side Effects** | Resets counter if stale |

#### `increment_workspace_usage(p_workspace_id UUID, p_date_key DATE, p_month_key TEXT, p_emails INT, p_linkedin INT, p_ai_credits INT, p_warmup INT)`

| Field | Detail |
|-------|--------|
| **Purpose** | Upsert consolidated daily/monthly usage counters per workspace |
| **Auth** | `SECURITY DEFINER` |
| **Input** | `p_workspace_id: UUID`, `p_date_key: DATE`, `p_month_key: TEXT`, `p_emails: INT` (default 0), `p_linkedin: INT` (default 0), `p_ai_credits: INT` (default 0), `p_warmup: INT` (default 0) |
| **Output** | `VOID` |
| **Tables** | `workspace_usage_counters` (upsert) |
| **Side Effects** | Creates row if first usage for that date |

#### `get_workspace_monthly_usage(p_workspace_id UUID, p_month_key TEXT)`

| Field | Detail |
|-------|--------|
| **Purpose** | Get workspace monthly usage totals |
| **Auth** | `SECURITY DEFINER` |
| **Input** | `p_workspace_id: UUID`, `p_month_key: TEXT` (e.g. `'2026-03'`) |
| **Output** | `TABLE (total_emails_sent BIGINT, total_linkedin_actions BIGINT, total_ai_credits_used BIGINT, total_warmup_sent BIGINT)` |
| **Tables** | `workspace_usage_counters` |
| **Side Effects** | None |

#### `increment_outbound_usage(p_workspace_id UUID, p_inbox_id UUID, p_channel TEXT, p_period_type TEXT, p_period_key TEXT)`

| Field | Detail |
|-------|--------|
| **Purpose** | Atomically increment outbound usage counter (legacy fallback) |
| **Auth** | `SECURITY DEFINER` |
| **Input** | `p_workspace_id: UUID`, `p_inbox_id: UUID`, `p_channel: 'email'\|'linkedin'`, `p_period_type: 'daily'\|'monthly'`, `p_period_key: TEXT` |
| **Output** | `INT` (new count) |
| **Tables** | `outbound_usage` |
| **Side Effects** | Upsert counter row |

---

### 2.5 Account Connection

#### `connect_sender_account(p_workspace_id UUID, p_provider TEXT, p_display_name TEXT, p_from_email TEXT, p_from_name TEXT, p_use_for_outreach BOOLEAN, p_metadata JSONB, p_oauth_access TEXT, p_oauth_refresh TEXT, p_oauth_expires TIMESTAMPTZ, p_smtp_host TEXT, p_smtp_port INT, p_smtp_user TEXT, p_smtp_pass TEXT, p_api_key TEXT)`

| Field | Detail |
|-------|--------|
| **Purpose** | Create new sender account with credentials stored securely |
| **Auth** | `SECURITY DEFINER` |
| **Input** | Provider details + OAuth/SMTP/API credentials (see parameter list) |
| **Output** | `UUID` (new account ID) |
| **Tables** | `sender_accounts` (insert), `sender_account_secrets` (insert) |
| **Side Effects** | Secrets stored in separate table with no client-read policy |

---

### 2.6 Lead Import

#### `import_leads_batch(p_workspace_id UUID, p_file_name TEXT, p_file_type TEXT, p_rows JSONB, p_mapping JSONB, p_options JSONB)`

| Field | Detail |
|-------|--------|
| **Purpose** | Batch import leads with deduplication and plan limit enforcement |
| **Auth** | `SECURITY DEFINER` |
| **Input** | `p_workspace_id: UUID`, `p_file_name: TEXT`, `p_file_type: TEXT`, `p_rows: JSONB` (array of row objects), `p_mapping: JSONB` (column mapping), `p_options: JSONB` (`{ dedupe_strategy: 'merge'\|'overwrite'\|'skip', plan_name: '...' }`) |
| **Output** | `JSONB { batch_id, imported_count, updated_count, skipped_count, skipped_rows, plan_limit, contacts_before, contacts_after }` |
| **Tables** | `leads` (insert/update), `import_batches` (insert), `audit_logs` (insert) |
| **Side Effects** | Deduplicates by email or LinkedIn URL. Enforces plan contact limits (Starter: 1K, Growth: 10K, Scale: 50K). |
| **Error Codes** | Returns `skipped_rows` array with reason for each skip |

---

### 2.7 Analytics

#### `refresh_email_analytics()`

| Field | Detail |
|-------|--------|
| **Purpose** | Refresh email analytics materialized view |
| **Auth** | `SECURITY DEFINER` (called by backend worker) |
| **Input** | None |
| **Output** | `VOID` |
| **Tables** | `email_analytics_summary` (materialized view refresh) |
| **Side Effects** | Rebuilds view from `email_messages` + `email_events` |

---

## 3. Supabase Edge Functions

### 3.1 OAuth & Authentication

#### `POST /functions/v1/connect-gmail-oauth`

| Field | Detail |
|-------|--------|
| **Purpose** | Connect Gmail account for email sending |
| **Auth** | Bearer token required |
| **Input** | `{ code: string, redirectUri: string }` |
| **Output** | `{ success: boolean, accountId: string }` |
| **Tables** | `sender_accounts`, `sender_account_secrets` |
| **External APIs** | Google OAuth token endpoint |
| **Side Effects** | Creates sender account + stores OAuth tokens |

#### `POST /functions/v1/connect-sendgrid`

| Field | Detail |
|-------|--------|
| **Purpose** | Connect SendGrid API key for email sending |
| **Auth** | Bearer token required |
| **Input** | `{ apiKey: string, displayName: string, fromEmail: string, fromName: string }` |
| **Output** | `{ success: boolean, accountId: string }` |
| **Tables** | `sender_accounts`, `sender_account_secrets` |
| **Side Effects** | Creates sender account + stores API key |

#### `POST /functions/v1/connect-mailchimp-oauth`

| Field | Detail |
|-------|--------|
| **Purpose** | Connect Mailchimp for newsletter sending |
| **Auth** | Bearer token required |
| **Input** | OAuth callback parameters |
| **Output** | `{ success: boolean }` |
| **Tables** | `sender_accounts` |
| **External APIs** | Mailchimp OAuth endpoint |

#### `POST /functions/v1/connect-smtp`

| Field | Detail |
|-------|--------|
| **Purpose** | Connect custom SMTP server |
| **Auth** | Bearer token required |
| **Input** | `{ host: string, port: number, user: string, pass: string, fromEmail: string, fromName: string, displayName: string }` |
| **Output** | `{ success: boolean, accountId: string }` |
| **Tables** | `sender_accounts`, `sender_account_secrets` |

#### `POST /functions/v1/linkedin-oauth-start`

| Field | Detail |
|-------|--------|
| **Purpose** | Initiate LinkedIn OAuth flow |
| **Auth** | Bearer token required |
| **Input** | None |
| **Output** | Redirect to LinkedIn auth URL |
| **Tables** | `social_post_events` (stores state) |
| **External APIs** | LinkedIn OAuth v2 authorize endpoint |

#### `GET /functions/v1/linkedin-oauth-callback`

| Field | Detail |
|-------|--------|
| **Purpose** | Handle LinkedIn OAuth callback |
| **Auth** | None (public callback) |
| **Input** | Query params: `code`, `state`, optional `error` |
| **Output** | Redirect to app portal |
| **Tables** | `social_post_events`, `social_accounts` |
| **External APIs** | LinkedIn token exchange + `api.linkedin.com/v2/userinfo` |

#### `POST /functions/v1/meta-oauth-start`

| Field | Detail |
|-------|--------|
| **Purpose** | Initiate Meta (Facebook/Instagram) OAuth flow |
| **Auth** | Bearer token required |
| **Input** | None |
| **Output** | Redirect to Meta auth URL |
| **External APIs** | Meta Login Dialog |

#### `GET /functions/v1/meta-oauth-callback`

| Field | Detail |
|-------|--------|
| **Purpose** | Handle Meta OAuth callback |
| **Auth** | None (public callback) |
| **Input** | Query params: `code`, `state` |
| **Output** | Redirect to app portal |
| **Tables** | `social_accounts` |
| **External APIs** | `graph.instagram.com/v18.0/oauth/access_token`, `graph.instagram.com/v18.0/me` |

#### `POST /functions/v1/auth-send-email`

| Field | Detail |
|-------|--------|
| **Purpose** | Send auth emails (password resets, confirmations) |
| **Auth** | Bearer token required |
| **Input** | `{ email: string, type: string, redirectUrl: string }` |
| **Output** | `{ success: boolean }` |
| **Tables** | `profiles`, `email_provider_configs` |

---

### 3.2 Email Sending & Tracking

#### `POST /functions/v1/send-email`

| Field | Detail |
|-------|--------|
| **Purpose** | Send email with open/click tracking instrumentation |
| **Auth** | Bearer token required |
| **Input** | `{ to: string, subject: string, html: string, text?: string, from_name?: string, tracking_links?: Array<{id, url}>, track_opens: boolean, track_clicks: boolean, provider: "sendgrid"\|"smtp"\|"gmail"\|"mailchimp" }` |
| **Output** | `{ success: boolean, messageId: string }` |
| **Tables** | `email_messages`, `email_links`, `email_provider_configs` |
| **External APIs** | SendGrid API v3 / SMTP / Gmail API (based on provider) |
| **Side Effects** | Rewrites links for click tracking, injects tracking pixel for opens |

#### `POST /functions/v1/process-scheduled-emails`

| Field | Detail |
|-------|--------|
| **Purpose** | Background job: send pending scheduled emails |
| **Auth** | Service role (internal, invoked by pg_cron) |
| **Input** | None |
| **Output** | `{ processed: number, failed: number }` |
| **Tables** | `scheduled_emails`, `email_messages`, `sender_accounts`, `workspace_usage_counters` |
| **Side Effects** | Sends emails, updates status, increments usage counters |

#### `GET /functions/v1/email-track`

| Field | Detail |
|-------|--------|
| **Purpose** | Track email opens and clicks |
| **Auth** | None (public tracking endpoint) |
| **Input** | Query params: `id` (tracking link/message ID), `type` (`open`\|`click`) |
| **Output** | 1x1 transparent pixel (opens) or 301 redirect (clicks) |
| **Tables** | `email_events`, `email_links` (increment `click_count`) |
| **Side Effects** | Logs event with IP, user agent, timestamp |

#### `GET /functions/v1/tracking-redirect`

| Field | Detail |
|-------|--------|
| **Purpose** | Record click on tracked link and redirect |
| **Auth** | None (public) |
| **Input** | Query params: `link` (tracking link ID) |
| **Output** | 301/302 redirect to destination URL |
| **Tables** | `tracking_links`, `tracking_events` |
| **Side Effects** | Logs click event |

---

### 3.3 Social Media

#### `POST /functions/v1/social-post-now`

| Field | Detail |
|-------|--------|
| **Purpose** | Publish social media post immediately |
| **Auth** | Bearer token required |
| **Input** | `{ content: string, platforms: string[], media_ids?: string[], hashtags?: string[] }` |
| **Output** | `{ postId: string, status: string, platforms: object }` |
| **Tables** | `social_posts`, `social_accounts`, `social_post_targets`, `workflow_executions` |
| **External APIs** | LinkedIn Posts API, Meta Graph API |

#### `POST /functions/v1/social-schedule`

| Field | Detail |
|-------|--------|
| **Purpose** | Schedule social media post for future publishing |
| **Auth** | Bearer token required |
| **Input** | `{ content: string, platforms: string[], scheduled_at: string (ISO), media_ids?: string[], hashtags?: string[] }` |
| **Output** | `{ postId: string, status: "scheduled", platforms: object }` |
| **Tables** | `social_posts`, `social_post_targets` |

#### `POST /functions/v1/social-run-scheduler`

| Field | Detail |
|-------|--------|
| **Purpose** | Background job: publish due scheduled social posts |
| **Auth** | Service role (internal, invoked by pg_cron every minute) |
| **Input** | None |
| **Output** | `{ processed: number, failed: number }` |
| **Tables** | `social_posts`, `social_accounts`, `social_post_targets`, `workflow_executions` |
| **External APIs** | LinkedIn Posts API, Meta Graph API |

---

### 3.4 Lead & Data

#### `POST /functions/v1/apollo-search`

| Field | Detail |
|-------|--------|
| **Purpose** | Search Apollo.io for B2B leads |
| **Auth** | Bearer token required |
| **Input** | `{ domain?: string, companyName?: string, filters?: object }` |
| **Output** | `{ leads: Array, total: number }` |
| **Tables** | None (search only) |
| **External APIs** | Apollo.io API |

#### `POST /functions/v1/apollo-import`

| Field | Detail |
|-------|--------|
| **Purpose** | Import leads from Apollo.io search results |
| **Auth** | Bearer token required |
| **Input** | `{ leads: Array, mappings: object }` |
| **Output** | `{ imported: number, skipped: number }` |
| **Tables** | `leads`, `import_batches` |

---

### 3.5 Image Generation

#### `POST /functions/v1/image-gen`

| Field | Detail |
|-------|--------|
| **Purpose** | Generate AI images for content |
| **Auth** | Bearer token required |
| **Input** | `{ action: "generate"\|"save-to-module", prompt: string, module_id?: string, width?: number, height?: number, brandColors?: { primary, secondary, accent } }` |
| **Output** | `{ imageUrl: string }` or `{ saved: boolean }` |
| **Tables** | `image_gen_assets` (if saving) |
| **External APIs** | Configured image provider (DALL-E 3, Stability AI, etc.) |
| **Storage** | `image-gen-assets` bucket |
| **Rate Limit** | 10 requests/min per user |

---

### 3.6 Billing

#### `POST /functions/v1/billing-webhook`

| Field | Detail |
|-------|--------|
| **Purpose** | Receive Stripe webhook events |
| **Auth** | Stripe signature verification (HMAC-SHA256) |
| **Input** | Stripe event JSON |
| **Output** | `{ received: true }` |
| **Tables** | `subscriptions`, `profiles`, `audit_logs` |
| **Events Handled** | `invoice.created`, `invoice.payment_succeeded`, `customer.subscription.updated`, `customer.subscription.deleted` |

#### `POST /functions/v1/billing-create-invoice`

| Field | Detail |
|-------|--------|
| **Purpose** | Create invoice in Stripe |
| **Auth** | Bearer token required |
| **Input** | `{ planName: string, billingCycle: string, customAmount?: number }` |
| **Output** | `{ invoiceId: string, total: number, dueDate: string }` |
| **Tables** | `invoices`, `subscriptions`, `invoice_line_items` |
| **External APIs** | Stripe Invoices API |

#### `POST /functions/v1/billing-actions`

| Field | Detail |
|-------|--------|
| **Purpose** | Perform billing operations (upgrade, downgrade, cancel) |
| **Auth** | Bearer token required |
| **Input** | `{ action: "upgrade"\|"downgrade"\|"cancel", newPlan?: string }` |
| **Output** | `{ success: boolean, plan: string }` |
| **Tables** | `subscriptions`, `profiles`, `audit_logs` |
| **External APIs** | Stripe Subscriptions API |

---

### 3.7 Integration Validation

#### `POST /functions/v1/validate-integration`

| Field | Detail |
|-------|--------|
| **Purpose** | Test email provider credentials |
| **Auth** | Bearer token required |
| **Input** | `{ provider: string, credentials: object }` |
| **Output** | `{ valid: boolean, message: string }` |
| **External APIs** | Varies by provider (SendGrid, Gmail, SMTP, Mailchimp) |
| **Tables** | None (validation only) |

---

### 3.8 Webhooks (Inbound)

#### `POST /functions/v1/webhooks-sendgrid`

| Field | Detail |
|-------|--------|
| **Purpose** | Receive SendGrid event webhooks |
| **Auth** | None (webhook from SendGrid) |
| **Input** | SendGrid event array |
| **Output** | `200 OK` |
| **Tables** | `email_events`, `tracking_events` |
| **Events** | bounce, click, open, delivered, deferred, dropped, spam_report, unsubscribe |

#### `POST /functions/v1/webhooks-mailchimp`

| Field | Detail |
|-------|--------|
| **Purpose** | Receive Mailchimp event webhooks |
| **Auth** | None (webhook from Mailchimp) |
| **Input** | Mailchimp event data (POST) or validation challenge (GET) |
| **Output** | `200 OK` |
| **Tables** | `email_events`, `tracking_events` |

---

## 4. Page → Endpoint Mapping

| Page | Supabase Tables | RPCs | Edge Functions | External APIs |
|------|----------------|------|----------------|---------------|
| **ClientDashboard** | `leads`, `ai_usage_logs`, `audit_logs`, `social_posts`, `email_messages`, `email_events` | `consume_credits` | — | Gemini (insights, research, content) |
| **LeadManagement** | `leads`, `lead_stage_colors`, `lead_color_overrides` | `import_leads_batch` | `send-email` | HubSpot API, Salesforce API |
| **LeadIntelligence** | `leads`, `email_messages`, `email_events`, `email_links`, `workflows`, `workflow_executions` | — | — | Gemini (research, insights) |
| **ContentGen** | `leads`, `ai_usage_logs`, `audit_logs`, `scheduled_emails` | — | `send-email` | Gemini (content generation) |
| **ContentStudio** | `leads` | — | `send-email` | Gemini (content generation) |
| **AnalyticsPage** | `email_analytics_summary`, `email_messages`, `email_events`, `scheduled_emails`, `workflows`, `workflow_executions`, `blog_posts`, `ai_usage_logs`, `leads` | — | — | Gemini (insights) |
| **AutomationPage** | `workflows`, `workflow_executions`, `email_templates`, `leads`, `scheduled_emails`, `webhooks`, `integrations` | — | — | Gemini (optimization), HubSpot, Salesforce, User webhooks |
| **SocialScheduler** | `social_accounts` | — | `social-post-now`, `social-schedule`, `meta-oauth-start`, `linkedin-oauth-start` | Meta API, LinkedIn API |
| **TeamHubPage** | `teamhub_boards`, `teamhub_lists`, `teamhub_cards`, `teamhub_activity`, `teamhub_comments`, `teamhub_card_members`, `teamhub_flow_members`, `teamhub_invites`, `profiles` | `teamhub_user_flow_role` | — | — |
| **ApolloSearchPage** | `leads` | `import_leads_batch` | `apollo-search`, `apollo-import` | Apollo.io API |
| **BillingPage** | `plans`, `leads`, `audit_logs` | — | `billing-actions`, `billing-create-invoice` | Stripe |
| **IntegrationHub** | `integrations`, `webhooks`, `email_provider_configs` | — | `validate-integration`, `send-email` | Provider-specific validation |
| **AdminDashboard** | `leads`, `ai_usage_logs`, `subscriptions`, `profiles`, `support_sessions`, `support_audit_logs` | — | — | — |
| **BlogManager** | `blog_posts`, `blog_categories` | `get_category_post_counts` | — | — |
| **UserManagement** | `profiles` | — | — | — |
| **AIOperations** | `ai_usage_logs`, `ai_prompts` | — | — | — |
| **PromptLab** | `user_prompts`, `user_prompt_versions` | — | — | — |
| **AuditLogs** | `audit_logs` | — | — | — |
| **SystemHealth** | `profiles` | — | — | Backend `GET /health` |
| **BlogPage** (public) | `blog_posts` | — | — | — |
| **BlogPostPage** (public) | `blog_posts` | — | — | — |

---

## 5. Error Codes

### HTTP Status Codes (Edge Functions)

| Code | Meaning | When |
|------|---------|------|
| `200` | Success | Normal response |
| `301/302` | Redirect | Tracking redirect, OAuth callback |
| `400` | Bad Request | Missing/invalid parameters |
| `401` | Unauthorized | Missing or invalid Bearer token |
| `403` | Forbidden | Insufficient permissions (wrong role, not team member) |
| `404` | Not Found | Resource doesn't exist |
| `429` | Too Many Requests | Rate limit exceeded (image-gen: 10/min) |
| `500` | Internal Server Error | Unhandled exception |

### RPC Error Patterns

| Error | Context | Meaning |
|-------|---------|---------|
| `PGRST116` | Any RPC | No rows returned (resource not found) |
| `23505` | `import_leads_batch`, `connect_sender_account` | Unique constraint violation (duplicate) |
| `42501` | Any table operation | RLS policy violation (unauthorized access) |
| `P0001` | `import_leads_batch` | Plan contact limit exceeded |

### Stripe Webhook Events

| Event | Action |
|-------|--------|
| `invoice.payment_succeeded` | Activate/renew subscription, reset credits |
| `customer.subscription.updated` | Update plan, adjust limits |
| `customer.subscription.deleted` | Mark subscription canceled |
| `invoice.payment_failed` | Mark subscription `past_due` |
