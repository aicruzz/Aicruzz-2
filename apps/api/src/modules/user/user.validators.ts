import { body, query } from 'express-validator';

export const updateProfileValidator = [
  body('name')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 2, max: 80 })
    .withMessage('Name must be 2–80 characters'),
];

export const listUsersValidator = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('search').optional().isString().trim(),
  query('role').optional().isIn(['USER', 'ADMIN']),
  query('isBlocked').optional().isBoolean().toBoolean(),
];
