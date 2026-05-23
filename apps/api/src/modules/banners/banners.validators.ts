import { body, query } from 'express-validator';
import { BANNER_MODULES } from './banners.types';

export const listBannersValidator = [
  // Optional: omit to get the centralized cross-module showcase set.
  query('module').optional().isIn(BANNER_MODULES).withMessage('Invalid module'),
];

export const adminListBannersValidator = [
  query('module').optional().isIn(BANNER_MODULES),
];

export const createBannerValidator = [
  body('module').isIn(BANNER_MODULES).withMessage('Invalid module'),
  body('title').isString().trim().notEmpty().isLength({ max: 160 }),
  body('prompt').isString().trim().notEmpty().isLength({ max: 4000 }),
  body('videoUrl').isString().trim().notEmpty().isLength({ max: 1000 }),
  body('thumbnailUrl').optional().isString().trim().isLength({ max: 1000 }),
  body('tags').optional().isArray(),
  body('tags.*').optional().isString().trim().isLength({ max: 60 }),
  body('metadata').optional().isObject(),
  body('isActive').optional().isBoolean(),
  body('isNew').optional().isBoolean(),
  body('sortOrder').optional().isInt({ min: 0 }),
  body('rotationInterval').optional().isInt({ min: 2000, max: 60000 }),
];

export const updateBannerValidator = [
  body('module').optional().isIn(BANNER_MODULES),
  body('title').optional().isString().trim().notEmpty().isLength({ max: 160 }),
  body('prompt').optional().isString().trim().notEmpty().isLength({ max: 4000 }),
  body('videoUrl').optional().isString().trim().notEmpty().isLength({ max: 1000 }),
  body('thumbnailUrl').optional().isString().trim().isLength({ max: 1000 }),
  body('tags').optional().isArray(),
  body('tags.*').optional().isString().trim().isLength({ max: 60 }),
  body('metadata').optional().isObject(),
  body('isActive').optional().isBoolean(),
  body('isNew').optional().isBoolean(),
  body('sortOrder').optional().isInt({ min: 0 }),
  body('rotationInterval').optional().isInt({ min: 2000, max: 60000 }),
];

export const reorderBannersValidator = [
  body('items').isArray({ min: 1 }).withMessage('items must be a non-empty array'),
  body('items.*.id').isString().trim().notEmpty(),
  body('items.*.sortOrder').isInt({ min: 0 }),
];
