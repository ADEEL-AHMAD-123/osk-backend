import Redis from 'ioredis';
import { env } from './env';
import { logger } from './logger';

/**
 * Redis client — used for response caching, rate-limit counters and (later)
 * the Socket.IO adapter. `lazyConnect` keeps boot fast; connection is opened
 * explicitly and failure is non-fatal in this shell.
 */
export const redis = new Redis(env.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
});

redis.on('error', (err) => {
  logger.debug({ err: err.message }, 'redis error');
});

export async function connectRedis(): Promise<void> {
  try {
    await redis.connect();
    logger.info('Redis connected');
  } catch (err) {
    logger.warn(
      { err: (err as Error).message },
      'Redis unavailable — caching and rate-limit store degraded',
    );
  }
}
