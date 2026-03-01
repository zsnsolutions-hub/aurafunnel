import { Worker, Job } from 'bullmq';
import { redis } from '../cache/redis.js';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface AIJobData {
  type: 'email_sequence' | 'blog_content' | 'content_generation';
  userId: string;
  params: Record<string, unknown>;
}

interface AIJobResult {
  text: string;
  tokensUsed: number;
}

export function startAIWorker() {
  const worker = new Worker<AIJobData, AIJobResult>(
    'ai-generation',
    async (job: Job<AIJobData>) => {
      const { type, userId, params } = job.data;
      console.log(`[AI Worker] Processing ${type} job ${job.id} for user ${userId}`);

      // Store job status in Supabase
      await supabase.from('ai_jobs').upsert({
        id: job.id,
        user_id: userId,
        type,
        status: 'processing',
        params,
        started_at: new Date().toISOString(),
      });

      try {
        // TODO: Call Gemini API here (reuse prompts from AuraEngine/lib/gemini.ts)
        // For now, this is a placeholder for the AI generation logic
        const result: AIJobResult = {
          text: `[Queued ${type} generation — implement Gemini call]`,
          tokensUsed: 0,
        };

        await supabase.from('ai_jobs').update({
          status: 'completed',
          result: result.text,
          tokens_used: result.tokensUsed,
          completed_at: new Date().toISOString(),
        }).eq('id', job.id);

        return result;
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        await supabase.from('ai_jobs').update({
          status: 'failed',
          error: errMsg,
          completed_at: new Date().toISOString(),
        }).eq('id', job.id);
        throw error;
      }
    },
    {
      connection: redis,
      concurrency: 3,
      limiter: { max: 10, duration: 60000 },
    }
  );

  worker.on('completed', (job) => {
    console.log(`[AI Worker] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[AI Worker] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
