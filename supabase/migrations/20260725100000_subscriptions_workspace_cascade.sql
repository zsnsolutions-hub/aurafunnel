-- ============================================================================
-- subscriptions.workspace_id → workspaces: switch ON DELETE NO ACTION → CASCADE.
--
-- Previously, deleting a workspace errored if it had a subscription row (the FK
-- blocked it). Since a subscription has no meaning without its workspace, cascade
-- the delete so tearing down a workspace also removes its billing row instead of
-- being blocked. Idempotent.
-- ============================================================================

alter table public.subscriptions
  drop constraint if exists subscriptions_workspace_id_fkey;

alter table public.subscriptions
  add constraint subscriptions_workspace_id_fkey
  foreign key (workspace_id) references public.workspaces(id) on delete cascade;
