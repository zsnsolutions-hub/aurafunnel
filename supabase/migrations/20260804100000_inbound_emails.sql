-- ============================================================================
-- Unified inbox: store inbound email replies. Fed by the inbound-email webhook
-- (any source — SendGrid/Mailgun Inbound Parse, a Gmail→webhook forward, Zapier,
-- or an IMAP poller). Matched to a lead + the outgoing message it replies to.
-- Owner-scoped RLS; writes happen via service role in the webhook.
-- ============================================================================

create table if not exists public.inbound_emails (
  id                   uuid primary key default gen_random_uuid(),
  owner_id             uuid not null,                                    -- lead owner (auth.uid())
  workspace_id         uuid,
  lead_id              uuid references public.leads(id) on delete set null,
  sender_account_id    uuid references public.sender_accounts(id) on delete set null,
  reply_to_message_id  uuid references public.email_messages(id) on delete set null,
  from_email           text not null,
  from_name            text,
  to_email             text,
  subject              text,
  body_text            text,
  body_html            text,
  message_id           text,                                            -- inbound Message-ID (dedupe)
  in_reply_to          text,                                            -- In-Reply-To header
  is_read              boolean not null default false,
  received_at          timestamptz not null default now(),
  created_at           timestamptz not null default now()
);

create index if not exists idx_inbound_emails_owner   on public.inbound_emails (owner_id, received_at desc);
create index if not exists idx_inbound_emails_lead    on public.inbound_emails (lead_id, received_at desc);
create index if not exists idx_inbound_emails_unread  on public.inbound_emails (owner_id) where not is_read;
create unique index if not exists uq_inbound_emails_msgid
  on public.inbound_emails (owner_id, message_id) where message_id is not null;

alter table public.inbound_emails enable row level security;

do $$ begin
  create policy "owner reads inbound" on public.inbound_emails for select using (owner_id = auth.uid());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "owner updates inbound" on public.inbound_emails for update using (owner_id = auth.uid());
exception when duplicate_object then null; end $$;
