import { Worker, Job } from 'bullmq';
import { redis } from '../cache/redis.js';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface DataJobData {
  type: 'bulk_import' | 'lead_enrichment' | 'analytics_refresh';
  userId: string;
  params: Record<string, unknown>;
}

interface DataJobResult {
  processed: number;
  failed: number;
}

export function startDataWorker() {
  const worker = new Worker<DataJobData, DataJobResult>(
    'data-processing',
    async (job: Job<DataJobData>) => {
      const { type, userId, params } = job.data;
      console.log(`[Data Worker] Processing ${type} job ${job.id} for user ${userId}`);

      switch (type) {
        case 'analytics_refresh': {
          // Refresh the materialized view
          const { error } = await supabase.rpc('refresh_email_analytics');
          if (error) console.warn('[Data Worker] Analytics refresh via RPC failed:', error.message);
          return { processed: 1, failed: error ? 1 : 0 };
        }

        case 'bulk_import': {
          const leads = params.leads as Array<Record<string, unknown>>;
          if (!leads?.length) return { processed: 0, failed: 0 };

          const batchSize = 100;
          let processed = 0;
          let failed = 0;

          for (let i = 0; i < leads.length; i += batchSize) {
            const batch = leads.slice(i, i + batchSize).map(lead => ({
              ...lead,
              user_id: userId,
            }));
            const { error } = await supabase.from('leads').insert(batch);
            if (error) {
              failed += batch.length;
              console.error(`[Data Worker] Batch import error:`, error.message);
            } else {
              processed += batch.length;
            }
            await job.updateProgress(Math.round(((i + batchSize) / leads.length) * 100));
          }

          return { processed, failed };
        }

        case 'lead_enrichment': {
          // TODO: Implement lead enrichment (Apollo/Clearbit API calls)
          return { processed: 0, failed: 0 };
        }

        default:
          return { processed: 0, failed: 0 };
      }
    },
    {
      connection: redis,
      concurrency: 2,
    }
  );

  worker.on('completed', (job) => {
    console.log(`[Data Worker] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[Data Worker] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
