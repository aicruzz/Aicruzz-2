// ─── CAPABILITY ENGINE — PUBLIC SURFACE ───────────────────────
// Re-exports the engine pieces and, at import time, registers the forward-
// looking capabilities (declared but not yet executable). The available
// capabilities are registered by chat.service (their executors live there).

export * from "./types";
export * from "./registry";
export * from "./engine";
export * from "./telemetry";
export * from "./attachment";
export * from "./design-export";

import { registerCapability } from "./registry";
import type { Capability } from "./types";

// Future capabilities — registered as "coming_soon". When a provider/handler is
// ready, set availability "available" + add an execute(); nothing else changes.
const FUTURE: Array<Pick<Capability, "id" | "name" | "description" | "producedOutputs">> = [
  { id: "video_generation", name: "Video Generation", description: "Generate video from a prompt.", producedOutputs: ["video"] },
  { id: "video_editing", name: "Video Editing", description: "Edit or restyle an existing video.", producedOutputs: ["video"] },
  { id: "audio_generation", name: "Audio Generation", description: "Generate sound effects or audio.", producedOutputs: ["audio"] },
  { id: "music_generation", name: "Music Generation", description: "Compose music from a prompt.", producedOutputs: ["audio"] },
  { id: "speech_synthesis", name: "Speech", description: "Synthesize speech from text.", producedOutputs: ["audio"] },
  { id: "pdf_understanding", name: "PDF Understanding", description: "Read and answer questions about PDFs.", producedOutputs: ["text"] },
  { id: "spreadsheet_analysis", name: "Spreadsheet Analysis", description: "Analyze spreadsheets and tabular data.", producedOutputs: ["text"] },
  { id: "web_search", name: "Web Search", description: "Search the internet for current information.", producedOutputs: ["text"] },
  { id: "code_interpreter", name: "Code Interpreter", description: "Run code to compute results.", producedOutputs: ["text"] },
  { id: "figma_export", name: "Figma Export", description: "Export a design to Figma.", producedOutputs: ["figma"] },
  { id: "svg_export", name: "SVG Export", description: "Export a design as SVG.", producedOutputs: ["svg"] },
  { id: "html_prototype", name: "HTML Prototype", description: "Generate an HTML prototype from a design.", producedOutputs: ["html"] },
  { id: "model_3d", name: "3D Model", description: "Generate a 3D model.", producedOutputs: ["3d"] },
];

for (const f of FUTURE) {
  registerCapability({
    ...f,
    acceptedInputs: ["text"],
    permissions: [],
    availability: "coming_soon",
    priority: 5,
  });
}
