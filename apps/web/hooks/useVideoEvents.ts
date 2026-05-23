'use client';

import { useEffect, useRef, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export type VideoEventStatus = 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export type VideoEventStage =
  | 'queued'
  | 'generating'
  | 'post-processing'
  | 'encoding'
  | 'completed';

export interface VideoEvent {
  jobId: string;
  userId: string;
  status: VideoEventStatus;
  stage?: VideoEventStage;
  progress?: number;
  message?: string;
  outputUrl?: string | null;
  thumbnailUrl?: string | null;
  provider?: string | null;
  error?: string | null;
  ts: number;
}

export type ConnectionState = 'idle' | 'connecting' | 'open' | 'closed';

interface Options {
  enabled?: boolean;
  onEvent?: (event: VideoEvent) => void;
}

/**
 * Subscribe to the per-user video event feed via SSE.
 *
 * Uses cookie auth (withCredentials) so EventSource picks up the session
 * cookie automatically. Reconnects on transient failures with backoff.
 */
export function useVideoEvents({ enabled = true, onEvent }: Options = {}) {
  const [state, setState] = useState<ConnectionState>('idle');
  const [lastEvent, setLastEvent] = useState<VideoEvent | null>(null);
  const callbackRef = useRef(onEvent);
  callbackRef.current = onEvent;

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    let es: EventSource | null = null;
    let backoff = 1_000;
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (cancelled) return;
      setState('connecting');
      // EventSource forwards cookies when withCredentials is set and the
      // server allows credentialed requests.
      es = new EventSource(`${API_BASE}/api/video/events`, { withCredentials: true });

      es.addEventListener('open', () => {
        backoff = 1_000;
        setState('open');
      });

      const handle = (evt: MessageEvent) => {
        try {
          const data = JSON.parse(evt.data) as VideoEvent;
          setLastEvent(data);
          callbackRef.current?.(data);
        } catch {
          /* ignore malformed frames */
        }
      };

      // Server emits typed events: video.queued / video.processing / video.completed / etc.
      ['video.queued', 'video.processing', 'video.completed', 'video.failed', 'video.cancelled']
        .forEach((name) => es!.addEventListener(name, handle as EventListener));

      es.addEventListener('error', () => {
        setState('closed');
        es?.close();
        if (cancelled) return;
        retryTimer = setTimeout(connect, backoff);
        backoff = Math.min(backoff * 2, 15_000);
      });
    };

    connect();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      es?.close();
      setState('closed');
    };
  }, [enabled]);

  return { state, lastEvent };
}
