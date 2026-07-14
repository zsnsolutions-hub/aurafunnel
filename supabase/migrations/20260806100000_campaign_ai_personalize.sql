-- Per-campaign toggle: AI-personalize each email (default) vs send verbatim
-- (mail-merge — the template is sent as-is with {{fields}} substituted, no AI).
alter table public.email_sequences
  add column if not exists ai_personalize boolean not null default true;
