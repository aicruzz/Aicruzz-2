import axios from 'axios';

const GPU_URL = process.env.GPU_WORKER_URL ?? 'http://localhost:8000';

export interface FaceSwapConfig {
  targetFaceUrl?: string;  // URL of face to swap in
  enhanceFace?: boolean;   // Apply GFPGAN enhancement
  faceBlend?: number;      // 0–1 blending factor
}

/**
 * Sends a video frame (base64) to the GPU worker for face swap processing.
 * Returns the processed frame as base64.
 * Called per-frame in the real-time pipeline.
 */
export async function processFrame(
  frameBase64: string,
  config: FaceSwapConfig,
): Promise<string> {
  try {
    const res = await axios.post(
      `${GPU_URL}/live-cam/face-swap`,
      {
        frame: frameBase64,
        target_face_url: config.targetFaceUrl,
        enhance_face: config.enhanceFace ?? true,
        face_blend: config.faceBlend ?? 1.0,
      },
      { timeout: 200 }, // 200ms max — must keep up with 24fps
    );

    return (res.data as { processed_frame: string }).processed_frame;
  } catch {
    // On timeout/error — return original frame (graceful degradation)
    return frameBase64;
  }
}

/**
 * Check if GPU worker is ready for face swap.
 */
export async function isReady(): Promise<boolean> {
  try {
    const res = await axios.get(`${GPU_URL}/health`, { timeout: 2000 });
    const data = res.data as { gpu_available: boolean };
    return data.gpu_available === true;
  } catch {
    return false;
  }
}
