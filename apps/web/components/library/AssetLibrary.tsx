'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Search, Trash2, ImageIcon } from 'lucide-react';
import toast from 'react-hot-toast';
import { assetsApi, getApiError } from '@/lib/api';
import {
  Button, Badge, SkeletonCard, EmptyState, Modal,
} from '@/components/ui';
import { UploadInput, type UploadedFile } from '@/components/ui/UploadInput';

interface Asset {
  id: string;
  type: string;
  name: string;
  url: string;
  thumbnailUrl?: string | null;
  createdAt: string;
}

const TYPES = ['ALL', 'FACE', 'BACKGROUND', 'LOGO', 'SCENE'] as const;

export function AssetLibrary() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<(typeof TYPES)[number]>('ALL');
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [detail, setDetail] = useState<Asset | null>(null);

  // add-form
  const [newType, setNewType] = useState('FACE');
  const [newName, setNewName] = useState('');
  const [upload, setUpload] = useState<UploadedFile | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await assetsApi.list();
      const all = (r.data as { data?: Asset[] }).data ?? [];
      setAssets(all.filter((a) => a.type !== 'VOICE' && a.type !== 'CHARACTER'));
    } catch (e) {
      toast.error(getApiError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return assets.filter(
      (a) =>
        (filter === 'ALL' || a.type === filter) &&
        (!term || a.name.toLowerCase().includes(term)),
    );
  }, [assets, filter, q]);

  async function createAsset() {
    if (!newName.trim() || !upload) {
      toast.error('Name and file are required');
      return;
    }
    try {
      await assetsApi.create({
        type: newType,
        name: newName.trim(),
        url: upload.uploadedUrl,
        thumbnailUrl: upload.uploadedUrl,
      });
      toast.success('Asset saved');
      setAdding(false);
      setNewName('');
      setUpload(null);
      load();
    } catch (e) {
      toast.error(getApiError(e));
    }
  }

  async function remove(id: string) {
    try {
      await assetsApi.remove(id);
      setAssets((a) => a.filter((x) => x.id !== id));
      setDetail(null);
      toast.success('Deleted');
    } catch (e) {
      toast.error(getApiError(e));
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {TYPES.map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === t
                  ? 'border-brand-500/60 bg-brand-500/10 text-brand-300'
                  : 'border-white/10 text-gray-400 hover:border-white/25'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setAdding(true)}>
          Add asset
        </Button>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search assets…"
          className="w-full rounded-xl border border-white/10 bg-surface-700/50 py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-gray-500 focus:border-brand-500/40 focus:outline-none"
        />
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<ImageIcon className="h-7 w-7" />}
          title="No assets yet"
          description="Upload images, backgrounds, logos and scenes to reuse everywhere."
          action={<Button size="sm" onClick={() => setAdding(true)}>Add your first asset</Button>}
        />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((a) => (
            <button
              key={a.id}
              onClick={() => setDetail(a)}
              className="group overflow-hidden rounded-xl border border-white/10 text-left transition-colors hover:border-white/25"
            >
              <div className="aspect-square bg-white/[0.04]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.thumbnailUrl || a.url} alt={a.name} loading="lazy" className="h-full w-full object-cover" />
              </div>
              <div className="flex items-center justify-between gap-2 p-2">
                <span className="truncate text-xs text-gray-300">{a.name}</span>
                <Badge tone="gray">{a.type}</Badge>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Add modal */}
      <Modal open={adding} onClose={() => setAdding(false)} title="Add asset">
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs uppercase tracking-wide text-gray-500">Type</label>
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-surface-700/50 px-4 py-2.5 text-sm text-white focus:outline-none"
            >
              {['FACE', 'BACKGROUND', 'LOGO', 'SCENE'].map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Asset name"
            className="w-full rounded-xl border border-white/10 bg-surface-700/50 px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none"
          />
          <UploadInput
            accept="image/*"
            label="Upload image"
            value={upload}
            upload={async (f) => {
              const r = await assetsApi.upload(f);
              return (r.data as { data: { url: string } }).data.url;
            }}
            onChange={setUpload}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>Cancel</Button>
            <Button size="sm" onClick={createAsset}>Save asset</Button>
          </div>
        </div>
      </Modal>

      {/* Detail modal */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail?.name}>
        {detail && (
          <div className="space-y-4">
            <div className="overflow-hidden rounded-xl border border-white/10">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={detail.url} alt={detail.name} className="max-h-80 w-full object-contain bg-black" />
            </div>
            <div className="flex items-center justify-between text-xs text-gray-400">
              <Badge tone="brand">{detail.type}</Badge>
              <span>{new Date(detail.createdAt).toLocaleString()}</span>
            </div>
            <Button
              variant="danger"
              size="sm"
              icon={<Trash2 className="h-4 w-4" />}
              onClick={() => remove(detail.id)}
            >
              Delete asset
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
