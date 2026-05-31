'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Clock, Loader2, CheckCircle2, XCircle, Download, RotateCcw, Save,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { cartoonApi, cartoonSaveApi, getApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Overlay';
import { TalkingVideoPlayer } from '@/components/media/TalkingVideoPlayer';

type Status = 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

interface Job {
  id: string;
  status: Status;
  outputUrl: string | null;
  thumbnailUrl: string | null;
  errorMessage: string | null;
  provider: string | null;
  // Narration track. When delivered as a SEPARATE track (lip-sync not muxed),
  // the player plays audioUrl in sync; when RENDERED, audio is already in the MP4.
  voice?: {
    audioUrl: string | null;
    subtitlesVtt: string | null;
    lipSyncStatus: string | null;
  } | null;
}

const STEPS: { key: Status; label: string }[] = [
  { key: 'QUEUED', label: 'Queued' },
  { key: 'PROCESSING', label: 'Rendering' },
  { key: 'COMPLETED', label: 'Completed' },
];

function stepIndex(s: Status): number {
  if (s === 'QUEUED') return 0;
  if (s === 'PROCESSING') return 1;
  if (s === 'COMPLETED') return 2;
  return 1;
}

export function JobProgress({
  jobId,
  onRetry,
}: {
  jobId: string;
  onRetry: () => void;
}) {
  const [job, setJob] = useState<Job | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const timer = useRef<ReturnType<typeof setInterval>>();

  const fetchJob = useCallback(async () => {
    try {
      const r = await cartoonApi.getJob(jobId);
      const data = (r.data as { data: Job }).data;
      setJob(data);
      if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(data.status) && timer.current) {
        clearInterval(timer.current);
      }
    } catch {
      /* transient — keep polling */
    }
  }, [jobId]);

  useEffect(() => {
    fetchJob();
    timer.current = setInterval(fetchJob, 4000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [fetchJob]);

  if (!job) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-surface-800/50 p-5 text-sm text-gray-400">
        <Loader2 className="h-4 w-4 animate-spin text-brand-400" /> Submitting…
      </div>
    );
  }

  const failed = job.status === 'FAILED' || job.status === 'CANCELLED';
  const done = job.status === 'COMPLETED';
  const active = stepIndex(job.status);

  return (
    <div className="space-y-4 rounded-2xl border border-white/10 bg-surface-800/50 p-5">
      {/* Stepper */}
      {!failed && (
        <div className="flex items-center gap-2">
          {STEPS.map((s, i) => {
            const reached = i <= active;
            const current = i === active && !done;
            const Icon = i === 2 ? CheckCircle2 : i === 1 ? Loader2 : Clock;
            return (
              <div key={s.key} className="flex flex-1 items-center gap-2">
                <div
                  className={cn(
                    'flex h-7 w-7 items-center justify-center rounded-full border text-xs',
                    reached
                      ? 'border-brand-500/60 bg-brand-500/15 text-brand-300'
                      : 'border-white/10 text-gray-600',
                  )}
                >
                  <Icon className={cn('h-3.5 w-3.5', current && 'animate-spin')} />
                </div>
                <span className={cn('text-xs', reached ? 'text-gray-200' : 'text-gray-600')}>
                  {s.label}
                </span>
                {i < STEPS.length - 1 && (
                  <div
                    className={cn(
                      'h-px flex-1',
                      i < active ? 'bg-brand-500/40' : 'bg-white/10',
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {failed && (
        <div className="space-y-3">
          <div className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/5 p-3">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
            <p className="text-sm text-red-300">
              {job.errorMessage ?? 'Generation failed. Credits were refunded.'}
            </p>
          </div>
          <Button variant="secondary" size="sm" icon={<RotateCcw className="h-4 w-4" />} onClick={onRetry}>
            Retry generation
          </Button>
        </div>
      )}

      {done && job.outputUrl && (
        <div className="space-y-3">
          <TalkingVideoPlayer
            src={job.outputUrl}
            poster={job.thumbnailUrl ?? undefined}
            // Only play the separate audio track when it is NOT already muxed
            // into the MP4 (avoids double audio on lip-synced renders).
            audioSrc={
              job.voice?.audioUrl && job.voice.lipSyncStatus !== 'RENDERED'
                ? job.voice.audioUrl
                : undefined
            }
            subtitlesVtt={job.voice?.subtitlesVtt ?? undefined}
          />
          <div className="flex flex-wrap gap-2">
            <a href={job.outputUrl} download target="_blank" rel="noreferrer">
              <Button size="sm" icon={<Download className="h-4 w-4" />}>
                Download
              </Button>
            </a>
            <Button
              variant="secondary"
              size="sm"
              icon={<Save className="h-4 w-4" />}
              onClick={() => setSaveOpen(true)}
            >
              Save as template
            </Button>
            {job.provider && (
              <span className="ml-auto self-center text-xs text-gray-500">
                via {job.provider}
              </span>
            )}
          </div>
        </div>
      )}

      <Modal open={saveOpen} onClose={() => setSaveOpen(false)} title="Save as template">
        <input
          value={saveName}
          onChange={(e) => setSaveName(e.target.value)}
          placeholder="Template name"
          className="w-full rounded-xl border border-white/10 bg-surface-700/50 px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:border-brand-500/40 focus:outline-none"
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setSaveOpen(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!saveName.trim()}
            onClick={async () => {
              try {
                await cartoonSaveApi.asTemplate(job.id, { name: saveName.trim() });
                toast.success('Saved as template');
                setSaveOpen(false);
                setSaveName('');
              } catch (e) {
                toast.error(getApiError(e));
              }
            }}
          >
            Save
          </Button>
        </div>
      </Modal>
    </div>
  );
}
