import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../../config/database';
import { users, wallets, userSessions, legalConsents, activityLogs } from '../../db/schema';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import { AppError, UnauthorizedError } from '../../middleware/error.middleware';
import type { SignupInput, LoginInput, AuthResponse, AuthUser } from './auth.types';
import type { JwtPayload } from '../../middleware/auth.middleware';

const BCRYPT_ROUNDS = 12;

// ─────────────────────────────────────────────────────────────
// TOKEN GENERATION
// ─────────────────────────────────────────────────────────────

interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
  sessionId: string;
}

function signAccessToken(payload: Omit<JwtPayload, 'sessionId'>, sessionId: string): string {
  return jwt.sign({ ...payload, sessionId, typ: 'access' }, env.JWT_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

function signRefreshToken(payload: Omit<JwtPayload, 'sessionId'>, sessionId: string): string {
  return jwt.sign({ ...payload, sessionId, typ: 'refresh' }, env.JWT_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function parseDuration(raw: string, fallbackMs: number): number {
  const match = raw.match(/^(\d+)([smhd])$/);
  if (!match) return fallbackMs;
  const [, amount, unit] = match;
  const ms: Record<string, number> = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return parseInt(amount, 10) * (ms[unit] ?? 86400000);
}

function getRefreshExpiry(): Date {
  return new Date(Date.now() + parseDuration(env.JWT_REFRESH_EXPIRES_IN, 30 * 86400000));
}

async function issueTokens(
  userId: string,
  email: string,
  role: string,
  ip?: string,
  userAgent?: string,
): Promise<IssuedTokens> {
  const sessionId = crypto.randomUUID();
  const refreshExpiresAt = getRefreshExpiry();

  const accessToken = signAccessToken({ userId, email, role }, sessionId);
  const refreshToken = signRefreshToken({ userId, email, role }, sessionId);

  await db.insert(userSessions).values({
    userId,
    tokenHash: hashToken(sessionId),
    deviceInfo: userAgent,
    ipAddress: ip,
    expiresAt: refreshExpiresAt,
  });

  return { accessToken, refreshToken, refreshExpiresAt, sessionId };
}

// ─────────────────────────────────────────────────────────────
// BUILD AUTH USER RESPONSE
// ─────────────────────────────────────────────────────────────

async function buildAuthUser(userId: string): Promise<AuthUser> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { id: true, email: true, name: true, role: true, legalConsented: true },
    with: { wallet: { columns: { credits: true, expiresAt: true } } },
  });

  if (!user) throw new AppError('User not found', 404);
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    legalConsented: user.legalConsented,
    wallet: user.wallet ? { credits: user.wallet.credits, expiresAt: user.wallet.expiresAt } : null,
  };
}

// ─────────────────────────────────────────────────────────────
// SIGNUP
// ─────────────────────────────────────────────────────────────

export async function signup(
  input: SignupInput,
  ip?: string,
  userAgent?: string,
): Promise<AuthResponse & { refreshToken: string; refreshExpiresAt: Date; accessExpiresIn: string }> {
  const { email, password, name, legalConsented } = input;

  const existing = await db.query.users.findFirst({
    where: eq(users.email, email),
    columns: { id: true },
  });
  if (existing) {
    throw new AppError('An account with this email already exists', 409);
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const user = await db.transaction(async (tx) => {
    const [newUser] = await tx
      .insert(users)
      .values({
        email,
        password: passwordHash,
        name,
        legalConsented,
        legalConsentAt: legalConsented ? new Date() : null,
      })
      .returning();

    await tx.insert(wallets).values({
      userId: newUser.id,
      credits: 0,
      pendingRestore: 0,
    });

    if (legalConsented) {
      await tx.insert(legalConsents).values({
        userId: newUser.id,
        module: 'SIGNUP',
        version: '1.0',
        ipAddress: ip,
        userAgent,
      });
    }

    await tx.insert(activityLogs).values({
      userId: newUser.id,
      action: 'USER_SIGNUP',
      module: 'AUTH',
      ipAddress: ip,
      userAgent,
    });

    return newUser;
  });

  const tokens = await issueTokens(user.id, user.email, user.role, ip, userAgent);

  logger.info(`New signup: ${email} (${user.id})`);

  const authUser = await buildAuthUser(user.id);

  return {
    user: authUser,
    tokens: { accessToken: tokens.accessToken, expiresIn: env.JWT_ACCESS_EXPIRES_IN },
    refreshToken: tokens.refreshToken,
    refreshExpiresAt: tokens.refreshExpiresAt,
    accessExpiresIn: env.JWT_ACCESS_EXPIRES_IN,
  };
}

// ─────────────────────────────────────────────────────────────
// LOGIN
// ─────────────────────────────────────────────────────────────

export async function login(
  input: LoginInput,
  ip?: string,
  userAgent?: string,
): Promise<AuthResponse & { refreshToken: string; refreshExpiresAt: Date; accessExpiresIn: string }> {
  const { email, password } = input;

  const user = await db.query.users.findFirst({ where: eq(users.email, email) });

  if (!user) {
    await bcrypt.compare(password, '$2b$12$invalidhashtopreventtimingattacks.padding');
    throw new UnauthorizedError('Invalid email or password');
  }

  if (user.isBlocked) {
    throw new AppError('Your account has been blocked. Contact support.', 403);
  }

  const passwordMatch = await bcrypt.compare(password, user.password);
  if (!passwordMatch) {
    await db.insert(activityLogs).values({
      userId: user.id,
      action: 'LOGIN_FAILED',
      module: 'AUTH',
      severity: 'WARN',
      ipAddress: ip,
      userAgent,
      details: { reason: 'wrong_password' },
    });
    throw new UnauthorizedError('Invalid email or password');
  }

  const tokens = await issueTokens(user.id, user.email, user.role, ip, userAgent);

  await db.insert(activityLogs).values({
    userId: user.id,
    action: 'USER_LOGIN',
    module: 'AUTH',
    ipAddress: ip,
    userAgent,
  });

  logger.info(`Login: ${email}`);

  const authUser = await buildAuthUser(user.id);

  return {
    user: authUser,
    tokens: { accessToken: tokens.accessToken, expiresIn: env.JWT_ACCESS_EXPIRES_IN },
    refreshToken: tokens.refreshToken,
    refreshExpiresAt: tokens.refreshExpiresAt,
    accessExpiresIn: env.JWT_ACCESS_EXPIRES_IN,
  };
}

// ─────────────────────────────────────────────────────────────
// REFRESH (rotate refresh token + new access token, slide expiry)
// ─────────────────────────────────────────────────────────────

export interface RefreshResult {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
  accessExpiresIn: string;
  user: AuthUser;
}

export async function refresh(refreshToken: string): Promise<RefreshResult> {
  let decoded: JwtPayload & { typ?: string };
  try {
    decoded = jwt.verify(refreshToken, env.JWT_SECRET) as JwtPayload & { typ?: string };
  } catch {
    throw new UnauthorizedError('Invalid refresh token');
  }

  if (decoded.typ !== 'refresh') {
    throw new UnauthorizedError('Wrong token type');
  }

  const session = await db.query.userSessions.findFirst({
    where: eq(userSessions.tokenHash, hashToken(decoded.sessionId)),
    columns: { id: true, isValid: true, expiresAt: true, userId: true },
  });

  if (!session || !session.isValid || session.expiresAt < new Date()) {
    throw new UnauthorizedError('Session expired');
  }

  const user = await db.query.users.findFirst({
    where: eq(users.id, decoded.userId),
    columns: { id: true, email: true, role: true, isBlocked: true },
  });

  if (!user || user.isBlocked) {
    throw new UnauthorizedError('Account unavailable');
  }

  // Rotate: invalidate old session, create new one
  const newSessionId = crypto.randomUUID();
  const newRefreshExpiresAt = getRefreshExpiry();
  const newAccessToken = signAccessToken(
    { userId: user.id, email: user.email, role: user.role },
    newSessionId,
  );
  const newRefreshToken = signRefreshToken(
    { userId: user.id, email: user.email, role: user.role },
    newSessionId,
  );

  await db.transaction(async (tx) => {
    await tx
      .update(userSessions)
      .set({ isValid: false })
      .where(eq(userSessions.id, session.id));
    await tx.insert(userSessions).values({
      userId: user.id,
      tokenHash: hashToken(newSessionId),
      expiresAt: newRefreshExpiresAt,
    });
  });

  const authUser = await buildAuthUser(user.id);

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
    refreshExpiresAt: newRefreshExpiresAt,
    accessExpiresIn: env.JWT_ACCESS_EXPIRES_IN,
    user: authUser,
  };
}

// ─────────────────────────────────────────────────────────────
// LOGOUT (invalidate current session)
// ─────────────────────────────────────────────────────────────

export async function logout(sessionId: string, userId: string): Promise<void> {
  await db
    .update(userSessions)
    .set({ isValid: false })
    .where(
      and(eq(userSessions.tokenHash, hashToken(sessionId)), eq(userSessions.userId, userId)),
    );

  await db.insert(activityLogs).values({
    userId,
    action: 'USER_LOGOUT',
    module: 'AUTH',
  });

  logger.info(`Logout: user ${userId}`);
}

// Logout by refresh token (covers case where access JWT already expired)
export async function logoutByRefreshToken(refreshToken: string): Promise<void> {
  let decoded: JwtPayload & { typ?: string };
  try {
    decoded = jwt.verify(refreshToken, env.JWT_SECRET, { ignoreExpiration: true }) as JwtPayload & {
      typ?: string;
    };
  } catch {
    return; // malformed — nothing to invalidate
  }
  if (decoded.typ !== 'refresh') return;
  await db
    .update(userSessions)
    .set({ isValid: false })
    .where(
      and(
        eq(userSessions.tokenHash, hashToken(decoded.sessionId)),
        eq(userSessions.userId, decoded.userId),
      ),
    );
}

// ─────────────────────────────────────────────────────────────
// LOGOUT ALL DEVICES
// ─────────────────────────────────────────────────────────────

export async function logoutAll(userId: string): Promise<void> {
  await db
    .update(userSessions)
    .set({ isValid: false })
    .where(eq(userSessions.userId, userId));

  await db.insert(activityLogs).values({
    userId,
    action: 'USER_LOGOUT_ALL',
    module: 'AUTH',
    severity: 'WARN',
  });

  logger.info(`Logout all devices: user ${userId}`);
}

// ─────────────────────────────────────────────────────────────
// GET ME (current user)
// ─────────────────────────────────────────────────────────────

export async function getMe(userId: string): Promise<AuthUser> {
  return buildAuthUser(userId);
}

// ─────────────────────────────────────────────────────────────
// CHANGE PASSWORD
// ─────────────────────────────────────────────────────────────

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) throw new AppError('User not found', 404);

  const match = await bcrypt.compare(currentPassword, user.password);
  if (!match) throw new UnauthorizedError('Current password is incorrect');

  const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

  await db.transaction(async (tx) => {
    await tx.update(users).set({ password: newHash }).where(eq(users.id, userId));
    await tx
      .update(userSessions)
      .set({ isValid: false })
      .where(eq(userSessions.userId, userId));
    await tx.insert(activityLogs).values({
      userId,
      action: 'PASSWORD_CHANGED',
      module: 'AUTH',
      severity: 'WARN',
    });
  });
}

// ─────────────────────────────────────────────────────────────
// SHORT-LIVED WS TOKEN (for WebSocket/streaming where cookies don't apply)
// ─────────────────────────────────────────────────────────────

export function issueWsToken(payload: JwtPayload): { token: string; expiresIn: string } {
  // 5-minute token tied to the same sessionId; receiver verifies normally
  const token = jwt.sign(
    {
      userId: payload.userId,
      email: payload.email,
      role: payload.role,
      sessionId: payload.sessionId,
      typ: 'ws',
    },
    env.JWT_SECRET,
    { expiresIn: '5m' },
  );
  return { token, expiresIn: '5m' };
}
