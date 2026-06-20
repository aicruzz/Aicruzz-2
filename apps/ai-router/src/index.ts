import 'express-async-errors';
import express from 'express';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

import { AiRouter } from './router';
import { HealthMonitor } from './health/health.monitor';
import { initQueue } from './queue/job.queue';
import { BaseProvider } from './providers/base.provider';

// Provider imports
import { AnthropicProvider } from './providers/anthropic.provider';
import { OpenAIProvider } from './providers/openai.provider';
import { OpenAIImageTransformProvider } from './providers/openai-image-transform.provider';
import { ElevenLabsProvider } from './providers/elevenlabs.provider';
import { RunwayProvider } from './providers/runway.provider';
import { PikaProvider } from './providers/pika.provider';
import { GpuProvider } from './providers/gpu.provider';
import { HeyGenProvider } from './providers/heygen.provider';
import { TavusProvider } from './providers/tavus.provider';

import type { ProviderId, RouteRequest } from './types';
import { redactJobStatusHttpPayload, redactRouteResponseForClient } from './utils/public-response';

const PORT = parseInt(process.env.AI_ROUTER_PORT ?? '4001', 10);

// ─── Bootstrap ────────────────────────────────────────────────

async function bootstrap() {
  // Instantiate all providers
  const providerList: BaseProvider[] = [
    new AnthropicProvider(),
    new OpenAIProvider(),
    new OpenAIImageTransformProvider(),
    new ElevenLabsProvider(),
    new RunwayProvider(),
    new PikaProvider(),
    new GpuProvider(),
    new HeyGenProvider(),
    new TavusProvider(),
  ];

  const providers = new Map<ProviderId, BaseProvider>();
  for (const p of providerList) {
    providers.set(p.id, p);
  }

  // Start health monitor (polls providers every 30s)
  const health = new HealthMonitor(providerList);
  await health.start();

  // Instantiate router
  const router = new AiRouter(providers, health);

  // Init BullMQ queue — pass router.executeQueuedJob as the processor
  initQueue((job) => router.executeQueuedJob(job));

  // ─── Express server ─────────────────────────────────────────
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  // Internal auth: shared secret between api and ai-router
  app.use((req, res, next) => {
    const secret = req.headers['x-router-secret'];
    if (secret !== process.env.AI_ROUTER_SECRET) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    next();
  });

  // Health
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'AiCruzz AI Router',
      providers: health.getAllHealth(),
    });
  });

  // Provider health breakdown
  app.get('/providers', (_req, res) => {
    res.json(health.getAllHealth());
  });

  // Main routing endpoint
  app.post('/route', async (req, res, next) => {
    try {
      const body = req.body as Partial<RouteRequest>;

      if (!body.module || !body.userId) {
        res.status(400).json({ error: 'Bad request' });
        return;
      }

      const request: RouteRequest = {
        requestId: body.requestId ?? uuidv4(),
        userId: body.userId,
        module: body.module,
        strategy: body.strategy ?? 'AUTO',
        ...body,
      };

      const result = await router.route(request);
      res.json(redactRouteResponseForClient(result));
    } catch (err) {
      next(err);
    }
  });

  // Lip-sync: real FAL render (mouth-sync + audio/video mux → final MP4).
  // Additive endpoint — not part of module routing (AiModule untouched).
  app.post('/lipsync', async (req, res, next) => {
    try {
      const { videoUrl, audioUrl, subtitlesVtt } = req.body as {
        videoUrl?: string;
        audioUrl?: string;
        subtitlesVtt?: string;
      };
      if (!videoUrl || !audioUrl) {
        res.status(400).json({ error: 'videoUrl and audioUrl are required' });
        return;
      }
      const { runLipSync } = await import('./services/lipsync.service');
      const result = await runLipSync({ videoUrl, audioUrl, subtitlesVtt });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // Job status (for async video/cartoon jobs)
  app.get('/jobs/:jobId', async (req, res) => {
    const status = await router.getJobStatus(req.params.jobId);
    res.json(redactJobStatusHttpPayload(status));
  });

  // Global error handler — never expose stack or upstream messages to clients
  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      console.error('[AiRouter]', err.message, err.stack);
      res.status(500).json({ error: 'Internal server error' });
    },
  );

  app.listen(PORT, () => {
    console.log(`✅ AI Router running on http://localhost:${PORT}`);
    console.log(`   Providers: ${providerList.map((p) => p.id).join(', ')}`);
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    health.stop();
    const { closeQueue } = await import('./queue/job.queue');
    await closeQueue();
    process.exit(0);
  });
}

bootstrap().catch((err) => {
  console.error('Failed to start AI Router:', err);
  process.exit(1);
});
