// supabase/functions/delete-account/index.ts
//
// Real, irreversible account deletion (GDPR erasure). A user can delete ONLY
// their own account: the uid comes from the verified JWT, never from the body.
//
//   1. Authenticate the caller's JWT -> uid.
//   2. Require an explicit { confirm: true } in the body.
//   3. purge_user_data(uid): hard-delete all of the user's rows across public
//      base tables (service-role-only RPC).
//   4. auth.admin.deleteUser(uid): remove the auth identity + sessions.
//
// Deploy: supabase functions deploy delete-account
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { adminClient, bearerToken } from "../_shared/auth.ts";

serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  const cors = getCorsHeaders(req);
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const token = bearerToken(req);
  if (!token) return json({ error: "Missing Authorization" }, 401);

  const admin = adminClient();
  const { data: userRes, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !userRes?.user) return json({ error: "Invalid token" }, 401);
  const uid = userRes.user.id;

  const body = await req.json().catch(() => ({} as { confirm?: boolean }));
  if (body.confirm !== true) {
    return json({ error: "Deletion must be confirmed ({ confirm: true })." }, 400);
  }

  try {
    // 1. Purge all of the user's data across the public schema.
    const { data: purge, error: purgeErr } = await admin.rpc("purge_user_data", { p_uid: uid });
    if (purgeErr) {
      console.error("purge_user_data failed:", purgeErr.message);
      return json({ error: "Failed to purge account data" }, 500);
    }

    // 2. Remove the auth identity (login, sessions, identities).
    const { error: delErr } = await admin.auth.admin.deleteUser(uid);
    if (delErr) {
      console.error("auth deleteUser failed:", delErr.message);
      return json({ error: "Data purged but auth user removal failed; contact support." }, 500);
    }

    return json({ success: true, rows_deleted: (purge as { rows_deleted?: number })?.rows_deleted ?? null });
  } catch (e) {
    console.error("delete-account error:", (e as Error).message);
    return json({ error: "Internal error" }, 500);
  }
});
