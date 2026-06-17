// ─── DESIGN EXPORT SCAFFOLDING (Figma prep) ───────────────────
// Architecture only — NOT a connector. A future Figma/SVG/HTML exporter can
// consume a design capability's output through these shapes without changing
// Chat Studio. Nothing here is wired into any route or the UI yet.

export interface DesignTokens {
  colors: Record<string, string>;
  typography: Record<
    string,
    { fontFamily?: string; fontSize?: number; fontWeight?: number; lineHeight?: number }
  >;
  spacing: number[];
  radii: number[];
  shadows: string[];
}

export interface ComponentNode {
  id: string;
  type: string; // "frame" | "text" | "image" | "group" | "vector" | …
  name?: string;
  children?: ComponentNode[];
  autoLayout?: {
    direction: "horizontal" | "vertical";
    gap?: number;
    padding?: number;
  };
  constraints?: { horizontal?: string; vertical?: string };
}

export interface DesignExportPayload {
  source: "chat-studio";
  imageUrl: string;
  category: string;
  tokens?: DesignTokens;
  componentTree?: ComponentNode;
  svg?: string;
  // A future Figma connector reads this without Chat Studio changing.
  figmaPayload?: Record<string, unknown>;
  meta: { createdAt: string; note: string };
}

// Targets a future design-to-code exporter can produce from a generated design.
export type DesignTarget =
  | "flutter"
  | "react"
  | "nextjs"
  | "html"
  | "css"
  | "tailwind"
  | "svg"
  | "tokens"
  | "figma";

// Lightweight metadata attached to a generated design image so the gallery and
// a future exporter know what can be produced from it. Metadata pipeline only —
// no export is performed.
export interface DesignMeta {
  category: string;
  isDesign: boolean;
  exportTargets: DesignTarget[];
  tokensReady: boolean;
  componentTreeReady: boolean;
  createdAt: string;
}

const DESIGN_CATEGORIES = new Set([
  "UI",
  "LOGO",
  "ICON",
  "POSTER",
  "ILLUSTRATION",
  "ARCHITECTURE",
]);

/**
 * Build design-to-code metadata for a generated image. Returns null for
 * non-design images. UI screens advertise the full code/export target set;
 * other design categories advertise the asset targets. Nothing is exported —
 * this prepares the pipeline only.
 */
export function buildDesignMeta(category: string): DesignMeta | null {
  if (!DESIGN_CATEGORIES.has(category)) return null;
  const isUi = category === "UI";
  return {
    category,
    isDesign: true,
    exportTargets: isUi
      ? ["flutter", "react", "nextjs", "html", "css", "tailwind", "svg", "tokens", "figma"]
      : ["svg", "tokens", "figma"],
    tokensReady: false,
    componentTreeReady: false,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Build a forward-compatible design-export payload from a generated design
 * image. Currently returns the image + metadata; a future connector fills
 * tokens/componentTree/svg/figmaPayload. Stub by design — not yet invoked.
 */
export function buildDesignExportPayload(args: {
  imageUrl: string;
  category: string;
}): DesignExportPayload {
  return {
    source: "chat-studio",
    imageUrl: args.imageUrl,
    category: args.category,
    meta: {
      createdAt: new Date().toISOString(),
      note: "Scaffolding payload — tokens/componentTree/svg/figmaPayload pending a future design connector.",
    },
  };
}
