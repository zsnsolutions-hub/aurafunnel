-- ============================================================================
-- Schema refinement: drop redundant indexes.
--
-- Each index dropped here is fully covered by another RETAINED index, so there
-- is no query-plan regression — only reduced write-amplification on INSERT/
-- UPDATE and reclaimed storage. Three categories:
--   (1) Exact duplicates — two identical indexes on the same column.
--   (2) Plain index duplicating a UNIQUE constraint's index on the same column.
--   (3) Single-column index that is the leading column of a UNIQUE composite
--       (the composite serves equality/range lookups on that column).
--
-- NOT touched (verified as genuinely distinct, not redundant):
--   • idx_api_keys_active, idx_sender_accounts_default, idx_social_posts_scheduled,
--     idx_enrollments_next, idx_team_invites_pending_email, idx_item_leads_active_*
--     — PARTIAL indexes serving a different (filtered) query shape.
--   • idx_leads_*_search, idx_leads_client_email/linkedin — expression/partial
--     indexes on different columns (false-positive prefix match).
--
-- Idempotent (DROP INDEX IF EXISTS). Reversible: recreate any index if a future
-- query shape needs it.
-- ============================================================================

-- (1) Exact duplicates ───────────────────────────────────────────────────────
drop index if exists public.idx_social_posts_user;          -- == idx_social_posts_user_id (user_id)
drop index if exists public.idx_social_post_targets_post;   -- == idx_social_post_targets_post_id (post_id)
drop index if exists public.idx_tracking_events_link;       -- == idx_tracking_events_link_id (link_id)
drop index if exists public.idx_tracking_links_post;        -- == idx_tracking_links_post_id (post_id)
drop index if exists public.idx_tracking_links_user;        -- == idx_tracking_links_user_id (user_id)

-- (2) Plain index duplicating a UNIQUE constraint index ──────────────────────
drop index if exists public.idx_sender_account_secrets_account; -- covered by sender_account_secrets_sender_account_id_key
drop index if exists public.idx_subscriptions_user_id;         -- covered by subscriptions_user_id_key
drop index if exists public.idx_blog_posts_slug;               -- covered by blog_posts_slug_key
drop index if exists public.idx_tracking_links_slug;           -- covered by tracking_links_slug_key
drop index if exists public.idx_tracking_links_short_code;     -- covered by tracking_links_short_code_key
drop index if exists public.idx_workspace_ai_usage_lookup;     -- covered by workspace_ai_usage_unique (workspace_id, month_year)
drop index if exists public.idx_automation_step_runs_plan;     -- covered by automation_step_runs_plan_id_step_id_attempt_count_key

-- (3) Leading column of a UNIQUE composite ───────────────────────────────────
drop index if exists public.idx_business_members_business;     -- leading col of business_members_business_id_user_id_key
drop index if exists public.idx_plans_key;                     -- covered by plans_key_key (key)
drop index if exists public.idx_email_provider_configs_owner;  -- leading col of email_provider_configs_owner_id_provider_key
drop index if exists public.idx_integrations_owner;            -- leading col of integrations_owner_id_provider_key
drop index if exists public.idx_lead_color_overrides_owner;    -- leading col of lead_color_overrides_owner_id_lead_id_key
drop index if exists public.idx_lead_stage_colors_owner;       -- leading col of lead_stage_colors_owner_id_stage_key
drop index if exists public.idx_lead_tag_assignments_lead;     -- leading col of lead_tag_assignments_lead_id_tag_id_key
drop index if exists public.idx_sequence_enrollments_sequence; -- leading col of sequence_enrollments_sequence_id_lead_id_key
drop index if exists public.idx_steps_sequence;                -- leading col of sequence_steps_sequence_id_step_number_key
drop index if exists public.idx_tags_workspace;                -- leading col of tags_workspace_id_name_key
drop index if exists public.idx_team_invites_team;             -- leading col of team_invites_team_id_email_key
drop index if exists public.idx_team_members_team_id;          -- leading col of team_members_team_id_user_id_key
drop index if exists public.idx_teamhub_card_members_card;     -- leading col of teamhub_card_members_card_id_user_id_key
drop index if exists public.idx_workspace_invites_workspace;   -- leading col of workspace_invites_workspace_id_email_key
