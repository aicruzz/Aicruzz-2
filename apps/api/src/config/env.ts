import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('4000'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),

  // Database
  DATABASE_URL: z.string({ required_error: 'DATABASE_URL is required' }),

  // Redis
  REDIS_URL: z.string({ required_error: 'REDIS_URL is required' }),

  // JWT
  JWT_SECRET: z
    .string({ required_error: 'JWT_SECRET is required' })
    .min(32, 'JWT_SECRET must be at least 32 characters'),
  // Legacy single-token expiry — kept for back-compat with anything
  // still calling generateToken() directly. New code uses ACCESS/REFRESH.
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
  // Optional override for cookie domain in prod (e.g. ".aicruzz.com")
  COOKIE_DOMAIN: z.string().optional(),

  // Stripe
  STRIPE_SECRET_KEY: z.string({ required_error: 'STRIPE_SECRET_KEY is required' }),
  STRIPE_PUBLISHABLE_KEY: z.string({ required_error: 'STRIPE_PUBLISHABLE_KEY is required' }),
  STRIPE_WEBHOOK_SECRET: z.string({ required_error: 'STRIPE_WEBHOOK_SECRET is required' }),

  // AI Providers (optional during dev)
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  ELEVENLABS_API_KEY: z.string().optional(),
  RUNWAY_API_KEY: z.string().optional(),
  PIKA_API_KEY: z.string().optional(),

  // Crypto wallets
  ADMIN_WALLET_BTC: z.string({ required_error: 'ADMIN_WALLET_BTC is required' }),
  ADMIN_WALLET_USDT: z.string({ required_error: 'ADMIN_WALLET_USDT is required' }),

  // Upload
  UPLOAD_DIR: z.string().default('./uploads'),
  MAX_FILE_SIZE: z.string().default('52428800'),

  // Rate limiting
  RATE_LIMIT_WINDOW_MS: z.string().default('900000'),
  RATE_LIMIT_MAX: z.string().default('100'),

  // Credit system
  CREDITS_PER_DOLLAR: z.string().default('10'),
  CREDIT_EXPIRY_DAYS: z.string().default('30'),
  MIN_FUND_AMOUNT: z.string().default('10'),

  // AI Router (internal service)
  AI_ROUTER_URL: z.string().default('http://localhost:4001'),
  // AI_ROUTER_SECRET: z.string().default('nKNfE8N1vRBRiwRaNQe0hu/atjnhzumQIMrdHfoSrOI='),
  AI_ROUTER_SECRET: z.string().trim(),
  GPU_WORKER_URL: z.string().default('http://localhost:8000'),
  QUEUE_CONCURRENCY: z.string().default('4'),

  // WebRTC server
  WEBRTC_URL: z.string().default('http://localhost:4002'),
  WEBRTC_WS_URL: z.string().default('ws://localhost:4002'),
  API_BASE_URL: z.string().default('http://localhost:4000'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  console.error(JSON.stringify(parsed.error.flatten().fieldErrors, null, 2));
  process.exit(1);
}

export const env = {
  ...parsed.data,
  PORT: parseInt(parsed.data.PORT, 10),
  MAX_FILE_SIZE: parseInt(parsed.data.MAX_FILE_SIZE, 10),
  RATE_LIMIT_WINDOW_MS: parseInt(parsed.data.RATE_LIMIT_WINDOW_MS, 10),
  RATE_LIMIT_MAX: parseInt(parsed.data.RATE_LIMIT_MAX, 10),
  CREDITS_PER_DOLLAR: parseFloat(parsed.data.CREDITS_PER_DOLLAR),
  CREDIT_EXPIRY_DAYS: parseInt(parsed.data.CREDIT_EXPIRY_DAYS, 10),
  MIN_FUND_AMOUNT: parseFloat(parsed.data.MIN_FUND_AMOUNT),
  isProd: parsed.data.NODE_ENV === 'production',
  isDev: parsed.data.NODE_ENV === 'development',
};
