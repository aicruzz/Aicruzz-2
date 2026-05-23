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
import { ChatInput } from "@/components/chat/ChatInput";

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
  originalImageUrl?: string | null;
  videoUrl?: string | null;
  provider?: string | null;
  streaming?: boolean;
  createdAt: Date;
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
  const threadRef = useRef<HTMLDivElement>(null);
  const lastUserRef = useRef<string>("");

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

  // "Use This Prompt" hand-off from the dashboard showcase. Chat only
  // supports a prompt — settings metadata is gracefully ignored.
  useEffect(() => {
    const pre = consumeBannerPrefill("CHAT");
    if (pre?.prompt) {
      setInject({ key: Date.now(), text: pre.prompt });
      toast.success("Prompt added from showcase");
    }
  }, []);

  useEffect(() => {
    threadRef.current?.scrollTo({
      top: threadRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

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

  // ── Streaming send (replicates the existing SSE contract) ────
  const send = useCallback(
    async (
      content: string,
      imageUrl?: string,
      videoUrl?: string,
      editQuality?: "FAST" | "PRO",
    ) => {
      if (!content.trim() && !imageUrl && !videoUrl) return;
      lastUserRef.current = content;
      const userMsg: Message = {
        id: `u-${Date.now()}`,
        role: "USER",
        content,
        imageUrl,
        videoUrl,
        createdAt: new Date(),
      };
      const streamId = `a-${Date.now()}`;
      setMessages((p) => [
        ...p,
        userMsg,
        {
          id: streamId,
          role: "ASSISTANT",
          content: "",
          streaming: true,
          createdAt: new Date(),
        },
      ]);
      setStreaming(true);

      let chatId = activeChatId;
      try {
        const res = await fetch(`${API_BASE}/api/chat/message`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(chatId ? { chatId } : {}),
            ...(imageUrl ? { imageUrl } : {}),
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
            if (evt === "chunk" && parsed.text) {
              setMessages((p) =>
                p.map((m) =>
                  m.id === streamId
                    ? { ...m, content: m.content + (parsed.text as string) }
                    : m,
                ),
              );
            }
            if (evt === "done") {
              const meta = parsed as {
                provider?: string;
                imageUrl?: string | null;
                originalImageUrl?: string | null;
                videoUrl?: string | null;
              };
              setMessages((p) =>
                p.map((m) =>
                  m.id === streamId
                    ? {
                        ...m,
                        streaming: false,
                        provider: meta.provider ?? null,
                        imageUrl: meta.imageUrl ?? m.imageUrl,
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
        setMessages((p) =>
          p.map((m) =>
            m.id === streamId
              ? {
                  ...m,
                  streaming: false,
                  content: m.content || "⚠️ Generation failed.",
                }
              : m,
          ),
        );
        toast.error(getApiError(e));
      } finally {
        setStreaming(false);
        loadChats();
      }
    },
    [activeChatId, loadChats],
  );

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

  function regenerate() {
    if (lastUserRef.current) send(lastUserRef.current);
  }

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
      <div className="glass flex min-w-0 flex-1 flex-col rounded-2xl border border-white/5">
        <div
          ref={threadRef}
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
              {messages.map((m) => (
                <MessageBubble key={m.id} message={m} />
              ))}
            </ErrorBoundary>
          )}
        </div>

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
                onClick={regenerate}
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
            disabled={streaming}
            composerInject={inject}
            onComposerInjectConsumed={() => setInject(null)}
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
    </div>
  );
}
