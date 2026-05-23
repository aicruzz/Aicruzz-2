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

  return prompt;
}
