-- Body A/B: alternate email bodies per step (main body_html = variant A). A
-- "variant" index selects both the subject and the body for that lane.
alter table public.sequence_steps
  add column if not exists body_variants text[] not null default '{}'::text[];
