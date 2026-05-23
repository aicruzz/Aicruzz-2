'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Wand2, Trash2, Layers, Film, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';
import { cartoonApi, getApiError } from '@/lib/api';
import {
  Card, Button, Badge, SkeletonCard, EmptyState, Modal,
} from '@/components/ui';

interface Scene {
  id: string;
  name: string;
  prompt: string | null;
  imageUrl: string | null;
  durationSecs: number;
}
interface Template {
  id: string;
  name: string;
  description: string | null;
  type: string;
  thumbnailUrl: string | null;
  isPublic: boolean;
  _count?: { scenes: number; jobs: number };
  scenes?: Scene[];
}

export function TemplateLibrary() {
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<Template | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await cartoonApi.listTemplates();
      setTemplates((r.data as { data?: Template[] }).data ?? []);
    } catch (e) {
      toast.error(getApiError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function generateNow(t: Template) {
    setBusy(t.id);
    try {
      await cartoonApi.generate({ type: t.type, templateId: t.id });
      toast.success('Generation started — see Cartoon Studio history');
      router.push('/cartoon-studio');
    } catch (e) {
      toast.error(getApiError(e));
    } finally {
      setBusy(null);
    }
  }

  async function openDetail(t: Template) {
    try {
      const r = await cartoonApi.getTemplate(t.id);
      setDetail((r.data as { data: Template }).data);
    } catch (e) {
      toast.error(getApiError(e));
    }
  }

  async function remove(id: string) {
    try {
      await cartoonApi.deleteTemplate(id);
      setTemplates((l) => l.filter((t) => t.id !== id));
      setDetail(null);
      toast.success('Template deleted');
    } catch (e) {
      toast.error(getApiError(e));
    }
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-400">
        Saved cartoon templates — reusable prompts, scenes &amp; settings for one-click generation.
      </p>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : templates.length === 0 ? (
        <EmptyState
          icon={<Layers className="h-7 w-7" />}
          title="No templates yet"
          description="Save a generated cartoon as a template from the Studio to reuse it."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => (
            <Card key={t.id} className="space-y-3 p-4">
              <div className="aspect-video overflow-hidden rounded-xl bg-white/[0.04]">
                {t.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={t.thumbnailUrl} alt={t.name} loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-gray-600">
                    <Film className="h-7 w-7" />
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-medium text-gray-100">{t.name}</p>
                <Badge tone="gray">{t.type}</Badge>
              </div>
              <p className="text-xs text-gray-500">
                {t._count?.scenes ?? 0} scenes · {t._count?.jobs ?? 0} uses
              </p>
              <div className="flex flex-wrap gap-1.5">
                <Button
                  size="sm"
                  loading={busy === t.id}
                  icon={<Wand2 className="h-3.5 w-3.5" />}
                  onClick={() => generateNow(t)}
                >
                  Generate
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<ExternalLink className="h-3.5 w-3.5" />}
                  onClick={() => router.push(`/cartoon-studio?templateId=${t.id}`)}
                >
                  Studio
                </Button>
                <Button size="sm" variant="ghost" onClick={() => openDetail(t)}>
                  Details
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Trash2 className="h-3.5 w-3.5" />}
                  onClick={() => remove(t.id)}
                />
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail?.name}>
        {detail && (
          <div className="space-y-4">
            {detail.description && (
              <p className="text-sm text-gray-400">{detail.description}</p>
            )}
            <div className="space-y-2">
              {(detail.scenes ?? []).length === 0 ? (
                <p className="text-sm text-gray-500">No scenes in this template.</p>
              ) : (
                detail.scenes!.map((s, i) => (
                  <div key={s.id} className="rounded-xl border border-white/10 p-3">
                    <p className="text-sm text-gray-200">
                      <span className="mr-2 text-xs text-gray-500">#{i + 1}</span>
                      {s.name}
                    </p>
                    {s.prompt && (
                      <p className="mt-1 text-xs text-gray-500">{s.prompt}</p>
                    )}
                  </div>
                ))
              )}
            </div>
            <Button
              icon={<Wand2 className="h-4 w-4" />}
              onClick={() => generateNow(detail)}
            >
              Generate from this template
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
