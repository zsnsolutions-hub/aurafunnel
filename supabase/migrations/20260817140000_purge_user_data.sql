-- ============================================================================
-- 20260817140000_purge_user_data.sql
-- P0/privacy: real account deletion. There are NO foreign keys to auth.users,
-- so deleting the auth user erases nothing; user data is linked by the
-- workspace_id == user.id convention plus user_id/owner_id/client_id/created_by.
--
-- purge_user_data(p_uid) hard-deletes every row scoped to the user across all
-- public base tables. It does NOT use session_replication_role (that GUC is
-- superuser-only and service_role can't set it). Instead it deletes each table
-- with a per-table savepoint and retries any table blocked by a foreign key on
-- a later pass — CASCADE/SET NULL FKs never block, and the few NO ACTION FKs
-- clear once their referencing (also user-owned) rows are gone. Converges in a
-- handful of passes.
--
-- Callable by service_role ONLY (the delete-account edge function passes the
-- authenticated caller's own uid) — never by anon/authenticated directly.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.purge_user_data(p_uid uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tbl      text;
  v_col      text;
  v_deleted  bigint;
  v_total    bigint := 0;
  v_blocked  int;
  v_pass     int := 0;
  scope_cols text[] := ARRAY['workspace_id','user_id','owner_id','client_id','created_by'];
BEGIN
  IF p_uid IS NULL THEN
    RAISE EXCEPTION 'p_uid is required';
  END IF;

  FOR v_pass IN 1..8 LOOP
    v_blocked := 0;

    -- Identity row (keyed by id; cascades to its child tables).
    BEGIN
      DELETE FROM public.profiles WHERE id = p_uid;
      GET DIAGNOSTICS v_deleted = ROW_COUNT; v_total := v_total + v_deleted;
    EXCEPTION WHEN foreign_key_violation THEN
      v_blocked := v_blocked + 1;
    END;

    -- Every public base table that scopes data to a user, by each such column.
    FOR v_tbl, v_col IN
      SELECT c.table_name, c.column_name
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_schema = c.table_schema AND t.table_name = c.table_name
      WHERE c.table_schema = 'public'
        AND t.table_type = 'BASE TABLE'
        AND c.column_name = ANY(scope_cols)
        AND c.table_name <> 'profiles'
    LOOP
      BEGIN
        EXECUTE format('DELETE FROM public.%I WHERE %I = $1', v_tbl, v_col) USING p_uid;
        GET DIAGNOSTICS v_deleted = ROW_COUNT; v_total := v_total + v_deleted;
      EXCEPTION WHEN foreign_key_violation THEN
        v_blocked := v_blocked + 1;  -- retry on a later pass
      END;
    END LOOP;

    EXIT WHEN v_blocked = 0;
  END LOOP;

  IF v_blocked > 0 THEN
    RAISE EXCEPTION 'purge_user_data: % table(s) still blocked after % passes', v_blocked, v_pass;
  END IF;

  RETURN jsonb_build_object('success', true, 'rows_deleted', v_total, 'passes', v_pass);
END;
$$;

REVOKE ALL ON FUNCTION public.purge_user_data(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purge_user_data(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.purge_user_data(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.purge_user_data(uuid) TO service_role;
