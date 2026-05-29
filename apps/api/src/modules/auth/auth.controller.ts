import { Request, Response } from 'express';
import * as authService from './auth.service';
import { sendSuccess, sendCreated, sendError } from '../../utils/response';
import { env } from '../../config/env';
import { ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME } from '../../middleware/auth.middleware';
import { UnauthorizedError } from '../../middleware/error.middleware';

// ─────────────────────────────────────────────────────────────
// COOKIE HELPERS
// ─────────────────────────────────────────────────────────────

function parseDurationMs(raw: string, fallbackMs: number): number {
  const match = raw.match(/^(\d+)([smhd])$/);
  if (!match) return fallbackMs;
  const [, amount, unit] = match;
  const ms: Record<string, number> = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return parseInt(amount, 10) * (ms[unit] ?? 86400000);
}

function commonCookieOpts() {
  return {
    httpOnly: true as const,
    secure: env.isProd,
    // Cross-site prod (Vercel web ↔ Railway api are different sites) requires
    // SameSite=None; Secure so the cookie is sent on cross-site XHR/fetch.
    // Dev stays 'lax' since 'none' requires Secure, unavailable on http://localhost.
    sameSite: env.isProd ? ('none' as const) : ('lax' as const),
    domain: env.COOKIE_DOMAIN,
    path: '/',
  };
}

function setAccessCookie(res: Response, token: string): void {
  const maxAge = parseDurationMs(env.JWT_ACCESS_EXPIRES_IN, 15 * 60_000);
  res.cookie(ACCESS_COOKIE_NAME, token, { ...commonCookieOpts(), maxAge });
}

function setRefreshCookie(res: Response, token: string, expiresAt: Date): void {
  const maxAge = Math.max(1000, expiresAt.getTime() - Date.now());
  res.cookie(REFRESH_COOKIE_NAME, token, {
    ...commonCookieOpts(),
    // Scope refresh cookie to refresh + logout endpoints only —
    // smaller exposure surface than '/'.
    path: '/api/auth',
    maxAge,
  });
}

function clearAuthCookies(res: Response): void {
  const opts = commonCookieOpts();
  res.clearCookie(ACCESS_COOKIE_NAME, { ...opts, path: '/' });
  res.clearCookie(REFRESH_COOKIE_NAME, { ...opts, path: '/api/auth' });
}

// ─────────────────────────────────────────────────────────────
// HANDLERS
// ─────────────────────────────────────────────────────────────

// POST /api/auth/signup
export async function signup(req: Request, res: Response): Promise<void> {
  const result = await authService.signup(
    req.body,
    req.ip ?? undefined,
    req.headers['user-agent'],
  );
  setAccessCookie(res, result.tokens.accessToken);
  setRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);
  // Don't leak the refresh token in the JSON body — cookie only.
  sendCreated(
    res,
    { user: result.user, tokens: result.tokens },
    'Account created successfully',
  );
}

// POST /api/auth/login
export async function login(req: Request, res: Response): Promise<void> {
  const result = await authService.login(
    req.body,
    req.ip ?? undefined,
    req.headers['user-agent'],
  );
  setAccessCookie(res, result.tokens.accessToken);
  setRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);
  sendSuccess(
    res,
    { user: result.user, tokens: result.tokens },
    'Login successful',
  );
}

// POST /api/auth/refresh — uses refresh cookie, rotates it, sets fresh access cookie
export async function refresh(req: Request, res: Response): Promise<void> {
  const refreshToken =
    (req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined) ??
    (typeof req.body?.refreshToken === 'string' ? req.body.refreshToken : undefined);

  if (!refreshToken) {
    clearAuthCookies(res);
    sendError(res, 'No refresh token', 401);
    return;
  }

  try {
    const result = await authService.refresh(refreshToken);
    setAccessCookie(res, result.accessToken);
    setRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);
    sendSuccess(
      res,
      {
        user: result.user,
        tokens: { accessToken: result.accessToken, expiresIn: result.accessExpiresIn },
      },
      'Token refreshed',
    );
  } catch (err) {
    // Only wipe cookies on real auth failures. Infra errors (DB unreachable,
    // etc.) must leave cookies intact so the session recovers when the
    // underlying issue resolves.
    if (err instanceof UnauthorizedError) {
      clearAuthCookies(res);
    }
    throw err;
  }
}

// POST /api/auth/logout
export async function logout(req: Request, res: Response): Promise<void> {
  if (req.user) {
    await authService.logout(req.user.sessionId, req.user.userId);
  } else {
    // Access token already expired — invalidate via refresh cookie if present
    const rt = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
    if (rt) await authService.logoutByRefreshToken(rt);
  }
  clearAuthCookies(res);
  sendSuccess(res, null, 'Logged out successfully');
}

// POST /api/auth/logout-all
export async function logoutAll(req: Request, res: Response): Promise<void> {
  await authService.logoutAll(req.user!.userId);
  clearAuthCookies(res);
  sendSuccess(res, null, 'Logged out from all devices');
}

// GET /api/auth/me
export async function getMe(req: Request, res: Response): Promise<void> {
  const user = await authService.getMe(req.user!.userId);
  sendSuccess(res, { user }, 'Profile retrieved');
}

// POST /api/auth/change-password
export async function changePassword(req: Request, res: Response): Promise<void> {
  const { currentPassword, newPassword } = req.body;
  await authService.changePassword(req.user!.userId, currentPassword, newPassword);
  clearAuthCookies(res);
  sendSuccess(res, null, 'Password changed. Please log in again.');
}

// GET /api/auth/check — lightweight token validation (no DB hit)
export function checkToken(req: Request, res: Response): void {
  sendSuccess(res, { valid: true, user: req.user }, 'Token valid');
}

// POST /api/auth/ws-token — short-lived JWT for WebSocket/SSE clients that can't ride cookies
export function wsToken(req: Request, res: Response): void {
  const t = authService.issueWsToken(req.user!);
  sendSuccess(res, t, 'WS token issued');
}
