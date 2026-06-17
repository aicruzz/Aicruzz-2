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
  | "GENERIC";

const CATEGORIES: VideoCategory[] = [
  "CINEMATIC", "PRODUCT", "ANIMATION", "EXPLAINER", "MOTION_GRAPHICS",
  "REALISTIC", "NATURE", "CHARACTER", "ABSTRACT", "GENERIC",
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
      return "cinematic";
    case "PRODUCT":
      return "product";
    case "ANIMATION":
      return "animation";
    case "EXPLAINER":
      return "explainer";
    case "MOTION_GRAPHICS":
    case "ABSTRACT":
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
  '. "camera" captures movement + angle + lens; "motion" describes how things ' +
  'move. "prompt" is ONE production-quality, single-paragraph video prompt ' +
  "that preserves the user's exact intent and every stated detail. You may add " +
  "concrete cinematic specificity that is clearly implied, but DO NOT invent " +
  "new subjects, people, text, logos, objects or scenery the user did not " +
  "request. No markdown, no commentary — JSON only.";

/**
 * PLAN + CONSTRUCT for a video request. Returns the final provider prompt
 * (engineered + category directives + fidelity wrapper), the internal plan
 * (for logging), and the loader op. Never throws.
 */
export async function planVideoGeneration(
  userPrompt: string,
  mode: VideoMode = "TEXT_TO_VIDEO",
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
  const finalPrompt = [engineered, directives, VIDEO_FIDELITY_DIRECTIVES]
    .filter(Boolean)
    .join("\n\n");

  logger.debug("Video Agent plan", {
    category: plan.category,
    mode,
    subject: plan.subject,
  });

  return { prompt: finalPrompt, plan, op: loaderOpForCategory(plan.category, mode) };
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
