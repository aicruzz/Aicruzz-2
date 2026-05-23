'use client';

import { useRef, useState, type ReactNode } from 'react';
import { UploadCloud, X, FileCheck2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Spinner } from './Primitives';

export interface UploadedFile {
  file: File;
  previewUrl: string;
  uploadedUrl: string;
}

/**
 * Reusable upload control: drag-drop + click, live preview, progress,
 * remove. Backend-agnostic — the caller passes `upload(file) => url`,
 * so this never couples to a specific API/contract.
 */
export function UploadInput({
  accept = 'image/*',
  label = 'Upload a file',
  hint,
  value,
  upload,
  onChange,
  disabled,
  className,
  previewKind = 'image',
}: {
  accept?: string;
  label?: string;
  hint?: string;
  value?: UploadedFile | null;
  upload: (file: File) => Promise<string>;
  onChange: (file: UploadedFile | null) => void;
  disabled?: boolean;
  className?: string;
  previewKind?: 'image' | 'video' | 'audio';
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file?: File | null) {
    if (!file) return;
    setError(null);
    const previewUrl = URL.createObjectURL(file);
    setBusy(true);
    try {
      const uploadedUrl = await upload(file);
      onChange({ file, previewUrl, uploadedUrl });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
      URL.revokeObjectURL(previewUrl);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  if (value) {
    return (
      <div className={cn('glass rounded-xl border border-white/10 p-3', className)}>
        <div className="flex items-center gap-3">
          {previewKind === 'image' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={value.previewUrl}
              alt="preview"
              className="h-14 w-14 rounded-lg object-cover"
            />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-white/5">
              <FileCheck2 className="h-5 w-5 text-green-400" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-gray-200">{value.file.name}</p>
            <p className="text-xs text-gray-500">
              {(value.file.size / 1024 / 1024).toFixed(2)} MB · uploaded
            </p>
          </div>
          <button
            type="button"
            aria-label="Remove file"
            onClick={() => {
              URL.revokeObjectURL(value.previewUrl);
              onChange(null);
            }}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <button
        type="button"
        disabled={disabled || busy}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          handleFile(e.dataTransfer.files?.[0]);
        }}
        className={cn(
          'flex w-full flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-8 text-center transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60',
          drag
            ? 'border-brand-500/60 bg-brand-500/10'
            : 'border-white/15 hover:border-white/30 hover:bg-white/[0.03]',
          (disabled || busy) && 'cursor-not-allowed opacity-60',
        )}
      >
        {busy ? (
          <Spinner className="h-5 w-5" />
        ) : (
          <UploadCloud className="h-6 w-6 text-gray-400" />
        )}
        <span className="text-sm font-medium text-gray-200">
          {busy ? 'Uploading…' : label}
        </span>
        {hint && <span className="text-xs text-gray-500">{hint}</span>}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}
