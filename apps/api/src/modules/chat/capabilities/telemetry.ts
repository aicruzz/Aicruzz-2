// ─── CAPABILITY HEALTH MONITORING ─────────────────────────────
// Lightweight, in-memory telemetry per capability: runs, failures, retries,
// latency, last provider/error. Emitted as structured logs (for aggregation)
// and queryable via getCapabilityHealth() for an internal debug surface.

import { logger } from "../../../utils/logger";
import type { CapabilityId } from "./types";

export interface CapabilityRun {
  capabilityId: CapabilityId;
  provider?: string;
  latencyMs: number;
  retries: number;
  success: boolean;
  fallbackReason?: string;
  tokensUsed?: number;
  error?: string;
}

interface CapabilityHealth {
  runs: number;
  failures: number;
  retries: number;
  totalLatencyMs: number;
  lastProvider?: string;
  lastError?: string;
  lastRunAt?: string;
}

const health = new Map<CapabilityId, CapabilityHealth>();

export function recordCapabilityRun(run: CapabilityRun): void {
  const h =
    health.get(run.capabilityId) ??
    { runs: 0, failures: 0, retries: 0, totalLatencyMs: 0 };
  h.runs += 1;
  h.retries += run.retries;
  h.totalLatencyMs += run.latencyMs;
  if (!run.success) {
    h.failures += 1;
    h.lastError = run.error ?? run.fallbackReason;
  }
  if (run.provider) h.lastProvider = run.provider;
  h.lastRunAt = new Date().toISOString();
  health.set(run.capabilityId, h);

  logger.info("capability.run", {
    capability: run.capabilityId,
    provider: run.provider,
    latencyMs: run.latencyMs,
    retries: run.retries,
    success: run.success,
    fallbackReason: run.fallbackReason,
    tokensUsed: run.tokensUsed,
  });
}

/** Snapshot of per-capability health (with average latency) for debugging. */
export function getCapabilityHealth(): Record<
  string,
  CapabilityHealth & { avgLatencyMs: number }
> {
  const out: Record<string, CapabilityHealth & { avgLatencyMs: number }> = {};
  for (const [id, h] of health) {
    out[id] = {
      ...h,
      avgLatencyMs: h.runs ? Math.round(h.totalLatencyMs / h.runs) : 0,
    };
  }
  return out;
}
