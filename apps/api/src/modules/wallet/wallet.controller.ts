import { Request, Response } from 'express';
import { and, desc, eq, sql } from 'drizzle-orm';
import * as walletService from './wallet.service';
import { sendSuccess, sendCreated, sendError } from '../../utils/response';
import { previewAllTiers } from '../../utils/bonus.calculator';
import { env } from '../../config/env';
import { db } from '../../config/database';
import { cryptoPayments, transactions, users } from '../../db/schema';
import type { TransactionType, CryptoCurrency, CryptoStatus } from './wallet.types';

// ─── GET BALANCE ────────────────────────────────────────────

export async function getBalance(req: Request, res: Response): Promise<void> {
  const balance = await walletService.getWalletBalance(req.user!.userId);
  sendSuccess(res, balance, 'Wallet balance retrieved');
}

// ─── PREVIEW CREDITS (before funding) ───────────────────────

export async function previewCredits(req: Request, res: Response): Promise<void> {
  const usdAmount = parseFloat(req.query.amount as string);

  if (isNaN(usdAmount) || usdAmount < env.MIN_FUND_AMOUNT) {
    sendError(res, `Minimum amount is $${env.MIN_FUND_AMOUNT}`, 400);
    return;
  }

  const preview = previewAllTiers(usdAmount);
  sendSuccess(res, preview, 'Credit preview calculated');
}

// ─── TRANSACTION HISTORY ────────────────────────────────────

export async function getTransactions(req: Request, res: Response): Promise<void> {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const type = req.query.type as TransactionType | undefined;

  const result = await walletService.getTransactionHistory(
    req.user!.userId,
    page,
    limit,
    type,
  );

  sendSuccess(res, result.transactions, 'Transactions retrieved', 200, {
    page: result.page,
    limit: result.limit,
    total: result.total,
    totalPages: result.totalPages,
  });
}

// ─── SUBMIT CRYPTO PAYMENT ───────────────────────────────────

export async function submitCryptoPayment(req: Request, res: Response): Promise<void> {
  const { currency, usdAmount, txHash, notes } = req.body;

  const proofImageUrl = req.file
    ? `/uploads/crypto-proofs/${req.file.filename}`
    : undefined;

  const payment = await walletService.submitCryptoPayment({
    userId: req.user!.userId,
    currency: currency as CryptoCurrency,
    usdAmount: parseFloat(usdAmount),
    txHash,
    proofImageUrl,
    notes,
  });

  const walletAddresses = {
    BTC: env.ADMIN_WALLET_BTC,
    USDT_TRC20: env.ADMIN_WALLET_USDT,
    USDT_ERC20: env.ADMIN_WALLET_USDT,
  };

  sendCreated(
    res,
    {
      payment,
      instructions: {
        sendTo: walletAddresses[currency as keyof typeof walletAddresses],
        currency,
        usdAmount,
        note: 'Payment will be credited within 1–24 hours after admin verification.',
      },
    },
    'Crypto payment submitted. Awaiting verification.',
  );
}

// ─── ADMIN: GET ALL CRYPTO PAYMENTS ─────────────────────────

export async function adminGetCryptoPayments(req: Request, res: Response): Promise<void> {
  const status = req.query.status as CryptoStatus | undefined;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;

  const whereExpr = status ? eq(cryptoPayments.status, status) : undefined;

  const [payments, totalRows] = await Promise.all([
    db.query.cryptoPayments.findMany({
      where: whereExpr,
      with: {
        user: { columns: { id: true, email: true, name: true } },
      },
      orderBy: (t, { desc: d }) => d(t.createdAt),
      limit,
      offset: (page - 1) * limit,
    }),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(cryptoPayments)
      .where(whereExpr ?? sql`true`),
  ]);

  const total = totalRows[0]?.count ?? 0;

  sendSuccess(res, payments, 'Crypto payments retrieved', 200, {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
}

// ─── ADMIN: APPROVE / REJECT CRYPTO PAYMENT ─────────────────

export async function adminApproveCryptoPayment(req: Request, res: Response): Promise<void> {
  const { paymentId } = req.params;
  const { approved, adminNote } = req.body;

  const result = await walletService.approveCryptoPayment({
    paymentId,
    adminUserId: req.user!.userId,
    approved: approved === true || approved === 'true',
    adminNote,
  });

  sendSuccess(
    res,
    result,
    approved ? 'Payment approved and credits added' : 'Payment rejected',
  );
}

// ─── ADMIN: MANUALLY CREDIT USER ────────────────────────────

export async function adminCreditUser(req: Request, res: Response): Promise<void> {
  const { userId } = req.params;
  const { credits, reason } = req.body;

  await walletService.adminCreditUser(userId, parseFloat(credits), reason, req.user!.userId);

  sendSuccess(res, { userId, creditsAdded: credits }, `Added ${credits} credits to user`);
}

// ─── ADMIN: GET USER WALLET ──────────────────────────────────

export async function adminGetUserWallet(req: Request, res: Response): Promise<void> {
  const { userId } = req.params;

  const balance = await walletService.getWalletBalance(userId);

  const recentTx = await db
    .select()
    .from(transactions)
    .where(eq(transactions.userId, userId))
    .orderBy(desc(transactions.createdAt))
    .limit(10);

  sendSuccess(res, { balance, recentTransactions: recentTx }, 'User wallet retrieved');
}
