import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../config/database';
import { userAssets, customCharacters } from '../../db/schema';
import { AppError } from '../../middleware/error.middleware';
import type {
  AssetType,
  CreateAssetInput,
  UpdateAssetInput,
  CreateCharacterInput,
  UpdateCharacterInput,
} from './assets.types';

// ─── REUSABLE ASSETS (faces / voices / backgrounds / logos / scenes) ──

export async function createAsset(userId: string, input: CreateAssetInput) {
  const [asset] = await db
    .insert(userAssets)
    .values({
      userId,
      type: input.type,
      name: input.name,
      url: input.url,
      thumbnailUrl: input.thumbnailUrl,
      meta: input.meta ?? null,
    })
    .returning();
  return asset;
}

export async function listAssets(userId: string, type?: AssetType) {
  const conditions = [eq(userAssets.userId, userId)];
  if (type) conditions.push(eq(userAssets.type, type));
  return db
    .select()
    .from(userAssets)
    .where(and(...conditions))
    .orderBy(desc(userAssets.createdAt));
}

export async function updateAsset(
  assetId: string,
  userId: string,
  input: UpdateAssetInput,
) {
  const owned = await db.query.userAssets.findFirst({
    where: and(eq(userAssets.id, assetId), eq(userAssets.userId, userId)),
    columns: { id: true },
  });
  if (!owned) throw new AppError('Asset not found', 404);

  const [updated] = await db
    .update(userAssets)
    .set({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.thumbnailUrl !== undefined && { thumbnailUrl: input.thumbnailUrl }),
      ...(input.meta !== undefined && { meta: input.meta }),
      updatedAt: new Date(),
    })
    .where(eq(userAssets.id, assetId))
    .returning();
  return updated;
}

export async function deleteAsset(assetId: string, userId: string) {
  const owned = await db.query.userAssets.findFirst({
    where: and(eq(userAssets.id, assetId), eq(userAssets.userId, userId)),
    columns: { id: true },
  });
  if (!owned) throw new AppError('Asset not found', 404);
  await db.delete(userAssets).where(eq(userAssets.id, assetId));
}

/**
 * Resolve an owned asset id to its stored URL. Used by the cartoon
 * orchestrator for asset-based resolution. Returns undefined when no id
 * is given; throws only when a referenced id is missing/not owned.
 */
export async function resolveAssetUrl(
  userId: string,
  assetId?: string,
): Promise<string | undefined> {
  if (!assetId) return undefined;
  const asset = await db.query.userAssets.findFirst({
    where: and(eq(userAssets.id, assetId), eq(userAssets.userId, userId)),
    columns: { url: true },
  });
  if (!asset) throw new AppError('Referenced asset not found', 404);
  return asset.url;
}

// ─── REUSABLE CUSTOM CHARACTERS ───────────────────────────────

export async function createCharacter(userId: string, input: CreateCharacterInput) {
  const [character] = await db
    .insert(customCharacters)
    .values({
      userId,
      name: input.name,
      description: input.description,
      baseImageUrl: input.baseImageUrl,
      expressions: input.expressions ?? [],
      stylePrompt: input.stylePrompt,
      thumbnailUrl: input.thumbnailUrl ?? input.baseImageUrl,
    })
    .returning();
  return character;
}

export async function listCharacters(userId: string) {
  return db
    .select()
    .from(customCharacters)
    .where(eq(customCharacters.userId, userId))
    .orderBy(desc(customCharacters.createdAt));
}

export async function getCharacter(characterId: string, userId: string) {
  const character = await db.query.customCharacters.findFirst({
    where: and(
      eq(customCharacters.id, characterId),
      eq(customCharacters.userId, userId),
    ),
  });
  if (!character) throw new AppError('Custom character not found', 404);
  return character;
}

export async function updateCharacter(
  characterId: string,
  userId: string,
  input: UpdateCharacterInput,
) {
  await getCharacter(characterId, userId); // ownership guard
  const [updated] = await db
    .update(customCharacters)
    .set({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.baseImageUrl !== undefined && { baseImageUrl: input.baseImageUrl }),
      ...(input.expressions !== undefined && { expressions: input.expressions }),
      ...(input.stylePrompt !== undefined && { stylePrompt: input.stylePrompt }),
      ...(input.thumbnailUrl !== undefined && { thumbnailUrl: input.thumbnailUrl }),
      updatedAt: new Date(),
    })
    .where(eq(customCharacters.id, characterId))
    .returning();
  return updated;
}

export async function deleteCharacter(characterId: string, userId: string) {
  await getCharacter(characterId, userId); // ownership guard
  await db.delete(customCharacters).where(eq(customCharacters.id, characterId));
}
