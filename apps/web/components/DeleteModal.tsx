"use client";

import { useEffect, useRef } from "react";

interface DeleteChatModalProps {
  chatTitle: string;
  open: boolean;
  deleting?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteChatModal({
  chatTitle,
  open,
  deleting = false,
  onConfirm,
  onCancel,
}: DeleteChatModalProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <>
      <div
        className="dcm-backdrop"
        onClick={() => !deleting && onCancel()}
        aria-hidden="true"
      />

      <div
        className="dcm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dcm-title"
      >
        <p className="dcm-title" id="dcm-title">
          Delete chat?
        </p>
        <p className="dcm-body">
          <span className="dcm-name">"{chatTitle}"</span> will be permanently
          deleted.
        </p>

        <div className="dcm-actions">
          <button
            className="dcm-btn dcm-btn-delete"
            onClick={onConfirm}
            disabled={deleting}
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
          <button
            ref={cancelRef}
            className="dcm-btn dcm-btn-cancel"
            onClick={onCancel}
            disabled={deleting}
          >
            Cancel
          </button>
        </div>
      </div>

      <style>{`
        .dcm-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.55);
          z-index: 9998;
          animation: dcm-fade 0.15s ease;
        }

        .dcm-modal {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          z-index: 9999;
          background: #1c1c1e;
          border: 1px solid rgba(255, 255, 255, 0.09);
          border-radius: 12px;
          padding: 20px;
          width: calc(100% - 32px);
          max-width: 340px;
          box-sizing: border-box;
          animation: dcm-up 0.18s cubic-bezier(0.16, 1, 0.3, 1);
          font-family: -apple-system, 'SF Pro Text', BlinkMacSystemFont, sans-serif;
        }

        @keyframes dcm-fade {
          from { opacity: 0; }
          to   { opacity: 1; }
        }

        @keyframes dcm-up {
          from { opacity: 0; transform: translate(-50%, calc(-50% + 10px)); }
          to   { opacity: 1; transform: translate(-50%, -50%); }
        }

        .dcm-title {
          font-size: 14px;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.92);
          margin: 0 0 6px;
          letter-spacing: -0.01em;
        }

        .dcm-body {
          font-size: 13px;
          color: rgba(255, 255, 255, 0.4);
          margin: 0 0 18px;
          line-height: 1.5;
        }

        .dcm-name {
          color: rgba(255, 255, 255, 0.65);
        }

        .dcm-actions {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .dcm-btn {
          width: 100%;
          height: 38px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 500;
          border: none;
          cursor: pointer;
          transition: opacity 0.15s, background 0.15s;
          font-family: inherit;
          letter-spacing: -0.01em;
        }

        .dcm-btn:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }

        .dcm-btn-delete {
          background: #ef4444;
          color: #fff;
        }

        .dcm-btn-delete:hover:not(:disabled) {
          background: #dc2626;
        }

        .dcm-btn-cancel {
          background: rgba(255, 255, 255, 0.06);
          color: rgba(255, 255, 255, 0.7);
          border: 1px solid rgba(255, 255, 255, 0.09);
        }

        .dcm-btn-cancel:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.1);
        }
      `}</style>
    </>
  );
}
