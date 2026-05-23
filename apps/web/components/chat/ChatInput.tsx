"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Send, Paperclip } from "lucide-react";
import { clsx } from "clsx";
import toast from "react-hot-toast";
import { FilePreview } from "@/components/chat/FilePreview";

interface AttachedFile {
  file: File;
  previewUrl: string;
  uploadedUrl?: string;
  uploading: boolean;
  progress: number;
}

interface ChatInputProps {
  onSend: (
    content: string,
    imageUrl?: string,
    videoUrl?: string,
    editQuality?: "FAST" | "PRO",
  ) => void;
  disabled?: boolean;
  placeholder?: string;
  /** When set, replaces composer text and focuses (e.g. starter prompts). */
  composerInject?: { key: number; text: string } | null;
  onComposerInjectConsumed?: () => void;
}

// Uploads the file to our API (which stores it on Cloudinary) in a single
// multipart request, reporting progress, and returns the public file URL.
function uploadChatFile(
  file: File,
  onProgress: (pct: number) => void,
): Promise<{ fileUrl: string }> {
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);

    const xhr = new XMLHttpRequest();
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });
    xhr.addEventListener("load", () => {
      let json: { data?: { fileUrl: string }; message?: string } = {};
      try {
        json = JSON.parse(xhr.responseText);
      } catch {
        /* non-JSON error body */
      }
      if (xhr.status >= 200 && xhr.status < 300 && json.data?.fileUrl) {
        resolve({ fileUrl: json.data.fileUrl });
      } else {
        reject(new Error(json.message ?? `Upload failed (${xhr.status})`));
      }
    });
    xhr.addEventListener("error", () =>
      reject(new Error("Network error during upload")),
    );
    xhr.addEventListener("abort", () => reject(new Error("Upload aborted")));

    xhr.open("POST", `${apiBase}/api/chat/upload`);
    xhr.withCredentials = true;
    xhr.send(form);
  });
}

export const CHAT_COMPOSER_TEXTAREA_ID = "aicruzz-chat-composer";

export function ChatInput({
  onSend,
  disabled = false,
  placeholder,
  composerInject,
  onComposerInjectConsumed,
}: ChatInputProps) {
  const [text, setText] = useState("");
  const [attachment, setAttachment] = useState<AttachedFile | null>(null);
  const [editQuality, setEditQuality] = useState<"FAST" | "PRO">("FAST");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isVideo = attachment?.file.type.startsWith("video/");
  const canSend =
    (text.trim().length > 0 || !!attachment?.uploadedUrl) &&
    !disabled &&
    !attachment?.uploading;

  useEffect(() => {
    if (!composerInject) return;
    setText(composerInject.text);
    onComposerInjectConsumed?.();
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      ta.focus();
      ta.style.height = "auto";
      ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
    });
  }, [composerInject, onComposerInjectConsumed]);

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setText(e.target.value);
    const ta = e.target;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }

  function removeAttachment() {
    setAttachment((prev) => {
      if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
  }

  const handleSend = useCallback(() => {
    if (!canSend) return;
    onSend(
      text.trim(),
      isVideo ? undefined : attachment?.uploadedUrl,
      isVideo ? attachment?.uploadedUrl : undefined,
      editQuality,
    );
    setText("");
    setAttachment(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [canSend, text, attachment, isVideo, editQuality, onSend]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape") {
      if (attachment) {
        e.preventDefault();
        removeAttachment();
      }
      return;
    }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const maxSize = file.type.startsWith("video/")
      ? 100 * 1024 * 1024
      : 20 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error(
        `File too large. Max: ${file.type.startsWith("video/") ? "100 MB" : "20 MB"}`,
      );
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setAttachment({ file, previewUrl, uploading: true, progress: 0 });

    try {
      const { fileUrl } = await uploadChatFile(file, (pct) =>
        setAttachment((prev) => (prev ? { ...prev, progress: pct } : null)),
      );

      setAttachment((prev) =>
        prev
          ? { ...prev, uploadedUrl: fileUrl, uploading: false, progress: 100 }
          : null,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
      setAttachment(null);
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="border-t border-white/5 bg-surface-900/80 backdrop-blur-sm px-4 py-4">
      {/* ── Attachment preview ── */}
      {attachment && (
        <div className="mb-3">
          <FilePreview
            file={attachment.file}
            previewUrl={attachment.previewUrl}
            uploading={attachment.uploading}
            progress={attachment.progress}
            onRemove={removeAttachment}
          />
        </div>
      )}

      {/* ── Edit quality (only when an image is attached) ── */}
      {attachment && !isVideo && (
        <div className="mb-3 flex items-center gap-2">
          <span className="text-[11px] text-gray-500">Edit quality:</span>
          {(["FAST", "PRO"] as const).map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => setEditQuality(q)}
              className={clsx(
                "rounded-lg border px-3 py-1 text-[11px] transition-colors",
                editQuality === q
                  ? "border-brand-500/60 bg-brand-500/10 text-brand-300"
                  : "border-white/10 text-gray-400 hover:border-white/25",
              )}
            >
              {q === "FAST" ? "Fast" : "Pro · HD + upscale"}
            </button>
          ))}
        </div>
      )}

      {/* ── Input row ── */}
      <div className="flex items-end gap-3">
        {/* Upload button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || !!attachment}
          className={clsx(
            "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border transition-all",
            attachment
              ? "border-brand-500/30 bg-brand-500/10 text-brand-400 cursor-not-allowed"
              : "border-white/10 bg-surface-700/60 text-gray-400 hover:border-brand-500/30 hover:text-brand-400",
          )}
          title="Attach image or video"
        >
          <Paperclip className="h-4 w-4" />
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm"
          className="hidden"
          onChange={handleFileSelect}
        />

        {/* Textarea */}
        <div className="relative flex-1">
          <textarea
            id={CHAT_COMPOSER_TEXTAREA_ID}
            ref={textareaRef}
            value={text}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder={
              placeholder ??
              "Message AiCruzz AI… (Enter send · Shift+Enter newline · ⌘↵ send)"
            }
            rows={1}
            className={clsx(
              "w-full resize-none rounded-xl border border-white/10 bg-surface-700/60 px-4 py-3 pr-12",
              "text-sm text-white placeholder-gray-500 backdrop-blur-sm",
              "focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500/30",
              "transition-all duration-200 scrollbar-thin",
              disabled && "cursor-not-allowed opacity-50",
            )}
            style={{ maxHeight: "200px", overflowY: "auto" }}
          />
        </div>

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={!canSend}
          className={clsx(
            "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl transition-all",
            canSend
              ? "bg-brand-gradient text-white shadow-lg shadow-brand-500/20 hover:opacity-90"
              : "bg-surface-700 text-gray-600 cursor-not-allowed",
          )}
        >
          <Send className="h-4 w-4" />
        </button>
      </div>

      <p className="mt-2 text-center text-[10px] text-gray-600">
        Tip: be specific — describe the subject, action, setting, style, and
        lighting for the best results.
      </p>
      <p className="mt-1 text-center text-[10px] text-gray-600">
        2 credits/message · 5 credits/generated image · AI may make mistakes
      </p>
    </div>
  );
}
