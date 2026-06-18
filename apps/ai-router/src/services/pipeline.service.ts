import { BaseProvider } from '../providers/base.provider';
import { FallbackService, emptyDiagnostics } from './fallback.service';
import type { FallbackOptions, FallbackOutcome } from './fallback.service';
import type { ProviderId, ProviderResult, RouteRequest } from '../types';
import { uploadKeyframe, isMediaStorageConfigured } from '../utils/media-storage';
import { recordVideoOutcome } from './video-learning';
import {
  aspectRatioFromDimensions,
  resolveOpenAIImageSize,
} from '../utils/openai-image-size';

/**
 * PipelineService — STRICT mode
 * ----------------------------------------------------------------------------
 * Centralized multi-step orchestration for VIDEO / CARTOON. One queued job =
 * one final video; callers, webhook contract and queue stay unchanged.
 *
 *   Option A — text only      : OpenAI gpt-image-1 keyframe → image-to-video
 *   Option B — image supplied : straight image-to-video
 *
 * Video-to-video (Option C) is intentionally NOT supported.
 *
 * STRICT mode (PIPELINE_MODE):
 *   - no silent fallback: if the keyframe step fails or cannot be hosted, the
 *     job fails immediately — it does NOT quietly degrade to text-to-video.
 *   - unsupported inputs (inputVideoUrl) hard-fail with a clear error.
 *   - every decision is logged with the [Pipeline:STRICT] tag.
 */

export const PIPELINE_MODE = 'STRICT' as const;

type PipelineMode = 'TEXT_TO_VIDEO' | 'IMAGE_TO_VIDEO';

interface PipelineStep {
  step: 'keyframe' | 'animate';
  provider: ProviderId;
  success: boolean;
}

function cinematicFilmStillPrompt(prompt: string | undefined): string {
  const subject = (prompt ?? '').trim();
  return (
    `Cinematic film still, single frame from a movie scene: ${subject}. ` +
    `Shot on 35mm film, anamorphic lens, shallow depth of field, ` +
    `natural volumetric lighting, rich filmic color grade, detailed textures, ` +
    `photorealistic, 16:9 widescreen composition, no text, no watermark, ` +
    `one coherent frame (not a collage or contact sheet).`
  );
}

function failure(
  provider: ProviderId,
  error: string,
  attempts: number,
): FallbackOutcome {
  return {
    result: { success: false, provider, latencyMs: 0, error },
    provider,
    attempts,
    fallbackUsed: false,
    lastError: error,
    diagnostics: {
      ...emptyDiagnostics(),
      providerErrorMessage: error,
    },
  };
}

export class PipelineService {
  constructor(
    private providers: Map<ProviderId, BaseProvider>,
    private fallback: FallbackService = new FallbackService(),
  ) {}

  async run(
    animateChain: BaseProvider[],
    request: RouteRequest,
    options: FallbackOptions = {},
  ): Promise<FallbackOutcome> {
    const steps: PipelineStep[] = [];
    let workingRequest: RouteRequest = { ...request };
    let keyframeUrl: string | undefined;

    // STRICT: video-to-video is unsupported — hard-fail, no fallback.
    if (request.inputVideoUrl) {
      const msg =
        'Video-to-video is not supported (PIPELINE_MODE=STRICT). ' +
        'Provide a text prompt or an input image instead.';
      console.error(`[Pipeline:${PIPELINE_MODE}] reject: ${msg}`);
      return failure('RUNWAY', msg, 0);
    }

    const mode: PipelineMode = request.inputImageUrl
      ? 'IMAGE_TO_VIDEO'
      : 'TEXT_TO_VIDEO';
    console.log(`[Pipeline:${PIPELINE_MODE}] mode=${mode} module=${request.module}`);

    // Option A: synthesize a cinematic keyframe, then animate it. STRICT: any
    // failure here is terminal — no silent text-to-video fallback.
    if (mode === 'TEXT_TO_VIDEO') {
      const openai = this.providers.get('OPENAI');
      if (!openai || !openai.isEnabled) {
        const msg =
          'Keyframe provider (OPENAI) unavailable; cannot generate keyframe ' +
          '(PIPELINE_MODE=STRICT — no fallback).';
        console.error(`[Pipeline:${PIPELINE_MODE}] ${msg}`);
        return failure('OPENAI', msg, 0);
      }

      // Keyframe size must be a gpt-image-1-supported size. Map the requested
      // video aspect ratio (explicit, else derived from width/height) to the
      // closest supported size. width/height are stripped *only* on this
      // keyframe sub-request so the provider cannot re-derive an invalid size;
      // workingRequest keeps them so Runway/Pika output resolution is unchanged.
      const keyframeAspect =
        request.aspectRatio ??
        aspectRatioFromDimensions(request.width, request.height);
      const keyframeSize = resolveOpenAIImageSize(keyframeAspect);

      const imgRes: ProviderResult = await openai.execute({
        ...request,
        module: 'IMAGE',
        prompt: cinematicFilmStillPrompt(request.prompt),
        size: keyframeSize,
        width: undefined,
        height: undefined,
      });
      options.onOutcome?.('OPENAI', imgRes.success);
      steps.push({ step: 'keyframe', provider: 'OPENAI', success: imgRes.success });

      if (!imgRes.success) {
        const msg = `Keyframe generation failed: ${imgRes.error ?? 'unknown error'}`;
        console.error(`[Pipeline:${PIPELINE_MODE}] ${msg}`);
        return failure('OPENAI', msg, 1);
      }

      let url = imgRes.outputUrl;
      if (!url && imgRes.b64Image) {
        // Graceful (no crash) but STRICT (job fails, no silent degradation)
        // when S3 keyframe hosting is not configured.
        if (!isMediaStorageConfigured()) {
          const msg =
            'Keyframe host (Cloudinary) not configured — set CLOUDINARY_* in ' +
            'ai-router env. PIPELINE_MODE=STRICT: failing without fallback.';
          console.error(`[Pipeline:${PIPELINE_MODE}] ${msg}`);
          return failure('OPENAI', msg, 1);
        }
        try {
          url = await uploadKeyframe(imgRes.b64Image);
        } catch (err) {
          const msg =
            'Keyframe host (Cloudinary) failed: ' +
            (err instanceof Error ? err.message : String(err));
          console.error(`[Pipeline:${PIPELINE_MODE}] ${msg}`);
          return failure('OPENAI', msg, 1);
        }
      }
      if (!url) {
        const msg = 'Keyframe produced no usable URL (PIPELINE_MODE=STRICT).';
        console.error(`[Pipeline:${PIPELINE_MODE}] ${msg}`);
        return failure('OPENAI', msg, 1);
      }

      keyframeUrl = url;
      workingRequest = { ...workingRequest, inputImageUrl: url };
      console.log(`[Pipeline:${PIPELINE_MODE}] keyframe ready → ${url}`);
    }

    // Hedged execution (config hook, disabled by default): for expensive
    // ULTRA requests with a low predicted success probability, a second
    // provider could be launched shortly after the first and the first valid
    // result wins (cancelling the slower run). This is the single, documented
    // extension point — set VIDEO_HEDGE_ENABLED=true and implement a concurrent
    // race here using `animateChain`. Kept OFF so behavior + cost are unchanged.
    const HEDGE_ENABLED = process.env.VIDEO_HEDGE_ENABLED === 'true';
    void HEDGE_ENABLED; // reserved — sequential fallback below is the default.

    // Exhaust the WHOLE provider chain (each provider + its retries) so a video
    // fails only when every supported provider has genuinely failed. With N
    // providers and 1 retry each, that's N*2 total attempts.
    const exhaustiveOptions: FallbackOptions = {
      ...options,
      maxAttempts: Math.max(
        options.maxAttempts ?? 0,
        animateChain.length * 2,
      ),
    };
    const outcome = await this.fallback.run(
      animateChain,
      workingRequest,
      exhaustiveOptions,
    );
    steps.push({
      step: 'animate',
      provider: outcome.provider,
      success: outcome.result.success,
    });

    // Feed the self-improving VIDEO learning signal: record the final render
    // outcome (provider, success, latency, retries) so provider ranking adapts.
    if (request.module === 'VIDEO') {
      recordVideoOutcome({
        provider: outcome.provider,
        success: outcome.result.success,
        latencyMs: outcome.result.latencyMs,
        retries: Math.max(0, (outcome.attempts ?? 1) - 1),
      });
    }
    console.log(
      `[Pipeline:${PIPELINE_MODE}] animate provider=${outcome.provider} ` +
        `success=${outcome.result.success}`,
    );

    // Augment raw additively — never strip provider's existing fields.
    const prevRaw =
      outcome.result.raw && typeof outcome.result.raw === 'object'
        ? (outcome.result.raw as Record<string, unknown>)
        : {};
    outcome.result.raw = {
      ...prevRaw,
      pipeline_mode: mode,
      pipeline_policy: PIPELINE_MODE,
      keyframe_url: keyframeUrl ?? null,
      steps,
    };

    return outcome;
  }
}
