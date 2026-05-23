'use client';

import { useEffect, useState } from 'react';
import { Mic } from 'lucide-react';
import toast from 'react-hot-toast';
import { voiceApi, getApiError } from '@/lib/api';
import { PillSelect } from './StudioControls';
import { VOICE_EMOTIONS, type VoiceMode } from './types';

export interface VoiceSelection {
  voiceMode: VoiceMode;
  voiceText: string;
  emotion: string;
  voiceAssetId?: string;
}

const VOICE_MODE_OPTS = [
  { value: 'NONE', label: 'No voice' },
  { value: 'AI', label: 'AI voice' },
  { value: 'UPLOAD', label: 'Saved voice' },
  { value: 'CLONE', label: 'Cloned voice' },
];

interface SavedVoice {
  id: string;
  name: string;
}

/** Voice + emotion + saved/cloned voice selection for a tab. */
export function VoicePanel({
  value,
  onChange,
}: {
  value: VoiceSelection;
  onChange: (v: VoiceSelection) => void;
}) {
  const [voices, setVoices] = useState<SavedVoice[]>([]);
  const needsSaved = value.voiceMode === 'UPLOAD' || value.voiceMode === 'CLONE';

  useEffect(() => {
    if (!needsSaved) return;
    voiceApi
      .listSaved()
      .then((r) => setVoices((r.data as { data?: SavedVoice[] }).data ?? []))
      .catch((e) => toast.error(getApiError(e)));
  }, [needsSaved]);

  const set = (patch: Partial<VoiceSelection>) => onChange({ ...value, ...patch });

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
              placeholder="What should the character say…"
              className="w-full resize-none rounded-xl border border-white/10 bg-surface-700/50 px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:border-brand-500/40 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
          </div>

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
                onChange={(e) => set({ voiceAssetId: e.target.value || undefined })}
                className="w-full rounded-xl border border-white/10 bg-surface-700/50 px-4 py-2.5 text-sm text-white focus:border-brand-500/40 focus:outline-none"
              >
                <option value="">Select a saved voice…</option>
                {voices.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
              {voices.length === 0 && (
                <p className="mt-1 text-xs text-gray-500">
                  No saved voices yet — clone one in the Voice library.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
