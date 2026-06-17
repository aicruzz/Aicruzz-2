"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ImagePlus,
  Clapperboard,
  FileText,
  Code2,
  Sparkles,
  RotateCcw,
  Wand2,
  ArrowDown,
} from "lucide-react";
import toast from "react-hot-toast";
import { chatApi, videoApi, getApiError } from "@/lib/api";
import { consumeBannerPrefill } from "@/lib/bannerPrefill";
import {
  Button,
  Badge,
  Skeleton,
  EmptyState,
  ErrorBoundary,
  Modal,
  Spinner,
} from "@/components/ui";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { MessageBubble } from "@/components/chat/MessageBubble";
import {
  ChatInput,
  CHAT_COMPOSER_TEXTAREA_ID,
  DEFAULT_UPLOAD_LIMITS,
  type UploadLimits,
} from "@/components/chat/ChatInput";
import { ChatShortcutsHelp } from "@/components/chat/ChatShortcutsHelp";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// Shape must match ChatSidebar's expected ChatSummary (incl. _count).
interface ChatListItem {
  id: string;
  title: string;
  updatedAt: string;
  _count: { messages: number };
}
interface Message {
  id: string;
  role: "USER" | "ASSISTANT" | "SYSTEM";
  content: string;
  imageUrl?: string | null;
  imageUrls?: string[] | null;
  originalImageUrl?: string | null;
  videoUrl?: string | null;
  provider?: string | null;
  streaming?: boolean;
  /** True while an image-generation/edit turn is rendering (shows a skeleton). */
  generatingImage?: boolean;
  /** Operation hint (ui/faceswap/background/…) for operation-aware loader phases. */
  imageOp?: string;
  /** True when the turn failed — shows inline error + Retry. */
  error?: boolean;
  /** Original prompt of a generated image (Copy prompt / Regenerate). */
  prompt?: string | null;
  /** Engineered prompt actually sent to the model (Copy revised prompt). */
  revisedPrompt?: string | null;
  createdAt: Date;
}

// Client-side mirror of the backend image router — lets us show the image
// loader instantly (no flash of the text typing indicator) before the server
// confirms via the "mode" event. Conservative: only predicts obvious cases.
const PRED_OVERRIDE_RE =
  /\b(image not text|not text|image only|as an? image|generate an? image|make an? image|create an? image)\b/i;
const PRED_GEN_RE =
  /\b(create|generate|draw|render|make|design|paint|sketch|illustrate|visuali[sz]e|imagine)\b[\s\S]{0,60}\b(image|picture|photo|illustration|drawing|art(?:work)?|logo|poster|wallpaper|portrait|mock-?up|ui|interface|landing\s?page|banner|flyer|icon|avatar|sticker|wireframe|character|design|emoji)\b/i;
const PRED_EDIT_RE =
  /\b(remove|erase|replace|swap|background|sky|face\s?-?swap|head\s?-?swap|cartoon|anime|ghibli|pixar|outpaint|combine|merge|recreate|redesign|variation|recolou?r|restyle|like the (?:uploaded|attached|sample|reference))\b/i;

function predictImageTurn(content: string, hasImages: boolean): boolean {
  const t = content.trim();
  if (!t) return false;
  if (PRED_OVERRIDE_RE.test(t)) return true;
  if (hasImages) return PRED_EDIT_RE.test(t);
  if (/^create an image of\b/i.test(t)) return true;
  return PRED_GEN_RE.test(t);
}

// Reasoning label derived from the provider the router actually picked
// (Anthropic ← coding/reasoning affinity, OpenAI ← creative/general).
// Purely derived for display — backend routing is untouched.
function routingLabel(provider?: string | null): string | null {
  if (!provider) return null;
  const p = provider.toUpperCase();
  if (p.includes("ANTHROPIC") || p.includes("CLAUDE"))
    return "Reasoning · Coding";
  if (p.includes("OPENAI") || p.includes("GPT")) return "Creative · General";
  return null;
}

const AI_ACTIONS = [
  {
    key: "image",
    label: "Image",
    icon: ImagePlus,
    scaffold: "Create an image of",
  },
  { key: "video", label: "Video", icon: Clapperboard, scaffold: "" },
  {
    key: "document",
    label: "Document",
    icon: FileText,
    scaffold: "Write a well-structured document about ",
  },
  {
    key: "code",
    label: "Code",
    icon: Code2,
    scaffold: "Write clean, production-ready code for ",
  },
] as const;

export function ChatStudio() {
  const [chats, setChats] = useState<ChatListItem[]>([]);
  const [loadingChats, setLoadingChats] = useState(true);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [inject, setInject] = useState<{ key: number; text: string } | null>(
    null,
  );
  const [videoOpen, setVideoOpen] = useState(false);
  const [videoPrompt, setVideoPrompt] = useState("");
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [attachInject, setAttachInject] = useState<{
    key: number;
    url: string;
  } | null>(null);
  // Upload limits from the shared backend config (single source of truth).
  const [uploadLimits, setUploadLimits] =
    useState<UploadLimits>(DEFAULT_UPLOAD_LIMITS);
  const threadRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Always-current snapshot of messages so action callbacks can stay
  // referentially stable (no `messages` dep → MessageBubble memo holds during
  // streaming).
  const messagesRef = useRef<Message[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Streaming infra: AbortController for cancellation + rAF-batched flush of the
  // assistant text buffer (one state update per frame instead of per token).
  const abortRef = useRef<AbortController | null>(null);
  const abortedRef = useRef(false);
  const streamBufRef = useRef("");
  const rafRef = useRef<number | null>(null);
  const streamTargetRef = useRef<string | null>(null);
  const atBottomRef = useRef(true);

  const flushBuffer = useCallback(() => {
    rafRef.current = null;
    const id = streamTargetRef.current;
    const delta = streamBufRef.current;
    streamBufRef.current = "";
    if (!id || !delta) return;
    setMessages((p) =>
      p.map((m) => (m.id === id ? { ...m, content: m.content + delta } : m)),
    );
  }, []);

  const scheduleFlush = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(flushBuffer);
  }, [flushBuffer]);

  const flushNow = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    flushBuffer();
  }, [flushBuffer]);

  // Abort any in-flight stream + cancel pending frame on unmount.
  useEffect(
    () => () => {
      abortRef.current?.abort();
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  const loadChats = useCallback(async () => {
    try {
      const r = await chatApi.listChats();
      const list =
        (r.data as { data: Array<Partial<ChatListItem>> }).data ?? [];
      setChats(
        list.map((c) => ({
          id: c.id!,
          title: c.title ?? "Untitled",
          updatedAt: c.updatedAt ?? new Date().toISOString(),
          _count: c._count ?? { messages: 0 },
        })),
      );
    } finally {
      setLoadingChats(false);
    }
  }, []);

  useEffect(() => {
    loadChats();
  }, [loadChats]);

  // Fetch the shared upload limits once; fall back to defaults on any failure so
  // the composer always works. The frontend never hardcodes these numbers.
  useEffect(() => {
    chatApi
      .getConfig()
      .then((r) => {
        const cfg = (r.data as { data?: Partial<UploadLimits> }).data;
        if (cfg?.maxImages) setUploadLimits({ ...DEFAULT_UPLOAD_LIMITS, ...cfg });
      })
      .catch(() => {
        /* keep defaults */
      });
  }, []);

  // "Use This Prompt" hand-off from the dashboard showcase. Chat only
  // supports a prompt — settings metadata is gracefully ignored.
  useEffect(() => {
    const pre = consumeBannerPrefill("CHAT");
    if (pre?.prompt) {
      setInject({ key: Date.now(), text: pre.prompt });
      toast.success("Prompt added from showcase");
    }
  }, []);

  // Pin to bottom only when the user is already near the bottom — reading
  // scrollback is never yanked away by streaming output.
  useEffect(() => {
    if (atBottomRef.current) {
      threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight });
    }
  }, [messages]);

  const onThreadScroll = useCallback(() => {
    const el = threadRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distance < 80;
    atBottomRef.current = atBottom;
    setShowScrollBtn(!atBottom && el.scrollHeight > el.clientHeight + 40);
  }, []);

  const scrollToBottom = useCallback(() => {
    atBottomRef.current = true;
    setShowScrollBtn(false);
    threadRef.current?.scrollTo({
      top: threadRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, []);

  async function selectChat(id: string) {
    setActiveChatId(id);
    setLoadingMsgs(true);
    try {
      const r = await chatApi.getChat(id);
      const data = (r.data as { data: { messages: Message[] } }).data;
      setMessages(
        (data.messages ?? []).map((m) => ({
          ...m,
          createdAt: new Date(m.createdAt),
        })),
      );
    } catch (e) {
      toast.error(getApiError(e));
    } finally {
      setLoadingMsgs(false);
    }
  }

  async function newChat() {
    try {
      const r = await chatApi.createChat();
      const id = (r.data as { data: { id: string } }).data.id;
      setActiveChatId(id);
      setMessages([]);
      loadChats();
    } catch (e) {
      toast.error(getApiError(e));
    }
  }

  // ── Streaming send (SSE) with cancellation + rAF-batched rendering ────
  const send = useCallback(
    async (
      content: string,
      imageUrl?: string,
      videoUrl?: string,
      editQuality?: "FAST" | "PRO",
      imageUrls?: string[],
    ) => {
      if (!content.trim() && !imageUrl && !videoUrl) return;
      if (abortRef.current) return; // guard against concurrent streams
      atBottomRef.current = true; // a new turn always snaps to the bottom

      const userMsg: Message = {
        id: `u-${Date.now()}`,
        role: "USER",
        content,
        imageUrl,
        imageUrls: imageUrls?.length ? imageUrls : undefined,
        videoUrl,
        createdAt: new Date(),
      };
      // Predict an image turn so the premium loader shows instantly (no flash
      // of the text typing indicator). The server "mode" event confirms it and
      // the first text chunk corrects a wrong prediction.
      const predictedImage = predictImageTurn(
        content,
        !!(imageUrls?.length || imageUrl),
      );
      const streamId = `a-${Date.now()}`;
      streamTargetRef.current = streamId;
      streamBufRef.current = "";
      abortedRef.current = false;
      setMessages((p) => [
        ...p,
        userMsg,
        {
          id: streamId,
          role: "ASSISTANT",
          content: "",
          streaming: true,
          generatingImage: predictedImage,
          createdAt: new Date(),
        },
      ]);
      setStreaming(true);
      // One-shot guard: the first text chunk means this is a text turn, so the
      // (possibly predicted) image loader must be cleared.
      let clearedImageFlag = false;

      const controller = new AbortController();
      abortRef.current = controller;

      let chatId = activeChatId;
      try {
        const res = await fetch(`${API_BASE}/api/chat/message`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            ...(chatId ? { chatId } : {}),
            ...(imageUrl ? { imageUrl } : {}),
            ...(imageUrls?.length ? { imageUrls } : {}),
            ...(videoUrl ? { videoUrl } : {}),
            ...(imageUrl && editQuality ? { editQuality } : {}),
            content,
            strategy: "AUTO",
            stream: true,
          }),
        });
        if (!res.ok || !res.body) throw new Error("Stream failed");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let evt = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (line.startsWith("event:")) {
              evt = line.slice(6).trim();
              continue;
            }
            if (!line.startsWith("data:")) continue;
            const raw = line.slice(5).trim();
            if (!raw) continue;
            const parsed = JSON.parse(raw) as Record<string, unknown>;

            if (evt === "chat_id" && parsed.chatId) {
              chatId = parsed.chatId as string;
              if (!activeChatId) setActiveChatId(chatId);
            }
            if (evt === "mode" && parsed.kind === "image") {
              // Image turn — swap the text typing indicator for the premium
              // loader and record the operation so it shows matching phases.
              const op =
                typeof parsed.op === "string" ? (parsed.op as string) : undefined;
              setMessages((p) =>
                p.map((m) =>
                  m.id === streamId
                    ? { ...m, generatingImage: true, imageOp: op }
                    : m,
                ),
              );
            }
            if (evt === "chunk" && parsed.text) {
              // First token ⇒ a text turn: clear any predicted image loader.
              if (!clearedImageFlag) {
                clearedImageFlag = true;
                setMessages((p) =>
                  p.map((m) =>
                    m.id === streamId && m.generatingImage
                      ? { ...m, generatingImage: false }
                      : m,
                  ),
                );
              }
              // Buffer tokens and flush once per animation frame.
              streamBufRef.current += parsed.text as string;
              scheduleFlush();
            }
            if (evt === "error") {
              throw new Error((parsed.message as string) ?? "AI error");
            }
            if (evt === "done") {
              flushNow();
              const meta = parsed as {
                provider?: string;
                imageUrl?: string | null;
                originalImageUrl?: string | null;
                videoUrl?: string | null;
                assistantImage?: boolean;
                imagePrompt?: string | null;
                revisedPrompt?: string | null;
              };
              setMessages((p) =>
                p.map((m) =>
                  m.id === streamId
                    ? {
                        ...m,
                        streaming: false,
                        generatingImage: false,
                        provider: meta.provider ?? null,
                        // Only attach imageUrl to the assistant bubble for a
                        // true generation/edit. A vision turn echoes the user's
                        // upload here and must NOT show as a generated result
                        // (it already renders on the user message).
                        imageUrl: meta.assistantImage
                          ? (meta.imageUrl ?? m.imageUrl)
                          : m.imageUrl,
                        prompt: meta.assistantImage
                          ? (meta.imagePrompt ?? m.prompt)
                          : m.prompt,
                        revisedPrompt: meta.assistantImage
                          ? (meta.revisedPrompt ?? m.revisedPrompt)
                          : m.revisedPrompt,
                        originalImageUrl:
                          meta.originalImageUrl ?? m.originalImageUrl,
                        videoUrl: meta.videoUrl ?? m.videoUrl,
                      }
                    : m,
                ),
              );
            }
          }
        }
      } catch (e) {
        flushNow();
        const aborted =
          controller.signal.aborted ||
          abortedRef.current ||
          (e instanceof DOMException && e.name === "AbortError");
        if (aborted) {
          // User stopped generation — keep the partial output, drop the cursor.
          setMessages((p) =>
            p.map((m) =>
              m.id === streamId
                ? { ...m, streaming: false, generatingImage: false }
                : m,
            ),
          );
        } else {
          setMessages((p) =>
            p.map((m) =>
              m.id === streamId
                ? { ...m, streaming: false, generatingImage: false, error: true }
                : m,
            ),
          );
          toast.error(getApiError(e));
        }
      } finally {
        flushNow();
        abortRef.current = null;
        streamTargetRef.current = null;
        setStreaming(false);
        loadChats();
      }
    },
    [activeChatId, loadChats, scheduleFlush, flushNow],
  );

  // ── Cancel / regenerate / edit / retry ───────────────────────
  const stop = useCallback(() => {
    abortedRef.current = true;
    abortRef.current?.abort();
  }, []);

  // Resend the most recent user turn (drops everything from it onward first).
  const regenerateLast = useCallback(() => {
    const msgs = messagesRef.current;
    let cut = -1;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === "USER") {
        cut = i;
        break;
      }
    }
    if (cut < 0) return;
    const u = msgs[cut];
    setMessages((p) => p.slice(0, cut));
    void send(
      u.content,
      u.imageUrl ?? undefined,
      u.videoUrl ?? undefined,
      undefined,
      u.imageUrls ?? undefined,
    );
  }, [send]);

  // Edit a user message: truncate the thread from it and resend the new text.
  const submitEdit = useCallback(
    (id: string, newContent: string) => {
      const msgs = messagesRef.current;
      const idx = msgs.findIndex((m) => m.id === id);
      if (idx < 0) return;
      const orig = msgs[idx];
      setMessages((p) => p.slice(0, idx));
      void send(
        newContent,
        orig.imageUrl ?? undefined,
        orig.videoUrl ?? undefined,
        undefined,
        orig.imageUrls ?? undefined,
      );
    },
    [send],
  );

  // Generated-image actions (stable identities so MessageBubble memo holds).
  const regenerateImage = useCallback(
    (prompt: string) => {
      if (prompt.trim()) void send(prompt.trim());
    },
    [send],
  );

  // Intentional variations — each click explores a distinct design direction
  // (A→B→C→D) while preserving the user's original request, rather than a random
  // reroll.
  const variationDirections = [
    "Variation A — a different composition and camera angle.",
    "Variation B — an alternative color palette and lighting mood.",
    "Variation C — a more minimal, refined treatment.",
    "Variation D — a bolder, more dramatic, high-impact treatment.",
  ];
  const variationCounterRef = useRef(0);
  const variationsImage = useCallback(
    (prompt: string) => {
      if (!prompt.trim()) return;
      const dir =
        variationDirections[
          variationCounterRef.current % variationDirections.length
        ];
      variationCounterRef.current += 1;
      void send(
        `${prompt.trim()}\n\nKeep the same subject and intent, but explore a fresh direction: ${dir}`,
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [send],
  );

  // Duplicate — create another instance from the same prompt (a fresh copy).
  const duplicateImage = useCallback(
    (prompt: string) => {
      if (prompt.trim()) void send(prompt.trim());
    },
    [send],
  );

  const editImage = useCallback((url: string) => {
    // Load the generated image into the composer so the user can describe an
    // edit (routes to the gpt-image-1 editor on send).
    setAttachInject({ key: Date.now(), url });
    toast.success("Image added — describe your edit");
    setTimeout(
      () => document.getElementById(CHAT_COMPOSER_TEXTAREA_ID)?.focus(),
      0,
    );
  }, []);

  // ── AI action: video via the existing video pipeline ────────
  async function generateVideoInChat() {
    const prompt = videoPrompt.trim();
    if (!prompt) return;
    setVideoOpen(false);
    setVideoPrompt("");
    const msgId = `v-${Date.now()}`;
    setMessages((p) => [
      ...p,
      {
        id: `uv-${Date.now()}`,
        role: "USER",
        content: `🎬 Generate video: ${prompt}`,
        createdAt: new Date(),
      },
      {
        id: msgId,
        role: "ASSISTANT",
        content: "Generating video via the AiCruzz pipeline…",
        streaming: true,
        createdAt: new Date(),
      },
    ]);
    try {
      const r = await videoApi.generate({
        prompt,
        durationSeconds: 5,
        resolution: "HD_720P",
        qualityMode: "STANDARD",
        voiceEnabled: false,
        fps: 24,
      });
      const jobId = (r.data as { data: { id: string } }).data.id;
      const poll = setInterval(async () => {
        try {
          const jr = await videoApi.getJob(jobId);
          const j = (
            jr.data as {
              data: {
                status: string;
                outputUrl: string | null;
                errorMessage: string | null;
              };
            }
          ).data;
          if (j.status === "COMPLETED" && j.outputUrl) {
            clearInterval(poll);
            setMessages((p) =>
              p.map((m) =>
                m.id === msgId
                  ? {
                      ...m,
                      streaming: false,
                      content: "Here is your generated video:",
                      videoUrl: j.outputUrl,
                    }
                  : m,
              ),
            );
          } else if (j.status === "FAILED" || j.status === "CANCELLED") {
            clearInterval(poll);
            setMessages((p) =>
              p.map((m) =>
                m.id === msgId
                  ? {
                      ...m,
                      streaming: false,
                      content: `⚠️ ${j.errorMessage ?? "Video generation failed."}`,
                    }
                  : m,
              ),
            );
          }
        } catch {
          /* keep polling */
        }
      }, 4000);
    } catch (e) {
      setMessages((p) =>
        p.map((m) =>
          m.id === msgId
            ? { ...m, streaming: false, content: `⚠️ ${getApiError(e)}` }
            : m,
        ),
      );
    }
  }

  // Global keyboard shortcuts (Esc stop/close, / focus composer, ⌘N new chat,
  // ⌘/ or Shift+? open help). Mirrors the legacy chat page for parity.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      const typing =
        !!t &&
        (t.tagName === "TEXTAREA" ||
          t.tagName === "INPUT" ||
          t.tagName === "SELECT" ||
          t.isContentEditable);

      if (e.key === "Escape") {
        if (shortcutsOpen) {
          setShortcutsOpen(false);
          return;
        }
        if (abortRef.current) stop();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.code === "Slash") {
        e.preventDefault();
        setShortcutsOpen(true);
        return;
      }
      if (e.shiftKey && e.key === "?") {
        if (typing) return;
        e.preventDefault();
        setShortcutsOpen(true);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.code === "KeyN") {
        e.preventDefault();
        void newChat();
        return;
      }
      if (
        e.code === "Slash" &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !typing
      ) {
        e.preventDefault();
        document.getElementById(CHAT_COMPOSER_TEXTAREA_ID)?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shortcutsOpen]);

  const lastAssistant = [...messages]
    .reverse()
    .find((m) => m.role === "ASSISTANT" && !m.streaming);

  return (
    <div className="flex h-[calc(100vh-9rem)] gap-4">
      {/* Sidebar */}
      <div className="hidden w-72 shrink-0 lg:block">
        <ChatSidebar
          chats={chats}
          activeChatId={activeChatId}
          loading={loadingChats}
          onSelectChat={selectChat}
          onNewChat={newChat}
          onDeleteChat={async (id) => {
            await chatApi
              .deleteChat(id)
              .catch((e) => toast.error(getApiError(e)));
            if (id === activeChatId) {
              setActiveChatId(null);
              setMessages([]);
            }
            loadChats();
          }}
          onRenameChat={async (id, title) => {
            await chatApi
              .updateTitle(id, title)
              .catch((e) => toast.error(getApiError(e)));
            loadChats();
          }}
        />
      </div>

      {/* Thread */}
      <div className="glass relative flex min-w-0 flex-1 flex-col rounded-2xl border border-white/5">
        <div
          ref={threadRef}
          onScroll={onThreadScroll}
          className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6"
        >
          {loadingMsgs ? (
            <div className="space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton
                  key={i}
                  className={i % 2 ? "ml-auto h-16 w-2/3" : "h-20 w-3/4"}
                />
              ))}
            </div>
          ) : messages.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <EmptyState
                icon={<Sparkles className="h-8 w-8" />}
                title="Start a conversation"
                description="Chat, or use the action bar to generate images, video, documents and code."
                action={
                  <Button size="sm" onClick={newChat}>
                    New chat
                  </Button>
                }
              />
            </div>
          ) : (
            <ErrorBoundary>
              {messages.map((m, i) => (
                <MessageBubble
                  key={m.id}
                  message={m}
                  isLast={i === messages.length - 1}
                  onRegenerate={
                    m.role === "ASSISTANT" ? regenerateLast : undefined
                  }
                  onRetry={m.error ? regenerateLast : undefined}
                  onEditSubmit={m.role === "USER" ? submitEdit : undefined}
                  onImageRegenerate={regenerateImage}
                  onImageVariations={variationsImage}
                  onImageEdit={editImage}
                  onImageDuplicate={duplicateImage}
                />
              ))}
              <div ref={bottomRef} />
            </ErrorBoundary>
          )}
        </div>

        {/* Scroll-to-bottom affordance (only when scrolled away from bottom) */}
        {showScrollBtn && (
          <button
            type="button"
            onClick={scrollToBottom}
            aria-label="Scroll to latest"
            className="absolute bottom-28 left-1/2 z-10 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border border-white/10 bg-surface-800/90 text-gray-300 shadow-lg backdrop-blur transition-colors hover:text-white"
          >
            <ArrowDown className="h-4 w-4" />
          </button>
        )}

        {/* Action bar */}
        <div className="flex flex-wrap items-center gap-2 border-t border-white/5 px-4 py-2">
          {AI_ACTIONS.map((a) => (
            <button
              key={a.key}
              onClick={() => {
                if (a.key === "video") setVideoOpen(true);
                else setInject({ key: Date.now(), text: a.scaffold });
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-gray-300 transition-colors hover:border-brand-500/40 hover:text-brand-300"
            >
              <a.icon className="h-3.5 w-3.5" /> {a.label}
            </button>
          ))}
          {lastAssistant && (
            <>
              <button
                onClick={regenerateLast}
                disabled={streaming}
                className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-gray-300 hover:border-white/25 disabled:opacity-50"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Regenerate
              </button>
              {routingLabel(lastAssistant.provider) && (
                <Badge tone="brand">
                  {routingLabel(lastAssistant.provider)}
                </Badge>
              )}
            </>
          )}
          {streaming && (
            <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
              <Spinner className="h-3 w-3" /> streaming…
            </span>
          )}
        </div>

        {/* Composer (existing component, presigned-S3 upload + attachments) */}
        <div className="border-t border-white/5 p-3">
          <ChatInput
            onSend={send}
            isStreaming={streaming}
            onStop={stop}
            composerInject={inject}
            onComposerInjectConsumed={() => setInject(null)}
            attachInject={attachInject}
            uploadLimits={uploadLimits}
          />
        </div>
      </div>

      {/* Video action modal */}
      <Modal
        open={videoOpen}
        onClose={() => setVideoOpen(false)}
        title="Generate a video"
      >
        <div className="space-y-4">
          <textarea
            value={videoPrompt}
            onChange={(e) => setVideoPrompt(e.target.value)}
            rows={3}
            placeholder="Describe the video to generate…"
            className="w-full resize-none rounded-xl border border-white/10 bg-surface-700/50 px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none"
          />
          <p className="text-xs text-gray-500">
            Tip: be specific — describe the subject, action, setting, style, and
            lighting for the best results.
          </p>
          <p className="text-xs text-gray-500">
            Uses the existing AiCruzz video pipeline (Runway / Pika). 5s · 720p.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setVideoOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              icon={<Wand2 className="h-4 w-4" />}
              disabled={!videoPrompt.trim()}
              onClick={generateVideoInChat}
            >
              Generate
            </Button>
          </div>
        </div>
      </Modal>

      {/* Keyboard shortcuts (opened via ⌘/Ctrl + / or Shift + ?) */}
      <ChatShortcutsHelp
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />
    </div>
  );
}
