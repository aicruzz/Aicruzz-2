import axios from 'axios';
import { BaseProvider } from './base.provider';
import type { ProviderConfig, ProviderResult, RouteRequest } from '../types';
import { mapToSupportedSize } from '../utils/video-resolution';
import { RUNWAY_MODEL_CAPABILITIES } from './capabilities';
import { clampDuration, PROVIDER_DURATIONS } from '../utils/video-duration';
import { tailorVideoPrompt } from '../services/video-capabilities';

// Runway's developer/Gen API is served from api.dev.runwayml.com — NOT
// api.runwayml.com (that host returns 401 for API keys).
const RUNWAY_BASE = 'https://api.dev.runwayml.com/v1';

/**
 * RunwayProvider
 * ----------------------------------------------------------------------------
 * Premium cinematic tier for VIDEO and CARTOON. Runway is image-to-video
 * ONLY (gen4_turbo) — no text-to-video, no video-to-video. For text
 * prompts the PipelineService synthesizes a keyframe first, so Runway always
 * receives an image. Requests without an image fail fast.
 */
export class RunwayProvider extends BaseProvider {
  readonly id = 'RUNWAY' as const;

  // Single source of truth for the model. Its dimension rules live in
  // capabilities.ts (RUNWAY_MODEL_CAPABILITIES) — upgrading the model is a
  // config change there, not edits scattered across this file.
  private readonly model = 'gen4_turbo' as const;

  readonly config: ProviderConfig = {
    id: 'RUNWAY',
    enabled: !!process.env.RUNWAY_API_KEY,
    costPerUnit: 8,
    speedScore: 6,
    qualityScore: 10,
    modules: ['VIDEO', 'CARTOON'],
  };

  private get headers() {
    return {
      Authorization: `Bearer ${process.env.RUNWAY_API_KEY}`,
      'Content-Type': 'application/json',
      'X-Runway-Version': '2024-11-06',
    };
  }

  async execute(request: RouteRequest): Promise<ProviderResult> {
    const start = Date.now();
    try {
      // Runway is image-to-video ONLY (no text-to-video, no video-to-video).
      // Fail fast when no input image is supplied. For text prompts the
      // PipelineService supplies a synthesized keyframe as inputImageUrl.
      if (!request.inputImageUrl) {
        throw new Error(
          'RUNWAY requires an input image (image-to-video only)',
        );
      }

      // Validate + auto-correct dimensions against the model's capability
      // profile. Unsupported sizes are normalized, never sent raw to Runway.
      const cap = RUNWAY_MODEL_CAPABILITIES[this.model];
      const resolution = mapToSupportedSize(
        request.width,
        request.height,
        cap,
      );
      console.log(
        `[Runway] Requested: ${resolution.requested}\n` +
          `[Runway] Mapped to: ${resolution.size}` +
          (resolution.wasAdjusted ? ' (auto-corrected)' : '') +
          '\n' +
          `[Runway] Model: ${this.model}`,
      );

      // Runway gen4_turbo only produces 5s or 10s clips. Clamp honestly and
      // report back the duration we actually generated (not what was asked).
      const actualDuration = clampDuration(
        request.durationSeconds,
        PROVIDER_DURATIONS.RUNWAY,
      );

      const payload: Record<string, unknown> = {
        promptImage: request.inputImageUrl, // string URL — required
        promptText: tailorVideoPrompt(request.prompt ?? '', this.id),
        model: this.model,
        duration: actualDuration,
        ratio: resolution.ratioToken,
      };

      // Submit generation task
      const submitRes = await axios.post(`${RUNWAY_BASE}/image_to_video`, payload, {
        headers: this.headers,
        timeout: 30000,
      });

      const taskId: string = (submitRes.data as { id: string }).id;

      // Poll until complete (max 5 min)
      const outputUrl = await this.pollTask(taskId);

      return this.buildResult({
        latencyMs: Date.now() - start,
        outputUrl,
        durationSeconds: actualDuration,
        raw: { taskId, mode: 'image_to_video', durationSeconds: actualDuration },
      });
    } catch (err) {
      return this.buildError(err, Date.now() - start);
    }
  }

  private async pollTask(taskId: string): Promise<string> {
    const maxAttempts = 60; // 5 min at 5s intervals
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, 5000));

      const res = await axios.get(`${RUNWAY_BASE}/tasks/${taskId}`, {
        headers: this.headers,
        timeout: 10000,
      });

      const task = res.data as { status: string; output?: string[] };

      if (task.status === 'SUCCEEDED') {
        return task.output?.[0] ?? '';
      }
      if (task.status === 'FAILED') {
        throw new Error('Runway task failed');
      }
    }
    throw new Error('Runway task timed out after 5 minutes');
  }

  async ping(): Promise<boolean> {
    try {
      const res = await axios.get(`${RUNWAY_BASE}/tasks`, {
        headers: this.headers,
        timeout: 5000,
        params: { limit: 1 },
      });
      return res.status === 200;
    } catch {
      return false;
    }
  }
}
