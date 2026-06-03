import { BaseProvider } from '../providers/base.provider';
import type { ProviderId, RouteRequest, AiModule } from '../types';
import { PROVIDER_DURATIONS, clampDuration } from '../utils/video-duration';
import type { DurationCapableProvider } from '../utils/video-duration';
import {
  RUNWAY_MODEL_CAPABILITIES,
  PIKA_MODEL_CAPABILITIES,
} from '../providers/capabilities';
import type { ModelCapability } from '../utils/video-resolution';

/**
 * provider-capability
 * ----------------------------------------------------------------------------
 * Layer 1 — pre-generation capability check. Given the quality-derived provider
 * chain, reorder it so the *primary* is a provider that can actually fulfil the
 * request before generation starts. This is invisible to callers and never adds
 * cost (video pricing is provider-agnostic — see calculateVideoCredits).
 *
 * Capability data is NOT duplicated here — it is read from the single sources of
 * truth: PROVIDER_DURATIONS (utils/video-duration) and *_MODEL_CAPABILITIES
 * (providers/capabilities).
 *
 * Two verdict levels keep today's graceful behaviour intact:
 *   - OK   : provider can natively fulfil the request.
 *   - SOFT : provider can still produce output but not ideally (e.g. requested
 *            10s on Pika, which maxes at 5s). Used to *reorder* (prefer a better
 *            provider) — never to fail. If no provider is a better fit, the
 *            original order is preserved and today's clamp + partial-refund path
 *            still applies.
 *
 * Hard-incompatible requests (video-to-video, Runway image-to-video without an
 * image) are intentionally left to PipelineService's existing STRICT guards so
 * their precise "unsupported" errors are preserved unchanged.
 */

export type SubstitutionReason =
  | 'UNSUPPORTED_DURATION'
  | 'UNSUPPORTED_ASPECT_RATIO';

export type CapabilityLevel = 'OK' | 'SOFT';

export interface CapabilityVerdict {
  level: CapabilityLevel;
  reason?: SubstitutionReason;
}

export interface RecoveryDiagnostics {
  selectedProvider: ProviderId | null;
  actualProviderUsed: ProviderId | null;
  providerSubstituted: boolean;
  substitutionReason: SubstitutionReason | null;
  failoverAttempts: number;
  fallbackProvider: ProviderId | null;
  providerErrorCode: string | null;
  providerErrorMessage: string | null;
  finalFailureReason: string | null;
}

const MODEL_CAPABILITIES: Partial<Record<ProviderId, ModelCapability>> = {
  RUNWAY: RUNWAY_MODEL_CAPABILITIES.gen4_turbo,
  PIKA: PIKA_MODEL_CAPABILITIES.default,
};

const CAPABILITY_RELEVANT_MODULES: AiModule[] = ['VIDEO', 'CARTOON'];

function isDurationCapable(id: ProviderId): id is DurationCapableProvider {
  return id === 'PIKA' || id === 'RUNWAY';
}

function orientationOf(aspectRatio: string): keyof Pick<
  ModelCapability,
  'defaultLandscape' | 'defaultPortrait' | 'defaultSquare'
> {
  switch (aspectRatio) {
    case '9:16':
      return 'defaultPortrait';
    case '1:1':
      return 'defaultSquare';
    default:
      return 'defaultLandscape';
  }
}

/**
 * Whether `providerId` can fulfil `request`. Only meaningful for VIDEO/CARTOON;
 * everything else is OK (no capability constraints modelled).
 */
export function canFulfill(
  providerId: ProviderId,
  request: RouteRequest,
): CapabilityVerdict {
  if (!CAPABILITY_RELEVANT_MODULES.includes(request.module)) {
    return { level: 'OK' };
  }

  // Duration: a provider can fulfil the request exactly only when clamping is a
  // no-op (requested length is one the provider actually produces). When the
  // provider would under-deliver (e.g. 10s on Pika, which clamps to 5s) it is
  // SOFT — another provider may produce the exact length, so prefer it. If
  // *every* provider would clamp equally (e.g. 7s), none is preferred and
  // today's clamp + partial-refund path is preserved unchanged.
  if (isDurationCapable(providerId) && typeof request.durationSeconds === 'number') {
    const supported = PROVIDER_DURATIONS[providerId];
    if (clampDuration(request.durationSeconds, supported) !== request.durationSeconds) {
      return { level: 'SOFT', reason: 'UNSUPPORTED_DURATION' };
    }
  }

  // Aspect ratio: the provider must have a size in the requested orientation.
  // With current models every video provider covers all three orientations, so
  // this is a no-op today — kept so future, narrower models substitute correctly.
  if (request.aspectRatio) {
    const cap = MODEL_CAPABILITIES[providerId];
    if (cap && !cap[orientationOf(request.aspectRatio)]) {
      return { level: 'SOFT', reason: 'UNSUPPORTED_ASPECT_RATIO' };
    }
  }

  return { level: 'OK' };
}

export interface CapabilityReorder {
  chain: BaseProvider[];
  selectedPrimary: ProviderId | null;
  substituted: boolean;
  substitutionReason?: SubstitutionReason;
}

/**
 * Reorder the chain so capable providers come first (stable within each group),
 * preferring a compatible provider as the primary. Never drops providers and
 * never empties the chain — hard-unsupported requests stay the responsibility of
 * PipelineService's STRICT guards.
 */
export function reorderByCapability(
  chain: BaseProvider[],
  request: RouteRequest,
): CapabilityReorder {
  const selectedPrimary = chain[0]?.id ?? null;

  if (!CAPABILITY_RELEVANT_MODULES.includes(request.module) || chain.length <= 1) {
    return { chain, selectedPrimary, substituted: false };
  }

  const verdicts = new Map<BaseProvider, CapabilityVerdict>();
  for (const p of chain) verdicts.set(p, canFulfill(p.id, request));

  const ok = chain.filter((p) => verdicts.get(p)!.level === 'OK');
  const soft = chain.filter((p) => verdicts.get(p)!.level === 'SOFT');
  const reordered = [...ok, ...soft];

  const newPrimary = reordered[0]?.id ?? null;
  const substituted = newPrimary !== null && newPrimary !== selectedPrimary;

  // The substitution reason is *why we moved away from the original primary* —
  // i.e. the original primary's own SOFT verdict.
  const primaryVerdict = selectedPrimary
    ? verdicts.get(chain[0])
    : undefined;

  return {
    chain: reordered,
    selectedPrimary,
    substituted,
    substitutionReason: substituted ? primaryVerdict?.reason : undefined,
  };
}

/** Parse a coarse provider error code from the composed error string that
 *  base.provider.ts builds (e.g. "... status=429 ... code=ECONNRESET"). */
export function parseProviderErrorCode(error: string | undefined): string | null {
  if (!error) return null;
  const status = error.match(/status=(\d{3})/);
  if (status) return status[1];
  const code = error.match(/code=([A-Za-z0-9_]+)/);
  if (code) return code[1];
  return null;
}
