'use client';

import { useMemo, useState } from 'react';
import { Search, ImageIcon, Check } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Skeleton } from './Skeleton';
import { EmptyState } from './Primitives';

export interface PickableAsset {
  id: string;
  name: string;
  url?: string;
  thumbnailUrl?: string | null;
  type?: string;
}

/**
 * Reusable library picker (assets / characters / voices / scenes).
 * Backend-agnostic: the caller supplies `items` + `loading`. Includes
 * client search/filter. Grid is virtualization-friendly (simple, light).
 */
export function AssetPicker({
  items,
  loading,
  selectedId,
  onSelect,
  emptyLabel = 'No saved items yet',
  className,
}: {
  items: PickableAsset[];
  loading?: boolean;
  selectedId?: string | null;
  onSelect: (asset: PickableAsset) => void;
  emptyLabel?: string;
  className?: string;
}) {
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return items;
    return items.filter(
      (i) =>
        i.name.toLowerCase().includes(term) ||
        (i.type ?? '').toLowerCase().includes(term),
    );
  }, [items, q]);

  return (
    <div className={cn('space-y-3', className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search library…"
          aria-label="Search library"
          className="w-full rounded-xl border border-white/10 bg-surface-700/50 py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-gray-500 focus:border-brand-500/40 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
        />
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<ImageIcon className="h-7 w-7" />}
          title={emptyLabel}
          description="Items you save will appear here for reuse."
        />
      ) : (
        <div
          role="listbox"
          aria-label="Library"
          className="grid max-h-80 grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3"
        >
          {filtered.map((a) => {
            const active = a.id === selectedId;
            return (
              <button
                key={a.id}
                role="option"
                aria-selected={active}
                onClick={() => onSelect(a)}
                className={cn(
                  'group relative overflow-hidden rounded-xl border text-left transition-all',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60',
                  active
                    ? 'border-brand-500/70 ring-2 ring-brand-500/40'
                    : 'border-white/10 hover:border-white/25',
                )}
              >
                <div className="aspect-square w-full bg-white/[0.04]">
                  {a.thumbnailUrl || a.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={a.thumbnailUrl || a.url}
                      alt={a.name}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-gray-600">
                      <ImageIcon className="h-6 w-6" />
                    </div>
                  )}
                </div>
                <div className="truncate px-2 py-1.5 text-xs text-gray-300">
                  {a.name}
                </div>
                {active && (
                  <div className="absolute right-2 top-2 rounded-full bg-brand-500 p-1">
                    <Check className="h-3 w-3 text-white" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
