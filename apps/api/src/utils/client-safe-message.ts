/**
 * User-facing copy only — never put provider stack traces, axios bodies, or
 * router internals here. Log those with `logger` at the call site.
 */
export const CLIENT_SAFE = {
  AI_GENERIC:
    'Something went wrong with the AI service. Please try again in a moment.',
  CHAT_STREAM:
    'We could not complete this reply. Please try again.',
  IMAGE_GEN:
    'Image generation could not be completed. Please try again.',
  VIDEO_FAILED:
    'Video generation could not be completed. Credits were refunded if applicable.',
  VIDEO_QUEUE:
    'We could not start your video job. Credits were refunded.',
  CARTOON_FAILED:
    'Cartoon generation could not be completed. Credits were refunded if applicable.',
  CARTOON_QUEUE:
    'We could not start your cartoon job. Credits were refunded.',
  ROUTER_UNAVAILABLE:
    'AI processing is temporarily unavailable. Please try again.',
  PUBLIC_API_AI:
    'The AI provider could not complete this request. Please try again.',
} as const;

/** DB + SSE: safe stored message when a job fails (no upstream internals). */
export function safeMediaJobFailureMessage(): string {
  return 'Generation failed. Please try again or contact support if this continues.';
}
