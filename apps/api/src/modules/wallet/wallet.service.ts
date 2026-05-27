import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { db } from '../../config/database';
import {
  wallets,
  transactions,
  cryptoPayments,
  activityLogs,
} from '../../db/schema';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import { calculateBonus } from '../../utils/bonus.calculator';
import { InsufficientCreditsError, AppError } from '../../middleware/error.middleware';
import {
  WalletBalance,
  FundWalletResult,
  DeductCreditsInput,
  DeductCreditsResult,
  RefundCreditsInput,
  CryptoPaymentRequest,
  CryptoApprovalInput,
  TransactionType,
} from './wallet.types';

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function computeExpiryDate(): Date {
  const d = new Date();
  d.setDate(d.getDate() + env.CREDIT_EXPIRY_DAYS);
  return d;
}

function isExpired(expiresAt: Date | null): boolean {
  if (!expiresAt) return false;
  return expiresAt < new Date();
}

async function findWallet(userId: string) {
  return db.query.wallets.findFirst({ where: eq(wallets.userId, userId) });
}

// ─────────────────────────────────────────────────────────────
// GET WALLET BALANCE
// ─────────────────────────────────────────────────────────────

export async function getWalletBalance(userId: string): Promise<WalletBalance> {
  let wallet = await findWallet(userId);

  if (!wallet) {
    const [created] = await db.insert(wallets).values({ userId }).returning();
    wallet = created;
  }

  const expired = isExpired(wallet.expiresAt);
  let daysUntilExpiry: number | null = null;

  if (wallet.expiresAt && !expired) {
    const ms = wallet.expiresAt.getTime() - Date.now();
    daysUntilExpiry = Math.ceil(ms / (1000 * 60 * 60 * 24));
  }

  return {
    credits: expired ? 0 : wallet.credits,
    pendingRestore: expired ? wallet.credits : wallet.pendingRestore,
    expiresAt: wallet.expiresAt,
    isExpired: expired,
    daysUntilExpiry,
  };
}

// ─────────────────────────────────────────────────────────────
// APPLY CREDIT EXPIRY (run before any read/write)
// ─────────────────────────────────────────────────────────────

async function applyExpiryIfNeeded(userId: string): Promise<void> {
  const wallet = await findWallet(userId);

  if (!wallet || !wallet.expiresAt) return;
  if (!isExpired(wallet.expiresAt)) return;
  if (wallet.credits === 0) return;

  await db.transaction(async (tx) => {
    await tx
      .update(wallets)
      .set({ pendingRestore: wallet.credits, credits: 0 })
      .where(eq(wallets.userId, userId));

    await tx.insert(transactions).values({
      userId,
      type: 'EXPIRY',
      status: 'COMPLETED',
      creditsBase: wallet.credits,
      creditsTotal: -wallet.credits,
      balanceBefore: wallet.credits,
      balanceAfter: 0,
      description: `Credits expired after ${env.CREDIT_EXPIRY_DAYS} days`,
      metadata: { expiredAt: wallet.expiresAt },
    });
  });

  logger.info(`Expired ${wallet.credits} credits for user ${userId}`);
}

// ─────────────────────────────────────────────────────────────
// FUND WALLET (called after successful Stripe/Crypto payment)
// ─────────────────────────────────────────────────────────────

export async function fundWallet(
  userId: string,
  usdAmount: number,
  options: {
    stripePaymentIntentId?: string;
    stripeSessionId?: string;
    cryptoPaymentId?: string;
  } = {},
): Promise<FundWalletResult> {
  // Step 1: apply expiry first
  await applyExpiryIfNeeded(userId);

  // Step 2: calculate credits + bonus
  const bonus = calculateBonus(usdAmount);

  // Step 3: get current wallet state (after expiry applied)
  const wallet = await findWallet(userId);
  const pendingRestore = wallet?.pendingRestore ?? 0;
  const currentCredits = wallet?.credits ?? 0;

  const balanceBefore = currentCredits;
  const creditsRestored = pendingRestore;
  const creditsAdded = bonus.totalCredits;
  const balanceAfter = currentCredits + creditsAdded + creditsRestored;

  const newExpiryDate = computeExpiryDate();

  const { updatedWallet, transaction } = await db.transaction(async (tx) => {
    const [w] = await tx
      .insert(wallets)
      .values({
        userId,
        credits: balanceAfter,
        pendingRestore: 0,
        totalFundedUsd: usdAmount,
        expiresAt: newExpiryDate,
        lastFundedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: wallets.userId,
        set: {
          credits: balanceAfter,
          pendingRestore: 0,
          totalFundedUsd: sql`${wallets.totalFundedUsd} + ${usdAmount}`,
          expiresAt: newExpiryDate,
          lastFundedAt: new Date(),
          updatedAt: new Date(),
        },
      })
      .returning();

    const [t] = await tx
      .insert(transactions)
      .values({
        userId,
        type: 'FUND',
        status: 'COMPLETED',
        usdAmount,
        creditsBase: bonus.baseCredits,
        creditsBonus: bonus.bonusCredits,
        creditsRestored,
        creditsTotal: creditsAdded + creditsRestored,
        balanceBefore,
        balanceAfter,
        description: `Wallet funded: $${usdAmount} → ${bonus.totalCredits} credits${
          creditsRestored > 0 ? ` + ${creditsRestored} restored` : ''
        }`,
        stripePaymentIntentId: options.stripePaymentIntentId,
        stripeSessionId: options.stripeSessionId,
        cryptoPaymentId: options.cryptoPaymentId,
        metadata: {
          bonusPercent: bonus.bonusPercent,
          tierLabel: bonus.tierLabel,
          previousExpiredCredits: pendingRestore,
          newExpiryDate,
        },
      })
      .returning();

    return { updatedWallet: w, transaction: t };
  });

  logger.info(
    `Wallet funded for user ${userId}: $${usdAmount} → ${balanceAfter} credits (restored: ${creditsRestored})`,
  );

  return {
    walletBalance: {
      credits: updatedWallet.credits,
      pendingRestore: updatedWallet.pendingRestore,
      expiresAt: updatedWallet.expiresAt,
      isExpired: false,
      daysUntilExpiry: env.CREDIT_EXPIRY_DAYS,
    },
    transaction: {
      id: transaction.id,
      type: transaction.type,
      usdAmount: transaction.usdAmount ?? 0,
      creditsBase: transaction.creditsBase,
      creditsBonus: transaction.creditsBonus,
      creditsRestored: transaction.creditsRestored,
      creditsTotal: transaction.creditsTotal,
      balanceBefore: transaction.balanceBefore,
      balanceAfter: transaction.balanceAfter,
      description: transaction.description,
    },
  };
}

// ─────────────────────────────────────────────────────────────
// DEDUCT CREDITS (called before processing starts)
// ─────────────────────────────────────────────────────────────

export async function deductCredits(input: DeductCreditsInput): Promise<DeductCreditsResult> {
  const { userId, credits, module: moduleName, description, metadata } = input;

  return await db.transaction(
    async (tx) => {
      // Apply expiry INSIDE the transaction so it's atomic
      const walletRaw = await tx.query.wallets.findFirst({ where: eq(wallets.userId, userId) });

      if (
        walletRaw &&
        walletRaw.expiresAt &&
        isExpired(walletRaw.expiresAt) &&
        walletRaw.credits > 0
      ) {
        await tx
          .update(wallets)
          .set({ pendingRestore: walletRaw.credits, credits: 0 })
          .where(eq(wallets.userId, userId));

        await tx.insert(transactions).values({
          userId,
          type: 'EXPIRY',
          status: 'COMPLETED',
          creditsBase: walletRaw.credits,
          creditsTotal: -walletRaw.credits,
          balanceBefore: walletRaw.credits,
          balanceAfter: 0,
          description: `Credits expired after ${env.CREDIT_EXPIRY_DAYS} days`,
          metadata: { expiredAt: walletRaw.expiresAt },
        });
      }

      // Atomic decrement with balance guard — single SQL statement, no read-then-write race.
      const updated = await tx
        .update(wallets)
        .set({
          credits: sql`ROUND((${wallets.credits} - ${credits})::numeric, 4)::float8`,
          updatedAt: new Date(),
        })
        .where(and(eq(wallets.userId, userId), gte(wallets.credits, credits)))
        .returning({ newCredits: wallets.credits });

      if (updated.length === 0) {
        const w = await tx.query.wallets.findFirst({
          where: eq(wallets.userId, userId),
          columns: { credits: true },
        });
        throw new InsufficientCreditsError(credits, w?.credits ?? 0);
      }

      const balanceAfter = updated[0].newCredits;
      const balanceBefore = parseFloat((balanceAfter + credits).toFixed(4));

      const [transaction] = await tx
        .insert(transactions)
        .values({
          userId,
          type: 'DEDUCT',
          status: 'COMPLETED',
          creditsBase: credits,
          creditsTotal: -credits,
          balanceBefore,
          balanceAfter,
          description,
          module: moduleName,
          metadata: metadata ?? {},
        })
        .returning({ id: transactions.id });

      return {
        success: true,
        transactionId: transaction.id,
        creditsDeducted: credits,
        balanceBefore,
        balanceAfter,
      };
    },
  );
}

// ─────────────────────────────────────────────────────────────
// REFUND CREDITS (called when processing fails)
// ─────────────────────────────────────────────────────────────

export async function refundCredits(input: RefundCreditsInput): Promise<void> {
  const { userId, credits, module: moduleName, description, originalTransactionId } = input;

  await db.transaction(async (tx) => {
    const wallet = await tx.query.wallets.findFirst({ where: eq(wallets.userId, userId) });
    const currentCredits = wallet?.credits ?? 0;
    const balanceBefore = currentCredits;
    const balanceAfter = currentCredits + credits;

    await tx
      .insert(wallets)
      .values({ userId, credits: balanceAfter })
      .onConflictDoUpdate({
        target: wallets.userId,
        set: { credits: balanceAfter, updatedAt: new Date() },
      });

    await tx.insert(transactions).values({
      userId,
      type: 'REFUND',
      status: 'COMPLETED',
      creditsBase: credits,
      creditsTotal: credits,
      balanceBefore,
      balanceAfter,
      description,
      module: moduleName,
      metadata: { originalTransactionId },
    });

    if (originalTransactionId) {
      await tx
        .update(transactions)
        .set({ status: 'REFUNDED' })
        .where(eq(transactions.id, originalTransactionId));
    }
  });

  logger.info(`Refunded ${credits} credits to user ${userId} (module: ${moduleName})`);
}

// ─────────────────────────────────────────────────────────────
// ADMIN: MANUALLY CREDIT USER
// ─────────────────────────────────────────────────────────────

export async function adminCreditUser(
  targetUserId: string,
  credits: number,
  reason: string,
  adminId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const wallet = await tx.query.wallets.findFirst({
      where: eq(wallets.userId, targetUserId),
    });
    const currentCredits = wallet?.credits ?? 0;
    const balanceBefore = currentCredits;
    const balanceAfter = currentCredits + credits;
    const newExpiry = computeExpiryDate();

    await tx
      .insert(wallets)
      .values({
        userId: targetUserId,
        credits: balanceAfter,
        expiresAt: newExpiry,
      })
      .onConflictDoUpdate({
        target: wallets.userId,
        set: { credits: balanceAfter, expiresAt: newExpiry, updatedAt: new Date() },
      });

    await tx.insert(transactions).values({
      userId: targetUserId,
      type: 'ADMIN_CREDIT',
      status: 'COMPLETED',
      creditsBase: credits,
      creditsTotal: credits,
      balanceBefore,
      balanceAfter,
      description: `Admin credit: ${reason}`,
      metadata: { adminId, reason },
    });

    await tx.insert(activityLogs).values({
      userId: adminId,
      action: 'ADMIN_CREDIT_USER',
      module: 'WALLET',
      severity: 'WARN',
      details: { targetUserId, credits, reason },
    });
  });
}

// ─────────────────────────────────────────────────────────────
// CRYPTO PAYMENT: SUBMIT
// ─────────────────────────────────────────────────────────────

export async function submitCryptoPayment(input: CryptoPaymentRequest) {
  const { userId, currency, usdAmount, txHash, proofImageUrl, notes } = input;

  if (usdAmount < env.MIN_FUND_AMOUNT) {
    throw new AppError(`Minimum funding amount is $${env.MIN_FUND_AMOUNT}`, 400);
  }

  const bonus = calculateBonus(usdAmount);

  const walletAddr = currency === 'BTC' ? env.ADMIN_WALLET_BTC : env.ADMIN_WALLET_USDT;

  const [payment] = await db
    .insert(cryptoPayments)
    .values({
      userId,
      currency,
      usdAmount,
      walletAddress: walletAddr,
      txHash,
      proofImageUrl,
      notes,
      creditsToAdd: bonus.totalCredits,
      bonusCredits: bonus.bonusCredits,
    })
    .returning();

  await db.insert(activityLogs).values({
    userId,
    action: 'CRYPTO_PAYMENT_SUBMITTED',
    module: 'WALLET',
    details: { paymentId: payment.id, currency, usdAmount },
  });

  return payment;
}

// ─────────────────────────────────────────────────────────────
// CRYPTO PAYMENT: ADMIN APPROVAL
// ─────────────────────────────────────────────────────────────

export async function approveCryptoPayment(input: CryptoApprovalInput) {
  const { paymentId, adminUserId, approved, adminNote } = input;

  const payment = await db.query.cryptoPayments.findFirst({
    where: eq(cryptoPayments.id, paymentId),
  });

  if (!payment) {
    throw new AppError('Crypto payment not found', 404);
  }

  if (payment.status !== 'PENDING' && payment.status !== 'UNDER_REVIEW') {
    throw new AppError(`Payment is already ${payment.status.toLowerCase()}`, 400);
  }

  if (!approved) {
    await db
      .update(cryptoPayments)
      .set({
        status: 'REJECTED',
        adminNote,
        approvedBy: adminUserId,
        rejectedAt: new Date(),
      })
      .where(eq(cryptoPayments.id, paymentId));

    await db.insert(activityLogs).values({
      userId: adminUserId,
      action: 'CRYPTO_PAYMENT_REJECTED',
      module: 'WALLET',
      severity: 'WARN',
      details: { paymentId, targetUserId: payment.userId, adminNote },
    });

    return { approved: false };
  }

  // Approve: fund the wallet
  const fundResult = await fundWallet(payment.userId, payment.usdAmount, {
    cryptoPaymentId: paymentId,
  });

  await db
    .update(cryptoPayments)
    .set({
      status: 'APPROVED',
      adminNote,
      approvedBy: adminUserId,
      approvedAt: new Date(),
    })
    .where(eq(cryptoPayments.id, paymentId));

  await db.insert(activityLogs).values({
    userId: adminUserId,
    action: 'CRYPTO_PAYMENT_APPROVED',
    module: 'WALLET',
    details: {
      paymentId,
      targetUserId: payment.userId,
      usdAmount: payment.usdAmount,
      creditsAdded: fundResult.transaction.creditsTotal,
    },
  });

  return { approved: true, fundResult };
}

// ─────────────────────────────────────────────────────────────
// TRANSACTION HISTORY
// ─────────────────────────────────────────────────────────────

export async function getTransactionHistory(
  userId: string,
  page = 1,
  limit = 20,
  type?: TransactionType,
) {
  const whereExpr = type
    ? and(eq(transactions.userId, userId), eq(transactions.type, type))
    : eq(transactions.userId, userId);
  const skip = (page - 1) * limit;

  const [rows, totalRows] = await Promise.all([
    db
      .select({
        id: transactions.id,
        type: transactions.type,
        status: transactions.status,
        usdAmount: transactions.usdAmount,
        creditsBase: transactions.creditsBase,
        creditsBonus: transactions.creditsBonus,
        creditsRestored: transactions.creditsRestored,
        creditsTotal: transactions.creditsTotal,
        balanceBefore: transactions.balanceBefore,
        balanceAfter: transactions.balanceAfter,
        description: transactions.description,
        module: transactions.module,
        createdAt: transactions.createdAt,
      })
      .from(transactions)
      .where(whereExpr)
      .orderBy(desc(transactions.createdAt))
      .limit(limit)
      .offset(skip),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(transactions)
      .where(whereExpr),
  ]);

  const total = totalRows[0]?.count ?? 0;

  return {
    transactions: rows,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

// ─────────────────────────────────────────────────────────────
// CHECK IF USER HAS ENOUGH CREDITS (for pre-flight checks)
// ─────────────────────────────────────────────────────────────

export async function hasEnoughCredits(userId: string, required: number): Promise<boolean> {
  await applyExpiryIfNeeded(userId);
  const wallet = await db.query.wallets.findFirst({
    where: eq(wallets.userId, userId),
    columns: { credits: true },
  });
  return (wallet?.credits ?? 0) >= required;
}
