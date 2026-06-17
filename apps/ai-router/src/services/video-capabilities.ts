// ─── VIDEO PROVIDER CAPABILITY REGISTRY ───────────────────────
//
// Declarative capabilities per video provider. The Video Agent / router read
// these instead of hardcoding provider behavior, so future providers (Veo,
// Kling, Luma, PixVerse, MiniMax, Hailuo, local GPU…) plug in by adding an entry
// here — no Video Studio or routing change. Providers are never named in the
// product UI; this is an internal implementation detail.

import type { ProviderId } from '../types';

export interface VideoCapabilities {
  text2video: boolean;
  image2video: boolean;
  video2video: boolean; // true native video-to-video editing
  continuation: boolean; // can continue a previous clip natively
  characterAnimation: boolean;
  lipSync: boolean;
  cameraMotion: boolean;
  longDuration: boolean; // > 5s
  highRealism: boolean;
  animation: boolean;
  styleTransfer: boolean;
  backgroundReplacement: boolean;
  objectReplacement: boolean;
  upscaling: boolean;
  available: boolean; // false = declared for the future, not yet executable
}

const NONE: VideoCapabilities = {
  text2video: false, image2video: false, video2video: false, continuation: false,
  characterAnimation: false, lipSync: false, cameraMotion: false, longDuration: false,
  highRealism: false, animation: false, styleTransfer: false,
  backgroundReplacement: false, objectReplacement: false, upscaling: false,
  available: false,
};

export const VIDEO_PROVIDER_CAPABILITIES: Partial<
  Record<ProviderId, VideoCapabilities>
> = {
  RUNWAY: {
    ...NONE,
    image2video: true,
    cameraMotion: true,
    longDuration: true, // 5s & 10s
    highRealism: true,
    available: true,
  },
  PIKA: {
    ...NONE,
    text2video: true,
    image2video: true,
    cameraMotion: true,
    animation: true,
    available: true,
  },
  // ── Future providers (declared, not yet executable) ──────────
  // Flip `available` + add a provider implementation to enable. When a provider
  // declares video2video/continuation, frame-based Continue Editing upgrades to
  // native video editing automatically — no Video Studio change.
  // (ProviderId is a closed union; future ids are added there when implemented.)
};

/** True if any AVAILABLE provider can natively do video-to-video editing. */
export function hasNativeVideoToVideo(): boolean {
  return Object.values(VIDEO_PROVIDER_CAPABILITIES).some(
    (c) => c?.available && c.video2video,
  );
}

/** Capabilities for a provider (all-false default for unknown ids). */
export function videoCapabilitiesOf(id: ProviderId): VideoCapabilities {
  return VIDEO_PROVIDER_CAPABILITIES[id] ?? NONE;
}

/**
 * Light, safe per-provider prompt tailoring. Each provider gets a prompt suited
 * to its strengths (invisible to users). Conservative by design — never strips
 * the agent's engineered prompt, only adds a subtle provider-appropriate cue.
 */
export function tailorVideoPrompt(prompt: string, id: ProviderId): string {
  const base = (prompt ?? '').trim();
  if (!base) return base;
  switch (id) {
    case 'PIKA':
      // Pika responds well to explicit, smooth motion cues.
      return `${base} Smooth, natural, fluid motion with consistent, stable framing.`;
    case 'RUNWAY':
      // Runway favors concise cinematic direction — keep the engineered prompt.
      return base;
    default:
      return base;
  }
}
