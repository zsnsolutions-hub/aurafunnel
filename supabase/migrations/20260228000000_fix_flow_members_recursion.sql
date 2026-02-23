-- Fix: infinite recursion in teamhub_flow_members RLS policies
-- The old policies SELECT from teamhub_flow_members inside their own USING clause,
-- which triggers the same RLS check again → infinite loop.
-- Fix: use the SECURITY DEFINER function teamhub_user_flow_role() which bypasses RLS.

-- 1. Drop the broken policies on teamhub_flow_members
DROP POLICY IF EXISTS "member_select" ON teamhub_flow_members;
DROP POLICY IF EXISTS "member_insert" ON teamhub_flow_members;
DROP POLICY IF EXISTS "member_update" ON teamhub_flow_members;
DROP POLICY IF EXISTS "member_delete" ON teamhub_flow_members;

-- 2. Recreate using the SECURITY DEFINER helper (no recursion)
CREATE POLICY "member_select" ON teamhub_flow_members
  FOR SELECT USING (
    public.teamhub_user_flow_role(flow_id) IS NOT NULL
  );

CREATE POLICY "member_insert" ON teamhub_flow_members
  FOR INSERT WITH CHECK (
    public.teamhub_user_flow_role(flow_id) IN ('owner','admin')
  );

CREATE POLICY "member_update" ON teamhub_flow_members
  FOR UPDATE USING (
    public.teamhub_user_flow_role(flow_id) IN ('owner','admin')
  );

CREATE POLICY "member_delete" ON teamhub_flow_members
  FOR DELETE USING (
    public.teamhub_user_flow_role(flow_id) IN ('owner','admin')
  );

-- 3. Also fix the profiles policy that joins teamhub_flow_members
--    (it would also trigger the recursive RLS before this fix)
DROP POLICY IF EXISTS "Co-members can view profiles" ON profiles;

DO $$ BEGIN
  CREATE POLICY "Co-members can view profiles" ON profiles
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM teamhub_flow_members a
        WHERE a.user_id = auth.uid()
          AND public.teamhub_user_flow_role(a.flow_id) IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM teamhub_flow_members b
            WHERE b.flow_id = a.flow_id AND b.user_id = profiles.id
          )
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
