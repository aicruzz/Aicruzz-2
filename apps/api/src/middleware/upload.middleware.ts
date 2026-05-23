import multer, { StorageEngine } from 'multer';
import { Request } from 'express';
import { getUploadDir, generateFilename, getAllowedTypes, getMaxSize, type UploadCategory } from '../services/upload.service';

function createStorage(category: UploadCategory): StorageEngine {
  return multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, getUploadDir(category)),
    filename: (_req, file, cb) => cb(null, generateFilename(file.originalname)),
  });
}

function createUploader(category: UploadCategory) {
  return multer({
    storage: createStorage(category),
    limits: { fileSize: getMaxSize(category) },
    fileFilter: (_req: Request, file, cb) => {
      if (getAllowedTypes(category).includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error(`File type not allowed. Accepted: ${getAllowedTypes(category).join(', ')}`));
      }
    },
  });
}

export const uploadAvatar = createUploader('avatars');
export const uploadCryptoProof = createUploader('crypto-proofs');
export const uploadChatImage = createUploader('chat-images');
export const uploadChatVideo = createUploader('chat-videos');
export const uploadCartoonAsset = createUploader('cartoon-assets');
export const uploadVideoInput = createUploader('video-inputs');
