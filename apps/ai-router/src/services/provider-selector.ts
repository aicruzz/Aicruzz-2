import { BaseProvider } from '../providers/base.provider';
import { HealthMonitor } from '../health/health.monitor';
import { resolveVideoQuality } from './quality-router';
import { reorderByCapability } from './provider-capability';
import type { SubstitutionReason } from './provider-capability';
import type {
  RouteRequest,
  ProviderId,
  AiModule,
  TaskClassification,
  TaskType,
} from '../types';

/**
 * ProviderSelector
 * ----------------------------------------------------------------------------
 * Centralized provider selection. Nothing outside this file (and the affinity
 * tables below) decides which provider runs.
 *
 *  - CHAT: task-specialization aware. The classified task maps to a preferred
 *    provider order (Anthropic for engineering/reasoning, OpenAI for
 *    chat/creative/visual), then every candidate is scored on task affinity +
 *    live health + the routing strategy, and the best-scoring provider wins.
 *    The losing provider stays in the chain as automatic fallback.
 *
 *  - Non-CHAT (VIDEO/IMAGE/VOICE/CARTOON/LIVE_CAM): deterministic table
 *    routing (VIDEO additionally honors the selected quality tier via
 *    quality-router). The local GPU is reserved exclusively for Module 1
 *    (LIVE_CAM); modules 2/3/4 route to external APIs only.
 *
 * Swapping a provider later = edit a table here + register the new
 * BaseProvider in index.ts. No other file changes.
 */

// ─── CHAT: task → preferred provider order ───────────────────────────────────
const TASK_PROVIDER_AFFINITY: Record<TaskType, ProviderId[]> = {
  // OpenAI specialties
  GENERAL_CHAT:        ['OPENAI', 'ANTHROPIC'],
  IMAGE_GENERATION:    ['OPENAI', 'ANTHROPIC'],
  MULTIMODAL:          ['OPENAI', 'ANTHROPIC'],
  CREATIVE_WRITING:    ['OPENAI', 'ANTHROPIC'],
  DOCUMENT_GENERATION: ['OPENAI', 'ANTHROPIC'],
  // Anthropic specialties
  CODING:              ['ANTHROPIC', 'OPENAI'],
  DEBUGGING:           ['ANTHROPIC', 'OPENAI'],
  ARCHITECTURE:        ['ANTHROPIC', 'OPENAI'],
  TECHNICAL_ANALYSIS:  ['ANTHROPIC', 'OPENAI'],
  LONG_CONTEXT:        ['ANTHROPIC', 'OPENAI'],
};

// ─── Non-CHAT: legacy deterministic module routing ───────────────────────────
const MODULE_ROUTES: Record<AiModule, Record<RouteRequest['strategy'], ProviderId[]>> = {
  CHAT: {
    COST:    ['ANTHROPIC', 'OPENAI'],
    SPEED:   ['OPENAI', 'ANTHROPIC'],
    QUALITY: ['ANTHROPIC', 'OPENAI'],
    AUTO:    ['ANTHROPIC', 'OPENAI'],
  },
  // VIDEO uses resolveVideoQuality() for the primary order (Fast=Pika,
  // Premium=Runway→Pika). This table is the AUTO safety-net only.
  VIDEO: {
    COST:    ['PIKA', 'RUNWAY'],
    SPEED:   ['PIKA', 'RUNWAY'],
    QUALITY: ['RUNWAY', 'PIKA'],
    AUTO:    ['PIKA', 'RUNWAY'],
  },
  IMAGE: {
    COST:    ['OPENAI'],
    SPEED:   ['OPENAI'],
    QUALITY: ['OPENAI'],
    AUTO:    ['OPENAI'],
  },
  // Image editing/transformation — dedicated gpt-image-1 edit provider.
  IMAGE_TRANSFORM: {
    COST:    ['OPENAI_IMAGE'],
    SPEED:   ['OPENAI_IMAGE'],
    QUALITY: ['OPENAI_IMAGE'],
    AUTO:    ['OPENAI_IMAGE'],
  },
  VOICE: {
    COST:    ['ELEVENLABS'],
    SPEED:   ['ELEVENLABS'],
    QUALITY: ['ELEVENLABS'],
    AUTO:    ['ELEVENLABS'],
  },
  // Runway = premium image-to-video for cartoon (fails fast → Pika if the
  // request has no input image). Pika = fast/text-to-video cartoon.
  CARTOON: {
    COST:    ['PIKA', 'RUNWAY'],
    SPEED:   ['PIKA', 'RUNWAY'],
    QUALITY: ['RUNWAY', 'PIKA'],
    AUTO:    ['RUNWAY', 'PIKA'],
  },
  LIVE_CAM: {
    COST:    ['GPU'],
    SPEED:   ['GPU'],
    QUALITY: ['GPU'],
    AUTO:    ['GPU'],
  },
};

export interface SelectionResult {
  chain: BaseProvider[];
  reason: string;
  // Layer 1 observability: the quality-derived primary before any capability
  // reorder, and whether/why it was substituted for a compatible provider.
  selectedPrimary?: ProviderId;
  substituted?: boolean;
  substitutionReason?: SubstitutionReason;
}

export class ProviderSelector {
  constructor(
    private providers: Map<ProviderId, BaseProvider>,
    private health: HealthMonitor,
  ) {}

  /**
   * Returns the ordered list of providers to try (best first) plus a
   * human-readable reason for observability.
   */
  select(request: RouteRequest, classification?: TaskClassification): SelectionResult {
    if (request.module === 'CHAT' && classification) {
      return this.selectForChat(request, classification);
    }
    return this.selectFromTable(request);
  }

  // ── CHAT: task-aware + scored ──────────────────────────────────────────────
  private selectForChat(
    request: RouteRequest,
    classification: TaskClassification,
  ): SelectionResult {
    const affinity = TASK_PROVIDER_AFFINITY[classification.task];

    const candidates = affinity
      .map((id) => this.providers.get(id))
      .filter(
        (p): p is BaseProvider =>
          !!p && p.isEnabled && p.supports('CHAT'),
      );

    const pool = candidates.length
      ? candidates
      : this.enabledSupporting('CHAT'); // safety net if affinity providers are down

    const scored = pool
      .map((provider) => ({
        provider,
        score: this.score(provider, request, affinity),
      }))
      .sort((a, b) => b.score - a.score);

    const chain = scored.map((s) => s.provider);
    const winner = chain[0];

    const reason = winner
      ? `task=${classification.task} (${classification.signals.join(', ') || 'heuristic'}) ` +
        `→ ${winner.id} [score ${scored[0].score.toFixed(2)}]` +
        (chain.length > 1 ? `, fallback ${chain.slice(1).map((p) => p.id).join('→')}` : '')
      : `task=${classification.task} → no enabled CHAT provider`;

    return { chain, reason };
  }

  /**
   * Provider scoring system. Combines (in priority order):
   *   1. task affinity   — the specialist for the task ranks highest
   *   2. live health      — ONLINE > DEGRADED > OFFLINE, minus error rate/latency
   *   3. routing strategy — COST / SPEED / QUALITY / AUTO weighting
   */
  private score(
    provider: BaseProvider,
    request: RouteRequest,
    affinity: ProviderId[],
  ): number {
    const cfg = provider.config;

    // 1. Affinity: first in the list scores highest.
    const idx = affinity.indexOf(provider.id);
    const affinityScore = idx === -1 ? 0 : (affinity.length - idx) / affinity.length;

    // 2. Health.
    const h = this.health.getHealth(provider.id);
    const statusScore =
      h.status === 'ONLINE' ? 1 : h.status === 'DEGRADED' ? 0.5 : 0.1;
    const latencyPenalty = Math.min(h.latencyMs / 10_000, 0.3);
    const healthScore = Math.max(0, statusScore - h.errorRate - latencyPenalty);

    // 3. Strategy.
    let strategyScore: number;
    switch (request.strategy) {
      case 'COST':    strategyScore = (10 - cfg.costPerUnit) / 10; break;
      case 'SPEED':   strategyScore = cfg.speedScore / 10; break;
      case 'QUALITY': strategyScore = cfg.qualityScore / 10; break;
      default:        strategyScore = (cfg.speedScore + cfg.qualityScore) / 20; break;
    }

    // Weighted: task specialization dominates, health guards availability,
    // strategy breaks ties.
    return affinityScore * 0.6 + healthScore * 0.3 + strategyScore * 0.1;
  }

  // ── Non-CHAT: deterministic table (unchanged behavior) ─────────────────────
  private selectFromTable(request: RouteRequest): SelectionResult {
    const { module, strategy } = request;

    const preferredOrder =
      module === 'VIDEO'
        ? resolveVideoQuality(request.qualityMode)
        : MODULE_ROUTES[module][strategy];

    let chain = this.resolve(preferredOrder, module);

    if (chain.length === 0) {
      chain = this.resolve(MODULE_ROUTES[module].AUTO, module);
    }
    if (chain.length === 0) {
      chain = this.enabledSupporting(module);
    }

    // Layer 1 — capability-aware reorder (VIDEO/CARTOON only). Promotes a
    // provider that can actually fulfil the request to primary, before
    // generation starts. Never drops providers or changes cost.
    const reorder = reorderByCapability(chain, request);
    chain = reorder.chain;

    const baseReason =
      module === 'VIDEO'
        ? `module=VIDEO tier=${request.qualityMode ?? 'STANDARD'} → ${chain.map((p) => p.id).join('→') || 'none'}`
        : `module=${module} strategy=${strategy} → ${chain.map((p) => p.id).join('→') || 'none'}`;

    return {
      chain,
      reason: reorder.substituted
        ? `${baseReason} [substituted ${reorder.selectedPrimary}→${chain[0]?.id} reason=${reorder.substitutionReason}]`
        : baseReason,
      selectedPrimary: reorder.selectedPrimary ?? undefined,
      substituted: reorder.substituted,
      substitutionReason: reorder.substitutionReason,
    };
  }

  private resolve(ids: ProviderId[], module: AiModule): BaseProvider[] {
    const chain: BaseProvider[] = [];
    for (const id of ids) {
      const provider = this.providers.get(id);
      if (provider?.isEnabled && provider.supports(module)) chain.push(provider);
    }
    return chain;
  }

  private enabledSupporting(module: AiModule): BaseProvider[] {
    const chain: BaseProvider[] = [];
    for (const [, provider] of this.providers) {
      if (provider.isEnabled && provider.supports(module)) chain.push(provider);
    }
    return chain;
  }
}
