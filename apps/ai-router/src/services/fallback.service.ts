import { BaseProvider } from '../providers/base.provider';
import type { ProviderResult, RouteRequest } from '../types';

/**
 * FallbackService
 * ----------------------------------------------------------------------------
 * Owns the retry + provider-fallback loop. Given an ordered provider chain it:
 *
 *   1. tries the best provider,
 *   2. retries it on *transient* failures (timeout / 429 / 5xx / reset) with
 *      exponential backoff,
 *   3. falls through to the next provider on hard failure or exhausted retries,
 *   4. stops at the global attempt cap.
 *
 * Every attempt outcome is reported via `onOutcome` so the HealthMonitor /
 * scoring system stays accurate.
 */

const TRANSIENT_ERROR = /timeout|etimedout|econnreset|econnrefused|socket hang up|\b429\b|rate.?limit|\b5\d\d\b|overloaded|temporarily|unavailable/i;

export interface FallbackOptions {
  /** Hard cap on total attempts across the whole chain. */
  maxAttempts?: number;
  /** Extra retries on the *same* provider for transient errors. */
  retriesPerProvider?: number;
  /** Called after every attempt — wire this to HealthMonitor.recordOutcome. */
  onOutcome?: (providerId: BaseProvider['id'], success: boolean) => void;
}

export interface FallbackOutcome {
  result: ProviderResult;
  provider: BaseProvider['id'];
  attempts: number;
  fallbackUsed: boolean;
  lastError: string;
}

export class FallbackService {
  async run(
    chain: BaseProvider[],
    request: RouteRequest,
    options: FallbackOptions = {},
  ): Promise<FallbackOutcome> {
    const maxAttempts = options.maxAttempts ?? 4;
    const retriesPerProvider = options.retriesPerProvider ?? 1;

    let attempts = 0;
    let lastError = 'No providers available';
    let lastResult: ProviderResult | null = null;

    for (let p = 0; p < chain.length && attempts < maxAttempts; p++) {
      const provider = chain[p];

      for (
        let retry = 0;
        retry <= retriesPerProvider && attempts < maxAttempts;
        retry++
      ) {
        attempts++;

        const result = await provider.execute(request);
        options.onOutcome?.(provider.id, result.success);

        if (result.success) {
          return {
            result,
            provider: provider.id,
            attempts,
            fallbackUsed: p > 0,
            lastError: '',
          };
        }

        lastResult = result;
        lastError = result.error ?? 'Unknown provider error';
        const transient = TRANSIENT_ERROR.test(lastError);

        console.log(
          'lastError', lastError,
          'result', JSON.stringify(result),
          'transient', transient,
        );
        console.warn(
          `[FallbackService] ${provider.id} failed ` +
          `(attempt ${attempts}, retry ${retry}/${retriesPerProvider}, ` +
          `${transient ? 'transient' : 'hard'}): ${lastError}`,
        );

        // Hard error → don't waste retries, move to the next provider.
        if (!transient) break;

        // Transient and we'll retry the same provider → small backoff.
        if (retry < retriesPerProvider && attempts < maxAttempts) {
          await sleep(250 * 2 ** retry);
        }
      }
    }

    return {
      result:
        lastResult ?? {
          success: false,
          provider: chain[0]?.id ?? 'GPU',
          latencyMs: 0,
          error: lastError,
        },
      provider: chain[0]?.id ?? 'GPU',
      attempts,
      fallbackUsed: attempts > 1,
      lastError,
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

