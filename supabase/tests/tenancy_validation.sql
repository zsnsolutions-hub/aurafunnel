-- ============================================================================
-- tenancy_validation.sql — read-only canonical-tenancy data health report.
-- Run before/after each tenancy migration stage:
--   supabase db query --linked "$(cat supabase/tests/tenancy_validation.sql)"
-- Every count should be 0 except the informational rows (totals, system rows).
-- ============================================================================
select 'leads.null_workspace_id'        k, count(*) v from public.leads where workspace_id is null
union all select 'leads.null_business_id',        count(*) from public.leads where business_id is null
union all select 'leads.orphan_business',         count(*) from public.leads l where l.business_id is not null and not exists (select 1 from public.businesses b where b.id=l.business_id)
union all select 'leads.ws_business_mismatch',     count(*) from public.leads l join public.businesses b on b.id=l.business_id where b.workspace_id is distinct from l.workspace_id
union all select 'ai_threads.null_business_id',     count(*) from public.ai_threads where business_id is null
union all select 'social_posts.null_business_id',   count(*) from public.social_posts where business_id is null
union all select 'blog_posts.null_business_id',     count(*) from public.blog_posts where business_id is null
union all select 'business_members.bad_business',   count(*) from public.business_members m where not exists (select 1 from public.businesses b where b.id=m.business_id)
union all select 'businesses.bad_workspace',        count(*) from public.businesses b where not exists (select 1 from public.workspaces w where w.id=b.workspace_id)
union all select 'workspaces.id_ne_owner (informational — convention breakers)', count(*) from public.workspaces where id is distinct from owner_id
union all select 'email_templates.system_defaults (informational)', count(*) from public.email_templates where owner_id is null
order by 1;
