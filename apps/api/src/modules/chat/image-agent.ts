// ─── IMAGE AGENT ──────────────────────────────────────────────
//
// A dedicated orchestration layer that owns the image workflow for Chat Studio:
//
//   intent analysis → planning → category-specialised prompt construction →
//   self-validation (rebuild if needed) → (generation/edit happens in the
//   service) → operation hint for the loader.
//
// The text model never decides image generation; the router + this agent do.
// The planning object is INTERNAL — it is logged for debugging but never sent
// to the client. Everything here is best-effort and never throws: any failure
// degrades gracefully to a deterministic prompt so generation is never blocked.

import { aiRouter } from "../../services/ai-router.client";
import { logger } from "../../utils/logger";

// Generation categories (text-to-image). Edit operations are classified
// separately by classifyEditOp().
export type ImageCategory =
  | "UI"
  | "LOGO"
  | "ICON"
  | "ILLUSTRATION"
  | "PRODUCT"
  | "POSTER"
  | "RENDER3D"
  | "PORTRAIT"
  | "CHARACTER"
  | "ANIME"
  | "PHOTO"
  | "ARCHITECTURE"
  | "VEHICLE"
  | "FOOD"
  | "FASHION"
  | "INTERIOR"
  | "GENERIC";

const CATEGORIES: ImageCategory[] = [
  "UI", "LOGO", "ICON", "ILLUSTRATION", "PRODUCT", "POSTER", "RENDER3D",
  "PORTRAIT", "CHARACTER", "ANIME", "PHOTO", "ARCHITECTURE", "VEHICLE",
  "FOOD", "FASHION", "INTERIOR", "GENERIC",
];

// Internal planning object. Never serialized to the client.
export interface ImagePlan {
  category: ImageCategory;
  subject: string;
  style: string;
  lighting: string;
  mood: string;
  perspective: string;
  palette: string;
  prompt: string; // engineered base prompt (pre-directives)
}

// Loader operation hint sent to the client so the loading card can show
// operation-specific phase messages. Keep in sync with the frontend map.
export type ImageOp =
  | "generate"
  | "ui"
  | "logo"
  | "poster"
  | "product"
  | "portrait"
  | "anime"
  | "render3d"
  | "edit"
  | "faceswap"
  | "background"
  | "objectremove"
  | "style"
  | "outpaint";

// Deterministic fidelity directives appended to every text-to-image prompt.
// gpt-image-1 has no negative_prompt, so "render only what is described" is
// baked inline. Stops random people/objects/text/scenes from being invented.
export const IMAGE_FIDELITY_DIRECTIVES =
  "Render exactly and only what is described above — preserve every stated " +
  "subject, attribute, color, material, style, composition, camera framing " +
  "and lighting instruction faithfully. Do NOT add any people, faces, " +
  "characters, animals, objects, text, words, letters, logos, watermarks, " +
  "signs, buildings, vehicles, accessories, backgrounds or scene elements " +
  "that were not explicitly requested. Keep the scene clean, coherent and " +
  "free of clutter or random extra details. If a detail is not specified, " +
  "keep it simple and neutral rather than inventing one.";

// Category-specialised directives. Each category emphasises the qualities that
// make that kind of image read as professional. Generic adds nothing extra.
const CATEGORY_DIRECTIVES: Record<ImageCategory, string> = {
  UI:
    "This is a professional, production-grade UI/UX design that should look like " +
    "a senior designer's case study (Dribbble/Behance quality), not a generic " +
    "mockup. Use a coherent design system: an 8-point spacing grid, clear visual " +
    "hierarchy, aligned components, consistent corner radii, a restrained modern " +
    "type scale with real readable labels (no lorem-ipsum gibberish, no garbled " +
    "text), and a balanced accessible color palette with sufficient contrast. " +
    "Compose realistic, well-proportioned components — navigation, cards, " +
    "buttons, inputs and forms, tables, lists, charts/graphs, tabs, modals, " +
    "avatars and icons — with soft realistic shadows and generous white space. " +
    "Lay it out as a responsive, pixel-accurate screen with correct safe areas " +
    "and no broken, warped or duplicated UI elements.",
  LOGO:
    "This is a logo/brand mark. Prioritise a clean, scalable, memorable design " +
    "with balanced negative space, crisp vector-like edges and a flat, simple " +
    "composition on a plain background. Avoid photographic detail and clutter.",
  ICON:
    "This is an icon. Prioritise a simple, instantly readable symbol with " +
    "consistent stroke weight, clean geometry and a flat background. No extra " +
    "decoration.",
  ILLUSTRATION:
    "This is an illustration. Prioritise cohesive art direction, intentional " +
    "color harmony, clean linework or shading consistent with the requested " +
    "style, and a clear focal subject.",
  PRODUCT:
    "This is product photography. Prioritise studio lighting, accurate " +
    "materials and surface reflections, shallow depth of field, sharp focus on " +
    "the product, a clean seamless background and high commercial realism.",
  POSTER:
    "This is a poster/advertisement. Prioritise strong composition and focal " +
    "hierarchy, balanced negative space and deliberate layout. Only include " +
    "text the user explicitly requested, rendered cleanly and legibly.",
  RENDER3D:
    "This is a 3D render. Prioritise physically based materials, accurate " +
    "global illumination, soft realistic shadows, clean topology and a " +
    "polished studio presentation.",
  PORTRAIT:
    "This is a portrait. Prioritise natural skin texture (no plastic/waxy " +
    "look), realistic eyes and hair, flattering soft lighting, accurate " +
    "anatomy and a tasteful depth of field.",
  CHARACTER:
    "This is a character design. Prioritise a clear silhouette, consistent " +
    "proportions, expressive design and clean presentation against a simple " +
    "background.",
  ANIME:
    "This is anime/stylised art. Prioritise clean line art, cel shading, " +
    "expressive features and color harmony consistent with the requested " +
    "style, while keeping anatomy coherent.",
  PHOTO:
    "This is a realistic photograph. Prioritise a believable lens and depth of " +
    "field, natural lighting and shadows, accurate materials and true-to-life " +
    "detail. Avoid an over-processed, AI-looking finish.",
  ARCHITECTURE:
    "This is architecture. Prioritise correct perspective and proportion, " +
    "realistic materials, accurate lighting and a clean, professional " +
    "architectural-visualisation finish.",
  VEHICLE:
    "This is a vehicle render. Prioritise accurate proportions and panel " +
    "lines, realistic paint and reflections, correct wheel geometry and clean " +
    "studio or environment lighting.",
  FOOD:
    "This is food photography. Prioritise appetising styling, soft natural " +
    "lighting, fresh textures, shallow depth of field and a clean, tasteful " +
    "background.",
  FASHION:
    "This is fashion imagery. Prioritise accurate fabric drape and texture, " +
    "flattering lighting, a strong pose and a clean editorial composition.",
  INTERIOR:
    "This is an interior scene. Prioritise correct perspective, realistic " +
    "materials and lighting, coherent styling and an inviting, professional " +
    "interior-design finish.",
  GENERIC: "",
};

function loaderOpForCategory(category: ImageCategory): ImageOp {
  switch (category) {
    case "UI":
      return "ui";
    case "LOGO":
    case "ICON":
      return "logo";
    case "POSTER":
      return "poster";
    case "PRODUCT":
    case "FOOD":
    case "FASHION":
      return "product";
    case "PORTRAIT":
      return "portrait";
    case "ANIME":
    case "CHARACTER":
    case "ILLUSTRATION":
      return "anime";
    case "RENDER3D":
      return "render3d";
    default:
      return "generate";
  }
}

// Tolerant JSON extraction — pulls the first {...} block out of an LLM reply.
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
  "You are the planning brain of a professional image-generation studio. " +
  "Analyse the user's request and return ONLY minified JSON with these keys: " +
  '{"category","subject","style","lighting","mood","perspective","palette",' +
  '"prompt"}. "category" must be one of: ' +
  CATEGORIES.join(", ") +
  ". The other fields capture your internal plan (short phrases). \"prompt\" " +
  "is ONE production-quality image prompt, written as a single descriptive " +
  "paragraph, that preserves the user's exact intent and every stated detail " +
  "and constraint. You may add concrete visual specificity that is clearly " +
  "implied, but DO NOT invent new subjects, people, text, logos, objects or " +
  "scenery the user did not request. No markdown, no commentary — JSON only.";

/**
 * PLAN + CONSTRUCT + VALIDATE for a text-to-image request.
 * Returns the final provider prompt (engineered + category directives +
 * fidelity wrapper), the internal plan (for logging) and the loader op.
 * Never throws — falls back to a deterministic prompt on any failure.
 */
export async function planImageGeneration(
  userPrompt: string,
): Promise<{ prompt: string; plan: ImagePlan; op: ImageOp }> {
  const base = userPrompt.trim();
  const fallbackPlan: ImagePlan = {
    category: "GENERIC",
    subject: base,
    style: "",
    lighting: "",
    mood: "",
    perspective: "",
    palette: "",
    prompt: base,
  };

  let plan: ImagePlan = fallbackPlan;

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
        const cat = str(json.category).toUpperCase() as ImageCategory;
        const category = CATEGORIES.includes(cat) ? cat : "GENERIC";
        const engineered = str(json.prompt) || base;
        plan = {
          category,
          subject: str(json.subject),
          style: str(json.style),
          lighting: str(json.lighting),
          mood: str(json.mood),
          perspective: str(json.perspective),
          palette: str(json.palette),
          prompt: engineered,
        };
      }
    } catch (err) {
      logger.warn("planImageGeneration failed; using deterministic prompt", {
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Self-validation + rebuild: ensure a usable engineered prompt. If the model
  // returned something empty or implausibly short, fall back to the raw intent.
  let engineered = plan.prompt.trim();
  if (!engineered || engineered.length < Math.min(8, base.length)) {
    engineered = base;
    plan = { ...plan, prompt: base };
  }
  // Strip accidental planning-label leakage (e.g. "Subject: ...").
  engineered = engineered.replace(
    /^(intent|subject|style|lighting|mood|perspective|palette|category|constraints?)\s*:\s*/gim,
    "",
  );

  const directives = CATEGORY_DIRECTIVES[plan.category];
  const finalPrompt = [engineered, directives, IMAGE_FIDELITY_DIRECTIVES]
    .filter(Boolean)
    .join("\n\n");

  logger.debug("Image Agent plan", {
    category: plan.category,
    subject: plan.subject,
    style: plan.style,
  });

  return { prompt: finalPrompt, plan, op: loaderOpForCategory(plan.category) };
}

// ─── EDIT OPERATION CLASSIFICATION ────────────────────────────
// Deterministic classification of an edit instruction → a loader op so the
// loading card shows operation-specific phases. The actual edit directives are
// added by the ai-router transform-prompt layer.
const EDIT_OP_RULES: { re: RegExp; op: ImageOp }[] = [
  { re: /\b(face\s?-?swap|head\s?-?swap|swap\s+(?:the\s+)?(?:face|head)|replace\s+(?:the\s+)?(?:face|head))\b/i, op: "faceswap" },
  { re: /\b(background|backdrop|sky|behind (?:the|him|her|them|it)|green\s?screen)\b/i, op: "background" },
  { re: /\b(remove|erase|delete|get rid of|take out|clean up)\b/i, op: "objectremove" },
  { re: /\b(out-?paint|extend|expand|zoom out|uncrop|widen|fill (?:in|out) the)\b/i, op: "outpaint" },
  { re: /\b(cartoon|anime|ghibli|pixar|comic|sketch|watercolou?r|oil painting|cyberpunk|style of|in the style|style ?transfer|turn (?:it|this|me) into)\b/i, op: "style" },
];

export function classifyEditOp(instruction: string): ImageOp {
  for (const rule of EDIT_OP_RULES) {
    if (rule.re.test(instruction)) return rule.op;
  }
  return "edit";
}
