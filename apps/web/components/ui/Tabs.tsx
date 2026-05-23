'use client';

import { useId, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface TabItem {
  key: string;
  label: ReactNode;
  icon?: ReactNode;
}

/**
 * Accessible tabs (ARIA tablist + roving arrow-key focus). Controlled.
 * Purely presentational — no data coupling.
 */
export function Tabs({
  items,
  value,
  onChange,
  className,
}: {
  items: TabItem[];
  value: string;
  onChange: (key: string) => void;
  className?: string;
}) {
  const baseId = useId();
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const onKeyDown = (e: React.KeyboardEvent, idx: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const dir = e.key === 'ArrowRight' ? 1 : -1;
    const next = items[(idx + dir + items.length) % items.length];
    onChange(next.key);
    refs.current[next.key]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-orientation="horizontal"
      className={cn(
        'flex gap-1 overflow-x-auto rounded-xl border border-white/10 bg-surface-800/60 p-1',
        className,
      )}
    >
      {items.map((it, idx) => {
        const active = it.key === value;
        return (
          <button
            key={it.key}
            ref={(el) => {
              refs.current[it.key] = el;
            }}
            role="tab"
            id={`${baseId}-tab-${it.key}`}
            aria-selected={active}
            aria-controls={`${baseId}-panel-${it.key}`}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(it.key)}
            onKeyDown={(e) => onKeyDown(e, idx)}
            className={cn(
              'flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60',
              active
                ? 'bg-brand-gradient text-white shadow-lg shadow-brand-500/20'
                : 'text-gray-400 hover:bg-white/5 hover:text-gray-200',
            )}
          >
            {it.icon}
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({
  tabKey,
  active,
  children,
}: {
  tabKey: string;
  active: boolean;
  children: ReactNode;
}) {
  if (!active) return null;
  return (
    <div role="tabpanel" aria-labelledby={`tab-${tabKey}`} className="animate-fade-in">
      {children}
    </div>
  );
}
