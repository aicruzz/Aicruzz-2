import rateLimit from 'express-rate-limit';
import { env } from '../config/env';

// Global rate limiter for all routes
export const globalRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests. Please try again later.',
  },
  skip: (req) => req.ip === '::1' && env.isDev,
});

// Strict limiter for auth routes (prevent brute force)
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many authentication attempts. Try again in 15 minutes.',
  },
});

// Strict limiter for wallet funding (prevent abuse)
export const walletRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many wallet operations. Try again later.',
  },
});

// Limiter for API key usage (per-key enforcement done separately)
export const apiKeyRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 300, // default max — subscription plan enforces actual limit
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.headers['x-api-key'] as string ?? req.ip ?? 'unknown',
  message: {
    success: false,
    message: 'API rate limit exceeded.',
  },
});
