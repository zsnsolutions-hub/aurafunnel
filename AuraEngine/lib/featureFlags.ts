// AuraEngine/lib/featureFlags.ts
//
// Generic workspace feature-flag check for the client (Growth Platform v2).
// Resolves the user's workspace then reads workspace_feature_flags via the
// workspace_has_flag RPC (lib/goals.isFlagEnabled). Fails closed (off) on error.

import { isFlagEnabled } from './goals';
import { resolveWorkspaceForUser } from './memory';

export async function workspaceFlagEnabled(userId: string, flagKey: string): Promise<boolean> {
  try {
    const ws = await resolveWorkspaceForUser(userId);
    return ws ? await isFlagEnabled(ws, flagKey) : false;
  } catch { return false; }
}
