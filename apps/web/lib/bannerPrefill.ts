// Cross-module "Use This Prompt" hand-off.
//
// The showcase modal stashes a banner's prompt + settings here, then
// redirects to the target studio route. Each studio reads (and clears)
// this once on mount and best-effort applies supported fields. This is
// purely additive — studios that don't consume it are unaffected.

import type { BannerMetadata, BannerModule } from '@/components/banners/types';

const KEY = 'aicruzz_banner_prefill';

export interface BannerPrefill {
  module: BannerModule;
  prompt: string;
  metadata?: BannerMetadata | null;
}

export function setBannerPrefill(payload: BannerPrefill): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    /* storage unavailable — redirect still works, just no prefill */
  }
}

/** Reads and clears the pending prefill if it targets `module`. */
export function consumeBannerPrefill(
  module: BannerModule,
): BannerPrefill | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BannerPrefill;
    if (parsed.module !== module) return null;
    sessionStorage.removeItem(KEY);
    return parsed;
  } catch {
    return null;
  }
}
