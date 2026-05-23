import axios from 'axios';

const GPU_URL = process.env.GPU_WORKER_URL ?? 'http://localhost:8000';

export type BackgroundMode = 'ORIGINAL' | 'REPLACE';

export interface BackgroundConfig {
  mode: BackgroundMode;
  backgroundUrl?: string; // public URL of the replacement background
}

/**
 * Background-replacement seam.
 *
 * SEAM ONLY — there is no segmentation/compositing model wired into the
 * real-time pipeline yet. This client mirrors face-swap.client.ts so the
 * contract is complete and a future GPU `/live-cam/background-replace`
 * endpoint can be dropped in without touching the streaming architecture.
 *
 * Until that endpoint exists (or for ORIGINAL mode) the original frame is
 * returned unchanged — identical graceful-degradation behavior to the
 * face-swap path. It never fakes processing.
 */
export async function processFrame(
  frameBase64: string,
  config: BackgroundConfig,
): Promise<string> {
  if (config.mode === 'ORIGINAL' || !config.backgroundUrl) {
    return frameBase64;
  }
  try {
    const res = await axios.post(
      `${GPU_URL}/live-cam/background-replace`,
      {
        frame: frameBase64,
        background_url: config.backgroundUrl,
      },
      { timeout: 200 }, // keep parity with the face-swap per-frame budget
    );
    return (res.data as { processed_frame: string }).processed_frame;
  } catch {
    // Endpoint missing / timeout / error → original frame (no fake output).
    return frameBase64;
  }
}

/** Whether the GPU worker can perform background replacement. */
export async function isReady(): Promise<boolean> {
  try {
    const res = await axios.get(`${GPU_URL}/health`, { timeout: 2000 });
    const data = res.data as {
      gpu_available?: boolean;
      background_available?: boolean;
    };
    return data.background_available === true;
  } catch {
    return false;
  }
}
