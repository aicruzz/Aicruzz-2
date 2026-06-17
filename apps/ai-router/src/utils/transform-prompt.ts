/**
 * transform-prompt
 * ----------------------------------------------------------------------------
 * Wraps a short user edit request ("make him lie down on a bed") with the
 * realism + identity-preservation directives that gpt-image-1's edit endpoint
 * needs to produce a photorealistic, professionally-retouched result instead
 * of an obviously AI-generated one.
 *
 * Pure string function — no I/O, deterministic, zero latency.
 */

// Keywords that indicate the edit changes body posture/orientation. When any
// are present we append explicit anatomy-reconstruction guidance so occluded
// limbs are regenerated naturally rather than smeared.
const POSE_KEYWORDS = [
  'lie', 'lying', 'lay', 'laid', 'sit', 'sitting', 'seated', 'stand',
  'standing', 'kneel', 'kneeling', 'crouch', 'squat', 'bend', 'bending',
  'turn', 'turning', 'side', 'sideways', 'profile', 'facing', 'face the',
  'pose', 'posture', 'position', 'arms', 'arm', 'legs', 'leg', 'crossed',
  'reclining', 'leaning', 'lean', 'jump', 'jumping', 'walk', 'walking',
  'run', 'running', 'rotate', 'rotated', 'angle', 'body',
];

const REALISM_DIRECTIVES =
  'Preserve the subject\'s exact facial identity, facial features, age, ' +
  'skin tone and skin texture, body proportions, and any visible tattoos or ' +
  'marks. Keep the original lighting direction, color temperature, shadows, ' +
  'reflections, camera angle, lens characteristics, perspective and depth of ' +
  'field consistent with the source photograph. Render photorealistic detail ' +
  'with natural skin (no plastic or waxy look), realistic eyes, clean edges ' +
  'and seamless blending. Avoid AI artifacts, distorted or extra fingers, ' +
  'warped limbs, duplicated features, fake shadows or an over-processed look. ' +
  'The final image must look like a real, professionally retouched ' +
  'photograph — not an AI generation.';

const POSE_DIRECTIVES =
  ' This edit changes the subject\'s body posture or orientation: ' +
  'intelligently reconstruct any limbs, joints or body parts that become ' +
  'newly visible, keeping anatomy correct and proportional. Recreate natural ' +
  'clothing folds, fabric drape and contact shadows for the new pose, and ' +
  'keep the subject grounded realistically in the scene with consistent ' +
  'environmental lighting.';

function hasPoseIntent(prompt: string): boolean {
  const lower = ` ${prompt.toLowerCase()} `;
  return POSE_KEYWORDS.some((kw) => lower.includes(` ${kw}`));
}

// ── Edit-type detection → tailored, professional directives ───────────────────
// Each edit class needs different guidance to look real. We detect the class
// from the instruction and append only the directives that apply (additive,
// deterministic, zero latency).
const EDIT_RULES: { re: RegExp; directives: string }[] = [
  {
    // Background / sky / scene replacement
    re: /\b(background|backdrop|sky|scene behind|behind (?:the|him|her|them|it))\b/i,
    directives:
      ' Replace only the background while keeping the foreground subject ' +
      'perfectly intact — preserve its exact edges, hair detail, contact ' +
      'shadows and color. Match the new background\'s lighting direction, ' +
      'white balance and perspective to the subject so the composite looks ' +
      'like a single real photograph, not a cut-out.',
  },
  {
    // Object removal
    re: /\b(remove|erase|delete|get rid of|take out|clean up|clear out)\b/i,
    directives:
      ' When removing an element, reconstruct the area behind it ' +
      'photorealistically using consistent surrounding texture, lighting and ' +
      'perspective. Leave no ghosting, smear, blur patch or leftover outline.',
  },
  {
    // Object / clothing / hair replacement
    re: /\b(replace|swap|substitute|change (?:the |his |her |their )?(?:outfit|clothes|clothing|shirt|dress|hair|color|colour))\b/i,
    directives:
      ' When replacing an element, match the new element\'s scale, ' +
      'perspective, lighting, shadows and material response to the rest of the ' +
      'scene so it integrates seamlessly and looks physically present.',
  },
  {
    // Face / head swap
    re: /\b(face\s?-?swap|head\s?-?swap|swap (?:the )?(?:face|head)|put .* face|replace (?:the )?(?:face|head))\b/i,
    directives:
      ' For a face/head swap, transfer the identity, facial structure and skin ' +
      'tone from the reference precisely, then relight and color-match it to ' +
      'the destination so the blend at the hairline, jaw and neck is seamless ' +
      'and anatomically correct. No doubled features or warping.',
  },
  {
    // Style transfer
    re: /\b(cartoon|anime|ghibli|pixar|comic|manga|sketch|watercolou?r|oil painting|cyberpunk|3d ?render|claymation|in the style of|style of|style transfer|turn (?:it|this|me) into)\b/i,
    directives:
      ' Apply the requested artistic style consistently across the whole image ' +
      'while preserving the subject\'s recognizable identity, pose, layout and ' +
      'key features. Keep the composition faithful to the source.',
  },
  {
    // Outpainting / extend
    re: /\b(out-?paint|extend|expand|zoom out|wider|uncrop|fill (?:in|out) the (?:edges|scene|frame))\b/i,
    directives:
      ' Extend the scene outward, inventing only what is plausibly continuous ' +
      'with the existing image — matching perspective, lighting, color and ' +
      'texture exactly so the added area is indistinguishable from the original.',
  },
  {
    // Multi-image combine / composite
    re: /\b(combine|merge|composite|blend|collage|into one|put .* together|using (?:the|all) (?:images|photos|references))\b/i,
    directives:
      ' Intelligently combine the provided reference images into one coherent ' +
      'result: unify lighting, color grading, scale and perspective across the ' +
      'sources so the final image reads as a single, naturally captured scene.',
  },
  {
    // Hair replacement / restyle
    re: /\b(hair|hairstyle|haircut|hairdo|bald|beard|moustache|mustache|fringe|bangs|ponytail|braids?|dreadlocks?)\b/i,
    directives:
      ' When changing hair, follow the head shape, hairline and scalp naturally, ' +
      'render realistic strand detail and flyaways, and match the lighting and ' +
      'shadows on the hair to the scene. Keep the face and everything else ' +
      'unchanged.',
  },
  {
    // Clothing / outfit replacement
    re: /\b(outfit|clothes|clothing|shirt|t-?shirt|dress|suit|jacket|coat|hoodie|jeans|trousers|pants|skirt|uniform|wear(?:ing)?)\b/i,
    directives:
      ' When changing clothing, match the garment to the body pose and ' +
      'proportions with realistic fabric drape, folds, seams, thickness and ' +
      'contact shadows. Keep the face, skin, hands and background unchanged.',
  },
  {
    // Expression / smile / eyes / gaze
    re: /\b(smile|smiling|frown|expression|emotion|happy|sad|angry|serious|eyes?|gaze|look(?:ing)? (?:at|away|left|right|up|down)|open (?:the )?eyes|close (?:the )?eyes|blink|wink)\b/i,
    directives:
      ' When editing expression or gaze, keep the exact same identity, facial ' +
      'proportions and features; adjust only the requested muscles (mouth, eyes, ' +
      'brows) naturally and symmetrically, preserving realistic teeth, catchlights ' +
      'and skin detail. No identity drift or warping.',
  },
  {
    // Relighting / shadows / reflections
    re: /\b(relight|re-?light|lighting|light(?:ed)?|studio light|golden hour|softbox|rim light|backlit|shadow|shadows|reflection|reflections|glow|highlight)\b/i,
    directives:
      ' When adjusting lighting, keep the subject, colors and composition the ' +
      'same; recompute consistent light direction, soft realistic shadows, ' +
      'reflections and highlights that match the new lighting physically. Avoid ' +
      'flat, baked or double-shadow artifacts.',
  },
  {
    // Beauty / retouch enhancement
    re: /\b(beauty|retouch|enhance|smooth(?:er)? skin|blemish|acne|wrinkles?|makeup|glow up|flawless)\b/i,
    directives:
      ' Apply tasteful, natural retouching: even skin tone while keeping real ' +
      'pores and texture (no plastic or airbrushed look), preserve identity and ' +
      'all distinctive features. Subtle and believable, not artificial.',
  },
  {
    // Restoration / old photo repair / scratch removal
    re: /\b(restore|restoration|repair|old photo|damaged|scratch(?:es)?|torn|faded|crease|water damage|dust|stains?)\b/i,
    directives:
      ' Restore the photograph: remove scratches, dust, creases, tears and ' +
      'stains, recover faded detail and correct color, while faithfully ' +
      'preserving the original subject, era, clothing and authentic look. Do not ' +
      'modernise or invent new content.',
  },
  {
    // Upscale / sharpen / denoise
    re: /\b(upscale|up-?res|super ?resolution|sharpen|sharper|deblur|denoise|de-?noise|reduce noise|enhance (?:the )?(?:quality|resolution|detail))\b/i,
    directives:
      ' Increase clarity and resolution: recover fine detail, reduce noise and ' +
      'blur, and crisp up edges while keeping the image faithful to the original ' +
      '— no added or hallucinated content, no over-sharpening halos.',
  },
  {
    // Color grading
    re: /\b(colou?r grade|colou?r grading|colou?r correct|white balance|warmer|cooler|saturation|vibrance|teal and orange|cinematic colou?r|tone|contrast)\b/i,
    directives:
      ' Apply professional color grading: adjust white balance, contrast and ' +
      'tonal palette tastefully for a cohesive cinematic look, without clipping ' +
      'highlights or shadows and without changing the content or composition.',
  },
];

// Always appended to an edit: enforce surgical, region-aware editing. gpt-image-1
// is prompt-guided (no mask), so we instruct it explicitly to change only the
// requested region and leave everything else pixel-faithful.
const REGION_PRESERVATION =
  ' IMPORTANT — edit surgically: modify ONLY the specific region or element the ' +
  'instruction asks for, and keep the entire rest of the image identical to the ' +
  'source (same subject identity, faces, composition, framing, perspective, ' +
  'depth, lighting and colors). Do not restyle, shift, re-render or "improve" ' +
  'unrequested areas. Blend the edited region seamlessly so the result looks ' +
  'like the same original photograph with only the requested change applied.';

function editTypeDirectives(prompt: string): string {
  return EDIT_RULES.filter((r) => r.re.test(prompt))
    .map((r) => r.directives)
    .join('');
}

/**
 * Build the enhanced edit instruction sent to gpt-image-1.
 * Returns a single prompt string; never throws.
 */
export function enhanceTransformPrompt(userPrompt: string): string {
  const request = (userPrompt ?? '').trim() || 'subtly enhance the photo';

  let prompt =
    `Edit this photograph as instructed: "${request}". ${REALISM_DIRECTIVES}`;

  if (hasPoseIntent(request)) {
    prompt += POSE_DIRECTIVES;
  }

  prompt += editTypeDirectives(request);
  prompt += REGION_PRESERVATION;

  return prompt;
}
