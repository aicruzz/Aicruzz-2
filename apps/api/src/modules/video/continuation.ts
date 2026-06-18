// ─── CONTINUATION (frame-based) ───────────────────────────────
//
// Current providers (Runway/Pika) do NOT support true video-to-video. To make
// "Continue editing" feel natural, we take the previous generated video's best
// representative frame and use it as an image-to-video starting point for the
// new instruction. The architecture is capability-routed: when a future
// provider supports native video-to-video, the agent will use that instead —
// without any Video Studio change.

import { and, eq } from "drizzle-orm";
import { db } from "../../config/database";
import { videoJobs } from "../../db/schema";

export interface ContinuationSource {
  id: string;
  outputUrl: string | null;
  thumbnailUrl: string | null;
  inputImageUrl: string | null;
  prompt: string | null;
  revisedPrompt: string | null;
  // Agent metadata — carries the plan used for creative-continuity memory.
  agentMeta: unknown;
}

/** Latest COMPLETED video for a user — the conversation's current project. */
export async function resolveLatestVideo(
  userId: string,
): Promise<ContinuationSource | null> {
  const job = await db.query.videoJobs.findFirst({
    where: and(eq(videoJobs.userId, userId), eq(videoJobs.status, "COMPLETED")),
    orderBy: (t, { desc: d }) => d(t.completedAt),
    columns: {
      id: true,
      outputUrl: true,
      thumbnailUrl: true,
      inputImageUrl: true,
      prompt: true,
      revisedPrompt: true,
      agentMeta: true,
    },
  });
  return (job as ContinuationSource) ?? null;
}

/** Fetch a specific prior job to continue from (must belong to the user). */
export async function getJobForContinuation(
  userId: string,
  jobId: string,
): Promise<ContinuationSource | null> {
  const job = await db.query.videoJobs.findFirst({
    where: and(eq(videoJobs.id, jobId), eq(videoJobs.userId, userId)),
    columns: {
      id: true,
      outputUrl: true,
      thumbnailUrl: true,
      inputImageUrl: true,
      prompt: true,
      revisedPrompt: true,
      agentMeta: true,
    },
  });
  return (job as ContinuationSource) ?? null;
}

/**
 * Choose the best representative frame to continue from. Providers return a
 * thumbnail (a representative frame); we use it, then fall back to the original
 * input image, then null (→ prompt-only continuation). This utility is the
 * single place that selects a continuation frame, so future providers with
 * richer frame extraction (best-exposed/last/highest-confidence frame) plug in
 * here without touching the rest of the flow.
 */
export function selectContinuationFrame(
  source: Pick<ContinuationSource, "thumbnailUrl" | "inputImageUrl">,
): string | null {
  return source.thumbnailUrl ?? source.inputImageUrl ?? null;
}
