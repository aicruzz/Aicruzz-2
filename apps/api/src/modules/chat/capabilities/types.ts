// ─── CAPABILITY ENGINE — TYPES ────────────────────────────────
//
// Chat Studio is provider-agnostic: it thinks in CAPABILITIES, not providers.
// A capability declares what it does and how to run it; the optimal provider is
// chosen downstream by the AI router. New capabilities (video, audio, PDF,
// search, Figma…) plug in by registering a Capability — no Chat Studio change.

import type { Response } from "express";

export type CapabilityId =
  // Available today
  | "text_chat"
  | "vision"
  | "image_generation"
  | "image_editing"
  | "image_continuation"
  // Declared for the future — registered as "coming_soon" so the registry is
  // complete and a real handler can be dropped in without architecture changes.
  | "video_generation"
  | "video_editing"
  | "audio_generation"
  | "music_generation"
  | "speech_synthesis"
  | "pdf_understanding"
  | "spreadsheet_analysis"
  | "web_search"
  | "code_interpreter"
  | "figma_export"
  | "svg_export"
  | "html_prototype"
  | "model_3d";

// Unified attachment taxonomy — every uploaded file classifies into one of
// these, and the engine decides which capability consumes it.
export type AttachmentKind =
  | "image"
  | "video"
  | "audio"
  | "pdf"
  | "word"
  | "excel"
  | "powerpoint"
  | "svg"
  | "json"
  | "zip"
  | "code"
  | "unknown";

export type CapabilityAvailability = "available" | "coming_soon" | "disabled";

export interface ClassifiedAttachment {
  url: string;
  kind: AttachmentKind;
  name?: string;
  mime?: string;
}

// Everything a capability executor needs. Carries the SSE response so streaming
// capabilities can emit events directly.
export interface CapabilityContext {
  userId: string;
  chatId: string;
  content: string;
  images: string[]; // image attachment URLs, ordered
  videoUrl?: string;
  attachments: ClassifiedAttachment[];
  editQuality: "FAST" | "PRO";
  model?: string;
  strategy: "COST" | "SPEED" | "QUALITY" | "AUTO";
  res: Response;
  // Detection may stash resolved source images (e.g. the continuation target).
  sourceImages?: string[];
}

export type CapabilityExecutor = (ctx: CapabilityContext) => Promise<void>;

// The plugin contract. Future capabilities implement this and register.
export interface Capability {
  id: CapabilityId;
  name: string;
  description: string;
  /** Inputs accepted: "text" and/or attachment kinds. */
  acceptedInputs: Array<AttachmentKind | "text">;
  /** Free-form output labels: "text" | "image" | "video" | "svg" | … */
  producedOutputs: string[];
  /** Permission flags a future gate/billing layer can enforce. */
  permissions: string[];
  availability: CapabilityAvailability;
  /** Higher wins when several capabilities could match. */
  priority: number;
  /** Execution handler — required for "available" capabilities. */
  execute?: CapabilityExecutor;
}
