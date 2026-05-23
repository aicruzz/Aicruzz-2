'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Check, Copy, Sparkles, Wand2 } from 'lucide-react';
import { Modal, Badge, Button } from '@/components/ui';
import { setBannerPrefill } from '@/lib/bannerPrefill';
import { MODULE_ROUTES, type Banner, type BannerMetadata } from './types';

const META_LABELS: Record<keyof BannerMetadata, string> = {
  durationSecs: 'Duration',
  aspectRatio: 'Aspect ratio',
  qualityTier: 'Quality tier',
  voiceMode: 'Voice mode',
  resolution: 'Resolution',
};

function metaEntries(meta?: BannerMetadata | null) {
  if (!meta) return [];
  return (Object.keys(META_LABELS) as (keyof BannerMetadata)[])
    .filter((k) => meta[k] !== undefined && meta[k] !== null && meta[k] !== '')
    .map((k) => ({
      label: META_LABELS[k],
      value: k === 'durationSecs' ? `${meta[k]}s` : String(meta[k]),
    }));
}

export function BannerViewerModal({
  banner,
  open,
  onClose,
}: {
  banner: Banner | null;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  if (!banner) return null;

  const meta = metaEntries(banner.metadata);
  const target = MODULE_ROUTES[banner.module];

  async function copyPrompt() {
    if (!banner) return;
    try {
      await navigator.clipboard.writeText(banner.prompt);
      setCopied(true);
      toast.success('Prompt copied');
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error('Could not copy prompt');
    }
  }

  function usePrompt() {
    if (!banner) return;
    setBannerPrefill({
      module: banner.module,
      prompt: banner.prompt,
      metadata: banner.metadata,
    });
    onClose();
    toast.success(`Opening ${target.label}…`);
    router.push(target.path);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={banner.title}
      className="max-w-3xl"
    >
      <div className="space-y-5">
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-black">
          {/* User-controlled playback only — never autoplays. */}
          <video
            key={banner.id}
            src={banner.videoUrl}
            poster={banner.thumbnailUrl ?? undefined}
            controls
            playsInline
            preload="metadata"
            className="aspect-video w-full bg-black"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="brand">{target.label}</Badge>
          {banner.isNew && <Badge tone="green">NEW</Badge>}
          {(banner.tags ?? []).map((t) => (
            <Badge key={t} tone="gray">
              {t}
            </Badge>
          ))}
        </div>

        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500">
            Generation prompt
          </p>
          <div className="max-h-44 overflow-y-auto rounded-xl border border-white/10 bg-surface-800/60 p-3 text-sm leading-relaxed text-gray-200 whitespace-pre-wrap">
            {banner.prompt}
          </div>
        </div>

        {meta.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500">
              Settings used
            </p>
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {meta.map((m) => (
                <div
                  key={m.label}
                  className="rounded-xl border border-white/10 bg-surface-800/40 px-3 py-2"
                >
                  <dt className="text-[11px] text-gray-500">{m.label}</dt>
                  <dd className="text-sm font-medium text-gray-200">
                    {m.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        <div className="flex flex-col gap-2 pt-1 sm:flex-row">
          <Button
            variant="secondary"
            fullWidth
            icon={copied ? <Check /> : <Copy />}
            onClick={copyPrompt}
          >
            {copied ? 'Copied' : 'Copy Prompt'}
          </Button>
          <Button
            variant="primary"
            fullWidth
            icon={<Wand2 />}
            onClick={usePrompt}
          >
            Use This Prompt
          </Button>
        </div>

        <p className="flex items-center justify-center gap-1.5 text-[11px] text-gray-600">
          <Sparkles className="h-3 w-3" />
          Example output — your result will vary with your inputs.
        </p>
      </div>
    </Modal>
  );
}
