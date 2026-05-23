'use client';

import { useCallback, useEffect, useState } from 'react';
import { Sparkles, Upload, Layers, UserX } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/lib/cn';
import { assetsApi, getApiError } from '@/lib/api';
import { UploadInput, AssetPicker, type PickableAsset } from '@/components/ui';

export interface AvatarValue {
  avatarUrl?: string;
  assetId?: string;
}

type Tab = 'upload' | 'library';

const TABS: { key: Tab; label: string; icon: typeof Upload }[] = [
  { key: 'upload', label: 'Upload avatar', icon: Upload },
  { key: 'library', label: 'From library', icon: Layers },
];

/**
 * Target-avatar workflow — the centre of the Live Cam pipeline. The user's
 * camera only drives motion/expression/pose/lip-sync; this picks the
 * identity the output becomes. Uploads persist to the shared asset library
 * (type AVATAR) so they appear under Library/Recent next time. Switching is
 * applied live by the client pipeline — no session restart.
 */
export function AvatarControls({
  value,
  onChange,
  disabled,
}: {
  value: AvatarValue;
  onChange: (v: AvatarValue) => void;
  disabled?: boolean;
}) {
  const [tab, setTab] = useState<Tab>('library');
  const [assets, setAssets] = useState<PickableAsset[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);

  const refresh = useCallback(() => {
    setLoadingAssets(true);
    assetsApi
      .list('AVATAR')
      .then((res) => {
        const list = ((res.data?.data ?? []) as PickableAsset[]) || [];
        setAssets(Array.isArray(list) ? list : []);
      })
      .catch((e) => getApiError(e))
      .finally(() => setLoadingAssets(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const recent = assets.slice(0, 5);

  return (
    <div className="glass space-y-3 rounded-xl border border-white/5 p-4">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-400">
          <Sparkles className="h-3.5 w-3.5 text-brand-400" />
          Target Avatar
        </h3>
        {value.avatarUrl && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange({})}
            className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-300 disabled:opacity-50"
          >
            <UserX className="h-3 w-3" />
            Clear
          </button>
        )}
      </div>

      {/* Active avatar preview */}
      <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-surface-800/60 p-2.5">
        <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-surface-900">
          {value.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={value.avatarUrl}
              alt="Active avatar"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <UserX className="h-5 w-5 text-gray-600" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-gray-200">
            {value.avatarUrl ? 'Avatar active' : 'No avatar selected'}
          </p>
          <p className="text-[11px] text-gray-500">
            {value.avatarUrl
              ? 'Your motion drives this identity'
              : 'Pick or upload a target to transform into'}
          </p>
        </div>
      </div>

      {/* Recent quick-switcher — live switch, no session restart */}
      {recent.length > 0 && (
        <div className="flex gap-1.5">
          {recent.map((a) => {
            const url = a.url ?? a.thumbnailUrl ?? undefined;
            const active = url === value.avatarUrl;
            return (
              <button
                key={a.id}
                type="button"
                disabled={disabled || !url}
                onClick={() => url && onChange({ avatarUrl: url, assetId: a.id })}
                title={a.name}
                className={cn(
                  'h-10 w-10 overflow-hidden rounded-lg border transition-all',
                  active
                    ? 'border-brand-500 ring-2 ring-brand-500/40'
                    : 'border-white/10 hover:border-white/30',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={a.thumbnailUrl ?? a.url ?? ''}
                  alt={a.name}
                  className="h-full w-full object-cover"
                />
              </button>
            );
          })}
        </div>
      )}

      {/* Source tabs */}
      <div className="flex gap-1 rounded-xl border border-white/10 bg-surface-800/60 p-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              disabled={disabled}
              onClick={() => setTab(t.key)}
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

      {tab === 'upload' && (
        <UploadInput
          accept="image/jpeg,image/png,image/webp"
          label="Upload a target avatar (realistic, anime, cartoon, fantasy…)"
          disabled={disabled}
          value={
            value.avatarUrl
              ? {
                  file: { name: 'avatar', size: 0 } as File,
                  previewUrl: value.avatarUrl,
                  uploadedUrl: value.avatarUrl,
                }
              : null
          }
          upload={async (file) => {
            // Upload → Cloudinary, then persist to the shared asset library
            // (type AVATAR) so it shows under Library/Recent next time.
            const up = await assetsApi.upload(file);
            const url = (up.data as { data: { url: string } }).data.url;
            try {
              await assetsApi.create({
                type: 'AVATAR',
                name: file.name.replace(/\.[^.]+$/, '') || 'Avatar',
                url,
              });
              refresh();
            } catch (e) {
              toast.error(getApiError(e));
            }
            return url;
          }}
          onChange={(f) =>
            onChange(f ? { avatarUrl: f.uploadedUrl } : {})
          }
        />
      )}

      {tab === 'library' && (
        <AssetPicker
          items={assets}
          loading={loadingAssets}
          selectedId={value.assetId ?? null}
          onSelect={(a) => {
            const url = a.url ?? a.thumbnailUrl ?? undefined;
            if (url) onChange({ avatarUrl: url, assetId: a.id });
          }}
          emptyLabel="No saved avatars yet"
        />
      )}

      <p className="text-[11px] leading-relaxed text-gray-600">
        Reenactment runs on the GPU when available. Until then the output
        shows an honest standby preview — never a fake render.
      </p>
    </div>
  );
}
