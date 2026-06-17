"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { clsx } from "clsx";

// Rotating status messages — describe real phases, never fake percentages.
// The sequence is chosen by the operation so it reads true to what's happening.
const DEFAULT_MESSAGES = [
  "Understanding your idea…",
  "Planning composition…",
  "Creating artwork…",
  "Rendering details…",
  "Applying lighting…",
  "Refining quality…",
  "Finalizing image…",
];

const OP_MESSAGES: Record<string, string[]> = {
  ui: [
    "Understanding your idea…",
    "Designing the interface…",
    "Balancing the layout…",
    "Building components…",
    "Applying the design system…",
    "Rendering the interface…",
    "Finalizing details…",
  ],
  poster: [
    "Understanding your idea…",
    "Planning the composition…",
    "Balancing typography…",
    "Arranging the layout…",
    "Rendering the artwork…",
    "Finalizing details…",
  ],
  product: [
    "Understanding your idea…",
    "Setting up the studio…",
    "Arranging lighting…",
    "Focusing the shot…",
    "Rendering materials…",
    "Finalizing details…",
  ],
  portrait: [
    "Understanding your idea…",
    "Composing the portrait…",
    "Shaping the lighting…",
    "Rendering skin and detail…",
    "Refining quality…",
    "Finalizing image…",
  ],
  anime: [
    "Understanding your idea…",
    "Sketching the lines…",
    "Blocking the colors…",
    "Cel shading…",
    "Refining detail…",
    "Finalizing image…",
  ],
  render3d: [
    "Understanding your idea…",
    "Building the scene…",
    "Assigning materials…",
    "Computing lighting…",
    "Rendering…",
    "Finalizing image…",
  ],
  edit: [
    "Analyzing the image…",
    "Planning the edit…",
    "Applying changes…",
    "Blending the result…",
    "Refining detail…",
    "Finalizing image…",
  ],
  faceswap: [
    "Analyzing faces…",
    "Matching identity…",
    "Blending features…",
    "Relighting and color-matching…",
    "Refining edges…",
    "Finalizing image…",
  ],
  background: [
    "Segmenting the subject…",
    "Replacing the background…",
    "Matching lighting…",
    "Refining edges…",
    "Finalizing image…",
  ],
  objectremove: [
    "Analyzing the image…",
    "Selecting the area…",
    "Removing the object…",
    "Reconstructing the background…",
    "Refining detail…",
    "Finalizing image…",
  ],
  outpaint: [
    "Analyzing the image…",
    "Planning the extension…",
    "Extending the scene…",
    "Matching perspective…",
    "Refining detail…",
    "Finalizing image…",
  ],
  style: [
    "Analyzing the image…",
    "Studying the style…",
    "Applying the style…",
    "Preserving the subject…",
    "Refining detail…",
    "Finalizing image…",
  ],
};

function messagesForOp(op?: string): string[] {
  return (op && OP_MESSAGES[op]) || DEFAULT_MESSAGES;
}

/**
 * Premium AiCruzz image-generation loader. Reserves a square image slot (no
 * layout jump), with a drifting gradient, shimmer sweep, an AiCruzz sparkle
 * pulse, and rotating phase messages. Deliberately distinct from ChatGPT —
 * uniquely AiCruzz. `count` renders multiple placeholders for multi-output.
 */
export function ImageGenerationLoader({
  count = 1,
  op,
}: {
  count?: number;
  op?: string;
}) {
  const messages = messagesForOp(op);
  const [idx, setIdx] = useState(0);

  // Restart the phase sequence if the operation (and thus messages) changes.
  useEffect(() => {
    setIdx(0);
    const t = setInterval(() => {
      // Advance through phases, then hold on the final phase (no looping).
      setIdx((i) => Math.min(i + 1, messages.length - 1));
    }, 2200);
    return () => clearInterval(t);
  }, [messages]);

  const cards = Math.max(1, Math.min(4, count));

  return (
    <div
      className={clsx(
        "mb-1 grid w-full max-w-md gap-2",
        cards > 1 ? "grid-cols-2" : "grid-cols-1",
      )}
    >
      {Array.from({ length: cards }).map((_, i) => (
        <div
          key={i}
          className="relative aspect-square w-full overflow-hidden rounded-2xl border border-white/10 bg-surface-800/60"
        >
          {/* Drifting brand gradient */}
          <div className="ai-gen-gradient absolute inset-0 opacity-70" />
          {/* Shimmer sweep */}
          <div className="ai-gen-shimmer absolute inset-0" />

          {/* Center sparkle + status */}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4 text-center">
            <div className="ai-gen-sparkle flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-gradient shadow-lg shadow-brand-500/30">
              <Sparkles className="h-6 w-6 text-white" />
            </div>

            {i === 0 && (
              <>
                <span
                  key={idx}
                  className="ai-gen-fade text-xs font-medium text-gray-200"
                >
                  {messages[idx]}
                </span>
                {/* Phase dots — progress feel, not a fake percentage */}
                <div className="flex items-center gap-1">
                  {messages.map((_, d) => (
                    <span
                      key={d}
                      className={clsx(
                        "h-1 w-1 rounded-full transition-colors duration-300",
                        d <= idx ? "bg-brand-400" : "bg-white/15",
                      )}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      ))}

      <style jsx>{`
        .ai-gen-gradient {
          background: linear-gradient(
            120deg,
            rgba(99, 102, 241, 0.18),
            rgba(168, 85, 247, 0.1),
            rgba(56, 189, 248, 0.16),
            rgba(99, 102, 241, 0.18)
          );
          background-size: 300% 300%;
          animation: ai-gen-drift 6s ease-in-out infinite;
        }
        .ai-gen-shimmer {
          background: linear-gradient(
            100deg,
            transparent 30%,
            rgba(255, 255, 255, 0.08) 50%,
            transparent 70%
          );
          background-size: 200% 100%;
          animation: ai-gen-sweep 1.8s linear infinite;
        }
        .ai-gen-sparkle {
          animation: ai-gen-pulse 1.8s ease-in-out infinite;
        }
        .ai-gen-fade {
          animation: ai-gen-fadein 0.5s ease-out;
        }
        @keyframes ai-gen-drift {
          0% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
          100% {
            background-position: 0% 50%;
          }
        }
        @keyframes ai-gen-sweep {
          0% {
            background-position: 200% 0;
          }
          100% {
            background-position: -200% 0;
          }
        }
        @keyframes ai-gen-pulse {
          0%,
          100% {
            transform: scale(1);
            opacity: 1;
          }
          50% {
            transform: scale(1.08);
            opacity: 0.85;
          }
        }
        @keyframes ai-gen-fadein {
          from {
            opacity: 0;
            transform: translateY(4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
