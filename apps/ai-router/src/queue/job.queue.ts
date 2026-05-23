import { Queue, Worker, Job } from "bullmq";
import IORedis from "ioredis";
import axios from "axios";
import type { QueueJob, RouteResponse } from "../types";
import { publicRouteFailureMessage } from "../utils/client-safe-message";
import { redactJobStatusHttpPayload } from "../utils/public-response";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const QUEUE_NAME = "ai-router-jobs";
const AI_ROUTER_SECRET = process.env.AI_ROUTER_SECRET;
if (!AI_ROUTER_SECRET) throw new Error("AI_ROUTER_SECRET is not set");

let queue: Queue | null = null;
let worker: Worker | null = null;

type RouterFn = (job: QueueJob) => Promise<RouteResponse>;
let routerFn: RouterFn;
const processedWebhooks = new Set<string>();

export function initQueue(router: RouterFn): void {
  routerFn = router;

  const connection = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null,
  });

  queue = new Queue(QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: { count: 100 },
      removeOnFail:     { count: 50  },
    },
  });

  worker = new Worker(
    QUEUE_NAME,
    async (job: Job<QueueJob>) => {
      const result = await routerFn(job.data);
      return result;
    },
    {
      connection,
      concurrency: parseInt(process.env.QUEUE_CONCURRENCY ?? "4"),
    },
  );

  worker.on("completed", async (job) => {
    console.log(`[Queue] Job ${job.id} completed`);
    const result = job.returnvalue as RouteResponse;

    if (!job.data.webhookUrl) return;

    if (processedWebhooks.has(result.requestId)) {
      console.log(`[Queue] Duplicate webhook skipped: ${result.requestId}`);
      return;
    }
    processedWebhooks.add(result.requestId);
    setTimeout(() => processedWebhooks.delete(result.requestId), 10 * 60 * 1000);

    // Normalise the result into the shape your backend expects:
    // { success, provider, result: { raw: { status, output_url, thumbnail_url } } }
    const webhookPayload = buildWebhookPayload(result, job.data);

    await fireWebhook(job.data.webhookUrl, webhookPayload).catch((err) => {
      console.error(`[Queue] Webhook failed for ${job.id}:`, err.message);
    });
  });

  worker.on("failed", async (job, err) => {
    console.error(`[Queue] Job ${job?.id} failed:`, err.message);

    if (!job?.data.webhookUrl) return;

    if (processedWebhooks.has(job.data.requestId)) {
      console.log(`[Queue] Duplicate failure webhook skipped: ${job.data.requestId}`);
      return;
    }
    processedWebhooks.add(job.data.requestId);
    setTimeout(() => processedWebhooks.delete(job.data.requestId), 10 * 60 * 1000);

    const failPayload = {
      requestId: job.data.requestId,
      success:   false,
      provider:  "GPU",
      result: {
        success:   false,
        provider:  "GPU",
        latencyMs: 0,
        raw: {
          status: "FAILED",
          error:  publicRouteFailureMessage(job.data.request.module),
        },
      },
      attemptsCount:  job.attemptsMade,
      totalLatencyMs: 0,
      strategy:       job.data.request.strategy,
      fallbackUsed:   false,
    };

    console.error("[Queue] Job failure detail:", job.failedReason ?? err.message);

    await fireWebhook(job.data.webhookUrl, failPayload).catch(() => {});
  });
}

/**
 * Normalises a RouteResponse into the webhook payload shape the backend expects.
 * Backend reads: body.success, body.result.raw.status, body.result.raw.output_url etc.
 */
function buildWebhookPayload(result: RouteResponse, jobData: QueueJob): object {
  const raw = result.result.raw as Record<string, unknown> | undefined;

  if (!result.success) {
    return {
      requestId: result.requestId,
      success: false,
      provider: result.provider,
      result: {
        success: false,
        provider: result.result.provider,
        latencyMs: result.result.latencyMs,
        raw: {
          status: "FAILED",
          error: publicRouteFailureMessage(jobData.request.module),
        },
      },
      attemptsCount: result.attemptsCount,
      totalLatencyMs: result.totalLatencyMs,
      strategy: result.strategy,
      fallbackUsed: result.fallbackUsed,
    };
  }

  return {
    requestId: result.requestId,
    success:   result.success,
    provider:  result.provider,
    result: {
      success:   result.result.success,
      provider:  result.result.provider,
      latencyMs: result.result.latencyMs,
        raw: {
          status:        'COMPLETED',
          output_url:    raw?.output_url    ?? result.result.outputUrl    ?? null,
          thumbnail_url: raw?.thumbnail_url ?? result.result.thumbnailUrl ?? null,
          // Actual generated clip length (clamped to provider-supported
          // values) so the backend can correct stored duration + billing.
          duration_seconds:
            (raw?.durationSeconds as number | undefined) ??
            result.result.durationSeconds ??
            null,
          // Additive pipeline metadata (non-breaking; backend ignores if unused).
          keyframe_url:  raw?.keyframe_url  ?? null,
          pipeline_mode: raw?.pipeline_mode ?? null,
          steps:         raw?.steps         ?? null,
          error:         null,
        },
    },
    attemptsCount:  result.attemptsCount,
    totalLatencyMs: result.totalLatencyMs,
    strategy:       result.strategy,
    fallbackUsed:   result.fallbackUsed,
  };
}

export async function enqueueJob(payload: QueueJob): Promise<string> {
  if (!queue) throw new Error("Queue not initialised");

  const existing = await queue.getJob(payload.requestId);
  if (existing) {
    const state = await existing.getState();
    if (["waiting", "active", "delayed", "waiting-children"].includes(state)) {
      console.log(`[Queue] Skipping duplicate enqueue for requestId: ${payload.requestId}`);
      return existing.id ?? payload.requestId;
    }
  }

  const job = await queue.add(payload.jobId, payload, {
    priority: payload.request.priority ?? 5,
    jobId:    payload.requestId,
  });

  return job.id ?? payload.jobId;
}

export async function getJobStatus(jobId: string): Promise<{
  id: string;
  status: string;
  result?: RouteResponse;
  failedReason?: string;
}> {
  if (!queue) throw new Error("Queue not initialised");

  const job = await queue.getJob(jobId);
  if (!job) return { id: jobId, status: "NOT_FOUND" };

  const state  = await job.getState();
  const result = job.returnvalue as RouteResponse | undefined;

  return redactJobStatusHttpPayload({
    id: jobId,
    status: state.toUpperCase(),
    result,
    failedReason: job.failedReason,
  });
}

async function fireWebhook(url: string, payload: object): Promise<void> {
  const response = await axios.post(url, payload, {
    timeout: 10_000,
    headers: {
      "Content-Type":    "application/json",
      "x-router-secret": AI_ROUTER_SECRET,
    },
    validateStatus: (status) => status < 500,
  });

  if (response.status >= 400) {
    console.warn(`[Queue] Webhook returned ${response.status} for ${url} — ignoring`);
  }
}

export async function closeQueue(): Promise<void> {
  await worker?.close();
  await queue?.close();
}