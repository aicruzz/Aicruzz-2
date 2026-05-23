'use client';

import { type LucideIcon } from 'lucide-react';
import { clsx } from 'clsx';

interface StatsCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  trend?: string;
  trendPositive?: boolean;
  loading?: boolean;
  accent?: 'blue' | 'green' | 'red' | 'yellow' | 'purple';
}

const ACCENT = {
  blue:   { bg: 'bg-brand-500/10',   border: 'border-brand-500/20',   icon: 'text-brand-400'  },
  green:  { bg: 'bg-green-500/10',   border: 'border-green-500/20',   icon: 'text-green-400'  },
  red:    { bg: 'bg-red-500/10',     border: 'border-red-500/20',     icon: 'text-red-400'    },
  yellow: { bg: 'bg-yellow-500/10',  border: 'border-yellow-500/20',  icon: 'text-yellow-400' },
  purple: { bg: 'bg-purple-500/10',  border: 'border-purple-500/20',  icon: 'text-purple-400' },
};

export function StatsCard({
  label,
  value,
  icon: Icon,
  trend,
  trendPositive,
  loading = false,
  accent = 'blue',
}: StatsCardProps) {
  const a = ACCENT[accent];

  return (
    <div className={clsx('glass rounded-2xl border p-5 transition-all', a.border)}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          {label}
        </span>
        <div className={clsx('flex h-8 w-8 items-center justify-center rounded-lg', a.bg, a.icon)}>
          <Icon className="h-4 w-4" />
        </div>
      </div>

      {loading ? (
        <div className="h-8 w-24 rounded-lg shimmer" />
      ) : (
        <p className="text-2xl font-bold text-white">{value}</p>
      )}

      {trend && (
        <p className={clsx('mt-1.5 text-xs', trendPositive ? 'text-green-400' : 'text-gray-500')}>
          {trend}
        </p>
      )}
    </div>
  );
}
