export type VideoResolution = 'SD_480P' | 'HD_720P' | 'FHD_1080P';
export type QualityMode = 'STANDARD' | 'HIGH' | 'ULTRA';
export type JobStatus = 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

// Re-exported from the DB schema so the video module is self-contained.
export type { VideoExecutionLedger, VideoAgentMeta } from '../../db/schema';

export interface CreateVideoJobInput {
  prompt: string;
  negativePrompt?: string;
  inputImageUrl?: string;
  inputVideoUrl?: string;
  durationSeconds: number;
  resolution: VideoResolution;
  qualityMode: QualityMode;
  voiceEnabled: boolean;
  voiceText?: string;
  voiceGender?: 'MALE' | 'FEMALE';
  fps?: number;
  // Video Agent extensions (optional, additive):
  // Continue editing from a previous job (frame-based continuation), and
  // intentional A–E variations. The Video Agent handles the rest.
  parentJobId?: string;
  variationIndex?: number;
}

export interface VideoJobDto {
  id: string;
  userId: string;
  status: JobStatus;
  prompt: string | null;
  inputImageUrl: string | null;
  inputVideoUrl: string | null;
  voiceEnabled: boolean;
  durationSeconds: number;
  resolution: VideoResolution;
  qualityMode: QualityMode;
  provider: string | null;
  creditsCharged: number;
  creditRefunded: boolean;
  outputUrl: string | null;
  thumbnailUrl: string | null;
  errorMessage: string | null;
  queueJobId: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  // Video Agent metadata (nullable, additive) — powers Copy revised prompt,
  // continuation chains and variations. Restored on reload.
  revisedPrompt?: string | null;
  parentJobId?: string | null;
  variationIndex?: number | null;
}

/**
 * Raw webhook body shape sent by the AI router.
 * The router calls this webhook on EVERY status change (QUEUED, PROCESSING, COMPLETED, FAILED).
 */
/**
 * Internal-only provider recovery / failover diagnostics emitted by the AI
 * Router. Stored verbatim for observability — never surfaced to end users.
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
  requestId: string;
  success:   boolean;
  provider:  string;
  result: {
    success:   boolean;
    provider:  string;
    latencyMs: number;
    raw: {
      jobId:         string;
      status:        'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
      output_url?:   string;
      thumbnail_url?: string;
      // Actual clip length the provider generated (clamped to a supported
      // value). May be less than what the user requested.
      duration_seconds?: number;
      error?:        string;
    };
  };
  attemptsCount:  number;
  totalLatencyMs: number;
  strategy:       string;
  fallbackUsed:   boolean;
  // Additive, internal-only (may be absent on legacy/queue-level failures).
  diagnostics?:   RecoveryDiagnostics | null;
}

/**
 * Normalised payload passed from the controller into handleJobWebhook.
 */
export interface WebhookPayload {
  success:       boolean;
  routerStatus:  'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  outputUrl?:    string;
  thumbnailUrl?: string;
  provider?:     string;
  // Actual clip length generated; used to correct stored duration + billing.
  actualDurationSeconds?: number;
  error?:        string;
  // Internal-only recovery/failover diagnostics (persisted, not user-facing).
  diagnostics?:  RecoveryDiagnostics | null;
}

/**
 * Direct progress event from the GPU worker. Sent during processing as the
 * pipeline transitions through stages — does not change DB status (still
 * PROCESSING) but is broadcast over SSE to live clients.
 */
export interface ProgressEventBody {
  type:     'progress';
  stage:    'queued' | 'generating' | 'post-processing' | 'encoding' | 'completed';
  progress?: number;
  message?:  string;
}

// ─── Credit formula constants — kept in one place ─────────────────────────────

export const VIDEO_CREDIT_RATES = {
  BASE_PER_SECOND:     10,
  MULTIPLIER_SD:       1.0,
  MULTIPLIER_720P:     1.2,
  MULTIPLIER_1080P:    1.5,
  MULTIPLIER_STANDARD: 1.0,
  MULTIPLIER_HIGH:     1.3,
  MULTIPLIER_ULTRA:    2.0,
} as const;

export function calculateVideoCredits(
  durationSeconds: number,
  resolution: VideoResolution,
  qualityMode: QualityMode,
): number {
  const base = VIDEO_CREDIT_RATES.BASE_PER_SECOND * durationSeconds;

  const resMap: Record<VideoResolution, number> = {
    SD_480P:   VIDEO_CREDIT_RATES.MULTIPLIER_SD,
    HD_720P:   VIDEO_CREDIT_RATES.MULTIPLIER_720P,
    FHD_1080P: VIDEO_CREDIT_RATES.MULTIPLIER_1080P,
  };

  const qualMap: Record<QualityMode, number> = {
    STANDARD: VIDEO_CREDIT_RATES.MULTIPLIER_STANDARD,
    HIGH:     VIDEO_CREDIT_RATES.MULTIPLIER_HIGH,
    ULTRA:    VIDEO_CREDIT_RATES.MULTIPLIER_ULTRA,
  };

  return parseFloat((base * resMap[resolution] * qualMap[qualityMode]).toFixed(2));
}