// supabase/functions/deliver-task-reminders/index.ts
//
// Delivers due task reminders. Invoked every 5 min by the invoke_task_reminders
// cron (service-role token). For each open task whose reminder_at has passed and
// hasn't been sent, it atomically claims the row (sets reminder_sent_at so it
// fires once), inserts an in-app notification for the assignee, and best-effort
// emails them via SendGrid. Service-role only.
//
// Deploy: supabase functions deploy deliver-task-reminders --no-verify-jwt

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { isServiceRoleToken, isServiceRoleJwt, bearerToken } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SENDGRID_API_KEY = Deno.env.get("SENDGRID_API_KEY") ?? "";
const SENDER_EMAIL = Deno.env.get("AUTH_SENDER_EMAIL") ?? "support@scaliyo.com";
const SENDER_NAME = Deno.env.get("AUTH_SENDER_NAME") ?? "Scaliyo";
const SITE_URL = Deno.env.get("SITE_URL") ?? Deno.env.get("APP_URL") ?? "https://scaliyo.com";

const esc = (s: string) => (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

interface DueTask {
  id: string;
  title: string;
  due_at: string | null;
  lead_id: string | null;
  assigned_to: string | null;
  created_by: string | null;
  workspace_id: string;
}

async function sendEmail(to: string, name: string, task: DueTask, link: string): Promise<boolean> {
  if (!SENDGRID_API_KEY || !to) return false;
  const due = task.due_at ? ` (due ${new Date(task.due_at).toLocaleDateString("en-US", { dateStyle: "medium" })})` : "";
  const html = `<div style="font-family:system-ui,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px">
    <p style="font-size:12px;font-weight:700;color:#6366f1;text-transform:uppercase;letter-spacing:.08em;margin:0 0 8px">Task reminder</p>
    <h2 style="font-size:18px;color:#0f172a;margin:0 0 12px">${esc(task.title)}${esc(due)}</h2>
    <p style="font-size:14px;color:#475569;margin:0 0 20px">Hi ${esc(name || "there")}, this is your reminder for the task above.</p>
    <a href="${SITE_URL}${esc(link)}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:10px 18px;border-radius:10px">Open in Scaliyo</a>
  </div>`;
  try {
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${SENDGRID_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: SENDER_EMAIL, name: SENDER_NAME },
        subject: `Reminder: ${task.title}`,
        content: [{ type: "text/html", value: html }],
      }),
    });
    return res.ok;
  } catch (_e) {
    return false;
  }
}

serve(async (req) => {
  const pre = handleCors(req); if (pre) return pre;
  const cors = getCorsHeaders(req);
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

  // Service-role only (invoked by the cron with the service token).
  const token = bearerToken(req);
  if (!isServiceRoleToken(token) && !isServiceRoleJwt(token)) return json({ error: "Unauthorized" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const nowIso = new Date().toISOString();

  // Atomically claim due reminders (set reminder_sent_at so each fires exactly
  // once, even if two runs overlap) and get the claimed rows back.
  const { data: claimed, error } = await admin
    .from("tasks")
    .update({ reminder_sent_at: nowIso })
    .eq("status", "open")
    .not("reminder_at", "is", null)
    .is("reminder_sent_at", null)
    .lte("reminder_at", nowIso)
    .select("id, title, due_at, lead_id, assigned_to, created_by, workspace_id");

  if (error) return json({ error: error.message }, 500);
  const tasks = (claimed ?? []) as DueTask[];
  if (tasks.length === 0) return json({ delivered: 0 });

  let notified = 0;
  let emailed = 0;
  for (const t of tasks) {
    const recipient = t.assigned_to ?? t.created_by;
    if (!recipient) continue;
    const link = t.lead_id ? `/portal/leads/${t.lead_id}` : "/portal";
    const due = t.due_at ? ` (due ${new Date(t.due_at).toLocaleDateString("en-US", { dateStyle: "medium" })})` : "";

    const { error: nErr } = await admin.from("notifications").insert({
      workspace_id: t.workspace_id,
      user_id: recipient,
      type: "task_reminder",
      title: "Task reminder",
      message: `${t.title}${due}`,
      link,
      is_read: false,
    });
    if (!nErr) notified++;

    const { data: prof } = await admin.from("profiles").select("email, name").eq("id", recipient).maybeSingle();
    if (prof?.email && await sendEmail(String(prof.email), String(prof.name ?? ""), t, link)) emailed++;
  }

  return json({ delivered: tasks.length, notified, emailed });
});
