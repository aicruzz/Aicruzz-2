import { Request, Response, NextFunction } from 'express';
import { eq, sql } from 'drizzle-orm';
import { db } from '../../config/database';
import { apiKeys, apiSubscriptions } from '../../db/schema';
import { cache } from '../../config/redis';
import { logger } from '../../utils/logger';
import { incrementUsage } from '../api-platform/api-platform.service';

// Augment Express Request to carry API context
declare global {
  namespace Express {
    interface Request {
      apiContext?: {
        userId: string;
        apiKeyId: string;
        plan: string;
        creditsBalance: number;
      };
    }
  }
}

// ─── 1. AUTHENTICATE BY API KEY ────────────────────────────────

export async function authenticateApiKey(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const apiKey = (req.headers['x-api-key'] ||
    req.headers['authorization']?.toString().replace(/^Bearer\s+/i, '')) as string | undefined;

  if (!apiKey || !apiKey.startsWith('aic_live_')) {
    res.status(401).json({
      error: 'invalid_api_key',
      message: 'API key required. Pass it as `x-api-key` header or Bearer token.',
    });
    return;
  }

  const keyRecord = await db.query.apiKeys.findFirst({
    where: eq(apiKeys.key, apiKey),
    columns: { id: true, userId: true, isActive: true, ipWhitelist: true },
    with: {
      user: {
        columns: { id: true, isBlocked: true },
        with: {
          apiSubscription: {
            columns: {
              status: true,
              plan: true,
              requestsPerMinute: true,
              requestsPerMonth: true,
              requestsUsedThisMonth: true,
              currentPeriodEnd: true,
            },
          },
          wallet: { columns: { credits: true } },
        },
      },
    },
  });

  if (!keyRecord || !keyRecord.isActive) {
    res.status(401).json({ error: 'invalid_api_key', message: 'API key invalid or revoked' });
    return;
  }

  if (keyRecord.user.isBlocked) {
    res.status(403).json({ error: 'account_blocked', message: 'Account has been blocked' });
    return;
  }

  // IP whitelist check
  if (keyRecord.ipWhitelist) {
    const allowed = keyRecord.ipWhitelist.split(',').map((ip) => ip.trim());
    const requestIp = req.ip ?? '';
    if (!allowed.includes(requestIp)) {
      res.status(403).json({
        error: 'ip_not_allowed',
        message: `Request IP ${requestIp} not in whitelist for this key`,
      });
      return;
    }
  }

  // Subscription check (RULE: subscription = access)
  const sub = keyRecord.user.apiSubscription;
  if (!sub || sub.status !== 'ACTIVE') {
    res.status(402).json({
      error: 'subscription_required',
      message: 'Active API subscription required. Upgrade your plan in the dashboard.',
    });
    return;
  }

  if (sub.currentPeriodEnd < new Date()) {
    res.status(402).json({
      error: 'subscription_expired',
      message: 'Subscription period has ended. Please renew.',
    });
    return;
  }

  // Attach context for downstream handlers
  req.apiContext = {
    userId: keyRecord.userId,
    apiKeyId: keyRecord.id,
    plan: sub.plan,
    creditsBalance: keyRecord.user.wallet?.credits ?? 0,
  };

  // Update last used (fire-and-forget)
  db.update(apiKeys)
    .set({ lastUsedAt: new Date(), totalRequests: sql`${apiKeys.totalRequests} + 1` })
    .where(eq(apiKeys.id, keyRecord.id))
    .catch(() => {
      /* ignore */
    });

  next();
}

// ─── 2. RATE LIMITING (per-key, sliding window, Redis) ────────

export async function enforceRateLimit(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.apiContext) return next();

  const sub = await db.query.apiSubscriptions.findFirst({
    where: eq(apiSubscriptions.userId, req.apiContext.userId),
    columns: { requestsPerMinute: true },
  });

  const limit = sub?.requestsPerMinute ?? 60;
  const key = `ratelimit:apikey:${req.apiContext.apiKeyId}:${Math.floor(Date.now() / 60000)}`;

  try {
    const count = await cache.increment(key, 65); // 65s TTL covers the minute window
    res.setHeader('X-RateLimit-Limit', limit);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, limit - count));

    if (count > limit) {
      res.status(429).json({
        error: 'rate_limit_exceeded',
        message: `Rate limit exceeded: ${limit} requests/minute. Upgrade your plan for higher limits.`,
        retryAfter: 60,
      });
      return;
    }
    next();
  } catch (err) {
    logger.error('Rate limit check failed:', err);
    // Fail-open: don't block requests if Redis is down
    next();
  }
}

// ─── 3. MONTHLY QUOTA CHECK ───────────────────────────────────

export async function enforceMonthlyQuota(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.apiContext) return next();

  const sub = await db.query.apiSubscriptions.findFirst({
    where: eq(apiSubscriptions.userId, req.apiContext.userId),
    columns: { requestsPerMonth: true, requestsUsedThisMonth: true },
  });

  if (!sub) {
    res.status(402).json({ error: 'subscription_required' });
    return;
  }

  // -1 = unlimited
  if (sub.requestsPerMonth !== -1 && sub.requestsUsedThisMonth >= sub.requestsPerMonth) {
    res.status(429).json({
      error: 'monthly_quota_exceeded',
      message: `Monthly quota of ${sub.requestsPerMonth} requests reached. Upgrade your plan.`,
    });
    return;
  }

  res.setHeader('X-Quota-Limit', sub.requestsPerMonth === -1 ? 'unlimited' : sub.requestsPerMonth);
  res.setHeader(
    'X-Quota-Remaining',
    sub.requestsPerMonth === -1
      ? 'unlimited'
      : Math.max(0, sub.requestsPerMonth - sub.requestsUsedThisMonth),
  );

  // Increment usage AFTER the request is processed
  res.on('finish', () => {
    if (res.statusCode < 400) {
      incrementUsage(req.apiContext!.userId).catch(() => {
        /* ignore */
      });
    }
  });

  next();
}

// ─── 4. CREDIT CHECK ──────────────────────────────────────────

export function requireCredits(minCredits: number) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.apiContext) return next();

    if (req.apiContext.creditsBalance < minCredits) {
      res.status(402).json({
        error: 'insufficient_credits',
        message: `This endpoint requires at least ${minCredits} credits. Your balance: ${req.apiContext.creditsBalance.toFixed(
          2,
        )}`,
        creditsRequired: minCredits,
        creditsBalance: req.apiContext.creditsBalance,
      });
      return;
    }
    next();
  };
}

// Compose the full public API middleware chain
export const publicApiAuth = [authenticateApiKey, enforceRateLimit, enforceMonthlyQuota];
