-- ============================================================================
-- 20260817130000_p2_rls_hardening.sql
-- P2 authorization hardening (audit 2026-07-16):
--   1. teamhub_flow_members role escalation — the UPDATE policy let any
--      owner/admin set ANY member's role, including promoting to 'owner' or
--      demoting the real owner. Now: admins can only modify non-owner rows and
--      cannot promote anyone to 'owner'; only the owner can grant/change 'owner'.
--   2. workspace_feature_flags self-serve — any workspace member could INSERT/
--      UPDATE their workspace's flags. Restrict writes to owner/admin (reads
--      stay open to members). Solo users are 'owner', so no behaviour change.
--   3. business_profiles — any business member could edit the AI "brain".
--      Restrict writes to business admins; members keep read access.
-- ============================================================================

-- 1. Team Hub member role updates -------------------------------------------
DROP POLICY IF EXISTS "member_update" ON public.teamhub_flow_members;
CREATE POLICY "member_update" ON public.teamhub_flow_members
  FOR UPDATE
  USING (
    teamhub_user_flow_role(board_id) = ANY (ARRAY['owner','admin'])
    -- admins may not modify an existing owner row; only the owner can
    AND (role <> 'owner' OR teamhub_user_flow_role(board_id) = 'owner')
  )
  WITH CHECK (
    -- new role may be 'owner' only when the actor is the owner
    role <> 'owner' OR teamhub_user_flow_role(board_id) = 'owner'
  );

-- 2. Workspace feature flags: owner/admin writes only -----------------------
DROP POLICY IF EXISTS "wff_upsert" ON public.workspace_feature_flags;
CREATE POLICY "wff_upsert" ON public.workspace_feature_flags
  FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid() AND role IN ('owner','admin')
    )
  );

DROP POLICY IF EXISTS "wff_update" ON public.workspace_feature_flags;
CREATE POLICY "wff_update" ON public.workspace_feature_flags
  FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid() AND role IN ('owner','admin')
    )
  );

-- 3. business_profiles: admin-only writes (members keep read via "bp read") --
DROP POLICY IF EXISTS "bp write" ON public.business_profiles;
CREATE POLICY "bp write" ON public.business_profiles
  FOR ALL
  USING (is_business_admin(business_id))
  WITH CHECK (is_business_admin(business_id));
