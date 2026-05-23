import Redis from 'ioredis';
import { env } from './env';
import { logger } from '../utils/logger';

let redisInstance: Redis | null = null;

export function getRedis(): Redis {
  if (!redisInstance) {
    redisInstance = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
      retryStrategy(times) {
        if (times > 10) {
          logger.error('Redis retry limit reached. Giving up.');
          return null;
        }
        return Math.min(times * 200, 2000);
      },
    });

    redisInstance.on('connect', () => logger.info('✅ Redis connected'));
    redisInstance.on('error', (err) => logger.error('❌ Redis error:', err));
    redisInstance.on('close', () => logger.warn('⚠️ Redis connection closed'));
    redisInstance.on('reconnecting', () => logger.info('🔄 Redis reconnecting...'));
  }

  return redisInstance;
}

export async function connectRedis(): Promise<void> {
  try {
    const redis = getRedis();
    await redis.ping();
    logger.info('✅ Redis ping successful');
  } catch (error) {
    logger.error('❌ Redis connection failed:', error);
    process.exit(1);
  }
}

export async function disconnectRedis(): Promise<void> {
  if (redisInstance) {
    await redisInstance.quit();
    redisInstance = null;
    logger.info('🔌 Redis disconnected');
  }
}

// Cache helpers
export const cache = {
  async get<T>(key: string): Promise<T | null> {
    const redis = getRedis();
    const val = await redis.get(key);
    if (!val) return null;
    try {
      return JSON.parse(val) as T;
    } catch {
      return val as unknown as T;
    }
  },

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const redis = getRedis();
    const serialized = JSON.stringify(value);
    if (ttlSeconds) {
      await redis.setex(key, ttlSeconds, serialized);
    } else {
      await redis.set(key, serialized);
    }
  },

  async del(key: string): Promise<void> {
    const redis = getRedis();
    await redis.del(key);
  },

  async delPattern(pattern: string): Promise<void> {
    const redis = getRedis();
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  },

  async increment(key: string, ttlSeconds?: number): Promise<number> {
    const redis = getRedis();
    const val = await redis.incr(key);
    if (ttlSeconds && val === 1) {
      await redis.expire(key, ttlSeconds);
    }
    return val;
  },
};
