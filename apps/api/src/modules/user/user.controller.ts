import { Request, Response } from 'express';
import * as userService from './user.service';
import { sendSuccess } from '../../utils/response';

// GET /api/users/me/profile
export async function getMyProfile(req: Request, res: Response): Promise<void> {
  const profile = await userService.getProfile(req.user!.userId);
  sendSuccess(res, profile, 'Profile retrieved');
}

// PATCH /api/users/me/profile
export async function updateMyProfile(req: Request, res: Response): Promise<void> {
  const updated = await userService.updateProfile(req.user!.userId, req.body);
  sendSuccess(res, updated, 'Profile updated');
}

// POST /api/users/me/avatar
export async function uploadMyAvatar(req: Request, res: Response): Promise<void> {
  if (!req.file) {
    res.status(400).json({ success: false, message: 'No file uploaded' });
    return;
  }
  const updated = await userService.updateAvatar(req.user!.userId, req.file.filename);
  sendSuccess(res, updated, 'Avatar updated');
}

// ── ADMIN controllers ─────────────────────────────────────────

// GET /api/users?page=1&limit=20&search=...
export async function listUsers(req: Request, res: Response): Promise<void> {
  const { page, limit, search, role, isBlocked } = req.query;
  const result = await userService.listUsers({
    page: page ? parseInt(page as string) : 1,
    limit: limit ? parseInt(limit as string) : 20,
    search: search as string | undefined,
    role: role as 'USER' | 'ADMIN' | undefined,
    isBlocked: isBlocked !== undefined ? isBlocked === 'true' : undefined,
  });
  sendSuccess(res, result.users, 'Users retrieved', 200, {
    page: result.page,
    limit: result.limit,
    total: result.total,
    totalPages: result.totalPages,
  });
}

// GET /api/users/:userId
export async function getUserById(req: Request, res: Response): Promise<void> {
  const user = await userService.getUserById(req.params.userId);
  sendSuccess(res, user, 'User retrieved');
}
