"use client";

import { useState } from "react";
import {
  Download,
  Share2,
  Maximize2,
  X,
  ClipboardCopy,
  Check,
  RotateCcw,
  Sparkles,
  Wand2,
  Copy,
  Star,
} from "lucide-react";
import { clsx } from "clsx";
import toast from "react-hot-toast";
import { ProgressiveImage } from "@/components/chat/ProgressiveImage";

interface GeneratedImageProps {
  url: string;
  /** Original prompt — enables Copy prompt / Regenerate / Variations. */
  prompt?: string;
  /** Engineered prompt actually sent to the model — Copy revised prompt. */
  revisedPrompt?: string;
  /** Re-run the same prompt. */
  onRegenerate?: (prompt: string) => void;
  /** Create a fresh, direction-varied variation from the prompt. */
  onVariations?: (prompt: string) => void;
  /** Load this image into the composer to edit it. */
  onEdit?: (url: string) => void;
  /** Duplicate — create another instance from the same prompt. */
  onDuplicate?: (prompt: string) => void;
}

/**
 * Display for a freshly generated image — the final image shown directly (no
 * before/after slider) with a full creative action bar: Download, Share, Zoom,
 * Copy prompt, Regenerate, Variations and Edit. Used for assistant-generated
 * images that have no source/original image.
 */
export function GeneratedImage({
  url,
  prompt,
  revisedPrompt,
  onRegenerate,
  onVariations,
  onEdit,
  onDuplicate,
}: GeneratedImageProps) {
  const [zoomed, setZoomed] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);
  const [revisedCopied, setRevisedCopied] = useState(false);
  const [favorite, setFavorite] = useState(false);

  async function copyPrompt() {
    if (!prompt) return;
    try {
      await navigator.clipboard.writeText(prompt);
      setPromptCopied(true);
      setTimeout(() => setPromptCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy prompt");
    }
  }

  async function copyRevisedPrompt() {
    if (!revisedPrompt) return;
    try {
      await navigator.clipboard.writeText(revisedPrompt);
      setRevisedCopied(true);
      setTimeout(() => setRevisedCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy revised prompt");
    }
  }

  function toggleFavorite() {
    setFavorite((f) => {
      const next = !f;
      toast.success(next ? "Added to favorites" : "Removed from favorites");
      return next;
    });
  }

  async function download() {
    try {
      const res = await fetch(url, { mode: "cors" });
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `aicruzz-image-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(href);
    } catch {
      // Cross-origin fetch blocked → open in a new tab as a fallback.
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }

  async function share() {
    // Prefer the native share sheet (mobile + supported desktop browsers).
    try {
      if (navigator.share) {
        try {
          const res = await fetch(url, { mode: "cors" });
          const blob = await res.blob();
          const file = new File([blob], `aicruzz-image-${Date.now()}.png`, {
            type: blob.type || "image/png",
          });
          // Share the file itself when the platform allows it.
          if (
            navigator.canShare?.({ files: [file] }) !== false
          ) {
            await navigator.share({ files: [file], title: "AiCruzz image" });
            return;
          }
        } catch {
          /* fall through to URL share */
        }
        await navigator.share({ title: "AiCruzz image", url });
        return;
      }
    } catch {
      /* user cancelled or share failed — fall through to copy */
    }

    // Fallback: copy the image link.
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Image link copied");
    } catch {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <div className="mb-1 w-full max-w-md">
      <ProgressiveImage
        src={url}
        alt="Generated"
        onClick={() => setZoomed(true)}
        className="rounded-xl border border-white/10 bg-surface-900/40"
        imgClassName="block h-auto max-h-[60vh] w-full cursor-zoom-in object-contain"
      />

      {/* Actions */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <GenAction icon={<Download className="h-3 w-3" />} label="Download" onClick={download} />
        <GenAction icon={<Share2 className="h-3 w-3" />} label="Share" onClick={share} />
        <GenAction icon={<Maximize2 className="h-3 w-3" />} label="Zoom" onClick={() => setZoomed(true)} />
        {prompt && onRegenerate && (
          <GenAction
            icon={<RotateCcw className="h-3 w-3" />}
            label="Regenerate"
            onClick={() => onRegenerate(prompt)}
          />
        )}
        {prompt && onVariations && (
          <GenAction
            icon={<Sparkles className="h-3 w-3" />}
            label="Variations"
            onClick={() => onVariations(prompt)}
          />
        )}
        {onEdit && (
          <GenAction
            icon={<Wand2 className="h-3 w-3" />}
            label="Edit"
            onClick={() => onEdit(url)}
          />
        )}
        {prompt && onDuplicate && (
          <GenAction
            icon={<Copy className="h-3 w-3" />}
            label="Duplicate"
            onClick={() => onDuplicate(prompt)}
          />
        )}
        {prompt && (
          <GenAction
            icon={
              promptCopied ? (
                <Check className="h-3 w-3 text-green-400" />
              ) : (
                <ClipboardCopy className="h-3 w-3" />
              )
            }
            label={promptCopied ? "Copied" : "Copy prompt"}
            onClick={copyPrompt}
          />
        )}
        {revisedPrompt && (
          <GenAction
            icon={
              revisedCopied ? (
                <Check className="h-3 w-3 text-green-400" />
              ) : (
                <ClipboardCopy className="h-3 w-3" />
              )
            }
            label={revisedCopied ? "Copied" : "Copy revised"}
            onClick={copyRevisedPrompt}
          />
        )}
        <GenAction
          icon={
            <Star
              className={clsx(
                "h-3 w-3",
                favorite && "fill-yellow-400 text-yellow-400",
              )}
            />
          }
          label={favorite ? "Favorited" : "Favorite"}
          onClick={toggleFavorite}
        />
      </div>

      {/* Zoom modal */}
      {zoomed && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6 backdrop-blur-sm"
          onClick={() => setZoomed(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt="Generated"
            onClick={(e) => e.stopPropagation()}
            className="max-h-[85vh] max-w-[90vw] rounded-xl object-contain"
          />
          <button
            onClick={() => setZoomed(false)}
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-surface-800 text-gray-300 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

// Compact action chip used in the generated-image action bar.
function GenAction({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1",
        "text-[11px] text-gray-300 transition-colors hover:border-brand-500/40 hover:text-brand-300",
      )}
    >
      {icon} {label}
    </button>
  );
}
