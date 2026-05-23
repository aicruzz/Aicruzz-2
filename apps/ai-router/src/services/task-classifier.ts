import type { RouteRequest, TaskClassification, TaskType } from '../types';

/**
 * TaskClassifier
 * ----------------------------------------------------------------------------
 * Deterministic, zero-latency heuristic classifier. It inspects the request
 * content and decides which *kind* of task it is, so the ProviderSelector can
 * route to the specialist provider (Anthropic for engineering/reasoning,
 * OpenAI for chat/creative/visual).
 *
 * It is intentionally rule-based (no extra LLM call) so classification adds no
 * cost or latency to every request. The keyword tables below are the single
 * place to tune behavior — nothing here references a concrete provider.
 */

const LONG_CONTEXT_CHAR_THRESHOLD = 8_000;

type Rule = { task: TaskType; weight: number; pattern: RegExp; label: string };

// Higher weight = stronger signal. Order does not matter — scores are summed.
const RULES: Rule[] = [
  // ── Engineering / reasoning → Anthropic ───────────────────────────────────
  { task: 'CODING', weight: 5, pattern: /```|\bfunction\b|\bclass\b|\bimport\b|\bconst\b|\bdef\s|=>|<\/?\w+>/, label: 'code block / source syntax' },
  { task: 'CODING', weight: 3, pattern: /\b(write|implement|build|create|generate)\b.{0,40}\b(code|function|api|endpoint|component|script|class|module)\b/i, label: 'asks to write code' },
  { task: 'DEBUGGING', weight: 5, pattern: /\b(stack ?trace|traceback|exception|segfault|null ?pointer|undefined is not|cannot read propert)/i, label: 'error/trace text' },
  { task: 'DEBUGGING', weight: 4, pattern: /\b(debug|fix (this|the|my)|why (is|does|isn'?t|won'?t).{0,40}(work|fail|error|break)|bug\b|not working)/i, label: 'debugging request' },
  { task: 'ARCHITECTURE', weight: 5, pattern: /\b(architecture|system design|design pattern|microservice|scalab|high[- ]availability|trade[- ]?offs?|data model|schema design)\b/i, label: 'architecture/design' },
  { task: 'TECHNICAL_ANALYSIS', weight: 4, pattern: /\b(analyze|analyse|evaluate|compare|assess|review)\b.{0,40}\b(performance|complexity|approach|algorithm|implementation|security|codebase)\b/i, label: 'technical analysis' },
  { task: 'TECHNICAL_ANALYSIS', weight: 3, pattern: /\b(time|space) complexity\b|\bbig[- ]?o\b|\bbenchmark\b|\bprofiling\b/i, label: 'complexity/perf analysis' },

  // ── Chat / creative / visual → OpenAI ─────────────────────────────────────
  { task: 'IMAGE_GENERATION', weight: 6, pattern: /\b(generate|create|draw|paint|render|design)\b.{0,30}\b(image|picture|photo|logo|illustration|art|drawing)\b/i, label: 'image generation request' },
  { task: 'CREATIVE_WRITING', weight: 5, pattern: /\b(write|compose)\b.{0,30}\b(poem|story|song|lyrics|novel|screenplay|tagline|slogan|joke)\b/i, label: 'creative writing' },
  { task: 'DOCUMENT_GENERATION', weight: 4, pattern: /\b(draft|write|compose|generate)\b.{0,30}\b(email|letter|report|essay|blog post|article|proposal|summary|memo|cover letter|press release)\b/i, label: 'document generation' },
  { task: 'GENERAL_CHAT', weight: 1, pattern: /\b(hi|hello|hey|thanks|how are you|what(?:'s| is) up|tell me about|explain|what is)\b/i, label: 'general conversation' },
];

// The single source of truth for task → provider preference lives in
// services/provider-selector.ts. The classifier only decides the task.

export class TaskClassifier {
  classify(request: RouteRequest): TaskClassification {
    // 1. Explicit caller hint always wins (still provider-agnostic).
    if (request.taskHint) {
      return { task: request.taskHint, confidence: 1, signals: ['explicit taskHint'] };
    }

    // 2. Hard structural signals.
    if (request.inputImageUrl || request.inputVideoUrl) {
      return {
        task: 'MULTIMODAL',
        confidence: 0.95,
        signals: [request.inputImageUrl ? 'image attached' : 'video attached'],
      };
    }
    if (request.module === 'IMAGE') {
      return { task: 'IMAGE_GENERATION', confidence: 1, signals: ['IMAGE module'] };
    }

    const text = this.extractText(request);

    if (!text.trim()) {
      return { task: 'GENERAL_CHAT', confidence: 0.3, signals: ['no text content'] };
    }

    // 3. Weighted keyword scoring.
    const scores = new Map<TaskType, number>();
    const signals = new Map<TaskType, string[]>();

    for (const rule of RULES) {
      if (rule.pattern.test(text)) {
        scores.set(rule.task, (scores.get(rule.task) ?? 0) + rule.weight);
        const list = signals.get(rule.task) ?? [];
        list.push(rule.label);
        signals.set(rule.task, list);
      }
    }

    // 4. Long-context reasoning — large analytical input goes to the
    //    long-context specialist unless it is clearly a creative/visual ask.
    if (
      text.length > LONG_CONTEXT_CHAR_THRESHOLD &&
      !scores.has('CREATIVE_WRITING') &&
      !scores.has('IMAGE_GENERATION')
    ) {
      scores.set('LONG_CONTEXT', (scores.get('LONG_CONTEXT') ?? 0) + 5);
      const list = signals.get('LONG_CONTEXT') ?? [];
      list.push(`large input (${text.length} chars)`);
      signals.set('LONG_CONTEXT', list);
    }

    if (scores.size === 0) {
      return { task: 'GENERAL_CHAT', confidence: 0.4, signals: ['no specialized signals'] };
    }

    // 5. Pick the highest-scoring task.
    let best: TaskType = 'GENERAL_CHAT';
    let bestScore = -1;
    for (const [task, score] of scores) {
      if (score > bestScore) {
        best = task;
        bestScore = score;
      }
    }

    const totalScore = [...scores.values()].reduce((a, b) => a + b, 0);
    const confidence = Math.min(1, bestScore / Math.max(totalScore, 1) + 0.2);

    return { task: best, confidence, signals: signals.get(best) ?? [] };
  }

  private extractText(request: RouteRequest): string {
    const parts: string[] = [];
    if (request.prompt) parts.push(request.prompt);
    if (request.systemPrompt) parts.push(request.systemPrompt);
    for (const m of request.messages ?? []) parts.push(m.content);
    return parts.join('\n');
  }
}
