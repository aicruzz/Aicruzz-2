import { Request, Response, NextFunction } from 'express';
import { cache } from '../config/redis';
import { logger } from '../utils/logger';

/**
 * Response cache middleware for read-heavy GET endpoints.
 *
 * Caches the JSON response per (url + userId) for `ttlSeconds`.
 * Skips cache when:
 *  - Method is not GET
 *  - Authorization header is missing (avoid leaking auth-aware data)
 *  - URL contains a query param `nocache=1`
 */
export function cacheResponse(ttlSeconds = 30) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (req.method !== 'GET') return next();
    if (req.query.nocache === '1') return next();

    const userId = req.user?.userId ?? 'anon';
    const cacheKey = `apicache:${userId}:${req.originalUrl}`;

    try {
      const cached = await cache.get<unknown>(cacheKey);
      if (cached) {
        res.setHeader('X-Cache', 'HIT');
        res.json(cached);
        return;
      }
    } catch (err) {
      // Cache lookup failure is non-fatal — proceed
      logger.warn('Cache lookup failed:', err);
    }

    res.setHeader('X-Cache', 'MISS');

    // Wrap res.json to intercept and cache the response
    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      // Only cache successful responses
      if (res.statusCode >= 200 && res.statusCode < 300) {
        cache.set(cacheKey, body, ttlSeconds).catch((err) => {
          logger.warn('Cache write failed:', err);
        });
      }
      return originalJson(body);
    };

    next();
  };
}

/**
 * Invalidate all cached responses for a user.
 * Call this after mutations that affect the user's data.
 */
export async function invalidateUserCache(userId: string): Promise<void> {
  await cache.delPattern(`apicache:${userId}:*`);
}
