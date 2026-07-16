-- ============================================================================
-- 20260817120000_secure_team_invite_accept.sql
-- Security P1: team_members had an INSERT policy WITH CHECK (auth.uid()=user_id)
-- and nothing else — so any user could insert themselves into an ARBITRARY
-- team_id (self-join a team they were never invited to). The client's accept
-- flow also didn't verify the invite belonged to the caller server-side.
--
-- Fix: a SECURITY DEFINER accept_team_invite() RPC validates that the invite is
-- addressed to the caller's own email, is still pending, and hasn't expired,
-- then joins with the role FROM THE INVITE (never a caller-chosen role) and marks
-- the invite accepted. The permissive INSERT policy is dropped so joins can only
-- happen through this RPC. (No team-creation path inserts team_members directly.)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.accept_team_invite(p_invite_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_email text := public.auth_email();
  v_inv   public.team_invites%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Not authenticated');
  END IF;

  SELECT * INTO v_inv FROM public.team_invites WHERE id = p_invite_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Invite not found');
  END IF;

  -- Must be addressed to the caller's own email (case-insensitive), pending, unexpired.
  IF lower(v_inv.email) IS DISTINCT FROM lower(coalesce(v_email, '')) THEN
    RETURN jsonb_build_object('success', false, 'message', 'This invite is not for you');
  END IF;
  IF v_inv.status IS DISTINCT FROM 'pending' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Invite is no longer pending');
  END IF;
  IF v_inv.expires_at IS NOT NULL AND v_inv.expires_at <= now() THEN
    RETURN jsonb_build_object('success', false, 'message', 'Invite has expired');
  END IF;

  -- Idempotent join with the invite's role (invites only carry admin|member,
  -- so a caller can never escalate to owner through this path).
  IF NOT EXISTS (
    SELECT 1 FROM public.team_members WHERE team_id = v_inv.team_id AND user_id = v_uid
  ) THEN
    INSERT INTO public.team_members (team_id, user_id, role)
    VALUES (v_inv.team_id, v_uid, coalesce(v_inv.role, 'member'));
  END IF;

  UPDATE public.team_invites SET status = 'accepted' WHERE id = p_invite_id;

  RETURN jsonb_build_object('success', true, 'team_id', v_inv.team_id);
END;
$$;

REVOKE ALL ON FUNCTION public.accept_team_invite(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_team_invite(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.accept_team_invite(uuid) TO authenticated, service_role;

-- Remove the self-join vector. Joins now go through accept_team_invite (which
-- bypasses RLS as SECURITY DEFINER). Owner-add on team creation, if built later,
-- should use its own SECURITY DEFINER create_team RPC.
DROP POLICY IF EXISTS "Users can add themselves as team members" ON public.team_members;
