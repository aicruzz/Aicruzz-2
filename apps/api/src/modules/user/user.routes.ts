import { Router } from 'express';
import { authenticate, requireAdmin } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { uploadAvatar } from '../../middleware/upload.middleware';
import { updateProfileValidator, listUsersValidator } from './user.validators';
import * as userController from './user.controller';

const router = Router();

// ─── CURRENT USER ─────────────────────────────────────────────

// GET /api/users/me/profile
router.get('/me/profile', authenticate, userController.getMyProfile);

// PATCH /api/users/me/profile
router.patch(
  '/me/profile',
  authenticate,
  updateProfileValidator,
  validate,
  userController.updateMyProfile,
);

// POST /api/users/me/avatar
router.post(
  '/me/avatar',
  authenticate,
  uploadAvatar.single('avatar'),
  userController.uploadMyAvatar,
);

// ─── ADMIN ────────────────────────────────────────────────────

// GET /api/users
router.get('/', authenticate, requireAdmin, listUsersValidator, validate, userController.listUsers);

// GET /api/users/:userId
router.get('/:userId', authenticate, requireAdmin, userController.getUserById);

export { router as userRouter };
