import axios from 'axios';
import { BaseProvider } from './base.provider';
import type { ProviderConfig, ProviderResult, RouteRequest } from '../types';
import { sleep, extract, firstOf } from './face-swap.util';

/**
 * HeyGenProvider — identity-preserving video face/head swap (VIDEO_FACE_SWAP).
 * ----------------------------------------------------------------------------
 * Submits a source video + target identity image to HeyGen, polls until the
 * render completes, and returns the output URL. Provider-agnostic from the
 * caller's perspective — the Video Changer UI never names it.
 *
 * Env-gated: `enabled` only when HEYGEN_API_KEY is set, so when no key is
 * configured the provider is skipped (the chain falls back to Tavus, and if
 * neither is enabled the job fails gracefully → the API refunds the user).
 *
 * Endpoints/field names are centralized as env-overridable constants so they
 * can be tuned to match the exact HeyGen contract WITHOUT code changes when the
 * API key is added.
 */
const BASE = process.env.HEYGEN_API_BASE ?? 'https://api.heygen.com';
const SUBMIT_PATH = process.env.HEYGEN_FACESWAP_PATH ?? '/v2/video/face_swap';
const STATUS_PATH = process.env.HEYGEN_STATUS_PATH ?? '/v1/video_status.get';
const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 8 * 60_000; // 8 min hard ceiling

export class HeyGenProvider extends BaseProvider {
  readonly id = 'HEYGEN' as const;

  readonly config: ProviderConfig = {
    id: 'HEYGEN',
    enabled: !!process.env.HEYGEN_API_KEY,
    costPerUnit: 10,
    speedScore: 6,
    qualityScore: 10,
    modules: ['VIDEO_FACE_SWAP'],
  };

  private get headers() {
    return {
      'X-Api-Key': process.env.HEYGEN_API_KEY ?? '',
      'Content-Type': 'application/json',
    };
  }

  async execute(request: RouteRequest): Promise<ProviderResult> {
    const start = Date.now();
    try {
      const sourceVideoUrl = request.inputVideoUrl;
      const targetImageUrl = request.targetImageUrl ?? request.inputImageUrl;
      if (!sourceVideoUrl) {
        throw new Error('VIDEO_FACE_SWAP requires a source video (inputVideoUrl)');
      }
      if (!targetImageUrl) {
        throw new Error('VIDEO_FACE_SWAP requires a target face image (targetImageUrl)');
      }

      // 1. Submit the face-swap job.
      const submit = await axios.post(
        `${BASE}${SUBMIT_PATH}`,
        {
          video_url: sourceVideoUrl,
          face_image_url: targetImageUrl,
          // Preserve the source audio + lip motion; the API layer adds optional
          // narration/lip-sync afterwards when the user chose a generated voice.
          keep_audio: true,
        },
        { headers: this.headers, timeout: 30_000 },
      );

      const jobId = firstOf(submit.data, [
        ['data', 'video_id'],
        ['data', 'id'],
        ['video_id'],
        ['id'],
      ]);
      if (!jobId) {
        throw new Error('HeyGen submit returned no job id');
      }

      // 2. Poll until completed.
      const deadline = Date.now() + POLL_TIMEOUT_MS;
      while (Date.now() < deadline) {
        await sleep(POLL_INTERVAL_MS);
        const statusRes = await axios.get(`${BASE}${STATUS_PATH}`, {
          headers: this.headers,
          params: { video_id: jobId },
          timeout: 15_000,
        });
        const status = String(
          extract(statusRes.data, ['data', 'status']) ??
            extract(statusRes.data, ['status']) ??
            '',
        ).toLowerCase();

        if (status === 'completed' || status === 'success' || status === 'done') {
          const outputUrl =
            extract(statusRes.data, ['data', 'video_url']) ??
            extract(statusRes.data, ['data', 'url']) ??
            extract(statusRes.data, ['video_url']);
          if (!outputUrl) throw new Error('HeyGen completed but returned no video url');
          return this.buildResult({
            latencyMs: Date.now() - start,
            outputUrl: outputUrl as string,
            thumbnailUrl:
              (extract(statusRes.data, ['data', 'thumbnail_url']) as string) ?? undefined,
            durationSeconds: request.durationSeconds,
            raw: { provider: 'heygen', jobId },
          });
        }
        if (status === 'failed' || status === 'error') {
          const reason =
            extract(statusRes.data, ['data', 'error']) ??
            extract(statusRes.data, ['error']) ??
            'unknown';
          throw new Error(`HeyGen render failed: ${String(reason)}`);
        }
        // pending/processing → keep polling
      }

      throw new Error('HeyGen render timed out');
    } catch (err) {
      return this.buildError(err, Date.now() - start);
    }
  }

  async ping(): Promise<boolean> {
    if (!this.config.enabled) return false;
    try {
      await axios.get(`${BASE}${STATUS_PATH}`, {
        headers: this.headers,
        params: { video_id: 'ping' },
        timeout: 5_000,
        validateStatus: () => true,
      });
      return true;
    } catch {
      return false;
    }
  }
}
