// Server-side in-app notifications.
//
// Wraps the notify_user RPC (service_role only, migration 20260819140000).
// Notifications are a side-effect of real work, never the point of it, so this
// NEVER throws: a failed notification must not fail the send/enrichment/verify
// that triggered it.
// deno-lint-ignore-file no-explicit-any

export type NotificationType = "info" | "success" | "warning" | "error" | "task_reminder";

export async function notifyUser(
  admin: any,
  opts: {
    userId: string;
    type: NotificationType;
    title: string;
    message?: string | null;
    link?: string | null;
    workspaceId?: string | null;
  },
): Promise<void> {
  if (!opts.userId || !opts.title) return;
  try {
    await admin.rpc("notify_user", {
      p_user_id:      opts.userId,
      p_type:         opts.type,
      p_title:        opts.title,
      p_message:      opts.message ?? null,
      p_link:         opts.link ?? null,
      p_workspace_id: opts.workspaceId ?? null,
    });
  } catch (_e) {
    // Swallow — see the note above.
  }
}
