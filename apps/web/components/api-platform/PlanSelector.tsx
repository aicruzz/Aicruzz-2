'use client';

import { Check, Zap, Crown, Star } from 'lucide-react';
import { clsx } from 'clsx';
import { Button } from '@/components/ui/Button';

interface Plan {
  id: string;
  name: string;
  monthlyUsd: number;
  requestsPerMinute: number;
  requestsPerMonth: number;
  features: string[];
}

interface PlanSelectorProps {
  plans: Plan[];
  currentPlan: string | null;
  onSubscribe: (planId: string) => void;
  loading: boolean;
  loadingPlanId: string | null;
}

const PLAN_ICONS: Record<string, typeof Zap> = {
  DEVELOPER_BASIC: Zap,
  DEVELOPER_PRO: Star,
  DEVELOPER_ELITE: Crown,
};

const PLAN_ACCENT: Record<string, string> = {
  DEVELOPER_BASIC: 'border-brand-500/20 bg-brand-500/5',
  DEVELOPER_PRO:   'border-purple-500/30 bg-purple-500/5',
  DEVELOPER_ELITE: 'border-yellow-500/30 bg-yellow-500/5',
};

const PLAN_ICON_COLOR: Record<string, string> = {
  DEVELOPER_BASIC: 'text-brand-400',
  DEVELOPER_PRO:   'text-purple-400',
  DEVELOPER_ELITE: 'text-yellow-400',
};

export function PlanSelector({ plans, currentPlan, onSubscribe, loading, loadingPlanId }: PlanSelectorProps) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {plans.map((plan) => {
        const Icon = PLAN_ICONS[plan.id] ?? Zap;
        const isCurrent = currentPlan === plan.id;
        const isPro = plan.id === 'DEVELOPER_PRO';

        return (
          <div
            key={plan.id}
            className={clsx(
              'relative glass rounded-2xl border p-6 transition-all duration-300 flex flex-col',
              PLAN_ACCENT[plan.id] ?? 'border-white/5',
              isCurrent ? 'ring-2 ring-brand-500/40' : '',
              isPro ? 'lg:-translate-y-2 lg:shadow-xl lg:shadow-purple-500/10' : '',
            )}
          >
            {isPro && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-purple-500 px-3 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-lg">
                Most Popular
              </span>
            )}

            {isCurrent && (
              <span className="absolute -top-3 right-4 rounded-full bg-green-500 px-3 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-lg">
                Current Plan
              </span>
            )}

            {/* Header */}
            <div className="mb-4 flex items-center gap-3">
              <div className={clsx('flex h-10 w-10 items-center justify-center rounded-xl bg-surface-700', PLAN_ICON_COLOR[plan.id])}>
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold text-white">{plan.name}</h3>
                <p className="text-xs text-gray-500">{plan.id.replace('DEVELOPER_', '')}</p>
              </div>
            </div>

            {/* Price */}
            <div className="mb-5">
              <span className="text-4xl font-bold text-white">${plan.monthlyUsd}</span>
              <span className="ml-1 text-sm text-gray-500">/month</span>
            </div>

            {/* Limits highlight */}
            <div className="mb-5 grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-surface-700/40 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-gray-500">Per minute</p>
                <p className="font-bold text-white">{plan.requestsPerMinute}</p>
              </div>
              <div className="rounded-lg bg-surface-700/40 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-gray-500">Per month</p>
                <p className="font-bold text-white">
                  {plan.requestsPerMonth === -1 ? '∞' : plan.requestsPerMonth.toLocaleString()}
                </p>
              </div>
            </div>

            {/* Features */}
            <ul className="mb-6 space-y-2 flex-1">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-xs text-gray-300">
                  <Check className="h-3.5 w-3.5 flex-shrink-0 text-green-400 mt-0.5" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>

            {/* CTA */}
            <Button
              variant={isCurrent ? 'secondary' : 'primary'}
              fullWidth
              size="md"
              loading={loading && loadingPlanId === plan.id}
              disabled={isCurrent}
              onClick={() => onSubscribe(plan.id)}
            >
              {isCurrent ? 'Active' : currentPlan ? 'Switch to this plan' : 'Subscribe'}
            </Button>
          </div>
        );
      })}
    </div>
  );
}
