'use client';

import { Sparkles, X } from 'lucide-react';
import { Badge, Button } from '@/components/ui';

/**
 * Transient, opt-in "inspiration" hint surfaced after a showcase
 * "Use This Prompt" hand-off. It NEVER mutates studio controls on its
 * own — settings only change when the user clicks "Apply settings". It
 * is ephemeral (no persistence) and intentionally distinct from the
 * Save Setup preset system, so it does not duplicate that UI purpose.
 */
export function SuggestedSettings({
  items,
  onApply,
  onDismiss,
}: {
  items: { label: string }[];
  onApply: () => void;
  onDismiss: () => void;
}) {
  if (items.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-brand-500/20 bg-brand-500/[0.06] px-3 py-2.5">
      <span className="flex items-center gap-1.5 text-xs font-medium text-brand-300">
        <Sparkles className="h-3.5 w-3.5" />
        From this example
      </span>
      <div className="flex flex-wrap gap-1.5">
        {items.map((it) => (
          <Badge key={it.label} tone="gray">
            {it.label}
          </Badge>
        ))}
      </div>
      <div className="ml-auto flex items-center gap-1.5">
        <Button variant="secondary" size="sm" onClick={onApply}>
          Apply settings
        </Button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss suggestion"
          className="rounded-lg p-1.5 text-gray-400 hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
