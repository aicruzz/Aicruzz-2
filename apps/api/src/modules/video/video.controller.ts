import { Request, Response } from 'express';
import { and, eq } from 'drizzle-orm';
import * as videoService from './video.service';
import { sendSuccess, sendCreated } from '../../utils/response';
import type { JobStatus, WebhookBody, ProgressEventBody } from './video.types';
import { subscribeToChannels, jobChannel, userChannel, type VideoEvent } from './video.events';
import { db } from '../../config/database';
import { videoJobs } from '../../db/schema';
import { logger } from '../../utils/logger';

export async function createVideoJob(req: Request, res: Response): Promise<void> {
  const job = await videoService.createVideoJob(req.user!.userId, req.body);
  sendCreated(res, job, 'Video generation job queued');
}

export async function listJobs(req: Request, res: Response): Promise<void> {
  const page  = parseInt(req.query.page  as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const status = req.query.status as JobStatus | undefined;

  const result = await videoService.listUserJobs(req.user!.userId, page, limit, status);
  sendSuccess(res, result.jobs, 'Video jobs retrieved', 200, {
    page,
    limit,
    total: result.total,
    totalPages: result.totalPages,
  });
}

export async function getJobStatus(req: Request, res: Response): Promise<void> {
  const job = await videoService.getJobStatus(req.params.jobId, req.user!.userId);
  sendSuccess(res, job, 'Job status retrieved');
}

export async function cancelJob(req: Request, res: Response): Promise<void> {
  await videoService.cancelJob(req.params.jobId, req.user!.userId);
  sendSuccess(res, null, 'Job cancelled and credits refunded');
}

export async function estimateCredits(req: Request, res: Response): Promise<void> {
  const duration    = parseInt(req.query.duration    as string) || 5;
  const resolution  = (req.query.resolution          as string) || 'HD_720P';
  const qualityMode = (req.query.qualityMode         as string) || 'STANDARD';

  const credits = videoService.estimateCredits(duration, resolution, qualityMode);
  sendSuccess(res, { credits, duration, resolution, qualityMode }, 'Credit estimate');
}

export async function handleWebhook(req: Request, res: Response): Promise<void> {
  const { jobId } = req.params;
  const body = req.body as WebhookBody | ProgressEventBody;

  // Respond immediately so the caller doesn't time out on our DB write/publish
  res.json({ received: true });

  // Worker progress events are fire-and-forget broadcast only — no DB status
  // change beyond a lazy QUEUED → PROCESSING flip.
  if ((body as ProgressEventBody).type === 'progress') {
    const ev = body as ProgressEventBody;
    await videoService.handleProgressEvent(jobId, ev.stage, ev.progress, ev.message);
    return;
  }

  const wb = body as WebhookBody;
  await videoService.handleJobWebhook(jobId, {
    success:      wb.success,
    routerStatus: wb.result.raw.status,
    outputUrl:    wb.result.raw.output_url,
    thumbnailUrl: wb.result.raw.thumbnail_url,
    provider:     wb.result.provider,
    actualDurationSeconds: wb.result.raw.duration_seconds,
    error:        wb.result.raw.error,
    diagnostics:  wb.diagnostics ?? null,
  });
}

// ─── SERVER-SENT EVENTS ───────────────────────────────────────────
//
// These endpoints replace the polling loop. Two flavours:
//   GET /api/video/events            → all jobs for the authed user (feed)
//   GET /api/video/events/:jobId     → a single job (job detail)
//
// Both keep the connection open, push JSON event frames as they arrive
// from the Redis pub/sub bus, and emit comment heartbeats every 25s so
// proxies don't kill the socket.

const SSE_HEARTBEAT_MS = 25_000;

function openSseStream(req: Request, res: Response): void {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering
  res.flushHeaders?.();
  res.write(': connected\n\n');

  // Some axios proxies require an immediate payload.
  req.socket.setKeepAlive(true);
  req.socket.setNoDelay(true);
}

function writeSseEvent(res: Response, event: VideoEvent): void {
  res.write(`event: video.${event.status.toLowerCase()}\n`);
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

export async function streamUserEvents(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;

  openSseStream(req, res);

  const unsubscribe = await subscribeToChannels(
    [userChannel(userId)],
    (event) => {
      if (event.userId !== userId) return;
      writeSseEvent(res, event);
    },
  );

  const heartbeat = setInterval(() => {
    res.write(`: ping ${Date.now()}\n\n`);
  }, SSE_HEARTBEAT_MS);

  const cleanup = async () => {
    clearInterval(heartbeat);
    await unsubscribe().catch(() => {});
  };

  req.on('close', () => { cleanup(); });
  req.on('error', () => { cleanup(); });
}

export async function streamJobEvents(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const { jobId } = req.params;

  // Verify the job belongs to the user before opening the stream.
  const job = await db.query.videoJobs.findFirst({
    where: and(eq(videoJobs.id, jobId), eq(videoJobs.userId, userId)),
    columns: {
      id: true,
      status: true,
      outputUrl: true,
      thumbnailUrl: true,
      provider: true,
      errorMessage: true,
    },
  });

  if (!job) {
    res.status(404).json({ success: false, message: 'Video job not found' });
    return;
  }

  openSseStream(req, res);

  // Replay current state immediately so a late-subscribing client doesn't
  // wait for the next event.
  writeSseEvent(res, {
    jobId:        job.id,
    userId,
    status:       job.status as VideoEvent['status'],
    outputUrl:    job.outputUrl,
    thumbnailUrl: job.thumbnailUrl,
    provider:     job.provider,
    error:        job.errorMessage,
    ts:           Date.now(),
  });

  if (job.status === 'COMPLETED' || job.status === 'FAILED' || job.status === 'CANCELLED') {
    res.write('event: video.end\ndata: {}\n\n');
    res.end();
    return;
  }

  const unsubscribe = await subscribeToChannels(
    [jobChannel(jobId)],
    (event) => {
      writeSseEvent(res, event);
      if (event.status === 'COMPLETED' || event.status === 'FAILED' || event.status === 'CANCELLED') {
        res.write('event: video.end\ndata: {}\n\n');
        res.end();
      }
    },
  );

  const heartbeat = setInterval(() => {
    res.write(`: ping ${Date.now()}\n\n`);
  }, SSE_HEARTBEAT_MS);

  const cleanup = async () => {
    clearInterval(heartbeat);
    await unsubscribe().catch(() => {});
  };

  req.on('close', () => { cleanup(); });
  req.on('error', (err) => { logger.warn('SSE socket error', err); cleanup(); });
}