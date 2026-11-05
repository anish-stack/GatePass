import { env } from './env.js';

let client = null;

/** Connect to Redis if REDIS_URL is set. Never throws: on failure the app runs without cache. */
export async function initRedis() {
  if (!env.redisUrl) {
    console.log('[Redis] REDIS_URL not set -> cache disabled');
    return null;
  }
  try {
    const { default: Redis } = await import('ioredis'); // dynamic: app boots even if package is missing
    const c = new Redis(env.redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false, // fail fast when Redis is down instead of hanging requests
      retryStrategy: times => Math.min(times * 500, 5000),
    });
    c.on('error', e => console.warn('[Redis]', e.message));
    await c.connect();
    client = c;
    console.log('[Redis] Connected, cache enabled');
  } catch (e) {
    console.warn(`[Redis] unavailable (${e.message}) -> cache disabled`);
    client = null;
  }
  return client;
}

/** Returns the client only when it is ready, else null (callers fall back to DB). */
export const getRedis = () => (client && client.status === 'ready' ? client : null);

export async function closeRedis() {
  try {
    await client?.quit();
  } catch {
    /* ignore */
  }
}