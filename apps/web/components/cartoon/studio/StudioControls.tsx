'use client';

import { useEffect, useRef, useState } from 'react';
import { Sparkles, Wand2, Maximize2, Gauge, Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { chatApi } from '@/lib/api';
import { QUALITY_OPTIONS, ASPECT_OPTIONS } from './types';

/* Reusable pill selector */
export function PillSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; label: string; hint?: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
      </p>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              title={o.hint}
              aria-pressed={active}
              className={cn(
                'rounded-lg border px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60',
                active
                  ? 'border-brand-500/60 bg-brand-500/10 text-brand-300'
                  : 'border-white/10 text-gray-400 hover:border-white/25 hover:text-gray-200',
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function QualitySelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <PillSelect
      label="Quality"
      value={value}
      onChange={onChange}
      options={QUALITY_OPTIONS.map((q) => ({
        value: q.value,
        label: q.label,
        hint: q.hint,
      }))}
    />
  );
}

export function AspectSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <PillSelect
      label="Aspect ratio"
      value={value}
      onChange={onChange}
      options={ASPECT_OPTIONS.map((a) => ({ value: a, label: a }))}
    />
  );
}

export function StyleSelector({
  styles,
  value,
  onChange,
}: {
  styles: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <PillSelect
      label="Style"
      value={value}
      onChange={onChange}
      options={styles.map((s) => ({ value: s, label: s }))}
    />
  );
}

// The video/cartoon models only generate fixed clip lengths (Pika 5s,
// Runway 5s/10s). Expose just the achievable values so users can't request
// a length the provider can't produce.
const SUPPORTED_DURATIONS = [5, 10] as const;

export function DurationField({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
          Duration
        </p>
        <span className="text-sm font-medium text-brand-300">{value}s</span>
      </div>
      <div className="flex gap-2" role="group" aria-label="Duration in seconds">
        {SUPPORTED_DURATIONS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => onChange(d)}
            className={cn(
              "flex-1 rounded-lg border px-3 py-2 text-sm transition-colors",
              value === d
                ? "border-brand-500/60 bg-brand-500/10 text-brand-300"
                : "border-white/10 text-gray-400 hover:border-white/25",
            )}
          >
            {d}s
          </button>
        ))}
      </div>
    </div>
  );
}

/* Prompt assistant: improve / expand / optimize the prompt via the AI router.
   Calls POST /api/chat/enhance-prompt — no credits, no chat history. */
type EnhanceAction = 'improve' | 'expand' | 'optimize';

const ENHANCE_ACTIONS: {
  action: EnhanceAction;
  label: string;
  hint: string;
  icon: typeof Wand2;
}[] = [
  {
    action: 'improve',
    label: 'Improve Prompt',
    hint: 'Fix grammar & clarity, keep your intent',
    icon: Wand2,
  },
  {
    action: 'expand',
    label: 'Expand Prompt',
    hint: 'Add detail & richer scene description',
    icon: Maximize2,
  },
  {
    action: 'optimize',
    label: 'Optimize Prompt',
    hint: 'Rewrite for best generation quality',
    icon: Gauge,
  },
];

export function PromptField({
  value,
  onChange,
  required,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  placeholder?: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [loadingAction, setLoadingAction] = useState<EnhanceAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const busy = loadingAction !== null;
  const canEnhance = value.trim().length > 0;

  // Close the menu on outside click or Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  async function runEnhance(action: EnhanceAction) {
    if (busy || !canEnhance) return;
    setMenuOpen(false);
    setError(null);
    setLoadingAction(action);
    try {
      const res = await chatApi.enhancePrompt(action, value);
      const enhanced = res.data?.data?.enhancedPrompt as string | undefined;
      if (enhanced) {
        onChange(enhanced);
      } else {
        setError('Could not enhance the prompt. Please try again.');
      }
    } catch {
      setError('Could not enhance the prompt. Please try again.');
    } finally {
      setLoadingAction(null);
    }
  }

  return (
    <div>
      <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-gray-500">
        Prompt {required && <span className="text-red-400">*</span>}
      </label>
      <div ref={wrapRef} className="relative">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          placeholder={placeholder ?? 'Describe the scene, story or action…'}
          className="w-full resize-none rounded-xl border border-white/10 bg-surface-700/50 px-4 py-3 pr-12 text-sm text-white placeholder:text-gray-500 focus:border-brand-500/40 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
        />

        {/* Prompt assistant trigger */}
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          disabled={busy || !canEnhance}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          title={canEnhance ? 'Prompt assistant' : 'Write a prompt to enhance it'}
          className={cn(
            'absolute bottom-2.5 right-2.5 inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60',
            canEnhance
              ? 'border-brand-500/40 bg-brand-500/10 text-brand-300 hover:bg-brand-500/20'
              : 'cursor-not-allowed border-white/10 text-gray-600',
          )}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
        </button>

        {/* Popover menu */}
        {menuOpen && !busy && (
          <div
            role="menu"
            className="absolute bottom-12 right-2.5 z-20 w-60 overflow-hidden rounded-xl border border-white/10 bg-surface-700 shadow-xl shadow-black/40"
          >
            {ENHANCE_ACTIONS.map(({ action, label, hint, icon: Icon }) => (
              <button
                key={action}
                type="button"
                role="menuitem"
                onClick={() => runEnhance(action)}
                className="flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-white/5"
              >
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-brand-300" />
                <span>
                  <span className="block text-sm text-white">{label}</span>
                  <span className="block text-[11px] text-gray-500">{hint}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {error ? (
        <p className="mt-2 text-[11px] text-red-400">{error}</p>
      ) : busy ? (
        <p className="mt-2 text-[11px] text-brand-300">Enhancing your prompt…</p>
      ) : (
        <p className="mt-2 text-[11px] text-gray-500">
          Tip: be specific — describe the subject, action, setting, style, and
          lighting for the best results.
        </p>
      )}
    </div>
  );
}
