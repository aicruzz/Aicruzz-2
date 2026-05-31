import { body, param, query } from 'express-validator';

export const sendMessageValidator = [
  body('content')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('Message content is required')
    .isLength({ max: 32000 })
    .withMessage('Message too long (max 32,000 characters)'),

  body('chatId')
    .optional()
    .isString()
    .notEmpty()
    .withMessage('chatId must be a non-empty string'),

  body('model')
    .optional()
    .isString()
    .isIn([
      'claude-sonnet-4-6',
      'claude-opus-4-7',
      'claude-haiku-4-5-20251001',
      'gpt-4o',
      'gpt-4o-mini',
    ])
    .withMessage('Invalid model or model not supported'),

  body('strategy')
    .optional()
    .isIn(['COST', 'SPEED', 'QUALITY', 'AUTO'])
    .withMessage('Invalid strategy'),

  body('editQuality')
    .optional()
    .isIn(['FAST', 'PRO'])
    .withMessage('Invalid editQuality'),

  body('stream')
    .optional()
    .isBoolean()
    .withMessage('stream must be boolean'),
];

export const enhancePromptValidator = [
  body('action')
    .isIn(['improve', 'expand', 'optimize'])
    .withMessage('action must be improve, expand, or optimize'),

  body('prompt')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('Prompt is required')
    .isLength({ max: 4000 })
    .withMessage('Prompt too long (max 4,000 characters)'),
];

export const updateChatTitleValidator = [
  param('chatId').isString().notEmpty(),
  body('title')
    .isString()
    .trim()
    .notEmpty()
    .isLength({ max: 200 })
    .withMessage('Title required (max 200 chars)'),
];

export const listChatsValidator = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
];

export const uploadFileValidator = [
  body('fileName')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('fileName is required'),
  body('fileType')
    .isString()
    .isIn([
      'image/jpeg', 'image/png', 'image/webp', 'image/gif',
      'video/mp4', 'video/webm', 'video/quicktime',
    ])
    .withMessage('File type not allowed'),
  body('fileSize')
    .isInt({ min: 1, max: 100 * 1024 * 1024 })
    .withMessage('File size must be between 1 byte and 100 MB'),
];