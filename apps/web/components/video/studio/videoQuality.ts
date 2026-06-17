// ─── VIDEO STUDIO QUALITY CONFIG ──────────────────────────────
//
// Video Studio's own quality tiers — isolated from Cartoon Studio's shared
// options. These represent DESIRED OUTPUT QUALITY ONLY and must NOT map to any
// provider: the Video Agent alone decides which provider renders the video.
// Adding future tiers (Professional / Studio / Extreme …) here requires no
// routing changes.

export interface VideoQualityOption {
  value: "STANDARD" | "HIGH" | "ULTRA";
  label: string;
  hint: string; // shown as a tooltip — quality-only, never a provider name
}

export const VIDEO_QUALITY_OPTIONS: VideoQualityOption[] = [
  {
    value: "STANDARD",
    label: "Standard",
    hint: "High-quality video generation for everyday projects.",
  },
  {
    value: "HIGH",
    label: "High",
    hint: "Professional-quality rendering with enhanced detail and realism.",
  },
  {
    value: "ULTRA",
    label: "Ultra",
    hint: "Maximum cinematic quality with the highest level of detail and visual fidelity.",
  },
];

export const DEFAULT_VIDEO_QUALITY: VideoQualityOption["value"] = "STANDARD";
