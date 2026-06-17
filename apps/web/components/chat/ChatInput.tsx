"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Send, Paperclip, Square } from "lucide-react";
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
    imageUrls?: string[],
  ) => void;
  disabled?: boolean;
  placeholder?: string;
  composerInject?: { key: number; text: string } | null;
  onComposerInjectConsumed?: () => void;
  /** Inject an already-uploaded image as an attachment (e.g. "Edit image"). */
  attachInject?: { key: number; url: string; name?: string } | null;
  /** When true, the send button becomes a Stop button wired to onStop. */
  isStreaming?: boolean;
  onStop?: () => void;
}

// Upload helper (unchanged)
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
  attachInject,
  isStreaming = false,
  onStop,
}: ChatInputProps) {
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<AttachedFile[]>([]);
  const [editQuality, setEditQuality] = useState<"FAST" | "PRO">("FAST");

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isVideo = attachments[0]?.file.type.startsWith("video/");

  const canSend =
    (text.trim().length > 0 || attachments.some((a) => a.uploadedUrl)) &&
    !disabled &&
    !isStreaming &&
    !attachments.some((a) => a.uploading);

  useEffect(() => {
    if (!composerInject) return;
    setText(composerInject.text);
    onComposerInjectConsumed?.();
  }, [composerInject, onComposerInjectConsumed]);

  // Inject an already-uploaded image (e.g. "Edit image" on a generated result)
  // as a ready attachment. Deduped by key so it only runs once per request.
  const lastAttachKeyRef = useRef<number | null>(null);
  useEffect(() => {
    if (!attachInject) return;
    if (lastAttachKeyRef.current === attachInject.key) return;
    lastAttachKeyRef.current = attachInject.key;
    setAttachments((prev) => {
      if (prev.length >= 4) return prev;
      if (prev.some((a) => a.uploadedUrl === attachInject.url)) return prev;
      return [
        ...prev,
        {
          file: new File([], attachInject.name ?? "image.png", {
            type: "image/png",
          }),
          previewUrl: attachInject.url,
          uploadedUrl: attachInject.url,
          uploading: false,
          progress: 100,
        },
      ];
    });
  }, [attachInject]);

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setText(e.target.value);
    const ta = e.target;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }

  function removeAttachment(index: number) {
    setAttachments((prev) => {
      const copy = [...prev];
      const removed = copy[index];
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      copy.splice(index, 1);
      return copy;
    });
  }

  const handleSend = useCallback(() => {
    if (!canSend) return;

    // Collect ALL uploaded image URLs in selection order (not just the first).
    const imageUrls = attachments
      .filter((a) => !a.file.type.startsWith("video/") && a.uploadedUrl)
      .map((a) => a.uploadedUrl as string);
    const video = attachments.find((a) => a.file.type.startsWith("video/"))?.uploadedUrl;

    onSend(text.trim(), imageUrls[0], video, editQuality, imageUrls);

    setText("");
    setAttachments([]);

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [canSend, text, attachments, editQuality, onSend]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends; Shift+Enter inserts a newline. Cmd/Ctrl+Enter also sends.
    // Guard against IME composition so it never sends mid-composition.
    const composing =
      e.nativeEvent.isComposing || (e.nativeEvent as { keyCode?: number }).keyCode === 229;
    if (e.key === "Enter" && !e.shiftKey && !composing) {
      e.preventDefault();
      handleSend();
      return;
    }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
      return;
    }
    // Escape clears pending attachments (matches documented shortcuts).
    if (e.key === "Escape" && attachments.length > 0) {
      e.preventDefault();
      setAttachments((prev) => {
        prev.forEach((a) => a.previewUrl && URL.revokeObjectURL(a.previewUrl));
        return [];
      });
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);

    if (!files.length) return;

    if (attachments.length + files.length > 4) {
      toast.error("Maximum 4 files allowed");
      return;
    }

    const newFiles: AttachedFile[] = files.map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
      uploading: true,
      progress: 0,
    }));

    setAttachments((prev) => [...prev, ...newFiles]);

    newFiles.forEach(async (fileObj, indexOffset) => {
      const index = attachments.length + indexOffset;

      try {
        const { fileUrl } = await uploadChatFile(
          fileObj.file,
          (pct) =>
            setAttachments((prev) => {
              const copy = [...prev];
              if (copy[index]) {
                copy[index].progress = pct;
              }
              return copy;
            }),
        );

        setAttachments((prev) => {
          const copy = [...prev];
          if (copy[index]) {
            copy[index].uploadedUrl = fileUrl;
            copy[index].uploading = false;
            copy[index].progress = 100;
          }
          return copy;
        });
      } catch (err) {
        toast.error("Upload failed");
        setAttachments((prev) => prev.filter((_, i) => i !== index));
      }
    });

    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="border-t border-white/5 bg-surface-900/80 backdrop-blur-sm px-4 py-4">
      {/* Attachments */}
      {attachments.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {attachments.map((att, i) => (
            <FilePreview
              key={i}
              file={att.file}
              previewUrl={att.previewUrl}
              uploading={att.uploading}
              progress={att.progress}
              onRemove={() => removeAttachment(i)}
            />
          ))}
        </div>
      )}

      {/* Upload button */}
      <div className="flex items-end gap-3">
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || attachments.length >= 4}
          className={clsx(
            "flex h-10 w-10 items-center justify-center rounded-xl border transition-all",
            attachments.length >= 4
              ? "cursor-not-allowed opacity-40"
              : "border-white/10 bg-surface-700/60 text-gray-400 hover:text-brand-400",
          )}
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

        {/* Text input */}
        <div className="relative flex-1">
          <textarea
            ref={textareaRef}
            id={CHAT_COMPOSER_TEXTAREA_ID}
            value={text}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder={placeholder ?? "Message AiCruzz AI…"}
            rows={1}
            className="w-full resize-none rounded-xl border border-white/10 bg-surface-700/60 px-4 py-3 text-sm text-white"
            style={{ maxHeight: "200px" }}
          />
        </div>

        {/* Send / Stop — while streaming the action becomes Stop. */}
        {isStreaming && onStop ? (
          <button
            onClick={onStop}
            aria-label="Stop generating"
            title="Stop generating"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-surface-700 text-gray-200 transition-colors hover:border-brand-500/40 hover:text-white"
          >
            <Square className="h-3.5 w-3.5 fill-current" />
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!canSend}
            aria-label="Send message"
            className={clsx(
              "flex h-10 w-10 items-center justify-center rounded-xl",
              canSend
                ? "bg-brand-gradient text-white"
                : "bg-surface-700 text-gray-600",
            )}
          >
            <Send className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}