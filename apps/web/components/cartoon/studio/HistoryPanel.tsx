'use client';

import { useCallback, useEffect, useState } from 'react';
import { History } from 'lucide-react';
import { cartoonApi } from '@/lib/api';
import { SkeletonCard, EmptyState } from '@/components/ui';
import { CartoonJobCard } from '@/components/cartoon/CartoonJobCard';

interface Job {
  id: string;
  type: string;
  status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  prompt: string | null;
  durationSecs: number;
  animationStyle: string;
  provider: string | null;
  creditsCharged: number;
  creditRefunded: boolean;
  outputUrl: string | null;
  thumbnailUrl: string | null;
  errorMessage: string | null;
  createdAt: string;
}

/** User generation history (reuses the existing CartoonJobCard). */
export function HistoryPanel({ refreshKey }: { refreshKey: number }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await cartoonApi.listJobs(1, 12);
      setJobs((r.data as { data: Job[] }).data ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  return (
    <div>
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-300">
        <History className="h-4 w-4" /> Generation history
      </div>
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <EmptyState
          icon={<History className="h-7 w-7" />}
          title="No generations yet"
          description="Your rendered cartoons will appear here."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {jobs.map((j) => (
            <CartoonJobCard key={j.id} job={j} onStatusChange={() => load()} />
          ))}
        </div>
      )}
    </div>
  );
}
