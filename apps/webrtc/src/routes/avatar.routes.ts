import { Router, json } from 'express';
import { roomManager } from '../rooms/room.manager';
import { getAvatarProvider } from '../processing/avatar.provider';
import { processAudioChunk, type VoiceMode } from '../processing/voice.client';

/**
 * Browser-facing proxy for the client-side avatar pipeline.
 *
 * The browser never talks to the GPU worker directly (keeps
 * `GPU_WORKER_URL` server-side, avoids CORS). Every request is gated to an
 * ACTIVE BILLED SESSION — the (roomId, sessionId) pair must map to a live
 * mediasoup participant — so there is no free GPU use and no new auth
 * infrastructure is required.
 *
 * Honest contract: when the model is unavailable the frame route returns
 * `{ processed: false }`. It never returns the raw source frame as a
 * generated avatar.
 */
export const avatarRouter = Router();

// Frames are base64 JPEG (downscaled ~512px) — well over the 100kb json
// default. Scope the larger limit to this router only.
avatarRouter.use(json({ limit: '4mb' }));

interface SessionCtx {
  roomId?: unknown;
  sessionId?: unknown;
}

// Dedup rejection warnings so a misbehaving client cannot flood the log.
const warnedRejectRooms = new Set<string>();

/** Reject anything not tied to a live, billed session. */
function requireLiveSession(body: SessionCtx): { roomId: string; sessionId: string } | null {
  const roomId = typeof body.roomId === 'string' ? body.roomId : null;
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : null;
  if (!roomId || !sessionId) return null;
  const room = roomManager.getRoom(roomId);
  if (!room || !room.hasParticipant(sessionId)) {
    const key = roomId ?? '?';
    if (!warnedRejectRooms.has(key)) {
      warnedRejectRooms.add(key);
      console.warn(`[avatar-proxy] session-gate reject room=${key}`);
      // Bound the set so a long-lived process doesn't grow it unboundedly.
      if (warnedRejectRooms.size > 256) warnedRejectRooms.clear();
    }
    return null;
  }
  return { roomId, sessionId };
}

interface FrameBody extends SessionCtx {
  frame?: unknown;
  avatarUrl?: unknown;
  backgroundUrl?: unknown;
  enhance?: unknown;
  blend?: unknown;
}

avatarRouter.post('/frame', async (req, res) => {
  const body = req.body as FrameBody;
  const ctx = requireLiveSession(body);
  if (!ctx) {
    res.status(403).json({ processed: false, reason: 'no-active-session' });
    return;
  }
  const frame = typeof body.frame === 'string' ? body.frame : null;
  const avatarUrl = typeof body.avatarUrl === 'string' ? body.avatarUrl : '';
  if (!frame) {
    res.status(400).json({ processed: false, reason: 'no-frame' });
    return;
  }

  const result = await getAvatarProvider().reenact(frame, {
    avatarUrl,
    backgroundUrl:
      typeof body.backgroundUrl === 'string' ? body.backgroundUrl : undefined,
    enhance: typeof body.enhance === 'boolean' ? body.enhance : undefined,
    blend: typeof body.blend === 'number' ? body.blend : undefined,
  });

  // Always 200: the discriminated union is normal control flow for the
  // client (processed:true → render, processed:false → honest standby).
  res.json(result);
});

interface AudioBody extends SessionCtx {
  audio?: unknown;
  mode?: unknown;
  pitch?: unknown;
  cloneVoiceUrl?: unknown;
  aiVoiceId?: unknown;
}

avatarRouter.post('/audio', async (req, res) => {
  const body = req.body as AudioBody;
  const ctx = requireLiveSession(body);
  if (!ctx) {
    res.status(403).json({ ok: false, reason: 'no-active-session' });
    return;
  }
  const audio = typeof body.audio === 'string' ? body.audio : null;
  if (!audio) {
    res.status(400).json({ ok: false, reason: 'no-audio' });
    return;
  }
  const mode = (typeof body.mode === 'string' ? body.mode : 'NONE') as VoiceMode;
  const processed = await processAudioChunk(audio, {
    mode,
    pitch: typeof body.pitch === 'number' ? body.pitch : 0,
    cloneVoiceUrl:
      typeof body.cloneVoiceUrl === 'string' ? body.cloneVoiceUrl : undefined,
    aiVoiceId:
      typeof body.aiVoiceId === 'string' ? body.aiVoiceId : undefined,
  });
  // voice.client returns the original audio when the transform is
  // unavailable — that is honest (the user's real voice), not a fake avatar.
  res.json({ ok: true, audio: processed });
});

avatarRouter.get('/health', async (_req, res) => {
  const provider = getAvatarProvider();
  const avatarReady = await provider.isReady();
  console.log(
    `[avatar-proxy] health provider=${provider.id} ready=${avatarReady}`,
  );
  res.json({ providerId: provider.id, avatarReady });
});
