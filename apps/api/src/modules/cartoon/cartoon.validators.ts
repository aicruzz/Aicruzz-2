import { body, param, query } from 'express-validator';

export const createTemplateValidator = [
  body('name')
    .isString().trim().notEmpty()
    .isLength({ max: 100 }).withMessage('Name max 100 characters'),

  body('description')
    .optional().isString().trim().isLength({ max: 500 }),

  body('type')
    .optional()
    .isIn(['ANIMATED_AD', 'HUMAN_CARTOON', 'CUSTOM'])
    .withMessage('Invalid cartoon type'),

  body('isPublic')
    .optional().isBoolean(),
];

export const createSceneValidator = [
  body('name')
    .isString().trim().notEmpty()
    .isLength({ max: 100 }).withMessage('Name max 100 characters'),

  body('order')
    .optional().isInt({ min: 0 }),

  body('prompt')
    .optional().isString().trim().isLength({ max: 1000 }),

  body('durationSecs')
    .optional().isFloat({ min: 0.5, max: 30 })
    .withMessage('Duration must be 0.5–30 seconds'),

  body('transition')
    .optional().isIn(['none', 'fade', 'slide', 'zoom']),
];

export const generateCartoonValidator = [
  // Legacy `type` OR new `mode` — at least one required (back compat).
  body('type')
    .optional()
    .isIn(['ANIMATED_AD', 'HUMAN_CARTOON', 'CUSTOM'])
    .withMessage('type must be ANIMATED_AD, HUMAN_CARTOON, or CUSTOM'),

  body('mode')
    .optional()
    .isIn(['ANIMATED_AD', 'HUMAN_CARTOON', 'CUSTOM_CHARACTER', 'CLASSIC_CARTOON'])
    .withMessage('Invalid cartoon mode'),

  body().custom((value) => {
    if (!value?.type && !value?.mode) {
      throw new Error('Either "type" or "mode" is required');
    }
    // HUMAN_CARTOON needs an image source (upload-image → image-to-video).
    const mode =
      value.mode ??
      (value.type === 'HUMAN_CARTOON' ? 'HUMAN_CARTOON' : undefined);
    if (
      mode === 'HUMAN_CARTOON' &&
      !value.inputImageUrl &&
      !value.characterImageUrl &&
      !value.characterId
    ) {
      throw new Error(
        'HUMAN_CARTOON requires inputImageUrl, characterImageUrl, or characterId',
      );
    }
    return true;
  }),

  body('prompt')
    .optional().isString().trim().isLength({ max: 2000 }),

  body('stylePrompt')
    .optional().isString().trim().isLength({ max: 500 }),

  body('durationSecs')
    .optional().isFloat({ min: 1, max: 60 })
    .withMessage('Duration must be 1–60 seconds'),

  body('aspectRatio')
    .optional().isIn(['16:9', '9:16', '1:1', '4:3'])
    .withMessage('Invalid aspect ratio'),

  body('animationStyle')
    .optional().isString().trim().isLength({ max: 100 }),

  // Phase 2 — reusable assets / character / voice
  body('characterId').optional().isString().trim().isLength({ max: 100 }),
  body('characterImageUrl').optional().isString().trim().isLength({ max: 1000 }),
  body('backgroundImageUrl').optional().isString().trim().isLength({ max: 1000 }),
  body('logoImageUrl').optional().isString().trim().isLength({ max: 1000 }),
  body('extraImageUrls').optional().isArray({ max: 10 }),
  body('extraImageUrls.*').optional().isString().trim().isLength({ max: 1000 }),
  body('voiceMode')
    .optional()
    .isIn(['NONE', 'UPLOAD', 'CLONE', 'AI'])
    .withMessage('Invalid voiceMode'),
  body('voiceText').optional().isString().trim().isLength({ max: 2000 }),
  body('voiceAssetId').optional().isString().trim().isLength({ max: 100 }),

  // Phase 3 — library asset references
  body('faceAssetId').optional().isString().trim().isLength({ max: 100 }),
  body('backgroundAssetId').optional().isString().trim().isLength({ max: 100 }),
  body('logoAssetId').optional().isString().trim().isLength({ max: 100 }),
];

// ─── Phase 3: save-as workflows ───────────────────────────────

export const saveJobAsTemplateValidator = [
  body('name').isString().trim().notEmpty().isLength({ max: 100 }),
  body('description').optional().isString().trim().isLength({ max: 500 }),
  body('isPublic').optional().isBoolean(),
];

export const saveJobAsCharacterValidator = [
  body('name').isString().trim().notEmpty().isLength({ max: 120 }),
  body('description').optional().isString().trim().isLength({ max: 1000 }),
  body('stylePrompt').optional().isString().trim().isLength({ max: 500 }),
];

export const saveJobAsAssetValidator = [
  body('name').isString().trim().notEmpty().isLength({ max: 120 }),
  body('type').optional().isIn(['SCENE', 'CHARACTER', 'BACKGROUND']),
];

export const listJobsValidator = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
  query('status')
    .optional()
    .isIn(['QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED']),
  query('type')
    .optional()
    .isIn(['ANIMATED_AD', 'HUMAN_CARTOON', 'CUSTOM']),
];
