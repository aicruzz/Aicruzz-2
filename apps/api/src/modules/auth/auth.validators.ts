import { body } from 'express-validator';

export const signupValidator = [
  body('name')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ min: 2, max: 80 })
    .withMessage('Name must be 2–80 characters'),

  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required')
    .isLength({ max: 254 })
    .withMessage('Email too long'),

  body('password')
    .isString()
    .isLength({ min: 8, max: 128 })
    .withMessage('Password must be 8–128 characters')
    .matches(/[A-Z]/)
    .withMessage('Password must contain at least one uppercase letter')
    .matches(/[0-9]/)
    .withMessage('Password must contain at least one number'),

  body('legalConsented')
    .isBoolean()
    .withMessage('Legal consent must be true or false')
    .custom((val) => {
      if (val !== true && val !== 'true') {
        throw new Error('You must accept the legal terms to continue');
      }
      return true;
    }),
];

export const loginValidator = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').isString().notEmpty().withMessage('Password is required'),
];
