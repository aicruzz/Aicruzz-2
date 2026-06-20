// Shared helpers for the env-gated video face-swap providers (HeyGen/Tavus and
// any future provider). Kept in one place so provider files don't duplicate
// polling/parse logic.

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Safe nested lookup: extract(obj, ['data','video_url']) → obj.data.video_url. */
export function extract(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (cur && typeof cur === 'object' && key in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }
  return cur ?? undefined;
}

/** First defined value across several candidate paths. */
export function firstOf(obj: unknown, paths: string[][]): unknown {
  for (const p of paths) {
    const v = extract(obj, p);
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}
