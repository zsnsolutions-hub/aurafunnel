// supabase/functions/goal-executor/index.ts
//
// Phase 6.2.a (dry-run) + Phase 6.2.b (live, partial).
//
//   POST /functions/v1/goal-executor
//   body: { goal_id: <uuid>, mode?: "dry_run" | "live" }
//   Auth: Supabase user JWT (caller must be a member of the goal's workspace).
//
// Mode gating:
//   dry_run     ALWAYS allowed. All primitives return "would have done X" stubs.
//   live        Requires the workspace to have feature flag
//               `goal_executor_live = true`. Returns 403 otherwise.
//
// Live-mode primitives implemented THIS SESSION (6.2.b):
//   apollo_search   real Apollo API call via existing apollo-search edge fn
//                   (consumes the workspace's Apollo credits)
//   checkpoint      reads the named workspace metric, compares to threshold
//
// Live-mode primitives that remain stubbed in 6.2.b (with explicit reason):
//   wait            scheduling deferred to Phase 6.2.c (cron worker)
//   enrich_leads    Gemini integration deferred to 6.2.c
//   lead_score      Gemini integration deferred to 6.2.c
//   team_task       team_hub board-mapping deferred to 6.2.c
//
// Live-mode primitives gated UNCONDITIONALLY (require their own flags):
//   email_sequence  needs goal_executor_send_email flag (6.2.d)
//   social_post     needs goal_executor_send_social flag (6.2.d)

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const MAX_STEPS_PER_PLAN = 25;
const LIVE_MODE_FLAG = "goal_executor_live";

interface PlanStep {
  id: string;
  kind: string;
  title: string;
  rationale: string;
  params: Record<string, unknown>;
  depends_on: string[];
  estimated_hours?: number;
  success_criteria?: string;
}
interface Plan { summary: string; steps: PlanStep[]; }

type Mode = "dry_run" | "live";
type StepStatus = "succeeded" | "failed" | "skipped";
interface StepResult {
  status: StepStatus;
  output: Record<string, unknown>;
  error?: string;
}

function jsonResponse(b: unknown, status: number, h: Record<string, string>): Response {
  return new Response(JSON.stringify(b), { status, headers: { ...h, "Content-Type": "application/json" } });
}

// ── Dry-run stubs (unchanged from 6.2.a) ───────────────────────────────

function dryRunStub(step: PlanStep): StepResult {
  const p = step.params ?? {};
  switch (step.kind) {
    case "apollo_search":
      return { status: "succeeded", output: { dry_run: true, summary: `Would search Apollo with filters and return up to N leads.`, filters: p.filters ?? p, simulated_lead_count: 42 } };
    case "enrich_leads":
      return { status: "succeeded", output: { dry_run: true, summary: `Would run AI research on leads from ${p.lead_filter ?? "upstream step"} (~2-4 hours typical wall time).`, simulated_enriched: 38, simulated_failed: 4 } };
    case "lead_score":
      return { status: "succeeded", output: { dry_run: true, summary: `Would score leads against your ICP. Typical result: 60% scored, 20% hot, 40% warm, 40% cold.`, simulated_hot: 8, simulated_warm: 16, simulated_cold: 16 } };
    case "email_sequence":
      return { status: "succeeded", output: { dry_run: true, summary: `Would start sequence "${p.sequence_template ?? "unknown"}" for ${p.lead_filter ?? "all hot leads"}.`, sequence_template: p.sequence_template, total_emails: p.total_emails, cadence_days: p.cadence_days }, error: "Email sends are gated — Phase 6.2.d will require explicit per-workspace opt-in." };
    case "social_post":
      return { status: "succeeded", output: { dry_run: true, summary: `Would publish a ${p.channel ?? "social"} post on the topic: "${p.topic ?? ""}".`, channel: p.channel, topic: p.topic }, error: "Social publishes are gated — Phase 6.2.d will require explicit per-workspace opt-in." };
    case "team_task":
      return { status: "succeeded", output: { dry_run: true, summary: `Would create a team task: "${p.title ?? "(no title)"}"`, title: p.title, description: p.description, assigned_role: p.assigned_role } };
    case "wait":
      return { status: "succeeded", output: { dry_run: true, summary: `Would wait ${p.hours ?? "?"} hours. Reason: ${p.reason ?? "(none)"}.`, hours: p.hours } };
    case "checkpoint":
      return { status: "succeeded", output: { dry_run: true, summary: `Would evaluate metric "${p.metric ?? "?"}" against threshold ${p.comparison ?? ""} ${p.threshold ?? "?"}.`, metric: p.metric, threshold: p.threshold, comparison: p.comparison, simulated_outcome: "would_pass" } };
    default:
      return { status: "succeeded", output: { dry_run: true, summary: `Unknown step kind "${step.kind}" — no-op.` }, error: `Step kind "${step.kind}" is not yet supported by the executor.` };
  }
}

// ── Live-mode handlers ─────────────────────────────────────────────────
//
// Each returns the same StepResult shape. Live handlers can be partial —
// for any primitive not yet implemented in live mode, we fall through to
// a "deferred to 6.2.c" stub with status='skipped' so the goal status
// later reflects the partial execution.

async function liveApolloSearch(
  admin: ReturnType<typeof createClient>,
  userToken: string,
  step: PlanStep,
): Promise<StepResult> {
  const params = (step.params?.filters as Record<string, unknown>) ?? step.params ?? {};
  try {
    // Invoke the existing apollo-search edge fn with the user's JWT so it
    // attributes the search + log row to the right user.
    const url = `${SUPABASE_URL}/functions/v1/apollo-search`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        Authorization:   `Bearer ${userToken}`,
      },
      body: JSON.stringify({
        person_titles:        params.person_titles        ?? params.titles        ?? [],
        q_keywords:           params.q_keywords           ?? params.keywords      ?? "",
        person_locations:     params.person_locations     ?? params.locations     ?? [],
        organization_locations: params.organization_locations ?? [],
        employee_ranges:      params.employee_ranges      ?? params.company_sizes ?? [],
        person_seniorities:   params.person_seniorities   ?? [],
        person_departments:   params.person_departments   ?? [],
        per_page:             Number(params.per_page ?? params.limit ?? 25),
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { status: "failed", output: { live: true }, error: `apollo-search HTTP ${res.status}: ${text.slice(0, 200)}` };
    }
    const data = await res.json();
    return {
      status: "succeeded",
      output: {
        live: true,
        summary: `Apollo returned ${data.pagination?.total_entries ?? 0} matching prospects (showing top ${data.people?.length ?? 0}).`,
        total_entries: data.pagination?.total_entries ?? 0,
        results_returned: data.people?.length ?? 0,
        search_log_id: data.search_log_id ?? null,
        // First 5 only — we don't want huge JSONB payloads in step_runs.
        sample: (data.people ?? []).slice(0, 5).map((p: Record<string, unknown>) => ({
          name:    p.name,
          title:   p.title,
          company: (p.organization as Record<string, unknown>)?.name,
        })),
      },
    };
  } catch (e) {
    return { status: "failed", output: { live: true }, error: `apollo-search threw: ${(e as Error).message}` };
  }
}

async function liveCheckpoint(
  admin: ReturnType<typeof createClient>,
  workspaceId: string,
  goalTargetMetric: string,
  step: PlanStep,
): Promise<StepResult> {
  const p = step.params ?? {};
  const metric = String(p.metric ?? goalTargetMetric);
  const threshold = Number(p.threshold ?? 0);
  const comparison = String(p.comparison ?? "gte");

  // Map well-known metrics to SQL queries.
  let observed: number | null = null;
  let queryNote = "";
  try {
    if (metric === "leads_total" || metric === "leads") {
      const { count } = await admin.from("leads").select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId);
      observed = count ?? 0;
      queryNote = "leads (workspace, all-time)";
    } else if (metric === "leads_new_30d") {
      const since = new Date(Date.now() - 30 * 86400000).toISOString();
      const { count } = await admin.from("leads").select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId).gte("created_at", since);
      observed = count ?? 0;
      queryNote = "leads created in last 30 days";
    } else if (metric === "qualified_leads") {
      const { count } = await admin.from("leads").select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId).eq("status", "Qualified");
      observed = count ?? 0;
      queryNote = "leads with status=Qualified";
    } else if (metric === "emails_sent_in_range" || metric === "email_sent") {
      const { count } = await admin.from("email_messages").select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId);
      observed = count ?? 0;
      queryNote = "email_messages (workspace, all-time)";
    } else if (metric === "active_sequences") {
      const { count } = await admin.from("email_sequence_runs").select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId).eq("status", "processing");
      observed = count ?? 0;
      queryNote = "email_sequence_runs status=processing";
    } else {
      return {
        status: "skipped",
        output: { live: true, summary: `Checkpoint metric "${metric}" is not in the live-mode metric catalogue yet.` },
        error: `Unsupported metric "${metric}" — supported: leads_total, leads_new_30d, qualified_leads, emails_sent_in_range, active_sequences.`,
      };
    }
  } catch (e) {
    return { status: "failed", output: { live: true }, error: `checkpoint query failed: ${(e as Error).message}` };
  }

  const passed = comparison === "gte" ? (observed ?? 0) >= threshold
               : comparison === "lte" ? (observed ?? 0) <= threshold
               : comparison === "eq"  ? (observed ?? 0) === threshold
               : false;

  return {
    status: "succeeded",
    output: {
      live: true,
      summary: `Checkpoint: ${queryNote} = ${observed} (target ${comparison} ${threshold}) → ${passed ? "PASS" : "MISS"}.`,
      metric,
      observed,
      threshold,
      comparison,
      passed,
    },
    // We record an error message on a checkpoint miss so the UI surfaces
    // it, but the step itself stays 'succeeded' — checkpoint *evaluation*
    // succeeded; whether the metric passed is a separate signal.
    error: passed ? undefined : `Checkpoint missed: ${observed} ${comparison} ${threshold} = false`,
  };
}

function liveDeferredStub(step: PlanStep): StepResult {
  const p = step.params ?? {};
  return {
    status: "skipped",
    output: {
      live: true,
      deferred: true,
      summary: `Live execution of "${step.kind}" is deferred to a future ship. The step did not run.`,
      params: p,
    },
    error: `Live primitive "${step.kind}" is not yet implemented. Tracked as Phase 6.2.c / 6.2.d depending on kind.`,
  };
}

async function executeStepLive(
  admin: ReturnType<typeof createClient>,
  userToken: string,
  workspaceId: string,
  goalTargetMetric: string,
  step: PlanStep,
): Promise<StepResult> {
  switch (step.kind) {
    case "apollo_search":  return await liveApolloSearch(admin, userToken, step);
    case "checkpoint":     return await liveCheckpoint(admin, workspaceId, goalTargetMetric, step);
    // All others fall through to the deferred stub.
    default:               return liveDeferredStub(step);
  }
}

// ── Topo sort ──────────────────────────────────────────────────────────

function topoSort(steps: PlanStep[]): PlanStep[] | { error: string } {
  const byId = new Map(steps.map((s) => [s.id, s]));
  const indeg = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const s of steps) {
    indeg.set(s.id, (s.depends_on ?? []).length);
    for (const d of s.depends_on ?? []) {
      if (!byId.has(d)) return { error: `step ${s.id} depends on unknown step ${d}` };
      adj.set(d, [...(adj.get(d) ?? []), s.id]);
    }
  }
  const queue = steps.filter((s) => (indeg.get(s.id) ?? 0) === 0).map((s) => s.id);
  const ordered: PlanStep[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    ordered.push(byId.get(id)!);
    for (const nxt of adj.get(id) ?? []) {
      indeg.set(nxt, (indeg.get(nxt) ?? 1) - 1);
      if ((indeg.get(nxt) ?? 0) === 0) queue.push(nxt);
    }
  }
  if (ordered.length !== steps.length) return { error: "plan has dependency cycle" };
  return ordered;
}

// ── Handler ────────────────────────────────────────────────────────────

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const corsHeaders = getCorsHeaders(req);

  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405, corsHeaders);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonResponse({ error: "Missing Authorization" }, 401, corsHeaders);
  const userToken = authHeader.replace(/^Bearer\s+/i, "");

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: userRes, error: authErr } = await admin.auth.getUser(userToken);
  if (authErr || !userRes?.user) return jsonResponse({ error: "Invalid token" }, 401, corsHeaders);
  const userId = userRes.user.id;

  const body = await req.json().catch(() => ({} as { goal_id?: string; mode?: string }));
  if (!body.goal_id || typeof body.goal_id !== "string") {
    return jsonResponse({ error: "goal_id required" }, 400, corsHeaders);
  }
  const mode: Mode = body.mode === "live" ? "live" : "dry_run";

  const { data: goal, error: goalErr } = await admin
    .from("automation_goals")
    .select("id, workspace_id, statement, status, target_value, target_metric")
    .eq("id", body.goal_id)
    .maybeSingle();
  if (goalErr || !goal) return jsonResponse({ error: "Goal not found" }, 404, corsHeaders);

  const { data: membership } = await admin
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", goal.workspace_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!membership) return jsonResponse({ error: "Forbidden" }, 403, corsHeaders);

  // Live-mode requires explicit workspace flag.
  if (mode === "live") {
    const { data: flagOn } = await admin.rpc("workspace_has_flag", {
      p_workspace_id: goal.workspace_id,
      p_flag_key:     LIVE_MODE_FLAG,
    });
    if (!flagOn) {
      return jsonResponse({
        error: "Live execution requires the goal_executor_live workspace flag to be enabled.",
        code:  "live_not_enabled",
        flag_key: LIVE_MODE_FLAG,
      }, 403, corsHeaders);
    }
  }

  if (!["planned", "active", "paused", "running", "completed", "failed"].includes(goal.status)) {
    return jsonResponse({
      error: `Goal must be planned/active/paused/running/completed/failed to execute; current status is "${goal.status}"`,
      code:  "wrong_status",
    }, 409, corsHeaders);
  }

  const { data: planRow, error: planErr } = await admin
    .from("automation_plans")
    .select("id, plan")
    .eq("goal_id", goal.id)
    .eq("is_active", true)
    .maybeSingle();
  if (planErr || !planRow) return jsonResponse({ error: "No active plan for this goal" }, 404, corsHeaders);

  const plan = planRow.plan as Plan;
  if (!plan.steps || plan.steps.length === 0) return jsonResponse({ error: "Plan has no steps" }, 400, corsHeaders);
  if (plan.steps.length > MAX_STEPS_PER_PLAN) return jsonResponse({ error: `Plan has ${plan.steps.length} steps; cap is ${MAX_STEPS_PER_PLAN}`, code: "too_many_steps" }, 400, corsHeaders);

  const ordered = topoSort(plan.steps);
  if ("error" in ordered) return jsonResponse({ error: ordered.error }, 400, corsHeaders);

  await admin.rpc("set_goal_status", { p_goal_id: goal.id, p_status: "running" });

  const progressIncrement = goal.target_value > 0
    ? Number(goal.target_value) / ordered.length
    : 0;

  const stepRunIds: string[] = [];
  let failures = 0;
  let skipped = 0;

  for (const step of ordered) {
    const { data: inserted, error: insErr } = await admin
      .from("automation_step_runs")
      .insert({
        plan_id:       planRow.id,
        goal_id:       goal.id,
        workspace_id:  goal.workspace_id,
        step_id:       step.id,
        step_kind:     step.kind,
        status:        "running",
        mode,
        attempt_count: 1,
        input_params:  step.params ?? {},
        started_at:    new Date().toISOString(),
      })
      .select("id")
      .single();
    if (insErr || !inserted) {
      console.error("[goal-executor] insert step run failed:", insErr?.message);
      failures++;
      continue;
    }
    stepRunIds.push(inserted.id);

    let result: StepResult;
    if (mode === "live") {
      result = await executeStepLive(admin, userToken, goal.workspace_id, goal.target_metric, step);
    } else {
      result = dryRunStub(step);
    }

    if (result.status === "failed") failures++;
    if (result.status === "skipped") skipped++;

    await admin
      .from("automation_step_runs")
      .update({
        status:       result.status,
        output:       result.output,
        error:        result.error ?? null,
        completed_at: new Date().toISOString(),
      })
      .eq("id", inserted.id);

    if (progressIncrement > 0 && result.status === "succeeded") {
      await admin.rpc("advance_goal_progress", {
        p_goal_id:   goal.id,
        p_increment: progressIncrement,
      });
    }
  }

  const finalStatus = failures === 0 ? "completed" : "failed";
  await admin.rpc("set_goal_status", { p_goal_id: goal.id, p_status: finalStatus });

  return jsonResponse({
    goal_id:       goal.id,
    plan_id:       planRow.id,
    mode,
    steps_total:   ordered.length,
    steps_succeeded: ordered.length - failures - skipped,
    steps_skipped: skipped,
    steps_failed:  failures,
    step_run_ids:  stepRunIds,
    final_status:  finalStatus,
  }, 200, corsHeaders);
});
