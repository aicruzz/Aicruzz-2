import type { RouteResponse } from '../types';

function cloneRedactedRaw(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const o = { ...(raw as Record<string, unknown>) };
  delete o.error;
  return o;
}

/**
 * Strips provider / network detail from a failed route before it leaves the router HTTP API.
 */
export function redactRouteResponseForClient(result: RouteResponse): RouteResponse {
  if (result.success) return result;

  const r = result.result;
  return {
    ...result,
    result: {
      ...r,
      error: 'AI provider request failed',
      raw: cloneRedactedRaw(r.raw),
    },
  };
}

export function redactJobStatusHttpPayload(payload: {
  id: string;
  status: string;
  result?: RouteResponse;
  failedReason?: string;
}): {
  id: string;
  status: string;
  result?: RouteResponse;
  failedReason?: string;
} {
  return {
    id: payload.id,
    status: payload.status,
    result: payload.result
      ? redactRouteResponseForClient(payload.result)
      : undefined,
    failedReason: payload.failedReason ? 'Job failed' : undefined,
  };
}
