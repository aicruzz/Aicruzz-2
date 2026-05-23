import { fal } from '@fal-ai/client';
import { BaseProvider } from './base.provider';
import type { ProviderConfig, ProviderResult, RouteRequest } from '../types';
import { mapToSupportedSize } from '../utils/video-resolution';
import {
  PIKA_MODEL_CAPABILITIES,
  PIKA_SQUARE_TOLERANCE,
} from './capabilities';
import { clampDuration, PROVIDER_DURATIONS } from '../utils/video-duration';

const TEXT_TO_VIDEO_ENDPOINT = 'fal-ai/pika/v2.2/text-to-video';
const IMAGE_TO_VIDEO_ENDPOINT = 'fal-ai/pika/v2.2/image-to-video';

let configured = false;
function ensureConfigured() {
  if (configured) return;
  const credentials = process.env.FAL_KEY;
  if (!credentials) throw new Error('FAL_KEY environment variable is not set');
  fal.config({ credentials });
  configured = true;
}

// @fal-ai/client v1.x subscribe() returns { data, requestId }; the media
// payload lives under `data`. Older shapes kept for defensive parsing.
interface FalVideoResult {
  data?: { video?: { url?: string }; output?: { url?: string } };
  video?: { url?: string };
  output?: { url?: string };
}

interface PikaVideoInput {
  prompt: string;
  aspect_ratio: string;
  negative_prompt: string;
  duration: number;
  image_url?: string;
}

export class PikaProvider extends BaseProvider {
  readonly id = 'PIKA' as const;
  readonly config: ProviderConfig = {
    id: 'PIKA',
    enabled: !!process.env.FAL_KEY,
    costPerUnit: 7,
    speedScore: 7,
    qualityScore: 9,
    modules: ['VIDEO', 'CARTOON'],
  };

  async execute(request: RouteRequest): Promise<ProviderResult> {
    const start = Date.now();
    try {
      ensureConfigured();

      if (!request.prompt?.trim()) {
        throw new Error('Prompt is required for video generation');
      }

      const useImage = !!request.inputImageUrl;
      const endpoint = useImage ? IMAGE_TO_VIDEO_ENDPOINT : TEXT_TO_VIDEO_ENDPOINT;

      // Pika v2.2 generates fixed-length clips only. Clamp honestly so the
      // returned metadata + billing match the clip we actually get back.
      const actualDuration = clampDuration(
        request.durationSeconds,
        PROVIDER_DURATIONS.PIKA,
      );

      const input: PikaVideoInput = {
        prompt: request.prompt,
        aspect_ratio: this.getAspectRatio(request),
        negative_prompt: request.negativePrompt ?? 'blur, distortion, low quality',
        duration: actualDuration,
        ...(useImage && { image_url: request.inputImageUrl }),
      };

      const result = await fal.subscribe(endpoint, {
        // Pika T2V/I2V inputs diverge (aspect_ratio is T2V-only, image_url is
        // I2V-only); we build a single combined shape, so cast past the SDK's
        // strict per-endpoint input typing.
        input: input as never,
        logs: false,
      }) as FalVideoResult;

      const latencyMs = Date.now() - start;
      const outputUrl =
        result?.data?.video?.url ??
        result?.data?.output?.url ??
        result?.video?.url ??
        result?.output?.url ??
        '';
      if (!outputUrl) throw new Error('Pika (fal) returned no video URL');

      return this.buildResult({
        latencyMs,
        outputUrl,
        durationSeconds: actualDuration,
        raw: { endpoint, durationSeconds: actualDuration },
      });
    } catch (err) {
      return this.buildError(err, Date.now() - start);
    }
  }

  // Resolve the Pika aspect token via the shared capability system. Pika's
  // square band is wider than the default, so we pass PIKA_SQUARE_TOLERANCE —
  // output is unchanged from the previous inline logic (16:9 / 9:16 / 1:1,
  // default 16:9 when dimensions are absent).
  private getAspectRatio(request: RouteRequest): string {
    return mapToSupportedSize(
      request.width,
      request.height,
      PIKA_MODEL_CAPABILITIES.default,
      PIKA_SQUARE_TOLERANCE,
    ).ratioToken;
  }

  async ping(): Promise<boolean> {
    return !!process.env.FAL_KEY;
  }
}