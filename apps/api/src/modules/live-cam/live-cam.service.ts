import { v4 as uuidv4 } from 'uuid';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../../config/database';
import { liveCamSessions, wallets } from '../../db/schema';
import { deductCredits, hasEnoughCredits } from '../wallet/wallet.service';
import { logActivity } from '../../services/activity.service';
import { AppError, InsufficientCreditsError } from '../../middleware/error.middleware';
import { logger } from '../../utils/logger';
import { CREDITS_PER_SECOND } from './live-cam.types';
import type { BillingTickInput, BillingTickResponse, SessionEndInput } from './live-cam.types';

const WEBRTC_URL = process.env.WEBRTC_URL ?? 'http://localhost:4002';
const WS_URL = (process.env.WEBRTC_WS_URL ?? 'ws://localhost:4002').replace(/^http/, 'ws');

// Minimum credits needed to start a session (at least 60 seconds worth)
const MIN_CREDITS_TO_START = CREDITS_PER_SECOND * 60;

// ─── START SESSION ────────────────────────────────────────────

export async function startSession(userId: string) {

  const hasCredits = await hasEnoughCredits(userId, MIN_CREDITS_TO_START);
  if (!hasCredits) {
    throw new InsufficientCreditsError(MIN_CREDITS_TO_START, 0);
  }

  const sessionId = uuidv4();
  const roomId = uuidv4();

  await db.insert(liveCamSessions).values({
    id: sessionId,
    userId,
    status: 'ACTIVE',
    creditsPerSecond: CREDITS_PER_SECOND,
  });

  await logActivity({
    userId,
    action: 'LIVE_CAM_SESSION_START',
    module: 'LIVE_CAM',
    details: { sessionId, roomId },
  });

  return {
    sessionId,
    roomId,
    wsUrl: `${WS_URL}/ws`,
    creditsPerSecond: CREDITS_PER_SECOND,
  };
}

// ─── BILLING TICK (called by WebRTC server every second) ──────

export async function billingTick(input: BillingTickInput): Promise<BillingTickResponse> {
  const { sessionId, userId, credits } = input;

  // Verify session exists and is active
  const session = await db.query.liveCamSessions.findFirst({
    where: and(
      eq(liveCamSessions.id, sessionId),
      eq(liveCamSessions.userId, userId),
      eq(liveCamSessions.status, 'ACTIVE'),
    ),
  });

  if (!session) {
    return { sufficient: false, creditsRemaining: 0, creditsDeducted: 0 };
  }

  // Check balance first
  const sufficient = await hasEnoughCredits(userId, credits);
  if (!sufficient) {
    // End session due to insufficient credits
    await db
      .update(liveCamSessions)
      .set({ status: 'INTERRUPTED', endedAt: new Date(), updatedAt: new Date() })
      .where(eq(liveCamSessions.id, sessionId));
    return { sufficient: false, creditsRemaining: 0, creditsDeducted: 0 };
  }

  // Deduct credits
  await deductCredits({
    userId,
    credits,
    module: 'LIVE_CAM',
    description: `Live Cam: 1 second`,
    metadata: { sessionId },
  });

  // Update session totals
  await db
    .update(liveCamSessions)
    .set({
      totalSeconds: sql`${liveCamSessions.totalSeconds} + 1`,
      totalCredits: sql`${liveCamSessions.totalCredits} + ${credits}`,
      updatedAt: new Date(),
    })
    .where(eq(liveCamSessions.id, sessionId));

  // Get updated balance
  const wallet = await db.query.wallets.findFirst({
    where: eq(wallets.userId, userId),
    columns: { credits: true },
  });

  return {
    sufficient: true,
    creditsRemaining: wallet?.credits ?? 0,
    creditsDeducted: credits,
  };
}

// ─── END SESSION (called when user leaves or credits exhausted) ──

export async function endSession(input: SessionEndInput): Promise<void> {
  const { sessionId, userId, totalSeconds, totalCredits } = input;

  const session = await db.query.liveCamSessions.findFirst({
    where: and(eq(liveCamSessions.id, sessionId), eq(liveCamSessions.userId, userId)),
    columns: { id: true },
  });

  if (!session) {
    logger.warn(`endSession: session ${sessionId} not found for user ${userId}`);
    return;
  }

  await db
    .update(liveCamSessions)
    .set({
      status: 'ENDED',
      totalSeconds,
      totalCredits,
      endedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(liveCamSessions.id, sessionId));

  await logActivity({
    userId,
    action: 'LIVE_CAM_SESSION_END',
    module: 'LIVE_CAM',
    details: { sessionId, totalSeconds, totalCredits },
  });

  logger.info(
    `Live cam session ${sessionId} ended: ${totalSeconds}s, ${totalCredits.toFixed(2)} credits`,
  );
}

// ─── GET ACTIVE SESSION ───────────────────────────────────────

export async function getActiveSession(userId: string) {
  return db.query.liveCamSessions.findFirst({
    where: and(eq(liveCamSessions.userId, userId), eq(liveCamSessions.status, 'ACTIVE')),
    orderBy: (t, { desc: d }) => d(t.createdAt),
  });
}

// ─── GET SESSION HISTORY ──────────────────────────────────────

export async function getSessionHistory(userId: string, page = 1, limit = 20) {
  const [sessions, totalRows] = await Promise.all([
    db
      .select()
      .from(liveCamSessions)
      .where(eq(liveCamSessions.userId, userId))
      .orderBy(desc(liveCamSessions.createdAt))
      .limit(limit)
      .offset((page - 1) * limit),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(liveCamSessions)
      .where(eq(liveCamSessions.userId, userId)),
  ]);
  const total = totalRows[0]?.count ?? 0;

  return { sessions, total, totalPages: Math.ceil(total / limit) };
}
