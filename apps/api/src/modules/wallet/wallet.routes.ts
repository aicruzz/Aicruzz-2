import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { authenticate, requireAdmin } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { walletRateLimiter } from '../../middleware/rateLimit.middleware';
import * as walletController from './wallet.controller';
import {
  cryptoPaymentValidator,
  approveCryptoValidator,
  transactionHistoryValidator,
  adminCreditValidator,
} from './wallet.validators';
import { env } from '../../config/env';

const router = Router();

// Configure multer for crypto proof uploads
const cryptoProofStorage = multer.diskStorage({
  destination: path.join(env.UPLOAD_DIR, 'crypto-proofs'),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const cryptoProofUpload = multer({
  storage: cryptoProofStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files and PDFs are allowed for payment proof'));
    }
  },
});

// ─── USER ROUTES ─────────────────────────────────────────────

// GET /api/wallet/balance
router.get('/balance', authenticate, walletController.getBalance);

// GET /api/wallet/preview?amount=50
router.get('/preview', authenticate, walletController.previewCredits);

// GET /api/wallet/transactions
router.get(
  '/transactions',
  authenticate,
  transactionHistoryValidator,
  validate,
  walletController.getTransactions,
);

// POST /api/wallet/crypto/submit
router.post(
  '/crypto/submit',
  authenticate,
  walletRateLimiter,
  cryptoProofUpload.single('proof'),
  cryptoPaymentValidator,
  validate,
  walletController.submitCryptoPayment,
);

// ─── ADMIN ROUTES ─────────────────────────────────────────────

// GET /api/wallet/admin/crypto
router.get(
  '/admin/crypto',
  authenticate,
  requireAdmin,
  walletController.adminGetCryptoPayments,
);

// POST /api/wallet/admin/crypto/:paymentId/review
router.post(
  '/admin/crypto/:paymentId/review',
  authenticate,
  requireAdmin,
  approveCryptoValidator,
  validate,
  walletController.adminApproveCryptoPayment,
);

// POST /api/wallet/admin/credit/:userId
router.post(
  '/admin/credit/:userId',
  authenticate,
  requireAdmin,
  adminCreditValidator,
  validate,
  walletController.adminCreditUser,
);

// GET /api/wallet/admin/user/:userId
router.get(
  '/admin/user/:userId',
  authenticate,
  requireAdmin,
  walletController.adminGetUserWallet,
);

export { router as walletRouter };
