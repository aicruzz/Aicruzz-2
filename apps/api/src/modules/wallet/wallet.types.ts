import {
  transactionTypeEnum,
  cryptoCurrencyEnum,
  transactionStatusEnum,
  cryptoStatusEnum,
} from '../../db/schema';

export type TransactionType = (typeof transactionTypeEnum.enumValues)[number];
export type TransactionStatus = (typeof transactionStatusEnum.enumValues)[number];
export type CryptoCurrency = (typeof cryptoCurrencyEnum.enumValues)[number];
export type CryptoStatus = (typeof cryptoStatusEnum.enumValues)[number];

export interface WalletBalance {
  credits: number;
  pendingRestore: number;
  expiresAt: Date | null;
  isExpired: boolean;
  daysUntilExpiry: number | null;
}

export interface FundWalletResult {
  walletBalance: WalletBalance;
  transaction: {
    id: string;
    type: TransactionType;
    usdAmount: number;
    creditsBase: number;
    creditsBonus: number;
    creditsRestored: number;
    creditsTotal: number;
    balanceBefore: number;
    balanceAfter: number;
    description: string;
  };
}

export interface DeductCreditsInput {
  userId: string;
  credits: number;
  module: string;
  description: string;
  metadata?: Record<string, unknown>;
}

export interface DeductCreditsResult {
  success: boolean;
  transactionId: string;
  creditsDeducted: number;
  balanceBefore: number;
  balanceAfter: number;
}

export interface RefundCreditsInput {
  userId: string;
  credits: number;
  module: string;
  description: string;
  originalTransactionId?: string;
}

export interface CryptoPaymentRequest {
  userId: string;
  currency: CryptoCurrency;
  usdAmount: number;
  txHash?: string;
  proofImageUrl?: string;
  notes?: string;
}

export interface CryptoApprovalInput {
  paymentId: string;
  adminUserId: string;
  approved: boolean;
  adminNote?: string;
}

export interface StripePaymentIntentInput {
  userId: string;
  usdAmount: number; // in dollars (minimum $10)
}

export interface CreditUsageRate {
  LIVE_CAM_PER_SECOND: number;
  VIDEO_PER_SECOND_BASE: number;
  VIDEO_720P_MULTIPLIER: number;
  VIDEO_1080P_MULTIPLIER: number;
  VIDEO_ULTRA_MULTIPLIER: number;
  IMAGE_STANDARD: number;
  IMAGE_HIGH_QUALITY: number;
  VOICE_PER_SECOND: number;
}

export const CREDIT_RATES: CreditUsageRate = {
  LIVE_CAM_PER_SECOND: 0.2,
  VIDEO_PER_SECOND_BASE: 10,
  VIDEO_720P_MULTIPLIER: 1.2,
  VIDEO_1080P_MULTIPLIER: 1.5,
  VIDEO_ULTRA_MULTIPLIER: 2.0,
  IMAGE_STANDARD: 5,
  IMAGE_HIGH_QUALITY: 10,
  VOICE_PER_SECOND: 0.5,
};
