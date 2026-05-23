import crypto from 'crypto';
import { and, count, desc, eq, sql } from 'drizzle-orm';
import { db } from '../../config/database';
import { apiKeys, apiSubscriptions } from '../../db/schema';
import { stripe } from '../../config/stripe';
import { logger } from '../../utils/logger';
import { logActivity } from '../../services/activity.service';
import { AppError } from '../../middleware/error.middleware';
import {
  PLAN_CONFIG,
  type ApiPlan,
  type CreateApiKeyInput,
  type ApiKeyDto,
  type ApiKeyWithSecret,
  type SubscriptionDto,
} from './api-platform.types';

// ─── HELPERS ──────────────────────────────────────────────────

const KEY_PREFIX = 'aic_live_';

function generateKey(): { key: string; prefix: string } {
  const randomBytes = crypto.randomBytes(24).toString('hex');
  const key = `${KEY_PREFIX}${randomBytes}`;
  const prefix = key.substring(0, 16); // shown to user (e.g. "aic_live_abc123…")
  return { key, prefix };
}

function maskKey(prefix: string): string {
  return `${prefix}${'•'.repeat(24)}`;
}

// ─── API KEYS ─────────────────────────────────────────────────

export async function createApiKey(
  userId: string,
  input: CreateApiKeyInput,
): Promise<ApiKeyWithSecret> {
  // Require active subscription to create API keys
  const sub = await db.query.apiSubscriptions.findFirst({
    where: eq(apiSubscriptions.userId, userId),
  });
  if (!sub || sub.status !== 'ACTIVE') {
    throw new AppError(
      'Active API subscription required to create API keys. Subscribe to a plan first.',
      403,
    );
  }

  // Cap at 10 keys per user
  const existingCountRows = await db
    .select({ n: count() })
    .from(apiKeys)
    .where(eq(apiKeys.userId, userId));
  const existingCount = existingCountRows[0]?.n ?? 0;
  if (existingCount >= 10) {
    throw new AppError('Maximum of 10 API keys per account', 400);
  }

  const { key, prefix } = generateKey();

  const [apiKey] = await db
    .insert(apiKeys)
    .values({
      userId,
      key,
      prefix,
      name: input.name,
      ipWhitelist: input.ipWhitelist,
    })
    .returning();

  await logActivity({
    userId,
    action: 'API_KEY_CREATED',
    module: 'API_PLATFORM',
    details: { keyId: apiKey.id, name: input.name },
  });

  return {
    id: apiKey.id,
    name: apiKey.name,
    prefix: apiKey.prefix,
    key, // full key — ONLY returned at creation
    isActive: apiKey.isActive,
    totalRequests: apiKey.totalRequests,
    lastUsedAt: apiKey.lastUsedAt,
    createdAt: apiKey.createdAt,
    ipWhitelist: apiKey.ipWhitelist,
  };
}

export async function listApiKeys(userId: string): Promise<ApiKeyDto[]> {
  const keys = await db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      prefix: apiKeys.prefix,
      isActive: apiKeys.isActive,
      totalRequests: apiKeys.totalRequests,
      lastUsedAt: apiKeys.lastUsedAt,
      createdAt: apiKeys.createdAt,
      ipWhitelist: apiKeys.ipWhitelist,
    })
    .from(apiKeys)
    .where(eq(apiKeys.userId, userId))
    .orderBy(desc(apiKeys.createdAt));
  return keys.map((k) => ({ ...k, prefix: maskKey(k.prefix) }));
}

export async function revokeApiKey(userId: string, keyId: string): Promise<void> {
  const key = await db.query.apiKeys.findFirst({
    where: and(eq(apiKeys.id, keyId), eq(apiKeys.userId, userId)),
  });
  if (!key) throw new AppError('API key not found', 404);
  await db
    .update(apiKeys)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(apiKeys.id, keyId));
  await logActivity({
    userId,
    action: 'API_KEY_REVOKED',
    module: 'API_PLATFORM',
    severity: 'WARN',
    details: { keyId, name: key.name },
  });
}

export async function deleteApiKey(userId: string, keyId: string): Promise<void> {
  const key = await db.query.apiKeys.findFirst({
    where: and(eq(apiKeys.id, keyId), eq(apiKeys.userId, userId)),
  });
  if (!key) throw new AppError('API key not found', 404);
  await db.delete(apiKeys).where(eq(apiKeys.id, keyId));
  await logActivity({
    userId,
    action: 'API_KEY_DELETED',
    module: 'API_PLATFORM',
    severity: 'WARN',
    details: { keyId, name: key.name },
  });
}

// ─── SUBSCRIPTIONS ────────────────────────────────────────────

export async function getSubscription(userId: string): Promise<SubscriptionDto | null> {
  const sub = await db.query.apiSubscriptions.findFirst({
    where: eq(apiSubscriptions.userId, userId),
  });
  if (!sub) return null;

  return {
    plan: sub.plan,
    status: sub.status,
    requestsPerMinute: sub.requestsPerMinute,
    requestsPerMonth: sub.requestsPerMonth,
    requestsUsedThisMonth: sub.requestsUsedThisMonth,
    usdPriceMonthly: sub.usdPriceMonthly,
    currentPeriodStart: sub.currentPeriodStart,
    currentPeriodEnd: sub.currentPeriodEnd,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    cancelledAt: sub.cancelledAt,
  };
}

export async function createOrUpgradeSubscription(
  userId: string,
  userEmail: string,
  plan: ApiPlan,
): Promise<{ checkoutUrl: string }> {
  // Find or create Stripe customer
  let stripeCustomerId: string;
  const customers = await stripe.customers.list({ email: userEmail, limit: 1 });
  if (customers.data.length > 0) {
    stripeCustomerId = customers.data[0].id;
  } else {
    const c = await stripe.customers.create({
      email: userEmail,
      metadata: { aicruzz_user_id: userId },
    });
    stripeCustomerId = c.id;
  }

  const priceId = process.env[`STRIPE_PRICE_${plan}`];
  if (!priceId) {
    throw new AppError(
      `Stripe price ID not configured for plan ${plan}. Set STRIPE_PRICE_${plan} env var.`,
      500,
    );
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: stripeCustomerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${process.env.WEB_URL ?? 'http://localhost:3000'}/api-platform?subscribed=1`,
    cancel_url: `${process.env.WEB_URL ?? 'http://localhost:3000'}/api-platform`,
    metadata: { aicruzz_user_id: userId, plan },
    subscription_data: {
      metadata: { aicruzz_user_id: userId, plan },
    },
  });

  await logActivity({
    userId,
    action: 'API_SUBSCRIPTION_CHECKOUT',
    module: 'API_PLATFORM',
    details: { plan, sessionId: session.id },
  });

  return { checkoutUrl: session.url ?? '' };
}

export async function cancelSubscription(userId: string): Promise<void> {
  const sub = await db.query.apiSubscriptions.findFirst({
    where: eq(apiSubscriptions.userId, userId),
  });
  if (!sub) throw new AppError('No active subscription', 404);
  if (sub.status === 'CANCELLED') throw new AppError('Already cancelled', 400);
  if (!sub.stripeSubscriptionId) throw new AppError('No Stripe subscription found', 400);

  await stripe.subscriptions.update(sub.stripeSubscriptionId, {
    cancel_at_period_end: true,
  });

  await db
    .update(apiSubscriptions)
    .set({ cancelAtPeriodEnd: true, cancelledAt: new Date(), updatedAt: new Date() })
    .where(eq(apiSubscriptions.userId, userId));

  await logActivity({
    userId,
    action: 'API_SUBSCRIPTION_CANCELLED',
    module: 'API_PLATFORM',
    severity: 'WARN',
    details: { plan: sub.plan },
  });
}

export async function resumeSubscription(userId: string): Promise<void> {
  const sub = await db.query.apiSubscriptions.findFirst({
    where: eq(apiSubscriptions.userId, userId),
  });
  if (!sub) throw new AppError('No subscription', 404);
  if (!sub.cancelAtPeriodEnd) throw new AppError('Subscription is not pending cancellation', 400);
  if (!sub.stripeSubscriptionId) throw new AppError('No Stripe subscription found', 400);

  await stripe.subscriptions.update(sub.stripeSubscriptionId, {
    cancel_at_period_end: false,
  });

  await db
    .update(apiSubscriptions)
    .set({ cancelAtPeriodEnd: false, cancelledAt: null, updatedAt: new Date() })
    .where(eq(apiSubscriptions.userId, userId));
}

// ─── WEBHOOK HANDLERS (called from stripe webhook) ────────────

export async function handleSubscriptionCreated(
  userId: string,
  plan: ApiPlan,
  stripeSubscriptionId: string,
  stripeCustomerId: string,
  currentPeriodStart: Date,
  currentPeriodEnd: Date,
): Promise<void> {
  const config = PLAN_CONFIG[plan];

  await db
    .insert(apiSubscriptions)
    .values({
      userId,
      plan,
      status: 'ACTIVE',
      requestsPerMinute: config.requestsPerMinute,
      requestsPerMonth: config.requestsPerMonth,
      usdPriceMonthly: config.monthlyUsd,
      currentPeriodStart,
      currentPeriodEnd,
      stripeSubscriptionId,
      stripeCustomerId,
    })
    .onConflictDoUpdate({
      target: apiSubscriptions.userId,
      set: {
        plan,
        status: 'ACTIVE',
        requestsPerMinute: config.requestsPerMinute,
        requestsPerMonth: config.requestsPerMonth,
        usdPriceMonthly: config.monthlyUsd,
        currentPeriodStart,
        currentPeriodEnd,
        stripeSubscriptionId,
        stripeCustomerId,
        cancelAtPeriodEnd: false,
        cancelledAt: null,
        requestsUsedThisMonth: 0,
        lastResetAt: new Date(),
        updatedAt: new Date(),
      },
    });

  logger.info(`API subscription created/upgraded for user ${userId} → ${plan}`);
}

// ─── INTERNAL: increment usage counter ────────────────────────

export async function incrementUsage(userId: string): Promise<void> {
  const sub = await db.query.apiSubscriptions.findFirst({
    where: eq(apiSubscriptions.userId, userId),
  });
  if (!sub) return;

  // Reset monthly counter if past period end
  const now = new Date();
  if (now > sub.currentPeriodEnd) {
    // Stripe webhook will update period; for now just reset counter
    await db
      .update(apiSubscriptions)
      .set({ requestsUsedThisMonth: 1, lastResetAt: now, updatedAt: now })
      .where(eq(apiSubscriptions.userId, userId));
    return;
  }

  await db
    .update(apiSubscriptions)
    .set({
      requestsUsedThisMonth: sql`${apiSubscriptions.requestsUsedThisMonth} + 1`,
      updatedAt: now,
    })
    .where(eq(apiSubscriptions.userId, userId));
}
