// ─── VIDEO AGENT ──────────────────────────────────────────────
//
// Owns every video request: intent analysis → planning → cinematic prompt
// construction → (provider selection / execution / fallback happen downstream in
// the AI router). Mirrors the Image Agent (chat/image-agent.ts). Providers are
// never named here — the agent thinks in capabilities and quality only.
//
// Best-effort & deterministic-fallback: any failure degrades to the raw prompt
// so a video is never blocked by the planning step.

import { aiRouter } from "../../services/ai-router.client";
import { logger } from "../../utils/logger";

export type VideoMode = "TEXT_TO_VIDEO" | "IMAGE_TO_VIDEO" | "CONTINUATION";

export type VideoCategory =
  | "CINEMATIC"
  | "PRODUCT"
  | "ANIMATION"
  | "EXPLAINER"
  | "MOTION_GRAPHICS"
  | "REALISTIC"
  | "NATURE"
  | "CHARACTER"
  | "ABSTRACT"
  // ── Professional creative presets (auto-inferred by the planner) ──
  | "LUXURY_COMMERCIAL"
  | "PRODUCT_LAUNCH"
  | "RESTAURANT_AD"
  | "REAL_ESTATE"
  | "CORPORATE"
  | "TRAVEL"
  | "FASHION"
  | "AUTOMOTIVE"
  | "HEALTHCARE"
  | "EDUCATION"
  | "SOCIAL_MEDIA"
  | "DOCUMENTARY"
  | "HOLLYWOOD_TRAILER"
  | "ANIME"
  | "PIXAR"
  | "GHIBLI"
  | "CYBERPUNK"
  | "MINIMALIST"
  | "GENERIC";

const CATEGORIES: VideoCategory[] = [
  "CINEMATIC", "PRODUCT", "ANIMATION", "EXPLAINER", "MOTION_GRAPHICS",
  "REALISTIC", "NATURE", "CHARACTER", "ABSTRACT",
  "LUXURY_COMMERCIAL", "PRODUCT_LAUNCH", "RESTAURANT_AD", "REAL_ESTATE",
  "CORPORATE", "TRAVEL", "FASHION", "AUTOMOTIVE", "HEALTHCARE", "EDUCATION",
  "SOCIAL_MEDIA", "DOCUMENTARY", "HOLLYWOOD_TRAILER", "ANIME", "PIXAR",
  "GHIBLI", "CYBERPUNK", "MINIMALIST",
  "GENERIC",
];

// Internal plan — never returned to the user.
export interface VideoPlan {
  category: VideoCategory;
  subject: string;
  environment: string;
  camera: string; // movement + angle + lens
  lighting: string;
  motion: string;
  style: string;
  mood: string;
  palette: string;
  prompt: string; // engineered base prompt (pre-directives)
}

// Loader operation hint the client maps to phase messages.
export type VideoOp =
  | "generate"
  | "cinematic"
  | "product"
  | "animation"
  | "explainer"
  | "motion_graphics"
  | "continuation"
  | "image_to_video";

// Temporal-fidelity directives appended to every video prompt. Video models
// have no negative prompt slot we rely on, so "render only what's described +
// keep it temporally stable" is baked into the prompt text.
export const VIDEO_FIDELITY_DIRECTIVES =
  "Maintain strong temporal coherence: keep the subject's identity, shape, " +
  "colors and proportions stable and consistent across every frame, with " +
  "smooth, natural, physically plausible motion. Avoid flicker, jitter, " +
  "warping, morphing, ghosting, duplicated limbs or popping artifacts. Do NOT " +
  "introduce any people, faces, characters, animals, objects, text, words, " +
  "letters, logos, watermarks, captions, signs or scenery that were not " +
  "explicitly requested. Render exactly and only what is described above.";

const CATEGORY_DIRECTIVES: Record<VideoCategory, string> = {
  CINEMATIC:
    "Cinematic film look: filmic dynamic range, shallow depth of field, " +
    "motivated lighting, deliberate camera movement, professional color " +
    "grading and a 24fps cinematic motion cadence.",
  PRODUCT:
    "Premium product film: clean studio or contextual lighting, accurate " +
    "materials and reflections, a smooth orbit/push-in revealing the product, " +
    "sharp focus on the hero subject and an uncluttered background.",
  ANIMATION:
    "Stylized animation: consistent character/asset design, clean shapes, " +
    "appealing keyframed motion with proper easing and a cohesive art style " +
    "across the whole shot.",
  EXPLAINER:
    "Clear explainer style: legible, simple composition, calm purposeful " +
    "motion and a clean background that supports comprehension. Only include " +
    "text the user explicitly requested.",
  MOTION_GRAPHICS:
    "Motion graphics: crisp geometric shapes, smooth eased transitions, " +
    "balanced layout, a cohesive palette and rhythmic, intentional movement.",
  REALISTIC:
    "Photorealistic capture: believable lens, natural lighting and shadows, " +
    "accurate materials and lifelike, grounded motion. Avoid an over-processed " +
    "AI look.",
  NATURE:
    "Natural world cinematography: organic motion (wind, water, light), rich " +
    "natural lighting, atmospheric depth and authentic textures.",
  CHARACTER:
    "Character-focused shot: consistent identity and anatomy, expressive but " +
    "natural performance, clear silhouette and stable features across frames.",
  ABSTRACT:
    "Abstract motion: cohesive forms and palette, fluid evolving movement and " +
    "intentional composition.",
  LUXURY_COMMERCIAL:
    "Luxury commercial: elegant slow camera moves, premium materials, dramatic " +
    "rim/edge lighting, rich contrast, refined color grade and an aspirational, " +
    "high-end mood with immaculate detail.",
  PRODUCT_LAUNCH:
    "Product launch film: hero product reveal, confident push-in/orbit, crisp " +
    "studio lighting, accurate materials and reflections, sharp focus and a " +
    "clean, modern, premium presentation.",
  RESTAURANT_AD:
    "Restaurant/food advertisement: appetising close-ups, warm inviting light, " +
    "fresh textures, gentle steam/sizzle motion, shallow depth of field and a " +
    "tasteful, mouth-watering mood.",
  REAL_ESTATE:
    "Real-estate showcase: smooth gliding/drone-style moves, bright natural " +
    "interior light, correct architectural perspective, spacious framing and a " +
    "clean, premium property feel.",
  CORPORATE:
    "Corporate brand film: polished, professional, confident pacing, clean " +
    "modern lighting, trustworthy tone and tasteful, restrained motion.",
  TRAVEL:
    "Travel film: sweeping establishing shots, golden-hour light, vivid yet " +
    "natural color, atmospheric depth and a sense of adventure and place.",
  FASHION:
    "Fashion film: editorial styling, flattering directional light, elegant " +
    "movement, accurate fabric drape and a bold, stylish, high-end mood.",
  AUTOMOTIVE:
    "Automotive film: dynamic tracking and orbit moves, dramatic reflections " +
    "on paint and glass, accurate proportions and wheels, powerful pacing and " +
    "a premium, cinematic finish.",
  HEALTHCARE:
    "Healthcare/medical: clean, calm, reassuring tone, soft natural light, " +
    "accurate and respectful representation and gentle, steady motion.",
  EDUCATION:
    "Educational: clear, friendly, well-lit and uncluttered, calm purposeful " +
    "motion that supports understanding. Only include text if explicitly asked.",
  SOCIAL_MEDIA:
    "Social-media short: punchy, attention-grabbing opening, vibrant color, " +
    "energetic but smooth motion and a bold, modern, scroll-stopping feel.",
  DOCUMENTARY:
    "Documentary: authentic, natural light, observational handheld or steady " +
    "framing, real textures and an honest, grounded tone.",
  HOLLYWOOD_TRAILER:
    "Hollywood trailer: epic scale, dramatic high-contrast lighting, bold " +
    "cinematic color grade, sweeping camera and intense, climactic energy.",
  ANIME:
    "Anime style: clean line art, cel shading, expressive features and color " +
    "harmony consistent with anime, with coherent anatomy and smooth motion.",
  PIXAR:
    "Pixar-style 3D animation: appealing stylized characters, soft global " +
    "illumination, warm inviting color, polished materials and expressive, " +
    "bouncy yet believable motion.",
  GHIBLI:
    "Studio-Ghibli-style: hand-painted look, soft natural palettes, gentle " +
    "atmospheric light, lush backgrounds and warm, whimsical, heartfelt mood.",
  CYBERPUNK:
    "Cyberpunk: neon-lit night, rain-slick reflections, high contrast, moody " +
    "teal-and-magenta palette, holographic accents and a gritty futuristic feel.",
  MINIMALIST:
    "Minimalist: clean negative space, restrained palette, simple precise " +
    "composition and calm, deliberate, understated motion.",
  GENERIC: "",
};

function loaderOpForCategory(category: VideoCategory, mode: VideoMode): VideoOp {
  if (mode === "CONTINUATION") return "continuation";
  if (mode === "IMAGE_TO_VIDEO") return "image_to_video";
  switch (category) {
    case "CINEMATIC":
    case "REALISTIC":
    case "NATURE":
    case "CHARACTER":
    case "LUXURY_COMMERCIAL":
    case "REAL_ESTATE":
    case "CORPORATE":
    case "TRAVEL":
    case "FASHION":
    case "AUTOMOTIVE":
    case "HEALTHCARE":
    case "DOCUMENTARY":
    case "HOLLYWOOD_TRAILER":
    case "CYBERPUNK":
      return "cinematic";
    case "PRODUCT":
    case "PRODUCT_LAUNCH":
    case "RESTAURANT_AD":
      return "product";
    case "ANIMATION":
    case "ANIME":
    case "PIXAR":
    case "GHIBLI":
      return "animation";
    case "EXPLAINER":
    case "EDUCATION":
      return "explainer";
    case "MOTION_GRAPHICS":
    case "ABSTRACT":
    case "SOCIAL_MEDIA":
    case "MINIMALIST":
      return "motion_graphics";
    default:
      return "generate";
  }
}

function extractJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

const PLAN_SYSTEM =
  "You are the planning brain of a professional AI video studio. Analyse the " +
  "user's request and return ONLY minified JSON with these keys: " +
  '{"category","subject","environment","camera","lighting","motion","style",' +
  '"mood","palette","prompt"}. "category" must be one of: ' +
  CATEGORIES.join(", ") +
  '. Pick the MOST specific category that fits (e.g. a car ad → AUTOMOTIVE, a ' +
  'food spot → RESTAURANT_AD, a neon night scene → CYBERPUNK, a hand-painted ' +
  'whimsical look → GHIBLI) — only fall back to a broad one when nothing more ' +
  'specific applies. "camera" captures movement + angle + lens; "motion" ' +
  'describes how things move. "prompt" is ONE production-quality, single-' +
  "paragraph video prompt that preserves the user's exact intent and every " +
  "stated detail. You may add concrete cinematic specificity that is clearly " +
  "implied, but DO NOT invent new subjects, people, text, logos, objects or " +
  "scenery the user did not request. No markdown, no commentary — JSON only.";

/**
 * PLAN + CONSTRUCT for a video request. Returns the final provider prompt
 * (engineered + category directives + fidelity wrapper), the internal plan
 * (for logging), and the loader op. Never throws.
 */
export async function planVideoGeneration(
  userPrompt: string,
  mode: VideoMode = "TEXT_TO_VIDEO",
  opts: { continuity?: string } = {},
): Promise<{ prompt: string; plan: VideoPlan; op: VideoOp }> {
  const base = (userPrompt ?? "").trim();
  const fallback: VideoPlan = {
    category: "GENERIC",
    subject: base,
    environment: "",
    camera: "",
    lighting: "",
    motion: "",
    style: "",
    mood: "",
    palette: "",
    prompt: base,
  };

  let plan: VideoPlan = fallback;

  if (base && base.length <= 2000) {
    try {
      const result = await aiRouter.route({
        userId: "system",
        module: "CHAT",
        strategy: "COST",
        stream: false,
        model: "gpt-4o-mini",
        systemPrompt: PLAN_SYSTEM,
        messages: [{ role: "user", content: base }],
      });
      const json = extractJson(result.result.text ?? "");
      if (json) {
        const cat = str(json.category).toUpperCase() as VideoCategory;
        const category = CATEGORIES.includes(cat) ? cat : "GENERIC";
        plan = {
          category,
          subject: str(json.subject),
          environment: str(json.environment),
          camera: str(json.camera),
          lighting: str(json.lighting),
          motion: str(json.motion),
          style: str(json.style),
          mood: str(json.mood),
          palette: str(json.palette),
          prompt: str(json.prompt) || base,
        };
      }
    } catch (err) {
      logger.warn("planVideoGeneration failed; using deterministic prompt", {
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Self-validation: ensure a usable engineered prompt; strip label leakage.
  let engineered = plan.prompt.trim();
  if (!engineered || engineered.length < Math.min(8, base.length)) {
    engineered = base;
    plan = { ...plan, prompt: base };
  }
  engineered = engineered.replace(
    /^(category|subject|environment|camera|lighting|motion|style|mood|palette|prompt)\s*:\s*/gim,
    "",
  );

  const directives = CATEGORY_DIRECTIVES[plan.category];
  // Creative-continuity directive (project memory) — woven in so related shots
  // keep the established look unless the user explicitly changes it.
  const continuity = (opts.continuity ?? "").trim();
  const finalPrompt = [engineered, continuity, directives, VIDEO_FIDELITY_DIRECTIVES]
    .filter(Boolean)
    .join("\n\n");

  logger.debug("Video Agent plan", {
    category: plan.category,
    mode,
    subject: plan.subject,
  });

  return { prompt: finalPrompt, plan, op: loaderOpForCategory(plan.category, mode) };
}

// ─── CREATIVE PROJECT MEMORY ──────────────────────────────────
// Build a continuity directive from a previous shot's plan so the next shot in
// the same project keeps the established look (style/palette/lighting/camera/
// mood) — unless the new instruction explicitly changes it. Never throws.
export function buildContinuityDirective(
  profile:
    | Partial<
        Pick<VideoPlan, "style" | "mood" | "palette" | "camera" | "lighting">
      >
    | null
    | undefined,
): string {
  if (!profile) return "";
  const parts: string[] = [];
  if (profile.style) parts.push(`visual style "${profile.style}"`);
  if (profile.palette) parts.push(`color palette "${profile.palette}"`);
  if (profile.lighting) parts.push(`lighting "${profile.lighting}"`);
  if (profile.camera) parts.push(`camera language "${profile.camera}"`);
  if (profile.mood) parts.push(`mood "${profile.mood}"`);
  if (!parts.length) return "";
  return (
    "Maintain creative continuity with the ongoing project: keep the same " +
    parts.join(", ") +
    " unless the instruction above explicitly changes them, so this shot feels " +
    "like part of the same series."
  );
}

// ─── INTENTIONAL VARIATIONS (A–E) ─────────────────────────────
// Each variation deliberately explores a different creative direction while
// preserving the original concept — not a random reroll.
const VARIATION_DIRECTIONS = [
  "Variation A — a different composition and framing.",
  "Variation B — an alternative lighting setup and mood of light.",
  "Variation C — a different camera movement (e.g. push-in, orbit, crane, pan).",
  "Variation D — an alternative color grade and palette.",
  "Variation E — a different cinematic mood and atmosphere.",
];

export function variationDirectionLabel(index: number): string {
  return VARIATION_DIRECTIONS[index % VARIATION_DIRECTIONS.length];
}

/** Append an intentional variation directive to a base prompt. */
export function buildVariationPrompt(basePrompt: string, index: number): string {
  const base = (basePrompt ?? "").trim();
  if (!base) return base;
  return (
    `${base}\n\nKeep the same subject and original concept, but explore a fresh ` +
    `direction: ${variationDirectionLabel(index)}`
  );
}
