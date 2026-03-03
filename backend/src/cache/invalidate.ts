/**
 * Cache invalidation helpers — delete Redis keys when data changes.
 *
 * Called by workers after completing jobs, and can be called by
 * edge functions via the backend API.
 */

import { redis } from './redis.js';
import { invalidationPatterns } from './keys.js';

/**
 * Delete a list of Redis keys. Supports glob patterns via KEYS command.
 */
async function deleteKeys(patterns: string[]): Promise<number> {
  let deleted = 0;

  for (const pattern of patterns) {
    if (pattern.includes('*')) {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        deleted += await redis.del(...keys);
      }
    } else {
      deleted += await redis.del(pattern);
    }
  }

  return deleted;
}

/** Invalidate all caches for a workspace */
export async function invalidateWorkspace(workspaceId: string): Promise<void> {
  const count = await deleteKeys(invalidationPatterns.workspace(workspaceId));
  if (count > 0) console.log(`[Cache] Invalidated ${count} keys for workspace ${workspaceId}`);
}

/** Invalidate email-related caches after send/bounce/open events */
export async function invalidateEmail(workspaceId: string): Promise<void> {
  await deleteKeys(invalidationPatterns.email(workspaceId));
}

/** Invalidate lead caches after import or enrichment */
export async function invalidateLeads(workspaceId: string): Promise<void> {
  await deleteKeys(invalidationPatterns.leads(workspaceId));
}

/** Invalidate plan caches after subscription change */
export async function invalidatePlan(workspaceId: string): Promise<void> {
  await deleteKeys(invalidationPatterns.plan(workspaceId));
}

/** Invalidate integration caches after connect/disconnect */
export async function invalidateIntegration(workspaceId: string): Promise<void> {
  await deleteKeys(invalidationPatterns.integration(workspaceId));
}
