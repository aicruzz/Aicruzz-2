'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Captions, CaptionsOff, Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Talking-video player. Plays the final rendered MP4 (lip-synced, audio
 * embedded). When narration is delivered as a SEPARATE track (no FAL
 * subtitle/lip-sync provider configured), it also plays `audioSrc` in
 * sync and shows the VTT as a sidecar track + optional caption overlay.
 * Backend-agnostic — all inputs are plain URLs/strings.
 */
export function TalkingVideoPlayer({
  src,
  poster,
  audioSrc,
  subtitlesVtt,
  className,
}: {
  src: string;
  poster?: string;
  /** separate narration track when not muxed into the video */
  audioSrc?: string;
  subtitlesVtt?: string;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [loading, setLoading] = useState(true);
  const [showCaptions, setShowCaptions] = useState(true);

  // Build an object-URL VTT track from the raw string (no server needed).
  const trackUrl = useMemo(() => {
    if (!subtitlesVtt || typeof window === 'undefined') return undefined;
    return URL.createObjectURL(new Blob([subtitlesVtt], { type: 'text/vtt' }));
  }, [subtitlesVtt]);

  useEffect(() => () => {
    if (trackUrl) URL.revokeObjectURL(trackUrl);
  }, [trackUrl]);

  // Keep a separate narration track in sync with the video timeline.
  useEffect(() => {
    const v = videoRef.current;
    const a = audioRef.current;
    if (!v || !a) return;
    const sync = () => {
      if (Math.abs(a.currentTime - v.currentTime) > 0.25) a.currentTime = v.currentTime;
    };
    const onPlay = () => { sync(); void a.play().catch(() => {}); };
    const onPause = () => a.pause();
    const onSeek = () => { a.currentTime = v.currentTime; };
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    v.addEventListener('seeked', onSeek);
    v.addEventListener('timeupdate', sync);
    return () => {
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
      v.removeEventListener('seeked', onSeek);
      v.removeEventListener('timeupdate', sync);
    };
  }, [audioSrc]);

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border border-white/10 bg-black',
        className,
      )}
    >
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-surface-900/60">
          <Loader2 className="h-6 w-6 animate-spin text-brand-400" />
        </div>
      )}
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        controls
        playsInline
        preload="metadata"
        onLoadedData={() => setLoading(false)}
        className="aspect-video w-full bg-black"
      >
        {trackUrl && showCaptions && (
          <track
            kind="subtitles"
            src={trackUrl}
            srcLang="en"
            label="English"
            default
          />
        )}
      </video>

      {audioSrc && <audio ref={audioRef} src={audioSrc} preload="auto" />}

      {trackUrl && (
        <button
          type="button"
          aria-label={showCaptions ? 'Hide captions' : 'Show captions'}
          onClick={() => setShowCaptions((s) => !s)}
          className="absolute right-3 top-3 z-20 rounded-lg bg-black/50 p-2 text-white backdrop-blur hover:bg-black/70"
        >
          {showCaptions ? (
            <Captions className="h-4 w-4" />
          ) : (
            <CaptionsOff className="h-4 w-4" />
          )}
        </button>
      )}
    </div>
  );
}
