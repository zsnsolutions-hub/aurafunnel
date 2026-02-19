-- ─── Email Templates Table ───
CREATE TABLE email_templates (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  category         TEXT NOT NULL CHECK (category IN ('welcome','follow_up','case_study','demo_invite','nurture','custom')),
  subject_template TEXT NOT NULL DEFAULT '',
  body_template    TEXT NOT NULL DEFAULT '',
  is_default       BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_email_templates_owner ON email_templates(owner_id);
CREATE INDEX idx_email_templates_category ON email_templates(category);

-- RLS
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;

-- Anyone can read system defaults (owner_id IS NULL)
CREATE POLICY "read_default_templates" ON email_templates
  FOR SELECT USING (owner_id IS NULL AND is_default = true);

-- Authenticated users can read their own templates
CREATE POLICY "read_own_templates" ON email_templates
  FOR SELECT USING (auth.uid() = owner_id);

-- Authenticated users can insert their own templates
CREATE POLICY "insert_own_templates" ON email_templates
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

-- Authenticated users can update their own templates
CREATE POLICY "update_own_templates" ON email_templates
  FOR UPDATE USING (auth.uid() = owner_id);

-- Authenticated users can delete their own templates
CREATE POLICY "delete_own_templates" ON email_templates
  FOR DELETE USING (auth.uid() = owner_id);

-- ─── Seed 6 Default Templates ───

INSERT INTO email_templates (owner_id, name, category, subject_template, body_template, is_default) VALUES

-- 1. Welcome Email
(NULL, 'Welcome Email', 'welcome',
 'Welcome to {{sender_company}}, {{first_name}}!',
 '<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#1e293b">
<p>Hi {{first_name}},</p>
<p>Thanks for connecting with us! I noticed {{company}} is doing impressive work in your space{{ai_insight}}.</p>
<p>At {{sender_company}}, we help companies like yours streamline their growth by focusing on what matters most — reaching the right prospects with the right message at the right time.</p>
<p>I''d love to learn more about your current priorities and see if there''s a fit. Would you be open to a quick 15-minute call this week?</p>
<p>Looking forward to hearing from you.</p>
<p>Best,<br/>{{your_name}}<br/>{{sender_company}}</p>
</div>',
 true),

-- 2. Follow-Up
(NULL, 'Follow-Up', 'follow_up',
 'Quick follow-up, {{first_name}}',
 '<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#1e293b">
<p>Hi {{first_name}},</p>
<p>I wanted to circle back on my previous note. I know things get busy at {{company}}, so I''ll keep this brief.</p>
<p>We''ve been helping teams in {{industry}} tackle challenges like scaling outreach without sacrificing personalization — and I think there could be a strong alignment with what you''re building.</p>
<p>Would it make sense to set up a 10-minute intro call? Happy to work around your schedule.</p>
<p>Cheers,<br/>{{your_name}}<br/>{{sender_company}}</p>
</div>',
 true),

-- 3. Case Study
(NULL, 'Case Study Share', 'case_study',
 '{{first_name}}, how a team like yours grew pipeline 3x',
 '<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#1e293b">
<p>Hi {{first_name}},</p>
<p>I thought this would resonate with what you''re working on at {{company}}.</p>
<p>We recently helped a {{industry}} team:</p>
<ul>
<li>Increase qualified pipeline by 3x in 90 days</li>
<li>Reduce manual outreach time by 60%</li>
<li>Improve response rates by 40% with AI-personalized messaging</li>
</ul>
<p>The key insight? They stopped sending generic emails and started letting AI tailor every touchpoint to each prospect''s context.</p>
<p>I''d be happy to walk you through exactly how they did it. Would a short call work this week?</p>
<p>Best,<br/>{{your_name}}<br/>{{sender_company}}</p>
</div>',
 true),

-- 4. Demo Invitation
(NULL, 'Demo Invitation', 'demo_invite',
 '{{first_name}}, see how {{sender_company}} works — live demo',
 '<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#1e293b">
<p>Hi {{first_name}},</p>
<p>I''d like to invite you to a personalized demo of {{sender_company}} — tailored specifically to {{company}}''s goals.</p>
<p>In just 20 minutes, I''ll show you how to:</p>
<ul>
<li>Automate lead scoring and prioritization with AI</li>
<li>Send hyper-personalized outreach at scale</li>
<li>Track engagement and optimize follow-ups in real time</li>
</ul>
<p>No slides, no fluff — just a live walkthrough of what this could look like for your team.</p>
<p>Can I book 20 minutes on your calendar this week?</p>
<p>Talk soon,<br/>{{your_name}}<br/>{{sender_company}}</p>
</div>',
 true),

-- 5. Nurture Content
(NULL, 'Nurture Content', 'nurture',
 'Quick read for you, {{first_name}} — {{industry}} insights',
 '<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#1e293b">
<p>Hi {{first_name}},</p>
<p>No ask today — just sharing something I thought you''d find valuable.</p>
<p>We recently published a piece on how {{industry}} leaders are rethinking their go-to-market approach in 2026. Key takeaways:</p>
<ul>
<li>AI-driven personalization is now table stakes, not a nice-to-have</li>
<li>Teams that automate prospecting see 2-4x more pipeline coverage</li>
<li>The best-performing outreach combines human strategy with machine execution</li>
</ul>
<p>If any of this resonates with what you''re seeing at {{company}}, I''d love to compare notes.</p>
<p>Have a great week,<br/>{{your_name}}<br/>{{sender_company}}</p>
</div>',
 true),

-- 6. Custom Template (blank starter)
(NULL, 'Custom Template', 'custom',
 'A message for {{first_name}} at {{company}}',
 '<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#1e293b">
<p>Hi {{first_name}},</p>
<p>{{ai_insight}}</p>
<p>Best,<br/>{{your_name}}<br/>{{sender_company}}</p>
</div>',
 true);
