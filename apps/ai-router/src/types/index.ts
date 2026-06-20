// ─── Modules ─────────────────────────────────────────────────
export type AiModule =
  | 'CHAT'
  | 'VIDEO'
  | 'VIDEO_FACE_SWAP'
  | 'IMAGE'
  | 'IMAGE_TRANSFORM'
  | 'VOICE'
  | 'CARTOON'
  | 'LIVE_CAM';

// ─── Providers ────────────────────────────────────────────────
export type ProviderId =
  | 'GPU'
  | 'OPENAI'
  | 'OPENAI_IMAGE'
  | 'ANTHROPIC'
  | 'ELEVENLABS'
  | 'RUNWAY'
  | 'PIKA'
  // Identity-preserving video face/head swap (env-gated; future: 'D_ID').
  | 'HEYGEN'
  | 'TAVUS';

// ─── Quality / priority mode ──────────────────────────────────
export type RoutingStrategy = 'COST' | 'SPEED' | 'QUALITY' | 'AUTO';

// ─── Task specialization ──────────────────────────────────────
// Classified from the request content and used to pick the provider
// best suited to the task (see services/task-classifier.ts).
export type TaskType =
  | 'GENERAL_CHAT'
  | 'IMAGE_GENERATION'
  | 'MULTIMODAL'
  | 'CREATIVE_WRITING'
  | 'DOCUMENT_GENERATION'
  | 'CODING'
  | 'DEBUGGING'
  | 'ARCHITECTURE'
  | 'TECHNICAL_ANALYSIS'
  | 'LONG_CONTEXT';

export interface TaskClassification {
  task: TaskType;
  confidence: number; // 0–1
  signals: string[];  // human-readable reasons the task was chosen
}

// ─── Provider health ─────────────────────────────────────────
export type ProviderStatus = 'ONLINE' | 'DEGRADED' | 'OFFLINE';

export interface ProviderHealth {
  id: ProviderId;
  status: ProviderStatus;
  latencyMs: number;
  lastCheckedAt: Date;
  errorRate: number; // 0–1
}

// ─── Routing request (from apps/api) ─────────────────────────
export interface RouteRequest {
  requestId: string;
  userId: string;
  module: AiModule;
  size?: '1024x1024' | '1024x1536' | '1536x1024' | 'auto';
  aspectRatio?: '16:9' | '9:16' | '1:1';
  strategy: RoutingStrategy;

  // Optional caller-supplied task hint. This is a *semantic* hint
  // (e.g. 'CODING'), never a provider — keeps provider logic out of callers.
  taskHint?: TaskType;

  // Chat
  messages?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  systemPrompt?: string;
  stream?: boolean;
  model?: string; // override
  maxTokens?: number; // caller cap; otherwise derived from qualityMode
  onChunk?: (delta: string) => void; // streaming token callback

  // Image / Video / Cartoon
  prompt?: string;
  negativePrompt?: string;
  inputImageUrl?: string;
  // Multiple input images for reference/combine edits (gpt-image-1 edit accepts
  // an image array). Additive — when absent, inputImageUrl is used as before.
  inputImageUrls?: string[];
  inputVideoUrl?: string;
  // Face/head to insert for VIDEO_FACE_SWAP (target identity image).
  targetImageUrl?: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  fps?: number;
  resolution?: 'SD_480P' | 'HD_720P' | 'FHD_1080P';
  qualityMode?: 'STANDARD' | 'HIGH' | 'ULTRA';

  // Voice
  text?: string;
  voiceId?: string;
  voiceCloneUrl?: string;
  voiceGender?: 'MALE' | 'FEMALE';
  audioFormat?: 'mp3' | 'wav' | 'ogg';
  // Phase 4 — all additive & optional (backward compatible).
  voiceStyle?: string;        // emotional tone hint (e.g. "cheerful", "sad")
  voiceStability?: number;    // 0..1 — ElevenLabs voice_settings
  voiceSimilarity?: number;   // 0..1 — ElevenLabs voice_settings
  voiceCloneName?: string;    // label when cloning from a sample

  // Job queue
  jobId?: string;
  priority?: number; // 1 (highest) – 10 (lowest)
  webhookUrl?: string; // callback when async job completes
}

// ─── Provider execution result ────────────────────────────────
export interface ProviderResult {
  success: boolean;
  provider: ProviderId;
  latencyMs: number;
  b64Image?: string;

  // Chat
  text?: string;
  finishReason?: string;
  tokensUsed?: number;

  // Media
  outputUrl?: string;
  thumbnailUrl?: string;
  durationSeconds?: number;

  // Voice
  audioUrl?: string;
  audioDurationSeconds?: number;

  // Raw provider response (for debugging)
  raw?: unknown;

  error?: string;
}

// ─── Full routing response (returned to apps/api) ─────────────
export interface RouteResponse {
  requestId: string;
  success: boolean;
  provider: ProviderId;
  result: ProviderResult;
  attemptsCount: number;
  totalLatencyMs: number;
  strategy: RoutingStrategy;
  fallbackUsed: boolean;

  // Routing observability (CHAT): what the request was classified as and
  // why the winning provider was chosen.
  taskType?: TaskType;
  selectionReason?: string;
}

// ─── Provider config entry ────────────────────────────────────
export interface ProviderConfig {
  id: ProviderId;
  enabled: boolean;
  costPerUnit: number;  // relative cost score — lower is cheaper
  speedScore: number;   // 1–10 — higher is faster
  qualityScore: number; // 1–10 — higher is better quality
  modules: AiModule[];  // which modules this provider supports
  apiKey?: string;
  baseUrl?: string;
}

// ─── Job queue payload ────────────────────────────────────────
export interface QueueJob {
  jobId: string;
  requestId: string;
  userId: string;
  module: AiModule;
  request: RouteRequest;
  webhookUrl?: string;
  createdAt: Date;
}
