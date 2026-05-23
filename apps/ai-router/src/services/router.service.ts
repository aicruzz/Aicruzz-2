import { BaseProvider } from '../providers/base.provider';
import { HealthMonitor } from '../health/health.monitor';
import { TaskClassifier } from './task-classifier';
import { ProviderSelector } from './provider-selector';
import { FallbackService } from './fallback.service';
import { PipelineService } from './pipeline.service';
import type {
  RouteRequest,
  RouteResponse,
  ProviderId,
  TaskClassification,
} from '../types';
import { publicRouteFailureMessage } from '../utils/client-safe-message';

const MAX_ATTEMPTS = 4;
const RETRIES_PER_PROVIDER = 1;

/**
 * RouterService
 * ----------------------------------------------------------------------------
 * The single place that turns a RouteRequest into a RouteResponse:
 *
 *   classify task  →  select & score providers  →  execute with retry/fallback
 *
 * Stateless and transport-agnostic — the HTTP layer (router.ts / index.ts) and
 * the queue worker both call `execute()`. No controller ever picks a provider.
 */
export class RouterService {
  private classifier = new TaskClassifier();
  private selector: ProviderSelector;
  private fallback = new FallbackService();
  private pipeline: PipelineService;

  constructor(
    private providers: Map<ProviderId, BaseProvider>,
    private health: HealthMonitor,
  ) {
    this.selector = new ProviderSelector(providers, health);
    this.pipeline = new PipelineService(providers, this.fallback);
  }

  async execute(request: RouteRequest, totalStart: number): Promise<RouteResponse> {
    // 1. Classify (CHAT only — media modules route by module/quality table).
    const classification: TaskClassification | undefined =
      request.module === 'CHAT' ? this.classifier.classify(request) : undefined;

    // 2. Select + score the provider chain.
    const { chain, reason } = this.selector.select(request, classification);

    if (chain.length === 0) {
      console.error('[RouterService] No enabled providers for module', request.module);
      return this.errorResponse(request, 'No providers available', 0, reason, classification);
    }

    // 3. Execute. VIDEO/CARTOON go through the multi-step PipelineService
    //    (optional keyframe → animate); everything else uses the plain
    //    retry/fallback loop. Both return the same FallbackOutcome shape.
    const fallbackOpts = {
      maxAttempts: MAX_ATTEMPTS,
      retriesPerProvider: RETRIES_PER_PROVIDER,
      onOutcome: (id: ProviderId, ok: boolean) => this.health.recordOutcome(id, ok),
    };
    const animateChain = chain.slice(0, MAX_ATTEMPTS);
    const outcome =
      request.module === 'VIDEO' || request.module === 'CARTOON'
        ? await this.pipeline.run(animateChain, request, fallbackOpts)
        : await this.fallback.run(animateChain, request, fallbackOpts);

    if (outcome.result.success) {
      return {
        requestId: request.requestId,
        success: true,
        provider: outcome.provider,
        result: outcome.result,
        attemptsCount: outcome.attempts,
        totalLatencyMs: Date.now() - totalStart,
        strategy: request.strategy,
        fallbackUsed: outcome.fallbackUsed,
        taskType: classification?.task,
        selectionReason: reason,
      };
    }

    return this.errorResponse(
      request,
      outcome.lastError,
      outcome.attempts,
      reason,
      classification,
    );
  }

  private errorResponse(
    request: RouteRequest,
    internalDetail: string,
    attempts: number,
    reason: string,
    classification?: TaskClassification,
  ): RouteResponse {
    console.error('[RouterService] Route failure', {
      requestId: request.requestId,
      module: request.module,
      strategy: request.strategy,
      attempts,
      reason,
      internalDetail,
    });

    const clientMessage = publicRouteFailureMessage(request.module);
    return {
      requestId: request.requestId,
      success: false,
      provider: 'GPU',
      result: { success: false, provider: 'GPU', latencyMs: 0, error: clientMessage },
      attemptsCount: attempts,
      totalLatencyMs: 0,
      strategy: request.strategy,
      fallbackUsed: attempts > 1,
      taskType: classification?.task,
      selectionReason: reason,
    };
  }
}
