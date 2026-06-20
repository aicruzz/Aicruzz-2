import axios from 'axios';
import { BaseProvider } from './base.provider';
import type { ProviderConfig, ProviderResult, RouteRequest } from '../types';
import { sleep, firstOf } from './face-swap.util';

/**
 * TavusProvider — fallback identity-preserving video face/head swap
 * (VIDEO_FACE_SWAP). Mirrors HeyGenProvider: submit source video + target
 * image, poll to completion, return the output URL. Env-gated by TAVUS_API_KEY;
 * skipped when no key is configured. Endpoints/fields are env-overridable so
 * the exact Tavus contract can be matched without code changes.
 */
const BASE = process.env.TAVUS_API_BASE ?? 'https://tavusapi.com';
const SUBMIT_PATH = process.env.TAVUS_FACESWAP_PATH ?? '/v2/videos';
const STATUS_PATH = process.env.TAVUS_STATUS_PATH ?? '/v2/videos';
const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 8 * 60_000;

export class TavusProvider extends BaseProvider {
  readonly id = 'TAVUS' as const;

  readonly config: ProviderConfig = {
    id: 'TAVUS',
    enabled: !!process.env.TAVUS_API_KEY,
    costPerUnit: 9,
    speedScore: 6,
    qualityScore: 9,
    modules: ['VIDEO_FACE_SWAP'],
  };

  private get headers() {
    return {
      'x-api-key': process.env.TAVUS_API_KEY ?? '',
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

      // 1. Submit.
      const submit = await axios.post(
        `${BASE}${SUBMIT_PATH}`,
        {
          source_video_url: sourceVideoUrl,
          target_face_image_url: targetImageUrl,
          keep_audio: true,
        },
        { headers: this.headers, timeout: 30_000 },
      );

      const jobId = firstOf(submit.data, [
        ['video_id'],
        ['data', 'video_id'],
        ['id'],
        ['data', 'id'],
      ]);
      if (!jobId) throw new Error('Tavus submit returned no job id');

      // 2. Poll.
      const deadline = Date.now() + POLL_TIMEOUT_MS;
      while (Date.now() < deadline) {
        await sleep(POLL_INTERVAL_MS);
        const statusRes = await axios.get(`${BASE}${STATUS_PATH}/${jobId}`, {
          headers: this.headers,
          timeout: 15_000,
        });
        const status = String(
          firstOf(statusRes.data, [['status'], ['data', 'status']]) ?? '',
        ).toLowerCase();

        if (status === 'completed' || status === 'ready' || status === 'done') {
          const outputUrl = firstOf(statusRes.data, [
            ['download_url'],
            ['hosted_url'],
            ['stream_url'],
            ['data', 'download_url'],
          ]);
          if (!outputUrl) throw new Error('Tavus completed but returned no video url');
          return this.buildResult({
            latencyMs: Date.now() - start,
            outputUrl: outputUrl as string,
            durationSeconds: request.durationSeconds,
            raw: { provider: 'tavus', jobId },
          });
        }
        if (status === 'failed' || status === 'error') {
          const reason =
            firstOf(statusRes.data, [['error'], ['data', 'error']]) ?? 'unknown';
          throw new Error(`Tavus render failed: ${String(reason)}`);
        }
      }

      throw new Error('Tavus render timed out');
    } catch (err) {
      return this.buildError(err, Date.now() - start);
    }
  }

  async ping(): Promise<boolean> {
    if (!this.config.enabled) return false;
    try {
      await axios.get(`${BASE}${STATUS_PATH}/ping`, {
        headers: this.headers,
        timeout: 5_000,
        validateStatus: () => true,
      });
      return true;
    } catch {
      return false;
    }
  }
}
