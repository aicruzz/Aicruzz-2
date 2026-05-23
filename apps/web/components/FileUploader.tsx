"use client";

import { useRef, useState } from "react";

type UploadState = "idle" | "requesting" | "uploading" | "done" | "error";

interface UploadResult {
  fileUrl: string;
  key: string;
}

const ACCEPTED_TYPES = ".jpg,.jpeg,.png,.webp,.pdf";

export default function FileUploader() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploadState>("idle");
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setState("idle");
    setProgress(0);
    setResult(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setResult(null);
    setProgress(0);
    setState("requesting");

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to get upload URL");
      }

      const { signedUrl, fileUrl, key } = await res.json();

      setState("uploading");

      await uploadWithProgress(signedUrl, file, (pct) => setProgress(pct));

      setResult({ fileUrl, key });
      setState("done");
    } catch (err: unknown) {
      console.log(err);
      const message = err instanceof Error ? err.message : "Upload failed";
      setError(message);
      setState("error");
    }
  }

  return (
    <div className="uploader">
      {state === "idle" || state === "error" ? (
        <label className="drop-zone" onClick={() => inputRef.current?.click()}>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_TYPES}
            onChange={handleUpload}
            hidden
          />
          <UploadIcon />
          <p className="drop-label">Click to select a file</p>
          <p className="drop-sub">JPG, PNG, WEBP, PDF · Max 10MB</p>
          {error && <p className="error-msg">{error}</p>}
        </label>
      ) : state === "requesting" ? (
        <StatusCard icon="⏳" message="Preparing upload…" />
      ) : state === "uploading" ? (
        <div className="progress-card">
          <p className="progress-label">Uploading… {progress}%</p>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>
      ) : state === "done" && result ? (
        <div className="success-card">
          <p className="success-title">✅ Upload complete</p>
          <a
            href={result.fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="file-link"
          >
            View file ↗
          </a>
          <button className="reset-btn" onClick={reset}>
            Upload another
          </button>
        </div>
      ) : null}
    </div>
  );
}

function uploadWithProgress(
  url: string,
  file: File,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`S3 upload failed with status ${xhr.status}`));
      }
    });

    xhr.addEventListener("error", () =>
      reject(new Error("Network error during upload")),
    );
    xhr.addEventListener("abort", () => reject(new Error("Upload aborted")));

    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.send(file);
  });
}

function StatusCard({ icon, message }: { icon: string; message: string }) {
  return (
    <div className="status-card">
      <span className="status-icon">{icon}</span>
      <p>{message}</p>
    </div>
  );
}

function UploadIcon() {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}
