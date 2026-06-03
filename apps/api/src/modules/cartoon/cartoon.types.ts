export type CartoonType = 'ANIMATED_AD' | 'HUMAN_CARTOON' | 'CUSTOM';
export type JobStatus = 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface CreateTemplateInput {
  name: string;
  description?: string;
  type?: CartoonType;
  isPublic?: boolean;
}

export interface UpdateTemplateInput {
  name?: string;
  description?: string;
  isPublic?: boolean;
  thumbnailUrl?: string;
}
/**
 * Internal-only provider recovery / failover diagnostics from the AI Router.
 * Stored verbatim for observability — never surfaced to end users.
 */
export interface RecoveryDiagnostics {
  selectedProvider: string | null;
  actualProviderUsed: string | null;
  providerSubstituted: boolean;
  substitutionReason: string | null;
  failoverAttempts: number;
  fallbackProvider: string | null;
  providerErrorCode: string | null;
  providerErrorMessage: string | null;
  finalFailureReason: string | null;
}

export interface WebhookBody {
  success: boolean;
  provider?: string;
  result?: {
    success:   boolean;
    provider:  string;
    latencyMs: number;
    raw?: {
      status:           'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
      output_url?:      string;
      thumbnail_url?:   string;
      duration_seconds?: number | null;
      error?:           string;
    };
  };
  // Additive, internal-only (may be absent on legacy/queue-level failures).
  diagnostics?: RecoveryDiagnostics | null;
}

export interface WebhookPayload {
  success:                boolean;
  routerStatus:           'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  outputUrl?:             string;
  thumbnailUrl?:          string;
  provider?:              string;
  actualDurationSeconds?: number | null;
  error?:                 string;
  // Internal-only recovery/failover diagnostics (persisted, not user-facing).
  diagnostics?:           RecoveryDiagnostics | null;
}

export interface CreateSceneInput {
  name: string;
  order?: number;
  prompt?: string;
  imageUrl?: string;
  durationSecs?: number;
  transition?: string;
}

export interface UpdateSceneInput {
  name?: string;
  order?: number;
  prompt?: string;
  imageUrl?: string;
  durationSecs?: number;
  transition?: string;
}

export interface GenerateCartoonInput {
  // `type` (legacy DB enum) is now optional — callers may send `mode`
  // instead. At least one is required (validated). Backward compatible:
  // old clients sending only `type` keep working unchanged.
  type?: CartoonType;
  mode?: CartoonMode;
  prompt?: string;
  stylePrompt?: string;
  inputImageUrl?: string;
  inputVideoUrl?: string;
  templateId?: string;
  durationSecs?: number;
  aspectRatio?: string;
  animationStyle?: string;
  // Phase 2 — reusable assets / character / voice (persisted in
  // generation_jobs_metadata; the Phase 1 router contract is unchanged).
  characterId?: string;
  characterImageUrl?: string;
  backgroundImageUrl?: string;
  logoImageUrl?: string;
  extraImageUrls?: string[];
  voiceMode?: VoiceMode;
  voiceText?: string;
  voiceAssetId?: string;
  // Phase 3 — reference saved library assets by id (resolved → URL
  // server-side; raw *ImageUrl fields still accepted, back compat).
  faceAssetId?: string;
  backgroundAssetId?: string;
  logoAssetId?: string;
}

// ─── Phase 3: save-as-template / save-as-asset workflows ──────
export interface SaveJobAsTemplateInput {
  name: string;
  description?: string;
  isPublic?: boolean;
}

export interface SaveJobAsCharacterInput {
  name: string;
  description?: string;
  stylePrompt?: string;
}

export interface SaveJobAsAssetInput {
  // Defaults to SCENE; CHARACTER/BACKGROUND for reusable building blocks.
  type?: 'SCENE' | 'CHARACTER' | 'BACKGROUND';
  name: string;
}

// ─── Phase 2: app-layer cartoon modes ─────────────────────────
// Four product modes mapped onto the EXISTING cartoonType enum (no DB
// enum migration). The richer mode is persisted in generation_jobs_metadata.
export type CartoonMode =
  | 'ANIMATED_AD'
  | 'HUMAN_CARTOON'
  | 'CUSTOM_CHARACTER'
  | 'CLASSIC_CARTOON';

export type VoiceMode = 'NONE' | 'UPLOAD' | 'CLONE' | 'AI';

export const MODE_TO_TYPE: Record<CartoonMode, CartoonType> = {
  ANIMATED_AD:      'ANIMATED_AD',
  HUMAN_CARTOON:    'HUMAN_CARTOON',
  CUSTOM_CHARACTER: 'CUSTOM',
  CLASSIC_CARTOON:  'CUSTOM',
};

// Backward compat: a legacy `type`-only request maps to a default mode.
const TYPE_TO_DEFAULT_MODE: Record<CartoonType, CartoonMode> = {
  ANIMATED_AD:   'ANIMATED_AD',
  HUMAN_CARTOON: 'HUMAN_CARTOON',
  CUSTOM:        'CUSTOM_CHARACTER',
};

export function resolveCartoonMode(input: {
  mode?: CartoonMode;
  type?: CartoonType;
}): CartoonMode {
  if (input.mode) return input.mode;
  if (input.type) return TYPE_TO_DEFAULT_MODE[input.type];
  return 'CUSTOM_CHARACTER';
}

export const CARTOON_MODE_CREDIT_RATES: Record<CartoonMode, number> = {
  ANIMATED_AD:      25, // scales with duration
  HUMAN_CARTOON:    15,
  CUSTOM_CHARACTER: 20,
  CLASSIC_CARTOON:  18,
};

export function getCartoonCreditsByMode(
  mode: CartoonMode,
  durationSecs?: number,
): number {
  const base = CARTOON_MODE_CREDIT_RATES[mode];
  if (mode === 'ANIMATED_AD' && durationSecs) {
    return parseFloat((base * (durationSecs / 5)).toFixed(2));
  }
  return base;
}

/**
 * Per-mode prompt + style construction. Returns the final prompt string
 * passed to the (unchanged) Phase 1 router. Keeps text→keyframe→video
 * (Option A) and uploaded-image→video (Option B) both working.
 */
export function buildModePrompt(
  mode: CartoonMode,
  args: { basePrompt: string; stylePrompt?: string },
): string {
  const base = args.basePrompt.trim();
  const style = args.stylePrompt?.trim();
  const styleSuffix = style ? ` Style: ${style}.` : '';

  switch (mode) {
    case 'ANIMATED_AD':
      return (
        `${base}. Cinematic animated advertisement scene, dynamic camera ` +
        `movement, expressive characters, vibrant lighting, smooth motion.` +
        styleSuffix
      );
    case 'HUMAN_CARTOON':
      return (
        `${base}. Convert the subject into a polished animated cartoon ` +
        `character while preserving identity; clean lines, appealing ` +
        `stylization, lively facial expression.` +
        (style ? ` Style: ${style}.` : ' Style: Pixar-like 3D cartoon.')
      );
    case 'CUSTOM_CHARACTER':
      return (
        `${base}. Maintain a consistent, reusable character design and ` +
        `appearance across the scene; expressive, on-model animation.` +
        styleSuffix
      );
    case 'CLASSIC_CARTOON':
      return (
        `${base}. Classic traditional cartoon animation, exaggerated ` +
        `squash-and-stretch motion, bold outlines, slapstick timing, ` +
        `retro hand-drawn aesthetic.` +
        styleSuffix
      );
  }
}

// Credit costs by cartoon type
export const CARTOON_CREDIT_RATES: Record<CartoonType, number> = {
  ANIMATED_AD:    25, // 25 credits per animation
  HUMAN_CARTOON:  15, // 15 credits per image conversion
  CUSTOM:         20, // 20 credits per custom generation
};

export function getCartoonCredits(
  type: CartoonType,
  durationSecs?: number,
): number {
  const base = CARTOON_CREDIT_RATES[type];
  // Animated ads scale with duration
  if (type === 'ANIMATED_AD' && durationSecs) {
    return parseFloat((base * (durationSecs / 5)).toFixed(2));
  }
  return base;
}
