import type { AiModule } from '../types';

/** Short message returned in RouteResponse.result.error — never upstream details. */
export function publicRouteFailureMessage(module: AiModule): string {
  switch (module) {
    case 'CHAT':
      return 'The assistant could not complete this request. Please try again.';
    case 'IMAGE':
      return 'Image generation could not be completed. Please try again.';
    case 'IMAGE_TRANSFORM':
      return 'Image transformation could not be completed. Your original image was not changed. Please try again.';
    case 'VIDEO':
      return 'Video generation could not be completed. Please try again.';
    case 'CARTOON':
      return 'Cartoon generation could not be completed. Please try again.';
    case 'VOICE':
      return 'Voice generation could not be completed. Please try again.';
    case 'LIVE_CAM':
      return 'Live processing could not be completed. Please try again.';
    default:
      return 'The AI request could not be completed. Please try again.';
  }
}
