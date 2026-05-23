export type BannerModule = 'VIDEO' | 'CARTOON' | 'LIVE_CAM' | 'CHAT';

// Maps a banner's module to its studio route + a human label.
export const MODULE_ROUTES: Record<
  BannerModule,
  { path: string; label: string }
> = {
  VIDEO: { path: '/video-studio', label: 'Video Studio' },
  CARTOON: { path: '/cartoon-studio', label: 'Cartoon Studio' },
  CHAT: { path: '/chat-studio', label: 'AI Chat' },
  LIVE_CAM: { path: '/live-cam', label: 'Live Cam' },
};

// All-optional settings shown in the viewer and best-effort mapped into
// studio controls by "Use This Prompt".
export interface BannerMetadata {
  durationSecs?: number;
  aspectRatio?: string;
  qualityTier?: string;
  voiceMode?: string;
  resolution?: string;
}

export interface Banner {
  id: string;
  module: BannerModule;
  title: string;
  prompt: string;
  videoUrl: string;
  thumbnailUrl?: string | null;
  tags?: string[] | null;
  metadata?: BannerMetadata | null;
  isActive: boolean;
  isNew: boolean;
  sortOrder: number;
  rotationInterval: number;
  createdAt: string;
  updatedAt: string;
}
