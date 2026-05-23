import { fal } from '@fal-ai/client';

/**
 * lipsync.service — REAL FAL lip-sync (centralized in ai-router).
 *
 * The FAL lip-sync model takes a video + an audio track and returns a
 * fully rendered MP4 with synchronized mouth animation AND the audio
 * embedded (this IS the audio/video mux — no separate ffmpeg step).
 *
 * Model ids are env-configurable so they can be corrected without code
 * changes (avoids endpoint-guess churn):
 *   FAL_LIPSYNC_MODEL   default: fal-ai/sync-lipsync
 *   FAL_SUBTITLE_MODEL  optional: a FAL caption/burn-in model. When unset,
 *                       subtitles are returned as a VTT sidecar (NOT burned
 *                       into pixels — honest: no fake burn-in).
 */

const LIPSYNC_MODEL = process.env.FAL_LIPSYNC_MODEL ?? 'fal-ai/sync-lipsync';
const SUBTITLE_MODEL = process.env.FAL_SUBTITLE_MODEL;

let configured = false;
function ensureFal(): void {
  if (configured) return;
  const credentials = process.env.FAL_KEY;
  if (!credentials) throw new Error('FAL_KEY is not set (lip-sync unavailable)');
  fal.config({ credentials });
  configured = true;
}

interface FalVideoOut {
  data?: { video?: { url?: string }; output?: { url?: string }; url?: string };
  video?: { url?: string };
  output?: { url?: string };
}

function pickUrl(r: FalVideoOut): string {
  return (
    r?.data?.video?.url ??
    r?.data?.output?.url ??
    r?.data?.url ??
    r?.video?.url ??
    r?.output?.url ??
    ''
  );
}

export interface LipSyncJobInput {
  videoUrl: string;
  audioUrl: string;
  subtitlesVtt?: string;
}

export interface LipSyncJobResult {
  videoUrl: string;        // final rendered MP4 (mouth-synced, audio embedded)
  lipSynced: boolean;
  subtitlesBurned: boolean;
  model: string;
  note?: string;
}

export async function runLipSync(
  input: LipSyncJobInput,
): Promise<LipSyncJobResult> {
  ensureFal();

  // 1. Real lip-sync + mux (FAL renders the merged MP4).
  const synced = (await fal.subscribe(LIPSYNC_MODEL, {
    input: {
      video_url: input.videoUrl,
      audio_url: input.audioUrl,
    } as never,
    logs: false,
  })) as FalVideoOut;

  let finalUrl = pickUrl(synced);
  if (!finalUrl) throw new Error('FAL lip-sync returned no video URL');

  // 2. Optional subtitle burn-in — only if a caption model is configured.
  let subtitlesBurned = false;
  if (SUBTITLE_MODEL && input.subtitlesVtt) {
    try {
      const captioned = (await fal.subscribe(SUBTITLE_MODEL, {
        input: {
          video_url: finalUrl,
          subtitles: input.subtitlesVtt,
        } as never,
        logs: false,
      })) as FalVideoOut;
      const burnedUrl = pickUrl(captioned);
      if (burnedUrl) {
        finalUrl = burnedUrl;
        subtitlesBurned = true;
      }
    } catch (err) {
      // Non-fatal: keep the synced video, subtitles stay a sidecar.
      console.warn(
        '[lipsync] subtitle burn-in failed:',
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  return {
    videoUrl: finalUrl,
    lipSynced: true,
    subtitlesBurned,
    model: LIPSYNC_MODEL,
    note: subtitlesBurned
      ? undefined
      : input.subtitlesVtt
        ? 'Subtitles delivered as VTT sidecar (no FAL_SUBTITLE_MODEL configured).'
        : undefined,
  };
}
