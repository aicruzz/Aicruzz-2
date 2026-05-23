import 'express-async-errors';
import dotenv from 'dotenv';
dotenv.config();

import http from 'http';
import express from 'express';
import { createWorkers, closeAllWorkers } from './mediasoup/worker';
import { createSignalingServer } from './server';
import { roomManager } from './rooms/room.manager';
import { avatarRouter } from './routes/avatar.routes';

const PORT = parseInt(process.env.WEBRTC_PORT ?? '4002', 10);
const SECRET = process.env.WEBRTC_SECRET ?? '';
// Comma-separated browser origins allowed to hit the avatar proxy.
const WEB_ORIGINS = new Set(
  (process.env.WEBRTC_CORS_ORIGIN ?? 'http://localhost:3000')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);
// Warn once per unknown origin so prod misconfig is visible without spam.
const seenBadOrigins = new Set<string>();

async function bootstrap() {
  // Start mediasoup workers
  await createWorkers();

  const app = express();

  // CORS first — must apply to every route, including the avatar router
  // and OPTIONS preflight. Hand-rolled to avoid adding a dependency.
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && WEB_ORIGINS.has(origin)) {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Vary', 'Origin');
      res.header('Access-Control-Allow-Headers', 'Content-Type');
      res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    } else if (origin && !seenBadOrigins.has(origin)) {
      seenBadOrigins.add(origin);
      console.warn(
        `[WebRTC] CORS reject from unknown origin: ${origin} (allowed: ${[...WEB_ORIGINS].join(', ') || 'none'})`,
      );
    }
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // Client-side avatar pipeline proxy mounts BEFORE the global JSON parser
  // because frame bodies exceed the 100kb default; the router installs its
  // own json({ limit: '4mb' }). Order matters — do not swap.
  app.use('/live-cam/avatar', avatarRouter);

  app.use(express.json());

  // Internal auth for API calls from apps/api
  const requireSecret = (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    if (req.headers['x-webrtc-secret'] !== SECRET) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    next();
  };

  // Health endpoint
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'AiCruzz WebRTC',
      rooms: roomManager.totalRooms,
    });
  });

  // Room info (called by API to validate sessions)
  app.get('/rooms/:roomId', requireSecret, (req, res) => {
    const room = roomManager.getRoom(req.params.roomId);
    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }
    res.json({ roomId: room.id, participants: room.participantCount });
  });

  const server = http.createServer(app);

  // Attach WebSocket signaling to the same HTTP server
  createSignalingServer(server);

  server.listen(PORT, () => {
    console.log(`✅ WebRTC server on http://localhost:${PORT}`);
    console.log(`   WS signaling: ws://localhost:${PORT}/ws`);
    // EC2 deploy-readiness checkpoint: prove env is wired correctly.
    console.log(
      `[WebRTC] cors=${[...WEB_ORIGINS].join(',') || 'none'} ` +
        `gpu=${process.env.GPU_WORKER_URL ? 'set' : 'unset'} ` +
        `avatarProvider=${process.env.LIVECAM_AVATAR_PROVIDER ?? 'gpu'}`,
    );
  });

  const shutdown = async () => {
    console.log('Shutting down WebRTC server…');
    server.close();
    await closeAllWorkers();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

bootstrap().catch((err) => {
  console.error('WebRTC bootstrap failed:', err);
  process.exit(1);
});
