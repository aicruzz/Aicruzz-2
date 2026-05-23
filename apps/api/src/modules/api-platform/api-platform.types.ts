export type ApiPlan = 'DEVELOPER_BASIC' | 'DEVELOPER_PRO' | 'DEVELOPER_ELITE';
export type SubscriptionStatus = 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'EXPIRED' | 'TRIALING';

// ─── PLAN CONFIGS ─────────────────────────────────────────────

export const PLAN_CONFIG: Record<ApiPlan, {
  name: string;
  monthlyUsd: number;
  requestsPerMinute: number;
  requestsPerMonth: number; // -1 = unlimited
  features: string[];
}> = {
  DEVELOPER_BASIC: {
    name: 'Developer Basic',
    monthlyUsd: 19,
    requestsPerMinute: 60,
    requestsPerMonth: 10_000,
    features: [
      '60 requests per minute',
      '10,000 requests per month',
      'All AI endpoints',
      'Email support',
    ],
  },
  DEVELOPER_PRO: {
    name: 'Developer Pro',
    monthlyUsd: 49,
    requestsPerMinute: 120,
    requestsPerMonth: 50_000,
    features: [
      '120 requests per minute',
      '50,000 requests per month',
      'All AI endpoints',
      'Priority support',
      'Webhooks',
    ],
  },
  DEVELOPER_ELITE: {
    name: 'Developer Elite',
    monthlyUsd: 99,
    requestsPerMinute: 300,
    requestsPerMonth: -1, // unlimited (fair use)
    features: [
      '300 requests per minute',
      'Unlimited requests (fair use)',
      'All AI endpoints',
      'Priority support',
      'Webhooks',
      'Custom integrations',
    ],
  },
};

// ─── DTOs ─────────────────────────────────────────────────────

export interface CreateApiKeyInput {
  name: string;
  ipWhitelist?: string;
}

export interface ApiKeyDto {
  id: string;
  name: string;
  prefix: string;       // first 8 chars (rest masked)
  isActive: boolean;
  totalRequests: number;
  lastUsedAt: Date | null;
  createdAt: Date;
  ipWhitelist: string | null;
}

export interface ApiKeyWithSecret extends ApiKeyDto {
  key: string;          // full key — ONLY shown once at creation time
}

export interface SubscribePlanInput {
  plan: ApiPlan;
}

export interface SubscriptionDto {
  plan: ApiPlan;
  status: SubscriptionStatus;
  requestsPerMinute: number;
  requestsPerMonth: number;
  requestsUsedThisMonth: number;
  usdPriceMonthly: number;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  cancelledAt: Date | null;
}
