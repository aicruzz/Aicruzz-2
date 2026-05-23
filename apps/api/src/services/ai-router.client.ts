import axios, { AxiosInstance, isAxiosError } from 'axios';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/error.middleware';


export type AiModule =
  | 'CHAT'
  | 'VIDEO'
  | 'IMAGE'
  | 'IMAGE_TRANSFORM'
  | 'VOICE'
  | 'CARTOON'
  | 'LIVE_CAM';
export type RoutingStrategy = 'COST' | 'SPEED' | 'QUALITY' | 'AUTO';

export interface RouteRequest {
  userId: string;
  module: AiModule;
  strategy?: RoutingStrategy;
  messages?: Array<{
    role: 'user' | 'assistant' | 'system';
    // string for plain text; array form for multimodal (text + image_url).
    content:
      | string
      | Array<{ type: string; text?: string; image_url?: { url: string } }>;
  }>;
  systemPrompt?: string;
  stream?: boolean;
  model?: string;
  maxTokens?: number;
  onChunk?: (chunk: string) => void;
  prompt?: string;
  negativePrompt?: string;
  inputImageUrl?: string;
  inputVideoUrl?: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  fps?: number;
  resolution?: 'SD_480P' | 'HD_720P' | 'FHD_1080P';
  // Video aspect ratio hint — used by ai-router to size the OpenAI keyframe
  // (16:9/9:16/1:1). Anything else falls back to landscape on the router side.
  aspectRatio?: string;
  qualityMode?: 'STANDARD' | 'HIGH' | 'ULTRA';
  text?: string;
  voiceId?: string;
  voiceGender?: 'MALE' | 'FEMALE';
  audioFormat?: 'mp3' | 'wav' | 'ogg';
  voiceCloneUrl?: string;
  voiceCloneName?: string;
  voiceStyle?: string;
  voiceStability?: number;
  voiceSimilarity?: number;
  jobId?: string;
  priority?: number;
  webhookUrl?: string;
}

export interface RouteResponse {
  requestId: string;
  success: boolean;
  provider: string;
  result: {
    success: boolean;
    provider: string;
    latencyMs: number;
    text?: string;
    outputUrl?: string;
    b64Image?: string;
    thumbnailUrl?: string;
    audioUrl?: string;
    durationSeconds?: number;
    tokensUsed?: number;
    error?: string;
    raw?: unknown;
  };
  attemptsCount: number;
  totalLatencyMs: number;
  strategy: string;
  fallbackUsed: boolean;
}

export interface JobStatus {
  id: string;
  status: string;
  result?: RouteResponse;
  failedReason?: string;
}

// ─── Safe error serializer ────────────────────────────────────

function serializeError(err: unknown): Record<string, unknown> {
  if (isAxiosError(err)) {
    return {
      message: err.message,
      code: err.code,
      status: err.response?.status,
      statusText: err.response?.statusText,
      data: err.response?.data,
      url: err.config?.url,
      method: err.config?.method,
    };
  }
  if (err instanceof Error) {
    return { message: err.message, stack: err.stack };
  }
  return { message: String(err) };
}

class AiRouterClient {
  private http: AxiosInstance;

  constructor() {
    const baseURL = env.AI_ROUTER_URL ?? 'http://localhost:4001';
    const secret = env.AI_ROUTER_SECRET ?? 'nKNfE8N1vRBRiwRaNQe0hu/atjnhzumQIMrdHfoSrOI=';

    this.http = axios.create({
      baseURL,
      timeout: 310_000,
      headers: {
        'Content-Type': 'application/json',
        'x-router-secret': secret,
      },
    });
  }

  async route(request: RouteRequest): Promise<RouteResponse> {
    try {
      const res = await this.http.post<RouteResponse>('/route', request);
      return res.data;
    } catch (err) {
      logger.error('AI Router request failed:', serializeError(err));
      throw new AppError('AI processing service unavailable. Please try again.', 503);
    }
  }

  async getJobStatus(jobId: string): Promise<JobStatus> {
    try {
      const res = await this.http.get<JobStatus>(`/jobs/${jobId}`);
      return res.data;
    } catch (err) {
      logger.error('AI Router job status check failed:', serializeError(err));
      throw new AppError('Failed to check job status', 503);
    }
  }

  async lipSync(input: {
    videoUrl: string;
    audioUrl: string;
    subtitlesVtt?: string;
  }): Promise<{
    videoUrl: string;
    lipSynced: boolean;
    subtitlesBurned: boolean;
    model: string;
    note?: string;
  }> {
    const res = await this.http.post('/lipsync', input);
    return res.data as {
      videoUrl: string;
      lipSynced: boolean;
      subtitlesBurned: boolean;
      model: string;
      note?: string;
    };
  }

  async getHealth(): Promise<unknown> {
    try {
      const res = await this.http.get('/health');
      return res.data;
    } catch {
      return { status: 'unreachable' };
    }
  }
}

// Singleton instance
export const aiRouter = new AiRouterClient();