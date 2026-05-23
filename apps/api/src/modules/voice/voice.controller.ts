import { Request, Response } from 'express';
import * as voiceService from './voice.service';
import { sendSuccess, sendCreated } from '../../utils/response';

export async function generateVoice(req: Request, res: Response): Promise<void> {
  const result = await voiceService.generateVoice(req.user!.userId, req.body);
  sendCreated(res, result, 'Voice generated');
}

export async function cloneVoice(req: Request, res: Response): Promise<void> {
  const asset = await voiceService.cloneVoice(req.user!.userId, req.body);
  sendCreated(res, asset, 'Voice cloned and saved');
}

export async function listSavedVoices(req: Request, res: Response): Promise<void> {
  const voices = await voiceService.listSavedVoices(req.user!.userId);
  sendSuccess(res, voices, 'Saved voices retrieved');
}

export async function linkVoice(req: Request, res: Response): Promise<void> {
  const link = await voiceService.linkVoiceToCharacter(req.user!.userId, req.body);
  sendCreated(res, link, 'Voice linked to character');
}

export async function unlinkVoice(req: Request, res: Response): Promise<void> {
  await voiceService.unlinkVoiceFromCharacter(
    req.user!.userId,
    req.params.characterId,
  );
  sendSuccess(res, null, 'Voice unlinked from character');
}
