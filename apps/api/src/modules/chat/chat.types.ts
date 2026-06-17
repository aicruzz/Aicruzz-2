export type MessageRole = 'USER' | 'ASSISTANT' | 'SYSTEM';

export interface SendMessageInput {
  chatId?: string;        // omit to create a new chat
  content: string;
  imageUrl?: string;
  // Up to CHAT_MAX_IMAGES uploaded images, in display order. When present this
  // supersedes the single imageUrl (imageUrl is kept = imageUrls[0] for compat).
  imageUrls?: string[];
  videoUrl?: string;
  model?: string;
  strategy?: 'COST' | 'SPEED' | 'QUALITY' | 'AUTO';
  stream?: boolean;
  // Quality tier for image transformation/editing of an uploaded image.
  // FAST = quick edit; PRO = max quality + 2x clarity upscale. Default FAST.
  editQuality?: 'FAST' | 'PRO';
}

export interface ChatSummary {
  id: string;
  title: string;
  model: string;
  totalCredits: number;
  lastMessage?: string;
  createdAt: Date;
  updatedAt: Date;
  _count: { messages: number };
}

export interface ChatDetail {
  id: string;
  title: string;
  model: string;
  strategy: string;
  totalCredits: number;
  messages: ChatMessageDto[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatMessageDto {
  id: string;
  role: MessageRole;
  content: string;
  imageUrl: string | null;
  videoUrl: string | null;
  provider: string | null;
  model: string | null;
  tokensUsed: number | null;
  latencyMs: number | null;
  createdAt: Date;
}

// Maximum number of images a single chat message may attach.
export const CHAT_MAX_IMAGES = 4;

// Cost per message in credits
export const CHAT_CREDITS_PER_MESSAGE = 2;
// Cost per generated image (DALL-E 3 standard) — matches IMAGE_STANDARD pricing.
export const CHAT_IMAGE_GEN_CREDITS = 5;
// Cost per image transformation/edit of an uploaded photo.
// PRO additionally runs a 2x clarity upscale, hence the higher charge.
export const CHAT_IMAGE_EDIT_CREDITS_FAST = 6;
export const CHAT_IMAGE_EDIT_CREDITS_PRO = 12;
