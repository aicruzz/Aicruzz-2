export type BannerModule = 'VIDEO' | 'CARTOON' | 'LIVE_CAM' | 'CHAT';

export const BANNER_MODULES: BannerModule[] = [
  'VIDEO',
  'CARTOON',
  'LIVE_CAM',
  'CHAT',
];

// Free-form, all-optional settings surfaced in the viewer modal and
// best-effort mapped into studio controls by "Use This Prompt".
export interface BannerMetadata {
  durationSecs?: number;
  aspectRatio?: string;
  qualityTier?: string;
  voiceMode?: string;
  resolution?: string;
}

export interface CreateBannerInput {
  module: BannerModule;
  title: string;
  prompt: string;
  videoUrl: string;
  thumbnailUrl?: string;
  tags?: string[];
  metadata?: BannerMetadata;
  isActive?: boolean;
  isNew?: boolean;
  sortOrder?: number;
  rotationInterval?: number;
}

export type UpdateBannerInput = Partial<CreateBannerInput>;

export interface ReorderBannersInput {
  items: { id: string; sortOrder: number }[];
}
