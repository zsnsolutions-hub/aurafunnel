// supabase/functions/ab-autopause/index.ts
//
// A/B auto-optimize. For each opted-in campaign, per step with subject variants:
// once one variant is a statistically clear winner (min sample + one-sided
// two-proportion z-test on open rate), reassign all NOT-yet-sent items of the
// losing variants to the winner — so the rest of the sequence uses the winner.
// Already-sent messages are untouched. Invoked by the invoke_ab_autopause cron.
//
// Deploy: supabase functions deploy ab-autopause

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const MIN_PER_VARIANT = 15;   // each compared variant needs this many sends
const MIN_TOTAL = 40;         // and this many across the step
const Z_THRESHOLD = 1.64;     // one-sided ~95%

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

function zTest(x1: number, n1: number, x2: number, n2: number): number {
  if (!n1 || !n2) return 0;
  const p1 = x1 / n1, p2 = x2 / n2, p = (x1 + x2) / (n1 + n2);
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  return se === 0 ? 0 : (p1 - p2) / se;
}

function nl2brHtml(s: string): string {
  return /<(p|br|div|ul|ol|table|a|strong|em|span|h[1-6])\b/i.test(s || "") ? (s || "") : (s || "").replace(/\n/g, "<br>");
}

// Mirrors mergeFields in start-email-sequence-run (verbatim re-merge on switch).
function mergeFields(tpl: string, lead: Record<string, unknown>, fromName = ""): string {
  const name = String(lead.name ?? "");
  const first = name.trim().split(/\s+/)[0] || "there";
  const map: Record<string, string> = {
    first_name: first, last_name: name.trim().split(/\s+/).slice(1).join(" "),
    name: name || "there", full_name: name || "there", company: String(lead.company ?? "") || "your company",
    title: String(lead.title ?? ""), industry: String(lead.industry ?? ""), location: String(lead.location ?? ""),
    website: String(lead.website ?? ""), linkedin: String(lead.linkedin ?? ""), source: String(lead.source ?? ""),
    company_size: String(lead.company_size ?? ""), email: String(lead.email ?? ""), phone: String(lead.phone ?? ""), your_name: fromName,
  };
  const custom = (lead.custom_fields ?? {}) as Record<string, unknown>;
  return (tpl || "").replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (m, k) => {
    const key = String(k).toLowerCase();
    if (key.startsWith("custom.")) { const v = custom[key.slice(7)]; return v == null ? "" : String(v); }
    return key in map ? map[key] : m;
  });
}

serve(async () => {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  try {
    const { data: campaigns } = await admin.from("email_sequences")
      .select("id, status").eq("ab_auto_optimize", true).in("status", ["active", "processing"]);

    let switched = 0; const outcomes: string[] = [];
    for (const c of (campaigns ?? []) as { id: string }[]) {
      const { data: steps } = await admin.from("sequence_steps")
        .select("step_number, subject, subject_variants, body_html, body_variants").eq("sequence_id", c.id);
      const abSteps = (steps ?? []).filter((s: { subject_variants?: string[]; body_variants?: string[] }) =>
        (s.subject_variants?.length ?? 0) > 0 || (s.body_variants?.length ?? 0) > 0);
      if (!abSteps.length) continue;

      const { data: runs } = await admin.from("email_sequence_runs").select("id").eq("sequence_config->>campaignId", c.id);
      const runIds = (runs ?? []).map((r: { id: string }) => r.id);
      if (!runIds.length) continue;

      for (const step of abSteps as { step_number: number; subject: string; subject_variants: string[]; body_html: string; body_variants: string[] }[]) {
        // Body differences drive clicks, not opens → judge body tests by click rate.
        const useClicks = (step.body_variants?.length ?? 0) > 0;
        const { data: msgs } = await admin.from("email_messages")
          .select("id, subject_variant").eq("sequence_id", c.id).eq("sequence_step", step.step_number);
        if (!msgs || msgs.length < MIN_TOTAL) continue;

        const byVar = new Map<number, { sent: number; ids: string[] }>();
        for (const m of msgs as { id: string; subject_variant: number | null }[]) {
          const v = m.subject_variant ?? 0;
          const e = byVar.get(v) ?? { sent: 0, ids: [] };
          e.sent++; e.ids.push(m.id); byVar.set(v, e);
        }
        const allIds = (msgs as { id: string }[]).map(m => m.id);
        const hit = new Set<string>();
        const evType = useClicks ? "click" : "open";
        for (let i = 0; i < allIds.length; i += 500) {
          const { data: ev } = await admin.from("email_events").select("message_id").eq("event_type", evType).in("message_id", allIds.slice(i, i + 500));
          for (const e of (ev ?? []) as { message_id: string }[]) hit.add(e.message_id);
        }
        const cand = [...byVar.entries()]
          .map(([variant, e]) => ({ variant, sent: e.sent, wins: e.ids.filter(id => hit.has(id)).length }))
          .filter(v => v.sent >= MIN_PER_VARIANT);
        if (cand.length < 2) continue;
        cand.sort((a, b) => (b.wins / b.sent) - (a.wins / a.sent));
        const leader = cand[0], runner = cand[1];
        if (zTest(leader.wins, leader.sent, runner.wins, runner.sent) < Z_THRESHOLD) continue;

        const winner = leader.variant;
        const winnerSubject = winner === 0 ? step.subject : (step.subject_variants?.[winner - 1] ?? step.subject);
        const winnerBody = winner === 0 ? step.body_html : (step.body_variants?.[winner - 1] ?? step.body_html);

        // Reassign not-yet-sent losers → winner (subject + body).
        const { data: items } = await admin.from("email_sequence_run_items")
          .select("id, status, lead_name, lead_company, lead_context")
          .in("run_id", runIds).eq("step_index", step.step_number)
          .neq("subject_variant", winner).in("status", ["pending", "written"]);
        for (const it of (items ?? []) as { id: string; status: string; lead_name: string; lead_company: string; lead_context: Record<string, unknown> }[]) {
          const patch: Record<string, unknown> = { subject_variant: winner, template_subject: winnerSubject, template_body: winnerBody, updated_at: new Date().toISOString() };
          if (it.status === "written") {
            const lead = { name: it.lead_name, company: it.lead_company, ...(it.lead_context ?? {}) };
            patch.ai_subject = mergeFields(winnerSubject, lead);
            patch.ai_body_html = nl2brHtml(mergeFields(winnerBody, lead));
          }
          await admin.from("email_sequence_run_items").update(patch).eq("id", it.id);
          switched++;
        }
        outcomes.push(`${c.id.slice(0, 8)} step ${step.step_number}: winner ${String.fromCharCode(65 + winner)} by ${evType}, ${items?.length ?? 0} reassigned`);
      }
    }
    return json({ switched, outcomes });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
