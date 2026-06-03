import type { ProviderId } from '../types';

/**
 * quality-router
 * ----------------------------------------------------------------------------
 * VIDEO quality-tier → ordered provider chain. The PRIMARY (first) provider per
 * tier is unchanged — quality behavior, pricing and outputs are identical on the
 * happy path. The alternate provider is appended purely as a recovery option so
 * the existing capability-substitution (Layer 1) and runtime-failover (Layer 2)
 * logic can engage instead of failing the job. Provider cost is provider-
 * agnostic (see calculateVideoCredits), so the fallback never changes billing.
 *
 *   - FAST     → Pika   (primary), Runway (fallback)   — fastest/lowest cost
 *   - STANDARD → Pika   (primary), Runway (fallback)   — balanced
 *   - HIGH     → Runway (primary), Pika   (fallback)   — cinematic
 *   - ULTRA    → Runway (primary), Pika   (fallback)   — max cinematic quality
 *
 * GPU is reserved for Module 1 only. Runway is image-to-video only; for text
 * prompts the PipelineService first synthesizes a keyframe (OpenAI) so either
 * provider always receives an image.
 */

export type VideoQualityTier = 'FAST' | 'STANDARD' | 'HIGH' | 'ULTRA';

const VIDEO_QUALITY_ROUTES: Record<VideoQualityTier, ProviderId[]> = {
  FAST:     ['PIKA', 'RUNWAY'],
  STANDARD: ['PIKA', 'RUNWAY'],
  HIGH:     ['RUNWAY', 'PIKA'],
  ULTRA:    ['RUNWAY', 'PIKA'],
};

/** Resolve the (single) VIDEO provider for a quality tier. Defaults STANDARD. */
export function resolveVideoQuality(qualityMode?: string): ProviderId[] {
  const tier = (qualityMode ?? 'STANDARD').toUpperCase() as VideoQualityTier;
  return VIDEO_QUALITY_ROUTES[tier] ?? VIDEO_QUALITY_ROUTES.STANDARD;
}
