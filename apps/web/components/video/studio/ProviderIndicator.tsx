'use client';

import { Zap, Clapperboard, ArrowRight, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui';

/**
 * Pipeline-awareness UI. Shows the PLANNED routing from the chosen
 * quality tier (mirrors the ai-router quality-router: FAST/STANDARD→Pika,
 * HIGH/ULTRA→Runway with automatic Pika fallback) and the ACTUAL provider
 * once the job reports one. No backend calls — purely derived.
 */
export function ProviderIndicator({
  quality,
  actualProvider,
}: {
  quality: string;
  actualProvider?: string | null;
}) {
  const runwayTier = quality === 'HIGH' || quality === 'ULTRA';
  const primary = runwayTier ? 'Runway' : 'Pika';

  return (
    <div className="rounded-xl border border-white/10 bg-surface-800/50 p-3">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
        Provider routing
      </p>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="inline-flex items-center gap-1.5 text-gray-200">
          {runwayTier ? (
            <Clapperboard className="h-4 w-4 text-accent-400" />
          ) : (
            <Zap className="h-4 w-4 text-brand-400" />
          )}
          {primary}
        </span>
        {runwayTier && (
          <>
            <ArrowRight className="h-3.5 w-3.5 text-gray-600" />
            <span className="inline-flex items-center gap-1.5 text-gray-500">
              <Zap className="h-3.5 w-3.5" /> Pika fallback
            </span>
          </>
        )}
        {actualProvider && (
          <Badge tone="green" className="ml-auto">
            <CheckCircle2 className="h-3 w-3" /> {actualProvider}
          </Badge>
        )}
      </div>
      <p className="mt-1.5 text-[11px] text-gray-500">
        {runwayTier
          ? 'Cinematic Runway render; auto-falls back to Pika if Runway fails.'
          : 'Fast Pika render — optimized for speed & cost.'}
      </p>
    </div>
  );
}
