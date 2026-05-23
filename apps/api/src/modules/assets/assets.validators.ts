import { body, query } from 'express-validator';
import { ASSET_TYPES } from './assets.types';

export const createAssetValidator = [
  body('type').isIn(ASSET_TYPES).withMessage('Invalid asset type'),
  body('name').isString().trim().notEmpty().isLength({ max: 120 }),
  body('url').isString().trim().notEmpty().isLength({ max: 1000 }),
  body('thumbnailUrl').optional().isString().trim().isLength({ max: 1000 }),
  body('meta').optional().isObject(),
];

export const updateAssetValidator = [
  body('name').optional().isString().trim().isLength({ max: 120 }),
  body('thumbnailUrl').optional().isString().trim().isLength({ max: 1000 }),
  body('meta').optional().isObject(),
];

export const listAssetsValidator = [
  query('type').optional().isIn(ASSET_TYPES),
];

export const createCharacterValidator = [
  body('name').isString().trim().notEmpty().isLength({ max: 120 }),
  body('description').optional().isString().trim().isLength({ max: 1000 }),
  body('baseImageUrl').optional().isString().trim().isLength({ max: 1000 }),
  body('expressions').optional().isArray(),
  body('expressions.*.name').optional().isString().trim().isLength({ max: 80 }),
  body('expressions.*.url').optional().isString().trim().isLength({ max: 1000 }),
  body('stylePrompt').optional().isString().trim().isLength({ max: 500 }),
  body('thumbnailUrl').optional().isString().trim().isLength({ max: 1000 }),
];

export const updateCharacterValidator = [
  body('name').optional().isString().trim().notEmpty().isLength({ max: 120 }),
  body('description').optional().isString().trim().isLength({ max: 1000 }),
  body('baseImageUrl').optional().isString().trim().isLength({ max: 1000 }),
  body('expressions').optional().isArray(),
  body('expressions.*.name').optional().isString().trim().isLength({ max: 80 }),
  body('expressions.*.url').optional().isString().trim().isLength({ max: 1000 }),
  body('stylePrompt').optional().isString().trim().isLength({ max: 500 }),
  body('thumbnailUrl').optional().isString().trim().isLength({ max: 1000 }),
];
