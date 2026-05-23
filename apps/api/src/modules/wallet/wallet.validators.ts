import { body, param, query } from 'express-validator';
import { env } from '../../config/env';

export const fundWalletValidator = [
  body('usdAmount')
    .isFloat({ min: env.MIN_FUND_AMOUNT })
    .withMessage(`Minimum funding amount is $${env.MIN_FUND_AMOUNT}`)
    .isFloat({ max: 10000 })
    .withMessage('Maximum single funding is $10,000'),
];

export const cryptoPaymentValidator = [
  body('currency')
    .isIn(['BTC', 'USDT_TRC20', 'USDT_ERC20'])
    .withMessage('Currency must be BTC, USDT_TRC20, or USDT_ERC20'),

  body('usdAmount')
    .isFloat({ min: env.MIN_FUND_AMOUNT })
    .withMessage(`Minimum funding amount is $${env.MIN_FUND_AMOUNT}`),

  body('txHash')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 10, max: 128 })
    .withMessage('Transaction hash must be 10–128 characters'),

  body('notes').optional().isString().trim().isLength({ max: 500 }).withMessage('Notes too long'),
];

export const approveCryptoValidator = [
  param('paymentId').isString().notEmpty().withMessage('Payment ID required'),

  body('approved').isBoolean().withMessage('approved must be true or false'),

  body('adminNote')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Admin note too long'),
];

export const transactionHistoryValidator = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be >= 1').toInt(),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be 1–100')
    .toInt(),
  query('type')
    .optional()
    .isIn([
      'FUND',
      'DEDUCT',
      'REFUND',
      'ADMIN_CREDIT',
      'ADMIN_DEDUCT',
      'EXPIRY',
      'RESTORE',
      'BONUS',
    ])
    .withMessage('Invalid transaction type'),
];

export const adminCreditValidator = [
  param('userId').isString().notEmpty().withMessage('User ID required'),

  body('credits').isFloat({ min: 1 }).withMessage('Credits must be at least 1'),

  body('reason')
    .isString()
    .trim()
    .notEmpty()
    .isLength({ max: 300 })
    .withMessage('Reason is required (max 300 chars)'),
];
