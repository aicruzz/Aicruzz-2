/**
 * video-resolution
 * ----------------------------------------------------------------------------
 * Single source of truth for video dimension handling across providers.
 *
 * Providers (Runway, Pika, …) each support a fixed, model-specific set of
 * dimensions. Sending anything else returns a hard 400. Instead of hardcoding
 * sizes per provider, every provider declares a `ModelCapability` (see
 * providers/capabilities.ts) and calls `mapToSupportedSize()` here to:
 *
 *   1. detect orientation from the requested width/height,
 *   2. keep the requested size if the model already supports it, otherwise
 *   3. auto-correct to the model's default for that orientation,
 *
 * never throwing — an unknown/unsupported size is safely normalized, not
 * rejected. Future model upgrades are a config change in capabilities.ts only.
 */

export type Orientation = 'landscape' | 'portrait' | 'square';

export interface ModelCapability {
  /** Exact "WxH" sizes the model accepts (or proxy sizes for token-based APIs). */
  supportedSizes: string[];
  defaultLandscape: string;
  defaultPortrait: string;
  defaultSquare: string;
  /** Convert a chosen "WxH" size into the token the provider body expects. */
  toRatioToken: (size: string) => string;
}

export interface MappedResolution {
  /** Chosen, model-supported "WxH" size. */
  size: string;
  /** Provider-ready ratio/size token (e.g. "1280:720", "16:9"). */
  ratioToken: string;
  orientation: Orientation;
  /** The originally requested "WxH", or "unknown" when dimensions were absent. */
  requested: string;
  /** True when the requested size was auto-corrected to a supported one. */
  wasAdjusted: boolean;
}

export function formatSize(width: number, height: number): string {
  return `${width}x${height}`;
}

export function parseSize(size: string): { w: number; h: number } | null {
  const m = /^(\d+)x(\d+)$/.exec(size.trim());
  if (!m) return null;
  return { w: Number(m[1]), h: Number(m[2]) };
}

/**
 * Classify orientation. `squareTolerance` is the half-width of the band around
 * a 1:1 ratio that counts as square (default 0.05; providers with a wider
 * square band, e.g. Pika, pass their own).
 */
export function detectOrientation(
  width?: number,
  height?: number,
  squareTolerance = 0.05,
): Orientation {
  if (!width || !height || width <= 0 || height <= 0) return 'landscape';
  const ratio = width / height;
  if (Math.abs(ratio - 1) <= squareTolerance) return 'square';
  return ratio > 1 ? 'landscape' : 'portrait';
}

/**
 * Resolve a request's width/height to a size the given model actually supports.
 * Always returns a valid size — unsupported inputs are auto-corrected, not
 * rejected.
 */
export function mapToSupportedSize(
  width: number | undefined,
  height: number | undefined,
  cap: ModelCapability,
  squareTolerance = 0.05,
): MappedResolution {
  const orientation = detectOrientation(width, height, squareTolerance);
  const requested = width && height ? formatSize(width, height) : 'unknown';

  // Keep the exact requested size when the model already supports it.
  if (requested !== 'unknown' && cap.supportedSizes.includes(requested)) {
    return {
      size: requested,
      ratioToken: cap.toRatioToken(requested),
      orientation,
      requested,
      wasAdjusted: false,
    };
  }

  // Otherwise auto-correct to the model's default for this orientation.
  const size =
    orientation === 'portrait'
      ? cap.defaultPortrait
      : orientation === 'square'
        ? cap.defaultSquare
        : cap.defaultLandscape;

  return {
    size,
    ratioToken: cap.toRatioToken(size),
    orientation,
    requested,
    wasAdjusted: requested !== size,
  };
}
