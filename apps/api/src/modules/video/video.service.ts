import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../../config/database';
import { videoJobs, generationJobsMetadata } from '../../db/schema';
import { aiRouter } from '../../services/ai-router.client';
import { tryGenerateNarration } from '../voice/voice.service';
import { tryLipSync } from '../voice/lip-sync.service';
import { deductCredits, refundCredits } from '../wallet/wallet.service';
import type { RouteResponse, RoutingStrategy } from '../../types/index';
import { logActivity } from '../../services/activity.service';
import { AppError } from '../../middleware/error.middleware';
import { logger } from '../../utils/logger';
import {
  CLIENT_JOB_SUBMIT_FAILED,
  CLIENT_VIDEO_GENERATION_FAILED,
} from '../../constants/client-safe-messages';
import {
  calculateVideoCredits,
  type CreateVideoJobInput,
  type VideoJobDto,
  type JobStatus,
  type RecoveryDiagnostics,
} from './video.types';
import {
  publishVideoEvent,
  type VideoEvent,
  type VideoEventStage,
  type VideoEventStatus,
} from './video.events';
import {
  planVideoGeneration,
  buildVariationPrompt,
  buildContinuityDirective,
  type VideoMode,
} from './video-agent';
import {
  createLedger,
  finalizeLedger,
  releaseLedger,
  attemptsFromDiagnostics,
} from './video-ledger';
import {
  getJobForContinuation,
  selectContinuationFrame,
} from './continuation';

export interface WebhookPayload {
  success:       boolean;
  routerStatus:  'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  outputUrl?:    string;
  thumbnailUrl?: string;
  provider?:     string;
  // Actual clip length the provider generated (clamped to a supported value);
  // used to correct stored duration + refund the billing delta.
  actualDurationSeconds?: number;
  error?:        string;
  // Internal-only recovery/failover diagnostics (persisted, not user-facing).
  diagnostics?:  RecoveryDiagnostics | null;
}

async function emit(event: Omit<VideoEvent, 'ts'>): Promise<void> {
  try {
    await publishVideoEvent({ ...event, ts: Date.now() });
  } catch (err) {
    logger.warn(`Failed to publish video event for job ${event.jobId}`, err);
  }
}

/** Pixel dimensions for Runway / Pika aspect ratio and the GPU worker. */
function videoResolutionToPixels(
  resolution: CreateVideoJobInput['resolution'],
): { width: number; height: number } {
  switch (resolution) {
    case 'SD_480P':
      return { width: 854, height: 480 };
    case 'HD_720P':
      return { width: 1280, height: 720 };
    case 'FHD_1080P':
      return { width: 1920, height: 1080 };
    default:
      return { width: 1280, height: 720 };
  }
}

// ─── CREATE JOB ───────────────────────────────────────────────

export async function createVideoJob(
  userId: string,
  input: CreateVideoJobInput,
): Promise<VideoJobDto> {
  // 0. Resolve the mode and, for "Continue editing", the best representative
  // frame of the previous project (frame-based continuation — providers don't
  // do video-to-video yet, but the agent routes by capability so a future v2v
  // provider would be used automatically).
  let inputImageUrl = input.inputImageUrl;
  const parentJobId = input.parentJobId ?? null;
  let mode: VideoMode = inputImageUrl ? 'IMAGE_TO_VIDEO' : 'TEXT_TO_VIDEO';
  let continuity = '';
  if (parentJobId) {
    const parent = await getJobForContinuation(userId, parentJobId);
    if (parent) {
      const frame = selectContinuationFrame(parent);
      if (frame) {
        inputImageUrl = frame;
        mode = 'CONTINUATION';
      }
      // Creative project memory: carry the established look forward so this
      // shot feels like part of the same series (unless the user changes it).
      const parentPlan = (
        parent.agentMeta as
          | {
              plan?: {
                style?: string;
                mood?: string;
                palette?: string;
                camera?: string;
                lighting?: string;
              };
            }
          | null
      )?.plan;
      continuity = buildContinuityDirective(parentPlan ?? null);
    }
  }

  // 1. Intentional variation direction (server-side prompt engineering).
  const conceptPrompt =
    typeof input.variationIndex === 'number'
      ? buildVariationPrompt(input.prompt, input.variationIndex)
      : input.prompt;

  // 2. Video Agent — plan + engineer the cinematic prompt, weaving in any
  // creative-continuity from the project. Provider-agnostic; the router selects
  // the actual provider by capability + health + learned success.
  const { prompt: engineeredPrompt, plan, op } = await planVideoGeneration(
    conceptPrompt,
    mode,
    { continuity },
  );

  // 3. Pricing depends ONLY on quality (provider-independent). Reserve up-front;
  // the execution ledger records the lifecycle for fair settlement / refunds.
  const creditsRequired = calculateVideoCredits(
    input.durationSeconds,
    input.resolution,
    input.qualityMode,
  );

  const deduction = await deductCredits({
    userId,
    credits: creditsRequired,
    module: 'VIDEO',
    description: `Video generation: ${input.durationSeconds}s ${input.resolution} ${input.qualityMode}`,
    metadata: {
      durationSeconds: input.durationSeconds,
      resolution: input.resolution,
      qualityMode: input.qualityMode,
      mode,
    },
  });
  const ledger = createLedger(creditsRequired, deduction.transactionId);

  const queueJobId = uuidv4();

  const [job] = await db
    .insert(videoJobs)
    .values({
      userId,
      status: 'QUEUED',
      prompt: input.prompt,
      inputImageUrl,
      inputVideoUrl: input.inputVideoUrl,
      voiceEnabled: input.voiceEnabled,
      durationSeconds: input.durationSeconds,
      resolution: input.resolution,
      qualityMode: input.qualityMode,
      creditsCharged: creditsRequired,
      queueJobId,
      startedAt: new Date(),
      revisedPrompt: engineeredPrompt,
      parentJobId,
      variationIndex: input.variationIndex ?? null,
      agentMeta: { mode, category: plan.category, op, plan, ledger },
    })
    .returning();

  const routingStrategy: RoutingStrategy =
    input.qualityMode === 'ULTRA' || input.qualityMode === 'HIGH' ? 'QUALITY' : 'AUTO';

  const { width, height } = videoResolutionToPixels(input.resolution);

  try {
    await aiRouter.route({
      userId,
      module: 'VIDEO',
      strategy: routingStrategy,
      // The Video Agent's engineered, cinematic prompt — never the raw prompt.
      prompt: engineeredPrompt,
      negativePrompt: input.negativePrompt,
      inputImageUrl,
      inputVideoUrl: input.inputVideoUrl,
      durationSeconds: input.durationSeconds,
      resolution: input.resolution,
      qualityMode: input.qualityMode,
      width,
      height,
      fps: input.fps ?? 24,
      jobId: queueJobId,
      webhookUrl: `${process.env.API_BASE_URL ?? 'http://localhost:4000'}/api/video/webhook/${job.id}`,
    });

    await logActivity({
      userId,
      action: 'VIDEO_JOB_CREATED',
      module: 'VIDEO',
      details: { jobId: job.id, creditsCharged: creditsRequired, strategy: routingStrategy },
    });

    // Talking-video narration — reuses the cartoon narration pipeline. Audio
    // is produced now and stored alongside the job; the real lip-sync/mux
    // runs on completion (webhook/poll). Best-effort & fully non-fatal: a
    // failure here must never fail or refund the already-queued video job.
    if (input.voiceEnabled && input.voiceText?.trim()) {
      try {
        const narration = await tryGenerateNarration(userId, {
          text: input.voiceText,
          gender: input.voiceGender,
        });
        if (narration) {
          await db.insert(generationJobsMetadata).values({
            jobId: job.id,
            userId,
            module: 'VIDEO',
            mode: 'VIDEO',
            voiceMode: 'AI',
            voiceText: input.voiceText,
            extra: {
              voice: {
                audioUrl: narration.audioUrl,
                durationSeconds: narration.durationSeconds,
                voiceId: narration.voiceId ?? null,
                subtitlesVtt: narration.subtitlesVtt,
                lipSyncStatus: 'PENDING_VIDEO',
              },
            },
          });
        }
      } catch (err) {
        logger.warn(`Video job ${job.id}: narration generation failed (non-fatal)`, {
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    await emit({
      jobId: job.id,
      userId,
      status: 'QUEUED',
      stage: 'queued',
      progress: 0,
      message: 'Queued for generation',
    });

    return job as unknown as VideoJobDto;
  } catch (err) {
    // Release the reservation (full refund) and settle the ledger.
    await refundCredits({
      userId,
      credits: creditsRequired,
      module: 'VIDEO',
      description: 'Refund: video job submission failed',
      originalTransactionId: deduction.transactionId,
    });

    await db
      .update(videoJobs)
      .set({
        status: 'FAILED',
        errorMessage: CLIENT_JOB_SUBMIT_FAILED,
        creditRefunded: true,
        agentMeta: {
          mode,
          category: plan.category,
          op,
          plan,
          ledger: releaseLedger(ledger, creditsRequired),
        },
        updatedAt: new Date(),
      })
      .where(eq(videoJobs.id, job.id));

    throw new AppError('Failed to submit video generation job. Credits refunded.', 502);
  }
}

/**
 * Lightweight output validation — beyond "a URL exists". Confirms the rendered
 * video is actually reachable and looks like a real video payload (not a 404,
 * an error page, or a suspiciously tiny/empty file). Deliberately conservative:
 * it only returns FALSE on a DEFINITIVE problem; anything inconclusive (HEAD
 * blocked, transient network) returns TRUE so a valid video is never rejected.
 * (Deep frame analysis — black/frozen/motion — needs media decoding and is out
 * of scope for this stateless check.)
 */
async function validateVideoOutput(url: string): Promise<boolean> {
  try {
    const res = await axios.head(url, {
      timeout: 8000,
      validateStatus: () => true,
    });
    if (res.status >= 400) return false; // definitively broken (404/5xx)
    const len = Number(res.headers['content-length'] ?? '0');
    const type = String(res.headers['content-type'] ?? '');
    if (len > 0 && len < 1024) return false; // empty/corrupt clip
    if (type && !type.startsWith('video/') && type !== 'application/octet-stream') {
      return false; // not a video payload (e.g. an HTML error page)
    }
    return true;
  } catch {
    return true; // inconclusive — never reject a possibly-valid video
  }
}

/**
 * Atomically claim a terminal transition for a job. Flips status to `to` ONLY
 * if the job is still non-terminal (QUEUED/PROCESSING), in a single SQL
 * statement. Returns true if THIS call won the transition (so it should perform
 * the one-time side effects: refunds, lip-sync, final write), false if the job
 * was already finalized by a concurrent webhook / poll / cancel.
 *
 * This is the concurrency guard that makes finalization (and therefore every
 * credit refund) EXACTLY-ONCE under retried webhooks and racing status polls —
 * replacing the previous read-then-write `creditRefunded` check (a TOCTOU race
 * that could double-refund or double-run the lip-sync at scale).
 */
async function claimTerminalTransition(
  jobId: string,
  to: 'COMPLETED' | 'FAILED',
): Promise<boolean> {
  const rows = await db
    .update(videoJobs)
    .set({ status: to, updatedAt: new Date() })
    .where(
      and(
        eq(videoJobs.id, jobId),
        inArray(videoJobs.status, ['QUEUED', 'PROCESSING']),
      ),
    )
    .returning({ id: videoJobs.id });
  return rows.length > 0;
}

// ─── WEBHOOK (called by AI router on job completion) ──────────

export async function handleJobWebhook(
  jobId: string,
  result: WebhookPayload,
): Promise<void> {
  const job = await db.query.videoJobs.findFirst({
    where: eq(videoJobs.id, jobId),
    columns: {
      id: true,
      userId: true,
      creditsCharged: true,
      creditRefunded: true,
      durationSeconds: true,
      resolution: true,
      qualityMode: true,
      agentMeta: true,
    },
  });

  if (!job) {
    logger.warn(`Video webhook received for unknown job: ${jobId}`);
    return;
  }

  // Router fires on every status change — only act on terminal states
  if (result.routerStatus === 'QUEUED' || result.routerStatus === 'PROCESSING') {
    logger.info(`Video job ${jobId} status update: ${result.routerStatus} — waiting for completion`);

    await db
      .update(videoJobs)
      .set({ status: result.routerStatus, updatedAt: new Date() })
      .where(eq(videoJobs.id, jobId));

    await emit({
      jobId,
      userId: job.userId,
      status: result.routerStatus,
      stage: result.routerStatus === 'QUEUED' ? 'queued' : 'generating',
      progress: result.routerStatus === 'QUEUED' ? 5 : 10,
      message:
        result.routerStatus === 'QUEUED'
          ? 'Waiting for an available GPU'
          : 'Worker picked up the job',
    });

    return;
  }

  // Output validation: a "completed success" with no usable / unreachable /
  // corrupt video is a real failure — fall through to the refund path so the
  // user is never charged for, or shown, a non-deliverable result.
  const outUrl = result.outputUrl?.trim();
  let hasUsableOutput = !!outUrl;
  if (result.routerStatus === 'COMPLETED' && result.success && outUrl) {
    hasUsableOutput = await validateVideoOutput(outUrl);
    if (!hasUsableOutput) {
      logger.warn(
        `Video job ${jobId}: output failed validation — treating as failure (refund)`,
      );
    }
  }

  if (result.routerStatus === 'COMPLETED' && result.success && hasUsableOutput) {
    // Atomically claim the completion. If a concurrent webhook/poll already
    // finalized this job, bail out — guarantees the delta refund + lip-sync
    // (an external, paid call) run EXACTLY ONCE.
    if (!(await claimTerminalTransition(jobId, 'COMPLETED'))) {
      logger.info(`Video job ${jobId}: completion already finalized — skipping`);
      return;
    }

    // The video models only produce fixed clip lengths (Pika 5s, Runway
    // 5s/10s). If the provider generated a shorter clip than the user asked
    // and paid for, correct the stored duration and refund the difference.
    const actual = result.actualDurationSeconds;
    let correctedDuration = job.durationSeconds;
    let correctedCredits = job.creditsCharged;
    let refundedDelta = 0;

    if (
      typeof actual === 'number' &&
      actual > 0 &&
      actual < job.durationSeconds
    ) {
      const newCredits = calculateVideoCredits(
        actual,
        job.resolution,
        job.qualityMode,
      );
      const delta = parseFloat(
        (job.creditsCharged - newCredits).toFixed(2),
      );

      if (delta > 0 && !job.creditRefunded) {
        await refundCredits({
          userId: job.userId,
          credits: delta,
          module: 'VIDEO',
          description: `Refund: video generated ${actual}s of ${job.durationSeconds}s requested`,
        });
        refundedDelta = delta;
      }

      correctedDuration = actual;
      correctedCredits = newCredits;

      logger.info(
        `Video job ${jobId}: provider produced ${actual}s (requested ${job.durationSeconds}s) — refunded ${delta} credits`,
      );
    }

    // Settle the execution ledger (finalize): record actual cost + any refund.
    const finalizedMeta = {
      ...((job.agentMeta ?? {}) as Record<string, unknown>),
      ledger: finalizeLedger((job.agentMeta as { ledger?: never })?.ledger, {
        finalCredits: correctedCredits,
        refundedCredits: refundedDelta,
        attempts: attemptsFromDiagnostics(result.diagnostics),
      }),
    };

    // Talking-video render: if narration was produced at create time, lip-sync
    // it onto the finished (silent) clip → final merged MP4 with audio embedded.
    // Reuses the cartoon lip-sync/mux service; best-effort & non-fatal (the
    // plain video stays if narration is absent or the mux fails). Runs BEFORE
    // the DB write + SSE emit so the completed event carries the muxed URL.
    let finalOutputUrl = result.outputUrl ?? null;
    if (result.outputUrl) {
      const meta = await db.query.generationJobsMetadata.findFirst({
        where: eq(generationJobsMetadata.jobId, jobId),
        columns: { extra: true },
      });
      const voice = (meta?.extra as { voice?: {
        audioUrl?: string; subtitlesVtt?: string;
      } } | null)?.voice;

      if (voice?.audioUrl) {
        const synced = await tryLipSync({
          videoUrl: result.outputUrl,
          audioUrl: voice.audioUrl,
          subtitlesVtt: voice.subtitlesVtt,
        });
        if (synced?.lipSynced && synced.videoUrl) {
          finalOutputUrl = synced.videoUrl;
          await db
            .update(generationJobsMetadata)
            .set({
              extra: {
                voice: {
                  ...voice,
                  finalVideoUrl: synced.videoUrl,
                  lipSyncStatus: 'RENDERED',
                  lipSyncProvider: synced.provider,
                  lipSyncNote: synced.note ?? null,
                },
              },
              updatedAt: new Date(),
            })
            .where(eq(generationJobsMetadata.jobId, jobId));
        }
      }
    }

    await db
      .update(videoJobs)
      .set({
        status: 'COMPLETED',
        outputUrl: finalOutputUrl,
        thumbnailUrl: result.thumbnailUrl ?? null,
        provider: result.provider ?? null,
        durationSeconds: correctedDuration,
        creditsCharged: correctedCredits,
        diagnostics: result.diagnostics ?? null,
        agentMeta: finalizedMeta,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(videoJobs.id, jobId));

    await emit({
      jobId,
      userId: job.userId,
      status: 'COMPLETED',
      stage: 'completed',
      progress: 100,
      message: 'Generation complete',
      outputUrl: finalOutputUrl,
      thumbnailUrl: result.thumbnailUrl ?? null,
      provider: result.provider ?? null,
    });

    logger.info(`Video job ${jobId} completed via ${result.provider ?? 'unknown provider'}`);

    if (!result.outputUrl) {
      logger.warn(`Video job ${jobId} COMPLETED but outputUrl is missing — check router payload`);
    }

    return;
  }

  // FAILED or success=false.
  // Atomically claim the failure transition; if a concurrent call already
  // finalized the job (completed or failed), bail out so the refund is
  // EXACTLY-ONCE. Replaces the previous read-then-write creditRefunded check.
  if (!(await claimTerminalTransition(jobId, 'FAILED'))) {
    logger.info(`Video job ${jobId}: already finalized — skipping failure refund`);
    return;
  }

  // Credit-safety invariant: video pricing is provider-agnostic
  // (calculateVideoCredits depends only on duration/resolution/quality), so
  // provider substitution/failover never costs more than was originally
  // charged — the only credit movement is a refund. We never charge again here
  // and never create a negative balance.
  if (!job.creditRefunded) {
    await refundCredits({
      userId: job.userId,
      credits: job.creditsCharged,
      module: 'VIDEO',
      description: 'Refund: video generation failed',
    });
  }

  // Settle the execution ledger (release): full reservation refunded.
  const releasedMeta = {
    ...((job.agentMeta ?? {}) as Record<string, unknown>),
    ledger: releaseLedger(
      (job.agentMeta as { ledger?: never })?.ledger,
      job.creditsCharged,
      attemptsFromDiagnostics(result.diagnostics),
    ),
  };

  await db
    .update(videoJobs)
    .set({
      status: 'FAILED',
      errorMessage: CLIENT_VIDEO_GENERATION_FAILED,
      diagnostics: result.diagnostics ?? null,
      agentMeta: releasedMeta,
      creditRefunded: true,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(videoJobs.id, jobId));

  await emit({
    jobId,
    userId: job.userId,
    status: 'FAILED',
    error: CLIENT_VIDEO_GENERATION_FAILED,
    message: CLIENT_VIDEO_GENERATION_FAILED,
  });

  logger.warn(`Video job ${jobId} failed (user message redacted)`, {
    internalError: result.error,
  });
}

// ─── PROGRESS PASSTHROUGH (called by worker during pipeline) ───

const STAGE_DEFAULT_PROGRESS: Record<VideoEventStage, number> = {
  queued: 5,
  generating: 30,
  'post-processing': 65,
  encoding: 85,
  completed: 100,
};

const STAGE_LABEL: Record<VideoEventStage, string> = {
  queued: 'Waiting for an available GPU',
  generating: 'Generating frames',
  'post-processing': 'Smoothing motion',
  encoding: 'Encoding video',
  completed: 'Finalizing',
};

export async function handleProgressEvent(
  jobId: string,
  stage: VideoEventStage,
  progress?: number,
  message?: string,
): Promise<void> {
  const job = await db.query.videoJobs.findFirst({
    where: eq(videoJobs.id, jobId),
    columns: { id: true, userId: true, status: true },
  });

  if (!job) {
    logger.warn(`Progress event received for unknown job: ${jobId}`);
    return;
  }

  // Don't broadcast progress for jobs that have already terminated.
  if (job.status === 'COMPLETED' || job.status === 'FAILED' || job.status === 'CANCELLED') {
    return;
  }

  // Lazily flip QUEUED → PROCESSING the moment the worker starts generating.
  if (job.status === 'QUEUED' && stage !== 'queued') {
    await db
      .update(videoJobs)
      .set({ status: 'PROCESSING', updatedAt: new Date() })
      .where(eq(videoJobs.id, jobId));
  }

  const status: VideoEventStatus = stage === 'queued' ? 'QUEUED' : 'PROCESSING';

  await emit({
    jobId,
    userId: job.userId,
    status,
    stage,
    progress: progress ?? STAGE_DEFAULT_PROGRESS[stage],
    message: message ?? STAGE_LABEL[stage],
  });
}

// ─── POLL JOB STATUS (frontend polling) ──────────────────────

export async function getJobStatus(jobId: string, userId: string): Promise<VideoJobDto> {
  const job = await db.query.videoJobs.findFirst({
    where: and(eq(videoJobs.id, jobId), eq(videoJobs.userId, userId)),
  });

  if (!job) throw new AppError('Video job not found', 404);

  if (job.status === 'QUEUED' || job.status === 'PROCESSING') {
    if (job.queueJobId) {
      try {
        const routerStatus = await aiRouter.getJobStatus(job.queueJobId);

        if (routerStatus.status === 'COMPLETED' && routerStatus.result) {
          const r = routerStatus.result.result;
          const raw = (r.raw ?? {}) as Record<string, unknown>;
          await handleJobWebhook(jobId, {
            success: routerStatus.result.success,
            routerStatus: 'COMPLETED',
            outputUrl: (raw.output_url as string | undefined) ?? r.outputUrl,
            thumbnailUrl: (raw.thumbnail_url as string | undefined) ?? r.thumbnailUrl,
            provider: routerStatus.result.provider,
            diagnostics: (raw.diagnostics as RecoveryDiagnostics | undefined) ?? null,
          });
          const updated = await db.query.videoJobs.findFirst({
            where: and(eq(videoJobs.id, jobId), eq(videoJobs.userId, userId)),
          });
          return updated as unknown as VideoJobDto;
        }

        if (routerStatus.status === 'FAILED') {
          logger.warn('Video job polling: router reported FAILED', {
            jobId,
            internalReason: routerStatus.failedReason,
          });
          await handleJobWebhook(jobId, {
            success: false,
            routerStatus: 'FAILED',
          });
        }

        if (routerStatus.status === 'ACTIVE' || routerStatus.status === 'WAITING') {
          await db
            .update(videoJobs)
            .set({ status: 'PROCESSING', updatedAt: new Date() })
            .where(eq(videoJobs.id, jobId));
        }
      } catch {
        // Router unreachable — return current DB status
      }
    }
  }

  return job as unknown as VideoJobDto;
}

// ─── LIST USER JOBS ───────────────────────────────────────────

export async function listUserJobs(
  userId: string,
  page = 1,
  limit = 20,
  status?: JobStatus,
): Promise<{ jobs: VideoJobDto[]; total: number; totalPages: number }> {
  const whereExpr = status
    ? and(eq(videoJobs.userId, userId), eq(videoJobs.status, status))
    : eq(videoJobs.userId, userId);

  const [jobs, totalRows] = await Promise.all([
    db
      .select()
      .from(videoJobs)
      .where(whereExpr)
      .orderBy(desc(videoJobs.createdAt))
      .limit(limit)
      .offset((page - 1) * limit),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(videoJobs)
      .where(whereExpr),
  ]);

  const total = totalRows[0]?.count ?? 0;

  return {
    jobs: jobs as unknown as VideoJobDto[],
    total,
    totalPages: Math.ceil(total / limit),
  };
}

// ─── CANCEL JOB ───────────────────────────────────────────────

export async function cancelJob(jobId: string, userId: string): Promise<void> {
  const job = await db.query.videoJobs.findFirst({
    where: and(eq(videoJobs.id, jobId), eq(videoJobs.userId, userId)),
    columns: { status: true },
  });

  if (!job) throw new AppError('Job not found', 404);
  if (job.status === 'COMPLETED') throw new AppError('Cannot cancel a completed job', 400);
  if (job.status === 'CANCELLED') throw new AppError('Job already cancelled', 400);

  // Atomically claim the cancellation + refund in one statement: flip to
  // CANCELLED only if still non-terminal AND not already refunded. This wins-or-
  // loses cleanly against a webhook that may be finalizing the same job, so the
  // refund happens at most once (never double-refunds; never refunds a job that
  // completed in the meantime).
  const [claimed] = await db
    .update(videoJobs)
    .set({
      status: 'CANCELLED',
      creditRefunded: true,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(videoJobs.id, jobId),
        inArray(videoJobs.status, ['QUEUED', 'PROCESSING']),
        eq(videoJobs.creditRefunded, false),
      ),
    )
    .returning({ creditsCharged: videoJobs.creditsCharged });

  if (!claimed) {
    // A concurrent webhook finalized it first — nothing to refund here.
    logger.info(`Video job ${jobId}: cancel lost the race (already finalized)`);
    return;
  }

  await refundCredits({
    userId,
    credits: claimed.creditsCharged,
    module: 'VIDEO',
    description: 'Refund: video job cancelled by user',
  });

  await emit({
    jobId,
    userId,
    status: 'CANCELLED',
    message: 'Cancelled — credits refunded',
  });
}

// ─── ESTIMATE CREDITS (for UI preview) ───────────────────────

export function estimateCredits(
  durationSeconds: number,
  resolution: string,
  qualityMode: string,
): number {
  return calculateVideoCredits(
    durationSeconds,
    resolution as 'SD_480P' | 'HD_720P' | 'FHD_1080P',
    qualityMode as 'STANDARD' | 'HIGH' | 'ULTRA',
  );
}
