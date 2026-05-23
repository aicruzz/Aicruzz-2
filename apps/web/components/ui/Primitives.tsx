import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

/* ── Spinner ───────────────────────────────────────────────── */
export function Spinner({ className }: { className?: string }) {
  return (
    <Loader2
      className={cn('h-4 w-4 animate-spin text-brand-400', className)}
      aria-label="Loading"
      role="status"
    />
  );
}

/* ── Glass Card ────────────────────────────────────────────── */
export function Card({
  children,
  className,
  as: As = 'div',
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section' | 'article';
}) {
  return (
    <As className={cn('glass rounded-2xl border border-white/5 p-5', className)}>
      {children}
    </As>
  );
}

/* ── Badge ─────────────────────────────────────────────────── */
const BADGE_TONES = {
  brand: 'bg-brand-500/10 text-brand-300 border-brand-500/30',
  green: 'bg-green-500/10 text-green-400 border-green-500/30',
  yellow: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
  red: 'bg-red-500/10 text-red-400 border-red-500/30',
  gray: 'bg-white/5 text-gray-400 border-white/10',
} as const;

export function Badge({
  children,
  tone = 'gray',
  className,
}: {
  children: ReactNode;
  tone?: keyof typeof BADGE_TONES;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium',
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ── Empty State ───────────────────────────────────────────── */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 px-6 py-14 text-center">
      {icon && <div className="mb-3 text-gray-500">{icon}</div>}
      <p className="text-sm font-semibold text-gray-200">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-xs text-gray-500">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
