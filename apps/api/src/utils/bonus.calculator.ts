import { env } from '../config/env';

export interface BonusResult {
  usdAmount: number;
  baseCredits: number;
  bonusCredits: number;
  totalCredits: number;
  bonusPercent: number;
  tierLabel: string;
}

/**
 * Calculates credits and bonus for a given USD funding amount.
 *
 * Tier rules:
 *  $10–$19.99  → base only (no bonus)
 *  $20–$49.99  → +10% bonus
 *  $50–$99.99  → +15% bonus
 *  $100+       → +20% bonus
 */
export function calculateBonus(usdAmount: number): BonusResult {
  const baseCredits = Math.floor(usdAmount * env.CREDITS_PER_DOLLAR);

  let bonusPercent = 0;
  let tierLabel = 'No Bonus';

  if (usdAmount >= 100) {
    bonusPercent = 20;
    tierLabel = '+20% Bonus (100+)';
  } else if (usdAmount >= 50) {
    bonusPercent = 15;
    tierLabel = '+15% Bonus ($50–$99)';
  } else if (usdAmount >= 20) {
    bonusPercent = 10;
    tierLabel = '+10% Bonus ($20–$49)';
  }

  const bonusCredits = Math.floor(baseCredits * (bonusPercent / 100));
  const totalCredits = baseCredits + bonusCredits;

  return {
    usdAmount,
    baseCredits,
    bonusCredits,
    totalCredits,
    bonusPercent,
    tierLabel,
  };
}

/**
 * Preview credit calculation for the funding UI — no side effects.
 * Returns all tiers so the frontend can display live incentives.
 */
export function previewAllTiers(usdAmount: number): {
  current: BonusResult;
  tiers: Array<{ minUsd: number; bonusPercent: number; label: string; example: BonusResult }>;
} {
  const current = calculateBonus(usdAmount);

  const tiers = [
    { minUsd: 10, bonusPercent: 0, label: 'No Bonus' },
    { minUsd: 20, bonusPercent: 10, label: '+10% Bonus' },
    { minUsd: 50, bonusPercent: 15, label: '+15% Bonus' },
    { minUsd: 100, bonusPercent: 20, label: '+20% Bonus' },
  ].map((t) => ({
    ...t,
    example: calculateBonus(t.minUsd),
  }));

  return { current, tiers };
}
