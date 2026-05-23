import { and, eq } from 'drizzle-orm';
import { db } from '../../config/database';
import { userAssets, characterVoiceLinks } from '../../db/schema';
import { aiRouter } from '../../services/ai-router.client';
import { AppError } from '../../middleware/error.middleware';
import { logger } from '../../utils/logger';
import {
  resolveAssetUrl,
  createAsset,
  getCharacter,
  listAssets,
} from '../assets/assets.service';
import { buildSubtitlesVtt } from './subtitles';
import type {
  GenerateVoiceInput,
  CloneVoiceInput,
  LinkVoiceInput,
  GeneratedVoice,
} from './voice.types';

/** Resolve a saved VOICE asset (owner-scoped) to its ElevenLabs voiceId. */
async function voiceIdFromAsset(
  userId: string,
  voiceAssetId?: string,
): Promise<string | undefined> {
  if (!voiceAssetId) return undefined;
  const asset = await db.query.userAssets.findFirst({
    where: and(eq(userAssets.id, voiceAssetId), eq(userAssets.userId, userId)),
    columns: { type: true, meta: true },
  });
  if (!asset || asset.type !== 'VOICE') {
    throw new AppError('Saved voice not found', 404);
  }
  return (asset.meta as { voiceId?: string } | null)?.voiceId;
}

// ─── AI VOICE GENERATION ──────────────────────────────────────

export async function generateVoice(
  userId: string,
  input: GenerateVoiceInput,
): Promise<GeneratedVoice> {
  const voiceId = input.voiceId ?? (await voiceIdFromAsset(userId, input.voiceAssetId));

  const result = await aiRouter.route({
    userId,
    module: 'VOICE',
    strategy: 'QUALITY',
    text: input.text,
    voiceId,
    voiceGender: input.gender,
    voiceStyle: input.style,
    voiceStability: input.stability,
    voiceSimilarity: input.similarity,
  });

  if (!result.success || !result.result.audioUrl) {
    throw new AppError(
      result.result.error ?? 'Voice generation failed',
      502,
    );
  }

  const durationSeconds =
    result.result.durationSeconds ?? Math.max(1, input.text.length / 15);

  return {
    audioUrl: result.result.audioUrl,
    durationSeconds,
    voiceId: (result.result.raw as { voiceId?: string } | undefined)?.voiceId,
    subtitlesVtt: buildSubtitlesVtt(input.text, durationSeconds),
  };
}

// ─── VOICE CLONING (consent-gated) ────────────────────────────

export async function cloneVoice(userId: string, input: CloneVoiceInput) {
  // Safety: explicit per-action biometric-cloning consent, in addition
  // to the global legal-consent middleware on the route.
  if (input.consentConfirmed !== true) {
    throw new AppError(
      'Voice cloning requires explicit consent confirmation',
      400,
    );
  }

  const sampleUrl =
    input.sampleUrl ?? (await resolveAssetUrl(userId, input.sampleAssetId));
  if (!sampleUrl) {
    throw new AppError('A voice sample (sampleUrl or sampleAssetId) is required', 400);
  }

  const result = await aiRouter.route({
    userId,
    module: 'VOICE',
    strategy: 'QUALITY',
    voiceCloneUrl: sampleUrl,
    voiceCloneName: input.name,
  });

  const voiceId = (result.result.raw as { voiceId?: string } | undefined)?.voiceId;
  if (!result.success || !voiceId) {
    throw new AppError(result.result.error ?? 'Voice cloning failed', 502);
  }

  // Persist as a reusable saved voice (user_assets type VOICE).
  return createAsset(userId, {
    type: 'VOICE',
    name: input.name,
    url: sampleUrl,
    meta: { voiceId, cloned: true, consentConfirmed: true },
  });
}

export function listSavedVoices(userId: string) {
  return listAssets(userId, 'VOICE');
}

// ─── VOICE ↔ CHARACTER LINKING ────────────────────────────────

export async function linkVoiceToCharacter(
  userId: string,
  input: LinkVoiceInput,
) {
  await getCharacter(input.characterId, userId); // ownership guard
  const voice = await db.query.userAssets.findFirst({
    where: and(
      eq(userAssets.id, input.voiceAssetId),
      eq(userAssets.userId, userId),
    ),
    columns: { type: true },
  });
  if (!voice || voice.type !== 'VOICE') {
    throw new AppError('Saved voice not found', 404);
  }

  // One voice per character — replace any existing link.
  return db.transaction(async (tx) => {
    await tx
      .delete(characterVoiceLinks)
      .where(eq(characterVoiceLinks.characterId, input.characterId));
    const [link] = await tx
      .insert(characterVoiceLinks)
      .values({
        userId,
        characterId: input.characterId,
        voiceAssetId: input.voiceAssetId,
      })
      .returning();
    return link;
  });
}

export async function unlinkVoiceFromCharacter(
  userId: string,
  characterId: string,
) {
  await getCharacter(characterId, userId); // ownership guard
  await db
    .delete(characterVoiceLinks)
    .where(eq(characterVoiceLinks.characterId, characterId));
}

/** Voice asset id linked to a character (used by the cartoon flow). */
export async function getCharacterVoiceAssetId(
  userId: string,
  characterId: string,
): Promise<string | undefined> {
  const link = await db.query.characterVoiceLinks.findFirst({
    where: and(
      eq(characterVoiceLinks.characterId, characterId),
      eq(characterVoiceLinks.userId, userId),
    ),
    columns: { voiceAssetId: true },
  });
  return link?.voiceAssetId;
}

/**
 * Best-effort narration for the talking-cartoon flow. Never throws —
 * voice is supplementary; a failure must not fail the video job.
 */
export async function tryGenerateNarration(
  userId: string,
  input: GenerateVoiceInput,
): Promise<GeneratedVoice | null> {
  try {
    return await generateVoice(userId, input);
  } catch (err) {
    logger.warn('Narration generation failed (non-fatal)', {
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
