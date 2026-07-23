-- Roadmap 6.2 - viewer read-only RBAC on SHARED collaborative resources.
-- Write policies gated on workspace/business MEMBERSHIP now require role <> 'viewer'.
-- Reads unchanged (viewers still see data). Personal (owner_id/client_id/user_id)
-- resources untouched. Helper-based write policies only; inline workspace_members
-- write policies are a separate follow-on.

CREATE OR REPLACE FUNCTION public.is_business_writer(p_business_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$ select exists (select 1 from public.business_members
   where business_id = p_business_id and user_id = auth.uid() and role <> 'viewer'); $fn$;

CREATE OR REPLACE FUNCTION public.is_workspace_writer(ws_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$ select exists (select 1 from public.workspace_members
   where workspace_id = ws_id and user_id = auth.uid() and role <> 'viewer'); $fn$;

GRANT EXECUTE ON FUNCTION public.is_business_writer(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_workspace_writer(uuid) TO authenticated, service_role;


DROP POLICY IF EXISTS "biz create" ON public.businesses;
CREATE POLICY "biz create" ON public.businesses AS PERMISSIVE FOR INSERT TO public WITH CHECK (((created_by = auth.uid()) AND is_workspace_writer(workspace_id)));

DROP POLICY IF EXISTS "deals_delete" ON public.deals;
CREATE POLICY "deals_delete" ON public.deals AS PERMISSIVE FOR DELETE TO public USING (is_workspace_writer(workspace_id));

DROP POLICY IF EXISTS "deals_insert" ON public.deals;
CREATE POLICY "deals_insert" ON public.deals AS PERMISSIVE FOR INSERT TO public WITH CHECK ((is_workspace_writer(workspace_id) AND (created_by = auth.uid())));

DROP POLICY IF EXISTS "deals_update" ON public.deals;
CREATE POLICY "deals_update" ON public.deals AS PERMISSIVE FOR UPDATE TO public USING (is_workspace_writer(workspace_id)) WITH CHECK (is_workspace_writer(workspace_id));

DROP POLICY IF EXISTS "seq_delete" ON public.email_sequences;
CREATE POLICY "seq_delete" ON public.email_sequences AS PERMISSIVE FOR DELETE TO public USING (is_workspace_writer(workspace_id));

DROP POLICY IF EXISTS "seq_insert" ON public.email_sequences;
CREATE POLICY "seq_insert" ON public.email_sequences AS PERMISSIVE FOR INSERT TO public WITH CHECK (is_workspace_writer(workspace_id));

DROP POLICY IF EXISTS "seq_update" ON public.email_sequences;
CREATE POLICY "seq_update" ON public.email_sequences AS PERMISSIVE FOR UPDATE TO public USING (is_workspace_writer(workspace_id)) WITH CHECK (is_workspace_writer(workspace_id));

DROP POLICY IF EXISTS "members write gen" ON public.generated_assets;
CREATE POLICY "members write gen (read)" ON public.generated_assets AS PERMISSIVE FOR SELECT TO public USING (is_business_member(business_id));
CREATE POLICY "members write gen (insert)" ON public.generated_assets AS PERMISSIVE FOR INSERT TO public WITH CHECK (is_business_writer(business_id));
CREATE POLICY "members write gen (update)" ON public.generated_assets AS PERMISSIVE FOR UPDATE TO public USING (is_business_writer(business_id)) WITH CHECK (is_business_writer(business_id));
CREATE POLICY "members write gen (delete)" ON public.generated_assets AS PERMISSIVE FOR DELETE TO public USING (is_business_writer(business_id));

DROP POLICY IF EXISTS "lead_activities_insert" ON public.lead_activities;
CREATE POLICY "lead_activities_insert" ON public.lead_activities AS PERMISSIVE FOR INSERT TO public WITH CHECK ((is_workspace_writer(workspace_id) AND (author_id = auth.uid())));

DROP POLICY IF EXISTS "notes_insert" ON public.lead_notes;
CREATE POLICY "notes_insert" ON public.lead_notes AS PERMISSIVE FOR INSERT TO public WITH CHECK ((is_workspace_writer(workspace_id) AND (author_id = auth.uid())));

DROP POLICY IF EXISTS "members write research" ON public.lead_research_profiles;
CREATE POLICY "members write research (read)" ON public.lead_research_profiles AS PERMISSIVE FOR SELECT TO public USING (is_business_member(business_id));
CREATE POLICY "members write research (insert)" ON public.lead_research_profiles AS PERMISSIVE FOR INSERT TO public WITH CHECK (is_business_writer(business_id));
CREATE POLICY "members write research (update)" ON public.lead_research_profiles AS PERMISSIVE FOR UPDATE TO public USING (is_business_writer(business_id)) WITH CHECK (is_business_writer(business_id));
CREATE POLICY "members write research (delete)" ON public.lead_research_profiles AS PERMISSIVE FOR DELETE TO public USING (is_business_writer(business_id));

DROP POLICY IF EXISTS "members write scores" ON public.lead_scores;
CREATE POLICY "members write scores (read)" ON public.lead_scores AS PERMISSIVE FOR SELECT TO public USING (is_business_member(business_id));
CREATE POLICY "members write scores (insert)" ON public.lead_scores AS PERMISSIVE FOR INSERT TO public WITH CHECK (is_business_writer(business_id));
CREATE POLICY "members write scores (update)" ON public.lead_scores AS PERMISSIVE FOR UPDATE TO public USING (is_business_writer(business_id)) WITH CHECK (is_business_writer(business_id));
CREATE POLICY "members write scores (delete)" ON public.lead_scores AS PERMISSIVE FOR DELETE TO public USING (is_business_writer(business_id));

DROP POLICY IF EXISTS "lta_delete" ON public.lead_tag_assignments;
CREATE POLICY "lta_delete" ON public.lead_tag_assignments AS PERMISSIVE FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM leads l
  WHERE ((l.id = lead_tag_assignments.lead_id) AND is_workspace_writer(l.workspace_id)))));

DROP POLICY IF EXISTS "lta_insert" ON public.lead_tag_assignments;
CREATE POLICY "lta_insert" ON public.lead_tag_assignments AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM leads l
  WHERE ((l.id = lead_tag_assignments.lead_id) AND is_workspace_writer(l.workspace_id)))));

DROP POLICY IF EXISTS "Members delete business leads" ON public.leads;
CREATE POLICY "Members delete business leads" ON public.leads AS PERMISSIVE FOR DELETE TO public USING (((business_id IS NOT NULL) AND is_business_writer(business_id)));

DROP POLICY IF EXISTS "Members insert business leads" ON public.leads;
CREATE POLICY "Members insert business leads" ON public.leads AS PERMISSIVE FOR INSERT TO public WITH CHECK (((business_id IS NOT NULL) AND is_business_writer(business_id)));

DROP POLICY IF EXISTS "Members update business leads" ON public.leads;
CREATE POLICY "Members update business leads" ON public.leads AS PERMISSIVE FOR UPDATE TO public USING (((business_id IS NOT NULL) AND is_business_writer(business_id))) WITH CHECK (((business_id IS NOT NULL) AND is_business_writer(business_id)));

DROP POLICY IF EXISTS "members write media" ON public.media_assets;
CREATE POLICY "members write media (read)" ON public.media_assets AS PERMISSIVE FOR SELECT TO public USING (is_business_member(business_id));
CREATE POLICY "members write media (insert)" ON public.media_assets AS PERMISSIVE FOR INSERT TO public WITH CHECK (is_business_writer(business_id));
CREATE POLICY "members write media (update)" ON public.media_assets AS PERMISSIVE FOR UPDATE TO public USING (is_business_writer(business_id)) WITH CHECK (is_business_writer(business_id));
CREATE POLICY "members write media (delete)" ON public.media_assets AS PERMISSIVE FOR DELETE TO public USING (is_business_writer(business_id));

DROP POLICY IF EXISTS "enroll_insert" ON public.sequence_enrollments;
CREATE POLICY "enroll_insert" ON public.sequence_enrollments AS PERMISSIVE FOR INSERT TO public WITH CHECK (is_workspace_writer(workspace_id));

DROP POLICY IF EXISTS "enroll_update" ON public.sequence_enrollments;
CREATE POLICY "enroll_update" ON public.sequence_enrollments AS PERMISSIVE FOR UPDATE TO public USING (is_workspace_writer(workspace_id)) WITH CHECK (is_workspace_writer(workspace_id));

DROP POLICY IF EXISTS "steps_delete" ON public.sequence_steps;
CREATE POLICY "steps_delete" ON public.sequence_steps AS PERMISSIVE FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM email_sequences s
  WHERE ((s.id = sequence_steps.sequence_id) AND is_workspace_writer(s.workspace_id)))));

DROP POLICY IF EXISTS "steps_insert" ON public.sequence_steps;
CREATE POLICY "steps_insert" ON public.sequence_steps AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM email_sequences s
  WHERE ((s.id = sequence_steps.sequence_id) AND is_workspace_writer(s.workspace_id)))));

DROP POLICY IF EXISTS "steps_update" ON public.sequence_steps;
CREATE POLICY "steps_update" ON public.sequence_steps AS PERMISSIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM email_sequences s
  WHERE ((s.id = sequence_steps.sequence_id) AND is_workspace_writer(s.workspace_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM email_sequences s
  WHERE ((s.id = sequence_steps.sequence_id) AND is_workspace_writer(s.workspace_id)))));

DROP POLICY IF EXISTS "tags_delete" ON public.tags;
CREATE POLICY "tags_delete" ON public.tags AS PERMISSIVE FOR DELETE TO public USING (is_workspace_writer(workspace_id));

DROP POLICY IF EXISTS "tags_insert" ON public.tags;
CREATE POLICY "tags_insert" ON public.tags AS PERMISSIVE FOR INSERT TO public WITH CHECK (is_workspace_writer(workspace_id));

DROP POLICY IF EXISTS "tags_update" ON public.tags;
CREATE POLICY "tags_update" ON public.tags AS PERMISSIVE FOR UPDATE TO public USING (is_workspace_writer(workspace_id)) WITH CHECK (is_workspace_writer(workspace_id));

DROP POLICY IF EXISTS "tasks_delete" ON public.tasks;
CREATE POLICY "tasks_delete" ON public.tasks AS PERMISSIVE FOR DELETE TO public USING (is_workspace_writer(workspace_id));

DROP POLICY IF EXISTS "tasks_insert" ON public.tasks;
CREATE POLICY "tasks_insert" ON public.tasks AS PERMISSIVE FOR INSERT TO public WITH CHECK ((is_workspace_writer(workspace_id) AND (created_by = auth.uid())));

DROP POLICY IF EXISTS "tasks_update" ON public.tasks;
CREATE POLICY "tasks_update" ON public.tasks AS PERMISSIVE FOR UPDATE TO public USING (is_workspace_writer(workspace_id)) WITH CHECK (is_workspace_writer(workspace_id));-- Roadmap 6.2 - viewer read-only on the AI-memory ALL policies (inline
-- workspace_members membership). Reads keep the member subquery; writes require
-- is_workspace_writer (role <> 'viewer'). Completes shared-resource coverage.


DROP POLICY IF EXISTS "campaign_memory_write" ON public.campaign_memory;
CREATE POLICY "campaign_memory_write (read)" ON public.campaign_memory AS PERMISSIVE FOR SELECT TO public USING ((workspace_id IN ( SELECT workspace_members.workspace_id
   FROM workspace_members
  WHERE (workspace_members.user_id = auth.uid()))));
CREATE POLICY "campaign_memory_write (insert)" ON public.campaign_memory AS PERMISSIVE FOR INSERT TO public WITH CHECK (is_workspace_writer(workspace_id));
CREATE POLICY "campaign_memory_write (update)" ON public.campaign_memory AS PERMISSIVE FOR UPDATE TO public USING (is_workspace_writer(workspace_id)) WITH CHECK (is_workspace_writer(workspace_id));
CREATE POLICY "campaign_memory_write (delete)" ON public.campaign_memory AS PERMISSIVE FOR DELETE TO public USING (is_workspace_writer(workspace_id));

DROP POLICY IF EXISTS "lead_memory_write" ON public.lead_memory;
CREATE POLICY "lead_memory_write (read)" ON public.lead_memory AS PERMISSIVE FOR SELECT TO public USING ((workspace_id IN ( SELECT workspace_members.workspace_id
   FROM workspace_members
  WHERE (workspace_members.user_id = auth.uid()))));
CREATE POLICY "lead_memory_write (insert)" ON public.lead_memory AS PERMISSIVE FOR INSERT TO public WITH CHECK (is_workspace_writer(workspace_id));
CREATE POLICY "lead_memory_write (update)" ON public.lead_memory AS PERMISSIVE FOR UPDATE TO public USING (is_workspace_writer(workspace_id)) WITH CHECK (is_workspace_writer(workspace_id));
CREATE POLICY "lead_memory_write (delete)" ON public.lead_memory AS PERMISSIVE FOR DELETE TO public USING (is_workspace_writer(workspace_id));

DROP POLICY IF EXISTS "workspace_memory_write" ON public.workspace_memory;
CREATE POLICY "workspace_memory_write (read)" ON public.workspace_memory AS PERMISSIVE FOR SELECT TO public USING ((workspace_id IN ( SELECT workspace_members.workspace_id
   FROM workspace_members
  WHERE (workspace_members.user_id = auth.uid()))));
CREATE POLICY "workspace_memory_write (insert)" ON public.workspace_memory AS PERMISSIVE FOR INSERT TO public WITH CHECK (is_workspace_writer(workspace_id));
CREATE POLICY "workspace_memory_write (update)" ON public.workspace_memory AS PERMISSIVE FOR UPDATE TO public USING (is_workspace_writer(workspace_id)) WITH CHECK (is_workspace_writer(workspace_id));
CREATE POLICY "workspace_memory_write (delete)" ON public.workspace_memory AS PERMISSIVE FOR DELETE TO public USING (is_workspace_writer(workspace_id));-- Roadmap 6.2 - viewer read-only on workspace config/automation writes
-- (api_keys, webhook_endpoints, workspace_domains/branding, automation_goals,
-- ai_credit_usage). All were pure workspace-membership checks; writes now
-- require is_workspace_writer (role <> 'viewer'). These tables have no ALL
-- policy here, so reads are governed by separate SELECT policies (unchanged).


DROP POLICY IF EXISTS "ai_credit_usage_insert" ON public.ai_credit_usage;
CREATE POLICY "ai_credit_usage_insert" ON public.ai_credit_usage AS PERMISSIVE FOR INSERT TO public WITH CHECK (is_workspace_writer(workspace_id));

DROP POLICY IF EXISTS "api_keys_delete" ON public.api_keys;
CREATE POLICY "api_keys_delete" ON public.api_keys AS PERMISSIVE FOR DELETE TO public USING (is_workspace_writer(workspace_id));

DROP POLICY IF EXISTS "api_keys_update" ON public.api_keys;
CREATE POLICY "api_keys_update" ON public.api_keys AS PERMISSIVE FOR UPDATE TO public USING (is_workspace_writer(workspace_id)) WITH CHECK (is_workspace_writer(workspace_id));

DROP POLICY IF EXISTS "automation_goals_delete" ON public.automation_goals;
CREATE POLICY "automation_goals_delete" ON public.automation_goals AS PERMISSIVE FOR DELETE TO public USING (is_workspace_writer(workspace_id));

DROP POLICY IF EXISTS "automation_goals_insert" ON public.automation_goals;
CREATE POLICY "automation_goals_insert" ON public.automation_goals AS PERMISSIVE FOR INSERT TO public WITH CHECK (is_workspace_writer(workspace_id));

DROP POLICY IF EXISTS "automation_goals_update" ON public.automation_goals;
CREATE POLICY "automation_goals_update" ON public.automation_goals AS PERMISSIVE FOR UPDATE TO public USING (is_workspace_writer(workspace_id)) WITH CHECK (is_workspace_writer(workspace_id));

DROP POLICY IF EXISTS "webhook_endpoints_delete" ON public.webhook_endpoints;
CREATE POLICY "webhook_endpoints_delete" ON public.webhook_endpoints AS PERMISSIVE FOR DELETE TO public USING (is_workspace_writer(workspace_id));

DROP POLICY IF EXISTS "webhook_endpoints_insert" ON public.webhook_endpoints;
CREATE POLICY "webhook_endpoints_insert" ON public.webhook_endpoints AS PERMISSIVE FOR INSERT TO public WITH CHECK (is_workspace_writer(workspace_id));

DROP POLICY IF EXISTS "webhook_endpoints_update" ON public.webhook_endpoints;
CREATE POLICY "webhook_endpoints_update" ON public.webhook_endpoints AS PERMISSIVE FOR UPDATE TO public USING (is_workspace_writer(workspace_id)) WITH CHECK (is_workspace_writer(workspace_id));

DROP POLICY IF EXISTS "workspace_branding_upsert" ON public.workspace_branding;
CREATE POLICY "workspace_branding_upsert" ON public.workspace_branding AS PERMISSIVE FOR INSERT TO public WITH CHECK (is_workspace_writer(workspace_id));

DROP POLICY IF EXISTS "workspace_branding_update" ON public.workspace_branding;
CREATE POLICY "workspace_branding_update" ON public.workspace_branding AS PERMISSIVE FOR UPDATE TO public USING (is_workspace_writer(workspace_id)) WITH CHECK (is_workspace_writer(workspace_id));

DROP POLICY IF EXISTS "workspace_domains_delete" ON public.workspace_domains;
CREATE POLICY "workspace_domains_delete" ON public.workspace_domains AS PERMISSIVE FOR DELETE TO public USING (is_workspace_writer(workspace_id));

DROP POLICY IF EXISTS "workspace_domains_insert" ON public.workspace_domains;
CREATE POLICY "workspace_domains_insert" ON public.workspace_domains AS PERMISSIVE FOR INSERT TO public WITH CHECK (is_workspace_writer(workspace_id));

DROP POLICY IF EXISTS "workspace_domains_update" ON public.workspace_domains;
CREATE POLICY "workspace_domains_update" ON public.workspace_domains AS PERMISSIVE FOR UPDATE TO public USING (is_workspace_writer(workspace_id)) WITH CHECK (is_workspace_writer(workspace_id));