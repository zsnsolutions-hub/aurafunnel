-- ============================================================================
-- 20260817150000_lock_secret_columns.sql
-- P1: third-party secrets were plaintext AND readable by the browser
--   - integrations.credentials (Slack/HubSpot/Salesforce/GA/Stripe keys)
--   - email_provider_configs.api_key / smtp_pass / webhook_key
--   - social_accounts.*_access_token_encrypted (stored raw despite the name)
-- The client read these back (select *) and prefilled forms with the secrets.
--
-- Fix (column-level privileges): REVOKE the table-wide SELECT from anon/
-- authenticated and re-GRANT SELECT on the NON-secret columns only. A table
-- grant overrides a column REVOKE, so the table grant must be removed first.
-- service_role / postgres keep full access (edge functions read the secrets for
-- validation/sending/publishing). INSERT/UPDATE are untouched, so users can
-- still SAVE secrets — they just can't read them back.
--
-- Client code was updated in the same change to select only these safe columns.
-- ============================================================================

-- integrations: hide `credentials`
REVOKE SELECT ON public.integrations FROM authenticated, anon;
GRANT  SELECT (id, owner_id, provider, category, status, metadata, created_at, updated_at)
  ON public.integrations TO authenticated;

-- email_provider_configs: hide api_key / smtp_pass / webhook_key
REVOKE SELECT ON public.email_provider_configs FROM authenticated, anon;
GRANT  SELECT (id, owner_id, provider, is_active, smtp_host, smtp_port, smtp_user,
               from_email, from_name, created_at, updated_at)
  ON public.email_provider_configs TO authenticated;

-- social_accounts: hide the OAuth access tokens
REVOKE SELECT ON public.social_accounts FROM authenticated, anon;
GRANT  SELECT (id, user_id, provider, meta_page_id, meta_page_name, meta_ig_user_id,
               meta_ig_username, linkedin_member_urn, linkedin_org_urn,
               linkedin_org_name, token_expires_at, created_at)
  ON public.social_accounts TO authenticated;
