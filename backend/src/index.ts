import express from 'express';
import { redis } from './cache/redis.js';
import { startAIWorker } from './workers/ai-queue.js';
import { startDataWorker } from './workers/data-queue.js';

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

app.use(express.json());

// Health check
app.get('/health', async (_req, res) => {
  try {
    const redisPing = await redis.ping();
    res.json({
      status: 'ok',
      redis: redisPing === 'PONG' ? 'connected' : 'error',
      uptime: process.uptime(),
    });
  } catch {
    res.status(503).json({ status: 'error', redis: 'disconnected' });
  }
});

// Start services
async function main() {
  try {
    await redis.connect();
    console.log('[Redis] Connected');
  } catch (err) {
    console.error('[Redis] Failed to connect:', err);
    process.exit(1);
  }

  const aiWorker = startAIWorker();
  const dataWorker = startDataWorker();

  app.listen(PORT, () => {
    console.log(`[Backend] Listening on port ${PORT}`);
    console.log('[Workers] AI and Data workers started');
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log('[Backend] Shutting down...');
    await aiWorker.close();
    await dataWorker.close();
    await redis.quit();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main();
