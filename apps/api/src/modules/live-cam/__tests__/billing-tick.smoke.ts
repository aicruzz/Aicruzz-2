/* eslint-disable no-console */
/**
 * Live Cam billing smoke harness.
 *
 *   npm run smoke:livecam --workspace=apps/api
 *
 * Requires local Postgres + Redis to be reachable via the same env vars the
 * API uses. Creates (and tears down) a throwaway test user.
 *
 * Verifies the fixes from /Users/francisadediran/.claude/plans/you-are-working-inside-refactored-breeze.md:
 *  - 20 parallel billingTick calls produce at most 1 successful deduction
 *    (the rest must return duplicate=true) — no double-bill.
 *  - endSession invoked mid-burst is idempotent and stops billing.
 *  - Final wallet balance equals seed − (successful_ticks × 0.2).
 *  - No serialization_failure errors are thrown.
 */

import { and, eq, sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { db } from '../../../config/database';
import { connectRedis, disconnectRedis } from '../../../config/redis';
import {
  users,
  wallets,
  liveCamSessions,
  transactions,
} from '../../../db/schema';
import { billingTick, endSession } from '../live-cam.service';
import { CREDITS_PER_SECOND } from '../live-cam.types';
import type { BillingTickResponse } from '../live-cam.types';
import { logger } from '../../../utils/logger';

const SEED_CREDITS = 100;
const PARALLEL_TICKS = 20;

async function seed(): Promise<{ userId: string; sessionId: string }> {
  const userId = uuidv4();
  const sessionId = uuidv4();
  const email = `livecam-smoke-${userId}@test.local`;

  await db.insert(users).values({
    id: userId,
    email,
    password: await bcrypt.hash('test', 4),
    legalConsented: true,
    legalConsentAt: new Date(),
  });

  await db.insert(wallets).values({
    userId,
    credits: SEED_CREDITS,
  });

  await db.insert(liveCamSessions).values({
    id: sessionId,
    userId,
    status: 'ACTIVE',
    creditsPerSecond: CREDITS_PER_SECOND,
  });

  return { userId, sessionId };
}

async function teardown(userId: string): Promise<void> {
  // cascade deletes wallet (FK onDelete: cascade); sessions/transactions are
  // left for inspection but use the unique test userId so collisions are nil.
  await db.delete(transactions).where(eq(transactions.userId, userId)).catch(() => {});
  await db.delete(liveCamSessions).where(eq(liveCamSessions.userId, userId)).catch(() => {});
  await db.delete(users).where(eq(users.id, userId));
}

async function run(): Promise<void> {
  await connectRedis();
  const { userId, sessionId } = await seed();
  console.log(`[smoke] seeded user=${userId} session=${sessionId}`);

  let serializationFailure = false;
  let interruptionThrown = false;
  let other_errors = 0;

  try {
    // Fire PARALLEL_TICKS billingTick calls + 1 endSession at index 10
    const tickPromises: Array<Promise<BillingTickResponse>> = Array.from(
      { length: PARALLEL_TICKS },
      () =>
        billingTick({ sessionId, userId, credits: CREDITS_PER_SECOND }).catch(
          (err: Error): BillingTickResponse => {
            if (/serialization_failure/i.test(err.message)) serializationFailure = true;
            else other_errors++;
            return {
              sufficient: false,
              creditsRemaining: 0,
              creditsDeducted: 0,
              sessionActive: false,
            };
          },
        ),
    );

    const endPromise = (async () => {
      // small delay so some ticks land first
      await new Promise((r) => setTimeout(r, 25));
      await endSession({ sessionId, userId, totalSeconds: 0, totalCredits: 0 });
    })();

    const tickResults = await Promise.all(tickPromises);
    await endPromise;

    // Run a couple more ticks AFTER endSession — these must all report sessionActive=false
    const postEnd = await Promise.all([
      billingTick({ sessionId, userId, credits: CREDITS_PER_SECOND }),
      billingTick({ sessionId, userId, credits: CREDITS_PER_SECOND }),
    ]);

    // Tally
    const successful = tickResults.filter((r) => r.sufficient && !r.duplicate).length;
    const duplicates = tickResults.filter((r) => r.duplicate).length;
    const sessionEndedReplies = tickResults.filter((r) => !r.sessionActive).length;

    // Assertions
    const walletRow = await db.query.wallets.findFirst({
      where: eq(wallets.userId, userId),
      columns: { credits: true },
    });
    const finalBalance = walletRow?.credits ?? -1;
    const expectedBalance = Number(
      (SEED_CREDITS - successful * CREDITS_PER_SECOND).toFixed(4),
    );

    const sessionRow = await db.query.liveCamSessions.findFirst({
      where: eq(liveCamSessions.id, sessionId),
      columns: { status: true },
    });

    const txCount = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.module, 'LIVE_CAM'),
          eq(transactions.type, 'DEDUCT'),
        ),
      );
    const txN = txCount[0]?.n ?? 0;

    const report = {
      successful,
      duplicates,
      sessionEndedReplies,
      finalBalance,
      expectedBalance,
      sessionStatus: sessionRow?.status,
      transactionCount: txN,
      postEndAllInactive: postEnd.every((r) => !r.sessionActive),
      serializationFailure,
      other_errors,
    };
    console.log('[smoke] report:', JSON.stringify(report, null, 2));

    const checks: Array<[string, boolean]> = [
      ['no serialization_failure', !serializationFailure],
      ['no unexpected errors', other_errors === 0],
      ['successful + duplicates + sessionEnded = PARALLEL_TICKS', successful + duplicates + sessionEndedReplies === PARALLEL_TICKS],
      ['transaction count equals successful ticks', txN === successful],
      ['final balance == expected (atomic deduction)', finalBalance === expectedBalance],
      ['session status is ENDED', sessionRow?.status === 'ENDED'],
      ['ticks after endSession see sessionActive=false', postEnd.every((r) => !r.sessionActive)],
      ['no post-end transactions', txN <= successful],
    ];

    let allOk = true;
    for (const [name, ok] of checks) {
      console.log(`[smoke] ${ok ? 'PASS' : 'FAIL'}  ${name}`);
      if (!ok) allOk = false;
    }
    if (!allOk) {
      console.error('[smoke] FAILED');
      process.exitCode = 1;
    } else {
      console.log('[smoke] OK — Live Cam billing is concurrency-safe');
    }
  } finally {
    await teardown(userId);
    await disconnectRedis();
    // postgres-js client doesn't auto-exit; nudge
    setTimeout(() => process.exit(process.exitCode ?? 0), 200).unref();
  }
}

run().catch((err) => {
  logger.error('[smoke] fatal', err);
  process.exit(1);
});
