import OpenAI from 'openai';
import { BaseProvider } from './base.provider';
import type { ProviderConfig, ProviderResult, RouteRequest } from '../types';
import {
  aspectRatioFromDimensions,
  isOpenAIImageSize,
  resolveOpenAIImageSize,
  type OpenAIImageSize,
} from '../utils/openai-image-size';

export class OpenAIProvider extends BaseProvider {
  readonly id = 'OPENAI' as const;
  readonly config: ProviderConfig = {
    id: 'OPENAI',
    enabled: !!process.env.OPENAI_API_KEY,
    costPerUnit: 5,
    speedScore: 9,
    qualityScore: 9,
    modules: ['CHAT', 'IMAGE'],
  };

  private client: OpenAI;

  private static readonly MODEL_MAP: Record<
    NonNullable<RouteRequest['qualityMode']>,
    string
  > = {
    STANDARD: 'gpt-4o-mini',
    HIGH: 'gpt-4o',
    ULTRA: 'gpt-4o',
  };

  constructor() {
    super();
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      httpAgent: new (require('https').Agent)({ keepAlive: true }),
    });
  }

  async execute(request: RouteRequest): Promise<ProviderResult> {
    const start = Date.now();
    try {
      if (request.module === 'IMAGE') return await this.generateImage(request, start);

      if (request.stream || request.onChunk) return await this.chatStream(request, start);

      return await this.chat(request, start);
    } catch (err) {
      return this.buildError(err, Date.now() - start);
    }
  }

  private async chat(request: RouteRequest, start: number): Promise<ProviderResult> {
    const model =
      request.model ??
      OpenAIProvider.MODEL_MAP[request.qualityMode ?? 'STANDARD'] ??
      'gpt-4o-mini';

    const msgs = this.buildMessages(request);
    const maxTokens = this.estimateMaxTokens(request);

    const response = await this.client.chat.completions.create({
      model,
      messages: msgs,
      max_tokens: maxTokens,
      stream: false,
    });

    const choice = response.choices[0];
    return this.buildResult({
      latencyMs: Date.now() - start,
      text: choice.message.content ?? '',
      finishReason: choice.finish_reason ?? undefined,
      tokensUsed: response.usage?.total_tokens,
      raw: { model: response.model, usage: response.usage },
    });
  }

  // ✅ NEW: streaming chat method
  private async chatStream(request: RouteRequest, start: number): Promise<ProviderResult> {
    const model =
      request.model ??
      OpenAIProvider.MODEL_MAP[request.qualityMode ?? 'STANDARD'] ??
      'gpt-4o-mini';

    const msgs = this.buildMessages(request);
    const chunks: string[] = [];

    const stream = await this.client.chat.completions.create({
      model,
      messages: msgs,
      max_tokens: this.estimateMaxTokens(request),
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? '';
      if (delta) {
        chunks.push(delta);
        request.onChunk?.(delta); // 🔥 sends each token to caller in real-time
      }
    }

    return this.buildResult({
      latencyMs: Date.now() - start,
      text: chunks.join(''),
      finishReason: 'stop',
    });
  }

  // ✅ NEW: extracted helper — avoids duplicating message-building logic
  private buildMessages(request: RouteRequest): OpenAI.Chat.ChatCompletionMessageParam[] {
    const msgs: OpenAI.Chat.ChatCompletionMessageParam[] = [];

    if (request.systemPrompt) {
      msgs.push({ role: 'system', content: request.systemPrompt });
    }
    for (const m of request.messages ?? []) {
      msgs.push({ role: m.role as 'user' | 'assistant', content: m.content });
    }

    return msgs;
  }

  private estimateMaxTokens(request: RouteRequest): number {
    if (request.maxTokens) return request.maxTokens;
    switch (request.qualityMode) {
      case 'STANDARD': return 512;
      case 'HIGH':     return 1024;
      case 'ULTRA':    return 4096;
      default:         return 512;
    }
  }

private async generateImage(request: RouteRequest, start: number): Promise<ProviderResult> {
  // gpt-image-1 only accepts a fixed set of sizes. Prefer an already-valid
  // request.size; otherwise resolve from the aspect ratio. Never pass raw
  // video pixel dimensions (e.g. 1280x720) — OpenAI rejects them with 400.
  const size: OpenAIImageSize = isOpenAIImageSize(request.size)
    ? request.size
    : resolveOpenAIImageSize(
        aspectRatioFromDimensions(request.width, request.height),
      );

  const quality =
    request.qualityMode === 'ULTRA' ? 'high'   :
    request.qualityMode === 'HIGH'  ? 'medium' : 'low';

  const response = await this.client.images.generate({
    model: 'gpt-image-1',
    prompt: request.prompt ?? '',
    n: 1,
    size,
    quality,
  });

  // gpt-image-1 returns base64, not a URL — decode it and pass raw bytes
  const item = response.data?.[0];
  const b64 = item?.b64_json;

  return this.buildResult({
    latencyMs: Date.now() - start,
    outputUrl: item?.url ?? undefined,         
    b64Image: b64 ?? undefined,                 
    raw: response.data,
  });
}

  async ping(): Promise<boolean> {
    try {
      await this.client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
      });
      return true;
    } catch {
      return false;
    }
  }
}