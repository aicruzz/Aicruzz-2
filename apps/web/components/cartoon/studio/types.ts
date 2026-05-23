import type { LucideIcon } from 'lucide-react';
import { Megaphone, UserRound, Sparkles, Drama } from 'lucide-react';

export type CartoonMode =
  | 'ANIMATED_AD'
  | 'HUMAN_CARTOON'
  | 'CUSTOM_CHARACTER'
  | 'CLASSIC_CARTOON';

export type VoiceMode = 'NONE' | 'AI' | 'UPLOAD' | 'CLONE';

export interface ModeConfig {
  key: CartoonMode;
  label: string;
  icon: LucideIcon;
  blurb: string;
  fields: {
    prompt: boolean;
    promptRequired: boolean;
    face: boolean;          // face/subject image (upload or asset)
    faceRequired: boolean;
    background: boolean;
    logo: boolean;
    character: boolean;     // saved custom character picker
    duration: boolean;
    template: boolean;
  };
  styles: string[];
  defaultStyle: string;
}

// Per-tab field + style config. Mirrors backend mode behavior; the
// backend cartoonType enum is untouched (mode sent at the app layer).
export const MODE_CONFIGS: Record<CartoonMode, ModeConfig> = {
  ANIMATED_AD: {
    key: 'ANIMATED_AD',
    label: 'Animated Ad',
    icon: Megaphone,
    blurb: 'Cinematic animated advertisements & story videos.',
    fields: {
      prompt: true, promptRequired: true, face: false, faceRequired: false,
      background: true, logo: true, character: true, duration: true, template: true,
    },
    styles: ['cinematic', 'vibrant cartoon', 'storybook', '3D rendered', 'flat motion'],
    defaultStyle: 'cinematic',
  },
  HUMAN_CARTOON: {
    key: 'HUMAN_CARTOON',
    label: 'Human Cartoon',
    icon: UserRound,
    blurb: 'Turn a real photo into an animated cartoon character.',
    fields: {
      prompt: true, promptRequired: false, face: true, faceRequired: true,
      background: false, logo: false, character: false, duration: false, template: false,
    },
    styles: ['Pixar 3D', 'anime', 'Disney', 'comic book', 'cinematic cartoon'],
    defaultStyle: 'Pixar 3D',
  },
  CUSTOM_CHARACTER: {
    key: 'CUSTOM_CHARACTER',
    label: 'Custom Character',
    icon: Sparkles,
    blurb: 'Reusable branded characters & recurring cartoon actors.',
    fields: {
      prompt: true, promptRequired: true, face: true, faceRequired: false,
      background: true, logo: false, character: true, duration: true, template: true,
    },
    styles: ['mascot', '3D rendered', 'anime', 'flat vector', 'cinematic'],
    defaultStyle: '3D rendered',
  },
  CLASSIC_CARTOON: {
    key: 'CLASSIC_CARTOON',
    label: 'Classic Cartoon',
    icon: Drama,
    blurb: 'Traditional slapstick, exaggerated retro animation.',
    fields: {
      prompt: true, promptRequired: true, face: false, faceRequired: false,
      background: false, logo: false, character: false, duration: true, template: false,
    },
    styles: ['Tom & Jerry', 'old-school', 'slapstick', 'rubber-hose', 'Saturday morning'],
    defaultStyle: 'old-school',
  },
};

export const QUALITY_OPTIONS = [
  { value: 'FAST', label: 'Fast', hint: 'Pika · fastest, low cost' },
  { value: 'STANDARD', label: 'Standard', hint: 'Pika · balanced' },
  { value: 'HIGH', label: 'High', hint: 'Runway · cinematic' },
  { value: 'ULTRA', label: 'Ultra', hint: 'Runway · max quality' },
] as const;

export const ASPECT_OPTIONS = ['16:9', '9:16', '1:1', '4:3'] as const;

export const VOICE_EMOTIONS = [
  'neutral', 'cheerful', 'dramatic', 'calm', 'energetic', 'sad', 'serious',
] as const;

// Client-side credit estimate (mirrors backend CARTOON_MODE_CREDIT_RATES
// so the preview is accurate without an extra round-trip).
const MODE_RATES: Record<CartoonMode, number> = {
  ANIMATED_AD: 25,
  HUMAN_CARTOON: 15,
  CUSTOM_CHARACTER: 20,
  CLASSIC_CARTOON: 18,
};

export function estimateCredits(mode: CartoonMode, durationSecs: number): number {
  const base = MODE_RATES[mode];
  if (mode === 'ANIMATED_AD') {
    return parseFloat((base * (durationSecs / 5)).toFixed(2));
  }
  return base;
}
