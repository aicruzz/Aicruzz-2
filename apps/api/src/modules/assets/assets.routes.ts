import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  uploadBufferToCloudinary,
  isCloudinaryConfigured,
} from '../../config/cloudinary';
import {
  createAssetValidator,
  updateAssetValidator,
  listAssetsValidator,
  createCharacterValidator,
  updateCharacterValidator,
} from './assets.validators';
import * as assetsController from './assets.controller';

const router = Router();

router.use(authenticate);

// Memory storage (not disk): the buffer is pushed straight to Cloudinary so
// external providers (Runway/Pika) receive a public https:// URL.
const assetUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
    allowed.includes(file.mimetype)
      ? cb(null, true)
      : cb(new Error('Images only for assets'));
  },
});

// Shared upload — returns a public Cloudinary URL the asset/character records
// reference (folder shared with cartoon scene assets).
router.post('/upload', assetUpload.single('file'), async (req, res) => {
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
      folder: 'cartoon-assets',
      resourceType: 'image',
    });
    res.json({ success: true, data: { url } });
  } catch (err) {
    console.error('[assets/upload] Cloudinary upload failed', err);
    res.status(502).json({ success: false, message: 'Upload failed' });
  }
});

// ─── ASSETS ───────────────────────────────────────────────────
router.get('/', listAssetsValidator, validate, assetsController.listAssets);
router.post('/', createAssetValidator, validate, assetsController.createAsset);
router.patch('/:assetId', updateAssetValidator, validate, assetsController.updateAsset);
router.delete('/:assetId', assetsController.deleteAsset);

// ─── CUSTOM CHARACTERS ────────────────────────────────────────
router.get('/characters', assetsController.listCharacters);
router.post(
  '/characters',
  createCharacterValidator,
  validate,
  assetsController.createCharacter,
);
router.get('/characters/:characterId', assetsController.getCharacter);
router.patch(
  '/characters/:characterId',
  updateCharacterValidator,
  validate,
  assetsController.updateCharacter,
);
router.delete('/characters/:characterId', assetsController.deleteCharacter);

export { router as assetsRouter };
