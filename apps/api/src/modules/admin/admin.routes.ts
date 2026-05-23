import { Router } from 'express';
import { authenticate, requireAdmin } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import * as adminController from './admin.controller';

const router = Router();

// All admin routes require authentication + ADMIN role
router.use(authenticate, requireAdmin);

// GET  /api/admin/stats
router.get('/stats', adminController.getDashboardStats);

// POST /api/admin/users/:userId/block
router.post(
  '/users/:userId/block',
  adminController.blockUserValidator,
  validate,
  adminController.blockUser,
);

// POST /api/admin/users/:userId/unblock
router.post('/users/:userId/unblock', adminController.unblockUser);

// GET  /api/admin/transactions
router.get('/transactions', adminController.getAllTransactions);

// GET  /api/admin/wallets
router.get('/wallets', adminController.getAllWallets);

// GET  /api/admin/activity-logs
router.get('/activity-logs', adminController.getActivityLogs_);

// GET  /api/admin/api-subscriptions
router.get('/api-subscriptions', adminController.getApiOverview);

export { router as adminRouter };
