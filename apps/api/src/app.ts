import 'express-async-errors';
import express, { Application } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import path from 'path';
import fs from 'fs';

import { env } from './config/env';
import { logger } from './utils/logger';
import { globalRateLimiter } from './middleware/rateLimit.middleware';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import {
  sanitizeQuery,
  additionalSecurityHeaders,
  requestSizeGuard,
} from './middleware/security.middleware';
import { getDetailedHealth } from './utils/health';

// Route imports
import { walletRouter } from './modules/wallet/wallet.routes';
import { authRouter } from './modules/auth/auth.routes';
import { userRouter } from './modules/user/user.routes';
import { adminRouter } from './modules/admin/admin.routes';
import { chatRouter } from './modules/chat/chat.routes';
import { videoRouter } from './modules/video/video.routes';
import { liveCamRouter } from './modules/live-cam/live-cam.routes';
import { cartoonRouter } from './modules/cartoon/cartoon.routes';
import { assetsRouter } from './modules/assets/assets.routes';
import { voiceRouter } from './modules/voice/voice.routes';
import { apiPlatformRouter } from './modules/api-platform/api-platform.routes';
import { publicApiRouter } from './modules/public-api/public-api.routes';
import {
  bannersPublicRouter,
  bannersAdminRouter,
} from './modules/banners/banners.routes';

// Stripe webhook (needs raw body — mounted BEFORE json middleware)
import { handleStripeWebhook, createPaymentIntentHandler } from './services/stripe.service';
import { authenticate } from './middleware/auth.middleware';
import { walletRateLimiter } from './middleware/rateLimit.middleware';

// Legal consent routes
import { recordLegalConsent, getUserConsents } from './middleware/legal.middleware';

export function createApp(): Application {
  const app = express();

  // Trust X-Forwarded-* headers when behind a reverse proxy
  app.set('trust proxy', 1);

  // ── Request-size guard (block obvious DDoS patterns first) ─
  app.use(requestSizeGuard);

  // ── Security headers ──────────────────────────────────────
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: env.isProd,
      hsts: env.isProd ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
    }),
  );
  app.use(additionalSecurityHeaders);
  app.use(sanitizeQuery);

  // ── CORS ──────────────────────────────────────────────────
  app.use(
    cors({
      origin: env.CORS_ORIGIN.split(',').map((o) => o.trim()),
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
    }),
  );

  // ── Stripe webhook — MUST be before json() ────────────────
  app.post(
    '/api/billing/stripe/webhook',
    express.raw({ type: 'application/json' }),
    handleStripeWebhook,
  );

  // ── Body parsers ──────────────────────────────────────────
  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true, limit: '5mb' }));
  app.use(cookieParser());

  // ── Compression ───────────────────────────────────────────
  app.use(compression());

  // ── Request logging ───────────────────────────────────────
  if (env.isDev) {
    app.use(morgan('dev'));
  } else {
    app.use(
      morgan('combined', {
        stream: { write: (msg) => logger.info(msg.trim()) },
      }),
    );
  }

  // ── Static file serving (uploads) ────────────────────────
  const uploadDir = path.resolve(env.UPLOAD_DIR);
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  // Ensure all upload subdirectories exist
  const uploadSubdirs = [
    'crypto-proofs', 'avatars', 'chat-images', 'chat-videos',
    'cartoon-assets', 'video-inputs', 'generated',
  ];
  for (const sub of uploadSubdirs) {
    const dir = path.join(uploadDir, sub);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
  app.use('/uploads', express.static(uploadDir));

  // ── Global rate limiter ───────────────────────────────────
  app.use(globalRateLimiter);

  // ── Health check ──────────────────────────────────────────
  // Liveness probe — always 200 if process is up
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'AiCruzz API', version: '1.0.0' });
  });

  // Readiness probe — checks DB + Redis + AI router
  app.get('/health/ready', async (_req, res) => {
    const health = await getDetailedHealth(env.NODE_ENV);
    const code = health.status === 'ok' ? 200 : health.status === 'degraded' ? 200 : 503;
    res.status(code).json(health);
  });

  // ── API Routes ────────────────────────────────────────────
  app.use('/api/auth', authRouter);
  app.use('/api/wallet', walletRouter);
  app.use('/api/users', userRouter);
  app.use('/api/admin/banners', bannersAdminRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/banners', bannersPublicRouter);
  app.use('/api/chat', chatRouter);
  app.use('/api/video', videoRouter);
  app.use('/api/live-cam', liveCamRouter);
  app.use('/api/cartoon', cartoonRouter);
  app.use('/api/assets', assetsRouter);
  app.use('/api/voice', voiceRouter);
  app.use('/api/api-platform', apiPlatformRouter);

  // PUBLIC API for external developers (API key auth, versioned)
  app.use('/v1', publicApiRouter);

  // Legal consent endpoints
  app.post('/api/legal/consent', authenticate, recordLegalConsent);
  app.get('/api/legal/consents', authenticate, getUserConsents);

  // Stripe payment intent (wallet funding)
  app.post(
    '/api/billing/stripe/create-intent',
    authenticate,
    walletRateLimiter,
    createPaymentIntentHandler,
  );

  app.all('*', (_req, res) => {
    res.status(404).json({ success: false, message: 'This route does not exist.' });
  });

  // ── 404 handler ───────────────────────────────────────────
  app.use(notFoundHandler);

  // ── Global error handler ──────────────────────────────────
  app.use(errorHandler);

  return app;
}
