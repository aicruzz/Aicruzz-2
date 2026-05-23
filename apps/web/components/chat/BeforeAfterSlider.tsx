"use client";

import { useCallback, useRef, useState } from "react";
import { clsx } from "clsx";
import { Download, Maximize2, X } from "lucide-react";

interface BeforeAfterSliderProps {
  beforeUrl: string;
  afterUrl: string;
  className?: string;
}

/**
 * Draggable before/after comparison for image transformations.
 * The "after" image is revealed left-to-right by a draggable handle.
 * Includes an HD download and a full-screen zoom overlay.
 */
export function BeforeAfterSlider({
  beforeUrl,
  afterUrl,
  className,
}: BeforeAfterSliderProps) {
  const [pos, setPos] = useState(50); // % of width revealing the "after" image
  const [zoomed, setZoomed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const updateFromClientX = useCallback((clientX: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setPos(Math.max(0, Math.min(100, pct)));
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    dragging.current = true;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    updateFromClientX(e.clientX);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    updateFromClientX(e.clientX);
  };
  const onPointerUp = () => {
    dragging.current = false;
  };

  async function downloadHd() {
    try {
      const res = await fetch(afterUrl, { mode: "cors" });
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `aicruzz-edit-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(href);
    } catch {
      // Fallback: open in a new tab if a cross-origin fetch is blocked.
      window.open(afterUrl, "_blank", "noopener,noreferrer");
    }
  }

  const Surface = ({ full }: { full?: boolean }) => (
    <div
      ref={full ? undefined : containerRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      className={clsx(
        "relative select-none overflow-hidden rounded-xl border border-white/10",
        full ? "max-h-[85vh] max-w-[90vw]" : "max-h-72 w-full max-w-md",
      )}
      style={{ touchAction: "none", cursor: "ew-resize" }}
    >
      {/* Before (full, underneath) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={beforeUrl}
        alt="Before"
        draggable={false}
        className="block h-auto w-full object-contain"
      />
      {/* After (clipped to the revealed width) */}
      <div
        className="absolute inset-0"
        style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={afterUrl}
          alt="After"
          draggable={false}
          className="block h-full w-full object-contain"
        />
      </div>

      {/* Labels */}
      <span className="pointer-events-none absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-gray-200">
        Before
      </span>
      <span className="pointer-events-none absolute right-2 top-2 rounded bg-brand-500/70 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-white">
        After
      </span>

      {/* Handle */}
      <div
        className="pointer-events-none absolute inset-y-0 w-0.5 bg-white/80"
        style={{ left: `${pos}%` }}
      >
        <div className="absolute top-1/2 left-1/2 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/40 bg-surface-800/90 text-white shadow">
          <span className="text-[10px]">↔</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className={clsx("mb-1", className)}>
      <Surface />
      <div className="mt-1.5 flex items-center gap-2">
        <button
          onClick={downloadHd}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1 text-[11px] text-gray-300 transition-colors hover:border-brand-500/40 hover:text-brand-300"
        >
          <Download className="h-3 w-3" /> Download HD
        </button>
        <button
          onClick={() => setZoomed(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1 text-[11px] text-gray-300 transition-colors hover:border-white/25"
        >
          <Maximize2 className="h-3 w-3" /> Zoom
        </button>
      </div>

      {zoomed && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6 backdrop-blur-sm"
          onClick={() => setZoomed(false)}
        >
          <div onClick={(e) => e.stopPropagation()}>
            <Surface full />
          </div>
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
