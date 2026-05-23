'use client';

import { ArrowDownLeft, ArrowUpRight, RotateCcw, Shield, Minus } from 'lucide-react';
import { clsx } from 'clsx';

interface Transaction {
  id: string;
  type: string;
  status: string;
  usdAmount: number | null;
  creditsBase: number;
  creditsBonus: number;
  creditsRestored: number;
  creditsTotal: number;
  balanceBefore: number;
  balanceAfter: number;
  description: string;
  module: string | null;
  createdAt: string;
}

interface TransactionListProps {
  transactions: Transaction[];
  loading?: boolean;
}

const TYPE_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string; sign: string }> = {
  FUND:         { icon: ArrowDownLeft, color: 'text-green-400', label: 'Funded',    sign: '+' },
  DEDUCT:       { icon: ArrowUpRight,  color: 'text-red-400',   label: 'Used',      sign: '-' },
  REFUND:       { icon: RotateCcw,     color: 'text-blue-400',  label: 'Refunded',  sign: '+' },
  ADMIN_CREDIT: { icon: Shield,        color: 'text-purple-400',label: 'Admin',     sign: '+' },
  ADMIN_DEDUCT: { icon: Minus,         color: 'text-orange-400',label: 'Adjusted',  sign: '-' },
  EXPIRY:       { icon: Minus,         color: 'text-gray-500',  label: 'Expired',   sign: '-' },
  RESTORE:      { icon: ArrowDownLeft, color: 'text-yellow-400',label: 'Restored',  sign: '+' },
  BONUS:        { icon: ArrowDownLeft, color: 'text-yellow-400',label: 'Bonus',     sign: '+' },
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function TransactionList({ transactions, loading = false }: TransactionListProps) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-14 rounded-xl shimmer" />
        ))}
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-gray-500">
        No transactions yet. Fund your wallet to get started.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {transactions.map((tx) => {
        const cfg = TYPE_CONFIG[tx.type] ?? TYPE_CONFIG.DEDUCT;
        const Icon = cfg.icon;
        const isCredit = ['FUND', 'REFUND', 'ADMIN_CREDIT', 'RESTORE', 'BONUS'].includes(tx.type);

        return (
          <div
            key={tx.id}
            className="flex items-center gap-4 rounded-xl border border-white/5 bg-surface-800/60 px-4 py-3 hover:border-white/10 transition-colors"
          >
            <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-surface-700 ${cfg.color}`}>
              <Icon className="h-4 w-4" />
            </div>

            <div className="flex-1 min-w-0">
              <p className="truncate text-sm font-medium text-white">{tx.description}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-gray-500">{formatDate(tx.createdAt)}</span>
                {tx.module && (
                  <span className="rounded-md bg-surface-700 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-400">
                    {tx.module}
                  </span>
                )}
                <span
                  className={clsx('text-[10px] font-medium uppercase', {
                    'text-green-400': tx.status === 'COMPLETED',
                    'text-yellow-400': tx.status === 'PENDING',
                    'text-red-400': tx.status === 'FAILED',
                    'text-blue-400': tx.status === 'REFUNDED',
                  })}
                >
                  {tx.status}
                </span>
              </div>
            </div>

            <div className="text-right flex-shrink-0">
              <p className={`text-sm font-bold ${isCredit ? 'text-green-400' : 'text-red-400'}`}>
                {cfg.sign}{Math.abs(tx.creditsTotal).toFixed(1)}
              </p>
              <p className="text-xs text-gray-500">→ {tx.balanceAfter.toFixed(0)} cr</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
