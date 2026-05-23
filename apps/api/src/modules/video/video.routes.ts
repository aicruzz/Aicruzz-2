import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { requireLegalConsent } from '../../middleware/legal.middleware';
import { env } from '../../config/env';
import {
  uploadBufferToCloudinary,
  isCloudinaryConfigured,
} from '../../config/cloudinary';
import { createVideoJobValidator, listJobsValidator } from './video.validators';
import * as videoController from './video.controller';

const router = Router();

// Webhook is unauthenticated (called internally by AI router)
// Verified by shared secret header
router.post('/webhook/:jobId', (req, res, next) => {
  const secret = req.headers['x-router-secret'];
  
  // Add this temporarily
  console.log('Received secret:', JSON.stringify(secret));
  console.log('Expected secret:', JSON.stringify(env.AI_ROUTER_SECRET));
  console.log('Match:', secret === env.AI_ROUTER_SECRET);
  
  if (secret !== env.AI_ROUTER_SECRET) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}, videoController.handleWebhook);
// All other video routes require auth + legal consent
router.use(authenticate);
router.use(requireLegalConsent('VIDEO'));

// File upload for input image/video templates.
// Memory storage (not disk): the buffer is pushed straight to S3 so external
// providers (Runway/Pika) receive a public https:// URL. A local relative
// path is unreachable by their servers and fails Runway's URL validation.
const videoInputUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'];
    allowed.includes(file.mimetype) ? cb(null, true) : cb(new Error('File type not allowed'));
  },
});

// SSE — live job/feed events
// GET /api/video/events            → all jobs for the user (feed)
// GET /api/video/events/:jobId     → single job stream
router.get('/events',         videoController.streamUserEvents);
router.get('/events/:jobId',  videoController.streamJobEvents);

// GET  /api/video/estimate
router.get('/estimate', videoController.estimateCredits);

// POST /api/video/generate
router.post(
  '/generate',
  createVideoJobValidator,
  validate,
  videoController.createVideoJob,
);

// POST /api/video/upload-input — upload reference image or video
router.post(
  '/upload-input',
  videoInputUpload.single('file'),
  async (req, res) => {
    if (!req.file) {
      res.status(400).json({ success: false, message: 'No file uploaded' });
      return;
    }

    if (!isCloudinaryConfigured()) {
      res.status(500).json({
        success: false,
        message: 'Storage not configured (CLOUDINARY_* missing)',
      });
      return;
    }

    try {
      // Absolute https:// URL — what Runway/Pika and the queue worker need.
      const { url } = await uploadBufferToCloudinary(req.file.buffer, {
        folder: 'video-inputs',
        resourceType: req.file.mimetype.startsWith('video/')
          ? 'video'
          : 'image',
      });
      res.json({ success: true, data: { url } });
    } catch (err) {
      console.error('[video/upload-input] Cloudinary upload failed', err);
      res.status(502).json({ success: false, message: 'Upload failed' });
    }
  },
);

// GET  /api/video/jobs
router.get('/jobs', listJobsValidator, validate, videoController.listJobs);

// GET  /api/video/jobs/:jobId
router.get('/jobs/:jobId', videoController.getJobStatus);

// POST /api/video/jobs/:jobId/cancel
router.post('/jobs/:jobId/cancel', videoController.cancelJob);

export { router as videoRouter };
