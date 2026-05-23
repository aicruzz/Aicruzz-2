'use client';

import { useEffect, useState } from 'react';
import { Library, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { assetsApi, getApiError } from '@/lib/api';
import { UploadInput, type UploadedFile } from '@/components/ui/UploadInput';
import { Modal } from '@/components/ui/Overlay';
import { AssetPicker, type PickableAsset } from '@/components/ui/AssetPicker';
import { Button } from '@/components/ui/Button';

export interface AssetValue {
  url: string;
  assetId?: string;
  name?: string;
}

/**
 * Upload a new file OR pick a reusable saved asset from the library.
 * `assetType` is the user_assets type (FACE/BACKGROUND/LOGO/...).
 * Resolves to a stable URL (+ assetId when chosen from the library) so
 * the existing /cartoon/generate contract is used unchanged.
 */
export function AssetSlot({
  label,
  assetType,
  value,
  onChange,
  required,
}: {
  label: string;
  assetType: string;
  value: AssetValue | null;
  onChange: (v: AssetValue | null) => void;
  required?: boolean;
}) {
  const [picking, setPicking] = useState(false);
  const [items, setItems] = useState<PickableAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploaded, setUploaded] = useState<UploadedFile | null>(null);

  useEffect(() => {
    if (!picking) return;
    setLoading(true);
    assetsApi
      .list(assetType)
      .then((r) => {
        const data = (r.data as { data?: PickableAsset[] }).data ?? [];
        setItems(data);
      })
      .catch((e) => toast.error(getApiError(e)))
      .finally(() => setLoading(false));
  }, [picking, assetType]);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
          {label} {required && <span className="text-red-400">*</span>}
        </p>
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="inline-flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300"
        >
          <Library className="h-3.5 w-3.5" /> Library
        </button>
      </div>

      {value && value.assetId ? (
        <div className="glass flex items-center gap-3 rounded-xl border border-white/10 p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value.url} alt={value.name ?? 'asset'} className="h-12 w-12 rounded-lg object-cover" />
          <span className="flex-1 truncate text-sm text-gray-200">
            {value.name ?? 'Library asset'}
          </span>
          <button
            type="button"
            aria-label="Clear"
            onClick={() => onChange(null)}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <UploadInput
          accept="image/*"
          label={`Upload ${label.toLowerCase()}`}
          hint="PNG, JPG, WEBP"
          value={uploaded}
          upload={async (file) => {
            const r = await assetsApi.upload(file);
            return (r.data as { data: { url: string } }).data.url;
          }}
          onChange={(f) => {
            setUploaded(f);
            onChange(f ? { url: f.uploadedUrl, name: f.file.name } : null);
          }}
        />
      )}

      <Modal open={picking} onClose={() => setPicking(false)} title={`Choose ${label}`}>
        <AssetPicker
          items={items}
          loading={loading}
          selectedId={value?.assetId ?? null}
          onSelect={(a) => {
            onChange({ url: a.url ?? a.thumbnailUrl ?? '', assetId: a.id, name: a.name });
            setPicking(false);
          }}
          emptyLabel={`No saved ${label.toLowerCase()} yet`}
        />
        <div className="mt-4 flex justify-end">
          <Button variant="ghost" size="sm" onClick={() => setPicking(false)}>
            Cancel
          </Button>
        </div>
      </Modal>
    </div>
  );
}
