'use client';

import { useMemo } from 'react';
import { Captions } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface VttCue {
  index: number;
  start: string;
  end: string;
  text: string;
}

/** Parse a WEBVTT string into cues (tolerant; dependency-free). */
export function parseVtt(vtt?: string): VttCue[] {
  if (!vtt) return [];
  const blocks = vtt.replace(/^WEBVTT.*\n/, '').trim().split(/\n\s*\n/);
  const cues: VttCue[] = [];
  for (const block of blocks) {
    const lines = block.split('\n').filter(Boolean);
    if (lines.length < 2) continue;
    const timing = lines.find((l) => l.includes('-->'));
    if (!timing) continue;
    const [start, end] = timing.split('-->').map((s) => s.trim());
    const text = lines.slice(lines.indexOf(timing) + 1).join(' ');
    cues.push({ index: cues.length + 1, start, end, text });
  }
  return cues;
}

/** Read-only subtitle track preview (used by talking-cartoon UI). */
export function SubtitlePreview({
  vtt,
  className,
  highlightAt,
}: {
  vtt?: string;
  className?: string;
  /** optional active cue index for live highlight */
  highlightAt?: number;
}) {
  const cues = useMemo(() => parseVtt(vtt), [vtt]);

  if (cues.length === 0) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 rounded-xl border border-dashed border-white/10 px-4 py-6 text-xs text-gray-500',
          className,
        )}
      >
        <Captions className="h-4 w-4" />
        No subtitles generated yet
      </div>
    );
  }

  return (
    <div
      className={cn(
        'max-h-56 space-y-1.5 overflow-y-auto rounded-xl border border-white/10 bg-surface-800/50 p-3',
        className,
      )}
    >
      {cues.map((c) => (
        <div
          key={c.index}
          className={cn(
            'rounded-lg px-3 py-2 text-sm transition-colors',
            highlightAt === c.index
              ? 'bg-brand-500/15 text-brand-200'
              : 'text-gray-300',
          )}
        >
          <span className="mr-2 font-mono text-[10px] text-gray-500">
            {c.start} → {c.end}
          </span>
          {c.text}
        </div>
      ))}
    </div>
  );
}
