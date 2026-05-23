import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../config/env';
import { AppError } from '../middleware/error.middleware';

export type UploadCategory =
  | 'avatars'
  | 'crypto-proofs'
  | 'chat-images'
  | 'chat-videos'
  | 'cartoon-assets'
  | 'video-inputs'
  | 'generated';

const ALLOWED_MIME: Record<UploadCategory, string[]> = {
  avatars: ['image/jpeg', 'image/png', 'image/webp'],
  'crypto-proofs': ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
  'chat-images': ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  'chat-videos': ['video/mp4', 'video/webm', 'video/quicktime'],
  'cartoon-assets': ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'],
  'video-inputs': ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'],
  generated: ['video/mp4', 'image/jpeg', 'image/png', 'image/webp'],
};

const MAX_FILE_SIZE: Record<UploadCategory, number> = {
  avatars: 5 * 1024 * 1024,         // 5 MB
  'crypto-proofs': 10 * 1024 * 1024, // 10 MB
  'chat-images': 20 * 1024 * 1024,   // 20 MB
  'chat-videos': 100 * 1024 * 1024,  // 100 MB
  'cartoon-assets': 20 * 1024 * 1024,
  'video-inputs': 200 * 1024 * 1024, // 200 MB
  generated: 500 * 1024 * 1024,      // 500 MB
};

export function getUploadDir(category: UploadCategory): string {
  const dir = path.join(path.resolve(env.UPLOAD_DIR), category);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function validateFileType(mimetype: string, category: UploadCategory): void {
  if (!ALLOWED_MIME[category].includes(mimetype)) {
    throw new AppError(
      `File type not allowed for ${category}. Allowed: ${ALLOWED_MIME[category].join(', ')}`,
      415,
    );
  }
}

export function validateFileSize(size: number, category: UploadCategory): void {
  if (size > MAX_FILE_SIZE[category]) {
    const maxMB = (MAX_FILE_SIZE[category] / 1024 / 1024).toFixed(0);
    throw new AppError(`File too large for ${category}. Maximum size: ${maxMB} MB`, 413);
  }
}

export function generateFilename(originalName: string): string {
  const ext = path.extname(originalName).toLowerCase();
  return `${uuidv4()}${ext}`;
}

export function getPublicUrl(category: UploadCategory, filename: string): string {
  return `/uploads/${category}/${filename}`;
}

export function deleteFile(category: UploadCategory, filename: string): void {
  const filePath = path.join(getUploadDir(category), filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

export function getAllowedTypes(category: UploadCategory): string[] {
  return ALLOWED_MIME[category];
}

export function getMaxSize(category: UploadCategory): number {
  return MAX_FILE_SIZE[category];
}
