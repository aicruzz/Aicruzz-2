import { and, eq } from 'drizzle-orm';
import { stripe } from '../config/stripe';
import { db } from '../config/database';
import { users, transactions, activityLogs, apiSubscriptions } from '../db/schema';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { fundWallet } from '../modules/wallet/wallet.service';
import { AppError } from '../middleware/error.middleware';
import type { Request, Response } from 'express';
import Stripe from 'stripe';

// ─────────────────────────────────────────────────────────────
// CREATE PAYMENT INTENT (for wallet funding)
// ─────────────────────────────────────────────────────────────

export async function createWalletPaymentIntent(
  userId: string,
  userEmail: string,
  usdAmount: number,
): Promise<{ clientSecret: string; paymentIntentId: string }> {
  if (usdAmount < env.MIN_FUND_AMOUNT) {
    throw new AppError(`Minimum funding amount is $${env.MIN_FUND_AMOUNT}`, 400);
  }

  const amountCents = Math.round(usdAmount * 100);

  let stripeCustomerId: string | undefined;

  // Find or create Stripe customer
  const existingUser = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { email: true, name: true },
  });

  const customers = await stripe.customers.list({ email: userEmail, limit: 1 });
  if (customers.data.length > 0) {
    stripeCustomerId = customers.data[0].id;
  } else {
    const customer = await stripe.customers.create({
      email: existingUser?.email ?? userEmail,
      name: existingUser?.name ?? undefined,
      metadata: { aicruzz_user_id: userId },
    });
    stripeCustomerId = customer.id;
  }

  const paymentIntent = await stripe.paymentIntents.create({
    amount: amountCents,
    currency: 'usd',
    customer: stripeCustomerId,
    receipt_email: userEmail,
    metadata: {
      aicruzz_user_id: userId,
      usd_amount: usdAmount.toString(),
      purpose: 'wallet_funding',
    },
    description: `AiCruzz wallet funding — $${usdAmount}`,
    automatic_payment_methods: { enabled: true },
  });

  return {
    clientSecret: paymentIntent.client_secret!,
    paymentIntentId: paymentIntent.id,
  };
}

// ─────────────────────────────────────────────────────────────
// STRIPE WEBHOOK HANDLER
// ─────────────────────────────────────────────────────────────

export async function handleStripeWebhook(req: Request, res: Response): Promise<void> {
  const sig = req.headers['stripe-signature'];

  if (!sig) {
    res.status(400).json({ error: 'Missing stripe-signature header' });
    return;
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body as Buffer,
      sig,
      env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (err) {
    logger.error('Stripe webhook signature verification failed:', err);
    res.status(400).json({ error: 'Invalid signature' });
    return;
  }

  logger.info(`Stripe webhook received: ${event.type}`);

  switch (event.type) {
    case 'payment_intent.succeeded': {
      const pi = event.data.object as Stripe.PaymentIntent;
      await handlePaymentIntentSucceeded(pi);
      break;
    }

    case 'payment_intent.payment_failed': {
      const pi = event.data.object as Stripe.PaymentIntent;
      await handlePaymentIntentFailed(pi);
      break;
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      await handleSubscriptionChange(sub);
      break;
    }

    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode === 'subscription' && session.subscription) {
        const sub = await stripe.subscriptions.retrieve(session.subscription as string);
        await handleSubscriptionChange(sub);
      }
      break;
    }

    default:
      logger.info(`Unhandled Stripe event: ${event.type}`);
  }

  res.json({ received: true });
}

// ─────────────────────────────────────────────────────────────
// INTERNAL: payment_intent.succeeded
// ─────────────────────────────────────────────────────────────

async function handlePaymentIntentSucceeded(pi: Stripe.PaymentIntent): Promise<void> {
  const userId = pi.metadata?.aicruzz_user_id;
  const usdAmount = parseFloat(pi.metadata?.usd_amount ?? '0');

  if (!userId || !usdAmount) {
    logger.warn('PaymentIntent succeeded but missing metadata', { piId: pi.id });
    return;
  }

  // Idempotency check: don't credit twice for same payment intent
  const existing = await db.query.transactions.findFirst({
    where: and(
      eq(transactions.stripePaymentIntentId, pi.id),
      eq(transactions.status, 'COMPLETED'),
    ),
  });

  if (existing) {
    logger.info(`Payment ${pi.id} already processed — skipping`);
    return;
  }

  await fundWallet(userId, usdAmount, { stripePaymentIntentId: pi.id });

  await db.insert(activityLogs).values({
    userId,
    action: 'STRIPE_PAYMENT_SUCCEEDED',
    module: 'WALLET',
    details: { paymentIntentId: pi.id, usdAmount },
  });

  logger.info(`Stripe payment succeeded: $${usdAmount} credited to user ${userId}`);
}

// ─────────────────────────────────────────────────────────────
// INTERNAL: payment_intent.payment_failed
// ─────────────────────────────────────────────────────────────

async function handlePaymentIntentFailed(pi: Stripe.PaymentIntent): Promise<void> {
  const userId = pi.metadata?.aicruzz_user_id;
  logger.warn(`Stripe payment failed for user ${userId}:`, {
    piId: pi.id,
    error: pi.last_payment_error?.message,
  });

  if (userId) {
    await db.insert(activityLogs).values({
      userId,
      action: 'STRIPE_PAYMENT_FAILED',
      module: 'WALLET',
      severity: 'WARN',
      details: {
        paymentIntentId: pi.id,
        reason: pi.last_payment_error?.message,
      },
    });
  }
}

// ─────────────────────────────────────────────────────────────
// INTERNAL: subscription updates (Phase 9 — API subscriptions)
// ─────────────────────────────────────────────────────────────

async function handleSubscriptionChange(sub: Stripe.Subscription): Promise<void> {
  const userId = sub.metadata?.aicruzz_user_id;
  const planFromMeta = sub.metadata?.plan as
    | 'DEVELOPER_BASIC'
    | 'DEVELOPER_PRO'
    | 'DEVELOPER_ELITE'
    | undefined;

  // Try to find existing subscription
  const existing = await db.query.apiSubscriptions.findFirst({
    where: eq(apiSubscriptions.stripeSubscriptionId, sub.id),
  });

  // Map Stripe status → our enum
  const statusMap: Record<string, 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'TRIALING'> = {
    active: 'ACTIVE',
    past_due: 'PAST_DUE',
    canceled: 'CANCELLED',
    incomplete: 'PAST_DUE',
    incomplete_expired: 'CANCELLED',
    trialing: 'TRIALING',
    unpaid: 'PAST_DUE',
  };
  const status = statusMap[sub.status] ?? 'ACTIVE';

  // CREATE flow: subscription just created via checkout
  if (!existing && userId && planFromMeta && status === 'ACTIVE') {
    const { handleSubscriptionCreated } = await import(
      '../modules/api-platform/api-platform.service'
    );
    await handleSubscriptionCreated(
      userId,
      planFromMeta,
      sub.id,
      sub.customer as string,
      new Date(sub.current_period_start * 1000),
      new Date(sub.current_period_end * 1000),
    );
    return;
  }

  // UPDATE flow: existing subscription
  if (existing) {
    await db
      .update(apiSubscriptions)
      .set({
        status,
        currentPeriodStart: new Date(sub.current_period_start * 1000),
        currentPeriodEnd: new Date(sub.current_period_end * 1000),
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        cancelledAt: sub.canceled_at ? new Date(sub.canceled_at * 1000) : null,
        updatedAt: new Date(),
      })
      .where(eq(apiSubscriptions.id, existing.id));
  }
}

// ─────────────────────────────────────────────────────────────
// STRIPE PAYMENT ROUTES (to be mounted in app)
// ─────────────────────────────────────────────────────────────

export async function createPaymentIntentHandler(req: Request, res: Response): Promise<void> {
  const { usdAmount } = req.body;

  if (!usdAmount || isNaN(parseFloat(usdAmount))) {
    res.status(400).json({ success: false, message: 'Invalid amount' });
    return;
  }

  const result = await createWalletPaymentIntent(
    req.user!.userId,
    req.user!.email,
    parseFloat(usdAmount),
  );

  res.json({ success: true, data: result });
}
