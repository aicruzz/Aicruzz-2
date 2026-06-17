// ─── UNIFIED ATTACHMENT PIPELINE ──────────────────────────────
// Every uploaded file classifies into a single AttachmentKind. The capability
// engine then decides which capability consumes it. (Today the composer only
// uploads images/video; this classifier is ready for the rest.)

import type { AttachmentKind } from "./types";

const EXT_KIND: Record<string, AttachmentKind> = {
  jpg: "image", jpeg: "image", png: "image", webp: "image", gif: "image",
  bmp: "image", heic: "image", heif: "image", avif: "image", tiff: "image",
  svg: "svg",
  mp4: "video", webm: "video", mov: "video", mkv: "video", avi: "video", m4v: "video",
  mp3: "audio", wav: "audio", ogg: "audio", m4a: "audio", flac: "audio", aac: "audio",
  pdf: "pdf",
  doc: "word", docx: "word",
  xls: "excel", xlsx: "excel", csv: "excel",
  ppt: "powerpoint", pptx: "powerpoint",
  json: "json",
  zip: "zip",
  ts: "code", tsx: "code", js: "code", jsx: "code", py: "code", java: "code",
  c: "code", cpp: "code", h: "code", go: "code", rs: "code", rb: "code",
  php: "code", html: "code", css: "code", md: "code", sh: "code", sql: "code",
};

const MIME_KIND: Array<[RegExp, AttachmentKind]> = [
  [/^image\/svg/, "svg"],
  [/^image\//, "image"],
  [/^video\//, "video"],
  [/^audio\//, "audio"],
  [/pdf/, "pdf"],
  [/word|msword|wordprocessingml/, "word"],
  [/excel|spreadsheet|spreadsheetml|csv/, "excel"],
  [/powerpoint|presentation|presentationml/, "powerpoint"],
  [/json/, "json"],
  [/zip|compressed/, "zip"],
];

/** Classify an attachment by MIME (preferred) then file extension. */
export function classifyAttachment(opts: {
  url?: string;
  mime?: string;
  name?: string;
}): AttachmentKind {
  const mime = (opts.mime ?? "").toLowerCase();
  for (const [re, kind] of MIME_KIND) if (re.test(mime)) return kind;

  const src = (opts.name ?? opts.url ?? "").toLowerCase().split("?")[0];
  const ext = src.includes(".") ? src.slice(src.lastIndexOf(".") + 1) : "";
  return EXT_KIND[ext] ?? "unknown";
}
