-- Fix plan credit values to match the correct limits
-- Free: 200, Starter: 2000, Growth: 10000, Scale: 40000

UPDATE plans SET
  credits = 200,
  limits = jsonb_set(
    jsonb_set(
      jsonb_set(COALESCE(limits, '{}'::jsonb), '{credits}', '200'),
      '{aiCredits}', '200'
    ),
    '{aiCreditsMonthly}', '200'
  )
WHERE name = 'Free';

UPDATE plans SET
  credits = 2000,
  limits = jsonb_set(
    jsonb_set(
      jsonb_set(COALESCE(limits, '{}'::jsonb), '{credits}', '2000'),
      '{aiCredits}', '2000'
    ),
    '{aiCreditsMonthly}', '2000'
  )
WHERE name = 'Starter';

UPDATE plans SET
  credits = 10000,
  limits = jsonb_set(
    jsonb_set(
      jsonb_set(COALESCE(limits, '{}'::jsonb), '{credits}', '10000'),
      '{aiCredits}', '10000'
    ),
    '{aiCreditsMonthly}', '10000'
  )
WHERE name = 'Growth';

UPDATE plans SET
  credits = 40000,
  limits = jsonb_set(
    jsonb_set(
      jsonb_set(COALESCE(limits, '{}'::jsonb), '{credits}', '40000'),
      '{aiCredits}', '40000'
    ),
    '{aiCreditsMonthly}', '40000'
  )
WHERE name = 'Scale';

-- Fix profiles.credits_total based on current plan
UPDATE profiles SET credits_total = 200 WHERE plan = 'Free';
UPDATE profiles SET credits_total = 2000 WHERE plan = 'Starter';
UPDATE profiles SET credits_total = 10000 WHERE plan = 'Growth';
UPDATE profiles SET credits_total = 40000 WHERE plan = 'Scale';

-- Fix workspace_ai_usage credits_limit for current month
UPDATE workspace_ai_usage SET credits_limit = 2000
WHERE credits_limit = 100 OR credits_limit = 500;

UPDATE workspace_ai_usage SET credits_limit = 200
WHERE credits_limit = 0;
