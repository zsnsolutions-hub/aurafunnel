-- Roadmap 2.1 (BUG-016) — business-scope the AI memory layer.
--
-- workspace_memory / lead_memory / campaign_memory were workspace-scoped only, so
-- Business A's learned facts (tone, USPs, winning patterns) were recalled for
-- Business B generation. Add a nullable business_id (NULL = truly workspace-global,
-- e.g. workspace-level goal outcomes) and backfill precisely where we can.
--
-- Idempotent. Safe to re-run.

-- 1. Columns (nullable; FK keeps integrity, SET NULL so deleting a business
--    demotes its memory to global rather than deleting learned facts).
ALTER TABLE public.workspace_memory ADD COLUMN IF NOT EXISTS business_id uuid
  REFERENCES public.businesses(id) ON DELETE SET NULL;
ALTER TABLE public.lead_memory ADD COLUMN IF NOT EXISTS business_id uuid
  REFERENCES public.businesses(id) ON DELETE SET NULL;
ALTER TABLE public.campaign_memory ADD COLUMN IF NOT EXISTS business_id uuid
  REFERENCES public.businesses(id) ON DELETE SET NULL;

-- 2. Index for the hot path: workspace_memory is recalled on every generation.
CREATE INDEX IF NOT EXISTS idx_workspace_memory_ws_business
  ON public.workspace_memory (workspace_id, business_id);

-- 3. Backfill.
--    3a. lead_memory: precise — a lead belongs to exactly one business.
UPDATE public.lead_memory m
   SET business_id = l.business_id
  FROM public.leads l
 WHERE m.lead_id = l.id
   AND m.business_id IS NULL
   AND l.business_id IS NOT NULL;

--    3b. workspace_memory + campaign_memory: attribute to the workspace's business
--        only when it has exactly ONE (single-business workspaces = the vast
--        majority). Multi-business workspaces stay NULL/global — never mis-attribute.
UPDATE public.workspace_memory m
   SET business_id = ob.bid
  FROM (
    SELECT workspace_id, (array_agg(id))[1] AS bid
      FROM public.businesses
     GROUP BY workspace_id
    HAVING count(*) = 1
  ) ob
 WHERE m.workspace_id = ob.workspace_id
   AND m.business_id IS NULL;

UPDATE public.campaign_memory m
   SET business_id = ob.bid
  FROM (
    SELECT workspace_id, (array_agg(id))[1] AS bid
      FROM public.businesses
     GROUP BY workspace_id
    HAVING count(*) = 1
  ) ob
 WHERE m.workspace_id = ob.workspace_id
   AND m.business_id IS NULL;

-- 4. Server-side writers: stamp business_id where derivable.
--    Goal-outcome writers (workspace_memory) intentionally stay NULL/global —
--    automation_goals has no business dimension, so goal facts ARE workspace-level.

CREATE OR REPLACE FUNCTION public.log_lead_memory_email_event(p_message_id uuid, p_event_type text, p_link_id uuid DEFAULT NULL::uuid, p_destination_url text DEFAULT NULL::text, p_is_bot boolean DEFAULT false, p_is_apple_privacy boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_lead_id      uuid;
  v_workspace_id uuid;
  v_business_id  uuid;
begin
  if p_is_bot or p_is_apple_privacy then
    return;
  end if;

  if p_event_type not in ('open', 'click', 'delivered', 'bounced', 'replied') then
    return;
  end if;

  select em.lead_id, l.workspace_id, l.business_id
    into v_lead_id, v_workspace_id, v_business_id
  from public.email_messages em
  join public.leads l on l.id = em.lead_id
  where em.id = p_message_id
  limit 1;

  if v_lead_id is null or v_workspace_id is null then
    return;
  end if;

  insert into public.lead_memory (
    workspace_id, lead_id, business_id, kind, value, source, confidence, tags, occurred_at
  )
  values (
    v_workspace_id,
    v_lead_id,
    v_business_id,
    'interaction',
    jsonb_build_object(
      'event', p_event_type,
      'message_id', p_message_id,
      'link_id', p_link_id,
      'destination_url', p_destination_url
    ),
    'email_track',
    case p_event_type
      when 'replied'   then 0.95
      when 'click'     then 0.85
      when 'open'      then 0.55
      when 'delivered' then 0.30
      when 'bounced'   then 0.40
      else 0.50
    end,
    array['email', 'interaction', p_event_type],
    now()
  );
exception when others then
  raise warning 'log_lead_memory_email_event failed: % %', sqlstate, sqlerrm;
end;
$function$;

CREATE OR REPLACE FUNCTION public.log_campaign_memory_sequence_outcome(p_run_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_run            email_sequence_runs%rowtype;
  v_workspace_id   uuid;
  v_business_id    uuid;
  v_message_ids    uuid[];
  v_sent           int;
  v_unique_opens   int;
  v_unique_clicks  int;
  v_replies        int;
  v_bounces        int;
  v_open_rate      numeric(5,4);
  v_click_rate     numeric(5,4);
  v_reply_rate     numeric(5,4);
  v_bounce_rate    numeric(5,4);
  v_already        int;
begin
  select count(*) into v_already
  from public.campaign_memory
  where campaign_kind = 'email_sequence'
    and campaign_id = p_run_id::text
    and kind = 'outcome';
  if v_already > 0 then return; end if;

  select * into v_run from public.email_sequence_runs where id = p_run_id;
  if v_run.id is null or v_run.status <> 'completed' then return; end if;

  v_workspace_id := v_run.workspace_id;
  if v_workspace_id is null then
    select l.workspace_id
      into v_workspace_id
      from public.email_sequence_run_items i
      join public.leads l on l.id = i.lead_id
      where i.run_id = p_run_id
      limit 1;
  end if;
  if v_workspace_id is null then return; end if;

  select coalesce(array_agg(em.id), '{}')
    into v_message_ids
    from public.email_messages em
    where em.sequence_id = p_run_id::text;

  v_sent := coalesce(array_length(v_message_ids, 1), 0);
  if v_sent = 0 then
    return;
  end if;

  -- Business attribution: from the messages sent for this run (one business per run).
  select em.business_id into v_business_id
    from public.email_messages em
    where em.id = any (v_message_ids) and em.business_id is not null
    limit 1;

  select
    count(distinct case when ee.event_type = 'open'    and not ee.is_bot and not ee.is_apple_privacy then ee.message_id end),
    count(distinct case when ee.event_type = 'click'   and not ee.is_bot then ee.message_id end),
    count(*) filter (where ee.event_type = 'replied'),
    count(*) filter (where ee.event_type = 'bounced')
    into v_unique_opens, v_unique_clicks, v_replies, v_bounces
    from public.email_events ee
    where ee.message_id = any (v_message_ids);

  v_open_rate   := round(v_unique_opens::numeric / v_sent, 4);
  v_click_rate  := round(v_unique_clicks::numeric / v_sent, 4);
  v_reply_rate  := round(v_replies::numeric       / v_sent, 4);
  v_bounce_rate := round(v_bounces::numeric       / v_sent, 4);

  insert into public.campaign_memory (
    workspace_id, business_id, campaign_kind, campaign_id, kind, value,
    metric_value, source, confidence, tags
  ) values (
    v_workspace_id,
    v_business_id,
    'email_sequence',
    p_run_id::text,
    'outcome',
    jsonb_build_object(
      'sent',          v_sent,
      'unique_opens',  v_unique_opens,
      'unique_clicks', v_unique_clicks,
      'replies',       v_replies,
      'bounces',       v_bounces,
      'open_rate',     v_open_rate,
      'click_rate',    v_click_rate,
      'reply_rate',    v_reply_rate,
      'bounce_rate',   v_bounce_rate,
      'lead_count',    v_run.lead_count,
      'step_count',    v_run.step_count,
      'tone',          v_run.sequence_config->>'tone',
      'goal',          v_run.sequence_config->>'goal',
      'cadence',       v_run.sequence_config->>'cadence',
      'started_at',    v_run.started_at,
      'completed_at',  v_run.completed_at
    ),
    case when v_replies > 0 then v_reply_rate else v_open_rate end,
    'sequence_completion',
    case
      when v_sent >= 100 then 0.90
      when v_sent >=  30 then 0.75
      when v_sent >=  10 then 0.60
      else                    0.45
    end,
    array['email_sequence', 'outcome',
          (v_run.sequence_config->>'tone'),
          (v_run.sequence_config->>'goal')]
      || case when v_replies > 0 then array['has_replies'] else array[]::text[] end
  );
exception when others then
  raise warning 'log_campaign_memory_sequence_outcome failed for %: % %', p_run_id, sqlstate, sqlerrm;
end;
$function$;
