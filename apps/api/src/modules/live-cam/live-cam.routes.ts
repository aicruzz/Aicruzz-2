import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requireLegalConsent } from '../../middleware/legal.middleware';
import { env } from '../../config/env';
import * as liveCamController from './live-cam.controller';

const router = Router();

// Internal routes — called by WebRTC server (no JWT, use shared secret)
const requireWebrtcSecret = (
  req: import('express').Request,
  res: import('express').Response,
  next: import('express').NextFunction,
) => {
  if (req.headers['x-webrtc-secret'] !== env.AI_ROUTER_SECRET) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
};

router.post('/billing-tick', requireWebrtcSecret, liveCamController.billingTick);
router.post('/session-end', requireWebrtcSecret, liveCamController.sessionEnd);

// User-facing routes — require auth + legal consent
router.use(authenticate);
router.use(requireLegalConsent('LIVE_CAM'));

router.post('/start', liveCamController.startSession);
router.get('/active', liveCamController.getActiveSession);
router.get('/history', liveCamController.getSessionHistory);

export { router as liveCamRouter };
