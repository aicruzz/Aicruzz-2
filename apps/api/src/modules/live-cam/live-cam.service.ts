import { v4 as uuidv4 } from 'uuid';
import { and, desc, eq, ne, sql } from 'drizzle-orm';
import { db } from '../../config/database';
import { liveCamSessions, wallets } from '../../db/schema';
import { deductCredits, hasEnoughCredits } from '../wallet/wallet.service';
import { logActivity } from '../../services/activity.service';
import { InsufficientCreditsError } from '../../middleware/error.middleware';
import { logger } from '../../utils/logger';
import { CREDITS_PER_SECOND } from './live-cam.types';
import type { BillingTickInput, BillingTickResponse, SessionEndInput } from './live-cam.types';
import { withSessionLock } from './live-cam.lock';

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

  // Close any stale ACTIVE sessions for this user before opening a new one —
  // prevents two parallel ACTIVE rows (and therefore two billing loops) if a
  // prior session was not cleanly ended.
  await db
    .update(liveCamSessions)
    .set({ status: 'ENDED', endedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(liveCamSessions.userId, userId), eq(liveCamSessions.status, 'ACTIVE')));

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

  // A transient DB error (e.g. Neon cold-start/latency) on a 1-second billing
  // tick must NEVER read as "session dead" — that would tear down a healthy
  // live session. Only InsufficientCreditsError genuinely ends a session; any
  // other error skips this single tick (no charge) and keeps the session alive.
  const SKIP_TICK: BillingTickResponse = {
    sufficient: true,
    creditsRemaining: -1,
    creditsDeducted: 0,
    sessionActive: true,
    duplicate: true,
  };

  const result = await withSessionLock(sessionId, async () => {
    try {
      // Verify session exists and is active. Re-read inside the lock so we don't
      // race a concurrent endSession.
      const session = await db.query.liveCamSessions.findFirst({
        where: and(
          eq(liveCamSessions.id, sessionId),
          eq(liveCamSessions.userId, userId),
          eq(liveCamSessions.status, 'ACTIVE'),
        ),
        columns: { id: true },
      });

      if (!session) {
        return {
          sufficient: false,
          creditsRemaining: 0,
          creditsDeducted: 0,
          sessionActive: false,
        } as BillingTickResponse;
      }

      try {
        await deductCredits({
          userId,
          credits,
          module: 'LIVE_CAM',
          description: `Live Cam: 1 second`,
          metadata: { sessionId },
        });
      } catch (err) {
        if (err instanceof InsufficientCreditsError) {
          await db
            .update(liveCamSessions)
            .set({ status: 'INTERRUPTED', endedAt: new Date(), updatedAt: new Date() })
            .where(
              and(eq(liveCamSessions.id, sessionId), ne(liveCamSessions.status, 'ENDED')),
            );
          return {
            sufficient: false,
            creditsRemaining: 0,
            creditsDeducted: 0,
            sessionActive: false,
          } as BillingTickResponse;
        }
        // Transient deduct error → skip this tick, keep the session alive.
        logger.warn(`billingTick: transient deduct error for ${sessionId}; skipping tick`, {
          message: err instanceof Error ? err.message : String(err),
        });
        return SKIP_TICK;
      }

      await db
        .update(liveCamSessions)
        .set({
          totalSeconds: sql`${liveCamSessions.totalSeconds} + 1`,
          totalCredits: sql`${liveCamSessions.totalCredits} + ${credits}`,
          updatedAt: new Date(),
        })
        .where(eq(liveCamSessions.id, sessionId));

      const wallet = await db.query.wallets.findFirst({
        where: eq(wallets.userId, userId),
        columns: { credits: true },
      });

      return {
        sufficient: true,
        creditsRemaining: wallet?.credits ?? 0,
        creditsDeducted: credits,
        sessionActive: true,
      } as BillingTickResponse;
    } catch (err) {
      // Transient DB error on read/update (Neon latency) → skip this tick;
      // never tear down a live session for a momentary database blip.
      logger.warn(`billingTick: transient DB error for ${sessionId}; skipping tick`, {
        message: err instanceof Error ? err.message : String(err),
      });
      return SKIP_TICK;
    }
  });

  // Lock contended — another tick is already mid-flight for this session.
  // Tell the caller to skip without re-billing.
  if (result === null) {
    return {
      sufficient: true,
      creditsRemaining: -1,
      creditsDeducted: 0,
      sessionActive: true,
      duplicate: true,
    };
  }

  return result;
}

// ─── END SESSION (called when user leaves or credits exhausted) ──

export async function endSession(input: SessionEndInput): Promise<void> {
  const { sessionId, userId, totalSeconds, totalCredits } = input;

  const runEnd = async (): Promise<void> => {
    const session = await db.query.liveCamSessions.findFirst({
      where: and(eq(liveCamSessions.id, sessionId), eq(liveCamSessions.userId, userId)),
      columns: { id: true, status: true },
    });

    if (!session) {
      logger.warn(`endSession: session ${sessionId} not found for user ${userId}`);
      return;
    }

    if (session.status === 'ENDED') {
      logger.debug(`endSession: session ${sessionId} already ENDED — noop`);
      return;
    }

    // Idempotent: only transition rows that have not already ended.
    const updated = await db
      .update(liveCamSessions)
      .set({
        status: 'ENDED',
        totalSeconds,
        totalCredits,
        endedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(eq(liveCamSessions.id, sessionId), ne(liveCamSessions.status, 'ENDED')),
      )
      .returning({ id: liveCamSessions.id });

    if (updated.length === 0) {
      logger.debug(`endSession: session ${sessionId} concurrently ended — noop`);
      return;
    }

    await logActivity({
      userId,
      action: 'LIVE_CAM_SESSION_END',
      module: 'LIVE_CAM',
      details: { sessionId, totalSeconds, totalCredits },
    });

    logger.info(
      `Live cam session ${sessionId} ended: ${totalSeconds}s, ${totalCredits.toFixed(2)} credits`,
    );
  };

  // Try once with the per-session lock so we cannot interleave with a tick.
  const locked = await withSessionLock(sessionId, runEnd);
  if (locked !== null) return;

  // Lock contended — a tick is mid-flight. Wait briefly, then retry under the lock.
  await new Promise((resolve) => setTimeout(resolve, 250));
  const retried = await withSessionLock(sessionId, runEnd);
  if (retried !== null) return;

  // Still contended — fall through and run unlocked. runEnd's WHERE clause is
  // idempotent (ne ENDED) so this is safe; worst case the in-flight tick
  // completes a deduction we will count toward the final totals on next call.
  logger.warn(`endSession: lock contended twice for ${sessionId}, running unlocked`);
  await runEnd();
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
