'use client';

import { useEffect, useRef } from 'react';
import { MessageBubble, type Message } from './MessageBubble';
import { Bot } from 'lucide-react';

interface ChatMessagesProps {
  messages: Message[];
  loading?: boolean;
  onPickStarterPrompt?: (prompt: string) => void;
}

export function ChatMessages({
  messages,
  loading = false,
  onPickStarterPrompt,
}: ChatMessagesProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  if (messages.length === 0 && !loading) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center px-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-gradient shadow-lg shadow-brand-500/20">
          <Bot className="h-8 w-8 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-white">Start a conversation</h2>
          <p className="mt-1 text-sm text-gray-500">
            Ask anything, upload images or videos, and get AI-powered responses.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 max-w-sm mt-2">
          {[
            'Write a Python script to process CSV files',
            'Explain quantum computing simply',
            'Create a marketing strategy for a SaaS startup',
            'Review and improve my code',
          ].map((prompt) => (
            <button
              type="button"
              key={prompt}
              onClick={() => onPickStarterPrompt?.(prompt)}
              className="rounded-xl border border-white/5 bg-surface-700/50 p-3 text-left text-xs text-gray-400 transition-all hover:border-brand-500/30 hover:text-gray-200"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
      {messages.map((msg) => (
        <div
          key={msg.id}
          style={{
            contentVisibility: "auto",
            containIntrinsicSize: "auto 100px",
          }}
        >
          <MessageBubble message={msg} />
        </div>
      ))}

      {/* Typing indicator */}
      {loading && (
        <div className="flex gap-3">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-surface-600 border border-white/10">
            <Bot className="h-4 w-4 text-brand-400" />
          </div>
          <div className="flex items-center gap-1 rounded-2xl rounded-tl-sm bg-surface-700/80 border border-white/5 px-4 py-3">
            <span className="h-2 w-2 animate-bounce rounded-full bg-brand-400 [animation-delay:0ms]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-brand-400 [animation-delay:150ms]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-brand-400 [animation-delay:300ms]" />
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
