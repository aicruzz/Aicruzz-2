'use client';

import { useState } from 'react';
import { CheckCircle2, XCircle, Clock, Loader2, Download, X, RefreshCw, Zap } from 'lucide-react';
import { clsx } from 'clsx';
import { cartoonApi, getApiError } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import toast from 'react-hot-toast';

interface CartoonJob {
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

interface CartoonJobCardProps {
  job: CartoonJob;
  onStatusChange: (id: string, status: string) => void;
}

const STATUS_CONFIG = {
  QUEUED:     { icon: Clock,        color: 'text-yellow-400', label: 'Queued'     },
  PROCESSING: { icon: Loader2,      color: 'text-blue-400',   label: 'Processing', spin: true },
  COMPLETED:  { icon: CheckCircle2, color: 'text-green-400',  label: 'Done'       },
  FAILED:     { icon: XCircle,      color: 'text-red-400',    label: 'Failed'     },
  CANCELLED:  { icon: X,            color: 'text-gray-500',   label: 'Cancelled'  },
};

const TYPE_LABELS: Record<string, string> = {
  ANIMATED_AD: 'Animated Ad', HUMAN_CARTOON: 'Human Cartoon', CUSTOM: 'Custom',
};

export function CartoonJobCard({ job, onStatusChange }: CartoonJobCardProps) {
  const [loading, setLoading] = useState(false);
  const cfg = STATUS_CONFIG[job.status];
  const Icon = cfg.icon;

  async function handleCancel() {
    setLoading(true);
    try {
      await cartoonApi.cancelJob(job.id);
      onStatusChange(job.id, 'CANCELLED');
      toast.success('Job cancelled — credits refunded');
    } catch (err) { toast.error(getApiError(err)); }
    finally { setLoading(false); }
  }

  async function handleRefresh() {
    setLoading(true);
    try {
      const res = await cartoonApi.getJob(job.id);
      const updated = (res.data as { data: { status: string } }).data;
      onStatusChange(job.id, updated.status);
    } catch (err) { toast.error(getApiError(err)); }
    finally { setLoading(false); }
  }

  return (
    <div className="glass rounded-2xl border border-white/5 overflow-hidden hover:border-white/10 transition-all">
      {/* Preview */}
      <div className="relative aspect-video bg-surface-700/50">
        {job.outputUrl ? (
          <video src={job.outputUrl} className="h-full w-full object-cover" controls poster={job.thumbnailUrl ?? undefined} />
        ) : job.thumbnailUrl ? (
          <img src={job.thumbnailUrl} className="h-full w-full object-cover" alt="thumbnail" />
        ) : (
          <div className="flex h-full items-center justify-center">
            {job.status === 'PROCESSING' ? (
              <Loader2 className="h-8 w-8 animate-spin text-brand-400" />
            ) : job.status === 'QUEUED' ? (
              <Clock className="h-8 w-8 text-yellow-400/50" />
            ) : null}
          </div>
        )}

        {/* Status badge */}
        <div className={clsx('absolute right-2 top-2 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1', cfg.color)}>
          <Icon className={clsx('h-3.5 w-3.5', 'spin' in cfg && cfg.spin ? 'animate-spin' : '')} />
          <span className="text-[10px] font-semibold uppercase">{cfg.label}</span>
        </div>

        {/* Type badge */}
        <div className="absolute left-2 top-2 rounded-md bg-black/60 px-2 py-0.5 text-[10px] font-medium text-gray-300">
          {TYPE_LABELS[job.type] ?? job.type}
        </div>
      </div>

      {/* Info */}
      <div className="p-4 space-y-3">
        <p className="text-sm font-medium text-white line-clamp-2">
          {job.prompt ?? `${job.animationStyle} animation`}
        </p>

        <div className="flex flex-wrap gap-1.5">
          <span className="rounded-md bg-surface-700 px-2 py-0.5 text-[10px] text-gray-400">{job.durationSecs}s</span>
          {job.provider && <span className="rounded-md bg-brand-500/10 px-2 py-0.5 text-[10px] text-brand-400">{job.provider}</span>}
          <span className="flex items-center gap-0.5 rounded-md bg-surface-700 px-2 py-0.5 text-[10px] text-gray-400">
            <Zap className="h-2.5 w-2.5" />{job.creditsCharged}
            {job.creditRefunded && <span className="ml-1 text-green-400">(refunded)</span>}
          </span>
        </div>

        {job.errorMessage && (
          <p className="rounded-lg bg-red-500/5 border border-red-500/10 px-3 py-2 text-xs text-red-400">
            {job.errorMessage}
          </p>
        )}

        <div className="flex gap-2">
          {job.status === 'COMPLETED' && job.outputUrl && (
            <Button variant="primary" size="sm" fullWidth
              onClick={() => { const a = document.createElement('a'); a.href = job.outputUrl!; a.download = `cartoon-${job.id}.mp4`; a.click(); }}
              icon={<Download className="h-3.5 w-3.5" />}
            >Download</Button>
          )}
          {(job.status === 'QUEUED' || job.status === 'PROCESSING') && (
            <>
              <Button variant="secondary" size="sm" loading={loading} onClick={handleRefresh} icon={<RefreshCw className="h-3.5 w-3.5" />}>Refresh</Button>
              <Button variant="danger" size="sm" loading={loading} onClick={handleCancel} icon={<X className="h-3.5 w-3.5" />}>Cancel</Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
