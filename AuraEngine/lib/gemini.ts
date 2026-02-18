import { GoogleGenAI } from "@google/genai";
import { ContentType, ContentCategory, ToneType, EmailSequenceConfig, EmailStep, Lead, BusinessProfile, BusinessAnalysisResult } from "../types";
import { supabase } from "./supabase";

const buildBusinessContext = (profile?: BusinessProfile): string => {
  if (!profile) return '';
  const parts: string[] = [];
  if (profile.companyName) parts.push(`Company: ${profile.companyName}`);
  if (profile.industry) parts.push(`Industry: ${profile.industry}`);
  if (profile.companyWebsite) parts.push(`Website: ${profile.companyWebsite}`);
  if (profile.productsServices) parts.push(`Products/Services: ${profile.productsServices}`);
  if (profile.valueProp) parts.push(`Value Proposition: ${profile.valueProp}`);
  if (profile.targetAudience) parts.push(`Target Audience: ${profile.targetAudience}`);
  if (profile.pricingModel) parts.push(`Pricing Model: ${profile.pricingModel}`);
  if (profile.salesApproach) parts.push(`Sales Approach: ${profile.salesApproach}`);
  if (profile.businessDescription) parts.push(`Business Description: ${profile.businessDescription}`);
  if (profile.phone) parts.push(`Phone: ${profile.phone}`);
  if (profile.businessEmail) parts.push(`Contact Email: ${profile.businessEmail}`);
  if (profile.address) parts.push(`Address: ${profile.address}`);
  if (profile.socialLinks) {
    const socials = Object.entries(profile.socialLinks).filter(([_, v]) => v).map(([k, v]) => `${k}: ${v}`);
    if (socials.length) parts.push(`Social Media: ${socials.join(', ')}`);
  }
  if (parts.length === 0) return '';
  return `\n\nYOUR BUSINESS CONTEXT:\n${parts.join('\n')}`;
};

export const buildEmailFooter = (profile?: BusinessProfile): string => {
  if (!profile) return '';
  const lines: string[] = [];
  if (profile.companyName) lines.push(`<strong>${profile.companyName}</strong>`);
  if (profile.address) lines.push(profile.address);
  const contacts: string[] = [];
  if (profile.phone) contacts.push(profile.phone);
  if (profile.businessEmail) contacts.push(profile.businessEmail);
  if (profile.companyWebsite) contacts.push(profile.companyWebsite);
  if (contacts.length) lines.push(contacts.join(' &middot; '));
  if (profile.socialLinks) {
    const socials = Object.entries(profile.socialLinks)
      .filter(([_, v]) => v)
      .map(([k, v]) => `<a href="${v}" style="color:#6366f1">${k.charAt(0).toUpperCase() + k.slice(1)}</a>`);
    if (socials.length) lines.push(socials.join(' &middot; '));
  }
  if (lines.length === 0) return '';
  return `<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;line-height:1.6">${lines.join('<br/>')}</div>`;
};

const MAX_RETRIES = 3;
const TIMEOUT_MS = 15000;
const MODEL_NAME = 'gemini-3-flash-preview';

export interface AIResponse {
  text: string;
  tokens_used: number;
  model_name: string;
  prompt_name: string;
  prompt_version: number;
}

export const generateLeadContent = async (lead: Lead, type: ContentType, businessProfile?: BusinessProfile): Promise<AIResponse> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // 1. Fetch Latest Active Prompt
  const { data: activePrompt, error: promptError } = await supabase
    .from('ai_prompts')
    .select('*')
    .eq('name', 'sales_outreach')
    .eq('is_active', true)
    .single();

  const pName = activePrompt?.name || 'default_sales_outreach';
  const pVersion = activePrompt?.version || 0;
  
  // 2. Prepare Context
  const systemInstruction = `You are a world-class B2B sales development representative specializing in hyper-personalized outreach. 
Your goal is to generate high-conversion ${type} content that feels human, researched, and valuable. 
Avoid generic corporate jargon. Focus on the prospect's pain points and industry context.`;

  // Use dynamic template from DB if available, otherwise fallback to standard prompt
  const basePromptTemplate = activePrompt?.template || 
    `TARGET PROSPECT DATA:
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
    5. Do not exceed 150 words.`;

  const finalPrompt = basePromptTemplate
    .replace('{{lead_name}}', lead.name)
    .replace('{{company}}', lead.company)
    .replace('{{score}}', lead.score.toString())
    .replace('{{insights}}', lead.insights)
    .replace('{{type}}', type)
    .replace('{{tone}}', lead.score > 80 ? 'high-priority and urgent' : 'helpful and consultative')
    + buildBusinessContext(businessProfile);

  let attempt = 0;
  while (attempt < MAX_RETRIES) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: finalPrompt,
        config: {
          systemInstruction,
          temperature: 0.8,
          topP: 0.9,
          topK: 40,
        }
      });

      clearTimeout(timeoutId);
      
      const text = response.text;
      if (!text) throw new Error("Empty response from intelligence engine.");
      
      return {
        text,
        tokens_used: response.usageMetadata?.totalTokenCount || 0,
        model_name: MODEL_NAME,
        prompt_name: pName,
        prompt_version: pVersion
      };
    } catch (error: unknown) {
      attempt++;
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      console.warn(`Gemini Attempt ${attempt} failed:`, errMsg);
      if (attempt === MAX_RETRIES) {
        return {
          text: `NEURAL TIMEOUT: The intelligence engine is currently overloaded. Please try again in 30 seconds. (Error: ${errMsg})`,
          tokens_used: 0,
          model_name: MODEL_NAME,
          prompt_name: pName,
          prompt_version: pVersion
        };
      }
      // Wait before retry
      await new Promise(res => setTimeout(res, 1000 * attempt));
    }
  }

  return {
    text: "CRITICAL FAILURE: Neural links disconnected.",
    tokens_used: 0,
    model_name: MODEL_NAME,
    prompt_name: pName,
    prompt_version: pVersion
  };
};

export const generateDashboardInsights = async (leads: Lead[], businessProfile?: BusinessProfile): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const leadSummary = leads.slice(0, 20).map(l =>
    `${l.name} (${l.company}) - Score: ${l.score}, Status: ${l.status}`
  ).join('\n');

  const statusBreakdown: Record<string, number> = {};
  leads.forEach(l => { statusBreakdown[l.status] = (statusBreakdown[l.status] || 0) + 1; });

  const avgScore = leads.length > 0
    ? Math.round(leads.reduce((a, b) => a + b.score, 0) / leads.length)
    : 0;

  const prompt = `You are an AI sales strategist analyzing a B2B lead pipeline. Provide 3-5 actionable insights based on this data.

PIPELINE SUMMARY:
- Total Leads: ${leads.length}
- Average Score: ${avgScore}/100
- Status Breakdown: ${Object.entries(statusBreakdown).map(([k, v]) => `${k}: ${v}`).join(', ')}
- Hot Leads (score > 80): ${leads.filter(l => l.score > 80).length}

TOP LEADS:
${leadSummary}

Provide concise, data-driven recommendations. Focus on:
1. Which leads to prioritize and why
2. Pipeline health assessment
3. Suggested next actions
4. Timing recommendations

Keep response under 300 words. Be specific, not generic.${buildBusinessContext(businessProfile)}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: {
        systemInstruction: 'You are a senior B2B sales analytics AI. Provide actionable, data-driven insights. Be concise and specific.',
        temperature: 0.7,
        topP: 0.9,
      }
    });

    clearTimeout(timeoutId);
    return response.text || 'No insights generated.';
  } catch (error: unknown) {
    throw new Error(`Gemini analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

// === Content Generation Module v2 ===

const CADENCE_DAYS: Record<string, number> = {
  daily: 1,
  every_2_days: 2,
  every_3_days: 3,
  weekly: 7
};

const GOAL_LABELS: Record<string, string> = {
  book_meeting: 'Book a Meeting',
  product_demo: 'Schedule a Product Demo',
  nurture: 'Nurture & Build Relationship',
  re_engage: 'Re-engage Cold Leads',
  upsell: 'Upsell Existing Customers'
};

export const generateEmailSequence = async (
  leads: Lead[],
  config: EmailSequenceConfig,
  businessProfile?: BusinessProfile
): Promise<AIResponse> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const leadContext = leads.slice(0, 5).map(l => {
    let ctx = `- ${l.name} at ${l.company} (Score: ${l.score}, Status: ${l.status}, Insights: ${l.insights})`;
    if (l.knowledgeBase) {
      const kb = l.knowledgeBase;
      const parts: string[] = [];
      if (kb.website) parts.push(`Website: ${kb.website}`);
      if (kb.linkedin) parts.push(`LinkedIn: ${kb.linkedin}`);
      if (kb.extraNotes) parts.push(`Notes: ${kb.extraNotes}`);
      if (parts.length > 0) ctx += `\n  Knowledge: ${parts.join(', ')}`;
    }
    return ctx;
  }).join('\n');

  const cadenceDays = CADENCE_DAYS[config.cadence] || 2;
  const goalLabel = GOAL_LABELS[config.goal] || config.goal;

  const prompt = `Generate a ${config.sequenceLength}-email outreach sequence for B2B sales.

TARGET AUDIENCE (sample leads):
${leadContext}

SEQUENCE CONFIG:
- Goal: ${goalLabel}
- Number of Emails: ${config.sequenceLength}
- Cadence: Every ${cadenceDays} day(s)
- Tone: ${config.tone}
- Total leads in audience: ${config.audienceLeadIds.length}

REQUIREMENTS:
1. Each email must have a clear subject line and body.
2. Use ONLY these personalization placeholders: {{first_name}}, {{company}}, {{ai_insight}}, {{your_name}}. Do NOT use {{industry}}, {{pain_point}}, {{benefit}}, {{solution}}, {{insight_1}}, {{goal}}, or any other placeholders — write the actual specific values inline based on the lead data provided above.
3. Each email should build on the previous, escalating urgency naturally.
4. Email 1: Introduction & value proposition
5. Final email: Break-up email with last chance CTA
6. Keep each email under 200 words.
7. Match the ${config.tone} tone consistently.
8. Use the lead's Knowledge Base data (website, LinkedIn, notes) to tailor messaging to their specific company and context.
${buildBusinessContext(businessProfile)}
FORMAT YOUR RESPONSE EXACTLY LIKE THIS (repeat for each email):
===EMAIL_START===
STEP: [number]
DELAY: Day [number]
SUBJECT: [subject line]
BODY:
[email body]
===EMAIL_END===`;

  let attempt = 0;
  while (attempt < MAX_RETRIES) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: prompt,
        config: {
          systemInstruction: `You are an expert email sequence copywriter for B2B sales. Generate high-converting email sequences that feel human and personalized. Tone: ${config.tone}.`,
          temperature: 0.85,
          topP: 0.9,
          topK: 40,
        }
      });

      clearTimeout(timeoutId);
      const text = response.text;
      if (!text) throw new Error("Empty sequence response.");

      return {
        text,
        tokens_used: response.usageMetadata?.totalTokenCount || 0,
        model_name: MODEL_NAME,
        prompt_name: 'email_sequence_builder',
        prompt_version: 1
      };
    } catch (error: unknown) {
      attempt++;
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      if (attempt === MAX_RETRIES) {
        return {
          text: `SEQUENCE GENERATION FAILED: ${errMsg}`,
          tokens_used: 0,
          model_name: MODEL_NAME,
          prompt_name: 'email_sequence_builder',
          prompt_version: 1
        };
      }
      await new Promise(res => setTimeout(res, 1000 * attempt));
    }
  }

  return { text: "CRITICAL FAILURE", tokens_used: 0, model_name: MODEL_NAME, prompt_name: 'email_sequence_builder', prompt_version: 1 };
};

export const generateContentByCategory = async (
  lead: Lead,
  category: ContentCategory,
  tone: ToneType,
  additionalContext?: string,
  businessProfile?: BusinessProfile
): Promise<AIResponse> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const categoryPrompts: Record<ContentCategory, { system: string; prompt: string }> = {
    [ContentCategory.EMAIL_SEQUENCE]: {
      system: 'You are an expert email copywriter.',
      prompt: `Write a compelling cold email for ${lead.name} at ${lead.company}. Score: ${lead.score}. Insights: ${lead.insights}. Tone: ${tone}. Use ONLY these placeholders: {{first_name}}, {{company}}, {{your_name}}. Write all other details (industry, pain points, benefits, solutions) as actual specific content based on the lead data. Under 200 words.`
    },
    [ContentCategory.LANDING_PAGE]: {
      system: 'You are a conversion-focused landing page copywriter.',
      prompt: `Create landing page copy targeting ${lead.company} in their industry. Include:
- Hero headline & subheadline (use {{company}} tag)
- 3 benefit bullets
- Social proof section placeholder
- CTA section
Use ONLY {{company}} and {{first_name}} as placeholders. Write industry, pain points, and benefits as actual content. Tone: ${tone}. Lead insights: ${lead.insights}. ${additionalContext || ''}`
    },
    [ContentCategory.SOCIAL_MEDIA]: {
      system: 'You are a B2B social media strategist.',
      prompt: `Generate 3 LinkedIn posts targeting professionals like ${lead.name} at ${lead.company}.
Each post should:
- Hook in first line
- Provide value
- End with engagement question or CTA
Use ONLY {{first_name}} and {{company}} as placeholders. Write industry details and insights as actual content. Tone: ${tone}. Industry insights: ${lead.insights}. ${additionalContext || ''}`
    },
    [ContentCategory.BLOG_ARTICLE]: {
      system: 'You are a B2B content marketing expert.',
      prompt: `Write a blog article outline + intro targeting companies like ${lead.company}.
- Title (SEO-optimized)
- 5-section outline with key points
- Full intro paragraph (150 words)
- Meta description
Do NOT use any {{...}} placeholders. Write all content with specific details. Tone: ${tone}. Industry context: ${lead.insights}. ${additionalContext || ''}`
    },
    [ContentCategory.REPORT]: {
      system: 'You are a B2B research analyst and report writer.',
      prompt: `Create a whitepaper/report outline for ${lead.company}'s industry:
- Executive Summary
- 4-5 key sections with bullet points
- Data points to include (suggest specific metrics)
- Conclusion with CTA
Do NOT use any {{...}} placeholders. Write all content with specific details. Tone: ${tone}. Context: ${lead.insights}. ${additionalContext || ''}`
    },
    [ContentCategory.PROPOSAL]: {
      system: 'You are a senior sales proposal writer.',
      prompt: `Draft a business proposal for ${lead.name} at ${lead.company}:
- Opening (reference their company and challenges)
- Problem Statement
- Proposed Solution (3 key deliverables)
- Timeline
- Pricing placeholder
- Next Steps / CTA
Use ONLY {{first_name}}, {{company}}, {{your_name}} as placeholders. Write all other details as actual specific content. Tone: ${tone}. Lead score: ${lead.score}. Insights: ${lead.insights}. ${additionalContext || ''}`
    },
    [ContentCategory.AD_COPY]: {
      system: 'You are a performance marketing copywriter specializing in high-converting B2B ad copy.',
      prompt: `Create compelling ad copy targeting ${lead.company}'s industry:
- Google Search Ad: 3 headlines (max 30 chars each) + 2 descriptions (max 90 chars each)
- LinkedIn Sponsored Ad: Headline + body (max 150 words) + CTA
- A/B variant with a different angle
Tone: ${tone}. Lead insights: ${lead.insights}. ${additionalContext || ''}`
    }
  };

  const catConfig = categoryPrompts[category];
  const finalCategoryPrompt = catConfig.prompt + buildBusinessContext(businessProfile);

  let attempt = 0;
  while (attempt < MAX_RETRIES) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);

      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: finalCategoryPrompt,
        config: {
          systemInstruction: catConfig.system,
          temperature: 0.8,
          topP: 0.9,
          topK: 40,
        }
      });

      clearTimeout(timeoutId);
      const text = response.text;
      if (!text) throw new Error("Empty content response.");

      return {
        text,
        tokens_used: response.usageMetadata?.totalTokenCount || 0,
        model_name: MODEL_NAME,
        prompt_name: `content_${category.toLowerCase().replace(/\s+/g, '_')}`,
        prompt_version: 1
      };
    } catch (error: unknown) {
      attempt++;
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      if (attempt === MAX_RETRIES) {
        return {
          text: `GENERATION FAILED: ${errMsg}`,
          tokens_used: 0,
          model_name: MODEL_NAME,
          prompt_name: `content_${category.toLowerCase().replace(/\s+/g, '_')}`,
          prompt_version: 1
        };
      }
      await new Promise(res => setTimeout(res, 1000 * attempt));
    }
  }

  return { text: "CRITICAL FAILURE", tokens_used: 0, model_name: MODEL_NAME, prompt_name: 'content_gen', prompt_version: 1 };
};

export const generateLeadResearch = async (
  lead: Pick<Lead, 'name' | 'company' | 'email' | 'insights'>,
  socialUrls: Record<string, string>,
  businessProfile?: BusinessProfile
): Promise<AIResponse> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const urlContext = Object.entries(socialUrls)
    .filter(([_, v]) => v)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join('\n');

  const emailDomain = lead.email?.includes('@') ? lead.email.split('@')[1] : '';

  const prompt = `Analyze the following B2B lead and produce a concise research brief.

LEAD DATA:
- Name: ${lead.name}
- Company: ${lead.company}
${emailDomain ? `- Email Domain: ${emailDomain}` : ''}
${lead.insights ? `- Existing Insights: ${lead.insights}` : ''}

SOCIAL / WEB PRESENCE:
${urlContext || 'None provided'}

Based on the company name, email domain, and social profile URLs (use them as inference signals about the company's size, industry, and positioning), produce exactly these four sections:

**Company Overview** — What this company likely does, approximate size/stage, and industry positioning (2-3 sentences).

**Key Talking Points** — 3-4 bullet points a sales rep can reference in outreach to show genuine research and relevance.

**Outreach Angle** — The single best angle to open a conversation with this lead, considering their role and company profile (2-3 sentences).

**Risk Factors** — 1-2 potential objections or challenges to be aware of when approaching this lead.

Keep the total response under 250 words. Be specific and actionable, not generic.${buildBusinessContext(businessProfile)}`;

  let attempt = 0;
  while (attempt < MAX_RETRIES) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: prompt,
        config: {
          systemInstruction: 'You are a senior B2B research analyst. Produce concise, actionable intelligence briefs from limited data signals. Infer what you can from company names, domains, and social presence. Be direct and useful.',
          temperature: 0.7,
          topP: 0.9,
        }
      });

      clearTimeout(timeoutId);
      const text = response.text;
      if (!text) throw new Error("Empty research response.");

      return {
        text,
        tokens_used: response.usageMetadata?.totalTokenCount || 0,
        model_name: MODEL_NAME,
        prompt_name: 'lead_research',
        prompt_version: 1
      };
    } catch (error: unknown) {
      attempt++;
      console.warn(`Lead research attempt ${attempt} failed:`, error instanceof Error ? error.message : 'Unknown error');
      if (attempt === MAX_RETRIES) {
        return {
          text: '',
          tokens_used: 0,
          model_name: MODEL_NAME,
          prompt_name: 'lead_research',
          prompt_version: 1
        };
      }
      await new Promise(res => setTimeout(res, 1000 * attempt));
    }
  }

  return { text: '', tokens_used: 0, model_name: MODEL_NAME, prompt_name: 'lead_research', prompt_version: 1 };
};

// === Business Profile AI Analysis ===

const parseAnalysisJSON = (text: string): BusinessAnalysisResult | null => {
  try {
    // Try direct parse first
    return JSON.parse(text);
  } catch {
    // Strip markdown code fences
    const stripped = text.replace(/```(?:json)?\s*/g, '').replace(/```/g, '').trim();
    try {
      return JSON.parse(stripped);
    } catch {
      // Regex extract first JSON object
      const match = stripped.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          return JSON.parse(match[0]);
        } catch {
          return null;
        }
      }
      return null;
    }
  }
};

export const analyzeBusinessFromWeb = async (
  websiteUrl: string,
  socialUrls?: { linkedin?: string; twitter?: string; instagram?: string; facebook?: string }
): Promise<AIResponse & { analysis: BusinessAnalysisResult | null }> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const socialContext = socialUrls
    ? Object.entries(socialUrls)
        .filter(([_, v]) => v)
        .map(([k, v]) => `- ${k}: ${v}`)
        .join('\n')
    : '';

  const prompt = `Research the following company and extract structured business intelligence.

COMPANY WEBSITE: ${websiteUrl}
${socialContext ? `\nSOCIAL MEDIA PROFILES:\n${socialContext}` : ''}

Analyze the company's website and any available online information. Return a JSON object with the following structure. Each field must have a "value" (string) and "confidence" (number 0-100, how certain you are about this information).

{
  "companyName": { "value": "...", "confidence": 0-100 },
  "industry": { "value": "...", "confidence": 0-100 },
  "productsServices": { "value": "...", "confidence": 0-100 },
  "targetAudience": { "value": "...", "confidence": 0-100 },
  "valueProp": { "value": "...", "confidence": 0-100 },
  "pricingModel": { "value": "...", "confidence": 0-100 },
  "salesApproach": { "value": "...", "confidence": 0-100 },
  "followUpQuestions": ["question1", "question2"]
}

Guidelines:
- For fields you can confidently determine from the website, set confidence 80-100
- For fields you can reasonably infer, set confidence 50-79
- For fields you're uncertain about, set confidence below 50 and provide your best guess
- Generate 2-4 follow-up questions for fields with confidence below 70
- Return ONLY valid JSON, no markdown or explanation`;

  const systemInstruction = 'You are a business intelligence analyst. Extract structured company data from websites and online presence. Always respond with valid JSON only.';

  // Try with Google Search grounding first
  let attempt = 0;
  while (attempt < MAX_RETRIES) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      let response;
      try {
        response = await ai.models.generateContent({
          model: MODEL_NAME,
          contents: prompt,
          config: {
            systemInstruction,
            temperature: 0.3,
            topP: 0.9,
            tools: [{ googleSearch: {} }],
          }
        });
      } catch (groundingError: unknown) {
        // Google Search grounding failed, fall back to inference-only
        console.warn('Google Search grounding failed, falling back to inference:', groundingError instanceof Error ? groundingError.message : 'Unknown error');
        response = await ai.models.generateContent({
          model: MODEL_NAME,
          contents: prompt,
          config: {
            systemInstruction,
            temperature: 0.3,
            topP: 0.9,
          }
        });
      }

      clearTimeout(timeoutId);
      const text = response.text;
      if (!text) throw new Error("Empty response from business analysis.");

      const analysis = parseAnalysisJSON(text);

      return {
        text: text,
        tokens_used: response.usageMetadata?.totalTokenCount || 0,
        model_name: MODEL_NAME,
        prompt_name: 'business_analysis_web',
        prompt_version: 1,
        analysis
      };
    } catch (error: unknown) {
      attempt++;
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      console.warn(`Business analysis attempt ${attempt} failed:`, errMsg);
      if (attempt === MAX_RETRIES) {
        return {
          text: `ANALYSIS FAILED: ${errMsg}`,
          tokens_used: 0,
          model_name: MODEL_NAME,
          prompt_name: 'business_analysis_web',
          prompt_version: 1,
          analysis: null
        };
      }
      await new Promise(res => setTimeout(res, 1000 * attempt));
    }
  }

  return {
    text: 'CRITICAL FAILURE: Business analysis could not be completed.',
    tokens_used: 0,
    model_name: MODEL_NAME,
    prompt_name: 'business_analysis_web',
    prompt_version: 1,
    analysis: null
  };
};

export const generateFollowUpQuestions = async (
  currentProfile: BusinessProfile,
  previousQA?: { field: string; question: string; answer: string }[]
): Promise<{ questions: { field: string; question: string; placeholder: string }[]; tokens_used: number }> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const profileContext = Object.entries(currentProfile)
    .filter(([_, v]) => v)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join('\n');

  const previousContext = previousQA?.length
    ? `\nALREADY ANSWERED:\n${previousQA.map(qa => `- Q: ${qa.question}\n  A: ${qa.answer} (field: ${qa.field})`).join('\n')}`
    : '';

  const emptyFields = ['companyName', 'industry', 'productsServices', 'targetAudience', 'valueProp', 'pricingModel', 'salesApproach']
    .filter(f => !currentProfile[f as keyof BusinessProfile]);

  const prompt = `Based on this partially-filled business profile, generate 2-4 targeted follow-up questions to fill in the gaps.

CURRENT PROFILE:
${profileContext || 'No fields filled yet'}

EMPTY/MISSING FIELDS: ${emptyFields.join(', ') || 'None'}
${previousContext}

Return a JSON object with this structure:
{
  "questions": [
    { "field": "productsServices", "question": "What are the main products or services your company offers?", "placeholder": "e.g. Cloud-based CRM platform for small businesses" }
  ]
}

Guidelines:
- Only ask about fields that are empty or vague
- Don't repeat questions already answered
- Each question should map to exactly one BusinessProfile field (companyName, industry, productsServices, targetAudience, valueProp, pricingModel, salesApproach)
- Make questions conversational and specific, not generic
- Provide helpful placeholder text
- Return ONLY valid JSON`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: {
        systemInstruction: 'You are a business strategy consultant. Ask insightful questions to understand a company. Always respond with valid JSON only.',
        temperature: 0.5,
        topP: 0.9,
      }
    });

    clearTimeout(timeoutId);
    const text = response.text || '';
    const parsed = parseAnalysisJSON(text) as any;

    return {
      questions: parsed?.questions || [],
      tokens_used: response.usageMetadata?.totalTokenCount || 0
    };
  } catch (error: unknown) {
    console.warn('Follow-up question generation failed:', error instanceof Error ? error.message : 'Unknown error');
    return { questions: [], tokens_used: 0 };
  }
};

// === AI Command Center — General-Purpose Gemini Response ===

const MODE_SYSTEM_INSTRUCTIONS: Record<string, string> = {
  analyst: 'You are a senior data analyst for a B2B sales pipeline. Cite specific lead names, scores, and percentages. Use markdown tables when comparing data. Be precise and data-driven.',
  strategist: 'You are a sales strategist for a B2B pipeline. Create actionable plans and reference leads by name. Always end with a clear next step the user can take immediately.',
  coach: 'You are a sales coach reviewing a B2B pipeline. Give honest, constructive feedback. Identify strengths and weaknesses from the actual data. Be encouraging but direct.',
  creative: 'You are a content specialist for B2B sales outreach. Write personalized content referencing specific lead details (name, company, insights). Never produce generic templates — every piece must be tailored to the data provided.',
};

export const generateCommandCenterResponse = async (
  userPrompt: string,
  mode: 'analyst' | 'strategist' | 'coach' | 'creative',
  leads: Lead[],
  conversationHistory: { role: 'user' | 'ai'; content: string }[],
  businessProfile?: BusinessProfile
): Promise<AIResponse> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  // Build lead context from top 15 leads
  const topLeads = leads.slice(0, 15);
  const leadContext = topLeads.map(l => {
    const parts = [`- ${l.name} (${l.company}) — Score: ${l.score}, Status: ${l.status}`];
    if (l.insights) parts.push(`  Insights: ${l.insights}`);
    if (l.knowledgeBase) {
      const urls = Object.entries(l.knowledgeBase)
        .filter(([k, v]) => v && k !== 'extraNotes')
        .map(([k, v]) => `${k}: ${v}`);
      if (urls.length > 0) parts.push(`  Links: ${urls.join(', ')}`);
      if (l.knowledgeBase.extraNotes) parts.push(`  Notes: ${l.knowledgeBase.extraNotes}`);
    }
    return parts.join('\n');
  }).join('\n');

  // Pipeline stats
  const statusBreakdown: Record<string, number> = {};
  leads.forEach(l => { statusBreakdown[l.status] = (statusBreakdown[l.status] || 0) + 1; });
  const avgScore = leads.length > 0
    ? Math.round(leads.reduce((a, b) => a + b.score, 0) / leads.length)
    : 0;
  const hotCount = leads.filter(l => l.score > 80).length;

  const pipelineStats = `PIPELINE STATS:
- Total Leads: ${leads.length}
- Average Score: ${avgScore}/100
- Hot Leads (80+): ${hotCount}
- Status Breakdown: ${Object.entries(statusBreakdown).map(([k, v]) => `${k}: ${v}`).join(', ')}`;

  const contextBlock = `${pipelineStats}

TOP LEADS:
${leadContext || 'No leads in pipeline.'}
${buildBusinessContext(businessProfile)}`;

  // Build multi-turn contents from conversation history (last 10)
  const historySlice = conversationHistory.slice(-10);
  const contents: { role: 'user' | 'model'; parts: { text: string }[] }[] = [];

  // First message includes full context
  if (historySlice.length > 0) {
    for (const msg of historySlice.slice(0, -1)) {
      contents.push({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }],
      });
    }
  }

  // Current user prompt with context
  contents.push({
    role: 'user',
    parts: [{ text: `${contextBlock}\n\nUSER REQUEST:\n${userPrompt}` }],
  });

  const systemInstruction = MODE_SYSTEM_INSTRUCTIONS[mode] || MODE_SYSTEM_INSTRUCTIONS.analyst;

  let attempt = 0;
  while (attempt < MAX_RETRIES) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);

      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents,
        config: {
          systemInstruction,
          temperature: mode === 'creative' ? 0.85 : 0.7,
          topP: 0.9,
          topK: 40,
        }
      });

      clearTimeout(timeoutId);
      const text = response.text;
      if (!text) throw new Error('Empty response from Command Center.');

      return {
        text,
        tokens_used: response.usageMetadata?.totalTokenCount || 0,
        model_name: MODEL_NAME,
        prompt_name: `command_center_${mode}`,
        prompt_version: 1,
      };
    } catch (error: unknown) {
      attempt++;
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      console.warn(`Command Center Gemini attempt ${attempt} failed:`, errMsg);
      if (attempt === MAX_RETRIES) {
        // Return empty text to signal caller to use fallback
        return {
          text: '',
          tokens_used: 0,
          model_name: MODEL_NAME,
          prompt_name: `command_center_${mode}`,
          prompt_version: 1,
        };
      }
      await new Promise(res => setTimeout(res, 1000 * attempt));
    }
  }

  return { text: '', tokens_used: 0, model_name: MODEL_NAME, prompt_name: `command_center_${mode}`, prompt_version: 1 };
};

export const parseEmailSequenceResponse = (rawText: string, config: EmailSequenceConfig): EmailStep[] => {
  const steps: EmailStep[] = [];
  const emailBlocks = rawText.split('===EMAIL_START===').filter(b => b.trim());

  for (const block of emailBlocks) {
    const cleaned = block.replace('===EMAIL_END===', '').trim();
    const stepMatch = cleaned.match(/STEP:\s*(\d+)/);
    const delayMatch = cleaned.match(/DELAY:\s*(.+)/);
    const subjectMatch = cleaned.match(/SUBJECT:\s*(.+)/);
    const bodyMatch = cleaned.match(/BODY:\s*([\s\S]*?)$/);

    if (stepMatch && subjectMatch && bodyMatch) {
      steps.push({
        id: `step-${stepMatch[1]}-${Date.now()}`,
        stepNumber: parseInt(stepMatch[1]),
        subject: subjectMatch[1].trim(),
        body: bodyMatch[1].trim(),
        delay: delayMatch ? delayMatch[1].trim() : `Day ${parseInt(stepMatch[1])}`,
        tone: config.tone
      });
    }
  }

  // Fallback: if structured parsing fails, create steps from plain text
  if (steps.length === 0 && rawText.length > 50) {
    const sections = rawText.split(/(?:Email\s*#?\s*\d|Subject\s*\d)/i).filter(s => s.trim().length > 20);
    for (let i = 0; i < Math.min(sections.length, config.sequenceLength); i++) {
      steps.push({
        id: `step-${i + 1}-${Date.now()}`,
        stepNumber: i + 1,
        subject: `Email ${i + 1} - Follow Up`,
        body: sections[i].trim(),
        delay: `Day ${1 + i * (CADENCE_DAYS[config.cadence] || 2)}`,
        tone: config.tone
      });
    }
  }

  return steps;
};