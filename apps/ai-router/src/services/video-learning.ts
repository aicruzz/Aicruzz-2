// ─── VIDEO PROVIDER LEARNING ──────────────────────────────────
//
// Self-improving routing signal for VIDEO. Beyond live health (status/latency),
// this accumulates real outcomes per provider — success rate, render latency,
// retry count — and per-(category,provider) affinity, so provider ranking keeps
// improving automatically with NO hardcoded priorities. In-memory + additive;
// the provider-selector folds the learned score into its health-aware reorder.

import type { ProviderId } from '../types';

interface ProviderStat {
  runs: number;
  successes: number;
  totalLatencyMs: number;
  totalRetries: number;
}

interface CategoryStat {
  runs: number;
  successes: number;
}

const providerStats = new Map<ProviderId, ProviderStat>();
// key: `${category}|${providerId}`
const categoryStats = new Map<string, CategoryStat>();

export interface VideoOutcome {
  provider: ProviderId;
  success: boolean;
  latencyMs?: number;
  retries?: number;
  category?: string;
}

/** Record a finished VIDEO attempt so ranking can adapt over time. */
export function recordVideoOutcome(o: VideoOutcome): void {
  const s = providerStats.get(o.provider) ?? {
    runs: 0,
    successes: 0,
    totalLatencyMs: 0,
    totalRetries: 0,
  };
  s.runs += 1;
  if (o.success) s.successes += 1;
  s.totalLatencyMs += Math.max(0, o.latencyMs ?? 0);
  s.totalRetries += Math.max(0, o.retries ?? 0);
  providerStats.set(o.provider, s);

  if (o.category) {
    const key = `${o.category}|${o.provider}`;
    const c = categoryStats.get(key) ?? { runs: 0, successes: 0 };
    c.runs += 1;
    if (o.success) c.successes += 1;
    categoryStats.set(key, c);
  }
}

/**
 * Learned score in [0,1]: weighted success rate, lightly penalised by average
 * retries and slow renders. Unknown providers return a neutral 0.5 so a new
 * provider is given a fair first chance (then learns from real outcomes).
 */
export function videoProviderScore(id: ProviderId): number {
  const s = providerStats.get(id);
  if (!s || s.runs === 0) return 0.5;
  const successRate = s.successes / s.runs;
  const avgRetries = s.totalRetries / s.runs;
  const avgLatency = s.totalLatencyMs / s.runs;
  const retryPenalty = Math.min(avgRetries * 0.1, 0.3);
  const latencyPenalty = Math.min(avgLatency / 600_000, 0.2); // 10min → 0.2
  return Math.max(0, Math.min(1, successRate - retryPenalty - latencyPenalty));
}

/**
 * Per-category affinity in [0,1] — how reliably a provider completes a given
 * creative category (e.g. ANIME vs PRODUCT). Neutral 0.5 until enough data.
 * (Adaptive prompt-engineering signal; surfaced for future category-aware
 * routing without changing today's behavior.)
 */
export function videoCategoryAffinity(
  category: string | undefined,
  id: ProviderId,
): number {
  if (!category) return 0.5;
  const c = categoryStats.get(`${category}|${id}`);
  if (!c || c.runs < 3) return 0.5; // need a few samples before trusting it
  return c.successes / c.runs;
}

/** Snapshot for internal debugging / telemetry. */
export function getVideoLearningSnapshot(): Record<
  string,
  ProviderStat & { successRate: number; avgLatencyMs: number; score: number }
> {
  const out: Record<
    string,
    ProviderStat & { successRate: number; avgLatencyMs: number; score: number }
  > = {};
  for (const [id, s] of providerStats) {
    out[id] = {
      ...s,
      successRate: s.runs ? s.successes / s.runs : 0,
      avgLatencyMs: s.runs ? Math.round(s.totalLatencyMs / s.runs) : 0,
      score: videoProviderScore(id),
    };
  }
  return out;
}
