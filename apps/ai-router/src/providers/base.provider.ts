import type {
  ProviderId,
  ProviderConfig,
  ProviderResult,
  RouteRequest,
  ProviderStatus,
} from '../types';

export abstract class BaseProvider {
  abstract readonly id: ProviderId;
  abstract readonly config: ProviderConfig;

  // Execute the AI request — must be implemented by each provider
  abstract execute(request: RouteRequest): Promise<ProviderResult>;

  // Lightweight ping to verify provider is reachable
  abstract ping(): Promise<boolean>;

  get isEnabled(): boolean {
    return this.config.enabled;
  }

  get supportedModules() {
    return this.config.modules;
  }

  supports(module: RouteRequest['module']): boolean {
    return this.config.modules.includes(module);
  }

  protected buildResult(
    partial: Partial<ProviderResult> & { latencyMs: number },
  ): ProviderResult {
    return {
      success: true,
      provider: this.id,
      ...partial,
    };
  }

  protected buildError(error: unknown, latencyMs: number): ProviderResult {
    const message = extractErrorMessage(error) || `${this.id} provider failed (no error message)`;
    return {
      success: false,
      provider: this.id,
      latencyMs,
      error: message,
    };
  }
}

function extractErrorMessage(error: unknown): string {
  if (error == null) return '';
  if (typeof error === 'string') return error;

  // NOTE: axios errors are Error instances whose .message is only
  // "Request failed with status code 4xx". We must NOT early-return on
  // `instanceof Error` — the useful detail (response.status / response.data)
  // lives on the same object and would otherwise be discarded.
  if (typeof error === 'object') {
    const e = error as {
      message?: unknown;
      code?: unknown;
      response?: { status?: unknown; data?: unknown };
    };
    const parts: string[] = [];
    if (typeof e.message === 'string' && e.message) parts.push(e.message);
    if (e.response && typeof e.response === 'object') {
      const status = e.response.status;
      if (status != null) parts.push(`status=${String(status)}`);
      if (e.response.data != null) {
        try { parts.push(`body=${JSON.stringify(e.response.data)}`); } catch { /* ignore */ }
      }
    }
    if (typeof e.code === 'string' && e.code) parts.push(`code=${e.code}`);
    if (parts.length) return parts.join(' ');
    if (error instanceof Error && error.message) return error.message;
    try { return JSON.stringify(error); } catch { /* ignore */ }
  }

  if (error instanceof Error && error.message) return error.message;
  return String(error);
}
