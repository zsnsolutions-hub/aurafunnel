-- ====================================================
-- Add lead_sync + lane_status_map to Sales Sprint template
-- ====================================================

UPDATE teamhub_flow_templates
SET structure_json = jsonb_set(
  jsonb_set(
    structure_json::jsonb,
    '{lead_sync}',
    'true'::jsonb
  ),
  '{lane_status_map}',
  '{"Prospecting": "New", "Contacted": "Contacted", "Negotiation": "Qualified", "Closed": "Converted"}'::jsonb
)
WHERE name = 'Sales Sprint' AND type = 'system';
