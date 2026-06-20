import { v4 as uuidv4 } from 'uuid';
import { BaseProvider } from './providers/base.provider';
import { HealthMonitor } from './health/health.monitor';
import { RouterService } from './services/router.service';
import { enqueueJob, getJobStatus } from './queue/job.queue';
import type {
  RouteRequest,
  RouteResponse,
  ProviderId,
  QueueJob,
} from './types';
import { publicRouteFailureMessage } from './utils/client-safe-message';

const ASYNC_MODULES = new Set(['VIDEO', 'CARTOON', 'VIDEO_FACE_SWAP']);

/**
 * AiRouter
 * ----------------------------------------------------------------------------
 * Thin transport/queue boundary. All routing intelligence (task
 * classification, provider scoring/selection, retry + fallback) lives in
 * RouterService. This class only decides sync vs queued execution and keeps
 * the public API stable for index.ts and the BullMQ worker.
 */
export class AiRouter {
  private service: RouterService;

  constructor(
    private providers: Map<ProviderId, BaseProvider>,
    private health: HealthMonitor,
  ) {
    this.service = new RouterService(providers, health);
  }

  /**
   * Route a request. Heavy async modules (VIDEO, CARTOON) go to the BullMQ
   * queue; everything else executes synchronously.
   */
  async route(request: RouteRequest): Promise<RouteResponse> {
    const totalStart = Date.now();
    const requestId = request.requestId ?? uuidv4();

    if (ASYNC_MODULES.has(request.module) && !request.stream) {
      return this.routeAsync({ ...request, requestId });
    }

    return this.service.execute({ ...request, requestId }, totalStart);
  }

  /**
   * Execute a queued job — called by the BullMQ worker. Bypasses the async
   * check so VIDEO/CARTOON jobs actually run instead of re-queuing.
   */
  async executeQueuedJob(job: QueueJob): Promise<RouteResponse> {
    const totalStart = Date.now();
    return this.service.execute(
      { ...job.request, requestId: job.requestId },
      totalStart,
    );
  }

  async getJobStatus(jobId: string) {
    return getJobStatus(jobId);
  }

  getHealthStatus() {
    return this.health.getAllHealth();
  }

  /**
   * Enqueue a heavy job and return QUEUED immediately.
   */
  private async routeAsync(request: RouteRequest): Promise<RouteResponse> {
    const jobId = uuidv4();

    const job: QueueJob = {
      jobId,
      requestId: request.requestId ?? jobId,
      userId: request.userId,
      module: request.module,
      request,
      webhookUrl: request.webhookUrl,
      createdAt: new Date(),
    };

    try {
      await enqueueJob(job);
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      console.error('[AiRouter] enqueueJob failed:', detail);
      return {
        requestId: request.requestId ?? jobId,
        success: false,
        provider: 'GPU',
        result: {
          success: false,
          provider: 'GPU',
          latencyMs: 0,
          error: publicRouteFailureMessage(request.module),
        },
        attemptsCount: 0,
        totalLatencyMs: 0,
        strategy: request.strategy,
        fallbackUsed: false,
      };
    }

    return {
      requestId: request.requestId ?? jobId,
      success: true,
      provider: 'GPU',
      result: {
        success: true,
        provider: 'GPU',
        latencyMs: 0,
        raw: { jobId, status: 'QUEUED' },
      },
      attemptsCount: 0,
      totalLatencyMs: 0,
      strategy: request.strategy,
      fallbackUsed: false,
    };
  }
}
