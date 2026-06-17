// ─── CAPABILITY ENGINE ────────────────────────────────────────
// Dispatches a detected capability to its registered executor, records
// telemetry, and gracefully handles capabilities that aren't available yet
// (future plugins) — without ever crashing or changing the UI contract.

import type { CapabilityContext, CapabilityId } from "./types";
import { getCapability } from "./registry";
import { recordCapabilityRun } from "./telemetry";

function sse(ctx: CapabilityContext, event: string, data: unknown): void {
  ctx.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  const flush = (ctx.res as unknown as { flush?: () => void }).flush;
  if (typeof flush === "function") flush();
}

/**
 * Run a capability by id. Available capabilities execute their handler (with
 * timing telemetry). Unknown / coming-soon capabilities return a graceful SSE
 * response so the client never breaks — the same contract as a normal turn.
 */
export async function runCapability(
  id: CapabilityId,
  ctx: CapabilityContext,
): Promise<void> {
  const cap = getCapability(id);
  const start = Date.now();

  if (!cap || cap.availability !== "available" || !cap.execute) {
    ctx.res.setHeader("Content-Type", "text/event-stream");
    ctx.res.setHeader("Cache-Control", "no-cache");
    ctx.res.setHeader("Connection", "keep-alive");
    ctx.res.setHeader("X-Accel-Buffering", "no");
    if (typeof ctx.res.flushHeaders === "function") ctx.res.flushHeaders();

    sse(ctx, "chat_id", { chatId: ctx.chatId });
    const label = cap?.name ?? "That capability";
    sse(ctx, "chunk", {
      text:
        `**${label}** is coming soon to AiCruzz. Your request was understood, ` +
        `but this capability isn't available yet.`,
    });
    sse(ctx, "done", {
      chatId: ctx.chatId,
      provider: "capability-engine",
      tokensUsed: 0,
      creditsUsed: 0,
      fallbackUsed: false,
      imageUrl: null,
      videoUrl: null,
    });
    ctx.res.end();

    recordCapabilityRun({
      capabilityId: id,
      latencyMs: Date.now() - start,
      retries: 0,
      success: false,
      fallbackReason: cap ? "capability_unavailable" : "capability_unknown",
    });
    return;
  }

  try {
    await cap.execute(ctx);
    recordCapabilityRun({
      capabilityId: id,
      latencyMs: Date.now() - start,
      retries: 0,
      success: true,
    });
  } catch (err) {
    recordCapabilityRun({
      capabilityId: id,
      latencyMs: Date.now() - start,
      retries: 0,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
