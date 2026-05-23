import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { env } from '../config/env';
import { db } from '../config/database';
import { users } from '../db/schema';
import { sendUnauthorized, sendForbidden, sendError } from '../utils/response';
import { logger } from '../utils/logger';
import { isDbConnectivityError } from './error.middleware';

export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
  sessionId: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export const ACCESS_COOKIE_NAME = 'aicruzz_access';
export const REFRESH_COOKIE_NAME = 'aicruzz_refresh';

function extractAccessToken(req: Request): string | null {
  // 1. httpOnly cookie (preferred)
  const cookieToken = (req.cookies?.[ACCESS_COOKIE_NAME] as string | undefined) ?? null;
  if (cookieToken) return cookieToken;

  // 2. Authorization header (back-compat for SDKs / SSE clients passing token explicitly)
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length).trim() || null;
  }

  // 3. Query param (last resort, e.g. EventSource clients that can't set headers)
  const qToken = req.query?.access_token;
  if (typeof qToken === 'string' && qToken) return qToken;

  return null;
}

export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = extractAccessToken(req);

    if (!token) {
      sendUnauthorized(res, 'Not authenticated');
      return;
    }

    let decoded: JwtPayload & { typ?: string };
    try {
      decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload & { typ?: string };
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) {
      sendUnauthorized(res, 'Session expired.Please log in again ');
      } else {
        sendUnauthorized(res, 'Invalid token');
      }
      return;
    }

    // Reject refresh tokens used as access tokens
    if (decoded.typ === 'refresh') {
      sendUnauthorized(res, 'Wrong token type');
      return;
    }

    // Block check (cheap, indexed lookup)
    const user = await db.query.users.findFirst({
      where: eq(users.id, decoded.userId),
      columns: { id: true, isBlocked: true, role: true },
    });

    if (!user) {
      sendUnauthorized(res, 'User not found');
      return;
    }

    if (user.isBlocked) {
      sendForbidden(res, 'Your account has been blocked. Contact support.');
      return;
    }

    req.user = {
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role,
      sessionId: decoded.sessionId,
    };
    next();
  } catch (error) {
    // Don't conflate transient DB outages with auth failure — a 401 here would
    // trigger the web client's logout flow and end the user's session.
    if (isDbConnectivityError(error)) {
      logger.error('Auth middleware DB connectivity error:', {
        code: (error as { code?: string }).code,
      });
      sendError(res, 'Service temporarily unavailable. Please try again.', 503);
      return;
    }
    logger.error('Auth middleware error:', error);
    sendUnauthorized(res, 'Authentication failed');
  }
}

// Best-effort authenticate: populates req.user if a valid access token is present,
// otherwise just calls next(). Never sends a 401. Useful for endpoints that should
// work for both authed and unauthed clients (e.g. logout after token expiry).
export async function softAuthenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const token = extractAccessToken(req);
    if (!token) return next();

    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload & { typ?: string };
    if (decoded.typ === 'refresh') return next();

    req.user = {
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role,
      sessionId: decoded.sessionId,
    };
  } catch {
    // Invalid/expired token — just continue unauthed.
  }
  next();
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      sendUnauthorized(res);
      return;
    }

    if (!roles.includes(req.user.role)) {
      sendForbidden(res, 'Insufficient permissions');
      return;
    }

    next();
  };
}

export const requireAdmin = requireRole('ADMIN');
export const requireUser = requireRole('USER', 'ADMIN');
