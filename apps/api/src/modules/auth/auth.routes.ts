import { Router } from 'express';
import { authenticate, softAuthenticate } from '../../middleware/auth.middleware';
import { authRateLimiter } from '../../middleware/rateLimit.middleware';
import { validate } from '../../middleware/validate.middleware';
import { signupValidator, loginValidator } from './auth.validators';
import { body } from 'express-validator';
import * as authController from './auth.controller';

const router = Router();

// ─── PUBLIC ROUTES ───────────────────────────────────────────

// POST /api/auth/signup
router.post(
  '/signup',
  authRateLimiter,
  signupValidator,
  validate,
  authController.signup,
);

// POST /api/auth/login
router.post(
  '/login',
  authRateLimiter,
  loginValidator,
  validate,
  authController.login,
);

// POST /api/auth/refresh — public; relies on refresh cookie / body
router.post('/refresh', authController.refresh);

// POST /api/auth/logout — public so it works even if access token expired.
// Controller decodes req.user opportunistically from cookie/header, otherwise
// falls back to invalidating via the refresh cookie.
router.post('/logout', softAuthenticate, authController.logout);

// ─── PROTECTED ROUTES ────────────────────────────────────────

// GET /api/auth/me
router.get('/me', authenticate, authController.getMe);

// GET /api/auth/check
router.get('/check', authenticate, authController.checkToken);

// POST /api/auth/ws-token — short-lived token for WebSocket/SSE
router.post('/ws-token', authenticate, authController.wsToken);

// POST /api/auth/logout-all
router.post('/logout-all', authenticate, authController.logoutAll);

// POST /api/auth/change-password
router.post(
  '/change-password',
  authenticate,
  [
    body('currentPassword').isString().notEmpty().withMessage('Current password required'),
    body('newPassword')
      .isString()
      .isLength({ min: 8, max: 128 })
      .withMessage('New password must be 8–128 characters')
      .matches(/[A-Z]/)
      .withMessage('Must contain uppercase')
      .matches(/[0-9]/)
      .withMessage('Must contain a number'),
  ],
  validate,
  authController.changePassword,
);

export { router as authRouter };
