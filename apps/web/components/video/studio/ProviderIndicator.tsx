'use client';

import { Sparkles, ShieldCheck } from 'lucide-react';

/**
 * Provider-agnostic status panel. Providers are an internal implementation
 * detail owned entirely by the Video Agent — they are NEVER named in the UI.
 * This simply reassures the user that routing, retries and fallback happen
 * automatically for their selected quality. (Props kept for compatibility;
 * `actualProvider` is intentionally not displayed.)
 */
export function ProviderIndicator({
  quality,
}: {
  quality: string;
  actualProvider?: string | null;
}) {
  const label =
    quality === 'ULTRA'
      ? 'Maximum cinematic quality'
      : quality === 'HIGH'
        ? 'Professional quality'
        : 'High quality';

  return (
    <div className="rounded-xl border border-white/10 bg-surface-800/50 p-3">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
        Smart rendering
      </p>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="inline-flex items-center gap-1.5 text-gray-200">
          <Sparkles className="h-4 w-4 text-brand-400" />
          {label}
        </span>
        <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-gray-500">
          <ShieldCheck className="h-3.5 w-3.5 text-green-400" /> Auto-optimized
        </span>
      </div>
      <p className="mt-1.5 text-[11px] text-gray-500">
        AiCruzz automatically selects the best engine, optimizes your prompt, and
        retries or switches behind the scenes to deliver your video reliably.
      </p>
    </div>
  );
}
