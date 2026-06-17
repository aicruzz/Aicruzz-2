'use client';

import { clsx } from 'clsx';
import {
  Bot,
  User,
  Copy,
  Check,
  RotateCcw,
  Pencil,
  RefreshCw,
} from 'lucide-react';
import { memo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';
import { BeforeAfterSlider } from '@/components/chat/BeforeAfterSlider';
import { GeneratedImage } from '@/components/chat/GeneratedImage';
import { ProgressiveImage } from '@/components/chat/ProgressiveImage';
import { ImageGenerationLoader } from '@/components/chat/ImageGenerationLoader';

export interface Message {
  id: string;
  role: 'USER' | 'ASSISTANT' | 'SYSTEM';
  content: string;
  imageUrl?: string | null;
  /** All attached images (user uploads), in order. Supersedes imageUrl when set. */
  imageUrls?: string[] | null;
  /** Source image for a transformation result — enables the before/after view. */
  originalImageUrl?: string | null;
  videoUrl?: string | null;
  provider?: string | null;
  tokensUsed?: number | null;
  createdAt: string | Date;
  streaming?: boolean;
  /** True while an image-generation/edit turn is rendering (shows a skeleton). */
  generatingImage?: boolean;
  /** Operation hint (ui/faceswap/background/…) for operation-aware loader phases. */
  imageOp?: string;
  /** True when the turn failed — shows an inline error + Retry affordance. */
  error?: boolean;
  /** Original prompt for a generated image — powers Copy prompt / Regenerate. */
  prompt?: string | null;
  /** Engineered prompt sent to the model — powers Copy revised prompt. */
  revisedPrompt?: string | null;
}

interface MessageBubbleProps {
  message: Message;
  /** True for the most recent message — enables Regenerate on the assistant. */
  isLast?: boolean;
  /** Regenerate this assistant response (only wired for the last message). */
  onRegenerate?: () => void;
  /** Retry after a failed turn. */
  onRetry?: () => void;
  /** Submit an edited user message (truncates the thread and resends). */
  onEditSubmit?: (id: string, content: string) => void;
  /** Re-run a generated image with the same prompt. */
  onImageRegenerate?: (prompt: string) => void;
  /** Create a fresh variation from a generated image's prompt. */
  onImageVariations?: (prompt: string) => void;
  /** Load a generated image into the composer for editing. */
  onImageEdit?: (url: string) => void;
  /** Duplicate a generated image (re-run the same prompt as a fresh copy). */
  onImageDuplicate?: (prompt: string) => void;
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
function MessageBubbleInner({
  message,
  isLast = false,
  onRegenerate,
  onRetry,
  onEditSubmit,
  onImageRegenerate,
  onImageVariations,
  onImageEdit,
  onImageDuplicate,
}: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const isUser = message.role === 'USER';

  // Image-area rendering mode (mutually exclusive, in precedence order).
  const isSkeleton = !!message.streaming && !!message.generatingImage;
  const isEdit = !!(message.imageUrl && message.originalImageUrl);
  const isGenerated =
    !isUser && !!message.imageUrl && !message.originalImageUrl;
  const userImages: string[] = isUser
    ? message.imageUrls?.length
      ? message.imageUrls
      : message.imageUrl
        ? [message.imageUrl]
        : []
    : [];

  // Suppress the text bubble for image skeletons and for empty image-only
  // turns (e.g. a generated image has no text content). Text turns still show
  // the bubble + streaming cursor.
  const showTextBubble =
    !isSkeleton &&
    (isUser
      ? message.content.trim().length > 0
      : message.streaming
        ? !message.generatingImage
        : message.content.trim().length > 0);

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

        {isSkeleton ? (
          /* Image-generation in progress → premium AiCruzz loading card
             (never a text typing indicator). */
          <ImageGenerationLoader op={message.imageOp} />
        ) : isEdit ? (
          /* Transformation result → before/after comparison */
          <BeforeAfterSlider
            beforeUrl={message.originalImageUrl!}
            afterUrl={message.imageUrl!}
          />
        ) : isGenerated ? (
          /* Newly generated image → direct display + actions */
          <GeneratedImage
            url={message.imageUrl!}
            prompt={message.prompt ?? undefined}
            revisedPrompt={message.revisedPrompt ?? undefined}
            onRegenerate={onImageRegenerate}
            onVariations={onImageVariations}
            onEdit={onImageEdit}
            onDuplicate={onImageDuplicate}
          />
        ) : userImages.length > 0 ? (
          /* User-attached image(s) → ordered responsive grid (1–4) */
          <div
            className={clsx(
              'mb-1 grid gap-1.5',
              userImages.length === 1 ? 'grid-cols-1' : 'grid-cols-2',
            )}
          >
            {userImages.map((src, i) => (
              <ProgressiveImage
                key={i}
                src={src}
                alt={`Attached ${i + 1}`}
                className="rounded-xl border border-white/10"
                imgClassName="h-32 w-full object-cover"
              />
            ))}
          </div>
        ) : null}

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

        {/* Inline editor for a user message (truncates + resends on save). */}
        {isUser && editing ? (
          <div className="w-full min-w-[16rem] rounded-2xl rounded-tr-sm border border-brand-500/30 bg-surface-800/80 p-2">
            <textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (draft.trim()) onEditSubmit?.(message.id, draft.trim());
                  setEditing(false);
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setEditing(false);
                  setDraft(message.content);
                }
              }}
              rows={Math.min(8, Math.max(2, draft.split('\n').length))}
              className="w-full resize-none rounded-xl bg-transparent px-2 py-1.5 text-sm text-white focus:outline-none"
            />
            <div className="mt-1 flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  setEditing(false);
                  setDraft(message.content);
                }}
                className="rounded-lg px-2.5 py-1 text-xs text-gray-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (draft.trim()) onEditSubmit?.(message.id, draft.trim());
                  setEditing(false);
                }}
                disabled={!draft.trim()}
                className="rounded-lg bg-brand-gradient px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
              >
                Send
              </button>
            </div>
          </div>
        ) : (
          showTextBubble && (
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
            </div>
          )
        )}

        {/* Error + retry */}
        {message.error && !message.streaming && (
          <div className="flex items-center gap-2 text-xs text-red-300/90">
            <span>Something went wrong.</span>
            {onRetry && (
              <button
                onClick={onRetry}
                className="inline-flex items-center gap-1 rounded-md border border-red-400/30 px-2 py-0.5 text-red-200 transition-colors hover:bg-red-400/10"
              >
                <RefreshCw className="h-3 w-3" /> Retry
              </button>
            )}
          </div>
        )}

        {/* Action row — appears on hover; persists for the last message. */}
        {!message.streaming && !editing && (
          <div
            className={clsx(
              'flex items-center gap-1 px-1 transition-opacity',
              isLast ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
              isUser ? 'justify-end' : 'justify-start',
            )}
          >
            {/* Assistant: copy + regenerate */}
            {!isUser && message.content && (
              <ActionButton
                label={copied ? 'Copied' : 'Copy'}
                onClick={copyText}
                icon={
                  copied ? (
                    <Check className="h-3.5 w-3.5 text-green-400" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )
                }
              />
            )}
            {!isUser && isLast && onRegenerate && (
              <ActionButton
                label="Regenerate"
                onClick={onRegenerate}
                icon={<RotateCcw className="h-3.5 w-3.5" />}
              />
            )}
            {/* User: edit (only when there's text to edit) */}
            {isUser && onEditSubmit && message.content.trim() && (
              <ActionButton
                label="Edit"
                onClick={() => {
                  setDraft(message.content);
                  setEditing(true);
                }}
                icon={<Pencil className="h-3.5 w-3.5" />}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Small ghost action button used in the per-message action row.
function ActionButton({
  label,
  onClick,
  icon,
}: {
  label: string;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-[11px] text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
    >
      {icon}
    </button>
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
    a.generatingImage === b.generatingImage &&
    a.imageOp === b.imageOp &&
    a.error === b.error &&
    a.prompt === b.prompt &&
    a.revisedPrompt === b.revisedPrompt &&
    a.imageUrl === b.imageUrl &&
    (a.imageUrls?.join("|") ?? "") === (b.imageUrls?.join("|") ?? "") &&
    a.originalImageUrl === b.originalImageUrl &&
    a.videoUrl === b.videoUrl &&
    prev.isLast === next.isLast &&
    prev.onRegenerate === next.onRegenerate &&
    prev.onRetry === next.onRetry &&
    prev.onEditSubmit === next.onEditSubmit &&
    prev.onImageRegenerate === next.onImageRegenerate &&
    prev.onImageVariations === next.onImageVariations &&
    prev.onImageEdit === next.onImageEdit &&
    prev.onImageDuplicate === next.onImageDuplicate
  );
}

export const MessageBubble = memo(MessageBubbleInner, messagePropsEqual);