-- =====================================================
-- Team Hub: Lead Integration + Board Templates
-- =====================================================

-- 1. Item-Lead linking table
CREATE TABLE IF NOT EXISTS public.teamhub_item_leads (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id uuid NOT NULL REFERENCES public.teamhub_cards(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone DEFAULT now()
);

-- Enforce: one active link per item
CREATE UNIQUE INDEX IF NOT EXISTS idx_item_leads_active_item
  ON public.teamhub_item_leads (item_id)
  WHERE is_active = true;

-- Enforce: one active link per lead (across all flows)
CREATE UNIQUE INDEX IF NOT EXISTS idx_item_leads_active_lead
  ON public.teamhub_item_leads (lead_id)
  WHERE is_active = true;

-- Index for lookups
CREATE INDEX IF NOT EXISTS idx_item_leads_item ON public.teamhub_item_leads (item_id);
CREATE INDEX IF NOT EXISTS idx_item_leads_lead ON public.teamhub_item_leads (lead_id);

-- 2. Flow templates table
CREATE TABLE IF NOT EXISTS public.teamhub_flow_templates (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  type text NOT NULL DEFAULT 'system' CHECK (type IN ('system', 'user')),
  structure_json jsonb NOT NULL DEFAULT '{}',
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamp with time zone DEFAULT now()
);

-- 3. Add template_id reference to boards (nullable, for tracking which template was used)
DO $$ BEGIN
  ALTER TABLE public.teamhub_boards ADD COLUMN template_id uuid REFERENCES public.teamhub_flow_templates(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- =====================================================
-- RLS Policies
-- =====================================================

ALTER TABLE public.teamhub_item_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teamhub_flow_templates ENABLE ROW LEVEL SECURITY;

-- Item-Lead links: SELECT if user is a member of the flow
DO $$ BEGIN
  CREATE POLICY "item_lead_select" ON public.teamhub_item_leads
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM teamhub_cards c
        JOIN teamhub_flow_members fm ON fm.flow_id = c.board_id
        WHERE c.id = teamhub_item_leads.item_id AND fm.user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Item-Lead links: INSERT only if user is owner/admin of the flow
DO $$ BEGIN
  CREATE POLICY "item_lead_insert" ON public.teamhub_item_leads
    FOR INSERT WITH CHECK (
      EXISTS (
        SELECT 1 FROM teamhub_cards c
        JOIN teamhub_flow_members fm ON fm.flow_id = c.board_id
        WHERE c.id = teamhub_item_leads.item_id
          AND fm.user_id = auth.uid()
          AND fm.role IN ('owner', 'admin')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Item-Lead links: UPDATE (deactivate) only if user is owner/admin
DO $$ BEGIN
  CREATE POLICY "item_lead_update" ON public.teamhub_item_leads
    FOR UPDATE USING (
      EXISTS (
        SELECT 1 FROM teamhub_cards c
        JOIN teamhub_flow_members fm ON fm.flow_id = c.board_id
        WHERE c.id = teamhub_item_leads.item_id
          AND fm.user_id = auth.uid()
          AND fm.role IN ('owner', 'admin')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Item-Lead links: DELETE only if user is owner/admin
DO $$ BEGIN
  CREATE POLICY "item_lead_delete" ON public.teamhub_item_leads
    FOR DELETE USING (
      EXISTS (
        SELECT 1 FROM teamhub_cards c
        JOIN teamhub_flow_members fm ON fm.flow_id = c.board_id
        WHERE c.id = teamhub_item_leads.item_id
          AND fm.user_id = auth.uid()
          AND fm.role IN ('owner', 'admin')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Templates: anyone can read system templates; user templates visible to creator
DO $$ BEGIN
  CREATE POLICY "template_select" ON public.teamhub_flow_templates
    FOR SELECT USING (
      type = 'system' OR created_by = auth.uid()
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Templates: users can insert their own templates
DO $$ BEGIN
  CREATE POLICY "template_insert" ON public.teamhub_flow_templates
    FOR INSERT WITH CHECK (
      created_by = auth.uid() AND type = 'user'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Templates: users can delete their own templates
DO $$ BEGIN
  CREATE POLICY "template_delete" ON public.teamhub_flow_templates
    FOR DELETE USING (
      created_by = auth.uid() AND type = 'user'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =====================================================
-- Seed system templates
-- =====================================================

INSERT INTO public.teamhub_flow_templates (name, type, structure_json, created_by)
SELECT 'Basic Workflow', 'system', '{
  "lanes": [
    { "name": "To Do", "position": 0 },
    { "name": "Progress", "position": 1 },
    { "name": "Done", "position": 2 }
  ],
  "lead_sync": true,
  "lane_status_map": {
    "To Do": "New",
    "Progress": "Contacted",
    "Done": "Converted"
  }
}'::jsonb, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.teamhub_flow_templates WHERE name = 'Basic Workflow' AND type = 'system'
);

INSERT INTO public.teamhub_flow_templates (name, type, structure_json, created_by)
SELECT 'Sales Sprint', 'system', '{
  "lanes": [
    { "name": "Prospecting", "position": 0 },
    { "name": "Contacted", "position": 1 },
    { "name": "Negotiation", "position": 2 },
    { "name": "Closed", "position": 3 }
  ]
}'::jsonb, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.teamhub_flow_templates WHERE name = 'Sales Sprint' AND type = 'system'
);

INSERT INTO public.teamhub_flow_templates (name, type, structure_json, created_by)
SELECT 'Project Delivery', 'system', '{
  "lanes": [
    { "name": "Planning", "position": 0 },
    { "name": "Active", "position": 1 },
    { "name": "Review", "position": 2 },
    { "name": "Complete", "position": 3 }
  ]
}'::jsonb, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.teamhub_flow_templates WHERE name = 'Project Delivery' AND type = 'system'
);
