import { and, count, desc, eq, gte, inArray, sql, sum } from 'drizzle-orm';
import { db } from '../../config/database';
import {
  users,
  transactions,
  cryptoPayments,
  apiKeys,
  apiSubscriptions,
  userSessions,
  wallets,
  activityLogs,
} from '../../db/schema';
import { AppError } from '../../middleware/error.middleware';
import { logActivity } from '../../services/activity.service';
import type { DashboardStats } from './admin.types';
import type { TransactionType } from '../wallet/wallet.types';

// ─── DASHBOARD STATS ──────────────────────────────────────────

export async function getDashboardStats(): Promise<DashboardStats> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [
    totalUsersRows,
    blockedUsersRows,
    totalRevenueRows,
    pendingCryptoRows,
    recentSignupsRows,
    activeApiKeysRows,
    totalCreditsRows,
  ] = await Promise.all([
    db.select({ n: count() }).from(users),
    db.select({ n: count() }).from(users).where(eq(users.isBlocked, true)),
    db
      .select({ total: sum(transactions.usdAmount) })
      .from(transactions)
      .where(and(eq(transactions.type, 'FUND'), eq(transactions.status, 'COMPLETED'))),
    db
      .select({ n: count() })
      .from(cryptoPayments)
      .where(eq(cryptoPayments.status, 'PENDING')),
    db.select({ n: count() }).from(users).where(gte(users.createdAt, sevenDaysAgo)),
    db.select({ n: count() }).from(apiKeys).where(eq(apiKeys.isActive, true)),
    db
      .select({ total: sum(transactions.creditsTotal) })
      .from(transactions)
      .where(
        and(
          inArray(transactions.type, ['FUND', 'ADMIN_CREDIT', 'BONUS']),
          eq(transactions.status, 'COMPLETED'),
        ),
      ),
  ]);

  const totalUsers = totalUsersRows[0]?.n ?? 0;
  const blockedUsers = blockedUsersRows[0]?.n ?? 0;
  const totalRevenuUsd = Number(totalRevenueRows[0]?.total ?? 0);
  const pendingCrypto = pendingCryptoRows[0]?.n ?? 0;
  const recentSignups = recentSignupsRows[0]?.n ?? 0;
  const activeApiKeys = activeApiKeysRows[0]?.n ?? 0;
  const totalCreditsIssued = Number(totalCreditsRows[0]?.total ?? 0);

  return {
    totalUsers,
    activeUsers: totalUsers - blockedUsers,
    blockedUsers,
    totalRevenuUsd,
    totalCreditsIssued,
    pendingCryptoPayments: pendingCrypto,
    recentSignups,
    activeApiKeys,
  };
}

// ─── BLOCK USER ───────────────────────────────────────────────

export async function blockUser(
  targetUserId: string,
  reason: string,
  adminId: string,
): Promise<void> {
  const user = await db.query.users.findFirst({ where: eq(users.id, targetUserId) });
  if (!user) throw new AppError('User not found', 404);
  if (user.role === 'ADMIN') throw new AppError('Cannot block an admin user', 403);
  if (user.isBlocked) throw new AppError('User is already blocked', 400);

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ isBlocked: true, blockedReason: reason, updatedAt: new Date() })
      .where(eq(users.id, targetUserId));
    // Invalidate all sessions immediately
    await tx
      .update(userSessions)
      .set({ isValid: false })
      .where(eq(userSessions.userId, targetUserId));
  });

  await logActivity({
    userId: adminId,
    action: 'ADMIN_BLOCK_USER',
    module: 'ADMIN',
    severity: 'WARN',
    details: { targetUserId, reason },
  });
}

// ─── UNBLOCK USER ─────────────────────────────────────────────

export async function unblockUser(targetUserId: string, adminId: string): Promise<void> {
  const user = await db.query.users.findFirst({ where: eq(users.id, targetUserId) });
  if (!user) throw new AppError('User not found', 404);
  if (!user.isBlocked) throw new AppError('User is not blocked', 400);

  await db
    .update(users)
    .set({ isBlocked: false, blockedReason: null, updatedAt: new Date() })
    .where(eq(users.id, targetUserId));

  await logActivity({
    userId: adminId,
    action: 'ADMIN_UNBLOCK_USER',
    module: 'ADMIN',
    severity: 'WARN',
    details: { targetUserId },
  });
}

// ─── GET ALL TRANSACTIONS (admin view) ────────────────────────

export async function getAllTransactions(
  page = 1,
  limit = 30,
  filters: { type?: string; userId?: string } = {},
) {
  const conditions = [];
  if (filters.type) conditions.push(eq(transactions.type, filters.type as TransactionType));
  if (filters.userId) conditions.push(eq(transactions.userId, filters.userId));
  const whereExpr = conditions.length ? and(...conditions) : undefined;

  const [rows, totalRows] = await Promise.all([
    db.query.transactions.findMany({
      where: whereExpr,
      with: {
        user: { columns: { id: true, email: true, name: true } },
      },
      orderBy: (t, { desc: d }) => d(t.createdAt),
      limit,
      offset: (page - 1) * limit,
    }),
    db
      .select({ n: count() })
      .from(transactions)
      .where(whereExpr ?? sql`true`),
  ]);

  const total = totalRows[0]?.n ?? 0;
  return { transactions: rows, total, page, limit, totalPages: Math.ceil(total / limit) };
}

// ─── GET ALL WALLETS (admin monitoring) ───────────────────────

export async function getAllWallets(page = 1, limit = 30) {
  const [walletsList, totalRows] = await Promise.all([
    db.query.wallets.findMany({
      with: {
        user: { columns: { id: true, email: true, name: true, isBlocked: true } },
      },
      orderBy: (t, { desc: d }) => d(t.credits),
      limit,
      offset: (page - 1) * limit,
    }),
    db.select({ n: count() }).from(wallets),
  ]);
  const total = totalRows[0]?.n ?? 0;
  return { wallets: walletsList, total, page, limit, totalPages: Math.ceil(total / limit) };
}

// ─── GET API SUBSCRIPTION OVERVIEW (admin) ────────────────────

export async function getApiOverview(page = 1, limit = 30) {
  const [subs, totalRows] = await Promise.all([
    db.query.apiSubscriptions.findMany({
      with: {
        user: { columns: { id: true, email: true, name: true } },
      },
      orderBy: (t, { desc: d }) => d(t.createdAt),
      limit,
      offset: (page - 1) * limit,
    }),
    db.select({ n: count() }).from(apiSubscriptions),
  ]);
  const total = totalRows[0]?.n ?? 0;
  return {
    subscriptions: subs,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}
