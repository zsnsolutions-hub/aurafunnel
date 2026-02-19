-- ─── User Prompts Table ───
CREATE TABLE user_prompts (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id           UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  prompt_key         TEXT NOT NULL,
  category           TEXT NOT NULL CHECK (category IN (
    'sales_outreach','analytics','email','content','lead_research','blog','social','automation','strategy'
  )),
  display_name       TEXT NOT NULL,
  description        TEXT NOT NULL DEFAULT '',
  system_instruction TEXT NOT NULL DEFAULT '',
  prompt_template    TEXT NOT NULL DEFAULT '',
  temperature        REAL NOT NULL DEFAULT 0.7,
  top_p              REAL NOT NULL DEFAULT 0.9,
  version            INTEGER NOT NULL DEFAULT 1,
  is_active          BOOLEAN NOT NULL DEFAULT true,
  is_default         BOOLEAN NOT NULL DEFAULT false,
  last_tested_at     TIMESTAMPTZ,
  test_result        TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_user_prompts_owner ON user_prompts(owner_id);
CREATE INDEX idx_user_prompts_key ON user_prompts(prompt_key);
CREATE INDEX idx_user_prompts_category ON user_prompts(category);

-- Only one active prompt per user per key
CREATE UNIQUE INDEX idx_user_prompts_active_unique
  ON user_prompts(owner_id, prompt_key) WHERE is_active = true;

-- ─── User Prompt Versions Table (version history for rollback) ───
CREATE TABLE user_prompt_versions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_id          UUID NOT NULL REFERENCES user_prompts(id) ON DELETE CASCADE,
  owner_id           UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  version            INTEGER NOT NULL,
  system_instruction TEXT NOT NULL DEFAULT '',
  prompt_template    TEXT NOT NULL DEFAULT '',
  temperature        REAL NOT NULL DEFAULT 0.7,
  top_p              REAL NOT NULL DEFAULT 0.9,
  change_note        TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_prompt_versions_prompt ON user_prompt_versions(prompt_id);

-- ─── RLS ───
ALTER TABLE user_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_prompt_versions ENABLE ROW LEVEL SECURITY;

-- Anyone can read system defaults (owner_id IS NULL)
CREATE POLICY "read_default_prompts" ON user_prompts
  FOR SELECT USING (owner_id IS NULL AND is_default = true);

-- Authenticated users can read their own prompts
CREATE POLICY "read_own_prompts" ON user_prompts
  FOR SELECT USING (auth.uid() = owner_id);

-- Authenticated users can insert their own prompts
CREATE POLICY "insert_own_prompts" ON user_prompts
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

-- Authenticated users can update their own prompts
CREATE POLICY "update_own_prompts" ON user_prompts
  FOR UPDATE USING (auth.uid() = owner_id);

-- Authenticated users can delete their own prompts
CREATE POLICY "delete_own_prompts" ON user_prompts
  FOR DELETE USING (auth.uid() = owner_id);

-- Version history: users can read/insert their own
CREATE POLICY "read_own_prompt_versions" ON user_prompt_versions
  FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "insert_own_prompt_versions" ON user_prompt_versions
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

-- ─── Seed 28 System Default Prompts ───

INSERT INTO user_prompts (owner_id, prompt_key, category, display_name, description, system_instruction, prompt_template, temperature, top_p, is_default) VALUES

-- 1. sales_outreach
(NULL, 'sales_outreach', 'sales_outreach', 'Sales Outreach', 'Generate hyper-personalized B2B sales outreach content for leads',
'You are a world-class B2B sales development representative specializing in hyper-personalized outreach. Your goal is to generate high-conversion content that feels human, researched, and valuable. Avoid generic corporate jargon. Focus on the prospect''s pain points and industry context.',
'TARGET PROSPECT DATA:
Name: {{lead_name}}
Title/Role: Lead
Company: {{company}}
Intelligence Score: {{score}}/100
AI-Detected Insights: {{insights}}

CONTENT TYPE: {{type}}

REQUIREMENTS:
1. Reference the company name naturally.
2. Leverage the intelligence insight to show deep research.
3. Include a soft but clear Call to Action (CTA).
4. Maintain a {{tone}} tone.
5. Do not exceed 150 words.',
0.8, 0.9, true),

-- 2. dashboard_insights
(NULL, 'dashboard_insights', 'analytics', 'Dashboard Insights', 'Generate actionable pipeline insights from lead data',
'You are a senior B2B sales analytics AI. Provide actionable, data-driven insights. Be concise and specific.',
'You are an AI sales strategist analyzing a B2B lead pipeline. Provide 3-5 actionable insights based on this data.

PIPELINE SUMMARY:
- Total Leads: {{total_leads}}
- Average Score: {{avg_score}}/100
- Status Breakdown: {{status_breakdown}}
- Hot Leads (score > 80): {{hot_leads}}

TOP LEADS:
{{lead_summary}}

Provide concise, data-driven recommendations. Focus on:
1. Which leads to prioritize and why
2. Pipeline health assessment
3. Suggested next actions
4. Timing recommendations

Keep response under 300 words. Be specific, not generic.',
0.7, 0.9, true),

-- 3. email_sequence
(NULL, 'email_sequence', 'email', 'Email Sequence Builder', 'Generate multi-step B2B email outreach sequences',
'You are an expert email sequence copywriter for B2B sales. Generate high-converting email sequences that feel human and personalized.',
'Generate a {{sequence_length}}-email outreach sequence for B2B sales.

TARGET AUDIENCE (sample leads):
{{lead_context}}

SEQUENCE CONFIG:
- Goal: {{goal_label}}
- Number of Emails: {{sequence_length}}
- Cadence: Every {{cadence_days}} day(s)
- Tone: {{tone}}
- Total leads in audience: {{audience_count}}

REQUIREMENTS:
1. Each email must have a clear subject line and body.
2. Use ONLY these personalization placeholders: {{first_name}}, {{company}}, {{ai_insight}}, {{your_name}}.
3. Each email should build on the previous, escalating urgency naturally.
4. Email 1: Introduction & value proposition
5. Final email: Break-up email with last chance CTA
6. Keep each email under 200 words.
7. Match the {{tone}} tone consistently.

FORMAT YOUR RESPONSE EXACTLY LIKE THIS (repeat for each email):
===EMAIL_START===
STEP: [number]
DELAY: Day [number]
SUBJECT: [subject line]
BODY:
[email body]
===EMAIL_END===',
0.85, 0.9, true),

-- 4. content_email
(NULL, 'content_email', 'content', 'Content — Email', 'Generate compelling cold email content for a specific lead',
'You are an expert email copywriter.',
'Write a compelling cold email for {{lead_name}} at {{company}}. Score: {{score}}. Insights: {{insights}}. Tone: {{tone}}. Use ONLY these placeholders: {{first_name}}, {{company}}, {{your_name}}. Write all other details as actual specific content based on the lead data. Under 200 words.',
0.8, 0.9, true),

-- 5. content_landing_page
(NULL, 'content_landing_page', 'content', 'Content — Landing Page', 'Create conversion-focused landing page copy',
'You are a conversion-focused landing page copywriter.',
'Create landing page copy targeting {{company}} in their industry. Include:
- Hero headline & subheadline (use {{company}} tag)
- 3 benefit bullets
- Social proof section placeholder
- CTA section
Use ONLY {{company}} and {{first_name}} as placeholders. Write industry, pain points, and benefits as actual content. Tone: {{tone}}. Lead insights: {{insights}}.',
0.8, 0.9, true),

-- 6. content_social
(NULL, 'content_social', 'content', 'Content — Social Media', 'Generate B2B social media posts targeting specific leads',
'You are a B2B social media strategist.',
'Generate 3 LinkedIn posts targeting professionals like {{lead_name}} at {{company}}.
Each post should:
- Hook in first line
- Provide value
- End with engagement question or CTA
Use ONLY {{first_name}} and {{company}} as placeholders. Write industry details and insights as actual content. Tone: {{tone}}. Industry insights: {{insights}}.',
0.8, 0.9, true),

-- 7. content_blog
(NULL, 'content_blog', 'content', 'Content — Blog Article', 'Write blog article outlines and intros for lead industries',
'You are a B2B content marketing expert.',
'Write a blog article outline + intro targeting companies like {{company}}.
- Title (SEO-optimized)
- 5-section outline with key points
- Full intro paragraph (150 words)
- Meta description
Do NOT use any placeholders. Write all content with specific details. Tone: {{tone}}. Industry context: {{insights}}.',
0.8, 0.9, true),

-- 8. content_report
(NULL, 'content_report', 'content', 'Content — Report', 'Create whitepaper/report outlines for lead industries',
'You are a B2B research analyst and report writer.',
'Create a whitepaper/report outline for {{company}}''s industry:
- Executive Summary
- 4-5 key sections with bullet points
- Data points to include (suggest specific metrics)
- Conclusion with CTA
Do NOT use any placeholders. Write all content with specific details. Tone: {{tone}}. Context: {{insights}}.',
0.8, 0.9, true),

-- 9. content_proposal
(NULL, 'content_proposal', 'content', 'Content — Proposal', 'Draft business proposals for specific leads',
'You are a senior sales proposal writer.',
'Draft a business proposal for {{lead_name}} at {{company}}:
- Opening (reference their company and challenges)
- Problem Statement
- Proposed Solution (3 key deliverables)
- Timeline
- Pricing placeholder
- Next Steps / CTA
Use ONLY {{first_name}}, {{company}}, {{your_name}} as placeholders. Write all other details as actual specific content. Tone: {{tone}}. Lead score: {{score}}. Insights: {{insights}}.',
0.8, 0.9, true),

-- 10. content_ad
(NULL, 'content_ad', 'content', 'Content — Ad Copy', 'Create high-converting B2B ad copy for multiple platforms',
'You are a performance marketing copywriter specializing in high-converting B2B ad copy.',
'Create compelling ad copy targeting {{company}}''s industry:
- Google Search Ad: 3 headlines (max 30 chars each) + 2 descriptions (max 90 chars each)
- LinkedIn Sponsored Ad: Headline + body (max 150 words) + CTA
- A/B variant with a different angle
Tone: {{tone}}. Lead insights: {{insights}}.',
0.8, 0.9, true),

-- 11. lead_research
(NULL, 'lead_research', 'lead_research', 'Lead Research', 'Comprehensive B2B lead research with web intelligence',
'You are a senior B2B research analyst with access to web search. Produce comprehensive, actionable intelligence briefs using real web data. Search thoroughly for the lead and their company. Always use the exact delimited format requested.',
'Research the following B2B lead comprehensively.

LEAD DATA:
- Name: {{lead_name}}
- Company: {{company}}
- Email Domain: {{email_domain}}
- Existing Insights: {{insights}}

SOCIAL / WEB PRESENCE:
{{url_context}}

RESEARCH INSTRUCTIONS:
1. Search the company website for pages mentioning the lead by name.
2. Search LinkedIn for the lead''s profile, activity, and recent posts.
3. Look for news articles, press releases, podcast appearances.
4. Identify the company''s industry, size, products, and recent milestones.
5. Find potential common ground with the sender''s business.
6. Identify the lead''s recent projects, publications, or achievements.

Respond using EXACTLY this delimited format (every field required):

===FIELD===TITLE: [Job title]===END===
===FIELD===INDUSTRY: [Industry sector]===END===
===FIELD===EMPLOYEE_COUNT: [Approximate company size]===END===
===FIELD===LOCATION: [City, State, Country]===END===
===FIELD===COMPANY_OVERVIEW: [2-3 sentences]===END===
===FIELD===TALKING_POINTS: [3-4 items separated by | pipes]===END===
===FIELD===OUTREACH_ANGLE: [2-3 sentences]===END===
===FIELD===RISK_FACTORS: [1-2 items separated by | pipes]===END===
===FIELD===MENTIONED_ON_WEBSITE: [Quote or "Not found"]===END===
===FIELD===RESEARCH_BRIEF: [150-250 word summary]===END===',
0.3, 0.9, true),

-- 12. business_analysis
(NULL, 'business_analysis', 'lead_research', 'Business Analysis', 'Extract structured business intelligence from websites',
'You are a business intelligence analyst. Extract structured company data from websites and online presence. Always respond with valid JSON only.',
'Research the following company and extract structured business intelligence.

COMPANY WEBSITE: {{website_url}}
{{social_context}}

Analyze the company''s website and any available online information. Look specifically for:
- Contact pages, footer sections, and "About Us" pages
- Social media links in the website header, footer, or contact page
- Company information, products, target market, and business model

Return a JSON object with the following structure. Each field must have a "value" (string) and "confidence" (number 0-100).

{
  "companyName": { "value": "...", "confidence": 0-100 },
  "industry": { "value": "...", "confidence": 0-100 },
  "productsServices": { "value": "...", "confidence": 0-100 },
  "targetAudience": { "value": "...", "confidence": 0-100 },
  "valueProp": { "value": "...", "confidence": 0-100 },
  "pricingModel": { "value": "...", "confidence": 0-100 },
  "salesApproach": { "value": "...", "confidence": 0-100 },
  "phone": { "value": "...", "confidence": 0-100 },
  "businessEmail": { "value": "...", "confidence": 0-100 },
  "address": { "value": "...", "confidence": 0-100 },
  "socialLinks": { ... },
  "followUpQuestions": ["..."]
}

Return ONLY valid JSON, no markdown or explanation.',
0.3, 0.9, true),

-- 13. follow_up_questions
(NULL, 'follow_up_questions', 'analytics', 'Follow-Up Questions', 'Generate targeted follow-up questions for business profiles',
'You are a business strategy consultant. Ask insightful questions to understand a company. Always respond with valid JSON only.',
'Based on this partially-filled business profile, generate 2-4 targeted follow-up questions to fill in the gaps.

CURRENT PROFILE:
{{profile_context}}

EMPTY/MISSING FIELDS: {{empty_fields}}
{{previous_context}}

Return a JSON object with this structure:
{
  "questions": [
    { "field": "productsServices", "question": "What are the main products or services your company offers?", "placeholder": "e.g. Cloud-based CRM platform for small businesses" }
  ]
}

Guidelines:
- Only ask about fields that are empty or vague
- Don''t repeat questions already answered
- Make questions conversational and specific
- Provide helpful placeholder text
- Return ONLY valid JSON',
0.5, 0.9, true),

-- 14. command_center_analyst
(NULL, 'command_center_analyst', 'analytics', 'Command Center — Analyst', 'Data-driven pipeline analysis with specific metrics and comparisons',
'You are a senior data analyst for a B2B sales pipeline. Cite specific lead names, scores, and percentages. Use markdown tables when comparing data. Be precise and data-driven.',
'Analyze the following pipeline data and respond to the user''s request with data-driven insights.

{{pipeline_context}}

USER REQUEST:
{{user_prompt}}',
0.7, 0.9, true),

-- 15. command_center_strategist
(NULL, 'command_center_strategist', 'strategy', 'Command Center — Strategist', 'Strategic sales planning with actionable next steps',
'You are a sales strategist for a B2B pipeline. Create actionable plans and reference leads by name. Always end with a clear next step the user can take immediately.',
'Analyze the following pipeline data and respond to the user''s request with strategic recommendations.

{{pipeline_context}}

USER REQUEST:
{{user_prompt}}',
0.7, 0.9, true),

-- 16. command_center_coach
(NULL, 'command_center_coach', 'strategy', 'Command Center — Coach', 'Constructive sales coaching with honest feedback',
'You are a sales coach reviewing a B2B pipeline. Give honest, constructive feedback. Identify strengths and weaknesses from the actual data. Be encouraging but direct.',
'Review the following pipeline data and respond to the user''s request with coaching feedback.

{{pipeline_context}}

USER REQUEST:
{{user_prompt}}',
0.7, 0.9, true),

-- 17. command_center_creative
(NULL, 'command_center_creative', 'content', 'Command Center — Creative', 'Personalized content creation using pipeline lead data',
'You are a content specialist for B2B sales outreach. Write personalized content referencing specific lead details (name, company, insights). Never produce generic templates — every piece must be tailored to the data provided.',
'Use the following pipeline data to create personalized content as requested.

{{pipeline_context}}

USER REQUEST:
{{user_prompt}}',
0.85, 0.9, true),

-- 18. content_suggestions
(NULL, 'content_suggestions', 'content', 'Content Suggestions', 'Analyze content and provide specific improvement suggestions',
'You are a senior content optimization specialist for B2B sales. Analyze content and provide specific, actionable improvement suggestions. Always use the exact delimited format requested.',
'Analyze the following content and return exactly 5 improvement suggestions.

CONTENT TO ANALYZE:
{{content}}

For each suggestion, use this exact delimited format:

===SUGGESTION===
TYPE: [one of: word|metric|personalization|structure|cta]
CATEGORY: [one of: high|medium|style]
TITLE: [short actionable title, max 10 words]
DESCRIPTION: [1-2 sentences explaining why this matters]
ORIGINAL_TEXT: [exact quote to replace, or empty for structure/cta]
REPLACEMENT: [improved text]
IMPACT_LABEL: [e.g. "+12% opens"]
IMPACT_PERCENT: [number only]
===END_SUGGESTION===

Return exactly 5 suggestions.',
0.7, 0.9, true),

-- 19. pipeline_strategy
(NULL, 'pipeline_strategy', 'strategy', 'Pipeline Strategy', 'Generate strategic recommendations from pipeline data',
'You are a senior B2B sales strategist. Analyze pipeline data and produce actionable strategy recommendations. Always use the exact delimited format requested.',
'Analyze this B2B sales pipeline and generate strategic recommendations.

PIPELINE DATA:
- Total Leads: {{total_leads}}
- Average Lead Score: {{avg_score}}/100
- Status Breakdown: {{status_breakdown}}
- Hot Leads (score > 80): {{hot_leads}}
- Emails Sent: {{emails_sent}}
- Emails Opened: {{emails_opened}}
- Conversion Rate: {{conversion_rate}}%
- Recent Activity: {{recent_activity}}

Respond using EXACTLY this delimited format:

===FIELD===RECOMMENDATIONS: [3-5 items separated by | pipes]===END===
===FIELD===SPRINT_GOALS: [4 goals, format: title|target|current|unit|deadline]===END===
===FIELD===RISKS: [2-4 items separated by | pipes]===END===
===FIELD===PRIORITY_ACTIONS: [Top 3 items separated by | pipes]===END===

Be specific and data-driven.',
0.7, 0.9, true),

-- 20. blog_full_draft
(NULL, 'blog_full_draft', 'blog', 'Blog — Full Draft', 'Write a complete, publication-ready blog post',
'You are an expert blog content writer specializing in B2B and technology topics. You write engaging, well-researched content in clean markdown format. Your posts are SEO-friendly and provide genuine value to readers.',
'Write a complete, publication-ready blog post about "{{topic}}". Include:
- An engaging title (if not provided)
- Introduction that hooks the reader
- 3-5 well-structured sections with ## headings
- Practical examples or data points
- A compelling conclusion with a call to action
- Target 600-1200 words
- Use markdown formatting throughout
{{tone_guide}}{{category_guide}}{{keyword_guide}}

Output the blog content in clean markdown format.',
0.85, 0.9, true),

-- 21. blog_outline
(NULL, 'blog_outline', 'blog', 'Blog — Outline', 'Create detailed blog post outlines with SEO keywords',
'You are an expert blog content writer specializing in B2B and technology topics. You write engaging, well-researched content in clean markdown format. Your posts are SEO-friendly and provide genuine value to readers.',
'Create a detailed blog post outline for "{{topic}}". Include:
- A compelling title suggestion
- Introduction summary (2-3 sentences)
- 5-7 section headings (##) with 2-3 bullet points each
- Conclusion summary
- 3 suggested keywords for SEO
- Format in markdown
{{tone_guide}}{{category_guide}}{{keyword_guide}}',
0.7, 0.9, true),

-- 22. blog_improve
(NULL, 'blog_improve', 'blog', 'Blog — Improve', 'Rewrite and enhance existing blog content',
'You are an expert blog content writer specializing in B2B and technology topics. You write engaging, well-researched content in clean markdown format. Your posts are SEO-friendly and provide genuine value to readers.',
'Rewrite and improve the following blog content about "{{topic}}". Make it more:
- Engaging and readable
- Well-structured with clear headings
- Professional yet conversational
- SEO-friendly
- Keep the core message but enhance the quality significantly

EXISTING CONTENT TO IMPROVE:
{{existing_content}}
{{tone_guide}}{{category_guide}}{{keyword_guide}}',
0.85, 0.9, true),

-- 23. blog_expand
(NULL, 'blog_expand', 'blog', 'Blog — Expand', 'Expand thin blog content with more depth and detail',
'You are an expert blog content writer specializing in B2B and technology topics. You write engaging, well-researched content in clean markdown format. Your posts are SEO-friendly and provide genuine value to readers.',
'Expand the following blog content about "{{topic}}". For each section:
- Add more detail, examples, and depth
- Include relevant statistics or data points
- Add transition sentences between sections
- Ensure each section is at least 150 words
- Maintain the existing structure but make it more comprehensive

EXISTING CONTENT TO EXPAND:
{{existing_content}}
{{tone_guide}}{{category_guide}}{{keyword_guide}}',
0.85, 0.9, true),

-- 24. social_linkedin
(NULL, 'social_linkedin', 'social', 'Social — LinkedIn', 'Generate professional LinkedIn posts to share blog content',
'You are an expert social media copywriter for B2B brands. Write engaging, platform-native captions that drive clicks. Output only the caption text.',
'Generate a social media caption for sharing this blog post:

BLOG POST TITLE: {{post_title}}
EXCERPT: {{post_excerpt}}
POST URL: {{post_url}}

PLATFORM: LINKEDIN

Write a LinkedIn post. Include:
- A hook in the first line that stops the scroll
- 2-3 sentences expanding on the key insight
- A clear call to action to read the full post
- 3-5 relevant hashtags at the end
- Professional but conversational tone
- Maximum 300 words
- Use line breaks for readability

Output ONLY the caption text.',
0.85, 0.9, true),

-- 25. social_twitter
(NULL, 'social_twitter', 'social', 'Social — Twitter/X', 'Create punchy tweets to share blog content',
'You are an expert social media copywriter for B2B brands. Write engaging, platform-native captions that drive clicks. Output only the caption text.',
'Generate a social media caption for sharing this blog post:

BLOG POST TITLE: {{post_title}}
EXCERPT: {{post_excerpt}}
POST URL: {{post_url}}

PLATFORM: TWITTER

Write a tweet (max 280 characters including URL). Include:
- A punchy, attention-grabbing message
- The key takeaway in 1-2 sentences
- 1-2 relevant hashtags
- Leave room for the URL (23 characters)

Output ONLY the caption text.',
0.85, 0.9, true),

-- 26. social_facebook
(NULL, 'social_facebook', 'social', 'Social — Facebook', 'Create engaging Facebook posts to share blog content',
'You are an expert social media copywriter for B2B brands. Write engaging, platform-native captions that drive clicks. Output only the caption text.',
'Generate a social media caption for sharing this blog post:

BLOG POST TITLE: {{post_title}}
EXCERPT: {{post_excerpt}}
POST URL: {{post_url}}

PLATFORM: FACEBOOK

Write a Facebook post. Include:
- An engaging opening question or statement
- A brief summary of what readers will learn
- A call to action to click through
- Conversational and approachable tone
- Maximum 200 words

Output ONLY the caption text.',
0.85, 0.9, true),

-- 27. email_personalization
(NULL, 'email_personalization', 'email', 'Email Personalization', 'Rewrite emails to feel personally crafted for each recipient',
'You are an expert B2B email copywriter. Rewrite emails to feel personally crafted for each recipient. Keep them concise, human, and action-oriented. Always use the exact output format requested.',
'Rewrite the following email to feel more natural and tailored to this specific prospect. Keep the overall structure and CTA intact, but reference specific prospect details. Keep the body under 200 words. Output HTML for the body.

PROSPECT CONTEXT:
{{lead_context}}

CURRENT SUBJECT:
{{subject_template}}

CURRENT BODY:
{{body_template}}

TONE: {{tone}}

Respond in EXACTLY this format:
SUBJECT: [rewritten subject line]
BODY: [rewritten HTML email body]',
0.8, 0.9, true),

-- 28. workflow_optimization
(NULL, 'workflow_optimization', 'automation', 'Workflow Optimization', 'Analyze automation workflows and suggest improvements',
'You are a marketing automation expert. Analyze workflows and provide specific, data-driven optimization suggestions. Be concise and actionable.',
'Analyze this automation workflow and suggest specific improvements.

WORKFLOW NODES:
{{nodes_summary}}

PERFORMANCE STATS:
- Leads Processed: {{leads_processed}}
- Conversion Rate: {{conversion_rate}}%
- Time Saved: {{time_saved_hrs}} hours
- ROI: {{roi}}%
- Available Leads: {{lead_count}}

Provide 3-5 specific, actionable suggestions. Each suggestion should:
- Reference specific nodes by name when relevant
- Include expected impact
- Be immediately implementable

Return each suggestion on its own line, prefixed with "- ".',
0.7, 0.9, true);
