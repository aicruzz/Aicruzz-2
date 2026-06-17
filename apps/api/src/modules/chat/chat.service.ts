import { Response } from "express";
import axios from "axios";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../config/database";
import {
  chats,
  chatMessages,
  type ChatMessageMetadata,
} from "../../db/schema";
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
  CHAT_MAX_IMAGES,
} from "./chat.types";
import { planImageGeneration, classifyEditOp } from "./image-agent";
import {
  runCapability,
  registerCapability,
  buildDesignMeta,
  type CapabilityContext,
  type CapabilityId,
  type ClassifiedAttachment,
} from "./capabilities";
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
          metadata: true,
          createdAt: true,
        },
      },
    },
  });

  if (!chat) throw new AppError("Chat not found", 404);

  // Resolve stored URLs and restore the full multimodal state from metadata so a
  // reloaded conversation looks exactly as it did. Legacy rows (null metadata)
  // simply keep their single imageUrl — fully backward compatible.
  const messages = await Promise.all(
    chat.messages.map(async (m) => {
      const meta = (m.metadata ?? {}) as ChatMessageMetadata;
      const imageUrls = meta.imageUrls?.length
        ? ((await Promise.all(meta.imageUrls.map(resolveStoredUrl))).filter(
            Boolean,
          ) as string[])
        : null;
      return {
        ...m,
        imageUrl: await resolveStoredUrl(m.imageUrl),
        videoUrl: await resolveStoredUrl(m.videoUrl),
        imageUrls,
        originalImageUrl: meta.originalImageUrl
          ? await resolveStoredUrl(meta.originalImageUrl)
          : null,
        prompt: meta.prompt ?? null,
        revisedPrompt: meta.revisedPrompt ?? null,
        operation: meta.operation ?? null,
        designMeta: meta.designMeta ?? null,
      };
    }),
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

// Image to continue editing — only when the MOST RECENT message in the chat
// carries an image. This recency gate means "add …", "make it …" etc. only
// route to image editing while the user is actively in an image context (it
// won't hijack a code/text conversation that produced an image far earlier).
async function findLastChatImage(chatId: string): Promise<string | null> {
  const [row] = await db
    .select({ imageUrl: chatMessages.imageUrl })
    .from(chatMessages)
    .where(eq(chatMessages.chatId, chatId))
    .orderBy(desc(chatMessages.createdAt))
    .limit(1);
  return row?.imageUrl ?? null;
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
        "You are an intent classifier. Reply with exactly one token: IMAGE if " +
        "the user wants the assistant to produce a visual — e.g. create, draw, " +
        "render, generate, design or illustrate a picture, image, illustration, " +
        "logo, icon, poster, banner, flyer, app UI, interface, landing page, " +
        "mockup, wireframe, avatar, sticker, wallpaper, character or artwork. " +
        "Otherwise reply TEXT. No punctuation, no explanation.",
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
        "attached one or more images. Reply with exactly one token: EDIT if " +
        "they want to produce a new/modified image from the upload(s) — e.g. " +
        "modify, transform, retouch, restyle, recolor, change, fix, add to, " +
        "remove from, repose, swap a face/head, replace the background or sky, " +
        "change clothing/hair, remove or replace an object, outpaint/extend, " +
        "combine/merge the images, apply a style (cartoon/anime/Pixar/Ghibli/" +
        "realistic), make a variation, or recreate/redesign something 'like' " +
        "the sample. Reply ASK only if they purely want a description, answer, " +
        "analysis, OCR or translation. No punctuation, no explanation.",
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
 * If one or more imageUrls are present, we send a multipart content array
 * (one image_url block per image, in order) so vision-capable models
 * (GPT-4o, Claude, etc.) can see every attached image.
 */
function buildUserContent(
  text: string,
  images?: string | string[] | null,
): string | { type: string; text?: string; image_url?: { url: string } }[] {
  const urls = (Array.isArray(images) ? images : images ? [images] : []).filter(
    Boolean,
  ) as string[];

  if (!urls.length) return text;

  return [
    ...urls.map((url) => ({
      type: "image_url",
      image_url: { url },
    })),
    { type: "text", text },
  ];
}

// ─── IMAGE INTENT ROUTER ──────────────────────────────────────
//
// Deterministic fast-paths + cheap LLM tie-breakers that classify every turn
// into TEXT | GENERATE | EDIT | VISION *before* any text generation runs. This
// guarantees an image request can never fall through into the GPT-4o text
// pipeline. Regex fast-paths also skip the classifier round-trip (latency win).

// Explicit "force image" overrides — the user is telling us, in words, that the
// output must be an image (not prose).
const IMAGE_OVERRIDE_RE =
  /\b(image\s+not\s+text|not\s+text|image\s+only|as\s+an?\s+image|in\s+image\s+form|output\s+an?\s+image|respond\s+with\s+an?\s+image|reply\s+with\s+an?\s+image|give\s+me\s+an?\s+image|generate\s+an?\s+image|make\s+an?\s+image|create\s+an?\s+image)\b/i;

// Verb + visual-noun within a short window → a clear text-to-image request.
const IMAGE_REQUEST_RE =
  /\b(create|generate|draw|render|make|design|paint|sketch|produce|illustrate|visuali[sz]e|imagine|compose|mock\s?up)\b[\s\S]{0,60}\b(image|picture|photo|photograph|illustration|drawing|art(?:work)?|painting|logo|poster|wallpaper|portrait|render|mock-?up|ui|interface|landing\s?page|web\s?page|banner|flyer|icon|avatar|sticker|thumbnail|wireframe|infographic|scene|character|design|emoji)\b/i;

// Explicit image-editing operations (only consulted when an image is attached).
const EDIT_REQUEST_RE =
  /\b(remove|erase|delete|replace|swap|change|edit|retouch|restyle|recolou?r|inpaint|out-?paint|extend|expand|combine|merge|composite|blend|cut\s?-?out|background|backdrop|sky|face\s?-?swap|head\s?-?swap|swap\s+(?:the\s+)?(?:face|head|background)|hair|outfit|clothing|clothes|cartoon|anime|ghibli|pixar|style\s?transfer|upscale|enhance|colou?rize|like\s+the\s+(?:uploaded|attached|sample|reference|example)|based\s+on\s+(?:this|the\s+(?:image|photo|upload|sample))|using\s+(?:this|the\s+(?:image|photo|upload))|from\s+(?:this|the)\s+(?:image|photo|sample)|recreate|redesign|variation|variant)\b/i;

// Pure analysis/OCR/description → keep on the GPT-4o vision path.
const VISION_REQUEST_RE =
  /\b(what(?:'s| is| are| does| can)|describe|explain|read|ocr|extract\s+(?:the\s+)?text|transcribe|translate|identify|analy[sz]e|caption|tell\s+me\s+about|how\s+many|count\b|is\s+(?:this|there))\b/i;

// Iterative-edit continuation openers — short imperative visual tweaks that
// refer to "the previous image" implicitly. Used only when no new image is
// attached AND the chat already has an image to continue from.
const CONTINUATION_RE =
  /^\s*(make (?:it|this|them|the (?:image|scene|background|sky))|add|remove|erase|change|replace|swap|turn (?:it|this) into|zoom (?:in|out)|brighten|darken|recolou?r|restyle|colou?rize|put (?:it|him|her|them|a)|give (?:it|him|her|them)|set (?:it|the scene)|at night|during the day|in (?:the )?(?:day|night|rain|snow|fog)|more|less|crop|rotate|flip|extend|expand)\b/i;

function looksLikeImageRequest(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed || trimmed.length > 2000) return false;
  if (/^create an image of\b/i.test(trimmed)) return true; // action-bar scaffold
  if (IMAGE_OVERRIDE_RE.test(trimmed)) return true;
  return IMAGE_REQUEST_RE.test(trimmed);
}

export type ImageRoute = "TEXT" | "GENERATE" | "EDIT" | "VISION";

/**
 * Classify a turn into the correct pipeline. Deterministic fast-paths resolve
 * the common cases instantly; only genuinely ambiguous turns pay for a cheap
 * gpt-4o-mini tie-breaker. Defaults are always the safe ones (TEXT / VISION).
 */
async function classifyImageRoute(
  content: string,
  hasImage: boolean,
): Promise<ImageRoute> {
  const trimmed = content.trim();
  if (!trimmed) return "TEXT";
  const override = IMAGE_OVERRIDE_RE.test(trimmed);

  if (hasImage) {
    // An attached image + any editing verb (or a force-image override that
    // references the upload) → professional edit. Uploaded images are never
    // ignored for an image request.
    if (override || EDIT_REQUEST_RE.test(trimmed)) return "EDIT";
    // Clear analysis/OCR phrasing → vision answer.
    if (VISION_REQUEST_RE.test(trimmed)) return "VISION";
    // Ambiguous → cheap tie-breaker (EDIT vs analyze).
    return (await detectImageEditIntent(trimmed)) ? "EDIT" : "VISION";
  }

  // No attachment.
  if (override || looksLikeImageRequest(trimmed)) return "GENERATE";
  return (await detectImageIntent(trimmed)) ? "GENERATE" : "TEXT";
}

// The prompt builder (plan → category directives → fidelity wrapper) now lives
// in the Image Agent (./image-agent). Generation calls planImageGeneration().

// Smart QA — true when a provider response did not actually produce a usable
// image: a failure, or "success" with no URL and no real base64 payload (text
// returned instead of an image, an empty body, or a tiny/corrupt result). A
// genuine gpt-image-1 image is hundreds of KB of base64, so a very short
// payload signals a broken/empty generation that should be retried.
const MIN_B64_BYTES = 5000; // ~3.7 KB — well below any real image, above noise
function isUnusableImageResult(result: {
  success: boolean;
  result: { outputUrl?: string; b64Image?: string };
}): boolean {
  if (!result.success) return true;
  const hasUrl = !!result.result.outputUrl;
  const hasB64 =
    !!result.result.b64Image && result.result.b64Image.length > MIN_B64_BYTES;
  return !hasUrl && !hasB64;
}

/**
 * Run an image route call with output verification + one silent retry. If the
 * first attempt yields no usable image, retry once with the same request before
 * returning — so an image request never degrades to text/empty without a fight.
 */
async function routeImageWithRetry(
  req: Parameters<typeof aiRouter.route>[0],
): Promise<Awaited<ReturnType<typeof aiRouter.route>>> {
  let result = await aiRouter.route(req);
  if (isUnusableImageResult(result)) {
    logger.warn("Image route returned no usable image; retrying once", {
      module: req.module,
      provider: result.provider,
      internalError: result.result.error,
    });
    result = await aiRouter.route(req);
  }
  return result;
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
    imageUrls,
    videoUrl,
    model,
    strategy = "AUTO",
    editQuality = "FAST",
  } = input;

  // Normalize to an ordered image array (imageUrls supersedes the single
  // imageUrl). imageUrl is kept = images[0] so all existing single-image
  // call sites and the DB (single imageUrl column) keep working.
  const images = (imageUrls?.length ? imageUrls : imageUrl ? [imageUrl] : [])
    .filter(Boolean)
    .slice(0, CHAT_MAX_IMAGES) as string[];

  // 1. Validate S3 URLs — reject anything that didn't come from your bucket
  for (const url of images) assertUploadedUrl(url, "imageUrl");
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

  // 2. Capability-first dispatch — classify attachments, detect the capability,
  // then run it through the engine. Providers are chosen downstream by the AI
  // router; Chat Studio never names a provider.
  const attachments: ClassifiedAttachment[] = [
    ...images.map((url) => ({ url, kind: "image" as const })),
    ...(videoUrl ? [{ url: videoUrl, kind: "video" as const }] : []),
  ];
  const ctx: CapabilityContext = {
    userId,
    chatId,
    content,
    images,
    videoUrl,
    attachments,
    editQuality,
    model,
    strategy,
    res,
  };

  const capabilityId = await detectCapability(ctx);
  await runCapability(capabilityId, ctx);
}

// ─── CAPABILITY DETECTION ─────────────────────────────────────
// Map a turn to a capability id (the optimal provider is chosen later by the
// AI router). Reuses the image intent router + continuation logic so an image
// request can never be answered with prose.
async function detectCapability(ctx: CapabilityContext): Promise<CapabilityId> {
  const { content, images, videoUrl, chatId } = ctx;
  const primaryImage = images[0];
  const route: ImageRoute = videoUrl
    ? "TEXT"
    : await classifyImageRoute(content, !!primaryImage);

  // Edit/transform — attached image(s) the user wants changed (all forwarded).
  if (primaryImage && !videoUrl && (route === "EDIT" || route === "GENERATE")) {
    return "image_editing";
  }
  // Text-to-image generation — image request with no attachment.
  if (!primaryImage && !videoUrl && route === "GENERATE") {
    return "image_generation";
  }
  // Iterative continuation — tweak the most recent image without re-uploading.
  if (!primaryImage && !videoUrl && CONTINUATION_RE.test(content)) {
    const lastImage = await findLastChatImage(chatId);
    if (lastImage) {
      ctx.sourceImages = [lastImage];
      return "image_continuation";
    }
  }
  // Otherwise: vision (sees attached images) or plain text.
  return images.length ? "vision" : "text_chat";
}

// ─── TEXT / VISION CAPABILITY ─────────────────────────────────
// Streaming chat turn (text_chat + vision). Behavior unchanged — relocated out
// of sendMessage so it can be a registered capability executor.
async function handleTextTurn(ctx: CapabilityContext): Promise<void> {
  const { userId, chatId, content, images, videoUrl, model, strategy, res } =
    ctx;
  const primaryImage = images[0];

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

  // 5. Save user message — imageUrl/videoUrl are now guaranteed S3 URLs or null.
  // The DB stores a single imageUrl column; we persist the first (primary)
  // image for history. All uploaded images are still sent to the model below.
  await db.insert(chatMessages).values({
    chatId,
    role: "USER",
    content,
    imageUrl: primaryImage,
    videoUrl,
    // Persist every uploaded image (in order) so a reload restores them all.
    metadata: images.length > 1 ? { imageUrls: images } : null,
  });

  // 6. Build message array for AI — the current turn includes every uploaded
  // image so vision models see all of them; history keeps its single image.
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
      content: buildUserContent(content, images),
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
      imageUrl: await resolveStoredUrl(primaryImage ?? null),
      imageUrls: images.length ? images : null,
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

  // Image Agent — analyse the request, plan it, classify its type, and build a
  // category-specialised, self-validated prompt. Also yields a loader op so the
  // client shows operation-specific phases. Never throws (deterministic fallback).
  const { prompt: builtPrompt, plan, op } = await planImageGeneration(prompt);
  // Tell the client this is an image turn (premium loader, not a typing
  // indicator) and which operation, so it shows matching phase messages.
  sendEvent("mode", { kind: "image", op });

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

  try {
    // Generate at top quality with output verification + one silent retry — an
    // image request must never come back as text or empty. qualityMode is passed
    // only on Chat Studio's IMAGE call, so other modules are unaffected.
    const result = await routeImageWithRetry({
      userId,
      module: "IMAGE",
      strategy: "AUTO",
      stream: false,
      prompt: builtPrompt,
      qualityMode: "ULTRA",
    });

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
        // Version-history + gallery metadata (restored on reload).
        metadata: {
          prompt,
          revisedPrompt: builtPrompt,
          operation: op,
          category: plan.category,
          version: 1,
          designMeta: buildDesignMeta(plan.category),
        },
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
      // Original user prompt — powers Copy prompt / Regenerate / Variations.
      imagePrompt: prompt,
      // Image metadata — version history + gallery (kept in-session).
      revisedPrompt: builtPrompt,
      operation: op,
      category: plan.category,
      // Design-to-code metadata (UI etc.) — pipeline prep, no export performed.
      designMeta: buildDesignMeta(plan.category),
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
  originalImageUrls: string[],
  editQuality: "FAST" | "PRO",
  res: Response,
): Promise<void> {
  // The first uploaded image is the "before" shown in the slider; any further
  // images are passed to gpt-image-1 as additional reference inputs.
  const originalImageUrl = originalImageUrls[0];

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const sendEvent = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    if (typeof (res as any).flush === "function") (res as any).flush();
  };

  const editOp = classifyEditOp(prompt);

  sendEvent("chat_id", { chatId });
  // Image turn — client shows the premium loader (not a typing indicator).
  // Classify the edit op so the loader shows operation-specific phases.
  sendEvent("mode", { kind: "image", op: editOp });

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

  // Persist the user's turn with the ORIGINAL image (the "before") and every
  // uploaded reference so a reload restores them all.
  await db.insert(chatMessages).values({
    chatId,
    role: "USER",
    content: prompt,
    imageUrl: originalImageUrl,
    metadata:
      originalImageUrls.length > 1 ? { imageUrls: originalImageUrls } : null,
  });

  // No text chunk — the client renders an image skeleton (via the "mode" event)
  // while the edit runs, then swaps in the before/after result.

  try {
    // Output verification + one silent retry, same guarantee as generation.
    const result = await routeImageWithRetry({
      userId,
      module: "IMAGE_TRANSFORM",
      strategy: "AUTO",
      stream: false,
      prompt,
      inputImageUrl: originalImageUrl,
      // All uploaded images go to gpt-image-1's edit endpoint as references
      // (combine/blend). Single image keeps the original behavior.
      inputImageUrls: originalImageUrls,
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
        // Edit-chain metadata: keep the "before" so the before/after view and
        // the parent relationship restore on reload.
        metadata: {
          originalImageUrl,
          parentImageUrl: originalImageUrl,
          operation: editOp,
          prompt,
          version: 2,
        },
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
      // Version-history metadata (in-session): the edit op + parent image.
      operation: editOp,
      imagePrompt: prompt,
      parentImageUrl: await resolveStoredUrl(originalImageUrl),
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

// ─── CAPABILITY REGISTRATION ──────────────────────────────────
// Register the capabilities available today. Each executor delegates to an
// existing streaming handler — the optimal provider is selected by the AI
// router, so Chat Studio stays provider-agnostic. Future capabilities (video,
// audio, PDF, search, Figma…) are registered as "coming_soon" in ./capabilities
// and become live by adding an executor — no change to this dispatch.
function registerChatCapabilities(): void {
  registerCapability({
    id: "text_chat",
    name: "Text Chat",
    description: "Conversational text responses.",
    acceptedInputs: ["text"],
    producedOutputs: ["text"],
    permissions: [],
    availability: "available",
    priority: 10,
    execute: (ctx) => handleTextTurn(ctx),
  });
  registerCapability({
    id: "vision",
    name: "Vision",
    description: "Understand and answer questions about uploaded images.",
    acceptedInputs: ["text", "image"],
    producedOutputs: ["text"],
    permissions: [],
    availability: "available",
    priority: 20,
    execute: (ctx) => handleTextTurn(ctx),
  });
  registerCapability({
    id: "image_generation",
    name: "Image Generation",
    description: "Create images from a text description.",
    acceptedInputs: ["text"],
    producedOutputs: ["image"],
    permissions: [],
    availability: "available",
    priority: 40,
    execute: (ctx) =>
      handleImageGeneration(ctx.userId, ctx.chatId, ctx.content, ctx.res),
  });
  registerCapability({
    id: "image_editing",
    name: "Image Editing",
    description: "Edit or transform uploaded images (multi-image references).",
    acceptedInputs: ["text", "image"],
    producedOutputs: ["image"],
    permissions: [],
    availability: "available",
    priority: 50,
    execute: (ctx) =>
      handleImageTransform(
        ctx.userId,
        ctx.chatId,
        ctx.content,
        ctx.images,
        ctx.editQuality,
        ctx.res,
      ),
  });
  registerCapability({
    id: "image_continuation",
    name: "Continue Image",
    description: "Iteratively edit the most recent image in the chat.",
    acceptedInputs: ["text"],
    producedOutputs: ["image"],
    permissions: [],
    availability: "available",
    priority: 45,
    execute: (ctx) =>
      handleImageTransform(
        ctx.userId,
        ctx.chatId,
        ctx.content,
        ctx.sourceImages ?? [],
        ctx.editQuality,
        ctx.res,
      ),
  });
}

registerChatCapabilities();