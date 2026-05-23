"use client";

import { X, Image as ImageIcon, Video } from "lucide-react";

interface FilePreviewProps {
  file: File;
  previewUrl: string;
  onRemove: () => void;
  uploading?: boolean;
  progress?: number;
  retryAttempt?: number;
}

export function FilePreview({
  file,
  previewUrl,
  onRemove,
  uploading,
  progress = 0,
  retryAttempt = 0,
}: FilePreviewProps) {
  const isVideo = file.type.startsWith("video/");

  return (
    <div className="relative inline-block rounded-xl border border-white/10 bg-surface-700/50 overflow-hidden">
      {/* Preview */}
      {isVideo ? (
        <div className="flex h-20 w-28 items-center justify-center gap-2 p-3">
          <Video className="h-6 w-6 text-brand-400 flex-shrink-0" />
          <p className="text-xs text-gray-400 truncate">{file.name}</p>
        </div>
      ) : (
        <img
          src={previewUrl}
          alt="Preview"
          className="h-20 w-28 object-cover"
        />
      )}

      {/* Upload overlay — shows progress bar or retry state */}
      {uploading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/60 px-3">
          {retryAttempt > 0 ? (
            <>
              <span className="text-[10px] text-yellow-400 font-medium">
                🔄 Retrying ({retryAttempt}/3)
              </span>
              <div className="h-1 w-full rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-yellow-400 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </>
          ) : (
            <>
              <span className="text-[10px] text-gray-300">{progress}%</span>
              <div className="h-1 w-full rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-brand-400 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </>
          )}
        </div>
      )}

      {/* Remove button — hidden while uploading */}
      {!uploading && (
        <button
          onClick={onRemove}
          className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white hover:bg-red-500/80 transition-colors"
        >
          <X className="h-3 w-3" />
        </button>
      )}

      {/* File type badge */}
      <div className="absolute bottom-1 left-1 flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5">
        {isVideo ? (
          <Video className="h-3 w-3 text-brand-400" />
        ) : (
          <ImageIcon className="h-3 w-3 text-brand-400" />
        )}
        <span className="text-[10px] text-gray-300">
          {isVideo ? "Video" : "Image"}
        </span>
      </div>
    </div>
  );
}
