// ─── Modules ─────────────────────────────────────────────────
export type AiModule =
  | 'CHAT'
  | 'VIDEO'
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
  | 'PIKA';

// ─── Quality / priority mode ──────────────────────────────────
export type RoutingStrategy = 'COST' | 'SPEED' | 'QUALITY' | 'AUTO';

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

  // Chat
  messages?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  systemPrompt?: string;
  stream?: boolean;
  model?: string; // override

  // Image / Video / Cartoon
  prompt?: string;
  negativePrompt?: string;
  inputImageUrl?: string;
  inputVideoUrl?: string;
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
