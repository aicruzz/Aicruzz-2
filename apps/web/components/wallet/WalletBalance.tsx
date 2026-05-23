'use client';

import { Zap, Clock, TrendingUp, AlertTriangle } from 'lucide-react';

interface WalletBalanceProps {
  credits: number;
  pendingRestore: number;
  expiresAt: string | null;
  isExpired: boolean;
  daysUntilExpiry: number | null;
  loading?: boolean;
}

export function WalletBalance({
  credits,
  pendingRestore,
  expiresAt,
  isExpired,
  daysUntilExpiry,
  loading = false,
}: WalletBalanceProps) {
  const expiryWarning = daysUntilExpiry !== null && daysUntilExpiry <= 7;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {/* Main balance */}
      <div className="glass col-span-1 rounded-2xl border border-white/5 p-6 sm:col-span-2">
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            Available Credits
          </span>
          <Zap className="h-4 w-4 text-brand-400" />
        </div>

        {loading ? (
          <div className="h-12 w-40 rounded-xl shimmer" />
        ) : (
          <p className="text-5xl font-bold tracking-tight text-white">
            {isExpired ? (
              <span className="text-gray-600">0</span>
            ) : (
              credits.toFixed(0)
            )}
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-3">
          {isExpired && (
            <span className="flex items-center gap-1 rounded-full bg-red-500/10 px-3 py-1 text-xs font-medium text-red-400 border border-red-500/20">
              <AlertTriangle className="h-3 w-3" />
              Credits expired
            </span>
          )}

          {!isExpired && expiresAt && (
            <span
              className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium border ${
                expiryWarning
                  ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                  : 'bg-surface-700 text-gray-400 border-white/5'
              }`}
            >
              <Clock className="h-3 w-3" />
              {daysUntilExpiry === 0
                ? 'Expires today'
                : `Expires in ${daysUntilExpiry} day${daysUntilExpiry !== 1 ? 's' : ''}`}
            </span>
          )}

          {!isExpired && !expiresAt && (
            <span className="text-xs text-gray-500">No expiry set — fund to activate</span>
          )}
        </div>
      </div>

      {/* Pending restore */}
      <div className="glass rounded-2xl border border-white/5 p-6">
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            Restorable
          </span>
          <TrendingUp className="h-4 w-4 text-yellow-400" />
        </div>

        {loading ? (
          <div className="h-10 w-20 rounded-xl shimmer" />
        ) : (
          <p className="text-3xl font-bold text-white">{pendingRestore.toFixed(0)}</p>
        )}

        <p className="mt-3 text-xs text-gray-500">
          {pendingRestore > 0
            ? 'Auto-restored when you next fund your wallet'
            : 'No expired credits pending restore'}
        </p>
      </div>
    </div>
  );
}
