'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Copy, Trash2, Pencil, Wand2, UserRound } from 'lucide-react';
import toast from 'react-hot-toast';
import { assetsApi, getApiError } from '@/lib/api';
import {
  Card, Button, SkeletonCard, EmptyState, Modal,
} from '@/components/ui';
import { UploadInput, type UploadedFile } from '@/components/ui/UploadInput';

interface Character {
  id: string;
  name: string;
  description?: string | null;
  baseImageUrl?: string | null;
  stylePrompt?: string | null;
  thumbnailUrl?: string | null;
}

export function CharacterLibrary() {
  const router = useRouter();
  const [chars, setChars] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Character | null>(null);
  const [open, setOpen] = useState(false);

  const [form, setForm] = useState({ name: '', description: '', stylePrompt: '' });
  const [img, setImg] = useState<UploadedFile | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await assetsApi.listCharacters();
      setChars((r.data as { data?: Character[] }).data ?? []);
    } catch (e) {
      toast.error(getApiError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditing(null);
    setForm({ name: '', description: '', stylePrompt: '' });
    setImg(null);
    setOpen(true);
  }
  function openEdit(c: Character) {
    setEditing(c);
    setForm({
      name: c.name,
      description: c.description ?? '',
      stylePrompt: c.stylePrompt ?? '',
    });
    setImg(null);
    setOpen(true);
  }

  async function save() {
    if (!form.name.trim()) return toast.error('Name is required');
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        stylePrompt: form.stylePrompt.trim() || undefined,
      };
      if (img) {
        payload.baseImageUrl = img.uploadedUrl;
        payload.thumbnailUrl = img.uploadedUrl;
      }
      if (editing) {
        await assetsApi.updateCharacter(editing.id, payload);
        toast.success('Character updated');
      } else {
        await assetsApi.createCharacter(payload);
        toast.success('Character created');
      }
      setOpen(false);
      load();
    } catch (e) {
      toast.error(getApiError(e));
    } finally {
      setSaving(false);
    }
  }

  async function duplicate(c: Character) {
    try {
      await assetsApi.createCharacter({
        name: `${c.name} (copy)`,
        description: c.description ?? undefined,
        baseImageUrl: c.baseImageUrl ?? undefined,
        thumbnailUrl: c.thumbnailUrl ?? undefined,
        stylePrompt: c.stylePrompt ?? undefined,
      });
      toast.success('Duplicated');
      load();
    } catch (e) {
      toast.error(getApiError(e));
    }
  }

  async function remove(id: string) {
    try {
      await assetsApi.deleteCharacter(id);
      setChars((l) => l.filter((c) => c.id !== id));
      toast.success('Deleted');
    } catch (e) {
      toast.error(getApiError(e));
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-400">
          Reusable cartoon characters — bind an image, style &amp; voice and reuse them.
        </p>
        <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
          New character
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : chars.length === 0 ? (
        <EmptyState
          icon={<UserRound className="h-7 w-7" />}
          title="No characters yet"
          description="Create reusable characters to keep a consistent identity across scenes."
          action={<Button size="sm" onClick={openCreate}>Create character</Button>}
        />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {chars.map((c) => (
            <Card key={c.id} className="space-y-3 p-3">
              <div className="aspect-square overflow-hidden rounded-xl bg-white/[0.04]">
                {c.thumbnailUrl || c.baseImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.thumbnailUrl || c.baseImageUrl || ''} alt={c.name} loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-gray-600">
                    <UserRound className="h-7 w-7" />
                  </div>
                )}
              </div>
              <p className="truncate text-sm font-medium text-gray-100">{c.name}</p>
              <div className="grid grid-cols-2 gap-1.5">
                <Button
                  size="sm"
                  icon={<Wand2 className="h-3.5 w-3.5" />}
                  onClick={() => router.push(`/cartoon-studio?characterId=${c.id}`)}
                >
                  Use
                </Button>
                <Button size="sm" variant="secondary" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => openEdit(c)}>
                  Edit
                </Button>
                <Button size="sm" variant="ghost" icon={<Copy className="h-3.5 w-3.5" />} onClick={() => duplicate(c)}>
                  Copy
                </Button>
                <Button size="sm" variant="ghost" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => remove(c.id)}>
                  Delete
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Edit character' : 'New character'}>
        <div className="space-y-4">
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Character name"
            className="w-full rounded-xl border border-white/10 bg-surface-700/50 px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none"
          />
          <textarea
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            rows={2}
            placeholder="Description (optional)"
            className="w-full resize-none rounded-xl border border-white/10 bg-surface-700/50 px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none"
          />
          <textarea
            value={form.stylePrompt}
            onChange={(e) => setForm((f) => ({ ...f, stylePrompt: e.target.value }))}
            rows={2}
            placeholder="Style prompt (e.g. Pixar 3D, friendly mascot)"
            className="w-full resize-none rounded-xl border border-white/10 bg-surface-700/50 px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none"
          />
          <UploadInput
            accept="image/*"
            label={editing ? 'Replace base image (optional)' : 'Upload base image'}
            value={img}
            upload={async (f) => {
              const r = await assetsApi.upload(f);
              return (r.data as { data: { url: string } }).data.url;
            }}
            onChange={setImg}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button size="sm" loading={saving} onClick={save}>
              {editing ? 'Save changes' : 'Create'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
