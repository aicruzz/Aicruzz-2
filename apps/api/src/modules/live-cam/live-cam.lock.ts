import { getRedis } from '../../config/redis';
import { logger } from '../../utils/logger';

const KEY = (sid: string) => `livecam:tick-lock:${sid}`;
const LOCK_TTL_MS = 3000;

export async function withSessionLock<T>(
  sessionId: string,
  fn: () => Promise<T>,
): Promise<T | null> {
  const redis = getRedis();
  const token = `${Date.now()}-${Math.random()}`;
  let acquired = false;

  try {
    const ok = await redis.set(KEY(sessionId), token, 'PX', LOCK_TTL_MS, 'NX');
    acquired = ok === 'OK';
  } catch (err) {
    logger.error(`livecam lock acquire failed for ${sessionId}:`, err);
    return null;
  }

  if (!acquired) return null;

  try {
    return await fn();
  } finally {
    try {
      const cur = await redis.get(KEY(sessionId));
      if (cur === token) await redis.del(KEY(sessionId));
    } catch (err) {
      logger.error(`livecam lock release failed for ${sessionId}:`, err);
    }
  }
}
