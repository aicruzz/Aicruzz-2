import axios, { isAxiosError } from 'axios';
import { BaseProvider } from './base.provider';
import type { ProviderConfig, ProviderResult, RouteRequest, AiModule } from '../types';

const GPU_WORKER_URL = process.env.GPU_WORKER_URL ?? 'http://localhost:8000';

export class GpuProvider extends BaseProvider {
  readonly id = 'GPU' as const;
  readonly config: ProviderConfig = {
    id: 'GPU',
    enabled: true,
    costPerUnit: 1,
    speedScore: 10,
    qualityScore: 8,
    // GPU is reserved exclusively for Module 1 (Deep Fake Live Cam).
    // Modules 2/3/4 must use external APIs only — see provider-selector.ts.
    modules: ['LIVE_CAM'],
    baseUrl: GPU_WORKER_URL,
  };

  async execute(request: RouteRequest): Promise<ProviderResult> {
    const start = Date.now();
    try {
      const endpoint = this.getEndpoint(request.module);
      const payload  = this.buildPayload(request);

      console.log(`[GPU] Sending request to ${GPU_WORKER_URL}${endpoint}`);

      const res = await axios.post(`${GPU_WORKER_URL}${endpoint}`, payload, {
        timeout: 300_000,
        headers: { 'Content-Type': 'application/json' },
      });

      const data = res.data as {
        jobId?:            string;
        status?:           string;
        output_url?:       string;
        audio_url?:        string;
        thumbnail_url?:    string;
        duration_seconds?: number;
        text?:             string;
      };

      console.log(`[GPU] Response:`, JSON.stringify(data, null, 2));

      return this.buildResult({
        latencyMs:       Date.now() - start,
        outputUrl:       data.output_url,
        audioUrl:        data.audio_url,
        thumbnailUrl:    data.thumbnail_url,
        durationSeconds: data.duration_seconds,
        text:            data.text,
        raw:             data,
      });
    } catch (err) {
      const message = isAxiosError(err)
        ? `${err.message} — status: ${err.response?.status} url: ${err.config?.url} data: ${JSON.stringify(err.response?.data)}`
        : err instanceof Error ? err.message : String(err);

      console.error(`[GPU] Request failed: ${message}`);
      return this.buildError(new Error(message), Date.now() - start);
    }
  }

  private buildPayload(request: RouteRequest): Record<string, unknown> {
    return {
      module:           request.module,
      prompt:           request.prompt,
      negative_prompt:  request.negativePrompt,
      input_image_url:  request.inputImageUrl,
      input_video_url:  request.inputVideoUrl,
      text:             request.text,
      voice_id:         request.voiceId,
      voice_gender:     request.voiceGender,
      width:            request.width  ?? 1280,
      height:           request.height ?? 720,
      duration_seconds: request.durationSeconds ?? 5,
      fps:              request.fps    ?? 24,
      quality_mode:     request.qualityMode ?? 'STANDARD',
      fp16:             true,
      webhook_url:      request.webhookUrl,
    };
  }

  private getEndpoint(module: AiModule): string {
    // Module 1 only. Any other module reaching here is a routing bug.
    if (module !== 'LIVE_CAM') {
      throw new Error(`Unsupported module for GPU provider: ${module}`);
    }
    // SEAM (background replacement): the live-cam background feature does
    // NOT route through ai-router — it is handled directly by the WebRTC
    // worker via apps/webrtc/src/processing/background.client.ts against a
    // future GPU `/live-cam/background-replace` endpoint. Routing logic is
    // intentionally left unchanged here. If background replacement is ever
    // promoted to a routed module, add its case alongside face-swap.
    return '/process/face-swap';
  }

  async ping(): Promise<boolean> {
    try {
      const res  = await axios.get(`${GPU_WORKER_URL}/health`, { timeout: 3000 });
      const data = res.data as { status: string; gpu_available: boolean };
      console.log(`[GPU] Ping response:`, data);
      return data.status === 'ok' && data.gpu_available === true;
    } catch (err) {
      console.error(`[GPU] Ping failed:`, err instanceof Error ? err.message : String(err));
      return false;
    }
  }
}