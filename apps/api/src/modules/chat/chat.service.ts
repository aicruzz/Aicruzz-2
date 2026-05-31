import { Response } from "express";
import axios from "axios";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../config/database";
import { chats, chatMessages } from "../../db/schema";
import { aiRouter } from "../../services/ai-router.client";
import {
  uploadBufferToCloudinary,
  CLOUDINARY_DELIVERY_PREFIX,
} from "../../config/cloudinary";
import { deductCredits, refundCredits } from "../wallet/wallet.service";
import { AppError } from "../../middleware/error.middleware";
import { CLIENT_AI_UNAVAILABLE } from "../../constants/client-safe-messages";
import { logger } from "../../utils/logger";
import {
  CHAT_CREDITS_PER_MESSAGE,
  CHAT_IMAGE_GEN_CREDITS,
  CHAT_IMAGE_EDIT_CREDITS_FAST,
  CHAT_IMAGE_EDIT_CREDITS_PRO,
} from "./chat.types";
import type { SendMessageInput, ChatSummary, ChatDetail } from "./chat.types";

// Public Cloudinary delivery prefix, e.g. https://res.cloudinary.com/<cloud>/
// Cloudinary URLs are public + permanent, so we store and serve them as-is
// (no read-time presigning) — and external providers can fetch them directly.
const MEDIA_URL_PREFIX = CLOUDINARY_DELIVERY_PREFIX;

// ─── LIST USER CHATS ──────────────────────────────────────────

export async function listChats(
  userId: string,
  page = 1,
  limit = 20,
): Promise<{ chats: ChatSummary[]; total: number; totalPages: number }> {
  const offset = (page - 1) * limit;

  const [rows, totalRows] = await Promise.all([
    db
      .select({
        id: chats.id,
        title: chats.title,
        model: chats.model,
        totalCredits: chats.totalCredits,
        createdAt: chats.createdAt,
        updatedAt: chats.updatedAt,
      })
      .from(chats)
      .where(eq(chats.userId, userId))
      .orderBy(desc(chats.updatedAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(chats)
      .where(eq(chats.userId, userId)),
  ]);

  const total = totalRows[0]?.count ?? 0;
  const chatIds = rows.map((c) => c.id);

  const [countsRaw, lastMsgsRaw] = chatIds.length
    ? await Promise.all([
        db
          .select({
            chatId: chatMessages.chatId,
            n: sql<number>`count(*)::int`,
          })
          .from(chatMessages)
          .where(inArray(chatMessages.chatId, chatIds))
          .groupBy(chatMessages.chatId),
        db.execute<{ chat_id: string; content: string }>(sql`
        SELECT DISTINCT ON (chat_id) chat_id, content
        FROM chat_messages
        WHERE chat_id IN ${chatIds}
        ORDER BY chat_id, created_at DESC
      `),
      ])
    : [[], [] as { chat_id: string; content: string }[]];

  const countByChat = new Map<string, number>();
  for (const r of countsRaw as Array<{ chatId: string; n: number }>) {
    countByChat.set(r.chatId, r.n);
  }

  const lastByChat = new Map<string, string>();
  for (const r of lastMsgsRaw as { chat_id: string; content: string }[]) {
    lastByChat.set(r.chat_id, r.content);
  }

  const chatSummaries = rows.map((c) => ({
    ...c,
    _count: { messages: countByChat.get(c.id) ?? 0 },
    lastMessage: lastByChat.get(c.id)?.slice(0, 100),
  })) as unknown as ChatSummary[];

  return {
    chats: chatSummaries,
    total,
    totalPages: Math.ceil(total / limit),
  };
}

// ─── GET CHAT DETAIL ──────────────────────────────────────────

export async function getChatById(
  chatId: string,
  userId: string,
): Promise<ChatDetail> {
  const chat = await db.query.chats.findFirst({
    where: and(eq(chats.id, chatId), eq(chats.userId, userId)),
    with: {
      messages: {
        orderBy: (t, { asc: a }) => a(t.createdAt),
        columns: {
          id: true,
          role: true,
          content: true,
          imageUrl: true,
          videoUrl: true,
          provider: true,
          model: true,
          tokensUsed: true,
          latencyMs: true,
          createdAt: true,
        },
      },
    },
  });

  if (!chat) throw new AppError("Chat not found", 404);

  // Presign image/video URLs so the browser <img>/<video> can fetch from a
  // private bucket. Stored URLs remain canonical; presigned URLs are short-lived.
  const messages = await Promise.all(
    chat.messages.map(async (m) => ({
      ...m,
      imageUrl: await resolveStoredUrl(m.imageUrl),
      videoUrl: await resolveStoredUrl(m.videoUrl),
    })),
  );

  return { ...chat, messages } as unknown as ChatDetail;
}

// ─── CREATE NEW CHAT ──────────────────────────────────────────

export async function createChat(
  userId: string,
  model = "gpt-4o",
): Promise<{ id: string }> {
  const [chat] = await db
    .insert(chats)
    .values({ userId, model })
    .returning({ id: chats.id });
  return chat;
}

// ─── DELETE CHAT ──────────────────────────────────────────────

export async function deleteChat(
  chatId: string,
  userId: string,
): Promise<void> {
  const chat = await db.query.chats.findFirst({
    where: and(eq(chats.id, chatId), eq(chats.userId, userId)),
    columns: { id: true },
  });
  if (!chat) throw new AppError("Chat not found", 404);
  await db.delete(chats).where(eq(chats.id, chatId));
}

// ─── UPDATE TITLE ─────────────────────────────────────────────

export async function updateTitle(
  chatId: string,
  userId: string,
  title: string,
): Promise<void> {
  const chat = await db.query.chats.findFirst({
    where: and(eq(chats.id, chatId), eq(chats.userId, userId)),
    columns: { id: true },
  });
  if (!chat) throw new AppError("Chat not found", 404);
  await db
    .update(chats)
    .set({ title, updatedAt: new Date() })
    .where(eq(chats.id, chatId));
}

// ─── HELPERS ──────────────────────────────────────────────────

/**
 * Validates that a URL is one we uploaded to Cloudinary.
 * Prevents users from passing arbitrary external URLs into your AI context.
 */
function assertUploadedUrl(url: string, field: string): void {
  if (!MEDIA_URL_PREFIX) {
    throw new AppError("Media storage is not configured", 500);
  }
  if (!url.startsWith(MEDIA_URL_PREFIX)) {
    throw new AppError(`Invalid ${field}: must be a valid uploaded URL`, 400);
  }
}

// Cloudinary URLs are public and permanent, so a stored URL is already the URL
// we serve to the client — no read-time signing. Kept as a thin async helper
// so call sites stay uniform if storage policy changes again.
async function resolveStoredUrl(url: string | null): Promise<string | null> {
  return url;
}

// Downloads a generated image (e.g. from DALL-E) and persists it to Cloudinary
// so it lives in chat history forever and passes assertUploadedUrl checks.
// Returns the public Cloudinary URL for storage.
async function persistGeneratedImage(
  source: { url?: string; b64Image?: string },
): Promise<string> {
  let buffer: Buffer;

  if (source.b64Image) {
    // gpt-image-1 path — no HTTP round-trip needed
    buffer = Buffer.from(source.b64Image, 'base64');
  } else if (source.url) {
    // dall-e-3 / external URL fallback
    const res = await axios.get<ArrayBuffer>(source.url, {
      responseType: 'arraybuffer',
      timeout: 60_000,
    });
    buffer = Buffer.from(res.data);
  } else {
    throw new AppError('No image data returned from provider', 502);
  }

  const { url } = await uploadBufferToCloudinary(buffer, {
    folder: 'chat-generated',
    resourceType: 'image',
  });
  return url;
}

// Cheap LLM classifier — returns true when the user is asking us to generate
// an image. Defaults to false on any error so text flow stays the safe default.
async function detectImageIntent(content: string): Promise<boolean> {
  const trimmed = content.trim();
  if (!trimmed || trimmed.length > 2000) return false;

  try {
    const result = await aiRouter.route({
      userId: "system",
      module: "CHAT",
      strategy: "COST",
      stream: false,
      model: "gpt-4o-mini",
      systemPrompt:
        "You are an intent classifier. Reply with exactly one token: IMAGE if the user is asking the assistant to create, draw, render, or generate a picture/image/illustration; otherwise TEXT. No punctuation, no explanation.",
      messages: [{ role: "user", content: trimmed }],
    });
    const reply = (result.result.text ?? "").trim().toUpperCase();
    return reply.startsWith("IMAGE");
  } catch (err) {
    logger.warn("detectImageIntent failed; falling back to TEXT", {
      message: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

// Cheap LLM classifier — returns true when the user has attached an image and
// is asking us to edit/transform/retouch it (vs. just asking a question about
// it). Defaults to false on any error so the safe vision/text path is used.
async function detectImageEditIntent(content: string): Promise<boolean> {
  const trimmed = content.trim();
  if (!trimmed || trimmed.length > 2000) return false;

  try {
    const result = await aiRouter.route({
      userId: "system",
      module: "CHAT",
      strategy: "COST",
      stream: false,
      model: "gpt-4o-mini",
      systemPrompt:
        "You are an intent classifier for an image editor. The user has " +
        "attached an image. Reply with exactly one token: EDIT if they are " +
        "asking to modify, transform, retouch, restyle, change, fix, add to, " +
        "remove from, or repose the image/subject; otherwise ASK (they only " +
        "want a description, answer, or analysis). No punctuation, no explanation.",
      messages: [{ role: "user", content: trimmed }],
    });
    const reply = (result.result.text ?? "").trim().toUpperCase();
    return reply.startsWith("EDIT");
  } catch (err) {
    logger.warn("detectImageEditIntent failed; falling back to vision/text", {
      message: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/**
 * Build an AI-compatible message content block.
 * If an imageUrl is present, we send a multipart content array
 * so vision-capable models (GPT-4o, Claude, etc.) can see the image.
 */
function buildUserContent(
  text: string,
  imageUrl?: string | null,
): string | { type: string; text?: string; image_url?: { url: string } }[] {
  if (!imageUrl) return text;

  return [
    { type: "image_url", image_url: { url: imageUrl } },
    { type: "text", text },
  ];
}

// ─── SEND MESSAGE (real streaming) ───────────────────────────

export async function sendMessage(
  userId: string,
  input: SendMessageInput,
  res: Response,
): Promise<void> {
  const {
    content,
    imageUrl,
    videoUrl,
    model,
    strategy = "AUTO",
    editQuality = "FAST",
  } = input;

  // 1. Validate S3 URLs — reject anything that didn't come from your bucket
  if (imageUrl) assertUploadedUrl(imageUrl, "imageUrl");
  if (videoUrl) assertUploadedUrl(videoUrl, "videoUrl");

  // 2. Resolve or create chat
  let chatId = input.chatId;
  if (!chatId) {
    const newChat = await createChat(userId, model);
    chatId = newChat.id;
  } else {
    const existing = await db.query.chats.findFirst({
      where: and(eq(chats.id, chatId), eq(chats.userId, userId)),
      columns: { id: true },
    });
    if (!existing) throw new AppError("Chat not found", 404);
  }

  // 2a. Auto-detect image-edit intent — user attached an image AND is asking
  // us to transform/retouch it. Routes to the professional gpt-image-1 editor
  // instead of a vision/text turn.
  if (imageUrl && !videoUrl && (await detectImageEditIntent(content))) {
    await handleImageTransform(
      userId,
      chatId,
      content,
      imageUrl,
      editQuality,
      res,
    );
    return;
  }

  // 2b. Auto-detect image-generation intent (only for plain text messages —
  // if the user attached media, treat it as a vision/text turn).
  if (!imageUrl && !videoUrl && (await detectImageIntent(content))) {
    await handleImageGeneration(userId, chatId, content, res);
    return;
  }

  // 3. Load history — include imageUrl so past images stay in context
  const history = await db
    .select({
      role: chatMessages.role,
      content: chatMessages.content,
      imageUrl: chatMessages.imageUrl,
    })
    .from(chatMessages)
    .where(eq(chatMessages.chatId, chatId))
    .orderBy(asc(chatMessages.createdAt))
    .limit(20);

  // 4. Deduct credits BEFORE calling AI
  const deduction = await deductCredits({
    userId,
    credits: CHAT_CREDITS_PER_MESSAGE,
    module: "CHAT",
    description: "AI chat message",
    metadata: { chatId },
  });

  // 5. Save user message — imageUrl/videoUrl are now guaranteed S3 URLs or null
  await db.insert(chatMessages).values({
    chatId,
    role: "USER",
    content,
    imageUrl,
    videoUrl,
  });

  // 6. Build message array for AI
  const messages = [
    ...history.map((m) => ({
      role: m.role.toLowerCase() as "user" | "assistant" | "system",
      content: buildUserContent(
        m.content,
        m.role === "USER" ? m.imageUrl : null,
      ),
    })),
    {
      role: "user" as const,
      content: buildUserContent(content, imageUrl),
    },
  ];

  // 7. Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const sendEvent = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    if (typeof (res as any).flush === "function") (res as any).flush();
  };

  sendEvent("chat_id", { chatId });

  let assistantText = "";
  let tokensUsed = 0;
  let provider = "";
  let latencyMs = 0;

  try {
    // 8. Call AI router
    const result = await aiRouter.route({
      userId,
      module: "CHAT",
      strategy,
      messages,
      systemPrompt:
        "You are a helpful, creative AI assistant on the AiCruzz platform.",
      model: model ?? "gpt-4o",
      stream: true,
      onChunk: (chunk: string) => {
        assistantText += chunk;
        sendEvent("chunk", { text: chunk });
      },
    });

    if (!result.success) {
      logger.warn("Chat sendMessage: router returned failure", {
        provider: result.provider,
        internalError: result.result.error,
      });
      throw new AppError(result.result.error ?? "AI response failed", 502, {
        clientSafeMessage: CLIENT_AI_UNAVAILABLE,
      });
    }

    tokensUsed = result.result.tokensUsed ?? 0;
    latencyMs = result.result.latencyMs ?? 0;
    provider = result.provider ?? "";

    // Fallback: if onChunk wasn't called, stream full text character by character
    if (!assistantText && result.result.text) {
      assistantText = result.result.text;
      for (const char of assistantText) {
        sendEvent("chunk", { text: char });
      }
    }

    // 9. Save assistant message
    const [assistantMsg] = await db
      .insert(chatMessages)
      .values({
        chatId,
        role: "ASSISTANT",
        content: assistantText,
        provider,
        model: model ?? "gpt-4o",
        tokensUsed,
        latencyMs,
      })
      .returning({ id: chatMessages.id });

    // 10. Auto-title new chat
    const chat = await db.query.chats.findFirst({
      where: eq(chats.id, chatId),
      columns: { title: true },
    });
    if (chat?.title === "New Chat") {
      const autoTitle = content.slice(0, 60) + (content.length > 60 ? "…" : "");
      await db
        .update(chats)
        .set({ title: autoTitle })
        .where(eq(chats.id, chatId));
    }

    // 11. Update chat totals
    await db
      .update(chats)
      .set({
        totalCredits: sql`${chats.totalCredits} + ${CHAT_CREDITS_PER_MESSAGE}`,
        updatedAt: new Date(),
      })
      .where(eq(chats.id, chatId));

    // 12. Done — presign user-attached media so the optimistic bubble loads.
    sendEvent("done", {
      messageId: assistantMsg.id,
      chatId,
      provider,
      tokensUsed,
      creditsUsed: CHAT_CREDITS_PER_MESSAGE,
      fallbackUsed: result.fallbackUsed,
      imageUrl: await resolveStoredUrl(imageUrl ?? null),
      videoUrl: await resolveStoredUrl(videoUrl ?? null),
    });

    res.end();
  } catch (err) {
    await refundCredits({
      userId,
      credits: CHAT_CREDITS_PER_MESSAGE,
      module: "CHAT",
      description: "Refund: AI chat failed",
      originalTransactionId: deduction.transactionId,
    });

    sendEvent("error", { message: CLIENT_AI_UNAVAILABLE });
    res.end();

    logger.error("Chat sendMessage failed:", {
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      userId,
      chatId,
    });
  }
}

// ─── IMAGE GENERATION FLOW ────────────────────────────────────

async function handleImageGeneration(
  userId: string,
  chatId: string,
  prompt: string,
  res: Response,
): Promise<void> {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const sendEvent = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    if (typeof (res as any).flush === "function") (res as any).flush();
  };

  sendEvent("chat_id", { chatId });

  const deduction = await deductCredits({
    userId,
    credits: CHAT_IMAGE_GEN_CREDITS,
    module: "CHAT",
    description: "AI chat image generation",
    metadata: { chatId, mode: "image" },
  });

  await db
    .insert(chatMessages)
    .values({ chatId, role: "USER", content: prompt });

  sendEvent("chunk", { text: "Generating image…" });

  try {
    const result = await aiRouter.route({
      userId,
      module: "IMAGE",
      strategy: "AUTO",
      stream: false,
      prompt,
    });

    // ← CHANGED: accept either a URL or base64 from gpt-image-1
    if (!result.success || (!result.result.outputUrl && !result.result.b64Image)) {
      logger.warn("Chat image gen: router failure", {
        provider: result.provider,
        internalError: result.result.error,
      });
      throw new AppError(
        result.result.error ?? "Image generation failed",
        502,
        { clientSafeMessage: CLIENT_AI_UNAVAILABLE },
      );
    }

    // ← CHANGED: pass object instead of bare URL string
    const storedUrl = await persistGeneratedImage({
      url: result.result.outputUrl,
      b64Image: result.result.b64Image,
    });
    const presignedUrl = await resolveStoredUrl(storedUrl);

    const [assistantMsg] = await db
      .insert(chatMessages)
      .values({
        chatId,
        role: "ASSISTANT",
        content: "",
        imageUrl: storedUrl,
        provider: result.provider,
        model: "gpt-image-1",
        tokensUsed: 0,
        latencyMs: result.result.latencyMs ?? 0,
      })
      .returning({ id: chatMessages.id });

    const chat = await db.query.chats.findFirst({
      where: eq(chats.id, chatId),
      columns: { title: true },
    });
    if (chat?.title === "New Chat") {
      const autoTitle = prompt.slice(0, 60) + (prompt.length > 60 ? "…" : "");
      await db
        .update(chats)
        .set({ title: autoTitle })
        .where(eq(chats.id, chatId));
    }

    await db
      .update(chats)
      .set({
        totalCredits: sql`${chats.totalCredits} + ${CHAT_IMAGE_GEN_CREDITS}`,
        updatedAt: new Date(),
      })
      .where(eq(chats.id, chatId));

    sendEvent("done", {
      messageId: assistantMsg.id,
      chatId,
      provider: result.provider,
      tokensUsed: 0,
      creditsUsed: CHAT_IMAGE_GEN_CREDITS,
      fallbackUsed: result.fallbackUsed,
      imageUrl: presignedUrl,
      videoUrl: null,
      assistantImage: true,
    });

    res.end();
  } catch (err) {
    await refundCredits({
      userId,
      credits: CHAT_IMAGE_GEN_CREDITS,
      module: "CHAT",
      description: "Refund: image generation failed",
      originalTransactionId: deduction.transactionId,
    });

    sendEvent("error", { message: CLIENT_AI_UNAVAILABLE });
    res.end();

    logger.error("Chat handleImageGeneration failed:", {
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      userId,
      chatId,
    });
  }
}

// ─── IMAGE TRANSFORMATION / EDITING FLOW ──────────────────────
//
// User uploaded a photo and asked us to change it ("make him lie on a bed",
// "swap the outfit", "turn day into night"). We route to the dedicated
// gpt-image-1 edit provider. The user message keeps the *original* image
// (the "before"); the assistant message holds the *edited* image (the
// "after") so the UI can pair them into a comparison slider.

async function handleImageTransform(
  userId: string,
  chatId: string,
  prompt: string,
  originalImageUrl: string,
  editQuality: "FAST" | "PRO",
  res: Response,
): Promise<void> {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const sendEvent = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    if (typeof (res as any).flush === "function") (res as any).flush();
  };

  sendEvent("chat_id", { chatId });

  const isPro = editQuality === "PRO";
  const credits = isPro
    ? CHAT_IMAGE_EDIT_CREDITS_PRO
    : CHAT_IMAGE_EDIT_CREDITS_FAST;

  const deduction = await deductCredits({
    userId,
    credits,
    module: "CHAT",
    description: "AI chat image transformation",
    metadata: { chatId, mode: "image_transform", quality: editQuality },
  });

  // Persist the user's turn with the ORIGINAL image (the "before").
  await db.insert(chatMessages).values({
    chatId,
    role: "USER",
    content: prompt,
    imageUrl: originalImageUrl,
  });

  sendEvent("chunk", {
    text: isPro
      ? "Transforming image in PRO mode (high quality + upscale)…"
      : "Transforming image…",
  });

  try {
    const result = await aiRouter.route({
      userId,
      module: "IMAGE_TRANSFORM",
      strategy: "AUTO",
      stream: false,
      prompt,
      inputImageUrl: originalImageUrl,
      // FAST → STANDARD (quality 'medium'); PRO → ULTRA (quality 'high' + upscale).
      qualityMode: isPro ? "ULTRA" : "STANDARD",
    });

    if (
      !result.success ||
      (!result.result.outputUrl && !result.result.b64Image)
    ) {
      logger.warn("Chat image transform: router failure", {
        provider: result.provider,
        internalError: result.result.error,
      });
      throw new AppError(
        result.result.error ?? "Image transformation failed",
        502,
        { clientSafeMessage: CLIENT_AI_UNAVAILABLE },
      );
    }

    const storedUrl = await persistGeneratedImage({
      url: result.result.outputUrl,
      b64Image: result.result.b64Image,
    });
    const presignedUrl = await resolveStoredUrl(storedUrl);

    const [assistantMsg] = await db
      .insert(chatMessages)
      .values({
        chatId,
        role: "ASSISTANT",
        content: `Edited image — "${prompt}"`,
        imageUrl: storedUrl,
        provider: result.provider,
        model: "gpt-image-1",
        tokensUsed: 0,
        latencyMs: result.result.latencyMs ?? 0,
      })
      .returning({ id: chatMessages.id });

    const chat = await db.query.chats.findFirst({
      where: eq(chats.id, chatId),
      columns: { title: true },
    });
    if (chat?.title === "New Chat") {
      const autoTitle = prompt.slice(0, 60) + (prompt.length > 60 ? "…" : "");
      await db
        .update(chats)
        .set({ title: autoTitle })
        .where(eq(chats.id, chatId));
    }

    await db
      .update(chats)
      .set({
        totalCredits: sql`${chats.totalCredits} + ${credits}`,
        updatedAt: new Date(),
      })
      .where(eq(chats.id, chatId));

    sendEvent("done", {
      messageId: assistantMsg.id,
      chatId,
      provider: result.provider,
      tokensUsed: 0,
      creditsUsed: credits,
      fallbackUsed: result.fallbackUsed,
      imageUrl: presignedUrl,
      originalImageUrl: await resolveStoredUrl(originalImageUrl),
      videoUrl: null,
      assistantImage: true,
      mode: "IMAGE_TRANSFORM",
      quality: editQuality,
    });

    res.end();
  } catch (err) {
    await refundCredits({
      userId,
      credits,
      module: "CHAT",
      description: "Refund: image transformation failed",
      originalTransactionId: deduction.transactionId,
    });

    sendEvent("error", { message: CLIENT_AI_UNAVAILABLE });
    res.end();

    logger.error("Chat handleImageTransform failed:", {
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      userId,
      chatId,
    });
  }
}

// ─── PROMPT ASSISTANT (enhance) ──────────────────────────────
//
// Standalone helper used by the studio "prompt assistant" button. It is
// deliberately isolated from sendMessage(): NO credit deduction, NO chat
// creation/persistence, NO image-intent detection, NO SSE — just a single
// cheap LLM round-trip that returns the rewritten prompt as plain text.

export type EnhanceAction = "improve" | "expand" | "optimize";

const ENHANCE_SYSTEM_PROMPTS: Record<EnhanceAction, string> = {
  improve:
    "You are a prompt-editing assistant for an AI video/cartoon generator. " +
    "Rewrite the user's prompt to fix grammar and improve clarity while keeping " +
    "the original intent and meaning. Do NOT add new ideas, subjects, or scenes. " +
    "Reply with ONLY the rewritten prompt — no preamble, quotes, or explanation.",
  expand:
    "You are a prompt-editing assistant for an AI video/cartoon generator. " +
    "Expand the user's prompt with more detail: enrich the scene description, " +
    "add sensory and visual specifics, and increase creative depth while staying " +
    "true to the original subject and intent. " +
    "Reply with ONLY the expanded prompt — no preamble, quotes, or explanation.",
  optimize:
    "You are a prompt-engineering assistant for an AI video/cartoon generator. " +
    "Rewrite the user's prompt for the best possible generation quality: improve " +
    "structure and apply strong prompt-engineering practices (clear subject, " +
    "action, setting, style, lighting, and camera framing) while preserving the " +
    "original intent. " +
    "Reply with ONLY the optimized prompt — no preamble, quotes, or explanation.",
};

export async function enhancePrompt(
  action: EnhanceAction,
  prompt: string,
): Promise<string> {
  const trimmed = prompt.trim();
  if (!trimmed) {
    throw new AppError("Prompt is required", 400);
  }
  if (trimmed.length > 4000) {
    throw new AppError("Prompt is too long (max 4,000 characters)", 400);
  }

  try {
    const result = await aiRouter.route({
      userId: "system",
      module: "CHAT",
      strategy: "COST",
      stream: false,
      model: "gpt-4o-mini",
      systemPrompt: ENHANCE_SYSTEM_PROMPTS[action],
      messages: [{ role: "user", content: trimmed }],
    });

    const text = (result.result.text ?? "").trim();
    if (!text) {
      throw new AppError(CLIENT_AI_UNAVAILABLE, 502);
    }
    return text;
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.error("enhancePrompt failed:", {
      message: err instanceof Error ? err.message : String(err),
      action,
    });
    throw new AppError(CLIENT_AI_UNAVAILABLE, 502);
  }
}