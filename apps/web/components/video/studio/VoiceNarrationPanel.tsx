'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic, Play, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { voiceApi, getApiError } from '@/lib/api';
import { PillSelect } from '@/components/cartoon/studio/StudioControls';
import { VOICE_EMOTIONS, type VoiceMode } from '@/components/cartoon/studio/types';

export interface VideoVoiceSelection {
  voiceMode: VoiceMode; // 'NONE' | 'AI' | 'UPLOAD' | 'CLONE'
  voiceText: string;
  emotion: string;
  voiceGender: 'MALE' | 'FEMALE';
  voiceAssetId?: string;
}

const VOICE_MODE_OPTS = [
  { value: 'NONE', label: 'None' },
  { value: 'AI', label: 'AI voice' },
  { value: 'UPLOAD', label: 'Saved voice' },
  { value: 'CLONE', label: 'Cloned voice' },
];

const GENDER_OPTS = [
  { value: 'FEMALE', label: 'Female' },
  { value: 'MALE', label: 'Male' },
];

const PREVIEW_TEXT = 'Hello, this is a voice preview from AiCruzz.';

interface SavedVoice {
  id: string;
  name: string;
}

/**
 * Optional Voice & Narration section for Video Studio. Mirrors the Cartoon
 * Studio VoicePanel pattern but is adapted to the video request contract
 * (voiceEnabled / voiceText / voiceGender) plus payload-only extensions
 * (voiceAssetId, voiceStyle). Preview uses the standalone /api/voice/generate
 * endpoint — never the video backend.
 */
export function VoiceNarrationPanel({
  value,
  onChange,
}: {
  value: VideoVoiceSelection;
  onChange: (v: VideoVoiceSelection) => void;
}) {
  const [voices, setVoices] = useState<SavedVoice[]>([]);
  const [previewing, setPreviewing] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const needsSaved = value.voiceMode === 'UPLOAD' || value.voiceMode === 'CLONE';

  useEffect(() => {
    if (!needsSaved) return;
    voiceApi
      .listSaved()
      .then((r) => setVoices((r.data as { data?: SavedVoice[] }).data ?? []))
      .catch((e) => toast.error(getApiError(e)));
  }, [needsSaved]);

  const set = (patch: Partial<VideoVoiceSelection>) =>
    onChange({ ...value, ...patch });

  async function preview() {
    if (previewing) return;
    setPreviewing(true);
    try {
      const r = await voiceApi.generate({
        text: value.voiceText.trim() || PREVIEW_TEXT,
        gender: value.voiceMode === 'AI' ? value.voiceGender : undefined,
        voiceAssetId: needsSaved ? value.voiceAssetId : undefined,
        style: value.emotion,
      });
      const src = (r.data as { data: { audioUrl: string } }).data.audioUrl;
      if (audioRef.current) {
        audioRef.current.src = src;
        await audioRef.current.play();
      }
    } catch (e) {
      toast.error(getApiError(e));
    } finally {
      setPreviewing(false);
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-white/10 bg-surface-800/40 p-4">
      <div className="flex items-center gap-2 text-sm font-medium text-gray-200">
        <Mic className="h-4 w-4 text-brand-400" /> Voice &amp; narration
      </div>

      <PillSelect
        label="Voice mode"
        value={value.voiceMode}
        onChange={(v) => set({ voiceMode: v as VoiceMode })}
        options={VOICE_MODE_OPTS}
      />

      {value.voiceMode !== 'NONE' && (
        <>
          <div>
            <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-gray-500">
              Script / narration text
            </label>
            <textarea
              value={value.voiceText}
              onChange={(e) => set({ voiceText: e.target.value })}
              rows={3}
              placeholder="What should the narrator say…"
              className="w-full resize-none rounded-xl border border-white/10 bg-surface-700/50 px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:border-brand-500/40 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
          </div>

          {value.voiceMode === 'AI' && (
            <PillSelect
              label="Voice"
              value={value.voiceGender}
              onChange={(v) => set({ voiceGender: v as 'MALE' | 'FEMALE' })}
              options={GENDER_OPTS}
            />
          )}

          <PillSelect
            label="Emotion"
            value={value.emotion}
            onChange={(v) => set({ emotion: v })}
            options={VOICE_EMOTIONS.map((e) => ({ value: e, label: e }))}
          />

          {needsSaved && (
            <div>
              <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-gray-500">
                Saved voice
              </label>
              <select
                value={value.voiceAssetId ?? ''}
                onChange={(e) =>
                  set({ voiceAssetId: e.target.value || undefined })
                }
                className="w-full rounded-xl border border-white/10 bg-surface-700/50 px-4 py-2.5 text-sm text-white focus:border-brand-500/40 focus:outline-none"
              >
                <option value="">Select a saved voice…</option>
                {voices.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
              {voices.length === 0 && (
                <p className="mt-1 text-xs text-gray-500">
                  No saved voices yet — clone one in the Voice library.
                </p>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={preview}
            disabled={previewing || (needsSaved && !value.voiceAssetId)}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-1.5 text-sm text-gray-300 transition-colors hover:border-brand-500/50 hover:text-brand-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {previewing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            {previewing ? 'Generating preview…' : 'Preview voice'}
          </button>
          <audio ref={audioRef} className="hidden" />
        </>
      )}
    </div>
  );
}
