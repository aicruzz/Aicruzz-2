'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Reveal } from '@/components/ui/motion';

/**
 * Reusable page scaffolding. Additive — feature pages can opt in without
 * changing the existing (dashboard) layout / Sidebar / MobileNav.
 * Responsive container + animated entrance + consistent spacing.
 */
export function PageContainer({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8',
        className,
      )}
    >
      <Reveal>{children}</Reveal>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  badge,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          <h1 className="truncate text-xl font-semibold text-white sm:text-2xl">
            {title}
          </h1>
          {badge}
        </div>
        {description && (
          <p className="mt-1 text-sm text-gray-400">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Section({
  title,
  description,
  children,
  className,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('mb-8', className)}>
      {title && (
        <div className="mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">
            {title}
          </h2>
          {description && (
            <p className="mt-0.5 text-xs text-gray-500">{description}</p>
          )}
        </div>
      )}
      {children}
    </section>
  );
}

/** Responsive content grid (auto-fit cards). */
export function CardGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3',
        className,
      )}
    >
      {children}
    </div>
  );
}
