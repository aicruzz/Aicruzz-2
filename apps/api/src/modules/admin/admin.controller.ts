import { Request, Response } from 'express';
import * as adminService from './admin.service';
import { getActivityLogs } from '../../services/activity.service';
import { sendSuccess } from '../../utils/response';
import { body, param } from 'express-validator';
import { validate } from '../../middleware/validate.middleware';

// GET /api/admin/stats
export async function getDashboardStats(req: Request, res: Response): Promise<void> {
  const stats = await adminService.getDashboardStats();
  sendSuccess(res, stats, 'Dashboard stats retrieved');
}

// POST /api/admin/users/:userId/block
export async function blockUser(req: Request, res: Response): Promise<void> {
  const { userId } = req.params;
  const { reason } = req.body as { reason: string };
  await adminService.blockUser(userId, reason, req.user!.userId);
  sendSuccess(res, null, 'User blocked successfully');
}

// POST /api/admin/users/:userId/unblock
export async function unblockUser(req: Request, res: Response): Promise<void> {
  const { userId } = req.params;
  await adminService.unblockUser(userId, req.user!.userId);
  sendSuccess(res, null, 'User unblocked successfully');
}

// GET /api/admin/transactions
export async function getAllTransactions(req: Request, res: Response): Promise<void> {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 30;
  const type = req.query.type as string | undefined;
  const userId = req.query.userId as string | undefined;

  const result = await adminService.getAllTransactions(page, limit, { type, userId });
  sendSuccess(res, result.transactions, 'Transactions retrieved', 200, {
    page: result.page,
    limit: result.limit,
    total: result.total,
    totalPages: result.totalPages,
  });
}

// GET /api/admin/wallets
export async function getAllWallets(req: Request, res: Response): Promise<void> {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 30;
  const result = await adminService.getAllWallets(page, limit);
  sendSuccess(res, result.wallets, 'Wallets retrieved', 200, {
    page: result.page,
    limit: result.limit,
    total: result.total,
    totalPages: result.totalPages,
  });
}

// GET /api/admin/activity-logs
export async function getActivityLogs_(req: Request, res: Response): Promise<void> {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 50;
  const result = await getActivityLogs(
    {
      userId: req.query.userId as string | undefined,
      action: req.query.action as string | undefined,
      module: req.query.module as string | undefined,
    },
    page,
    limit,
  );
  sendSuccess(res, result.logs, 'Activity logs retrieved', 200, {
    page: result.page,
    limit: result.limit,
    total: result.total,
    totalPages: result.totalPages,
  });
}

// GET /api/admin/api-subscriptions
export async function getApiOverview(req: Request, res: Response): Promise<void> {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 30;
  const result = await adminService.getApiOverview(page, limit);
  sendSuccess(res, result.subscriptions, 'API subscriptions retrieved', 200, {
    page: result.page,
    limit: result.limit,
    total: result.total,
    totalPages: result.totalPages,
  });
}

// Validators used inline in routes
export const blockUserValidator = [
  param('userId').isString().notEmpty(),
  body('reason')
    .isString()
    .trim()
    .notEmpty()
    .isLength({ max: 300 })
    .withMessage('Reason required (max 300 chars)'),
];
