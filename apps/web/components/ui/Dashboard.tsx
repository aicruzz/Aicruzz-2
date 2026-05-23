'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Skeleton } from './Skeleton';
import { Badge } from './Primitives';

/* ── StatCard — wallet / API / admin metric tile ───────────── */
export function StatCard({
  label,
  value,
  icon,
  hint,
  trend,
  loading,
  className,
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  hint?: string;
  trend?: { dir: 'up' | 'down'; text: string };
  loading?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'glass rounded-2xl border border-white/5 p-5 transition-colors hover:border-white/10',
        className,
      )}
    >
      <div className="flex items-start justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
          {label}
        </span>
        {icon && <span className="text-brand-400">{icon}</span>}
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-7 w-24" />
      ) : (
        <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      )}
      <div className="mt-1 flex items-center gap-2">
        {trend && (
          <span
            className={cn(
              'text-xs font-medium',
              trend.dir === 'up' ? 'text-green-400' : 'text-red-400',
            )}
          >
            {trend.dir === 'up' ? '▲' : '▼'} {trend.text}
          </span>
        )}
        {hint && <span className="text-xs text-gray-500">{hint}</span>}
      </div>
    </div>
  );
}

/* ── CreditBadge — wallet primitive ────────────────────────── */
export function CreditBadge({
  credits,
  expiresAt,
  loading,
}: {
  credits: number;
  expiresAt?: string | null;
  loading?: boolean;
}) {
  if (loading) return <Skeleton className="h-7 w-28" />;
  const low = credits < 50;
  return (
    <div className="inline-flex items-center gap-2">
      <Badge tone={low ? 'yellow' : 'brand'}>
        {credits.toLocaleString()} credits
      </Badge>
      {expiresAt && (
        <span className="text-[11px] text-gray-500">
          expires {new Date(expiresAt).toLocaleDateString()}
        </span>
      )}
    </div>
  );
}

/* ── DataTable — admin/logs primitive (typed, accessible) ──── */
export interface Column<T> {
  key: string;
  header: ReactNode;
  render?: (row: T) => ReactNode;
  className?: string;
}

export function DataTable<T extends { id?: string | number }>({
  columns,
  rows,
  loading,
  emptyLabel = 'No records',
  rowKey,
}: {
  columns: Column<T>[];
  rows: T[];
  loading?: boolean;
  emptyLabel?: string;
  rowKey?: (row: T, i: number) => string | number;
}) {
  return (
    <div className="glass overflow-hidden rounded-2xl border border-white/5">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-gray-500">
              {columns.map((c) => (
                <th key={c.key} className={cn('px-4 py-3 font-medium', c.className)}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-white/5">
                  {columns.map((c) => (
                    <td key={c.key} className="px-4 py-3">
                      <Skeleton className="h-4 w-full" />
                    </td>
                  ))}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-10 text-center text-sm text-gray-500"
                >
                  {emptyLabel}
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr
                  key={rowKey ? rowKey(row, i) : (row.id ?? i)}
                  className="border-b border-white/5 transition-colors hover:bg-white/[0.03]"
                >
                  {columns.map((c) => (
                    <td key={c.key} className={cn('px-4 py-3 text-gray-300', c.className)}>
                      {c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
