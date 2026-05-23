'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  ChevronDown,
  ChevronUp,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { bannersApi, getApiError } from '@/lib/api';
import {
  Badge,
  Button,
  EmptyState,
  ErrorBoundary,
  Skeleton,
  Tabs,
  UploadInput,
  type TabItem,
  type UploadedFile,
} from '@/components/ui';
import type { Banner, BannerMetadata, BannerModule } from './types';

const MODULE_TABS: TabItem[] = [
  { key: 'VIDEO', label: 'Video Studio' },
  { key: 'CARTOON', label: 'Cartoon Studio' },
  { key: 'CHAT', label: 'AI Chat' },
  { key: 'LIVE_CAM', label: 'Live Cam' },
];

interface DraftState {
  id?: string;
  module: BannerModule;
  title: string;
  prompt: string;
  videoUrl: string;
  thumbnailUrl: string;
  tags: string;
  metadata: BannerMetadata;
  isActive: boolean;
  isNew: boolean;
  sortOrder: number;
  rotationInterval: number;
}

function emptyDraft(module: BannerModule): DraftState {
  return {
    module,
    title: '',
    prompt: '',
    videoUrl: '',
    thumbnailUrl: '',
    tags: '',
    metadata: {},
    isActive: true,
    isNew: false,
    sortOrder: 0,
    rotationInterval: 6000,
  };
}

function toDraft(b: Banner): DraftState {
  return {
    id: b.id,
    module: b.module,
    title: b.title,
    prompt: b.prompt,
    videoUrl: b.videoUrl,
    thumbnailUrl: b.thumbnailUrl ?? '',
    tags: (b.tags ?? []).join(', '),
    metadata: b.metadata ?? {},
    isActive: b.isActive,
    isNew: b.isNew,
    sortOrder: b.sortOrder,
    rotationInterval: b.rotationInterval,
  };
}

function fieldCls(extra = '') {
  return `w-full rounded-xl border border-white/10 bg-surface-700/50 px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-brand-500/50 ${extra}`;
}

function ManagerInner() {
  const [module, setModule] = useState<BannerModule>('VIDEO');
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await bannersApi.adminList(module);
      setBanners((res.data?.data ?? []) as Banner[]);
    } catch (e) {
      toast.error(getApiError(e));
    } finally {
      setLoading(false);
    }
  }, [module]);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    if (!draft) return;
    if (!draft.title.trim() || !draft.prompt.trim() || !draft.videoUrl.trim()) {
      toast.error('Title, prompt and a video are required');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        module: draft.module,
        title: draft.title.trim(),
        prompt: draft.prompt.trim(),
        videoUrl: draft.videoUrl.trim(),
        thumbnailUrl: draft.thumbnailUrl.trim() || undefined,
        tags: draft.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        metadata: draft.metadata,
        isActive: draft.isActive,
        isNew: draft.isNew,
        sortOrder: Number(draft.sortOrder) || 0,
        rotationInterval: Number(draft.rotationInterval) || 6000,
      };
      if (draft.id) {
        await bannersApi.update(draft.id, payload);
        toast.success('Banner updated');
      } else {
        await bannersApi.create(payload);
        toast.success('Banner created');
      }
      setDraft(null);
      await load();
    } catch (e) {
      toast.error(getApiError(e));
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm('Delete this banner permanently?')) return;
    try {
      await bannersApi.remove(id);
      toast.success('Banner deleted');
      await load();
    } catch (e) {
      toast.error(getApiError(e));
    }
  }

  async function move(idx: number, dir: -1 | 1) {
    const next = idx + dir;
    if (next < 0 || next >= banners.length) return;
    const reordered = [...banners];
    [reordered[idx], reordered[next]] = [reordered[next], reordered[idx]];
    setBanners(reordered);
    try {
      await bannersApi.reorder(
        reordered.map((b, i) => ({ id: b.id, sortOrder: i })),
      );
    } catch (e) {
      toast.error(getApiError(e));
      await load();
    }
  }

  function setMeta(patch: Partial<BannerMetadata>) {
    setDraft((d) => (d ? { ...d, metadata: { ...d.metadata, ...patch } } : d));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Tabs
          items={MODULE_TABS}
          value={module}
          onChange={(k) => setModule(k as BannerModule)}
        />
        <Button
          size="sm"
          className="ml-auto"
          icon={<Plus className="h-4 w-4" />}
          onClick={() => setDraft(emptyDraft(module))}
        >
          New Banner
        </Button>
      </div>

      {/* Editor */}
      {draft && (
        <div className="glass space-y-4 rounded-2xl border border-brand-500/20 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">
              {draft.id ? 'Edit banner' : 'New banner'} · {draft.module}
            </h3>
            <button
              onClick={() => setDraft(null)}
              className="rounded-lg p-1 text-gray-400 hover:bg-white/10 hover:text-white"
              aria-label="Close editor"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <input
              className={fieldCls()}
              placeholder="Title"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
            <input
              className={fieldCls()}
              placeholder="Tags (comma separated)"
              value={draft.tags}
              onChange={(e) => setDraft({ ...draft, tags: e.target.value })}
            />
          </div>

          <textarea
            className={fieldCls('h-24 resize-y')}
            placeholder="Full generation prompt"
            value={draft.prompt}
            onChange={(e) => setDraft({ ...draft, prompt: e.target.value })}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <p className="text-xs text-gray-500">Showcase video (mp4 / webm)</p>
              <UploadInput
                accept="video/mp4,video/webm,video/quicktime"
                previewKind="video"
                label="Upload showcase video"
                value={
                  draft.videoUrl
                    ? ({
                        file: { name: 'video', size: 0 } as File,
                        previewUrl: draft.videoUrl,
                        uploadedUrl: draft.videoUrl,
                      } as UploadedFile)
                    : null
                }
                upload={async (file) => {
                  const res = await bannersApi.uploadVideo(file);
                  return (res.data as { data: { url: string } }).data.url;
                }}
                onChange={(f) =>
                  setDraft({ ...draft, videoUrl: f?.uploadedUrl ?? '' })
                }
              />
            </div>
            <div className="space-y-1.5">
              <p className="text-xs text-gray-500">Poster / thumbnail</p>
              <UploadInput
                accept="image/jpeg,image/png,image/webp"
                label="Upload thumbnail"
                value={
                  draft.thumbnailUrl
                    ? ({
                        file: { name: 'thumbnail', size: 0 } as File,
                        previewUrl: draft.thumbnailUrl,
                        uploadedUrl: draft.thumbnailUrl,
                      } as UploadedFile)
                    : null
                }
                upload={async (file) => {
                  const res = await bannersApi.uploadThumbnail(file);
                  return (res.data as { data: { url: string } }).data.url;
                }}
                onChange={(f) =>
                  setDraft({ ...draft, thumbnailUrl: f?.uploadedUrl ?? '' })
                }
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <input
              className={fieldCls()}
              placeholder="Duration (s)"
              type="number"
              value={draft.metadata.durationSecs ?? ''}
              onChange={(e) =>
                setMeta({
                  durationSecs: e.target.value
                    ? Number(e.target.value)
                    : undefined,
                })
              }
            />
            <input
              className={fieldCls()}
              placeholder="Aspect ratio (e.g. 16:9)"
              value={draft.metadata.aspectRatio ?? ''}
              onChange={(e) => setMeta({ aspectRatio: e.target.value })}
            />
            <input
              className={fieldCls()}
              placeholder="Quality tier"
              value={draft.metadata.qualityTier ?? ''}
              onChange={(e) => setMeta({ qualityTier: e.target.value })}
            />
            <input
              className={fieldCls()}
              placeholder="Voice mode"
              value={draft.metadata.voiceMode ?? ''}
              onChange={(e) => setMeta({ voiceMode: e.target.value })}
            />
            <input
              className={fieldCls()}
              placeholder="Resolution (e.g. HD_720P)"
              value={draft.metadata.resolution ?? ''}
              onChange={(e) => setMeta({ resolution: e.target.value })}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <input
              className={fieldCls()}
              type="number"
              placeholder="Sort order"
              value={draft.sortOrder}
              onChange={(e) =>
                setDraft({ ...draft, sortOrder: Number(e.target.value) })
              }
            />
            <input
              className={fieldCls()}
              type="number"
              placeholder="Rotation interval (ms)"
              value={draft.rotationInterval}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  rotationInterval: Number(e.target.value),
                })
              }
            />
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={draft.isActive}
                onChange={(e) =>
                  setDraft({ ...draft, isActive: e.target.checked })
                }
              />
              Active
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={draft.isNew}
                onChange={(e) =>
                  setDraft({ ...draft, isNew: e.target.checked })
                }
              />
              NEW badge
            </label>
            <Button
              className="ml-auto"
              size="sm"
              loading={saving}
              onClick={save}
            >
              {draft.id ? 'Save changes' : 'Create banner'}
            </Button>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : banners.length === 0 ? (
        <EmptyState
          title="No banners yet"
          description={`Create the first showcase banner for the ${module.toLowerCase()} studio.`}
        />
      ) : (
        <div className="space-y-2">
          {banners.map((b, idx) => (
            <div
              key={b.id}
              className="flex items-center gap-3 rounded-xl border border-white/10 bg-surface-800/50 p-3"
            >
              <div className="flex flex-col">
                <button
                  onClick={() => move(idx, -1)}
                  disabled={idx === 0}
                  className="text-gray-500 hover:text-white disabled:opacity-30"
                  aria-label="Move up"
                >
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button
                  onClick={() => move(idx, 1)}
                  disabled={idx === banners.length - 1}
                  className="text-gray-500 hover:text-white disabled:opacity-30"
                  aria-label="Move down"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
              </div>
              {b.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={b.thumbnailUrl}
                  alt={b.title}
                  className="h-12 w-20 rounded-lg object-cover"
                />
              ) : (
                <div className="h-12 w-20 rounded-lg bg-white/5" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">
                  {b.title}
                </p>
                <p className="truncate text-xs text-gray-500">{b.prompt}</p>
              </div>
              <div className="flex items-center gap-2">
                {b.isNew && <Badge tone="green">NEW</Badge>}
                <Badge tone={b.isActive ? 'brand' : 'gray'}>
                  {b.isActive ? 'Active' : 'Off'}
                </Badge>
                <button
                  onClick={() => setDraft(toDraft(b))}
                  className="rounded-lg p-1.5 text-gray-400 hover:bg-white/10 hover:text-white"
                  aria-label="Edit"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => remove(b.id)}
                  className="rounded-lg p-1.5 text-gray-400 hover:bg-red-500/10 hover:text-red-400"
                  aria-label="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function AdminBannerManager() {
  return (
    <ErrorBoundary>
      <ManagerInner />
    </ErrorBoundary>
  );
}
