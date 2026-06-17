import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { requireLegalConsent } from '../../middleware/legal.middleware';
import {
  sendMessageValidator,
  updateChatTitleValidator,
  listChatsValidator,
  enhancePromptValidator,
} from './chat.validators';
import {
  UPLOAD_LIMITS,
  ALL_SUPPORTED_UPLOAD_FORMATS,
} from './capabilities/config';
import * as chatController from './chat.controller';

const router = Router();

// Chat attachments are streamed straight to Cloudinary, so we hold the file in
// memory (not disk). Size + allowed formats come from the single shared upload
// config so multer can never disagree with the frontend or validators.
const chatUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: UPLOAD_LIMITS.maxFileSizeBytes },
  fileFilter: (_req, file, cb) => {
    ALL_SUPPORTED_UPLOAD_FORMATS.includes(file.mimetype)
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

// GET    /api/chat/config — shared upload limits (single source of truth).
// Declared before /:chatId so it isn't captured as a chat id.
router.get('/config', chatController.getConfig);

// GET    /api/chat/:chatId
router.get('/:chatId', chatController.getChat);

// DELETE /api/chat/:chatId
router.delete('/:chatId', chatController.deleteChat);

// PATCH  /api/chat/:chatId/title
router.patch('/:chatId/title', updateChatTitleValidator, validate, chatController.updateTitle);

// POST   /api/chat/message — SSE streaming
router.post('/message', sendMessageValidator, validate, chatController.sendMessage);

// POST   /api/chat/enhance-prompt — prompt assistant (improve/expand/optimize)
router.post('/enhance-prompt', enhancePromptValidator, validate, chatController.enhancePrompt);

// POST   /api/chat/upload — multipart file; uploaded server-side to Cloudinary
router.post('/upload', chatUpload.single('file'), chatController.uploadFile);

export { router as chatRouter };