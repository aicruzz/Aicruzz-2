import { BaseProvider } from '../providers/base.provider';
import type { ProviderHealth, ProviderStatus, ProviderId } from '../types';

const HEALTH_CHECK_INTERVAL_MS = 30_000; // 30 seconds
const DEGRADED_LATENCY_MS = 5_000;       // 5 s response = degraded
const ERROR_RATE_THRESHOLD = 0.3;        // 30% errors = degraded

export class HealthMonitor {
  private health = new Map<ProviderId, ProviderHealth>();
  private errorCounts = new Map<ProviderId, { errors: number; total: number }>();
  private timer: NodeJS.Timeout | null = null;

  constructor(private providers: BaseProvider[]) {}

  async start(): Promise<void> {
    await this.runChecks();
    this.timer = setInterval(() => void this.runChecks(), HEALTH_CHECK_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  getHealth(id: ProviderId): ProviderHealth {
    return this.health.get(id) ?? {
      id,
      status: 'OFFLINE',
      latencyMs: 9999,
      lastCheckedAt: new Date(),
      errorRate: 1,
    };
  }

  getAllHealth(): ProviderHealth[] {
    return this.providers.map((p) => this.getHealth(p.id));
  }

  isAvailable(id: ProviderId): boolean {
    const h = this.getHealth(id);
    return h.status !== 'OFFLINE';
  }

  // Called by router on every request to track error rates
  recordOutcome(id: ProviderId, success: boolean): void {
    const current = this.errorCounts.get(id) ?? { errors: 0, total: 0 };
    this.errorCounts.set(id, {
      errors: current.errors + (success ? 0 : 1),
      total: current.total + 1,
    });
  }

  private async runChecks(): Promise<void> {
    await Promise.allSettled(
      this.providers.map((provider) => this.checkProvider(provider)),
    );
  }

  private async checkProvider(provider: BaseProvider): Promise<void> {
    const start = Date.now();
    let available = false;

    try {
      available = await Promise.race([
        provider.ping(),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 8000)),
      ]);
    } catch {
      available = false;
    }

    const latencyMs = Date.now() - start;
    const counts = this.errorCounts.get(provider.id) ?? { errors: 0, total: 1 };
    const errorRate = counts.total > 0 ? counts.errors / counts.total : 0;

    let status: ProviderStatus = 'OFFLINE';
    if (available) {
      status = latencyMs > DEGRADED_LATENCY_MS || errorRate > ERROR_RATE_THRESHOLD
        ? 'DEGRADED'
        : 'ONLINE';
    }

    this.health.set(provider.id, {
      id: provider.id,
      status,
      latencyMs,
      lastCheckedAt: new Date(),
      errorRate,
    });
  }
}
