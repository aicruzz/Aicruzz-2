import { body } from 'express-validator';

export const generateVoiceValidator = [
  body('text').isString().trim().notEmpty().isLength({ max: 5000 }),
  body('gender').optional().isIn(['MALE', 'FEMALE']),
  body('voiceId').optional().isString().trim().isLength({ max: 100 }),
  body('voiceAssetId').optional().isString().trim().isLength({ max: 100 }),
  body('style').optional().isString().trim().isLength({ max: 60 }),
  body('stability').optional().isFloat({ min: 0, max: 1 }),
  body('similarity').optional().isFloat({ min: 0, max: 1 }),
];

export const cloneVoiceValidator = [
  body('name').isString().trim().notEmpty().isLength({ max: 120 }),
  body('sampleUrl').optional().isString().trim().isLength({ max: 1000 }),
  body('sampleAssetId').optional().isString().trim().isLength({ max: 100 }),
  body('consentConfirmed')
    .isBoolean()
    .withMessage('consentConfirmed is required')
    .custom((v) => v === true)
    .withMessage('Voice cloning consent must be explicitly confirmed'),
];

export const linkVoiceValidator = [
  body('characterId').isString().trim().notEmpty().isLength({ max: 100 }),
  body('voiceAssetId').isString().trim().notEmpty().isLength({ max: 100 }),
];
