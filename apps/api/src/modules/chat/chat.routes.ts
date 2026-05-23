import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { requireLegalConsent } from '../../middleware/legal.middleware';
import {
  sendMessageValidator,
  updateChatTitleValidator,
  listChatsValidator,
} from './chat.validators';
import * as chatController from './chat.controller';

const router = Router();

// Chat attachments are streamed straight to Cloudinary, so we hold the file
// in memory (not disk) — videos can be up to 100 MB (enforced per-type below).
const chatUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'image/jpeg', 'image/png', 'image/webp', 'image/gif',
      'video/mp4', 'video/webm', 'video/quicktime',
    ];
    allowed.includes(file.mimetype)
      ? cb(null, true)
      : cb(new Error('File type not allowed'));
  },
});

// All chat routes require auth + legal consent
router.use(authenticate);
router.use(requireLegalConsent('CHAT'));

// GET    /api/chat
router.get('/', listChatsValidator, validate, chatController.listChats);

// POST   /api/chat
router.post('/', chatController.createChat);

// GET    /api/chat/:chatId
router.get('/:chatId', chatController.getChat);

// DELETE /api/chat/:chatId
router.delete('/:chatId', chatController.deleteChat);

// PATCH  /api/chat/:chatId/title
router.patch('/:chatId/title', updateChatTitleValidator, validate, chatController.updateTitle);

// POST   /api/chat/message — SSE streaming
router.post('/message', sendMessageValidator, validate, chatController.sendMessage);

// POST   /api/chat/upload — multipart file; uploaded server-side to Cloudinary
router.post('/upload', chatUpload.single('file'), chatController.uploadFile);

export { router as chatRouter };