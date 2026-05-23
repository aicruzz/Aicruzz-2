'use client';

import { useEffect, useState } from 'react';
import { ImageOff, Layers, Upload } from 'lucide-react';
import { cn } from '@/lib/cn';
import { assetsApi, getApiError } from '@/lib/api';
import { UploadInput, AssetPicker, type PickableAsset } from '@/components/ui';

export interface BackgroundValue {
  mode: 'ORIGINAL' | 'REPLACE';
  backgroundUrl?: string;
}

type Tab = 'keep' | 'upload' | 'library';

const TABS: { key: Tab; label: string; icon: typeof ImageOff }[] = [
  { key: 'keep', label: 'Keep original', icon: ImageOff },
  { key: 'upload', label: 'Upload custom', icon: Upload },
  { key: 'library', label: 'From library', icon: Layers },
];

/**
 * Premium background-replacement selector. Emits a {mode,backgroundUrl}
 * value; the page forwards it over the WS `setBackground` seam. Until the
 * GPU compositing endpoint exists the processed output stays original
 * (graceful fallback) — see background.client.ts.
 */
export function BackgroundControls({
  value,
  onChange,
  disabled,
}: {
  value: BackgroundValue;
  onChange: (v: BackgroundValue) => void;
  disabled?: boolean;
}) {
  const [tab, setTab] = useState<Tab>(
    value.mode === 'REPLACE' ? 'library' : 'keep',
  );
  const [assets, setAssets] = useState<PickableAsset[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);

  // Lazy-load library backgrounds only when that tab is first opened.
  useEffect(() => {
    if (tab !== 'library' || loadedOnce) return;
    setLoadedOnce(true);
    setLoadingAssets(true);
    assetsApi
      .list('BACKGROUND')
      .then((res) => {
        const list = ((res.data?.data ?? []) as PickableAsset[]) || [];
        setAssets(Array.isArray(list) ? list : []);
      })
      .catch((e) => getApiError(e))
      .finally(() => setLoadingAssets(false));
  }, [tab, loadedOnce]);

  function selectKeep() {
    setTab('keep');
    onChange({ mode: 'ORIGINAL' });
  }

  return (
    <div className="glass space-y-3 rounded-xl border border-white/5 p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
        Background
      </h3>

      <div className="flex gap-1 rounded-xl border border-white/10 bg-surface-800/60 p-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              disabled={disabled}
              onClick={() => (t.key === 'keep' ? selectKeep() : setTab(t.key))}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors',
                'disabled:cursor-not-allowed disabled:opacity-50',
                active
                  ? 'bg-brand-gradient text-white shadow-lg shadow-brand-500/20'
                  : 'text-gray-400 hover:bg-white/5 hover:text-gray-200',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          );
        })}
      </div>

      {tab === 'keep' && (
        <p className="text-xs text-gray-500">
          Your real background is shown unmodified.
        </p>
      )}

      {tab === 'upload' && (
        <UploadInput
          accept="image/jpeg,image/png,image/webp"
          label="Upload a background image"
          disabled={disabled}
          value={
            value.mode === 'REPLACE' && value.backgroundUrl
              ? {
                  file: { name: 'background', size: 0 } as File,
                  previewUrl: value.backgroundUrl,
                  uploadedUrl: value.backgroundUrl,
                }
              : null
          }
          upload={async (file) => {
            const res = await assetsApi.upload(file);
            return (res.data as { data: { url: string } }).data.url;
          }}
          onChange={(f) =>
            onChange(
              f
                ? { mode: 'REPLACE', backgroundUrl: f.uploadedUrl }
                : { mode: 'ORIGINAL' },
            )
          }
        />
      )}

      {tab === 'library' && (
        <AssetPicker
          items={assets}
          loading={loadingAssets}
          selectedId={
            assets.find((a) => (a.url ?? a.thumbnailUrl) === value.backgroundUrl)
              ?.id ?? null
          }
          onSelect={(a) => {
            const url = a.url ?? a.thumbnailUrl ?? undefined;
            if (url) onChange({ mode: 'REPLACE', backgroundUrl: url });
          }}
          emptyLabel="No saved backgrounds"
        />
      )}

      <p className="text-[11px] leading-relaxed text-gray-600">
        Background replacement is applied on the GPU when available; until
        then the original background is preserved (no fake compositing).
      </p>
    </div>
  );
}
