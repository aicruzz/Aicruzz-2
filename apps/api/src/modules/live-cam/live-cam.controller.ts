import { Request, Response } from 'express';
import * as liveCamService from './live-cam.service';
import { sendSuccess, sendCreated } from '../../utils/response';
import { env } from '../../config/env';

// POST /api/live-cam/start
export async function startSession(req: Request, res: Response): Promise<void> {
  const result = await liveCamService.startSession(req.user!.userId);
  sendCreated(res, result, 'Live cam session started');
}

// POST /api/live-cam/billing-tick  (called by WebRTC server — internal)
export async function billingTick(req: Request, res: Response): Promise<void> {
  const { sessionId, userId, credits } = req.body as {
    sessionId: string;
    userId: string;
    credits: number;
  };

  const result = await liveCamService.billingTick({ sessionId, userId, credits });
  res.json(result);
  console.log(result)
}

// POST /api/live-cam/session-end  (called by WebRTC server — internal)
export async function sessionEnd(req: Request, res: Response): Promise<void> {
  const { sessionId, userId, totalSeconds, totalCredits } = req.body as {
    sessionId: string;
    userId: string;
    totalSeconds: number;
    totalCredits: number;
  };

  await liveCamService.endSession({ sessionId, userId, totalSeconds, totalCredits });
  res.json({ ok: true });
}

// GET /api/live-cam/active
export async function getActiveSession(req: Request, res: Response): Promise<void> {
  const session = await liveCamService.getActiveSession(req.user!.userId);
  sendSuccess(res, session, 'Active session');
}

// GET /api/live-cam/history
export async function getSessionHistory(req: Request, res: Response): Promise<void> {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const result = await liveCamService.getSessionHistory(req.user!.userId, page, limit);
  sendSuccess(res, result.sessions, 'Session history', 200, {
    page, limit, total: result.total, totalPages: result.totalPages,
  });
}
