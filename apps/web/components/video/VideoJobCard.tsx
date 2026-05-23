'use client';

import { useState } from 'react';
import {
  Clock, CheckCircle2, XCircle, Loader2, Download,
  Play, X, Zap, Sparkles,
} from 'lucide-react';
import { clsx } from 'clsx';
import { videoApi, getApiError } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import toast from 'react-hot-toast';

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

interface VideoJobCardProps {
  job: VideoJob;
  onStatusChange: (jobId: string, status: string) => void;
}

const STATUS_CONFIG = {
  QUEUED:     { icon: Clock,         color: 'text-yellow-400', bg: 'bg-yellow-500/10', label: 'Queued' },
  PROCESSING: { icon: Loader2,       color: 'text-blue-400',   bg: 'bg-blue-500/10',   label: 'Processing', spin: true },
  COMPLETED:  { icon: CheckCircle2,  color: 'text-green-400',  bg: 'bg-green-500/10',  label: 'Completed' },
  FAILED:     { icon: XCircle,       color: 'text-red-400',    bg: 'bg-red-500/10',    label: 'Failed' },
  CANCELLED:  { icon: X,             color: 'text-gray-400',   bg: 'bg-gray-500/10',   label: 'Cancelled' },
};

const RESOLUTION_LABEL: Record<string, string> = {
  SD_480P: '480p', HD_720P: '720p', FHD_1080P: '1080p',
};

const STAGE_LABEL: Record<string, string> = {
  'queued':          'Waiting for GPU',
  'generating':      'Generating frames',
  'post-processing': 'Smoothing motion',
  'encoding':        'Encoding video',
  'completed':       'Finalizing',
};

function LivePlaceholder({ stage, progress, message }: { stage?: string; progress?: number; message?: string }) {
  const label = message ?? (stage ? STAGE_LABEL[stage] ?? stage : 'Starting up');
  const pct = Math.max(2, Math.min(99, progress ?? 8));

  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Animated gradient sheen */}
      <div className="absolute inset-0 bg-gradient-to-br from-brand-500/30 via-fuchsia-500/20 to-blue-500/30" />
      <div className="absolute inset-0 animate-[shimmer_2.5s_linear_infinite] bg-[linear-gradient(110deg,transparent_25%,rgba(255,255,255,0.08)_50%,transparent_75%)] bg-[length:200%_100%]" />

      {/* Floating spark */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white">
        <div className="relative">
          <Sparkles className="h-7 w-7 animate-pulse text-white drop-shadow-lg" />
          <span className="absolute -inset-2 rounded-full bg-white/10 blur-md" />
        </div>
        <p className="px-4 text-center text-sm font-medium">{label}</p>
        <p className="text-[11px] uppercase tracking-wider text-white/70">{pct}%</p>
      </div>

      {/* Progress bar pinned to the bottom */}
      <div className="absolute inset-x-0 bottom-0 h-1.5 bg-black/40">
        <div
          className="h-full bg-gradient-to-r from-brand-400 to-fuchsia-400 transition-all duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function VideoJobCard({ job, onStatusChange }: VideoJobCardProps) {
  const [cancelling, setCancelling] = useState(false);
  const cfg = STATUS_CONFIG[job.status];
  const Icon = cfg.icon;
  const inFlight = job.status === 'QUEUED' || job.status === 'PROCESSING';

  async function handleCancel() {
    setCancelling(true);
    try {
      await videoApi.cancelJob(job.id);
      onStatusChange(job.id, 'CANCELLED');
      toast.success('Job cancelled — credits refunded');
    } catch (err) {
      toast.error(getApiError(err));
    } finally {
      setCancelling(false);
    }
  }

  function downloadVideo() {
    if (!job.outputUrl) return;
    const a = document.createElement('a');
    a.href = job.outputUrl;
    a.download = `aicruzz-video-${job.id}.mp4`;
    a.click();
  }

  return (
    <div
      className={clsx(
        'glass rounded-2xl border overflow-hidden transition-all',
        inFlight ? 'border-brand-400/30 hover:border-brand-400/50' : 'border-white/5 hover:border-white/10',
        job.status === 'COMPLETED' && 'animate-fade-in',
      )}
    >
      {/* Thumbnail / live placeholder / final video */}
      <div className="relative aspect-video bg-surface-700/50 overflow-hidden">
        {job.outputUrl && job.status === 'COMPLETED' ? (
          <video
            src={job.outputUrl}
            className="h-full w-full object-cover"
            poster={job.thumbnailUrl ?? undefined}
            controls
            preload="metadata"
          />
        ) : job.thumbnailUrl ? (
          <img src={job.thumbnailUrl} alt="Thumbnail" className="h-full w-full object-cover" />
        ) : inFlight ? (
          <LivePlaceholder
            stage={job.stage}
            progress={job.progress}
            message={job.liveMessage}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Play className="h-8 w-8 text-gray-600" />
          </div>
        )}

        {/* Status badge */}
        <div className={clsx(
          'absolute right-2 top-2 z-10 flex items-center gap-1.5 rounded-full px-2 py-1 backdrop-blur-sm',
          cfg.bg,
        )}>
          <Icon className={clsx('h-3.5 w-3.5', cfg.color, 'spin' in cfg && cfg.spin && 'animate-spin')} />
          <span className={clsx('text-[10px] font-semibold uppercase tracking-wide', cfg.color)}>
            {cfg.label}
          </span>
        </div>
      </div>

      {/* Info */}
      <div className="p-4 space-y-3">
        {/* Prompt */}
        <p className="text-sm font-medium text-white line-clamp-2">
          {job.prompt ?? 'No prompt'}
        </p>

        {/* Tags */}
        <div className="flex flex-wrap gap-1.5">
          <span className="rounded-md bg-surface-700 px-2 py-0.5 text-[10px] font-medium text-gray-400">
            {RESOLUTION_LABEL[job.resolution] ?? job.resolution}
          </span>
          <span className="rounded-md bg-surface-700 px-2 py-0.5 text-[10px] font-medium text-gray-400">
            {job.qualityMode}
          </span>
          <span className="rounded-md bg-surface-700 px-2 py-0.5 text-[10px] font-medium text-gray-400">
            {job.durationSeconds}s
          </span>
          {job.provider && (
            <span className="rounded-md bg-brand-500/10 px-2 py-0.5 text-[10px] font-medium text-brand-400">
              {job.provider}
            </span>
          )}
        </div>

        {/* Credits */}
        <div className="flex items-center gap-1 text-xs text-gray-500">
          <Zap className="h-3 w-3" />
          {job.creditsCharged} credits
          {job.creditRefunded && <span className="text-green-400 ml-1">(refunded)</span>}
        </div>

        {/* Error */}
        {job.errorMessage && (
          <p className="text-xs text-red-400 bg-red-500/5 rounded-lg px-3 py-2 border border-red-500/10">
            {job.errorMessage}
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          {job.status === 'COMPLETED' && job.outputUrl && (
            <Button
              variant="primary"
              size="sm"
              fullWidth
              onClick={downloadVideo}
              icon={<Download className="h-3.5 w-3.5" />}
            >
              Download
            </Button>
          )}

          {inFlight && (
            <Button
              variant="danger"
              size="sm"
              fullWidth
              loading={cancelling}
              onClick={handleCancel}
              icon={<X className="h-3.5 w-3.5" />}
            >
              Cancel
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
