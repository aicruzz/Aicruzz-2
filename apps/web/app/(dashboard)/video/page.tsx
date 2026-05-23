'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Video as VideoIcon, Radio } from 'lucide-react';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import { videoApi, walletApi, getApiError } from '@/lib/api';
import { VideoForm } from '@/components/video/VideoForm';
import { VideoGallery } from '@/components/video/VideoGallery';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/contexts/AuthContext';
import { useVideoEvents, type VideoEvent } from '@/hooks/useVideoEvents';

export interface VideoJob {
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
  // Live, in-flight metadata pushed from the backend via SSE.
  stage?: string;
  progress?: number;
  liveMessage?: string;
}

export default function VideoPage() {
  const { refreshUser } = useAuth();
  const [jobs, setJobs] = useState<VideoJob[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [userCredits, setUserCredits] = useState(0);

  const fetchJobs = useCallback(async () => {
    try {
      const res = await videoApi.listJobs(1, 30);
      setJobs((res.data as { data: VideoJob[] }).data);
    } catch (err) {
      toast.error(getApiError(err));
    } finally {
      setLoadingJobs(false);
    }
  }, []);

  const fetchBalance = useCallback(async () => {
    try {
      const res = await walletApi.getBalance();
      const bal = (res.data as { data: { credits: number } }).data;
      setUserCredits(bal.credits);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchJobs();
    fetchBalance();
  }, [fetchJobs, fetchBalance]);

  // ── Live SSE feed ────────────────────────────────────────────
  // Replaces the old 5-second polling loop entirely. The backend
  // pushes status, stage, progress, and final URLs as they happen.
  const handleEvent = useCallback((event: VideoEvent) => {
    setJobs((prev) => {
      const idx = prev.findIndex((j) => j.id === event.jobId);
      const merge = (existing: VideoJob | null): VideoJob | null => existing && ({
        ...existing,
        status:       event.status,
        outputUrl:    event.outputUrl    ?? existing.outputUrl,
        thumbnailUrl: event.thumbnailUrl ?? existing.thumbnailUrl,
        provider:     event.provider     ?? existing.provider,
        errorMessage: event.error        ?? existing.errorMessage,
        stage:        event.stage        ?? existing.stage,
        progress:     event.progress     ?? existing.progress,
        liveMessage:  event.message      ?? existing.liveMessage,
        completedAt:
          event.status === 'COMPLETED' || event.status === 'FAILED' || event.status === 'CANCELLED'
            ? new Date().toISOString()
            : existing.completedAt,
      });

      if (idx === -1) {
        // Job not yet in the list (e.g. event arrived before listJobs() resolved).
        // Just trigger a refetch so the new card slides in.
        fetchJobs();
        return prev;
      }

      const next = [...prev];
      next[idx] = merge(next[idx])!;
      return next;
    });

    if (event.status === 'COMPLETED' || event.status === 'FAILED' || event.status === 'CANCELLED') {
      fetchBalance();
      refreshUser();
    }
  }, [fetchJobs, fetchBalance, refreshUser]);

  const { state: liveState } = useVideoEvents({ onEvent: handleEvent });

  function handleJobCreated(newJob: unknown) {
    setJobs((prev) => [newJob as VideoJob, ...prev]);
    fetchBalance();
    refreshUser();
  }

  function handleStatusChange(jobId: string, status: string) {
    setJobs((prev) =>
      prev.map((j) => (j.id === jobId ? { ...j, status: status as VideoJob['status'] } : j)),
    );
    if (status === 'CANCELLED' || status === 'COMPLETED' || status === 'FAILED') {
      fetchBalance();
      refreshUser();
    }
  }

  const activeCount = jobs.filter((j) => j.status === 'QUEUED' || j.status === 'PROCESSING').length;

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <VideoIcon className="h-5 w-5 text-brand-400" />
            Video Generation
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Text to video · Image to animation · Voice + lip sync
          </p>
        </div>

        <div className="flex items-center gap-3">
          {activeCount > 0 && (
            <span className="flex items-center gap-1.5 rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1.5 text-xs font-medium text-blue-400">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-400" />
              {activeCount} job{activeCount > 1 ? 's' : ''} running
            </span>
          )}
          <span
            className={clsx(
              'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide',
              liveState === 'open'
                ? 'border-green-500/30 bg-green-500/10 text-green-400'
                : liveState === 'connecting'
                  ? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400'
                  : 'border-gray-600/30 bg-gray-500/10 text-gray-400',
            )}
            title={`Live updates: ${liveState}`}
          >
            <Radio className="h-3 w-3" />
            {liveState === 'open' ? 'Live' : liveState === 'connecting' ? 'Connecting' : 'Offline'}
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => { fetchJobs(); fetchBalance(); }}
            icon={<RefreshCw className="h-4 w-4" />}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Generation form */}
      <VideoForm userCredits={userCredits} onJobCreated={handleJobCreated} />

      {/* Gallery */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">
            Your Videos
          </h2>
          <span className="text-xs text-gray-600">{jobs.length} total</span>
        </div>
        <VideoGallery jobs={jobs} loading={loadingJobs} onStatusChange={handleStatusChange} />
      </div>
    </div>
  );
}
