'use client';

import { cn } from '@/lib/cn';
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
  return (
    <div>
      <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-gray-500">
        Prompt {required && <span className="text-red-400">*</span>}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        placeholder={placeholder ?? 'Describe the scene, story or action…'}
        className="w-full resize-none rounded-xl border border-white/10 bg-surface-700/50 px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:border-brand-500/40 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
      />
      <p className="mt-2 text-[11px] text-gray-500">
        Tip: be specific — describe the subject, action, setting, style, and
        lighting for the best results.
      </p>
    </div>
  );
}
