import { body, param } from 'express-validator';

export const createApiKeyValidator = [
  body('name')
    .isString().trim().notEmpty()
    .isLength({ max: 80 }).withMessage('Name max 80 characters'),

  body('ipWhitelist')
    .optional().isString().trim()
    .custom((val: string) => {
      if (!val) return true;
      const ips = val.split(',').map((i) => i.trim());
      const ipRegex = /^(?:\d{1,3}\.){3}\d{1,3}(?:\/\d{1,2})?$/;
      const allValid = ips.every((ip) => ipRegex.test(ip));
      if (!allValid) throw new Error('Invalid IP/CIDR in whitelist');
      return true;
    }),
];

export const subscribePlanValidator = [
  body('plan')
    .isIn(['DEVELOPER_BASIC', 'DEVELOPER_PRO', 'DEVELOPER_ELITE'])
    .withMessage('Invalid plan'),
];

export const apiKeyIdValidator = [
  param('keyId').isString().notEmpty(),
];
