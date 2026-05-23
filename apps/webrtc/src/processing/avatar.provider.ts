import axios from 'axios';

/**
 * Real-time avatar reenactment provider abstraction.
 *
 * The Live Cam product transforms the user's camera (motion / expression /
 * pose / lip-sync source) into an uploaded TARGET AVATAR, optionally
 * composited over a replacement background. The actual model runs in an
 * external GPU worker (`GPU_WORKER_URL`) that is NOT part of this repo.
 *
 * This module defines the seam + a registry so future models
 * (LivePortrait, MuseTalk, AnimateAnyone, Hallo, SadTalker, EMO,
 * StableAvatar, Tavus, Hedra, Runway-Realtime) can be wired without
 * touching the streaming architecture.
 *
 * HONEST DEGRADATION CONTRACT: when the model is unavailable a provider
 * MUST return `{ processed: false }`. It must NEVER echo the raw source
 * frame back as if it were a generated avatar. The client renders an
 * explicit standby state instead — never fake output.
 */

const GPU_URL = process.env.GPU_WORKER_URL ?? 'http://localhost:8000';

export interface AvatarReenactOpts {
  /** Public URL of the target avatar/identity image to drive. */
  avatarUrl: string;
  /** Optional replacement background composited behind the avatar. */
  backgroundUrl?: string;
  /** Apply face enhancement (GFPGAN-style) on the rendered avatar. */
  enhance?: boolean;
  /** 0–1 identity blend factor. */
  blend?: number;
}

export type AvatarReenactResult =
  | { processed: true; frame: string }
  | { processed: false; reason: string };

export interface AvatarReenactmentProvider {
  readonly id: string;
  /**
   * Drive the target avatar with one source frame (base64, no data: prefix).
   * Returns the rendered avatar frame, or `{ processed:false }` when the
   * model is unavailable. Never returns the raw source as "processed".
   */
  reenact(
    frameBase64: string,
    opts: AvatarReenactOpts,
  ): Promise<AvatarReenactResult>;
  /** Whether the underlying model is actually available right now. */
  isReady(): Promise<boolean>;
}

/**
 * Default provider — talks to the external GPU worker's reenactment
 * endpoint. Composes the existing face-swap + background-replace contracts
 * conceptually into a single avatar render pass.
 */
class GpuAvatarProvider implements AvatarReenactmentProvider {
  readonly id = 'gpu';

  async reenact(
    frameBase64: string,
    opts: AvatarReenactOpts,
  ): Promise<AvatarReenactResult> {
    if (!opts.avatarUrl) {
      return { processed: false, reason: 'no-avatar' };
    }
    try {
      const res = await axios.post(
        `${GPU_URL}/live-cam/avatar-reenact`,
        {
          frame: frameBase64,
          avatar_url: opts.avatarUrl,
          background_url: opts.backgroundUrl,
          enhance_face: opts.enhance ?? true,
          face_blend: opts.blend ?? 1.0,
        },
        { timeout: 220 }, // per-frame budget (~12–15fps target)
      );
      const out = res.data as { processed_frame?: string };
      if (!out?.processed_frame) {
        return { processed: false, reason: 'empty-response' };
      }
      return { processed: true, frame: out.processed_frame };
    } catch (err) {
      // Endpoint missing / timeout / model error — honest standby, NOT a
      // raw-frame echo.
      const reason =
        axios.isAxiosError(err) && err.code === 'ECONNABORTED'
          ? 'timeout'
          : 'unavailable';
      return { processed: false, reason };
    }
  }

  async isReady(): Promise<boolean> {
    try {
      const res = await axios.get(`${GPU_URL}/health`, { timeout: 2000 });
      const data = res.data as { avatar_available?: boolean };
      return data.avatar_available === true;
    } catch {
      return false;
    }
  }
}

/**
 * Registered-but-not-wired provider for a future model. Honest by
 * construction: always reports unavailable until a real implementation
 * replaces it. This keeps the registry self-documenting without ever
 * faking output.
 */
class UnwiredProvider implements AvatarReenactmentProvider {
  constructor(readonly id: string) {}
  async reenact(): Promise<AvatarReenactResult> {
    return { processed: false, reason: `provider-${this.id}-not-wired` };
  }
  async isReady(): Promise<boolean> {
    return false;
  }
}

// Future model seams — swap an UnwiredProvider for a real implementation
// when its GPU endpoint is deployed. Never make these fake output.
const FUTURE_MODELS = [
  'liveportrait',
  'musetalk',
  'animateanyone',
  'hallo',
  'sadtalker',
  'emo',
  'stableavatar',
  'tavus',
  'hedra',
  'runway-realtime',
];

const registry = new Map<string, AvatarReenactmentProvider>();
registry.set('gpu', new GpuAvatarProvider());
for (const id of FUTURE_MODELS) registry.set(id, new UnwiredProvider(id));

/**
 * Resolve the active provider. `LIVECAM_AVATAR_PROVIDER` selects it
 * (default `gpu`). Unknown values fall back to `gpu`.
 */
export function getAvatarProvider(): AvatarReenactmentProvider {
  const id = (process.env.LIVECAM_AVATAR_PROVIDER ?? 'gpu').toLowerCase();
  return registry.get(id) ?? registry.get('gpu')!;
}
