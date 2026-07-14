// supabase/functions/poll-imap-inbox/index.ts
//
// Built-in inbound fetcher for password-based (SMTP/app-password) senders. For
// each such sender_account, connects to its IMAP server over TLS, pulls messages
// newer than the last polled UID, and POSTs each to the inbound-email webhook
// (which matches + stores them for the unified inbox). State per sender lives in
// imap_poll_state. Invoked by the invoke_imap_poll cron.
//
// Minimal hand-rolled IMAP client (Deno.connectTls) — single-literal FETCHes to
// keep parsing simple. Deploy: supabase functions deploy poll-imap-inbox

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const INBOUND_SECRET = Deno.env.get("INBOUND_EMAIL_SECRET") ?? "";
const MAX_PER_ACCOUNT = 25;

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

const CONNECT_MS = 10_000;
const ACCOUNT_MS = 20_000;
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`${label} timed out`)), ms))]);
}

// Map an SMTP host to its IMAP host (best-effort; overridable via metadata).
function imapHostFor(smtpHost: string): string {
  const h = smtpHost.toLowerCase();
  if (h.includes("gmail")) return "imap.gmail.com";
  if (h.includes("office365") || h.includes("outlook")) return "outlook.office365.com";
  if (h.startsWith("smtp.")) return "imap." + h.slice(5);
  return smtpHost;
}

const decodeQP = (s: string) => s.replace(/=\r?\n/g, "").replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
const decodeB64 = (s: string) => { try { return decodeURIComponent(escape(atob(s.replace(/\s+/g, "")))); } catch { try { return atob(s.replace(/\s+/g, "")); } catch { return s; } } };

function parseHeaders(raw: string): Record<string, string> {
  const unfolded = raw.replace(/\r?\n[ \t]+/g, " ");
  const h: Record<string, string> = {};
  for (const line of unfolded.split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i > 0) h[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
  }
  return h;
}

function decodeBody(s: string, cte: string): string {
  if (cte.includes("quoted-printable")) return decodeQP(s);
  if (cte.includes("base64")) return decodeB64(s);
  return s;
}

// Best-effort text extraction: pick text/plain out of multipart, else decode.
function extractText(headers: Record<string, string>, body: string): string {
  const ct = (headers["content-type"] || "").toLowerCase();
  const cte = (headers["content-transfer-encoding"] || "").toLowerCase();
  if (ct.startsWith("multipart/")) {
    const bm = ct.match(/boundary="?([^";]+)"?/);
    if (bm) {
      for (const part of body.split("--" + bm[1])) {
        const [ph, ...rest] = part.split(/\r?\n\r?\n/);
        if (ph.toLowerCase().includes("text/plain")) {
          const pcte = (ph.match(/content-transfer-encoding:\s*([^\r\n;]+)/i) || [])[1] || "";
          return decodeBody(rest.join("\n\n"), pcte.trim().toLowerCase()).trim();
        }
      }
    }
  }
  return decodeBody(body, cte).trim();
}

class Imap {
  private buf = new Uint8Array(0);
  private tag = 0;
  private enc = new TextEncoder();
  private dec = new TextDecoder("utf-8", { fatal: false });
  constructor(private conn: Deno.TlsConn) {}

  private async fill(): Promise<boolean> {
    const chunk = new Uint8Array(65536);
    const n = await this.conn.read(chunk);
    if (n === null) return false;
    const merged = new Uint8Array(this.buf.length + n);
    merged.set(this.buf); merged.set(chunk.subarray(0, n), this.buf.length);
    this.buf = merged;
    return true;
  }
  private async readLine(): Promise<string> {
    while (true) {
      const idx = this.buf.indexOf(10);
      if (idx >= 0) { const l = this.dec.decode(this.buf.subarray(0, idx)); this.buf = this.buf.subarray(idx + 1); return l.replace(/\r$/, ""); }
      if (!(await this.fill())) throw new Error("connection closed");
    }
  }
  private async readBytes(n: number): Promise<string> {
    while (this.buf.length < n) if (!(await this.fill())) throw new Error("connection closed");
    const out = this.dec.decode(this.buf.subarray(0, n)); this.buf = this.buf.subarray(n); return out;
  }
  async greeting() { return this.readLine(); }
  // Send a command; collect untagged lines + literals until the tagged result.
  async cmd(command: string): Promise<{ ok: boolean; lines: string[]; literals: string[]; result: string }> {
    const t = `A${++this.tag}`;
    await this.conn.write(this.enc.encode(`${t} ${command}\r\n`));
    const lines: string[] = []; const literals: string[] = []; let cur = "";
    while (true) {
      const phys = await this.readLine();
      const m = phys.match(/\{(\d+)\}$/);
      if (m) { cur += phys.slice(0, -m[0].length); literals.push(await this.readBytes(parseInt(m[1], 10))); continue; }
      cur += phys;
      if (cur.startsWith(t + " ")) {
        const result = cur.slice(t.length + 1).split(" ")[0].toUpperCase();
        return { ok: result === "OK", lines, literals, result: cur };
      }
      lines.push(cur); cur = "";
    }
  }
  async logout() { try { await this.cmd("LOGOUT"); } catch { /* noop */ } }
}

const qstr = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

async function pollAccount(admin: ReturnType<typeof createClient>, acct: {
  id: string; from_email: string; smtp_host: string; smtp_user: string; smtp_pass: string;
  imap_host?: string; imap_port?: number;
}): Promise<{ ingested: number; error?: string }> {
  const host = acct.imap_host || imapHostFor(acct.smtp_host);
  const port = acct.imap_port || 993;
  let conn: Deno.TlsConn | null = null;
  try {
    conn = await withTimeout(Deno.connectTls({ hostname: host, port }), CONNECT_MS, `connect ${host}:${port}`);
    const imap = new Imap(conn);
    await imap.greeting();
    const login = await imap.cmd(`LOGIN ${qstr(acct.smtp_user)} ${qstr(acct.smtp_pass)}`);
    if (!login.ok) throw new Error(`IMAP login failed: ${login.result.slice(0, 120)}`);

    const sel = await imap.cmd("SELECT INBOX");
    if (!sel.ok) throw new Error("SELECT INBOX failed");
    let uidNext = 0, uidValidity = 0;
    for (const l of sel.lines) {
      const un = l.match(/\[UIDNEXT (\d+)\]/i); if (un) uidNext = parseInt(un[1], 10);
      const uv = l.match(/\[UIDVALIDITY (\d+)\]/i); if (uv) uidValidity = parseInt(uv[1], 10);
    }

    const { data: st } = await admin.from("imap_poll_state").select("last_uid, uid_validity").eq("sender_account_id", acct.id).maybeSingle();
    let lastUid = (st?.last_uid as number | undefined) ?? 0;
    if (!st || (st.uid_validity && uidValidity && st.uid_validity !== uidValidity)) {
      // First poll or mailbox reset: start from now, don't backfill history.
      lastUid = Math.max(0, uidNext - 1);
      await admin.from("imap_poll_state").upsert({ sender_account_id: acct.id, last_uid: lastUid, uid_validity: uidValidity, last_polled_at: new Date().toISOString(), last_error: null });
      await imap.logout(); return { ingested: 0 };
    }

    const search = await imap.cmd(`UID SEARCH UID ${lastUid + 1}:*`);
    const uids = (search.lines.find(l => /^\* SEARCH/i.test(l)) || "").replace(/^\* SEARCH/i, "").trim().split(/\s+/)
      .map(Number).filter(u => u > lastUid).sort((a, b) => a - b).slice(0, MAX_PER_ACCOUNT);

    let ingested = 0, maxUid = lastUid;
    for (const uid of uids) {
      try {
        const hf = await imap.cmd(`UID FETCH ${uid} (BODY.PEEK[HEADER.FIELDS (FROM TO SUBJECT MESSAGE-ID IN-REPLY-TO DATE CONTENT-TYPE CONTENT-TRANSFER-ENCODING)])`);
        const tf = await imap.cmd(`UID FETCH ${uid} (BODY.PEEK[TEXT])`);
        const headers = parseHeaders(hf.literals[0] ?? "");
        const text = extractText(headers, tf.literals[0] ?? "");
        const payload = {
          from: headers["from"] ?? "", to: headers["to"] ?? acct.from_email,
          subject: headers["subject"] ?? "", text,
          message_id: headers["message-id"] ?? "", in_reply_to: headers["in-reply-to"] ?? "",
          received_at: headers["date"] ? new Date(headers["date"]).toISOString() : new Date().toISOString(),
        };
        const res = await fetch(`${SUPABASE_URL}/functions/v1/inbound-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(INBOUND_SECRET ? { "X-Inbound-Secret": INBOUND_SECRET } : {}) },
          body: JSON.stringify(payload),
        });
        if (res.ok) ingested++;
      } catch { /* skip this message */ }
      if (uid > maxUid) maxUid = uid;
    }

    await admin.from("imap_poll_state").upsert({ sender_account_id: acct.id, last_uid: maxUid, uid_validity: uidValidity, last_polled_at: new Date().toISOString(), last_error: null });
    await imap.logout();
    return { ingested };
  } catch (e) {
    await admin.from("imap_poll_state").upsert({ sender_account_id: acct.id, last_polled_at: new Date().toISOString(), last_error: (e as Error).message.slice(0, 300) });
    return { ingested: 0, error: (e as Error).message };
  } finally {
    try { conn?.close(); } catch { /* noop */ }
  }
}

serve(async () => {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  try {
    const { data: rows } = await admin.from("sender_accounts")
      .select("id, from_email, status, metadata, sender_account_secrets(smtp_host, smtp_user, smtp_pass)")
      .in("status", ["connected", "active"]);

    const accounts = (rows ?? []).map((r: Record<string, unknown>) => {
      const sec = Array.isArray(r.sender_account_secrets) ? r.sender_account_secrets[0] : r.sender_account_secrets;
      const meta = (r.metadata ?? {}) as { imap_host?: string; imap_port?: number };
      return sec?.smtp_pass && sec?.smtp_host && sec?.smtp_user ? {
        id: r.id as string, from_email: r.from_email as string,
        smtp_host: sec.smtp_host as string, smtp_user: sec.smtp_user as string, smtp_pass: sec.smtp_pass as string,
        imap_host: meta.imap_host, imap_port: meta.imap_port,
      } : null;
    }).filter(Boolean) as Parameters<typeof pollAccount>[1][];

    let total = 0; const errors: string[] = [];
    for (const a of accounts) {
      // Bound each account so one slow/unreachable IMAP host can't stall the run.
      const r = await withTimeout(pollAccount(admin, a), ACCOUNT_MS, `poll ${a.from_email}`)
        .catch((e: Error) => ({ ingested: 0, error: e.message }));
      total += r.ingested;
      if (r.error) errors.push(`${a.from_email}: ${r.error}`);
    }
    return json({ accounts: accounts.length, ingested: total, errors });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
