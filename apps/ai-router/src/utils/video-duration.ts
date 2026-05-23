/**
 * video-duration
 * ----------------------------------------------------------------------------
 * The video models only generate fixed clip lengths — not arbitrary durations:
 *
 *   • Runway gen4_turbo : 5s or 10s only
 *   • Pika v2.2 (fal)   : 5s only
 *
 * Requesting e.g. 17s previously produced a 5s clip while the metadata still
 * claimed 17s (and the user was billed for 17s). This module is the single
 * source of truth for what each provider can actually produce, plus the clamp
 * used to pick the honest, achievable duration.
 */

export type DurationCapableProvider = 'PIKA' | 'RUNWAY';

export const PROVIDER_DURATIONS: Record<DurationCapableProvider, number[]> = {
  PIKA: [5],
  RUNWAY: [5, 10],
};

/**
 * Pick the largest supported duration that does not exceed the request.
 * If the request is below the minimum supported value, use the minimum.
 * Never returns a value the provider can't actually generate.
 */
export function clampDuration(
  requested: number | undefined,
  supported: number[],
): number {
  const sorted = [...supported].sort((a, b) => a - b);
  const req = requested ?? sorted[0];
  const eligible = sorted.filter((s) => s <= req);
  return eligible.length ? eligible[eligible.length - 1] : sorted[0];
}
