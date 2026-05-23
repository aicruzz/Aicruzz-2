import OpenAI, { toFile } from 'openai';
import axios from 'axios';
import { BaseProvider } from './base.provider';
import type { ProviderConfig, ProviderResult, RouteRequest } from '../types';
import { enhanceTransformPrompt } from '../utils/transform-prompt';
import { isUpscaleConfigured, upscaleImage } from '../utils/upscale';
import { isMediaStorageConfigured, uploadKeyframe } from '../utils/media-storage';

type EditSize = '1024x1024' | '1024x1536' | '1536x1024' | 'auto';
type EditQuality = 'high' | 'medium' | 'low' | 'auto';

/**
 * OpenAIImageTransformProvider
 * ----------------------------------------------------------------------------
 * Professional image *editing/transformation* — distinct from the text-to-image
 * generation handled by OpenAIProvider. Takes an uploaded photo + a natural
 * language instruction and returns a photorealistic edited result via
 * gpt-image-1's edit endpoint (prompt-guided, no mask).
 *
 *  • FAST  (qualityMode STANDARD/HIGH) → quality 'medium', no upscale
 *  • PRO   (qualityMode ULTRA)         → quality 'high'  + clarity upscale (2x)
 *
 * Registered under its own ProviderId ('OPENAI_IMAGE') so it does not collide
 * with the OpenAI chat/generation provider in the router's provider map.
 */
export class OpenAIImageTransformProvider extends BaseProvider {
  readonly id = 'OPENAI_IMAGE' as const;
  readonly config: ProviderConfig = {
    id: 'OPENAI_IMAGE',
    enabled: !!process.env.OPENAI_API_KEY,
    costPerUnit: 6,
    speedScore: 6,
    qualityScore: 10,
    modules: ['IMAGE_TRANSFORM'],
  };

  private client: OpenAI;

  constructor() {
    super();
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      httpAgent: new (require('https').Agent)({ keepAlive: true }),
    });
  }

  async execute(request: RouteRequest): Promise<ProviderResult> {
    const start = Date.now();
    try {
      if (!request.inputImageUrl) {
        throw new Error('IMAGE_TRANSFORM requires an input image to edit');
      }

      const isPro = request.qualityMode === 'ULTRA';
      const quality: EditQuality = isPro ? 'high' : 'medium';
      const size = this.resolveSize(request);
      const prompt = enhanceTransformPrompt(request.prompt ?? '');

      // 1. Pull the uploaded (Cloudinary) image into memory.
      const sourceBytes = await this.downloadImage(request.inputImageUrl);
      const image = await toFile(sourceBytes, 'input.png', {
        type: 'image/png',
      });

      // 2. Edit via gpt-image-1 (one transient retry before giving up).
      const b64 = await this.runEditWithRetry({ image, prompt, size, quality });
      if (!b64) throw new Error('gpt-image-1 returned no image data');

      // 3. FAST → return the edited bytes directly.
      if (!isPro) {
        return this.buildResult({
          latencyMs: Date.now() - start,
          b64Image: b64,
          raw: { mode: 'edit', quality, size, upscaled: false },
        });
      }

      // 4. PRO → host the edit then upscale to 2K/4K. Upscaling is an
      //    enhancement: any failure falls back to the (still high-quality)
      //    1536px edit so the user never gets nothing.
      if (isMediaStorageConfigured() && isUpscaleConfigured()) {
        try {
          const hostedUrl = await uploadKeyframe(b64);
          const upscaledUrl = await upscaleImage(hostedUrl, 2);
          return this.buildResult({
            latencyMs: Date.now() - start,
            outputUrl: upscaledUrl,
            raw: { mode: 'edit', quality, size, upscaled: true },
          });
        } catch {
          // fall through to the non-upscaled result
        }
      }

      return this.buildResult({
        latencyMs: Date.now() - start,
        b64Image: b64,
        raw: { mode: 'edit', quality, size, upscaled: false },
      });
    } catch (err) {
      return this.buildError(err, Date.now() - start);
    }
  }

  private async runEditWithRetry(args: {
    image: Awaited<ReturnType<typeof toFile>>;
    prompt: string;
    size: EditSize;
    quality: EditQuality;
  }): Promise<string | undefined> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await this.client.images.edit({
          model: 'gpt-image-1',
          image: args.image,
          prompt: args.prompt,
          n: 1,
          size: args.size,
          quality: args.quality,
        });
        return response.data?.[0]?.b64_json ?? undefined;
      } catch (err) {
        if (attempt === 0 && this.isTransient(err)) continue;
        throw err;
      }
    }
    return undefined;
  }

  private isTransient(err: unknown): boolean {
    const status = (err as { status?: number })?.status;
    if (typeof status === 'number') {
      return status === 429 || status >= 500;
    }
    const code = (err as { code?: string })?.code;
    return code === 'ETIMEDOUT' || code === 'ECONNRESET';
  }

  private async downloadImage(url: string): Promise<Buffer> {
    const res = await axios.get<ArrayBuffer>(url, {
      responseType: 'arraybuffer',
      timeout: 60_000,
    });
    return Buffer.from(res.data);
  }

  // gpt-image-1 edit supports only 1024x1024, 1024x1536, 1536x1024 or auto.
  // Honor an explicit valid size, else derive orientation from dimensions.
  private resolveSize(request: RouteRequest): EditSize {
    if (
      request.size === '1024x1024' ||
      request.size === '1024x1536' ||
      request.size === '1536x1024' ||
      request.size === 'auto'
    ) {
      return request.size;
    }
    const w = request.width ?? 0;
    const h = request.height ?? 0;
    if (w && h) {
      if (w > h * 1.1) return '1536x1024';
      if (h > w * 1.1) return '1024x1536';
      return '1024x1024';
    }
    return 'auto';
  }

  async ping(): Promise<boolean> {
    try {
      await this.client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
      });
      return true;
    } catch {
      return false;
    }
  }
}
