/**
 * openai-image-size
 * ----------------------------------------------------------------------------
 * Single source of truth for OpenAI `gpt-image-1` keyframe sizing.
 *
 * gpt-image-1 only accepts a fixed set of sizes — anything else (e.g. video
 * pixel resolutions like 1280x720 / 1920x1080) returns a hard
 * `400 Invalid size`. Video aspect ratios are mapped here to the closest
 * supported keyframe size; this only affects the intermediate keyframe — the
 * final video output resolution (Runway/Pika) is unchanged.
 *
 *   16:9 → 1536x1024   (landscape)
 *   9:16 → 1024x1536   (portrait)
 *   1:1  → 1024x1024   (square)
 */

import { detectOrientation } from './video-resolution';

export type OpenAIImageSize = '1024x1024' | '1024x1536' | '1536x1024';
export type AspectRatio = '16:9' | '9:16' | '1:1';

const ASPECT_TO_SIZE: Record<AspectRatio, OpenAIImageSize> = {
  '16:9': '1536x1024',
  '9:16': '1024x1536',
  '1:1': '1024x1024',
};

const VALID = new Set<string>(['1024x1024', '1024x1536', '1536x1024']);

/** True when the value is already a supported gpt-image-1 size. */
export function isOpenAIImageSize(v: unknown): v is OpenAIImageSize {
  return typeof v === 'string' && VALID.has(v);
}

/** Derive a normalized aspect ratio from pixel dimensions. */
export function aspectRatioFromDimensions(w?: number, h?: number): AspectRatio {
  const o = detectOrientation(w, h); // landscape | portrait | square
  return o === 'portrait' ? '9:16' : o === 'square' ? '1:1' : '16:9';
}

/**
 * Map a video aspect ratio to a supported gpt-image-1 size. Never throws —
 * unknown/missing input defaults to landscape 1536x1024.
 */
export function resolveOpenAIImageSize(
  aspectRatio: string | undefined,
): OpenAIImageSize {
  const resolved =
    ASPECT_TO_SIZE[(aspectRatio ?? '').trim() as AspectRatio] ?? '1536x1024';
  console.log(
    `[Keyframe] requestedAspect=${aspectRatio ?? 'unknown'} resolvedSize=${resolved}`,
  );
  return resolved;
}
