import { Request, Response } from 'express';
import * as chatService from './chat.service';
import {
  uploadBufferToCloudinary,
  isCloudinaryConfigured,
} from '../../config/cloudinary';
import { sendSuccess, sendCreated, sendError } from '../../utils/response';

const IMAGE_MAX = 20 * 1024 * 1024;  // 20 MB
const VIDEO_MAX = 100 * 1024 * 1024; // 100 MB

// GET /api/chat
export async function listChats(req: Request, res: Response): Promise<void> {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const result = await chatService.listChats(req.user!.userId, page, limit);
  sendSuccess(res, result.chats, 'Chats retrieved', 200, {
    page,
    limit,
    total: result.total,
    totalPages: result.totalPages,
  });
}

// GET /api/chat/:chatId
export async function getChat(req: Request, res: Response): Promise<void> {
  const chat = await chatService.getChatById(req.params.chatId, req.user!.userId);
  sendSuccess(res, chat, 'Chat retrieved');
}

// POST /api/chat
export async function createChat(req: Request, res: Response): Promise<void> {
  const { model } = req.body as { model?: string };
  const chat = await chatService.createChat(req.user!.userId, model);
  sendCreated(res, chat, 'Chat created');
}

// DELETE /api/chat/:chatId
export async function deleteChat(req: Request, res: Response): Promise<void> {
  await chatService.deleteChat(req.params.chatId, req.user!.userId);
  sendSuccess(res, null, 'Chat deleted');
}

// PATCH /api/chat/:chatId/title
export async function updateTitle(req: Request, res: Response): Promise<void> {
  await chatService.updateTitle(req.params.chatId, req.user!.userId, req.body.title);
  sendSuccess(res, null, 'Title updated');
}

// POST /api/chat/message — SSE streaming
export async function sendMessage(req: Request, res: Response): Promise<void> {
  await chatService.sendMessage(req.user!.userId, req.body, res);
}

// POST /api/chat/enhance-prompt — prompt assistant (improve/expand/optimize).
// Plain JSON; no credits, no chat persistence, no SSE.
export async function enhancePrompt(req: Request, res: Response): Promise<void> {
  const { action, prompt } = req.body as {
    action: chatService.EnhanceAction;
    prompt: string;
  };
  const enhancedPrompt = await chatService.enhancePrompt(action, prompt);
  sendSuccess(res, { enhancedPrompt }, 'Prompt enhanced');
}

// POST /api/chat/upload — multipart file; uploaded server-side to Cloudinary.
// Returns the public https URL the client attaches to a chat message.
export async function uploadFile(req: Request, res: Response): Promise<void> {
  const file = req.file;
  if (!file) {
    sendError(res, 'No file uploaded', 400);
    return;
  }

  const isVideo = file.mimetype.startsWith('video/');
  const maxSize = isVideo ? VIDEO_MAX : IMAGE_MAX;
  if (file.size > maxSize) {
    sendError(res, `File too large. Max: ${isVideo ? '100 MB' : '20 MB'}`, 413);
    return;
  }

  if (!isCloudinaryConfigured()) {
    sendError(res, 'Storage not configured (CLOUDINARY_* missing)', 500);
    return;
  }

  try {
    const { url: fileUrl, key } = await uploadBufferToCloudinary(file.buffer, {
      folder: isVideo ? 'chat-videos' : 'chat-images',
      resourceType: isVideo ? 'video' : 'image',
    });
    sendSuccess(res, { fileUrl, key }, 'File uploaded');
  } catch (err) {
    console.error('[chat/upload] Cloudinary upload failed', err);
    sendError(res, 'Upload failed', 502);
  }
}