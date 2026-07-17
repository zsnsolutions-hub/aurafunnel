// Canonical tenant resolution (client).
//
// Single entry point for resolving a user's workspace + active business.
// Delegates to the existing membership-based resolveWorkspaceForUser (in memory.ts)
// — it does NOT re-implement resolution — and exposes the active business from
// businessScope. Use these instead of hardcoding `workspace_id = user.id`.
//
// resolveWorkspaceId falls back to the user id only when no membership row exists
// (self-heal / edge cases), so writes to NOT-NULL workspace_id columns never fail.
// Today workspace_id == user.id for all data, so this is behaviour-preserving;
// it becomes correct automatically once true multi-workspace membership exists.
import { resolveWorkspaceForUser } from './memory';
import { activeBusinessId } from './businessScope';

export async function resolveWorkspaceId(userId: string): Promise<string> {
  return (await resolveWorkspaceForUser(userId)) ?? userId;
}

export async function resolveTenant(
  userId: string,
): Promise<{ workspaceId: string; businessId: string | null }> {
  return { workspaceId: await resolveWorkspaceId(userId), businessId: activeBusinessId() };
}
