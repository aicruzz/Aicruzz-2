import { Request, Response } from 'express';
import { aiRouter } from '../../services/ai-router.client';
import { deductCredits, refundCredits } from '../wallet/wallet.service';
import { CHAT_CREDITS_PER_MESSAGE } from '../chat/chat.types';
import { calculateVideoCredits } from '../video/video.types';
import { getCartoonCredits } from '../cartoon/cartoon.types';
import { logger } from '../../utils/logger';
import { logActivity } from '../../services/activity.service';
import { CLIENT_AI_UNAVAILABLE } from '../../constants/client-safe-messages';

// Helper to set credit info headers
function setCreditHeaders(res: Response, charged: number, balance: number): void {
  res.setHeader('X-Credits-Charged', charged.toFixed(2));
  res.setHeader('X-Credits-Remaining', (balance - charged).toFixed(2));
}

// ─── POST /v1/chat/completions ────────────────────────────────

export async function chatCompletion(req: Request, res: Response): Promise<void> {
  const { userId, creditsBalance } = req.apiContext!;
  const body = req.body as {
    messages?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
    model?: string;
    systemPrompt?: string;
    strategy?: 'COST' | 'SPEED' | 'QUALITY' | 'AUTO';
  };

  if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
    res.status(400).json({ error: 'invalid_request', message: 'messages array is required' });
    return;
  }

  const credits = CHAT_CREDITS_PER_MESSAGE;
  if (creditsBalance < credits) {
    res.status(402).json({ error: 'insufficient_credits', creditsRequired: credits });
    return;
  }

  const deduction = await deductCredits({
    userId, credits, module: 'CHAT_API',
    description: 'Public API chat completion',
  });

  try {
    const result = await aiRouter.route({
      userId,
      module: 'CHAT',
      strategy: body.strategy ?? 'AUTO',
      messages: body.messages,
      systemPrompt: body.systemPrompt,
      model: body.model,
    });

    if (!result.success) {
      await refundCredits({
        userId, credits, module: 'CHAT_API',
        description: 'Refund: chat API failed',
        originalTransactionId: deduction.transactionId,
      });
      logger.warn('Public API chat: router failure', {
        internalError: result.result.error,
        provider: result.provider,
      });
      res.status(502).json({ error: 'ai_provider_error', message: CLIENT_AI_UNAVAILABLE });
      return;
    }

    setCreditHeaders(res, credits, creditsBalance);
    res.json({
      id: result.requestId,
      provider: result.provider,
      message: { role: 'assistant', content: result.result.text },
      tokensUsed: result.result.tokensUsed,
      latencyMs: result.totalLatencyMs,
      fallbackUsed: result.fallbackUsed,
    });
  } catch (err) {
    await refundCredits({
      userId, credits, module: 'CHAT_API',
      description: 'Refund: chat API exception',
      originalTransactionId: deduction.transactionId,
    });
    logger.error('Public API chat error:', err);
    res.status(500).json({ error: 'internal_error', message: 'AI processing failed' });
  }
}

// ─── POST /v1/image/generate ──────────────────────────────────

export async function imageGenerate(req: Request, res: Response): Promise<void> {
  const { userId, creditsBalance } = req.apiContext!;
  const body = req.body as {
    prompt?: string;
    width?: number;
    height?: number;
    quality?: 'STANDARD' | 'HIGH';
    strategy?: 'COST' | 'SPEED' | 'QUALITY' | 'AUTO';
  };

  if (!body.prompt) {
    res.status(400).json({ error: 'invalid_request', message: 'prompt is required' });
    return;
  }

  const credits = body.quality === 'HIGH' ? 10 : 5;
  if (creditsBalance < credits) {
    res.status(402).json({ error: 'insufficient_credits', creditsRequired: credits });
    return;
  }

  const deduction = await deductCredits({
    userId, credits, module: 'IMAGE_API',
    description: 'Public API image generation',
  });

  try {
    const result = await aiRouter.route({
      userId,
      module: 'IMAGE',
      strategy: body.strategy ?? 'AUTO',
      prompt: body.prompt,
      width: body.width ?? 1024,
      height: body.height ?? 1024,
      qualityMode: body.quality === 'HIGH' ? 'ULTRA' : 'STANDARD',
    });

    if (!result.success) {
      await refundCredits({
        userId, credits, module: 'IMAGE_API',
        description: 'Refund: image API failed',
        originalTransactionId: deduction.transactionId,
      });
      logger.warn('Public API image: router failure', {
        internalError: result.result.error,
        provider: result.provider,
      });
      res.status(502).json({ error: 'ai_provider_error', message: CLIENT_AI_UNAVAILABLE });
      return;
    }

    setCreditHeaders(res, credits, creditsBalance);
    res.json({
      id: result.requestId,
      provider: result.provider,
      url: result.result.outputUrl,
      latencyMs: result.totalLatencyMs,
    });
  } catch (err) {
    await refundCredits({
      userId, credits, module: 'IMAGE_API',
      description: 'Refund: image API exception',
      originalTransactionId: deduction.transactionId,
    });
    logger.error('Public API image error:', err);
    res.status(500).json({ error: 'internal_error' });
  }
}

// ─── POST /v1/video/generate (async — returns job ID) ────────

export async function videoGenerate(req: Request, res: Response): Promise<void> {
  const { userId, creditsBalance } = req.apiContext!;
  const body = req.body as {
    prompt?: string;
    durationSeconds?: number;
    resolution?: 'SD_480P' | 'HD_720P' | 'FHD_1080P';
    qualityMode?: 'STANDARD' | 'HIGH' | 'ULTRA';
    inputImageUrl?: string;
    webhookUrl?: string;
  };

  if (!body.prompt) {
    res.status(400).json({ error: 'invalid_request', message: 'prompt is required' });
    return;
  }

  const duration = body.durationSeconds ?? 5;
  const resolution = body.resolution ?? 'HD_720P';
  const quality = body.qualityMode ?? 'STANDARD';
  const credits = calculateVideoCredits(duration, resolution, quality);

  if (creditsBalance < credits) {
    res.status(402).json({ error: 'insufficient_credits', creditsRequired: credits });
    return;
  }

  const deduction = await deductCredits({
    userId, credits, module: 'VIDEO_API',
    description: 'Public API video generation',
  });

  try {
    const result = await aiRouter.route({
      userId,
      module: 'VIDEO',
      strategy: quality === 'ULTRA' ? 'QUALITY' : 'AUTO',
      prompt: body.prompt,
      inputImageUrl: body.inputImageUrl,
      durationSeconds: duration,
      resolution,
      qualityMode: quality,
      webhookUrl: body.webhookUrl,
    });

    setCreditHeaders(res, credits, creditsBalance);
    res.status(202).json({
      id: result.requestId,
      status: 'QUEUED',
      jobId: (result.result.raw as { jobId?: string } | undefined)?.jobId,
      message: 'Video generation queued. Poll /v1/jobs/:jobId or wait for webhook.',
      creditsCharged: credits,
    });
  } catch (err) {
    await refundCredits({
      userId, credits, module: 'VIDEO_API',
      description: 'Refund: video API exception',
      originalTransactionId: deduction.transactionId,
    });
    logger.error('Public API video error:', err);
    res.status(500).json({ error: 'internal_error' });
  }
}

// ─── POST /v1/voice/generate ──────────────────────────────────

export async function voiceGenerate(req: Request, res: Response): Promise<void> {
  const { userId, creditsBalance } = req.apiContext!;
  const body = req.body as {
    text?: string;
    voiceId?: string;
    voiceGender?: 'MALE' | 'FEMALE';
    audioFormat?: 'mp3' | 'wav' | 'ogg';
  };

  if (!body.text) {
    res.status(400).json({ error: 'invalid_request', message: 'text is required' });
    return;
  }

  // Credit calc: estimate at ~15 chars/sec, 0.5 credits/sec
  const estimatedSeconds = Math.max(1, body.text.length / 15);
  const credits = parseFloat((estimatedSeconds * 0.5).toFixed(2));

  if (creditsBalance < credits) {
    res.status(402).json({ error: 'insufficient_credits', creditsRequired: credits });
    return;
  }

  const deduction = await deductCredits({
    userId, credits, module: 'VOICE_API',
    description: 'Public API voice generation',
  });

  try {
    const result = await aiRouter.route({
      userId,
      module: 'VOICE',
      strategy: 'QUALITY',
      text: body.text,
      voiceId: body.voiceId,
      voiceGender: body.voiceGender,
      audioFormat: body.audioFormat ?? 'mp3',
    });

    if (!result.success) {
      await refundCredits({
        userId, credits, module: 'VOICE_API',
        description: 'Refund: voice API failed',
        originalTransactionId: deduction.transactionId,
      });
      logger.warn('Public API voice: router failure', {
        internalError: result.result.error,
        provider: result.provider,
      });
      res.status(502).json({ error: 'ai_provider_error', message: CLIENT_AI_UNAVAILABLE });
      return;
    }

    setCreditHeaders(res, credits, creditsBalance);
    res.json({
      id: result.requestId,
      provider: result.provider,
      audioUrl: result.result.audioUrl,
      durationSeconds: result.result.durationSeconds,
    });
  } catch (err) {
    await refundCredits({
      userId, credits, module: 'VOICE_API',
      description: 'Refund: voice API exception',
      originalTransactionId: deduction.transactionId,
    });
    logger.error('Public API voice error:', err);
    res.status(500).json({ error: 'internal_error' });
  }
}

// ─── POST /v1/cartoon/generate (async) ────────────────────────

export async function cartoonGenerate(req: Request, res: Response): Promise<void> {
  const { userId, creditsBalance } = req.apiContext!;
  const body = req.body as {
    type?: 'ANIMATED_AD' | 'HUMAN_CARTOON' | 'CUSTOM';
    prompt?: string;
    inputImageUrl?: string;
    durationSecs?: number;
    webhookUrl?: string;
  };

  const type = body.type ?? 'CUSTOM';
  const credits = getCartoonCredits(type, body.durationSecs);

  if (creditsBalance < credits) {
    res.status(402).json({ error: 'insufficient_credits', creditsRequired: credits });
    return;
  }

  const deduction = await deductCredits({
    userId, credits, module: 'CARTOON_API',
    description: 'Public API cartoon generation',
  });

  try {
    const result = await aiRouter.route({
      userId,
      module: 'CARTOON',
      strategy: 'AUTO',
      prompt: body.prompt,
      inputImageUrl: body.inputImageUrl,
      durationSeconds: body.durationSecs ?? 5,
      webhookUrl: body.webhookUrl,
    });

    setCreditHeaders(res, credits, creditsBalance);
    res.status(202).json({
      id: result.requestId,
      status: 'QUEUED',
      jobId: (result.result.raw as { jobId?: string } | undefined)?.jobId,
      creditsCharged: credits,
    });
  } catch (err) {
    await refundCredits({
      userId, credits, module: 'CARTOON_API',
      description: 'Refund: cartoon API exception',
      originalTransactionId: deduction.transactionId,
    });
    logger.error('Public API cartoon error:', err);
    res.status(500).json({ error: 'internal_error' });
  }
}

// ─── GET /v1/jobs/:jobId — poll async job status ─────────────

export async function getJobStatus(req: Request, res: Response): Promise<void> {
  try {
    const status = await aiRouter.getJobStatus(req.params.jobId);
    res.json(status);
  } catch (err) {
    logger.error('Public API job status error:', err);
    res.status(500).json({ error: 'internal_error' });
  }
}

// ─── GET /v1/usage — return current usage stats ──────────────

export async function getUsage(req: Request, res: Response): Promise<void> {
  const { userId, plan } = req.apiContext!;

  const { db } = await import('../../config/database');
  const { apiSubscriptions, wallets } = await import('../../db/schema');
  const { eq } = await import('drizzle-orm');

  const sub = await db.query.apiSubscriptions.findFirst({
    where: eq(apiSubscriptions.userId, userId),
    columns: {
      plan: true,
      status: true,
      requestsPerMinute: true,
      requestsPerMonth: true,
      requestsUsedThisMonth: true,
      currentPeriodStart: true,
      currentPeriodEnd: true,
    },
  });

  const wallet = await db.query.wallets.findFirst({
    where: eq(wallets.userId, userId),
    columns: { credits: true, expiresAt: true },
  });

  res.json({
    subscription: sub,
    credits: wallet,
    plan,
  });
}
