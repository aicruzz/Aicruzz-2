import { v4 as uuidv4 } from 'uuid';
import { and, asc, desc, eq, max, or, sql } from 'drizzle-orm';
import { db } from '../../config/database';
import {
  cartoonTemplates,
  cartoonScenes,
  cartoonJobs,
  customCharacters,
  generationJobsMetadata,
} from '../../db/schema';
import { aiRouter } from '../../services/ai-router.client';
import {
  resolveAssetUrl,
  createAsset,
  createCharacter,
} from '../assets/assets.service';
import {
  tryGenerateNarration,
  getCharacterVoiceAssetId,
} from '../voice/voice.service';
import { tryLipSync } from '../voice/lip-sync.service';
import { deductCredits, refundCredits } from '../wallet/wallet.service';
import { logActivity } from '../../services/activity.service';
import { AppError } from '../../middleware/error.middleware';
import { logger } from '../../utils/logger';
import {
  CLIENT_CARTOON_GENERATION_FAILED,
  CLIENT_JOB_SUBMIT_FAILED,
} from '../../constants/client-safe-messages';
import {
  getCartoonCredits,
  getCartoonCreditsByMode,
  resolveCartoonMode,
  buildModePrompt,
  MODE_TO_TYPE,
  type CartoonType,
  type JobStatus,
  type CreateTemplateInput,
  type UpdateTemplateInput,
  type CreateSceneInput,
  type UpdateSceneInput,
  type GenerateCartoonInput,
  type WebhookPayload,
  type SaveJobAsTemplateInput,
  type SaveJobAsCharacterInput,
  type SaveJobAsAssetInput,
} from './cartoon.types';

async function templateCounts(templateId: string) {
  const [scenes, jobs] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(cartoonScenes)
      .where(eq(cartoonScenes.templateId, templateId)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(cartoonJobs)
      .where(eq(cartoonJobs.templateId, templateId)),
  ]);
  return { scenes: scenes[0]?.n ?? 0, jobs: jobs[0]?.n ?? 0 };
}

async function loadTemplateWithCounts(templateId: string) {
  const tpl = await db.query.cartoonTemplates.findFirst({
    where: eq(cartoonTemplates.id, templateId),
    with: {
      scenes: {
        orderBy: (t, { asc: a }) => a(t.order),
        columns: {
          id: true,
          name: true,
          order: true,
          prompt: true,
          imageUrl: true,
          durationSecs: true,
          transition: true,
        },
      },
    },
  });
  if (!tpl) return null;
  const counts = await templateCounts(templateId);
  return { ...tpl, _count: counts };
}

// ─── TEMPLATES ────────────────────────────────────────────────

export async function createTemplate(userId: string, input: CreateTemplateInput) {
  const [tpl] = await db
    .insert(cartoonTemplates)
    .values({ userId, ...input })
    .returning();
  return (await loadTemplateWithCounts(tpl.id))!;
}

export async function getTemplate(templateId: string, userId: string) {
  const tpl = await db.query.cartoonTemplates.findFirst({
    where: and(
      eq(cartoonTemplates.id, templateId),
      or(eq(cartoonTemplates.userId, userId), eq(cartoonTemplates.isPublic, true)),
    ),
  });
  if (!tpl) throw new AppError('Template not found', 404);
  return (await loadTemplateWithCounts(tpl.id))!;
}

export async function listTemplates(userId: string, includePublic = true) {
  const whereExpr = includePublic
    ? or(eq(cartoonTemplates.userId, userId), eq(cartoonTemplates.isPublic, true))
    : eq(cartoonTemplates.userId, userId);

  const list = await db.query.cartoonTemplates.findMany({
    where: whereExpr,
    with: {
      scenes: {
        orderBy: (t, { asc: a }) => a(t.order),
        columns: {
          id: true,
          name: true,
          order: true,
          prompt: true,
          imageUrl: true,
          durationSecs: true,
          transition: true,
        },
      },
    },
    orderBy: (t, { desc: d }) => d(t.updatedAt),
  });

  // Attach counts for each.
  return Promise.all(
    list.map(async (tpl) => ({ ...tpl, _count: await templateCounts(tpl.id) })),
  );
}

export async function updateTemplate(
  templateId: string,
  userId: string,
  input: UpdateTemplateInput,
) {
  const tpl = await db.query.cartoonTemplates.findFirst({
    where: and(eq(cartoonTemplates.id, templateId), eq(cartoonTemplates.userId, userId)),
    columns: { id: true },
  });
  if (!tpl) throw new AppError('Template not found', 404);

  await db
    .update(cartoonTemplates)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(cartoonTemplates.id, templateId));

  return (await loadTemplateWithCounts(templateId))!;
}

export async function deleteTemplate(templateId: string, userId: string) {
  const tpl = await db.query.cartoonTemplates.findFirst({
    where: and(eq(cartoonTemplates.id, templateId), eq(cartoonTemplates.userId, userId)),
    columns: { id: true },
  });
  if (!tpl) throw new AppError('Template not found', 404);
  await db.delete(cartoonTemplates).where(eq(cartoonTemplates.id, templateId));
}

// ─── SCENES ───────────────────────────────────────────────────

export async function addScene(
  templateId: string,
  userId: string,
  input: CreateSceneInput,
) {
  const tpl = await db.query.cartoonTemplates.findFirst({
    where: and(eq(cartoonTemplates.id, templateId), eq(cartoonTemplates.userId, userId)),
    columns: { id: true },
  });
  if (!tpl) throw new AppError('Template not found', 404);

  const maxRow = await db
    .select({ max: max(cartoonScenes.order) })
    .from(cartoonScenes)
    .where(eq(cartoonScenes.templateId, templateId));
  const currentMax = maxRow[0]?.max ?? -1;
  const order = input.order ?? currentMax + 1;

  const [scene] = await db
    .insert(cartoonScenes)
    .values({ templateId, ...input, order })
    .returning();
  return scene;
}

export async function updateScene(
  sceneId: string,
  templateId: string,
  userId: string,
  input: UpdateSceneInput,
) {
  const scene = await db
    .select({ id: cartoonScenes.id })
    .from(cartoonScenes)
    .innerJoin(cartoonTemplates, eq(cartoonScenes.templateId, cartoonTemplates.id))
    .where(
      and(
        eq(cartoonScenes.id, sceneId),
        eq(cartoonScenes.templateId, templateId),
        eq(cartoonTemplates.userId, userId),
      ),
    )
    .limit(1);
  if (!scene[0]) throw new AppError('Scene not found', 404);

  const [updated] = await db
    .update(cartoonScenes)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(cartoonScenes.id, sceneId))
    .returning();
  return updated;
}

export async function deleteScene(sceneId: string, templateId: string, userId: string) {
  const scene = await db
    .select({ id: cartoonScenes.id })
    .from(cartoonScenes)
    .innerJoin(cartoonTemplates, eq(cartoonScenes.templateId, cartoonTemplates.id))
    .where(
      and(
        eq(cartoonScenes.id, sceneId),
        eq(cartoonScenes.templateId, templateId),
        eq(cartoonTemplates.userId, userId),
      ),
    )
    .limit(1);
  if (!scene[0]) throw new AppError('Scene not found', 404);
  await db.delete(cartoonScenes).where(eq(cartoonScenes.id, sceneId));
}

export async function reorderScenes(
  templateId: string,
  userId: string,
  orderedIds: string[],
) {
  const tpl = await db.query.cartoonTemplates.findFirst({
    where: and(eq(cartoonTemplates.id, templateId), eq(cartoonTemplates.userId, userId)),
    columns: { id: true },
  });
  if (!tpl) throw new AppError('Template not found', 404);

  await db.transaction(async (tx) => {
    for (let i = 0; i < orderedIds.length; i++) {
      await tx
        .update(cartoonScenes)
        .set({ order: i, updatedAt: new Date() })
        .where(
          and(eq(cartoonScenes.id, orderedIds[i]), eq(cartoonScenes.templateId, templateId)),
        );
    }
  });
}

// ─── GENERATE JOB ─────────────────────────────────────────────

export async function generateCartoon(userId: string, input: GenerateCartoonInput) {
  // Phase 2: resolve the app-layer mode and map it onto the EXISTING
  // cartoonType enum (no DB enum change). Backward compatible — a legacy
  // request with only `type` resolves to a sensible default mode.
  const mode = resolveCartoonMode(input);
  const dbType: CartoonType = MODE_TO_TYPE[mode];
  const creditsRequired = getCartoonCreditsByMode(mode, input.durationSecs);

  // Resolve a reusable custom character (owner-scoped) if referenced.
  let character: { baseImageUrl: string | null; stylePrompt: string | null } | undefined;
  if (input.characterId) {
    const row = await db.query.customCharacters.findFirst({
      where: and(
        eq(customCharacters.id, input.characterId),
        eq(customCharacters.userId, userId),
      ),
      columns: { baseImageUrl: true, stylePrompt: true },
    });
    if (!row) throw new AppError('Custom character not found', 404);
    character = row;
  }

  // Phase 3: resolve library asset ids → URLs (owner-scoped). Raw
  // *ImageUrl fields still win if provided (backward compatible).
  const faceUrl =
    input.characterImageUrl ?? (await resolveAssetUrl(userId, input.faceAssetId));
  const backgroundUrl =
    input.backgroundImageUrl ??
    (await resolveAssetUrl(userId, input.backgroundAssetId));
  const logoUrl =
    input.logoImageUrl ?? (await resolveAssetUrl(userId, input.logoAssetId));

  // Image-to-video source precedence: explicit upload → face (asset or
  // url) → saved character base image. Falls through to text→keyframe
  // (Phase 1 Option A) when none is supplied. ai-router contract carries
  // a single inputImageUrl; background/logo are recorded + described.
  const primaryImageUrl =
    input.inputImageUrl ?? faceUrl ?? character?.baseImageUrl ?? undefined;

  const deduction = await deductCredits({
    userId,
    credits: creditsRequired,
    module: 'CARTOON',
    description: `Cartoon: ${mode} (${input.durationSecs ?? 5}s)`,
    metadata: { mode, type: dbType },
  });

  const [job] = await db
    .insert(cartoonJobs)
    .values({
      userId,
      templateId: input.templateId,
      type: dbType,
      status: 'QUEUED',
      prompt: input.prompt,
      stylePrompt: input.stylePrompt,
      inputImageUrl: primaryImageUrl,
      inputVideoUrl: input.inputVideoUrl,
      durationSecs: input.durationSecs ?? 5,
      aspectRatio: input.aspectRatio ?? '16:9',
      animationStyle: input.animationStyle ?? 'cartoon',
      creditsCharged: creditsRequired,
    })
    .returning();

  // Persist the rich Phase 2 metadata in the new side table — keeps
  // cartoon_jobs / the enum untouched.
  await db.insert(generationJobsMetadata).values({
    jobId: job.id,
    userId,
    module: 'CARTOON',
    mode,
    characterId: input.characterId ?? null,
    assetRefs: {
      faceUrl: faceUrl ?? null,
      backgroundUrl: backgroundUrl ?? null,
      logoUrl: logoUrl ?? null,
      extraImageUrls: input.extraImageUrls ?? [],
      faceAssetId: input.faceAssetId ?? null,
      backgroundAssetId: input.backgroundAssetId ?? null,
      logoAssetId: input.logoAssetId ?? null,
    },
    voiceMode: input.voiceMode ?? 'NONE',
    voiceText: input.voiceText ?? null,
    voiceAssetId: input.voiceAssetId ?? null,
  });

  let finalPrompt = input.prompt ?? '';
  if (input.templateId) {
    const scenes = await db
      .select({ prompt: cartoonScenes.prompt, name: cartoonScenes.name })
      .from(cartoonScenes)
      .where(eq(cartoonScenes.templateId, input.templateId))
      .orderBy(asc(cartoonScenes.order));
    if (scenes.length > 0 && !finalPrompt) {
      finalPrompt = scenes
        .map((s, i) => `Scene ${i + 1} "${s.name}": ${s.prompt ?? ''}`)
        .filter((s) => s.includes(':'))
        .join('. ');
    }
  }

  // Describe auxiliary assets in the prompt (ai-router contract unchanged
  // — it only transports a single inputImageUrl).
  const assetHints = [
    backgroundUrl ? 'Use the provided background scene as the setting.' : '',
    logoUrl ? 'Feature the provided brand logo subtly in the scene.' : '',
    character ? 'Keep the recurring character on-model and consistent.' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const modePrompt =
    buildModePrompt(mode, {
      basePrompt: finalPrompt,
      stylePrompt: input.stylePrompt ?? character?.stylePrompt ?? undefined,
    }) + (assetHints ? ` ${assetHints}` : '');

  try {
    const routeResult = await aiRouter.route({
      userId,
      module: 'CARTOON',
      strategy: 'AUTO',
      prompt: modePrompt,
      inputImageUrl: primaryImageUrl,
      inputVideoUrl: input.inputVideoUrl,
      durationSeconds: input.durationSecs ?? 5,
      aspectRatio: input.aspectRatio ?? '16:9',
      qualityMode: 'STANDARD',
      jobId: job.id,
      webhookUrl: `${process.env.API_BASE_URL ?? 'http://localhost:4000'}/api/cartoon/webhook/${job.id}`,
    });

    const queueJobId =
      (routeResult.result.raw as { jobId?: string } | undefined)?.jobId ?? uuidv4();

    const [updated] = await db
      .update(cartoonJobs)
      .set({ queueJobId, startedAt: new Date(), updatedAt: new Date() })
      .where(eq(cartoonJobs.id, job.id))
      .returning();

    // Talking-cartoon narration (Phase 4) — best-effort & non-fatal.
    // Audio + subtitles are produced now and stored alongside the job;
    // they are delivered as separate tracks (lip-sync/mux is a modular
    // seam, no provider configured — see voice/lip-sync.service.ts).
    if (input.voiceMode && input.voiceMode !== 'NONE' && input.voiceText?.trim()) {
      const voiceAssetId =
        input.voiceAssetId ??
        (input.characterId
          ? await getCharacterVoiceAssetId(userId, input.characterId)
          : undefined);

      const narration = await tryGenerateNarration(userId, {
        text: input.voiceText,
        voiceAssetId,
      });

      if (narration) {
        await db
          .update(generationJobsMetadata)
          .set({
            extra: {
              voice: {
                audioUrl: narration.audioUrl,
                durationSeconds: narration.durationSeconds,
                voiceId: narration.voiceId ?? null,
                subtitlesVtt: narration.subtitlesVtt,
                // Real lip-sync render runs on video completion (webhook).
                lipSyncStatus: 'PENDING_VIDEO',
              },
            },
            updatedAt: new Date(),
          })
          .where(eq(generationJobsMetadata.jobId, job.id));
      }
    }

    await logActivity({
      userId,
      action: 'CARTOON_JOB_CREATED',
      module: 'CARTOON',
      details: { jobId: job.id, mode, type: dbType, creditsCharged: creditsRequired },
    });

    return updated;
  } catch (err) {
    logger.error('Cartoon job submission failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    await refundCredits({
      userId,
      credits: creditsRequired,
      module: 'CARTOON',
      description: 'Refund: cartoon generation submission failed',
      originalTransactionId: deduction.transactionId,
    });
    await db
      .update(cartoonJobs)
      .set({
        status: 'FAILED',
        errorMessage: CLIENT_JOB_SUBMIT_FAILED,
        creditRefunded: true,
        updatedAt: new Date(),
      })
      .where(eq(cartoonJobs.id, job.id));
    throw new AppError('Failed to submit cartoon job. Credits refunded.', 502);
  }
}

// ─── WEBHOOK ──────────────────────────────────────────────────

// Receives the already-normalized payload from the webhook controller
// (the controller derives routerStatus/output from the raw router body).
export async function handleWebhook(jobId: string, payload: WebhookPayload) {
  const job = await db.query.cartoonJobs.findFirst({
    where: eq(cartoonJobs.id, jobId),
    columns: {
      userId: true,
      type: true,
      durationSecs: true,
      creditsCharged: true,
      creditRefunded: true,
    },
  });
  if (!job) return;

  if (payload.routerStatus === 'COMPLETED') {
    // Mirror the Video Studio refund logic: if the provider generated a
    // shorter clip than the user requested and paid for, refund the delta.
    // Idempotent: once durationSecs is rewritten to the actual value a
    // duplicate webhook computes zero delta and refunds nothing.
    const actual = payload.actualDurationSeconds;
    let correctedDuration = job.durationSecs;
    let correctedCredits  = job.creditsCharged;

    if (typeof actual === 'number' && actual > 0 && actual < job.durationSecs) {
      const mode      = resolveCartoonMode({ type: job.type });
      const newCredits = getCartoonCreditsByMode(mode, actual);
      const delta      = parseFloat((job.creditsCharged - newCredits).toFixed(2));

      if (delta > 0 && !job.creditRefunded) {
        await refundCredits({
          userId:  job.userId,
          credits: delta,
          module:  'CARTOON',
          description: `Refund: cartoon generated ${actual}s of ${job.durationSecs}s requested`,
        });
      }

      correctedDuration = actual;
      correctedCredits  = newCredits;

      logger.info(
        `Cartoon job ${jobId}: provider produced ${actual}s (requested ${job.durationSecs}s) — refunded ${delta} credits`,
      );
    }

    await db
      .update(cartoonJobs)
      .set({
        status: 'COMPLETED',
        outputUrl:      payload.outputUrl,
        thumbnailUrl:   payload.thumbnailUrl,
        provider:       payload.provider,
        durationSecs:   correctedDuration,
        creditsCharged: correctedCredits,
        diagnostics:    payload.diagnostics ?? null,
        completedAt: new Date(),
        updatedAt:   new Date(),
      })
      .where(eq(cartoonJobs.id, jobId));

    // Phase 4.1: real talking-video render. If narration was produced,
    // lip-sync it onto the finished video → final merged MP4. Best-effort
    // & non-fatal: the plain video stays if lip-sync fails.
    if (payload.outputUrl) {
      const meta = await db.query.generationJobsMetadata.findFirst({
        where: eq(generationJobsMetadata.jobId, jobId),
        columns: { extra: true },
      });
      const voice = (meta?.extra as { voice?: {
        audioUrl?: string; subtitlesVtt?: string;
      } } | null)?.voice;

      if (voice?.audioUrl) {
        const synced = await tryLipSync({
          videoUrl: payload.outputUrl,
          audioUrl: voice.audioUrl,
          subtitlesVtt: voice.subtitlesVtt,
        });
        if (synced?.lipSynced && synced.videoUrl) {
          await db
            .update(cartoonJobs)
            .set({ outputUrl: synced.videoUrl, updatedAt: new Date() })
            .where(eq(cartoonJobs.id, jobId));
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
  } else if (payload.routerStatus === 'FAILED') {
    // Credit-safety invariant: cartoon pricing is provider-agnostic, so
    // provider substitution/failover never costs more than was originally
    // charged — the only credit movement here is a refund. We never charge
    // again and never create a negative balance.
    if (!job.creditRefunded) {
      await refundCredits({
        userId: job.userId,
        credits: job.creditsCharged,
        module: 'CARTOON',
        description: 'Refund: cartoon generation failed',
      });
    }
    logger.warn('Cartoon job failed (user message redacted)', {
      jobId,
      internalError: payload.error,
    });
    await db
      .update(cartoonJobs)
      .set({
        status: 'FAILED',
        errorMessage: CLIENT_CARTOON_GENERATION_FAILED,
        diagnostics: payload.diagnostics ?? null,
        creditRefunded: true,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(cartoonJobs.id, jobId));
  }
  // QUEUED / PROCESSING → no-op; wait for next webhook ping
}

// ─── JOB STATUS POLL ─────────────────────────────────────────

export async function getJobStatus(jobId: string, userId: string) {
  const job = await db.query.cartoonJobs.findFirst({
    where: and(eq(cartoonJobs.id, jobId), eq(cartoonJobs.userId, userId)),
  });
  if (!job) throw new AppError('Job not found', 404);

  let current = job;
  if ((job.status === 'QUEUED' || job.status === 'PROCESSING') && job.queueJobId) {
    try {
      const routerStatus = await aiRouter.getJobStatus(job.queueJobId);
      if (routerStatus.status === 'COMPLETED' && routerStatus.result?.result) {
        const r = routerStatus.result.result;
        const [updated] = await db
          .update(cartoonJobs)
          .set({
            status: 'COMPLETED',
            outputUrl: r.outputUrl,
            thumbnailUrl: r.thumbnailUrl,
            provider: r.provider,
            completedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(cartoonJobs.id, jobId))
          .returning();
        current = updated;

        // Mirror the webhook talking-video render: if narration exists, lip-sync
        // it onto the finished video → final merged MP4 with audio embedded.
        // Without this, a cartoon completed via polling (no webhook) stays silent.
        if (r.outputUrl) {
          const meta = await db.query.generationJobsMetadata.findFirst({
            where: eq(generationJobsMetadata.jobId, jobId),
            columns: { extra: true },
          });
          const voice = (meta?.extra as { voice?: {
            audioUrl?: string; subtitlesVtt?: string;
          } } | null)?.voice;

          if (voice?.audioUrl) {
            const synced = await tryLipSync({
              videoUrl: r.outputUrl,
              audioUrl: voice.audioUrl,
              subtitlesVtt: voice.subtitlesVtt,
            });
            if (synced?.lipSynced && synced.videoUrl) {
              await db
                .update(cartoonJobs)
                .set({ outputUrl: synced.videoUrl, updatedAt: new Date() })
                .where(eq(cartoonJobs.id, jobId));
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
              current = { ...current, outputUrl: synced.videoUrl };
            }
          }
        }
      }
    } catch {
      /* router unreachable */
    }
  }

  // Attach the narration track so the talking-video player can play audio
  // in sync when it is delivered as a SEPARATE track (lip-sync not muxed).
  const voiceMeta = await db.query.generationJobsMetadata.findFirst({
    where: eq(generationJobsMetadata.jobId, jobId),
    columns: { extra: true },
  });
  const voice = (voiceMeta?.extra as { voice?: {
    audioUrl?: string; subtitlesVtt?: string; lipSyncStatus?: string;
  } } | null)?.voice;

  return {
    ...current,
    voice: voice
      ? {
          audioUrl: voice.audioUrl ?? null,
          subtitlesVtt: voice.subtitlesVtt ?? null,
          lipSyncStatus: voice.lipSyncStatus ?? null,
        }
      : null,
  };
}

// ─── LIST JOBS ────────────────────────────────────────────────

export async function listJobs(
  userId: string,
  page = 1,
  limit = 20,
  status?: JobStatus,
  type?: CartoonType,
) {
  const conditions = [eq(cartoonJobs.userId, userId)];
  if (status) conditions.push(eq(cartoonJobs.status, status));
  if (type) conditions.push(eq(cartoonJobs.type, type));
  const whereExpr = and(...conditions);

  const [jobs, totalRows] = await Promise.all([
    db
      .select()
      .from(cartoonJobs)
      .where(whereExpr)
      .orderBy(desc(cartoonJobs.createdAt))
      .limit(limit)
      .offset((page - 1) * limit),
    db.select({ count: sql<number>`count(*)::int` }).from(cartoonJobs).where(whereExpr),
  ]);
  const total = totalRows[0]?.count ?? 0;
  return { jobs, total, totalPages: Math.ceil(total / limit) };
}

// ─── CANCEL JOB ───────────────────────────────────────────────

export async function cancelJob(jobId: string, userId: string) {
  const job = await db.query.cartoonJobs.findFirst({
    where: and(eq(cartoonJobs.id, jobId), eq(cartoonJobs.userId, userId)),
    columns: { status: true, creditsCharged: true, creditRefunded: true },
  });
  if (!job) throw new AppError('Job not found', 404);
  if (job.status === 'COMPLETED') throw new AppError('Cannot cancel completed job', 400);
  if (job.status === 'CANCELLED') throw new AppError('Already cancelled', 400);

  if (!job.creditRefunded) {
    await refundCredits({
      userId,
      credits: job.creditsCharged,
      module: 'CARTOON',
      description: 'Refund: cartoon job cancelled',
    });
  }
  await db
    .update(cartoonJobs)
    .set({
      status: 'CANCELLED',
      creditRefunded: true,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(cartoonJobs.id, jobId));
}

// ─── ESTIMATE ─────────────────────────────────────────────────

export function estimateCredits(type: CartoonType, durationSecs?: number): number {
  return getCartoonCredits(type, durationSecs);
}

// ─── PHASE 3: SAVE-AS WORKFLOWS (reuse Phase 2 tables/services) ──

async function loadOwnedJob(jobId: string, userId: string) {
  const job = await db.query.cartoonJobs.findFirst({
    where: and(eq(cartoonJobs.id, jobId), eq(cartoonJobs.userId, userId)),
  });
  if (!job) throw new AppError('Job not found', 404);
  return job;
}

/**
 * Promote a generated job into a reusable cartoonTemplate (+ one seed
 * scene). Reuses the existing template/scene tables — no schema change.
 */
export async function saveJobAsTemplate(
  userId: string,
  jobId: string,
  input: SaveJobAsTemplateInput,
) {
  const job = await loadOwnedJob(jobId, userId);

  const [tpl] = await db
    .insert(cartoonTemplates)
    .values({
      userId,
      name: input.name,
      description: input.description,
      type: job.type,
      isPublic: input.isPublic ?? false,
      thumbnailUrl: job.thumbnailUrl ?? job.outputUrl ?? null,
    })
    .returning();

  await db.insert(cartoonScenes).values({
    templateId: tpl.id,
    name: 'Scene 1',
    order: 0,
    prompt: job.prompt,
    imageUrl: job.outputUrl ?? job.inputImageUrl ?? null,
    durationSecs: job.durationSecs,
  });

  return (await loadTemplateWithCounts(tpl.id))!;
}

/** Save a job's result as a reusable custom character. */
export async function saveJobAsCharacter(
  userId: string,
  jobId: string,
  input: SaveJobAsCharacterInput,
) {
  const job = await loadOwnedJob(jobId, userId);
  const baseImageUrl = job.outputUrl ?? job.inputImageUrl ?? undefined;
  if (!baseImageUrl) {
    throw new AppError('Job has no image/output to save as a character', 400);
  }
  return createCharacter(userId, {
    name: input.name,
    description: input.description,
    baseImageUrl,
    stylePrompt: input.stylePrompt ?? job.stylePrompt ?? undefined,
    thumbnailUrl: job.thumbnailUrl ?? baseImageUrl,
  });
}

/** Save a job's output into the reusable asset library. */
export async function saveJobOutputAsAsset(
  userId: string,
  jobId: string,
  input: SaveJobAsAssetInput,
) {
  const job = await loadOwnedJob(jobId, userId);
  const url = job.outputUrl ?? job.inputImageUrl;
  if (!url) {
    throw new AppError('Job has no output to save as an asset', 400);
  }
  return createAsset(userId, {
    type: input.type ?? 'SCENE',
    name: input.name,
    url,
    thumbnailUrl: job.thumbnailUrl ?? undefined,
    meta: { fromJobId: jobId, module: 'CARTOON' },
  });
}
