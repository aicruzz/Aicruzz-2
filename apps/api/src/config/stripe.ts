import Stripe from 'stripe';
import { env } from './env';

export const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-04-10',
  typescript: true,
});

// Stripe product/price IDs for API subscriptions
// These are created via Stripe dashboard and referenced here
export const STRIPE_PLANS = {
  DEVELOPER_BASIC: {
    priceId: process.env.STRIPE_PRICE_DEV_BASIC ?? '',
    usdMonthly: 19,
    requestsPerMinute: 60,
    requestsPerMonth: 10000,
  },
  DEVELOPER_PRO: {
    priceId: process.env.STRIPE_PRICE_DEV_PRO ?? '',
    usdMonthly: 49,
    requestsPerMinute: 120,
    requestsPerMonth: 50000,
  },
  DEVELOPER_ELITE: {
    priceId: process.env.STRIPE_PRICE_DEV_ELITE ?? '',
    usdMonthly: 99,
    requestsPerMinute: 300,
    requestsPerMonth: -1, // unlimited
  },
} as const;
