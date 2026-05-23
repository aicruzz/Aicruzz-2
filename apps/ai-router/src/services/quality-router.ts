import type { ProviderId } from '../types';

/**
 * quality-router — STRICT
 * ----------------------------------------------------------------------------
 * VIDEO quality-tier → single provider (no silent cross-provider fallback;
 * PIPELINE_MODE=STRICT). GPU is reserved for Module 1 only.
 *
 *   - FAST     → Pika            (fastest, lowest cost, social content)
 *   - STANDARD → Pika optimized  (Pika, balanced settings)
 *   - HIGH     → Runway          (cinematic)
 *   - ULTRA    → Runway          (max cinematic quality)
 *
 * Runway is image-to-video only; for text prompts the PipelineService first
 * synthesizes a keyframe (OpenAI) so Runway always receives an image.
 */

export type VideoQualityTier = 'FAST' | 'STANDARD' | 'HIGH' | 'ULTRA';

const VIDEO_QUALITY_ROUTES: Record<VideoQualityTier, ProviderId[]> = {
  FAST:     ['PIKA'],
  STANDARD: ['PIKA'],
  HIGH:     ['RUNWAY'],
  ULTRA:    ['RUNWAY'],
};

/** Resolve the (single) VIDEO provider for a quality tier. Defaults STANDARD. */
export function resolveVideoQuality(qualityMode?: string): ProviderId[] {
  const tier = (qualityMode ?? 'STANDARD').toUpperCase() as VideoQualityTier;
  return VIDEO_QUALITY_ROUTES[tier] ?? VIDEO_QUALITY_ROUTES.STANDARD;
}
