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
import {
  createTemplateValidator,
  createSceneValidator,
  generateCartoonValidator,
  listJobsValidator,
  saveJobAsTemplateValidator,
  saveJobAsCharacterValidator,
  saveJobAsAssetValidator,
} from './cartoon.validators';
import * as cartoonController from './cartoon.controller';

const router = Router();

// Webhook — internal, verified by secret
router.post('/webhook/:jobId', (req, res, next) => {
  if (req.headers['x-router-secret'] !== env.AI_ROUTER_SECRET) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}, cartoonController.handleWebhook);

// All other routes: auth + legal consent
router.use(authenticate);
router.use(requireLegalConsent('CARTOON'));

// Asset upload for cartoon scenes. Memory storage (not disk): the buffer is
// pushed straight to Cloudinary so external providers (Runway/Pika) receive a
// public https:// URL — a local relative path is unreachable by their servers
// and fails Runway's promptImage validation.
const assetUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
    allowed.includes(file.mimetype) ? cb(null, true) : cb(new Error('Images only for cartoon assets'));
  },
});

// ─── CREDIT ESTIMATE ─────────────────────────────────────────

// GET /api/cartoon/estimate?type=ANIMATED_AD&duration=10
router.get('/estimate', cartoonController.estimateCredits);

// ─── TEMPLATES ───────────────────────────────────────────────

// GET /api/cartoon/templates
router.get('/templates', cartoonController.listTemplates);

// POST /api/cartoon/templates
router.post('/templates', createTemplateValidator, validate, cartoonController.createTemplate);

// GET /api/cartoon/templates/:templateId
router.get('/templates/:templateId', cartoonController.getTemplate);

// PATCH /api/cartoon/templates/:templateId
router.patch('/templates/:templateId', cartoonController.updateTemplate);

// DELETE /api/cartoon/templates/:templateId
router.delete('/templates/:templateId', cartoonController.deleteTemplate);

// ─── SCENES ──────────────────────────────────────────────────

// POST /api/cartoon/templates/:templateId/scenes
router.post(
  '/templates/:templateId/scenes',
  createSceneValidator, validate,
  cartoonController.addScene,
);

// PATCH /api/cartoon/templates/:templateId/scenes/:sceneId
router.patch('/templates/:templateId/scenes/:sceneId', cartoonController.updateScene);

// DELETE /api/cartoon/templates/:templateId/scenes/:sceneId
router.delete('/templates/:templateId/scenes/:sceneId', cartoonController.deleteScene);

// PUT /api/cartoon/templates/:templateId/scenes/reorder
router.put('/templates/:templateId/scenes/reorder', cartoonController.reorderScenes);

// POST /api/cartoon/upload-asset — upload image for a scene (→ Cloudinary)
router.post('/upload-asset', assetUpload.single('file'), async (req, res) => {
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
      folder: 'cartoon-assets',
      resourceType: 'image',
    });
    res.json({ success: true, data: { url } });
  } catch (err) {
    console.error('[cartoon/upload-asset] Cloudinary upload failed', err);
    res.status(502).json({ success: false, message: 'Upload failed' });
  }
});

// ─── GENERATION ──────────────────────────────────────────────

// POST /api/cartoon/generate
router.post('/generate', generateCartoonValidator, validate, cartoonController.generateCartoon);

// GET /api/cartoon/jobs
router.get('/jobs', listJobsValidator, validate, cartoonController.listJobs);

// GET /api/cartoon/jobs/:jobId
router.get('/jobs/:jobId', cartoonController.getJobStatus);

// POST /api/cartoon/jobs/:jobId/cancel
router.post('/jobs/:jobId/cancel', cartoonController.cancelJob);

// ─── PHASE 3: SAVE-AS WORKFLOWS (additive) ───────────────────

// POST /api/cartoon/jobs/:jobId/save-as-template
router.post(
  '/jobs/:jobId/save-as-template',
  saveJobAsTemplateValidator, validate,
  cartoonController.saveJobAsTemplate,
);

// POST /api/cartoon/jobs/:jobId/save-as-character
router.post(
  '/jobs/:jobId/save-as-character',
  saveJobAsCharacterValidator, validate,
  cartoonController.saveJobAsCharacter,
);

// POST /api/cartoon/jobs/:jobId/save-as-asset
router.post(
  '/jobs/:jobId/save-as-asset',
  saveJobAsAssetValidator, validate,
  cartoonController.saveJobAsAsset,
);

export { router as cartoonRouter };
