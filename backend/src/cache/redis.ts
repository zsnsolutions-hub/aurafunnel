import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

export const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null,
  lazyConnect: true,
});

redis.on('error', (err) => {
  console.error('[Redis] Connection error:', err.message);
});

// Cache TTLs (seconds)
const TTL = {
  CREDIT_BALANCE: 60,
  EMAIL_ANALYTICS: 300,
  WORKFLOW_LIST: 120,
} as const;

export async function getCached<T>(key: string): Promise<T | null> {
  const data = await redis.get(key);
  if (!data) return null;
  return JSON.parse(data) as T;
}

export async function setCache(key: string, value: unknown, ttlKey: keyof typeof TTL): Promise<void> {
  await redis.set(key, JSON.stringify(value), 'EX', TTL[ttlKey]);
}

export async function invalidateCache(pattern: string): Promise<void> {
  const keys = await redis.keys(pattern);
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}

export { TTL };
