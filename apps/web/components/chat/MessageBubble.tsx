'use client';

import { clsx } from 'clsx';
import { Bot, User, Copy, Check } from 'lucide-react';
import { memo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';
import { BeforeAfterSlider } from '@/components/chat/BeforeAfterSlider';

export interface Message {
  id: string;
  role: 'USER' | 'ASSISTANT' | 'SYSTEM';
  content: string;
  imageUrl?: string | null;
  /** Source image for a transformation result — enables the before/after view. */
  originalImageUrl?: string | null;
  videoUrl?: string | null;
  provider?: string | null;
  tokensUsed?: number | null;
  createdAt: string | Date;
  streaming?: boolean;
}

interface MessageBubbleProps {
  message: Message;
}

// ── Code block with its own copy button ──────────────────────
function CodeBlock({
  inline,
  className,
  children,
  ...props
}: {
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const code = String(children).replace(/\n$/, '');

  if (inline) {
    return (
      <code
        className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[0.8em] text-brand-300"
        {...props}
      >
        {children}
      </code>
    );
  }

  async function copyCode() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="group/code relative my-3 overflow-hidden rounded-xl border border-white/10">
      {/* Language label + copy */}
      <div className="flex items-center justify-between border-b border-white/10 bg-surface-800/80 px-4 py-2">
        <span className="font-mono text-[10px] uppercase tracking-widest text-gray-500">
          {className?.replace('language-', '') || 'code'}
        </span>
        <button
          onClick={copyCode}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-green-400" />
              <span className="text-green-400">Copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              Copy
            </>
          )}
        </button>
      </div>
      {/* Code */}
      <pre className="overflow-x-auto bg-surface-900/60 p-4 text-sm leading-relaxed">
        <code className={className} {...props}>
          {children}
        </code>
      </pre>
    </div>
  );
}

// ── Markdown component map ────────────────────────────────────
const mdComponents = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  code: CodeBlock as any,
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>
  ),
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1 className="mb-3 mt-4 text-xl font-bold text-white">{children}</h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 className="mb-2 mt-4 text-lg font-semibold text-white">{children}</h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="mb-2 mt-3 text-base font-semibold text-gray-100">{children}</h3>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="mb-3 ml-4 list-disc space-y-1 text-gray-200">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="mb-3 ml-4 list-decimal space-y-1 text-gray-200">{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="leading-relaxed">{children}</li>
  ),
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="my-3 border-l-2 border-brand-500/50 pl-4 italic text-gray-400">
      {children}
    </blockquote>
  ),
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-brand-400 underline underline-offset-2 hover:text-brand-300"
    >
      {children}
    </a>
  ),
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="my-3 overflow-x-auto rounded-xl border border-white/10">
      <table className="w-full text-sm">{children}</table>
    </div>
  ),
  th: ({ children }: { children?: React.ReactNode }) => (
    <th className="border-b border-white/10 bg-surface-800/60 px-4 py-2 text-left font-semibold text-white">
      {children}
    </th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td className="border-b border-white/5 px-4 py-2 text-gray-300">{children}</td>
  ),
  hr: () => <hr className="my-4 border-white/10" />,
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold text-white">{children}</strong>
  ),
  em: ({ children }: { children?: React.ReactNode }) => (
    <em className="italic text-gray-300">{children}</em>
  ),
};

// ── Main bubble ───────────────────────────────────────────────
function MessageBubbleInner({ message }: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'USER';

  async function copyText() {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className={clsx('group flex gap-3', isUser ? 'flex-row-reverse' : 'flex-row')}>
      {/* Avatar */}
      <div
        className={clsx(
          'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl',
          isUser
            ? 'bg-brand-gradient shadow-sm shadow-brand-500/20'
            : 'bg-surface-600 border border-white/10',
        )}
      >
        {isUser ? (
          <User className="h-4 w-4 text-white" />
        ) : (
          <Bot className="h-4 w-4 text-brand-400" />
        )}
      </div>

      {/* Bubble */}
      <div className={clsx('flex max-w-[75%] flex-col gap-1', isUser ? 'items-end' : 'items-start')}>

        {/* Transformation result → before/after comparison */}
        {message.imageUrl && message.originalImageUrl ? (
          <BeforeAfterSlider
            beforeUrl={message.originalImageUrl}
            afterUrl={message.imageUrl}
          />
        ) : (
          /* Plain image attachment */
          message.imageUrl && (
            <div className="mb-1 overflow-hidden rounded-xl border border-white/10">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={message.imageUrl}
                alt="Attached"
                className="max-h-48 max-w-xs object-cover"
              />
            </div>
          )
        )}

        {/* Video attachment */}
        {message.videoUrl && (
          <div className="mb-1 overflow-hidden rounded-xl border border-white/10">
            <video
              src={message.videoUrl}
              controls
              className="max-h-48 max-w-xs rounded-xl"
            />
          </div>
        )}

        {/* Text bubble */}
        <div
          className={clsx(
            'relative rounded-2xl px-4 py-3 text-sm',
            isUser
              ? 'bg-brand-500/20 border border-brand-500/20 text-white rounded-tr-sm'
              : 'bg-surface-700/80 border border-white/5 text-gray-200 rounded-tl-sm',
          )}
        >
          {isUser ? (
            // User messages: plain text, no markdown needed
            <p className="whitespace-pre-wrap break-words leading-relaxed">
              {message.content}
            </p>
          ) : (
            // Assistant messages: full markdown
            <div className="prose-sm min-w-0 break-words">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlight]}
                components={mdComponents}
              >
                {message.content}
              </ReactMarkdown>

              {/* Blinking cursor while streaming */}
              {message.streaming && (
                <span className="ml-0.5 inline-block h-[1em] w-0.5 translate-y-[2px] animate-pulse rounded-sm bg-brand-400" />
              )}
            </div>
          )}

          {/* Copy button — assistant only, non-streaming */}
          {!isUser && !message.streaming && message.content && (
            <button
              onClick={copyText}
              className="absolute -right-2 -top-2 hidden h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-surface-800 text-gray-400 hover:text-white transition-colors group-hover:flex"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-green-400" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
          )}
        </div>

        {/* Meta: provider + tokens */}
        {/* {!isUser && message.provider && !message.streaming && (
          <div className="flex items-center gap-2 px-1">
            <span className="text-[10px] text-gray-600">{message.provider}</span>
            {message.tokensUsed && (
              <span className="text-[10px] text-gray-600">· {message.tokensUsed} tokens</span>
            )}
          </div>
        )} */}
      </div>
    </div>
  );
}

function messagePropsEqual(
  prev: MessageBubbleProps,
  next: MessageBubbleProps,
): boolean {
  const a = prev.message;
  const b = next.message;
  return (
    a.id === b.id &&
    a.role === b.role &&
    a.content === b.content &&
    a.streaming === b.streaming &&
    a.imageUrl === b.imageUrl &&
    a.originalImageUrl === b.originalImageUrl &&
    a.videoUrl === b.videoUrl
  );
}

export const MessageBubble = memo(MessageBubbleInner, messagePropsEqual);