'use client';

import { type MutableRefObject, type ReactNode } from 'react';
import { Camera, Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { AvatarPipelineState } from '@/lib/livecam/avatarPipeline';

const PIPELINE_BADGE: Record<
  AvatarPipelineState,
  { label: string; cls: string; pulse?: boolean } | null
> = {
  IDLE: null,
  INITIALIZING: {
    label: 'Initializing',
    cls: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
  },
  LIVE: {
    label: 'Live reenactment',
    cls: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
    pulse: true,
  },
  STANDBY: {
    label: 'GPU standby',
    cls: 'bg-gray-500/15 text-gray-300 ring-white/15',
  },
  DEGRADED: {
    label: 'Degraded — standby',
    cls: 'bg-yellow-500/15 text-yellow-300 ring-yellow-500/30',
  },
};

/**
 * Large camera frame. Near vertical-phone proportions so a user can stand
 * back for full-body framing and capture the screen cleanly with a phone.
 *
 * Cinematic styling is applied to the CONTAINER ONLY (ring / gradient /
 * vignette). The live stream pixels are never altered — no fake processing.
 */
export function VideoStage({
  videoRef,
  label,
  variant,
  isLive,
  isCameraOn,
  statusOverlay,
  pipelineState,
  avatarPreviewUrl,
}: {
  videoRef: MutableRefObject<HTMLVideoElement | null>;
  label: string;
  variant: 'original' | 'processed';
  isLive: boolean;
  isCameraOn: boolean;
  statusOverlay?: ReactNode;
  pipelineState?: AvatarPipelineState;
  avatarPreviewUrl?: string;
}) {
  const processed = variant === 'processed';
  const badge =
    processed && isLive && pipelineState
      ? PIPELINE_BADGE[pipelineState]
      : null;
  return (
    <div
      className={cn(
        'relative w-full overflow-hidden rounded-3xl border bg-black shadow-2xl',
        'aspect-[9/16] sm:aspect-[3/4] lg:aspect-[4/5]',
        processed
          ? 'border-brand-500/30 shadow-brand-500/10 ring-1 ring-brand-500/20'
          : 'border-white/10',
      )}
    >
      <video
        ref={videoRef}
        autoPlay
        // Both feeds are muted: the processed stream now carries the live
        // mic track (for recording), so unmuting it would cause a delayed
        // self-echo. Recording captures the audio regardless.
        muted
        playsInline
        className="h-full w-full object-cover transition-opacity duration-500"
      />

      {/* Cinematic container overlay — purely presentational. */}
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-0',
          processed
            ? 'bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(0,0,0,0.45)_100%)]'
            : 'bg-[radial-gradient(ellipse_at_center,transparent_65%,rgba(0,0,0,0.35)_100%)]',
        )}
      />

      <div
        className={cn(
          'absolute left-3 top-3 rounded-full px-3 py-1 text-xs font-semibold backdrop-blur-md',
          processed
            ? 'bg-brand-500/15 text-brand-300 ring-1 ring-brand-500/30'
            : 'bg-black/50 text-gray-200 ring-1 ring-white/10',
        )}
      >
        {label}
      </div>

      {/* Pipeline state badge + active-avatar chip (processed, live). */}
      {badge && (
        <div className="absolute right-3 top-3 flex items-center gap-2">
          {avatarPreviewUrl && (
            <span className="h-7 w-7 overflow-hidden rounded-full ring-1 ring-white/20">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={avatarPreviewUrl}
                alt="Active avatar"
                className="h-full w-full object-cover"
              />
            </span>
          )}
          <span
            className={cn(
              'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 backdrop-blur-md',
              badge.cls,
            )}
          >
            {badge.pulse && (
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
            )}
            {badge.label}
          </span>
        </div>
      )}

      {/* Camera-off state (original feed). */}
      {!processed && !isCameraOn && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-surface-900/80">
          <Camera className="h-10 w-10 text-gray-600" />
          <p className="text-sm text-gray-500">Camera is off</p>
        </div>
      )}

      {/* Idle state (processed feed, not live). */}
      {processed && !isLive && !statusOverlay && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
          <p className="text-sm font-medium text-gray-400">
            Processed output appears here
          </p>
          <p className="text-xs text-gray-600">
            Start a session to see the GPU output
          </p>
        </div>
      )}

      {/* Reconnect / stall overlay — never shows a frozen frame as live. */}
      {statusOverlay && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-surface-900/85 backdrop-blur-sm">
          <Loader2 className="h-8 w-8 animate-spin text-brand-400" />
          <div className="text-center">{statusOverlay}</div>
        </div>
      )}
    </div>
  );
}
