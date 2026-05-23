'use client';

import { useMemo } from 'react';
import { VideoJobCard } from './VideoJobCard';

interface VideoJob {
  id: string;
  status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  prompt: string | null;
  durationSeconds: number;
  resolution: string;
  qualityMode: string;
  provider: string | null;
  creditsCharged: number;
  creditRefunded: boolean;
  outputUrl: string | null;
  thumbnailUrl: string | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
  stage?: string;
  progress?: number;
  liveMessage?: string;
}

interface VideoGalleryProps {
  jobs: VideoJob[];
  loading?: boolean;
  onStatusChange: (jobId: string, status: string) => void;
}

export function VideoGallery({ jobs, loading = false, onStatusChange }: VideoGalleryProps) {
  // Active jobs first, then completed ones in reverse-chronological order so
  // the feed always surfaces in-flight work and freshly-finished videos at
  // the top — no manual refresh required.
  const ordered = useMemo(() => {
    const active = jobs.filter((j) => j.status === 'QUEUED' || j.status === 'PROCESSING');
    const done = jobs
      .filter((j) => j.status !== 'QUEUED' && j.status !== 'PROCESSING')
      .sort((a, b) => {
        const ta = new Date(a.completedAt ?? a.createdAt).getTime();
        const tb = new Date(b.completedAt ?? b.createdAt).getTime();
        return tb - ta;
      });
    return [...active, ...done];
  }, [jobs]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-72 rounded-2xl shimmer" />
        ))}
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-gray-500">No videos yet. Generate your first one above!</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {ordered.map((job) => (
        <VideoJobCard key={job.id} job={job} onStatusChange={onStatusChange} />
      ))}
    </div>
  );
}
