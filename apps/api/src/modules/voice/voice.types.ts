export type VoiceMode = 'NONE' | 'UPLOAD' | 'CLONE' | 'AI';
export type VoiceGender = 'MALE' | 'FEMALE';

export interface GenerateVoiceInput {
  text: string;
  gender?: VoiceGender;
  voiceId?: string;          // explicit ElevenLabs voice id
  voiceAssetId?: string;     // a saved reusable voice (user_assets type VOICE)
  style?: string;            // emotional tone (e.g. "cheerful", "dramatic")
  stability?: number;        // 0..1
  similarity?: number;       // 0..1
}

export interface CloneVoiceInput {
  name: string;
  sampleUrl?: string;        // direct sample URL
  sampleAssetId?: string;    // or a saved asset to clone from
  // Safety: explicit per-action consent for biometric voice cloning,
  // on top of the global legal-consent middleware.
  consentConfirmed: boolean;
}

export interface LinkVoiceInput {
  characterId: string;
  voiceAssetId: string;
}

export interface GeneratedVoice {
  audioUrl: string;
  durationSeconds: number;
  voiceId?: string;
  subtitlesVtt: string;
}
