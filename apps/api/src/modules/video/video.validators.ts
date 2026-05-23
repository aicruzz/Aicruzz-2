import { body, param, query } from 'express-validator';

export const createVideoJobValidator = [
  body('prompt')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('Prompt is required')
    .isLength({ max: 2000 })
    .withMessage('Prompt max 2,000 characters'),

  body('negativePrompt')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Negative prompt max 500 characters'),

  body('durationSeconds')
    .isInt()
    .bail()
    .custom((v) => [5, 10].includes(Number(v)))
    .withMessage('Duration must be 5 or 10 seconds'),

  body('resolution')
    .isIn(['SD_480P', 'HD_720P', 'FHD_1080P'])
    .withMessage('Resolution must be SD_480P, HD_720P, or FHD_1080P'),

  body('qualityMode')
    .isIn(['STANDARD', 'HIGH', 'ULTRA'])
    .withMessage('Quality must be STANDARD, HIGH, or ULTRA'),

  body('voiceEnabled')
    .isBoolean()
    .withMessage('voiceEnabled must be boolean'),

  body('voiceText')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Voice text max 2,000 characters'),

  body('voiceGender')
    .optional()
    .isIn(['MALE', 'FEMALE'])
    .withMessage('voiceGender must be MALE or FEMALE'),

  body('fps')
    .optional()
    .isInt({ min: 12, max: 60 })
    .withMessage('FPS must be 12–60'),
];

export const listJobsValidator = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
  query('status')
    .optional()
    .isIn(['QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED']),
];
