import { Request, Response } from 'express';
import * as assetsService from './assets.service';
import { sendSuccess, sendCreated } from '../../utils/response';
import type { AssetType } from './assets.types';

// ─── ASSETS ───────────────────────────────────────────────────

export async function createAsset(req: Request, res: Response): Promise<void> {
  const asset = await assetsService.createAsset(req.user!.userId, req.body);
  sendCreated(res, asset, 'Asset saved');
}

export async function listAssets(req: Request, res: Response): Promise<void> {
  const type = req.query.type as AssetType | undefined;
  const assets = await assetsService.listAssets(req.user!.userId, type);
  sendSuccess(res, assets, 'Assets retrieved');
}

export async function updateAsset(req: Request, res: Response): Promise<void> {
  const asset = await assetsService.updateAsset(
    req.params.assetId,
    req.user!.userId,
    req.body,
  );
  sendSuccess(res, asset, 'Asset updated');
}

export async function deleteAsset(req: Request, res: Response): Promise<void> {
  await assetsService.deleteAsset(req.params.assetId, req.user!.userId);
  sendSuccess(res, null, 'Asset deleted');
}

// ─── CUSTOM CHARACTERS ────────────────────────────────────────

export async function createCharacter(req: Request, res: Response): Promise<void> {
  const character = await assetsService.createCharacter(req.user!.userId, req.body);
  sendCreated(res, character, 'Character created');
}

export async function listCharacters(req: Request, res: Response): Promise<void> {
  const characters = await assetsService.listCharacters(req.user!.userId);
  sendSuccess(res, characters, 'Characters retrieved');
}

export async function getCharacter(req: Request, res: Response): Promise<void> {
  const character = await assetsService.getCharacter(
    req.params.characterId,
    req.user!.userId,
  );
  sendSuccess(res, character, 'Character retrieved');
}

export async function updateCharacter(req: Request, res: Response): Promise<void> {
  const character = await assetsService.updateCharacter(
    req.params.characterId,
    req.user!.userId,
    req.body,
  );
  sendSuccess(res, character, 'Character updated');
}

export async function deleteCharacter(req: Request, res: Response): Promise<void> {
  await assetsService.deleteCharacter(req.params.characterId, req.user!.userId);
  sendSuccess(res, null, 'Character deleted');
}
