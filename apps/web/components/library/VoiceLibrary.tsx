'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Play, Trash2, Link2, Mic } from 'lucide-react';
import toast from 'react-hot-toast';
import { voiceApi, assetsApi, getApiError } from '@/lib/api';
import {
  Card, Button, Badge, SkeletonCard, EmptyState, Modal,
} from '@/components/ui';
import { UploadInput, type UploadedFile } from '@/components/ui/UploadInput';

interface VoiceAsset {
  id: string;
  name: string;
  url: string;
  meta?: { voiceId?: string; cloned?: boolean; tags?: string[] } | null;
}
interface Character { id: string; name: string }

const PREVIEW_TEXT = 'Hello, this is a voice preview from AiCruzz.';

export function VoiceLibrary() {
  const [voices, setVoices] = useState<VoiceAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [linkFor, setLinkFor] = useState<VoiceAsset | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // clone form
  const [cName, setCName] = useState('');
  const [cSample, setCSample] = useState<UploadedFile | null>(null);
  const [consent, setConsent] = useState(false);
  const [cloning, setCloning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await voiceApi.listSaved();
      setVoices((r.data as { data?: VoiceAsset[] }).data ?? []);
    } catch (e) {
      toast.error(getApiError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function preview(v: VoiceAsset) {
    setPreviewing(v.id);
    try {
      // Cloned voices store the source sample → playable directly.
      let src = v.url && /\.(mp3|wav|ogg|m4a)/i.test(v.url) ? v.url : '';
      if (!src) {
        const r = await voiceApi.generate({ text: PREVIEW_TEXT, voiceAssetId: v.id });
        src = (r.data as { data: { audioUrl: string } }).data.audioUrl;
      }
      if (audioRef.current) {
        audioRef.current.src = src;
        await audioRef.current.play();
      }
    } catch (e) {
      toast.error(getApiError(e));
    } finally {
      setPreviewing(null);
    }
  }

  async function saveTags(v: VoiceAsset, tags: string[]) {
    try {
      await assetsApi.update(v.id, { meta: { ...(v.meta ?? {}), tags } });
      setVoices((list) =>
        list.map((x) => (x.id === v.id ? { ...x, meta: { ...x.meta, tags } } : x)),
      );
    } catch (e) {
      toast.error(getApiError(e));
    }
  }

  async function remove(id: string) {
    try {
      await assetsApi.remove(id);
      setVoices((l) => l.filter((v) => v.id !== id));
      toast.success('Voice removed');
    } catch (e) {
      toast.error(getApiError(e));
    }
  }

  async function doClone() {
    if (!cName.trim() || !cSample) return toast.error('Name and sample required');
    if (!consent) return toast.error('You must confirm consent to clone a voice');
    setCloning(true);
    try {
      await voiceApi.clone({
        name: cName.trim(),
        sampleUrl: cSample.uploadedUrl,
        consentConfirmed: true,
      });
      toast.success('Voice cloned & saved');
      setCloneOpen(false);
      setCName(''); setCSample(null); setConsent(false);
      load();
    } catch (e) {
      toast.error(getApiError(e));
    } finally {
      setCloning(false);
    }
  }

  async function openLink(v: VoiceAsset) {
    setLinkFor(v);
    try {
      const r = await assetsApi.listCharacters();
      setCharacters((r.data as { data?: Character[] }).data ?? []);
    } catch (e) {
      toast.error(getApiError(e));
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-400">
          Reusable AI &amp; cloned voices — usable across Cartoon Studio, video and chat.
        </p>
        <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setCloneOpen(true)}>
          Clone voice
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : voices.length === 0 ? (
        <EmptyState
          icon={<Mic className="h-7 w-7" />}
          title="No saved voices"
          description="Clone a voice from a sample to reuse it everywhere."
          action={<Button size="sm" onClick={() => setCloneOpen(true)}>Clone a voice</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {voices.map((v) => (
            <Card key={v.id} className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500/10">
                    <Mic className="h-4 w-4 text-brand-400" />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-gray-100">{v.name}</p>
                    {v.meta?.cloned && <Badge tone="brand">cloned</Badge>}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {(v.meta?.tags ?? []).map((t) => (
                  <Badge key={t} tone="gray">{t}</Badge>
                ))}
                <button
                  onClick={() => {
                    const tag = prompt('Add emotion tag (e.g. cheerful)');
                    if (tag?.trim()) saveTags(v, [...(v.meta?.tags ?? []), tag.trim()]);
                  }}
                  className="rounded-full border border-dashed border-white/15 px-2 py-0.5 text-[11px] text-gray-500 hover:text-gray-300"
                >
                  + tag
                </button>
              </div>

              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  loading={previewing === v.id}
                  icon={<Play className="h-3.5 w-3.5" />}
                  onClick={() => preview(v)}
                >
                  Preview
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Link2 className="h-3.5 w-3.5" />}
                  onClick={() => openLink(v)}
                >
                  Link
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Trash2 className="h-3.5 w-3.5" />}
                  onClick={() => remove(v.id)}
                />
              </div>
            </Card>
          ))}
        </div>
      )}

      <audio ref={audioRef} className="hidden" />

      {/* Clone modal */}
      <Modal open={cloneOpen} onClose={() => setCloneOpen(false)} title="Clone a voice">
        <div className="space-y-4">
          <input
            value={cName}
            onChange={(e) => setCName(e.target.value)}
            placeholder="Voice name"
            className="w-full rounded-xl border border-white/10 bg-surface-700/50 px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none"
          />
          <UploadInput
            accept="audio/*"
            label="Upload voice sample"
            hint="MP3 / WAV — a few seconds of clear speech"
            previewKind="audio"
            value={cSample}
            upload={async (f) => {
              const r = await assetsApi.upload(f);
              return (r.data as { data: { url: string } }).data.url;
            }}
            onChange={setCSample}
          />
          <label className="flex items-start gap-2 text-xs text-gray-400">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 accent-brand-500"
            />
            I confirm I have the right and explicit consent to clone this voice,
            and accept the platform voice-cloning terms.
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setCloneOpen(false)}>Cancel</Button>
            <Button size="sm" loading={cloning} disabled={!consent} onClick={doClone}>
              Clone voice
            </Button>
          </div>
        </div>
      </Modal>

      {/* Link-to-character modal */}
      <Modal open={!!linkFor} onClose={() => setLinkFor(null)} title={`Link “${linkFor?.name}” to a character`}>
        {characters.length === 0 ? (
          <p className="text-sm text-gray-500">No characters yet — create one in the Character library.</p>
        ) : (
          <div className="space-y-2">
            {characters.map((c) => (
              <button
                key={c.id}
                onClick={async () => {
                  try {
                    await voiceApi.link({ characterId: c.id, voiceAssetId: linkFor!.id });
                    toast.success(`Linked to ${c.name}`);
                    setLinkFor(null);
                  } catch (e) {
                    toast.error(getApiError(e));
                  }
                }}
                className="flex w-full items-center justify-between rounded-xl border border-white/10 px-4 py-3 text-sm text-gray-200 hover:border-brand-500/40"
              >
                {c.name}
                <Link2 className="h-4 w-4 text-brand-400" />
              </button>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
