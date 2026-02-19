import { supabase } from './supabase';

// ─── Types ───

export interface ResolvedPrompt {
  systemInstruction: string;
  promptTemplate: string;
  temperature: number;
  topP: number;
  isCustom: boolean;
  promptVersion: number;
}

export interface PromptUsageLocation {
  page: string;
  route: string;
  feature: string;
}

export interface PromptRegistryEntry {
  promptKey: string;
  category: PromptCategory;
  displayName: string;
  description: string;
  placeholders: string[];
  usedIn: PromptUsageLocation[];
  defaultSystemInstruction: string;
  defaultPromptTemplate: string;
  defaultTemperature: number;
  defaultTopP: number;
}

export type PromptCategory =
  | 'sales_outreach'
  | 'analytics'
  | 'email'
  | 'content'
  | 'lead_research'
  | 'blog'
  | 'social'
  | 'automation'
  | 'strategy';

// ─── In-Memory Cache (5-minute TTL) ───

interface CacheEntry {
  prompt: ResolvedPrompt;
  expiresAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const promptCache = new Map<string, CacheEntry>();

function getCacheKey(userId: string | undefined, promptKey: string): string {
  return `${userId || 'system'}_${promptKey}`;
}

export function clearPromptCache(userId?: string, promptKey?: string): void {
  if (userId && promptKey) {
    promptCache.delete(getCacheKey(userId, promptKey));
  } else if (userId) {
    for (const key of promptCache.keys()) {
      if (key.startsWith(`${userId}_`)) promptCache.delete(key);
    }
  } else {
    promptCache.clear();
  }
}

// ─── Resolver ───

export async function resolvePrompt(
  promptKey: string,
  userId?: string,
  fallback?: { systemInstruction: string; promptTemplate: string; temperature: number; topP?: number }
): Promise<ResolvedPrompt> {
  const cacheKey = getCacheKey(userId, promptKey);
  const cached = promptCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.prompt;
  }

  // 1. Try user's active custom prompt
  if (userId) {
    const { data: userPrompt } = await supabase
      .from('user_prompts')
      .select('system_instruction, prompt_template, temperature, top_p, version')
      .eq('owner_id', userId)
      .eq('prompt_key', promptKey)
      .eq('is_active', true)
      .single();

    if (userPrompt) {
      const resolved: ResolvedPrompt = {
        systemInstruction: userPrompt.system_instruction,
        promptTemplate: userPrompt.prompt_template,
        temperature: userPrompt.temperature,
        topP: userPrompt.top_p,
        isCustom: true,
        promptVersion: userPrompt.version,
      };
      promptCache.set(cacheKey, { prompt: resolved, expiresAt: Date.now() + CACHE_TTL_MS });
      return resolved;
    }
  }

  // 2. Try system default from DB
  const { data: systemPrompt } = await supabase
    .from('user_prompts')
    .select('system_instruction, prompt_template, temperature, top_p, version')
    .is('owner_id', null)
    .eq('prompt_key', promptKey)
    .eq('is_default', true)
    .eq('is_active', true)
    .single();

  if (systemPrompt) {
    const resolved: ResolvedPrompt = {
      systemInstruction: systemPrompt.system_instruction,
      promptTemplate: systemPrompt.prompt_template,
      temperature: systemPrompt.temperature,
      topP: systemPrompt.top_p,
      isCustom: false,
      promptVersion: systemPrompt.version,
    };
    promptCache.set(cacheKey, { prompt: resolved, expiresAt: Date.now() + CACHE_TTL_MS });
    return resolved;
  }

  // 3. Hardcoded fallback
  const resolved: ResolvedPrompt = {
    systemInstruction: fallback?.systemInstruction || '',
    promptTemplate: fallback?.promptTemplate || '',
    temperature: fallback?.temperature ?? 0.7,
    topP: fallback?.topP ?? 0.9,
    isCustom: false,
    promptVersion: 0,
  };
  promptCache.set(cacheKey, { prompt: resolved, expiresAt: Date.now() + CACHE_TTL_MS });
  return resolved;
}

// ─── Prompt Registry (all 28 prompts) ───

export const PROMPT_REGISTRY: PromptRegistryEntry[] = [
  {
    promptKey: 'sales_outreach',
    category: 'sales_outreach',
    displayName: 'Sales Outreach',
    description: 'Generate hyper-personalized B2B sales outreach content for leads',
    placeholders: ['{{lead_name}}', '{{company}}', '{{score}}', '{{insights}}', '{{type}}', '{{tone}}'],
    usedIn: [
      { page: 'Main Dashboard', route: '/portal', feature: 'Quick content generation for leads' },
      { page: 'Lead Profile', route: '/portal/leads', feature: 'Personalized outreach content per lead' },
    ],
    defaultSystemInstruction: 'You are a world-class B2B sales development representative specializing in hyper-personalized outreach. Your goal is to generate high-conversion content that feels human, researched, and valuable. Avoid generic corporate jargon. Focus on the prospect\'s pain points and industry context.',
    defaultPromptTemplate: `TARGET PROSPECT DATA:
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
5. Do not exceed 150 words.`,
    defaultTemperature: 0.8,
    defaultTopP: 0.9,
  },
  {
    promptKey: 'dashboard_insights',
    category: 'analytics',
    displayName: 'Dashboard Insights',
    description: 'Generate actionable pipeline insights from lead data',
    placeholders: ['{{total_leads}}', '{{avg_score}}', '{{status_breakdown}}', '{{hot_leads}}', '{{lead_summary}}'],
    usedIn: [
      { page: 'Main Dashboard', route: '/portal', feature: 'AI pipeline insights panel' },
      { page: 'AI Command Center', route: '/portal/ai', feature: 'Deep analysis mode' },
      { page: 'Admin Dashboard', route: '/admin', feature: 'Admin pipeline intelligence' },
    ],
    defaultSystemInstruction: 'You are a senior B2B sales analytics AI. Provide actionable, data-driven insights. Be concise and specific.',
    defaultPromptTemplate: `You are an AI sales strategist analyzing a B2B lead pipeline. Provide 3-5 actionable insights based on this data.

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

Keep response under 300 words. Be specific, not generic.`,
    defaultTemperature: 0.7,
    defaultTopP: 0.9,
  },
  {
    promptKey: 'email_sequence',
    category: 'email',
    displayName: 'Email Sequence Builder',
    description: 'Generate multi-step B2B email outreach sequences',
    placeholders: ['{{lead_context}}', '{{goal_label}}', '{{sequence_length}}', '{{cadence_days}}', '{{tone}}', '{{audience_count}}'],
    usedIn: [
      { page: 'Neural Studio', route: '/portal/content', feature: 'Email sequence generation' },
      { page: 'Content Studio', route: '/portal/content-studio', feature: 'Multi-step email campaign builder' },
    ],
    defaultSystemInstruction: 'You are an expert email sequence copywriter for B2B sales. Generate high-converting email sequences that feel human and personalized.',
    defaultPromptTemplate: `Generate a {{sequence_length}}-email outreach sequence for B2B sales.

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
===EMAIL_END===`,
    defaultTemperature: 0.85,
    defaultTopP: 0.9,
  },
  {
    promptKey: 'content_email',
    category: 'content',
    displayName: 'Content — Email',
    description: 'Generate compelling cold email content for a specific lead',
    placeholders: ['{{lead_name}}', '{{company}}', '{{score}}', '{{insights}}', '{{tone}}'],
    usedIn: [
      { page: 'Neural Studio', route: '/portal/content', feature: 'Email content generation' },
      { page: 'Content Studio', route: '/portal/content-studio', feature: 'Email content by category' },
    ],
    defaultSystemInstruction: 'You are an expert email copywriter.',
    defaultPromptTemplate: 'Write a compelling cold email for {{lead_name}} at {{company}}. Score: {{score}}. Insights: {{insights}}. Tone: {{tone}}. Use ONLY these placeholders: {{first_name}}, {{company}}, {{your_name}}. Write all other details as actual specific content based on the lead data. Under 200 words.',
    defaultTemperature: 0.8,
    defaultTopP: 0.9,
  },
  {
    promptKey: 'content_landing_page',
    category: 'content',
    displayName: 'Content — Landing Page',
    description: 'Create conversion-focused landing page copy',
    placeholders: ['{{company}}', '{{first_name}}', '{{tone}}', '{{insights}}'],
    usedIn: [
      { page: 'Neural Studio', route: '/portal/content', feature: 'Landing page copy generation' },
      { page: 'Content Studio', route: '/portal/content-studio', feature: 'Landing page content by category' },
    ],
    defaultSystemInstruction: 'You are a conversion-focused landing page copywriter.',
    defaultPromptTemplate: `Create landing page copy targeting {{company}} in their industry. Include:
- Hero headline & subheadline (use {{company}} tag)
- 3 benefit bullets
- Social proof section placeholder
- CTA section
Use ONLY {{company}} and {{first_name}} as placeholders. Write industry, pain points, and benefits as actual content. Tone: {{tone}}. Lead insights: {{insights}}.`,
    defaultTemperature: 0.8,
    defaultTopP: 0.9,
  },
  {
    promptKey: 'content_social',
    category: 'content',
    displayName: 'Content — Social Media',
    description: 'Generate B2B social media posts targeting specific leads',
    placeholders: ['{{lead_name}}', '{{company}}', '{{first_name}}', '{{tone}}', '{{insights}}'],
    usedIn: [
      { page: 'Neural Studio', route: '/portal/content', feature: 'Social media post generation' },
      { page: 'Content Studio', route: '/portal/content-studio', feature: 'Social content by category' },
    ],
    defaultSystemInstruction: 'You are a B2B social media strategist.',
    defaultPromptTemplate: `Generate 3 LinkedIn posts targeting professionals like {{lead_name}} at {{company}}.
Each post should:
- Hook in first line
- Provide value
- End with engagement question or CTA
Use ONLY {{first_name}} and {{company}} as placeholders. Write industry details and insights as actual content. Tone: {{tone}}. Industry insights: {{insights}}.`,
    defaultTemperature: 0.8,
    defaultTopP: 0.9,
  },
  {
    promptKey: 'content_blog',
    category: 'content',
    displayName: 'Content — Blog Article',
    description: 'Write blog article outlines and intros for lead industries',
    placeholders: ['{{company}}', '{{tone}}', '{{insights}}'],
    usedIn: [
      { page: 'Neural Studio', route: '/portal/content', feature: 'Blog article generation' },
      { page: 'Content Studio', route: '/portal/content-studio', feature: 'Blog content by category' },
    ],
    defaultSystemInstruction: 'You are a B2B content marketing expert.',
    defaultPromptTemplate: `Write a blog article outline + intro targeting companies like {{company}}.
- Title (SEO-optimized)
- 5-section outline with key points
- Full intro paragraph (150 words)
- Meta description
Do NOT use any placeholders. Write all content with specific details. Tone: {{tone}}. Industry context: {{insights}}.`,
    defaultTemperature: 0.8,
    defaultTopP: 0.9,
  },
  {
    promptKey: 'content_report',
    category: 'content',
    displayName: 'Content — Report',
    description: 'Create whitepaper/report outlines for lead industries',
    placeholders: ['{{company}}', '{{tone}}', '{{insights}}'],
    usedIn: [
      { page: 'Neural Studio', route: '/portal/content', feature: 'Whitepaper/report generation' },
      { page: 'Content Studio', route: '/portal/content-studio', feature: 'Report content by category' },
    ],
    defaultSystemInstruction: 'You are a B2B research analyst and report writer.',
    defaultPromptTemplate: `Create a whitepaper/report outline for {{company}}'s industry:
- Executive Summary
- 4-5 key sections with bullet points
- Data points to include (suggest specific metrics)
- Conclusion with CTA
Do NOT use any placeholders. Tone: {{tone}}. Context: {{insights}}.`,
    defaultTemperature: 0.8,
    defaultTopP: 0.9,
  },
  {
    promptKey: 'content_proposal',
    category: 'content',
    displayName: 'Content — Proposal',
    description: 'Draft business proposals for specific leads',
    placeholders: ['{{lead_name}}', '{{company}}', '{{first_name}}', '{{your_name}}', '{{tone}}', '{{score}}', '{{insights}}'],
    usedIn: [
      { page: 'Neural Studio', route: '/portal/content', feature: 'Business proposal generation' },
      { page: 'Content Studio', route: '/portal/content-studio', feature: 'Proposal content by category' },
    ],
    defaultSystemInstruction: 'You are a senior sales proposal writer.',
    defaultPromptTemplate: `Draft a business proposal for {{lead_name}} at {{company}}:
- Opening (reference their company and challenges)
- Problem Statement
- Proposed Solution (3 key deliverables)
- Timeline
- Pricing placeholder
- Next Steps / CTA
Use ONLY {{first_name}}, {{company}}, {{your_name}} as placeholders. Write all other details as actual specific content. Tone: {{tone}}. Lead score: {{score}}. Insights: {{insights}}.`,
    defaultTemperature: 0.8,
    defaultTopP: 0.9,
  },
  {
    promptKey: 'content_ad',
    category: 'content',
    displayName: 'Content — Ad Copy',
    description: 'Create high-converting B2B ad copy for multiple platforms',
    placeholders: ['{{company}}', '{{tone}}', '{{insights}}'],
    usedIn: [
      { page: 'Neural Studio', route: '/portal/content', feature: 'Ad copy generation' },
      { page: 'Content Studio', route: '/portal/content-studio', feature: 'Ad content by category' },
    ],
    defaultSystemInstruction: 'You are a performance marketing copywriter specializing in high-converting B2B ad copy.',
    defaultPromptTemplate: `Create compelling ad copy targeting {{company}}'s industry:
- Google Search Ad: 3 headlines (max 30 chars each) + 2 descriptions (max 90 chars each)
- LinkedIn Sponsored Ad: Headline + body (max 150 words) + CTA
- A/B variant with a different angle
Tone: {{tone}}. Lead insights: {{insights}}.`,
    defaultTemperature: 0.8,
    defaultTopP: 0.9,
  },
  {
    promptKey: 'lead_research',
    category: 'lead_research',
    displayName: 'Lead Research',
    description: 'Comprehensive B2B lead research with web intelligence',
    placeholders: ['{{lead_name}}', '{{company}}', '{{email_domain}}', '{{insights}}', '{{url_context}}'],
    usedIn: [
      { page: 'Main Dashboard', route: '/portal', feature: 'Lead research & enrichment' },
      { page: 'Lead Profile', route: '/portal/leads', feature: 'Deep lead intelligence research' },
    ],
    defaultSystemInstruction: 'You are a senior B2B research analyst with access to web search. Produce comprehensive, actionable intelligence briefs using real web data. Search thoroughly for the lead and their company. Always use the exact delimited format requested.',
    defaultPromptTemplate: `Research the following B2B lead comprehensively.

LEAD DATA:
- Name: {{lead_name}}
- Company: {{company}}
{{email_domain}}
{{insights}}

SOCIAL / WEB PRESENCE:
{{url_context}}

RESEARCH INSTRUCTIONS:
1. Search the company website for pages mentioning the lead by name.
2. Search LinkedIn for the lead's profile, activity, and recent posts.
3. Look for news articles, press releases, podcast appearances.
4. Identify the company's industry, size, products, and recent milestones.
5. Find potential common ground with the sender's business.
6. Identify the lead's recent projects, publications, or achievements.

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
===FIELD===RESEARCH_BRIEF: [150-250 word summary]===END===

Be specific and data-driven.`,
    defaultTemperature: 0.3,
    defaultTopP: 0.9,
  },
  {
    promptKey: 'business_analysis',
    category: 'lead_research',
    displayName: 'Business Analysis',
    description: 'Extract structured business intelligence from websites',
    placeholders: ['{{website_url}}', '{{social_context}}'],
    usedIn: [
      { page: 'Account Settings', route: '/portal/settings', feature: 'Business profile auto-analysis from website' },
    ],
    defaultSystemInstruction: 'You are a business intelligence analyst. Extract structured company data from websites and online presence. Always respond with valid JSON only.',
    defaultPromptTemplate: `Research the following company and extract structured business intelligence.

COMPANY WEBSITE: {{website_url}}
{{social_context}}

Analyze the company's website and any available online information. Look specifically for:
- Contact pages, footer sections, and "About Us" pages
- Social media links in the website header, footer, or contact page
- Company information, products, target market, and business model

Return a JSON object with "value" (string) and "confidence" (number 0-100) for each field: companyName, industry, productsServices, targetAudience, valueProp, pricingModel, salesApproach, phone, businessEmail, address, socialLinks, followUpQuestions.

Return ONLY valid JSON.`,
    defaultTemperature: 0.3,
    defaultTopP: 0.9,
  },
  {
    promptKey: 'follow_up_questions',
    category: 'analytics',
    displayName: 'Follow-Up Questions',
    description: 'Generate targeted follow-up questions for business profiles',
    placeholders: ['{{profile_context}}', '{{empty_fields}}', '{{previous_context}}'],
    usedIn: [
      { page: 'Account Settings', route: '/portal/settings', feature: 'Business profile enrichment questions' },
    ],
    defaultSystemInstruction: 'You are a business strategy consultant. Ask insightful questions to understand a company. Always respond with valid JSON only.',
    defaultPromptTemplate: `Based on this partially-filled business profile, generate 2-4 targeted follow-up questions to fill in the gaps.

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
- Don't repeat questions already answered
- Make questions conversational and specific
- Provide helpful placeholder text
- Return ONLY valid JSON`,
    defaultTemperature: 0.5,
    defaultTopP: 0.9,
  },
  {
    promptKey: 'command_center_analyst',
    category: 'analytics',
    displayName: 'Command Center — Analyst',
    description: 'Data-driven pipeline analysis with specific metrics and comparisons',
    placeholders: ['{{pipeline_context}}', '{{user_prompt}}'],
    usedIn: [
      { page: 'AI Command Center', route: '/portal/ai', feature: 'Analyst persona in AI chat' },
    ],
    defaultSystemInstruction: 'You are a senior data analyst for a B2B sales pipeline. Cite specific lead names, scores, and percentages. Use markdown tables when comparing data. Be precise and data-driven.',
    defaultPromptTemplate: `{{pipeline_context}}

USER REQUEST:
{{user_prompt}}`,
    defaultTemperature: 0.7,
    defaultTopP: 0.9,
  },
  {
    promptKey: 'command_center_strategist',
    category: 'strategy',
    displayName: 'Command Center — Strategist',
    description: 'Strategic sales planning with actionable next steps',
    placeholders: ['{{pipeline_context}}', '{{user_prompt}}'],
    usedIn: [
      { page: 'AI Command Center', route: '/portal/ai', feature: 'Strategist persona in AI chat' },
    ],
    defaultSystemInstruction: 'You are a sales strategist for a B2B pipeline. Create actionable plans and reference leads by name. Always end with a clear next step the user can take immediately.',
    defaultPromptTemplate: `{{pipeline_context}}

USER REQUEST:
{{user_prompt}}`,
    defaultTemperature: 0.7,
    defaultTopP: 0.9,
  },
  {
    promptKey: 'command_center_coach',
    category: 'strategy',
    displayName: 'Command Center — Coach',
    description: 'Constructive sales coaching with honest feedback',
    placeholders: ['{{pipeline_context}}', '{{user_prompt}}'],
    usedIn: [
      { page: 'AI Command Center', route: '/portal/ai', feature: 'Coach persona in AI chat' },
    ],
    defaultSystemInstruction: 'You are a sales coach reviewing a B2B pipeline. Give honest, constructive feedback. Identify strengths and weaknesses from the actual data. Be encouraging but direct.',
    defaultPromptTemplate: `{{pipeline_context}}

USER REQUEST:
{{user_prompt}}`,
    defaultTemperature: 0.7,
    defaultTopP: 0.9,
  },
  {
    promptKey: 'command_center_creative',
    category: 'content',
    displayName: 'Command Center — Creative',
    description: 'Personalized content creation using pipeline lead data',
    placeholders: ['{{pipeline_context}}', '{{user_prompt}}'],
    usedIn: [
      { page: 'AI Command Center', route: '/portal/ai', feature: 'Creative persona in AI chat' },
    ],
    defaultSystemInstruction: 'You are a content specialist for B2B sales outreach. Write personalized content referencing specific lead details (name, company, insights). Never produce generic templates — every piece must be tailored to the data provided.',
    defaultPromptTemplate: `{{pipeline_context}}

USER REQUEST:
{{user_prompt}}`,
    defaultTemperature: 0.85,
    defaultTopP: 0.9,
  },
  {
    promptKey: 'content_suggestions',
    category: 'content',
    displayName: 'Content Suggestions',
    description: 'Analyze content and provide specific improvement suggestions',
    placeholders: ['{{content}}'],
    usedIn: [
      { page: 'Content Studio', route: '/portal/content-studio', feature: 'AI content optimization suggestions' },
    ],
    defaultSystemInstruction: 'You are a senior content optimization specialist for B2B sales. Analyze content and provide specific, actionable improvement suggestions. Always use the exact delimited format requested.',
    defaultPromptTemplate: `Analyze the following content and return exactly 5 improvement suggestions.

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

Return exactly 5 suggestions.`,
    defaultTemperature: 0.7,
    defaultTopP: 0.9,
  },
  {
    promptKey: 'pipeline_strategy',
    category: 'strategy',
    displayName: 'Pipeline Strategy',
    description: 'Generate strategic recommendations from pipeline data',
    placeholders: ['{{total_leads}}', '{{avg_score}}', '{{status_breakdown}}', '{{hot_leads}}', '{{emails_sent}}', '{{emails_opened}}', '{{conversion_rate}}', '{{recent_activity}}'],
    usedIn: [
      { page: 'Strategy Hub', route: '/portal/strategy', feature: 'AI-generated pipeline strategy & sprint goals' },
    ],
    defaultSystemInstruction: 'You are a senior B2B sales strategist. Analyze pipeline data and produce actionable strategy recommendations. Always use the exact delimited format requested.',
    defaultPromptTemplate: `Analyze this B2B sales pipeline and generate strategic recommendations.

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

Be specific and data-driven.`,
    defaultTemperature: 0.7,
    defaultTopP: 0.9,
  },
  {
    promptKey: 'blog_full_draft',
    category: 'blog',
    displayName: 'Blog — Full Draft',
    description: 'Write a complete, publication-ready blog post',
    placeholders: ['{{topic}}', '{{tone_guide}}', '{{category_guide}}', '{{keyword_guide}}'],
    usedIn: [
      { page: 'Guest Posts', route: '/portal/blog', feature: 'Full blog post draft generation' },
    ],
    defaultSystemInstruction: 'You are an expert blog content writer specializing in B2B and technology topics. You write engaging, well-researched content in clean markdown format. Your posts are SEO-friendly and provide genuine value to readers.',
    defaultPromptTemplate: `Write a complete, publication-ready blog post about "{{topic}}". Include:
- An engaging title (if not provided)
- Introduction that hooks the reader
- 3-5 well-structured sections with ## headings
- Practical examples or data points
- A compelling conclusion with a call to action
- Target 600-1200 words
- Use markdown formatting throughout
{{tone_guide}}{{category_guide}}{{keyword_guide}}

Output the blog content in clean markdown format.`,
    defaultTemperature: 0.85,
    defaultTopP: 0.9,
  },
  {
    promptKey: 'blog_outline',
    category: 'blog',
    displayName: 'Blog — Outline',
    description: 'Create detailed blog post outlines with SEO keywords',
    placeholders: ['{{topic}}', '{{tone_guide}}', '{{category_guide}}', '{{keyword_guide}}'],
    usedIn: [
      { page: 'Guest Posts', route: '/portal/blog', feature: 'Blog outline generation' },
    ],
    defaultSystemInstruction: 'You are an expert blog content writer specializing in B2B and technology topics. You write engaging, well-researched content in clean markdown format. Your posts are SEO-friendly and provide genuine value to readers.',
    defaultPromptTemplate: `Create a detailed blog post outline for "{{topic}}". Include:
- A compelling title suggestion
- Introduction summary (2-3 sentences)
- 5-7 section headings (##) with 2-3 bullet points each
- Conclusion summary
- 3 suggested keywords for SEO
- Format in markdown
{{tone_guide}}{{category_guide}}{{keyword_guide}}`,
    defaultTemperature: 0.7,
    defaultTopP: 0.9,
  },
  {
    promptKey: 'blog_improve',
    category: 'blog',
    displayName: 'Blog — Improve',
    description: 'Rewrite and enhance existing blog content',
    placeholders: ['{{topic}}', '{{existing_content}}', '{{tone_guide}}', '{{category_guide}}', '{{keyword_guide}}'],
    usedIn: [
      { page: 'Guest Posts', route: '/portal/blog', feature: 'Blog content improvement & rewriting' },
    ],
    defaultSystemInstruction: 'You are an expert blog content writer specializing in B2B and technology topics. You write engaging, well-researched content in clean markdown format. Your posts are SEO-friendly and provide genuine value to readers.',
    defaultPromptTemplate: `Rewrite and improve the following blog content about "{{topic}}". Make it more:
- Engaging and readable
- Well-structured with clear headings
- Professional yet conversational
- SEO-friendly

EXISTING CONTENT TO IMPROVE:
{{existing_content}}
{{tone_guide}}{{category_guide}}{{keyword_guide}}`,
    defaultTemperature: 0.85,
    defaultTopP: 0.9,
  },
  {
    promptKey: 'blog_expand',
    category: 'blog',
    displayName: 'Blog — Expand',
    description: 'Expand thin blog content with more depth and detail',
    placeholders: ['{{topic}}', '{{existing_content}}', '{{tone_guide}}', '{{category_guide}}', '{{keyword_guide}}'],
    usedIn: [
      { page: 'Guest Posts', route: '/portal/blog', feature: 'Blog content expansion & detail enrichment' },
    ],
    defaultSystemInstruction: 'You are an expert blog content writer specializing in B2B and technology topics. You write engaging, well-researched content in clean markdown format. Your posts are SEO-friendly and provide genuine value to readers.',
    defaultPromptTemplate: `Expand the following blog content about "{{topic}}". For each section:
- Add more detail, examples, and depth
- Include relevant statistics or data points
- Add transition sentences between sections
- Ensure each section is at least 150 words

EXISTING CONTENT TO EXPAND:
{{existing_content}}
{{tone_guide}}{{category_guide}}{{keyword_guide}}`,
    defaultTemperature: 0.85,
    defaultTopP: 0.9,
  },
  {
    promptKey: 'social_linkedin',
    category: 'social',
    displayName: 'Social — LinkedIn',
    description: 'Generate professional LinkedIn posts to share blog content',
    placeholders: ['{{post_title}}', '{{post_excerpt}}', '{{post_url}}'],
    usedIn: [
      { page: 'Guest Posts', route: '/portal/blog', feature: 'LinkedIn caption for blog sharing' },
      { page: 'Blog Post Page', route: '/blog', feature: 'Public blog post social sharing' },
    ],
    defaultSystemInstruction: 'You are an expert social media copywriter for B2B brands. Write engaging, platform-native captions that drive clicks. Output only the caption text.',
    defaultPromptTemplate: `Generate a social media caption for sharing this blog post:

BLOG POST TITLE: {{post_title}}
{{post_excerpt}}
POST URL: {{post_url}}

PLATFORM: LINKEDIN

Write a LinkedIn post. Include:
- A hook in the first line that stops the scroll
- 2-3 sentences expanding on the key insight
- A clear call to action to read the full post
- 3-5 relevant hashtags at the end
- Professional but conversational tone
- Maximum 300 words

Output ONLY the caption text.`,
    defaultTemperature: 0.85,
    defaultTopP: 0.9,
  },
  {
    promptKey: 'social_twitter',
    category: 'social',
    displayName: 'Social — Twitter/X',
    description: 'Create punchy tweets to share blog content',
    placeholders: ['{{post_title}}', '{{post_excerpt}}', '{{post_url}}'],
    usedIn: [
      { page: 'Guest Posts', route: '/portal/blog', feature: 'Twitter/X caption for blog sharing' },
      { page: 'Blog Post Page', route: '/blog', feature: 'Public blog post social sharing' },
    ],
    defaultSystemInstruction: 'You are an expert social media copywriter for B2B brands. Write engaging, platform-native captions that drive clicks. Output only the caption text.',
    defaultPromptTemplate: `Generate a social media caption for sharing this blog post:

BLOG POST TITLE: {{post_title}}
{{post_excerpt}}
POST URL: {{post_url}}

PLATFORM: TWITTER

Write a tweet (max 280 characters including URL). Include:
- A punchy, attention-grabbing message
- The key takeaway in 1-2 sentences
- 1-2 relevant hashtags
- Leave room for the URL (23 characters)

Output ONLY the caption text.`,
    defaultTemperature: 0.85,
    defaultTopP: 0.9,
  },
  {
    promptKey: 'social_facebook',
    category: 'social',
    displayName: 'Social — Facebook',
    description: 'Create engaging Facebook posts to share blog content',
    placeholders: ['{{post_title}}', '{{post_excerpt}}', '{{post_url}}'],
    usedIn: [
      { page: 'Guest Posts', route: '/portal/blog', feature: 'Facebook caption for blog sharing' },
      { page: 'Blog Post Page', route: '/blog', feature: 'Public blog post social sharing' },
    ],
    defaultSystemInstruction: 'You are an expert social media copywriter for B2B brands. Write engaging, platform-native captions that drive clicks. Output only the caption text.',
    defaultPromptTemplate: `Generate a social media caption for sharing this blog post:

BLOG POST TITLE: {{post_title}}
{{post_excerpt}}
POST URL: {{post_url}}

PLATFORM: FACEBOOK

Write a Facebook post. Include:
- An engaging opening question or statement
- A brief summary of what readers will learn
- A call to action to click through
- Conversational and approachable tone
- Maximum 200 words

Output ONLY the caption text.`,
    defaultTemperature: 0.85,
    defaultTopP: 0.9,
  },
  {
    promptKey: 'email_personalization',
    category: 'email',
    displayName: 'Email Personalization',
    description: 'Rewrite emails to feel personally crafted for each recipient',
    placeholders: ['{{lead_context}}', '{{subject_template}}', '{{body_template}}', '{{tone}}'],
    usedIn: [
      { page: 'Automation Engine', route: '/portal/automation', feature: 'Automated email personalization in workflows' },
    ],
    defaultSystemInstruction: 'You are an expert B2B email copywriter. Rewrite emails to feel personally crafted for each recipient. Keep them concise, human, and action-oriented. Always use the exact output format requested.',
    defaultPromptTemplate: `Rewrite the following email to feel more natural and tailored to this specific prospect. Keep the overall structure and CTA intact. Keep the body under 200 words. Output HTML for the body.

PROSPECT CONTEXT:
{{lead_context}}

CURRENT SUBJECT:
{{subject_template}}

CURRENT BODY:
{{body_template}}

TONE: {{tone}}

Respond in EXACTLY this format:
SUBJECT: [rewritten subject line]
BODY: [rewritten HTML email body]`,
    defaultTemperature: 0.8,
    defaultTopP: 0.9,
  },
  {
    promptKey: 'workflow_optimization',
    category: 'automation',
    displayName: 'Workflow Optimization',
    description: 'Analyze automation workflows and suggest improvements',
    placeholders: ['{{nodes_summary}}', '{{leads_processed}}', '{{conversion_rate}}', '{{time_saved_hrs}}', '{{roi}}', '{{lead_count}}'],
    usedIn: [
      { page: 'Automation Engine', route: '/portal/automation', feature: 'AI workflow optimization suggestions' },
    ],
    defaultSystemInstruction: 'You are a marketing automation expert. Analyze workflows and provide specific, data-driven optimization suggestions. Be concise and actionable.',
    defaultPromptTemplate: `Analyze this automation workflow and suggest specific improvements.

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

Return each suggestion on its own line, prefixed with "- ".`,
    defaultTemperature: 0.7,
    defaultTopP: 0.9,
  },
];

// ─── Category Metadata ───

export const CATEGORY_META: Record<PromptCategory, { label: string; icon: string; color: string }> = {
  sales_outreach: { label: 'Sales Outreach', icon: 'target', color: 'indigo' },
  analytics: { label: 'Analytics', icon: 'chart', color: 'blue' },
  email: { label: 'Email', icon: 'mail', color: 'emerald' },
  content: { label: 'Content', icon: 'sparkles', color: 'violet' },
  lead_research: { label: 'Lead Research', icon: 'search', color: 'amber' },
  blog: { label: 'Blog', icon: 'edit', color: 'rose' },
  social: { label: 'Social Media', icon: 'share', color: 'sky' },
  automation: { label: 'Automation', icon: 'zap', color: 'orange' },
  strategy: { label: 'Strategy', icon: 'compass', color: 'teal' },
};
