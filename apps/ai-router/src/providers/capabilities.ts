/**
 * provider-capabilities
 * ----------------------------------------------------------------------------
 * Centralized, provider-aware capability registry. Each video model declares
 * the dimensions it accepts and how to render them into the token its API
 * expects. Providers consume these via mapToSupportedSize() in
 * utils/video-resolution.ts — so model/dimension rules live in ONE place and
 * future model upgrades are a config change here only (no scattered literals).
 */

import type { ModelCapability } from '../utils/video-resolution';

/**
 * Runway. gen4_turbo accepts a fixed set of "W:H" ratio tokens. The supported
 * sizes mirror Runway's accepted ratios; the body token is just "WxH"→"W:H".
 */
export const RUNWAY_MODEL_CAPABILITIES: Record<string, ModelCapability> = {
  gen4_turbo: {
    supportedSizes: [
      '1280x720',
      '720x1280',
      '1104x832',
      '832x1104',
      '960x960',
      '1584x672',
    ],
    defaultLandscape: '1280x720',
    defaultPortrait: '720x1280',
    defaultSquare: '960x960',
    toRatioToken: (size) => size.replace('x', ':'),
  },
};

/**
 * Pika (via fal). Pika takes classic aspect tokens, not "WxH". This profile is
 * behavior-preserving: it reproduces the previous getAspectRatio() output
 * (`16:9` landscape, `9:16` portrait, `1:1` square) via proxy sizes. Pika's
 * square band is wider than the default — see PIKA_SQUARE_TOLERANCE.
 */
export const PIKA_SQUARE_TOLERANCE = 0.15;

export const PIKA_MODEL_CAPABILITIES: Record<string, ModelCapability> = {
  default: {
    supportedSizes: ['1280x720', '720x1280', '1024x1024'],
    defaultLandscape: '1280x720',
    defaultPortrait: '720x1280',
    defaultSquare: '1024x1024',
    toRatioToken: (size) => {
      switch (size) {
        case '720x1280':
          return '9:16';
        case '1024x1024':
          return '1:1';
        default:
          return '16:9';
      }
    },
  },
};
