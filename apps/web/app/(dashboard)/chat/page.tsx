"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Keyboard, Sparkles } from "lucide-react";
import toast from "react-hot-toast";
import { chatApi, getApiError } from "@/lib/api";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { ChatMessages } from "@/components/chat/ChatMessages";
import {
  ChatInput,
  CHAT_COMPOSER_TEXTAREA_ID,
} from "@/components/chat/ChatInput";
import { ChatShortcutsHelp } from "@/components/chat/ChatShortcutsHelp";
import type { Message } from "@/components/chat/MessageBubble";

interface ChatSummary {
  id: string;
  title: string;
  updatedAt: string;
  _count: { messages: number };
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const MODEL_OPTIONS = [
  { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", disabled: true },
  { value: "claude-opus-4-7", label: "Claude Opus 4.7", disabled: true },
  {
    value: "claude-haiku-4-5-20251001",
    label: "Claude Haiku 4.5",
    disabled: true,
  },
  { value: "gpt-4o", label: "GPT-4o", disabled: true },
  { value: "gpt-5.4", label: "GPT-5.4" },
  { value: "gpt-4o-mini", label: "GPT-4o Mini", disabled: true },
];

export default function ChatPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(
    searchParams.get("id"),
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [selectedModel, setSelectedModel] = useState("gpt-4o");
  const [sending, setSending] = useState(false);
  const [waitingForFirstChunk, setWaitingForFirstChunk] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [composerInject, setComposerInject] = useState<{
    key: number;
    text: string;
  } | null>(null);

  const consumeComposerInject = useCallback(() => {
    setComposerInject(null);
  }, []);

  const streamingMsgIdRef = useRef<string | null>(null);
  const streamBufRef = useRef("");
  const streamRafRef = useRef<number | null>(null);
  const streamFlushTargetIdRef = useRef<string | null>(null);

  const flushStreamBuffer = useCallback(() => {
    streamRafRef.current = null;
    const targetId = streamFlushTargetIdRef.current;
    const delta = streamBufRef.current;
    streamBufRef.current = "";
    if (!targetId || !delta) return;
    setMessages((prev) =>
      prev.map((m) =>
        m.id === targetId ? { ...m, content: m.content + delta } : m,
      ),
    );
  }, []);

  const scheduleStreamFlush = useCallback(() => {
    if (streamRafRef.current != null) return;
    streamRafRef.current = requestAnimationFrame(flushStreamBuffer);
  }, [flushStreamBuffer]);

  const cancelScheduledStreamFlush = useCallback(() => {
    if (streamRafRef.current != null) {
      cancelAnimationFrame(streamRafRef.current);
      streamRafRef.current = null;
    }
  }, []);

  const flushStreamBufferSync = useCallback(() => {
    cancelScheduledStreamFlush();
    flushStreamBuffer();
  }, [cancelScheduledStreamFlush, flushStreamBuffer]);

  // ── Load chat list ──────────────────────────────────────────
  const loadChats = useCallback(async () => {
    try {
      const res = await chatApi.listChats();
      setChats((res.data as { data: ChatSummary[] }).data);
    } catch (err) {
      toast.error(getApiError(err));
    } finally {
      setLoadingChats(false);
    }
  }, []);

  useEffect(() => {
    loadChats();
  }, [loadChats]);

  // ── Load messages for active chat ──────────────────────────
  const loadMessages = useCallback(async (chatId: string) => {
    setLoadingMessages(true);
    setMessages([]);
    try {
      const res = await chatApi.getChat(chatId);
      const chat = (res.data as { data: { messages: Message[] } }).data;
      setMessages(chat.messages);
    } catch (err) {
      toast.error(getApiError(err));
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    if (activeChatId) {
      loadMessages(activeChatId);
      router.replace(`/chat?id=${activeChatId}`, { scroll: false });
    }
  }, [activeChatId, loadMessages, router]);

  useEffect(() => {
    return () => {
      cancelScheduledStreamFlush();
      streamBufRef.current = "";
    };
  }, [cancelScheduledStreamFlush]);

  function isEditableTarget(el: EventTarget | null): boolean {
    if (!el || !(el instanceof HTMLElement)) return false;
    const tag = el.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    if (el.isContentEditable) return true;
    if (el.closest('[role="dialog"]')) return true;
    return false;
  }

  const handleNewChatRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setShortcutsOpen(false);
        return;
      }

      const typing = isEditableTarget(e.target);

      if ((e.metaKey || e.ctrlKey) && e.code === "KeyN") {
        e.preventDefault();
        void handleNewChatRef.current?.();
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

      if (e.code === "Slash" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (typing) return;
        e.preventDefault();
        document.getElementById(CHAT_COMPOSER_TEXTAREA_ID)?.focus();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const handleNewChat = useCallback(async () => {
    try {
      const res = await chatApi.createChat(selectedModel);
      const { id } = (res.data as { data: { id: string } }).data;
      setActiveChatId(id);
      setMessages([]);
      await loadChats();
    } catch (err) {
      toast.error(getApiError(err));
    }
  }, [selectedModel, loadChats]);

  useEffect(() => {
    handleNewChatRef.current = handleNewChat;
  }, [handleNewChat]);

  // ── Select chat ─────────────────────────────────────────────
  function handleSelectChat(chatId: string) {
    if (chatId === activeChatId) return;
    setActiveChatId(chatId);
  }

  // ── Delete chat ─────────────────────────────────────────────
  function handleDeleteChat(chatId: string) {
    setChats((prev) => prev.filter((c) => c.id !== chatId));
    if (activeChatId === chatId) {
      setActiveChatId(null);
      setMessages([]);
    }
  }

  // ── Rename chat ─────────────────────────────────────────────
  function handleRenameChat(chatId: string, title: string) {
    setChats((prev) =>
      prev.map((c) => (c.id === chatId ? { ...c, title } : c)),
    );
  }

  // ── Send message (SSE streaming) ────────────────────────────
  async function handleSend(
    content: string,
    imageUrl?: string,
    videoUrl?: string,
  ) {
    if (sending) return;

    const userTempId = `temp-user-${Date.now()}`;

    // ✅ User message includes imageUrl so it renders immediately
    const userMsg: Message = {
      id: userTempId,
      role: "USER",
      content,
      imageUrl: imageUrl ?? null,
      videoUrl: videoUrl ?? null,
      createdAt: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setSending(true);
    setWaitingForFirstChunk(true);

    const streamingId = `temp-ai-${Date.now()}`;
    streamingMsgIdRef.current = streamingId;
    streamBufRef.current = "";
    streamFlushTargetIdRef.current = streamingId;

    const streamingMsg: Message = {
      id: streamingId,
      role: "ASSISTANT",
      content: "",
      createdAt: new Date(),
      streaming: true,
    };
    setMessages((prev) => [...prev, streamingMsg]);

    let currentChatId = activeChatId;

    try {
      const bodyPayload = {
        ...(currentChatId ? { chatId: currentChatId } : {}),
        ...(imageUrl ? { imageUrl } : {}),
        ...(videoUrl ? { videoUrl } : {}),
        content,
        model: selectedModel,
        strategy: "AUTO",
        stream: true,
      };

      const response = await fetch(`${API_BASE}/api/chat/message`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(bodyPayload),
      });

      if (!response.ok) throw new Error("Stream failed");

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        let currentEvent = "";

        for (const line of lines) {
          if (line.startsWith("event:")) {
            currentEvent = line.slice(6).trim();
            continue;
          }

          if (!line.startsWith("data:")) continue;
          const raw = line.slice(5).trim();
          if (!raw) continue;

          try {
            const parsed = JSON.parse(raw) as Record<string, unknown>;

            if (currentEvent === "chat_id" && parsed.chatId) {
              const newId = parsed.chatId as string;
              currentChatId = newId;
              if (!activeChatId) setActiveChatId(newId);
            }

            if (currentEvent === "chunk" && parsed.text) {
              setWaitingForFirstChunk(false);
              streamBufRef.current += parsed.text as string;
              scheduleStreamFlush();
            }

            if (currentEvent === "done") {
              flushStreamBufferSync();
              const meta = parsed as {
                messageId?: string;
                chatId?: string;
                provider?: string;
                tokensUsed?: number;
                imageUrl?: string | null;
                videoUrl?: string | null;
                assistantImage?: boolean;
              };

              setMessages((prev) =>
                prev.map((m) => {
                  // Finalize assistant message
                  if (m.id === streamingId) {
                    return {
                      ...m,
                      id: meta.messageId ?? streamingId,
                      streaming: false,
                      provider: meta.provider,
                      tokensUsed: meta.tokensUsed,
                      // For generated-image responses: clear placeholder text and
                      // attach the presigned imageUrl to the assistant bubble.
                      content: meta.assistantImage ? "" : m.content,
                      imageUrl: meta.assistantImage
                        ? (meta.imageUrl ?? null)
                        : m.imageUrl,
                    };
                  }
                  // Refresh the user message's imageUrl to the presigned URL
                  // so the optimistic bubble actually loads from private S3.
                  if (
                    m.id === userTempId &&
                    !meta.assistantImage &&
                    meta.imageUrl
                  ) {
                    return { ...m, imageUrl: meta.imageUrl };
                  }
                  return m;
                }),
              );

              await loadChats();
            }

            if (currentEvent === "error") {
              flushStreamBufferSync();
              toast.error((parsed.message as string) ?? "AI error");
              setMessages((prev) => prev.filter((m) => m.id !== streamingId));
            }

            currentEvent = "";
          } catch {
            // non-JSON line — skip
          }
        }
      }
    } catch (err) {
      flushStreamBufferSync();
      toast.error(getApiError(err));
      setMessages((prev) => prev.filter((m) => m.id !== streamingId));
    } finally {
      flushStreamBufferSync();
      streamFlushTargetIdRef.current = null;
      setSending(false);
      setWaitingForFirstChunk(false);
      streamingMsgIdRef.current = null;
    }
  }

  return (
    <div className="-m-6 -mt-8 flex h-screen overflow-hidden">
      {/* Chat sidebar */}
      <ChatSidebar
        chats={chats}
        activeChatId={activeChatId}
        onSelectChat={handleSelectChat}
        onNewChat={handleNewChat}
        onDeleteChat={handleDeleteChat}
        onRenameChat={handleRenameChat}
        loading={loadingChats}
      />

      {/* Main area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Chat header */}
        <div className="flex h-12 flex-shrink-0 items-center justify-between border-b border-white/5 bg-surface-900/80 backdrop-blur-sm px-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-brand-400" />
            <span className="text-sm font-medium text-white">AI Chat</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShortcutsOpen(true)}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-gray-400 transition-colors hover:border-brand-500/30 hover:text-brand-300"
              title="Keyboard shortcuts"
              aria-label="Keyboard shortcuts"
            >
              <Keyboard className="h-4 w-4" />
            </button>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="rounded-lg border border-white/10 bg-surface-700/60 px-3 py-1.5 text-xs text-gray-300 focus:outline-none focus:ring-1 focus:ring-brand-500/50"
            >
              {MODEL_OPTIONS.map((m) => (
                <option key={m.value} value={m.value} disabled={m.disabled}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Messages */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {loadingMessages ? (
            <div className="flex flex-1 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
            </div>
          ) : (
            <ChatMessages
              messages={messages}
              loading={waitingForFirstChunk}
              onPickStarterPrompt={(prompt) =>
                setComposerInject({ key: Date.now(), text: prompt })
              }
            />
          )}
        </div>

        {/* Input */}
        <ChatInput
          onSend={handleSend}
          disabled={sending || loadingMessages}
          composerInject={composerInject}
          onComposerInjectConsumed={consumeComposerInject}
        />
      </div>

      <ChatShortcutsHelp
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />
    </div>
  );
}
