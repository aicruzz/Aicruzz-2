"use client";

import { X } from "lucide-react";
import { clsx } from "clsx";

interface ChatShortcutsHelpProps {
  open: boolean;
  onClose: () => void;
}

const ROWS: { keys: string; desc: string }[] = [
  { keys: "Enter", desc: "Send message" },
  { keys: "Shift + Enter", desc: "New line in the composer" },
  { keys: "⌘ / Ctrl + Enter", desc: "Send from the composer" },
  { keys: "/", desc: "Focus composer (when not typing in a field)" },
  { keys: "⌘ / Ctrl + N", desc: "Start a new chat" },
  { keys: "⌘ / Ctrl + /", desc: "Open this shortcuts panel" },
  { keys: "Shift + ?", desc: "Open this shortcuts panel" },
  { keys: "Escape", desc: "Close panel or clear attachment" },
];

export function ChatShortcutsHelp({ open, onClose }: ChatShortcutsHelpProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="chat-shortcuts-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={clsx(
          "w-full max-w-md rounded-2xl border border-white/10 bg-surface-900 shadow-2xl",
          "shadow-black/40",
        )}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 id="chat-shortcuts-title" className="text-sm font-semibold text-white">
            Keyboard shortcuts
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <ul className="max-h-[min(70vh,420px)] divide-y divide-white/5 overflow-y-auto px-2 py-2">
          {ROWS.map((row) => (
            <li
              key={row.keys}
              className="flex items-start justify-between gap-4 px-3 py-3 text-sm"
            >
              <span className="shrink-0 rounded-md border border-white/10 bg-surface-800/80 px-2 py-1 font-mono text-[11px] text-brand-200">
                {row.keys}
              </span>
              <span className="pt-0.5 text-right text-gray-400">{row.desc}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
