import { deductCredits, refundCredits } from '../modules/wallet/wallet.service';
import { CREDIT_RATES } from '../modules/wallet/wallet.types';
import { logger } from '../utils/logger';

// ─────────────────────────────────────────────────────────────
// CREDIT DEDUCTION — wrappers for each module
// All deductions happen BEFORE processing starts.
// On failure, refundCredits() is called automatically.
// ─────────────────────────────────────────────────────────────

// ── LIVE CAM ─────────────────────────────────────────────────

export async function deductLiveCamSecond(userId: string): Promise<string> {
  const result = await deductCredits({
    userId,
    credits: CREDIT_RATES.LIVE_CAM_PER_SECOND,
    module: 'LIVE_CAM',
    description: '1 second of Live Cam session',
  });
  return result.transactionId;
}

// ── VIDEO GENERATION ─────────────────────────────────────────

export interface VideoDeductionInput {
  userId: string;
  durationSeconds: number;
  resolution: 'SD_480P' | 'HD_720P' | 'FHD_1080P';
  qualityMode: 'STANDARD' | 'HIGH' | 'ULTRA';
}

export function calculateVideoCredits(input: Omit<VideoDeductionInput, 'userId'>): number {
  const { durationSeconds, resolution, qualityMode } = input;

  const base = CREDIT_RATES.VIDEO_PER_SECOND_BASE * durationSeconds;

  let resMult = 1.0;
  if (resolution === 'HD_720P') resMult = CREDIT_RATES.VIDEO_720P_MULTIPLIER;
  if (resolution === 'FHD_1080P') resMult = CREDIT_RATES.VIDEO_1080P_MULTIPLIER;

  let qualityMult = 1.0;
  if (qualityMode === 'ULTRA') qualityMult = CREDIT_RATES.VIDEO_ULTRA_MULTIPLIER;
  else if (qualityMode === 'HIGH') qualityMult = 1.3;

  return parseFloat((base * resMult * qualityMult).toFixed(2));
}

export async function deductVideoCredits(
  input: VideoDeductionInput,
): Promise<{ transactionId: string; creditsCharged: number }> {
  const credits = calculateVideoCredits(input);

  const result = await deductCredits({
    userId: input.userId,
    credits,
    module: 'VIDEO',
    description: `Video generation: ${input.durationSeconds}s at ${input.resolution} (${input.qualityMode})`,
    metadata: {
      durationSeconds: input.durationSeconds,
      resolution: input.resolution,
      qualityMode: input.qualityMode,
    },
  });

  return { transactionId: result.transactionId, creditsCharged: credits };
}

export async function refundVideoCredits(
  userId: string,
  credits: number,
  originalTransactionId: string,
): Promise<void> {
  await refundCredits({
    userId,
    credits,
    module: 'VIDEO',
    description: `Refund: video generation failed`,
    originalTransactionId,
  });
  logger.info(`Refunded ${credits} video credits to ${userId}`);
}

// ── IMAGE GENERATION ─────────────────────────────────────────

export async function deductImageCredits(
  userId: string,
  quality: 'STANDARD' | 'HIGH',
): Promise<{ transactionId: string; creditsCharged: number }> {
  const credits =
    quality === 'HIGH' ? CREDIT_RATES.IMAGE_HIGH_QUALITY : CREDIT_RATES.IMAGE_STANDARD;

  const result = await deductCredits({
    userId,
    credits,
    module: 'IMAGE',
    description: `Image generation (${quality.toLowerCase()} quality)`,
    metadata: { quality },
  });

  return { transactionId: result.transactionId, creditsCharged: credits };
}

export async function refundImageCredits(
  userId: string,
  credits: number,
  originalTransactionId: string,
): Promise<void> {
  await refundCredits({
    userId,
    credits,
    module: 'IMAGE',
    description: 'Refund: image generation failed',
    originalTransactionId,
  });
}

// ── VOICE PROCESSING ─────────────────────────────────────────

export async function deductVoiceCredits(
  userId: string,
  durationSeconds: number,
): Promise<{ transactionId: string; creditsCharged: number }> {
  const credits = parseFloat(
    (CREDIT_RATES.VOICE_PER_SECOND * durationSeconds).toFixed(2),
  );

  const result = await deductCredits({
    userId,
    credits,
    module: 'VOICE',
    description: `Voice processing: ${durationSeconds}s`,
    metadata: { durationSeconds },
  });

  return { transactionId: result.transactionId, creditsCharged: credits };
}

export async function refundVoiceCredits(
  userId: string,
  credits: number,
  originalTransactionId: string,
): Promise<void> {
  await refundCredits({
    userId,
    credits,
    module: 'VOICE',
    description: 'Refund: voice processing failed',
    originalTransactionId,
  });
}
