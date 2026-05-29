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
  composerInject?: { key: number; text: string } | null;
  onComposerInjectConsumed?: () => void;
}

// Upload function stays EXACTLY same
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
      } catch { }

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

  // 🔥 CHANGED: single → multiple attachments
  const [attachments, setAttachments] = useState<AttachedFile[]>([]);

  const [editQuality, setEditQuality] = useState<"FAST" | "PRO">("FAST");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isVideo = attachments[0]?.file.type.startsWith("video/");

  // 🔥 UPDATED: supports multiple attachments
  const canSend =
    (text.trim().length > 0 || attachments.length > 0) &&
    !disabled &&
    !attachments.some((a) => a.uploading);

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

  // 🔥 UPDATED: remove one attachment
  function removeAttachment(index: number) {
    setAttachments((prev) => {
      const item = prev[index];
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  }

  const handleSend = useCallback(() => {
    if (!canSend) return;

    const imageUrl = attachments.find((a) =>
      a.file.type.startsWith("image/"),
    )?.uploadedUrl;

    const videoUrl = attachments.find((a) =>
      a.file.type.startsWith("video/"),
    )?.uploadedUrl;

    onSend(text.trim(), imageUrl, videoUrl, editQuality);

    setText("");
    setAttachments([]);

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [canSend, text, attachments, editQuality, onSend]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape") {
      if (attachments.length > 0) {
        e.preventDefault();
        setAttachments([]);
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

  // 🔥 UPDATED ONLY: multi-file support (max 4)
  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []).slice(0, 4);
    if (!files.length) return;

    const mapped: AttachedFile[] = files.map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
      uploading: true,
      progress: 0,
    }));

    setAttachments(mapped);

    try {
      const results = await Promise.all(
        mapped.map((item, index) =>
          uploadChatFile(item.file, (pct) => {
            setAttachments((prev) => {
              const copy = [...prev];
              if (copy[index]) {
                copy[index] = {
                  ...copy[index],
                  progress: pct,
                };
              }
              return copy;
            });
          }),
        ),
      );

      setAttachments((prev) =>
        prev.map((item, i) => ({
          ...item,
          uploadedUrl: results[i].fileUrl,
          uploading: false,
          progress: 100,
        })),
      );
    } catch (err) {
      toast.error("Upload failed");
      setAttachments([]);
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="border-t border-white/5 bg-surface-900/80 backdrop-blur-sm px-4 py-4">
      {/* ── Attachment preview ── */}
      {attachments.length > 0 && (
        <div className="mb-3">
          {attachments.map((attachment, i) => (
            <FilePreview
              key={i}
              file={attachment.file}
              previewUrl={attachment.previewUrl}
              uploading={attachment.uploading}
              progress={attachment.progress}
              onRemove={() => removeAttachment(i)}
            />
          ))}
        </div>
      )}

      {/* ── Edit quality ── */}
      {attachments.length > 0 && !isVideo && (
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
          disabled={disabled || attachments.length >= 4}
          className={clsx(
            "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border transition-all",
            attachments.length >= 4
              ? "border-brand-500/30 bg-brand-500/10 text-brand-400 cursor-not-allowed"
              : "border-white/10 bg-surface-700/60 text-gray-400 hover:border-brand-500/30 hover:text-brand-400",
          )}
          title="Attach image or video (max 4)"
        >
          <Paperclip className="h-4 w-4" />
        </button>

        <input
          ref={fileInputRef}
          type="file"
          multiple
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
        Tip: be specific — describe the subject, action, setting, style, and lighting for the best results.
      </p>
      <p className="mt-1 text-center text-[10px] text-gray-600">
        2 credits/message · 5 credits/generated image · AI may make mistakes
      </p>
    </div>
  );
}