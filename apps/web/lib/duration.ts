// Detects duration expressions in prompt text and returns seconds.
// Handles: 10s, 10sec, 10secs, 10second, 10seconds,
//          1min, 1minute, 2minutes, 2mins, 90 second video, 2 minute commercial
export function parseDurationFromPrompt(text: string): number | null {
  const t = text.toLowerCase();

  // Minutes pattern — must check before seconds to avoid "2 minute" matching the "2" alone
  const minMatch = t.match(/(\d+(?:\.\d+)?)\s*(?:minutes?|mins?)\b/);
  if (minMatch) {
    const mins = parseFloat(minMatch[1]);
    if (Number.isFinite(mins) && mins > 0) return Math.round(mins * 60);
  }

  // Seconds pattern — \bs catches "10s" while requiring word boundary to avoid false positives
  const secMatch = t.match(/(\d+(?:\.\d+)?)\s*(?:seconds?|secs?|s)\b/);
  if (secMatch) {
    const secs = parseFloat(secMatch[1]);
    if (Number.isFinite(secs) && secs > 0) return Math.round(secs);
  }

  return null;
}

// Clamps seconds to [min, max]. Returns the clamped value and whether it changed.
export function normalizeDuration(
  seconds: number,
  min: number,
  max: number,
): { value: number; clamped: boolean } {
  const value = Math.round(Math.min(max, Math.max(min, seconds)));
  return { value, clamped: value !== Math.round(seconds) };
}
