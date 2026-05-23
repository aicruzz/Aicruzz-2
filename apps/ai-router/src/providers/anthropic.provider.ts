import Anthropic from '@anthropic-ai/sdk';
import { BaseProvider } from './base.provider';
import type { ProviderConfig, ProviderResult, RouteRequest } from '../types';

export class AnthropicProvider extends BaseProvider {
  readonly id = 'ANTHROPIC' as const;
  readonly config: ProviderConfig = {
    id: 'ANTHROPIC',
    enabled: !!process.env.ANTHROPIC_API_KEY,
    costPerUnit: 4,
    speedScore: 8,
    qualityScore: 10,
    modules: ['CHAT'],
  };

  private client: Anthropic;

  constructor() {
    super();
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  async execute(request: RouteRequest): Promise<ProviderResult> {
    const start = Date.now();
    try {
      const model = request.model ?? 'claude-sonnet-4-6';
      const messages = (request.messages ?? []).filter((m) => m.role !== 'system');

      const response = await this.client.messages.create({
        model,
        max_tokens: 4096,
        system: request.systemPrompt ?? 'You are a helpful AI assistant.',
        messages: messages.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
      });

      const textBlock = response.content.find((b) => b.type === 'text');
      const text = textBlock?.type === 'text' ? textBlock.text : '';

      return this.buildResult({
        latencyMs: Date.now() - start,
        text,
        finishReason: response.stop_reason ?? undefined,
        tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
        raw: { model: response.model, usage: response.usage },
      });
    } catch (err) {
      return this.buildError(err, Date.now() - start);
    }
  }

  async ping(): Promise<boolean> {
    try {
      await this.client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'ping' }],
      });
      return true;
    } catch {
      return false;
    }
  }
}
