import { fal } from '@fal-ai/client';

/**
 * upscale
 * ----------------------------------------------------------------------------
 * PRO-mode finishing step: takes the gpt-image-1 edit result (~1024–1536px)
 * and runs it through fal.ai's clarity-upscaler to reach 2K/4K with detail
 * enhancement, so the output holds up at professional/commercial sizes.
 *
 * Requires FAL_KEY (same credential Pika already uses). The caller is
 * responsible for falling back to the non-upscaled image if this throws —
 * upscaling is an enhancement, never a hard requirement.
 */

const CLARITY_UPSCALER_ENDPOINT = 'fal-ai/clarity-upscaler';

let configured = false;
function ensureConfigured(): void {
  if (configured) return;
  const credentials = process.env.FAL_KEY;
  if (!credentials) throw new Error('FAL_KEY environment variable is not set');
  fal.config({ credentials });
  configured = true;
}

// @fal-ai/client v1.x subscribe() returns { data, requestId }; the upscaled
// image lives under `data.image.url` (older shapes kept for defensive parsing).
interface FalUpscaleResult {
  data?: { image?: { url?: string }; images?: Array<{ url?: string }> };
  image?: { url?: string };
  images?: Array<{ url?: string }>;
}

/** True only when the upscaler can run (FAL credentials present). */
export function isUpscaleConfigured(): boolean {
  return !!process.env.FAL_KEY;
}

/**
 * Upscale an HTTPS image URL. `scale` is the target multiplier (2 ≈ 2K,
 * 4 ≈ 4K from a 1024–1536px source). Returns the upscaled image's https URL.
 * Throws on failure — caller must catch and fall back.
 */
export async function upscaleImage(
  imageUrl: string,
  scale = 2,
): Promise<string> {
  ensureConfigured();

  const result = (await fal.subscribe(CLARITY_UPSCALER_ENDPOINT, {
    input: {
      image_url: imageUrl,
      upscale_factor: scale,
      // Conservative settings: enhance detail without hallucinating new
      // content or drifting from the edited result.
      creativity: 0.2,
      resemblance: 1.2,
    } as never,
    logs: false,
  })) as FalUpscaleResult;

  const url =
    result?.data?.image?.url ??
    result?.data?.images?.[0]?.url ??
    result?.image?.url ??
    result?.images?.[0]?.url ??
    '';

  if (!url) throw new Error('Upscaler (fal) returned no image URL');
  return url;
}
