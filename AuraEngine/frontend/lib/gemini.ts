import { GoogleGenAI } from "@google/genai";
import { ContentType, Lead } from "../types";
import { supabase } from "./supabase";

const MAX_RETRIES = 2;
const TIMEOUT_MS = 10000;
const MODEL_NAME = 'gemini-3-flash-preview';

// GEMINI 3 FLASH PRICING (Estimated Blended Rate)
const COST_PER_1M_TOKENS = 0.15; 

export interface AIResponse {
  text: string;
  tokens_used: number;
  model_name: string;
  prompt_name: string;
  prompt_version: number;
  latency_ms: number;
  estimated_cost: number;
  error_code?: number;
}

export const generateLeadContent = async (lead: Lead, type: ContentType): Promise<AIResponse> => {
  const startTime = performance.now();
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // 1. Fetch Latest Active Prompt
  const { data: activePrompt } = await supabase
    .from('ai_prompts')
    .select('*')
    .eq('name', 'sales_outreach')
    .eq('is_active', true)
    .single();

  const pName = activePrompt?.name || 'default_sales_outreach';
  const pVersion = activePrompt?.version || 0;

  // 2. Pre-flight Rate Limit Check
  const { data: limitData, error: limitError } = await supabase.rpc('enforce_rate_limit');
  
  if (limitError || (limitData && !limitData.success)) {
    const errorMsg = limitData?.message || "Rate limit exceeded.";
    return {
      text: errorMsg,
      tokens_used: 0,
      model_name: MODEL_NAME,
      prompt_name: pName,
      prompt_version: pVersion,
      latency_ms: Math.round(performance.now() - startTime),
      estimated_cost: 0,
      error_code: 429
    };
  }
  
  // 3. Prepare Prompt
  const systemInstruction = `You are a world-class B2B sales development representative. Generate a hyper-personalized ${type}. 
Focus on pain points and company context. Avoid generic jargon.`;

  const finalPrompt = (activePrompt?.template || `Generate {{type}} for {{lead_name}} at {{company}}. Context: {{insights}}`)
    .replace('{{lead_name}}', lead.name)
    .replace('{{company}}', lead.company)
    .replace('{{insights}}', lead.insights)
    .replace('{{type}}', type);

  let attempt = 0;
  let lastError: unknown = null;

  while (attempt <= MAX_RETRIES) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: finalPrompt,
        config: {
          systemInstruction,
          temperature: 0.8,
        }
      });

      clearTimeout(timeoutId);
      
      const text = response.text;
      if (!text) throw new Error("Empty response from engine.");
      
      const finalLatency = Math.round(performance.now() - startTime);
      const tokens = response.usageMetadata?.totalTokenCount || 0;
      const cost = (tokens / 1000000) * COST_PER_1M_TOKENS;

      // Log SUCCESS to telemetry with financial data
      await supabase.from('ai_usage_logs').insert({
        user_id: lead.client_id,
        lead_id: lead.id,
        action_type: type.toLowerCase().replace(' ', '_') + '_gen',
        tokens_used: tokens,
        model_name: MODEL_NAME,
        prompt_name: pName,
        prompt_version: pVersion,
        status: 'success',
        latency_ms: finalLatency,
        estimated_cost: cost
      });
      
      return {
        text,
        tokens_used: tokens,
        model_name: MODEL_NAME,
        prompt_name: pName,
        prompt_version: pVersion,
        latency_ms: finalLatency,
        estimated_cost: cost
      };

    } catch (error: unknown) {
      lastError = error;
      console.warn(`Attempt ${attempt + 1} failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      if (attempt < MAX_RETRIES) {
        const backoff = 1000 * Math.pow(2, attempt);
        await new Promise(res => setTimeout(res, backoff));
        attempt++;
      } else {
        break; 
      }
    }
  }

  // 4. Terminal Failure Logging
  const failureLatency = Math.round(performance.now() - startTime);
  const gracefulMessage = lastError instanceof Error && lastError.name === 'AbortError'
    ? "NEURAL TIMEOUT: The intelligence engine didn't respond in time."
    : `SYSTEM ERROR: Connection failed after ${MAX_RETRIES + 1} attempts.`;

  await supabase.from('ai_usage_logs').insert({
    user_id: lead.client_id,
    lead_id: lead.id,
    action_type: type.toLowerCase().replace(' ', '_') + '_gen',
    tokens_used: 0,
    model_name: MODEL_NAME,
    prompt_name: pName,
    prompt_version: pVersion,
    status: 'error',
    latency_ms: failureLatency,
    estimated_cost: 0,
    error_message: lastError instanceof Error ? lastError.message : "Unknown Failure"
  });

  return {
    text: gracefulMessage,
    tokens_used: 0,
    model_name: MODEL_NAME,
    prompt_name: pName,
    prompt_version: pVersion,
    latency_ms: failureLatency,
    estimated_cost: 0,
    error_code: 503
  };
};