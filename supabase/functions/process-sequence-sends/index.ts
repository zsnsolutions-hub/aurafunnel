// supabase/functions/process-sequence-sends/index.ts
//
// The missing send stage of the email-sequence pipeline. process-email-writing-
// queue writes each run item's AI body and marks it 'written'; this function
// takes 'written' items whose send time is due (created_at + delay_days), sends
// them via send-email (auto-picking the workspace sender), and marks them 'sent'
// (or retries/fails). Invoked every minute by the invoke_sequence_sends cron.
//
// Deploy: supabase functions deploy process-sequence-sends

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const BATCH = 50;
const LOCK_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 3;

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

interface Item {
  id: string; run_id: string; lead_id: string; lead_email: string | null;
  ai_subject: string | null; ai_body_html: string | null;
  delay_days: number; attempt_count: number; created_at: string;
  step_index: number | null; subject_variant: number | null;
}
interface Run { id: string; owner_id: string; status: string; sequence_config: Record<string, unknown> | null }

// Only send within the campaign's configured hours/weekdays (in its timezone).
// No window configured → send anytime.
function inSendWindow(cfg: Record<string, unknown> | null): boolean {
  const w = (cfg?.sendWindow ?? null) as { start?: number; end?: number; weekdaysOnly?: boolean; timezone?: string } | null;
  if (!w || w.start == null || w.end == null) return true;
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: w.timezone || "UTC", hour: "numeric", hour12: false, weekday: "short" }).formatToParts(new Date());
    let hour = parseInt(parts.find(p => p.type === "hour")?.value ?? "0", 10); if (hour === 24) hour = 0;
    const wd = parts.find(p => p.type === "weekday")?.value ?? "";
    if (w.weekdaysOnly && (wd === "Sat" || wd === "Sun")) return false;
    return w.start <= w.end ? (hour >= w.start && hour < w.end) : (hour >= w.start || hour < w.end);
  } catch { return true; }
}

serve(async (req) => {
  const pre = handleCors(req); if (pre) return pre;
  const cors = getCorsHeaders(req);
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const nowIso = new Date().toISOString();

  try {
    // Reclaim items stuck mid-send from a previous crashed invocation.
    await admin.from("email_sequence_run_items")
      .update({ status: "written", locked_until: null })
      .eq("status", "sending").lt("locked_until", nowIso);

    const { data: rawItems } = await admin.from("email_sequence_run_items")
      .select("id, run_id, lead_id, lead_email, ai_subject, ai_body_html, delay_days, attempt_count, created_at, step_index, subject_variant")
      .eq("status", "written")
      .limit(BATCH);

    const due = ((rawItems ?? []) as Item[]).filter(
      it => new Date(it.created_at).getTime() + (it.delay_days ?? 0) * 86_400_000 <= Date.now(),
    );
    if (due.length === 0) return json({ sent: 0, failed: 0, message: "nothing due" }, 200, cors);

    const runIds = [...new Set(due.map(i => i.run_id))];
    const { data: runs } = await admin.from("email_sequence_runs")
      .select("id, owner_id, status, sequence_config").in("id", runIds);
    const runMap = new Map<string, Run>(((runs ?? []) as Run[]).map(r => [r.id, r]));

    let sent = 0, failed = 0;
    const touched = new Set<string>();

    for (const it of due) {
      const run = runMap.get(it.run_id);
      if (!run || run.status === "paused" || run.status === "canceled") continue;
      // Hold until inside the campaign's send window (re-checked each cron).
      if (!inSendWindow(run.sequence_config)) continue;

      // Atomic claim so concurrent invocations can't double-send.
      const { data: claimed } = await admin.from("email_sequence_run_items")
        .update({ status: "sending", locked_until: new Date(Date.now() + LOCK_MS).toISOString(), updated_at: nowIso })
        .eq("id", it.id).eq("status", "written").select("id");
      if (!claimed || claimed.length === 0) continue;
      touched.add(it.run_id);

      if (!it.lead_email || !it.ai_body_html) {
        await admin.from("email_sequence_run_items")
          .update({ status: "failed", error_message: "Missing recipient or written body", locked_until: null, updated_at: new Date().toISOString() })
          .eq("id", it.id);
        failed++; continue;
      }

      const cfg = run.sequence_config ?? {};
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
          body: JSON.stringify({
            owner_id: run.owner_id,
            lead_id: it.lead_id,
            to_email: it.lead_email,
            subject: it.ai_subject ?? "",
            html_body: it.ai_body_html,
            provider: (cfg.provider as string) || undefined,
            from_email: (cfg.from_email as string) || undefined,
            track_opens: true,
            track_clicks: true,
            // Campaign attribution for A/B analytics.
            sequence_id: (cfg.campaignId as string) || undefined,
            sequence_step: it.step_index ?? undefined,
            subject_variant: it.subject_variant ?? undefined,
          }),
        });
        const result = await res.json().catch(() => ({} as { success?: boolean; error?: string }));

        if (res.ok && result.success) {
          await admin.from("email_sequence_run_items")
            .update({ status: "sent", locked_until: null, error_message: null, updated_at: new Date().toISOString() })
            .eq("id", it.id);
          sent++;
          const campaignId = cfg.campaignId as string | undefined;
          if (campaignId) await admin.rpc("bump_sequence_total_sent", { p_campaign_id: campaignId });
        } else {
          const attempts = (it.attempt_count ?? 0) + 1;
          await admin.from("email_sequence_run_items").update({
            status: attempts >= MAX_ATTEMPTS ? "failed" : "written",
            attempt_count: attempts,
            error_message: String(result.error ?? `send-email failed (HTTP ${res.status})`).slice(0, 300),
            locked_until: null, updated_at: new Date().toISOString(),
          }).eq("id", it.id);
          failed++;
        }
      } catch (e) {
        const attempts = (it.attempt_count ?? 0) + 1;
        await admin.from("email_sequence_run_items").update({
          status: attempts >= MAX_ATTEMPTS ? "failed" : "written",
          attempt_count: attempts,
          error_message: (e as Error).message.slice(0, 300),
          locked_until: null, updated_at: new Date().toISOString(),
        }).eq("id", it.id);
        failed++;
      }
    }

    // Refresh run counters and complete runs with nothing left in flight.
    for (const rid of touched) {
      const cnt = async (status: string | string[]) => {
        let q = admin.from("email_sequence_run_items").select("id", { count: "exact", head: true }).eq("run_id", rid);
        q = Array.isArray(status) ? q.in("status", status) : q.eq("status", status);
        return (await q).count ?? 0;
      };
      const done = await cnt("sent");
      const failedC = await cnt("failed");
      const inFlight = await cnt(["pending", "writing", "written", "sending"]);
      const patch: Record<string, unknown> = { items_done: done, items_failed: failedC, updated_at: new Date().toISOString() };
      if (inFlight === 0) { patch.status = "completed"; patch.completed_at = new Date().toISOString(); }
      await admin.from("email_sequence_runs").update(patch).eq("id", rid);
    }

    return json({ sent, failed, considered: due.length }, 200, cors);
  } catch (e) {
    return json({ error: (e as Error).message }, 500, cors);
  }
});
