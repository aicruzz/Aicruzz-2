import { cn } from '@/lib/cn';

/** Shimmer placeholder. Use while data/media loads (skeleton screens). */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn('shimmer rounded-xl', className)}
    />
  );
}

/** Common skeleton: a media card placeholder. */
export function SkeletonCard() {
  return (
    <div className="glass space-y-3 rounded-2xl border border-white/5 p-4">
      <Skeleton className="aspect-video w-full" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  );
}

export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cn('h-3', i === lines - 1 ? 'w-2/5' : 'w-full')} />
      ))}
    </div>
  );
}
