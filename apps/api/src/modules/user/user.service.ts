import { and, count, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import path from 'path';
import { db } from '../../config/database';
import { users, transactions } from '../../db/schema';
import { AppError } from '../../middleware/error.middleware';
import { deleteFile } from '../../services/upload.service';
import type { UpdateProfileInput } from './user.types';

const USER_COLUMNS = {
  id: true,
  email: true,
  name: true,
  role: true,
  avatarUrl: true,
  legalConsented: true,
  legalConsentAt: true,
  emailVerified: true,
  isBlocked: true,
  createdAt: true,
} as const;

async function txCount(userId: string): Promise<number> {
  const rows = await db
    .select({ n: count() })
    .from(transactions)
    .where(eq(transactions.userId, userId));
  return rows[0]?.n ?? 0;
}

async function loadUserWithExtras(userId: string) {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: USER_COLUMNS,
    with: {
      wallet: {
        columns: {
          credits: true,
          pendingRestore: true,
          expiresAt: true,
          totalFundedUsd: true,
        },
      },
    },
  });
  if (!user) return null;
  return { ...user, _count: { transactions: await txCount(userId) } };
}

// ─── GET PROFILE ─────────────────────────────────────────────

export async function getProfile(userId: string) {
  const user = await loadUserWithExtras(userId);
  if (!user) throw new AppError('User not found', 404);
  return user;
}

// ─── UPDATE PROFILE ───────────────────────────────────────────

export async function updateProfile(userId: string, input: UpdateProfileInput) {
  const existing = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { id: true },
  });
  if (!existing) throw new AppError('User not found', 404);

  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name !== undefined) update.name = input.name;
  if (input.avatarUrl !== undefined) update.avatarUrl = input.avatarUrl;

  await db.update(users).set(update).where(eq(users.id, userId));

  return (await loadUserWithExtras(userId))!;
}

// ─── UPLOAD AVATAR ────────────────────────────────────────────

export async function updateAvatar(userId: string, filename: string) {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { avatarUrl: true },
  });

  // Delete old avatar file if exists
  if (user?.avatarUrl) {
    const oldFilename = path.basename(user.avatarUrl);
    deleteFile('avatars', oldFilename);
  }

  const avatarUrl = `/uploads/avatars/${filename}`;

  await db
    .update(users)
    .set({ avatarUrl, updatedAt: new Date() })
    .where(eq(users.id, userId));

  return (await loadUserWithExtras(userId))!;
}

// ─── LIST USERS (admin) ───────────────────────────────────────

export async function listUsers(filters: {
  page?: number;
  limit?: number;
  search?: string;
  role?: 'USER' | 'ADMIN';
  isBlocked?: boolean;
}) {
  const { page = 1, limit = 20, search, role, isBlocked } = filters;

  const conditions: SQL[] = [];
  if (search) {
    const pattern = `%${search}%`;
    conditions.push(or(ilike(users.email, pattern), ilike(users.name, pattern))!);
  }
  if (role) conditions.push(eq(users.role, role));
  if (isBlocked !== undefined) conditions.push(eq(users.isBlocked, isBlocked));
  const whereExpr = conditions.length ? and(...conditions) : undefined;

  const [list, totalRows] = await Promise.all([
    db.query.users.findMany({
      where: whereExpr,
      columns: USER_COLUMNS,
      with: {
        wallet: {
          columns: {
            credits: true,
            pendingRestore: true,
            expiresAt: true,
            totalFundedUsd: true,
          },
        },
      },
      orderBy: (t, { desc: d }) => d(t.createdAt),
      limit,
      offset: (page - 1) * limit,
    }),
    db
      .select({ n: count() })
      .from(users)
      .where(whereExpr ?? sql`true`),
  ]);

  const total = totalRows[0]?.n ?? 0;

  // Attach per-user transaction counts
  const usersWithCounts = await Promise.all(
    list.map(async (u) => ({ ...u, _count: { transactions: await txCount(u.id) } })),
  );

  return { users: usersWithCounts, total, page, limit, totalPages: Math.ceil(total / limit) };
}

// ─── GET SINGLE USER (admin) ──────────────────────────────────

export async function getUserById(userId: string) {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: USER_COLUMNS,
    with: {
      wallet: {
        columns: {
          credits: true,
          pendingRestore: true,
          expiresAt: true,
          totalFundedUsd: true,
        },
      },
      sessions: {
        columns: {
          id: true,
          isValid: true,
          deviceInfo: true,
          ipAddress: true,
          createdAt: true,
          expiresAt: true,
        },
        orderBy: (t, { desc: d }) => d(t.createdAt),
        limit: 5,
      },
      legalConsents: {
        columns: { module: true, version: true, acceptedAt: true },
      },
    },
  });
  if (!user) throw new AppError('User not found', 404);
  return { ...user, _count: { transactions: await txCount(userId) } };
}
