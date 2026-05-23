import { Router } from 'express';
import multer from 'multer';
import { authenticate, requireAdmin } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  uploadBufferToCloudinary,
  isCloudinaryConfigured,
} from '../../config/cloudinary';
import {
  listBannersValidator,
  adminListBannersValidator,
  createBannerValidator,
  updateBannerValidator,
  reorderBannersValidator,
} from './banners.validators';
import * as bannersController from './banners.controller';

// ─── PUBLIC ROUTER (no auth) ──────────────────────────────────
// GET /api/banners?module=VIDEO|CARTOON — active banners only.
const publicRouter = Router();
publicRouter.get(
  '/',
  listBannersValidator,
  validate,
  bannersController.listPublicBanners,
);

// ─── ADMIN ROUTER ─────────────────────────────────────────────
// Mounted at /api/admin/banners. Separate router so the existing
// admin module is left untouched.
const adminRouter = Router();
adminRouter.use(authenticate, requireAdmin);

// Memory storage → pushed straight to Cloudinary, mirroring assets upload.
const videoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['video/mp4', 'video/webm', 'video/quicktime'];
    allowed.includes(file.mimetype)
      ? cb(null, true)
      : cb(new Error('Video files only (mp4 / webm / mov)'));
  },
});

const thumbUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    allowed.includes(file.mimetype)
      ? cb(null, true)
      : cb(new Error('Images only for thumbnails'));
  },
});

adminRouter.post(
  '/upload-video',
  videoUpload.single('file'),
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
      const { url } = await uploadBufferToCloudinary(req.file.buffer, {
        folder: 'featured-banners',
        resourceType: 'video',
      });
      res.json({ success: true, data: { url } });
    } catch (err) {
      console.error('[banners/upload-video] Cloudinary upload failed', err);
      res.status(502).json({ success: false, message: 'Upload failed' });
    }
  },
);

adminRouter.post(
  '/upload-thumbnail',
  thumbUpload.single('file'),
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
      const { url } = await uploadBufferToCloudinary(req.file.buffer, {
        folder: 'featured-banners',
        resourceType: 'image',
      });
      res.json({ success: true, data: { url } });
    } catch (err) {
      console.error('[banners/upload-thumbnail] Cloudinary upload failed', err);
      res.status(502).json({ success: false, message: 'Upload failed' });
    }
  },
);

adminRouter.get(
  '/',
  adminListBannersValidator,
  validate,
  bannersController.listAllBanners,
);
adminRouter.post(
  '/',
  createBannerValidator,
  validate,
  bannersController.createBanner,
);
adminRouter.post(
  '/reorder',
  reorderBannersValidator,
  validate,
  bannersController.reorderBanners,
);
adminRouter.patch(
  '/:bannerId',
  updateBannerValidator,
  validate,
  bannersController.updateBanner,
);
adminRouter.delete('/:bannerId', bannersController.deleteBanner);

export { publicRouter as bannersPublicRouter };
export { adminRouter as bannersAdminRouter };
