'use client';

import { Activity, Zap, Calendar, AlertTriangle } from 'lucide-react';

interface Subscription {
  plan: string;
  status: string;
  requestsPerMinute: number;
  requestsPerMonth: number;
  requestsUsedThisMonth: number;
  usdPriceMonthly: number;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
}

interface UsageStatsProps {
  subscription: Subscription;
}

const PLAN_LABEL: Record<string, string> = {
  DEVELOPER_BASIC: 'Basic',
  DEVELOPER_PRO: 'Pro',
  DEVELOPER_ELITE: 'Elite',
};

export function UsageStats({ subscription }: UsageStatsProps) {
  const isUnlimited = subscription.requestsPerMonth === -1;
  const usagePercent = isUnlimited
    ? 0
    : Math.min(100, (subscription.requestsUsedThisMonth / subscription.requestsPerMonth) * 100);
  const isNearLimit = usagePercent > 80;

  const periodEnd = new Date(subscription.currentPeriodEnd);
  const daysRemaining = Math.max(0, Math.ceil((periodEnd.getTime() - Date.now()) / 86400000));

  return (
    <div className="space-y-4">
      {/* Status banner */}
      {subscription.cancelAtPeriodEnd && (
        <div className="flex items-center gap-3 rounded-xl border border-yellow-500/20 bg-yellow-500/5 px-4 py-3">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 text-yellow-400" />
          <p className="text-xs text-yellow-400/80">
            Your subscription is set to cancel on{' '}
            <strong>{periodEnd.toLocaleDateString()}</strong>. You'll retain access until then.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Current plan */}
        <div className="glass rounded-2xl border border-brand-500/20 p-5">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Active Plan
            </span>
            <Zap className="h-4 w-4 text-brand-400" />
          </div>
          <p className="text-2xl font-bold text-white">
            {PLAN_LABEL[subscription.plan] ?? subscription.plan}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            ${subscription.usdPriceMonthly}/month · Renews in {daysRemaining}d
          </p>
        </div>

        {/* Monthly usage */}
        <div className="glass rounded-2xl border border-white/5 p-5 sm:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Monthly Requests
            </span>
            <Activity className={`h-4 w-4 ${isNearLimit ? 'text-yellow-400' : 'text-green-400'}`} />
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white">
              {subscription.requestsUsedThisMonth.toLocaleString()}
            </span>
            <span className="text-sm text-gray-500">
              / {isUnlimited ? '∞ unlimited' : subscription.requestsPerMonth.toLocaleString()}
            </span>
          </div>

          {!isUnlimited && (
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-surface-700">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isNearLimit ? 'bg-yellow-500' : 'bg-brand-500'
                }`}
                style={{ width: `${usagePercent}%` }}
              />
            </div>
          )}

          <div className="mt-2 flex items-center gap-3 text-[10px] text-gray-600">
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Period: {new Date(subscription.currentPeriodStart).toLocaleDateString()} – {periodEnd.toLocaleDateString()}
            </span>
            <span>· {subscription.requestsPerMinute} req/min</span>
          </div>
        </div>
      </div>
    </div>
  );
}
