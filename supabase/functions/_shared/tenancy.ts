// Canonical tenant resolution for edge functions.
//
// Resolves a user's workspace via MEMBERSHIP (workspace_members), never the
// legacy `workspace_id == user.id` assumption. Falls back to the user id only
// when no membership row exists (self-heal / edge cases), so writes to a
// NOT-NULL workspace_id column never fail. As multi-workspace membership lands,
// this is the single place to evolve the resolution rule.
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export async function resolveWorkspaceId(
  admin: SupabaseClient,
  userId: string,
): Promise<string> {
  const { data } = await admin
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userId)
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data?.workspace_id as string | undefined) ?? userId;
}
