// ─── UPLOAD LIMITS — SINGLE SOURCE OF TRUTH ───────────────────
// Every layer (file picker, drag & drop, paste, composer, validation, API,
// multer, and the AI router) reads these exact values — the frontend fetches
// them from GET /api/chat/config. Changing a value here updates the whole app;
// no hardcoded duplicate limits anywhere.

export interface UploadLimits {
  maxImages: number;
  maxVideos: number;
  maxDocuments: number;
  maxFileSizeBytes: number;
  supportedImageFormats: string[];
  supportedVideoFormats: string[];
}

export const UPLOAD_LIMITS: UploadLimits = {
  maxImages: 6,
  maxVideos: 1,
  maxDocuments: 0, // documents not yet uploadable (capability coming soon)
  maxFileSizeBytes: 100 * 1024 * 1024, // 100 MB
  supportedImageFormats: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  supportedVideoFormats: ["video/mp4", "video/webm", "video/quicktime"],
};

export const ALL_SUPPORTED_UPLOAD_FORMATS: string[] = [
  ...UPLOAD_LIMITS.supportedImageFormats,
  ...UPLOAD_LIMITS.supportedVideoFormats,
];

// Max reference images a single image-edit provider call accepts. If a turn
// exceeds this the engine CAPS (with a logged explanation) instead of silently
// discarding references down to "just the first image". Kept >= maxImages so
// the default configuration never drops anything.
export const PROVIDER_MAX_REFERENCE_IMAGES = 16;
