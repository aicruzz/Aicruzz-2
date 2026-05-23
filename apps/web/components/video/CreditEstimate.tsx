'use client';

import { Zap, AlertTriangle } from 'lucide-react';

interface CreditEstimateProps {
  credits: number;
  userCredits: number;
  loading?: boolean;
}

export function CreditEstimate({ credits, userCredits, loading }: CreditEstimateProps) {
  const insufficient = userCredits < credits;

  return (
    <div className={`flex items-center justify-between rounded-xl border px-4 py-3 ${
      insufficient
        ? 'border-red-500/30 bg-red-500/5'
        : 'border-brand-500/20 bg-brand-500/5'
    }`}>
      <div className="flex items-center gap-2">
        {insufficient ? (
          <AlertTriangle className="h-4 w-4 text-red-400" />
        ) : (
          <Zap className="h-4 w-4 text-brand-400" />
        )}
        <span className="text-sm text-gray-300">
          {insufficient ? 'Insufficient credits' : 'Credits required'}
        </span>
      </div>

      {loading ? (
        <div className="h-6 w-16 rounded shimmer" />
      ) : (
        <div className="text-right">
          <span className={`text-lg font-bold ${insufficient ? 'text-red-400' : 'text-brand-400'}`}>
            {credits}
          </span>
          <span className="ml-1 text-xs text-gray-500">/ {userCredits} available</span>
        </div>
      )}
    </div>
  );
}
