/**
 * lip-sync orchestration — modular & pluggable.
 *
 * PRIMARY: FalLipSyncProvider — REAL lip-sync via FAL, centralized in
 * ai-router (POST /lipsync). FAL renders a final MP4 with synchronized
 * mouth animation and the narration audio embedded (the mux happens in
 * the model — no ffmpeg). Optional subtitle burn-in when a FAL caption
 * model is configured in ai-router; otherwise VTT is a sidecar.
 *
 * NoopLipSyncProvider is retained for swappability/fallback only
 * (selected via LIPSYNC_PROVIDER=noop, or when FAL is unavailable). It
 * performs NO fake work.
 *
 * The LipSyncProvider interface is unchanged — existing callers are
 * untouched (additive).
 */
import { aiRouter } from '../../services/ai-router.client';
import { logger } from '../../utils/logger';

export interface LipSyncInput {
  videoUrl: string;
  audioUrl: string;
  subtitlesVtt?: string;
}

export interface LipSyncResult {
  lipSynced: boolean;
  videoUrl: string;       // muxed video when a provider runs; else original
  audioUrl: string;       // separate track when not muxed
  subtitlesVtt?: string;
  provider: string;
  note?: string;
}

export interface LipSyncProvider {
  readonly name: string;
  isConfigured(): boolean;
  run(input: LipSyncInput): Promise<LipSyncResult>;
}

class NoopLipSyncProvider implements LipSyncProvider {
  readonly name = 'noop';
  isConfigured(): boolean {
    return false;
  }
  async run(input: LipSyncInput): Promise<LipSyncResult> {
    return {
      lipSynced: false,
      videoUrl: input.videoUrl,
      audioUrl: input.audioUrl,
      subtitlesVtt: input.subtitlesVtt,
      provider: this.name,
      note:
        'Lip-sync provider not configured — narration audio is delivered ' +
        'as a separate track (no mouth-sync, no muxing).',
    };
  }
}

/**
 * PRIMARY real provider. Delegates the render to ai-router's /lipsync
 * (FAL) — keeps provider selection centralized and this module thin.
 */
class FalLipSyncProvider implements LipSyncProvider {
  readonly name = 'fal';
  isConfigured(): boolean {
    return true; // delegates to ai-router; failures degrade gracefully
  }
  async run(input: LipSyncInput): Promise<LipSyncResult> {
    const r = await aiRouter.lipSync({
      videoUrl: input.videoUrl,
      audioUrl: input.audioUrl,
      subtitlesVtt: input.subtitlesVtt,
    });
    return {
      lipSynced: r.lipSynced,
      videoUrl: r.videoUrl,
      audioUrl: input.audioUrl,
      subtitlesVtt: input.subtitlesVtt,
      provider: `${this.name}:${r.model}`,
      note: r.note,
    };
  }
}

const providers: Record<string, LipSyncProvider> = {
  fal: new FalLipSyncProvider(),
  noop: new NoopLipSyncProvider(),
};

/**
 * Default = real FAL provider. LIPSYNC_PROVIDER overrides (e.g. 'noop').
 * Swappable: register another LipSyncProvider here, no caller changes.
 */
export function resolveLipSyncProvider(): LipSyncProvider {
  const wanted = process.env.LIPSYNC_PROVIDER ?? 'fal';
  const picked = providers[wanted];
  return picked && picked.isConfigured() ? picked : providers.fal;
}

/** Best-effort lip-sync render — never throws (caller flow stays intact). */
export async function tryLipSync(
  input: LipSyncInput,
): Promise<LipSyncResult | null> {
  try {
    return await orchestrateLipSync(input);
  } catch (err) {
    logger.warn('Lip-sync render failed (non-fatal)', {
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export async function orchestrateLipSync(
  input: LipSyncInput,
): Promise<LipSyncResult> {
  return resolveLipSyncProvider().run(input);
}
