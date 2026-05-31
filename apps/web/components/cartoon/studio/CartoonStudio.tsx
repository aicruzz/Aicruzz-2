'use client';

import { useEffect, useMemo, useState } from 'react';
import { Wand2, Coins, Eye } from 'lucide-react';
import toast from 'react-hot-toast';
import { cartoonApi, assetsApi, getApiError } from '@/lib/api';
import { consumeBannerPrefill } from '@/lib/bannerPrefill';
import { parseDurationFromPrompt, normalizeDuration } from '@/lib/duration';
import { SuggestedSettings } from '@/components/banners/SuggestedSettings';
import {
  Tabs, Card, Button, Badge, ErrorBoundary, type TabItem,
} from '@/components/ui';
import { Reveal } from '@/components/ui/motion';
import {
  MODE_CONFIGS, estimateCredits, type CartoonMode,
} from './types';
import {
  PromptField, StyleSelector, QualitySelector, AspectSelector,
} from './StudioControls';
import { DurationSlider } from '@/components/video/studio/DurationSlider';
import { AssetSlot, type AssetValue } from './AssetSlot';
import { VoicePanel, type VoiceSelection } from './VoicePanel';
import { JobProgress } from './JobProgress';
import { HistoryPanel } from './HistoryPanel';

interface FormState {
  prompt: string;
  style: string;
  quality: string;
  aspect: string;
  duration: number;
  face: AssetValue | null;
  background: AssetValue | null;
  logo: AssetValue | null;
  characterId: string;
  templateId: string;
  voice: VoiceSelection;
}

const blankVoice: VoiceSelection = {
  voiceMode: 'NONE',
  voiceText: '',
  emotion: 'neutral',
};

function freshForm(mode: CartoonMode): FormState {
  return {
    prompt: '',
    style: MODE_CONFIGS[mode].defaultStyle,
    quality: 'STANDARD',
    aspect: '16:9',
    duration: 5,
    face: null,
    background: null,
    logo: null,
    characterId: '',
    templateId: '',
    voice: { ...blankVoice },
  };
}

export function CartoonStudio() {
  const [mode, setMode] = useState<CartoonMode>('ANIMATED_AD');
  const [form, setForm] = useState<FormState>(() => freshForm('ANIMATED_AD'));
  const [characters, setCharacters] = useState<{ id: string; name: string }[]>([]);
  const [templates, setTemplates] = useState<{ id: string; name: string }[]>([]);
  const [durationHint, setDurationHint] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [historyKey, setHistoryKey] = useState(0);

  const cfg = MODE_CONFIGS[mode];

  useEffect(() => {
    assetsApi.listCharacters()
      .then((r) => setCharacters((r.data as { data?: { id: string; name: string }[] }).data ?? []))
      .catch(() => undefined);
    cartoonApi.listTemplates()
      .then((r) => setTemplates((r.data as { data?: { id: string; name: string }[] }).data ?? []))
      .catch(() => undefined);
  }, []);

  // Deep-link support: /cartoon-studio?mode=&characterId=&templateId=
  // (used by the Library "Use" / "Studio" actions). Additive — no effect
  // when params are absent. Reads window to avoid a Suspense boundary.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const p = new URLSearchParams(window.location.search);
    const qpMode = p.get('mode') as CartoonMode | null;
    const characterId = p.get('characterId') ?? '';
    const templateId = p.get('templateId') ?? '';
    if (qpMode && MODE_CONFIGS[qpMode]) {
      setMode(qpMode);
      setForm({ ...freshForm(qpMode), characterId, templateId });
    } else if (characterId || templateId) {
      setForm((f) => ({
        ...f,
        characterId: characterId || f.characterId,
        templateId: templateId || f.templateId,
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const switchMode = (k: string) => {
    const m = k as CartoonMode;
    setMode(m);
    setForm(freshForm(m));
    setActiveJobId(null);
  };

  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  // "Use This Prompt" hand-off from the dashboard showcase. Prompt is
  // prefilled; settings are a non-destructive, opt-in suggestion only —
  // never auto-applied, never persisted, fully independent of Save Setup.
  const [suggested, setSuggested] = useState<{
    quality?: string;
    aspect?: string;
    duration?: number;
    voiceMode?: VoiceSelection['voiceMode'];
  } | null>(null);

  useEffect(() => {
    const pre = consumeBannerPrefill('CARTOON');
    if (!pre) return;
    if (pre.prompt) {
      set({ prompt: pre.prompt });
      toast.success('Prompt added from showcase');
    }
    const m = pre.metadata ?? {};
    const s: NonNullable<typeof suggested> = {};
    if (m.qualityTier && ['FAST', 'STANDARD', 'HIGH', 'ULTRA'].includes(m.qualityTier))
      s.quality = m.qualityTier;
    if (m.aspectRatio && ['16:9', '9:16', '1:1', '4:3'].includes(m.aspectRatio))
      s.aspect = m.aspectRatio;
    if (typeof m.durationSecs === 'number' && Number.isFinite(m.durationSecs))
      s.duration = Math.min(10, Math.max(5, Math.round(m.durationSecs)));
    if (m.voiceMode && ['NONE', 'UPLOAD', 'CLONE', 'AI'].includes(m.voiceMode))
      s.voiceMode = m.voiceMode as VoiceSelection['voiceMode'];
    if (Object.keys(s).length > 0) setSuggested(s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // User-initiated only — applies the suggested settings on explicit click.
  function applySuggested() {
    if (!suggested) return;
    setForm((f) => ({
      ...f,
      ...(suggested.quality && { quality: suggested.quality }),
      ...(suggested.aspect && { aspect: suggested.aspect }),
      ...(typeof suggested.duration === 'number' && {
        duration: suggested.duration,
      }),
      ...(suggested.voiceMode && {
        voice: { ...f.voice, voiceMode: suggested.voiceMode },
      }),
    }));
    setSuggested(null);
    toast.success('Settings applied');
  }

  // Auto-detect duration from the prompt and populate the duration field.
  useEffect(() => {
    if (!cfg.fields.duration) return;
    const t = setTimeout(() => {
      const raw = parseDurationFromPrompt(form.prompt);
      if (raw === null) return;
      const { value, clamped } = normalizeDuration(raw, 5, 10);
      set({ duration: value });
      setDurationHint(clamped ? 'Duration adjusted to supported maximum (10 seconds).' : null);
    }, 400);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.prompt, cfg.fields.duration]);

  const credits = useMemo(
    () => estimateCredits(mode, form.duration),
    [mode, form.duration],
  );

  const validationError = useMemo(() => {
    if (cfg.fields.promptRequired && !form.prompt.trim()) return 'A prompt is required';
    if (cfg.fields.faceRequired && !form.face && !form.characterId)
      return 'An image (or saved character) is required';
    if (form.voice.voiceMode !== 'NONE' && !form.voice.voiceText.trim())
      return 'Narration text is required for the selected voice';
    if (
      (form.voice.voiceMode === 'UPLOAD' || form.voice.voiceMode === 'CLONE') &&
      !form.voice.voiceAssetId
    )
      return 'Select a saved voice';
    return null;
  }, [cfg, form]);

  async function generate() {
    if (validationError) {
      toast.error(validationError);
      return;
    }
    setSubmitting(true);
    setActiveJobId(null);
    try {
      const payload: Record<string, unknown> = {
        mode,
        prompt: form.prompt.trim() || undefined,
        stylePrompt: form.style,
        animationStyle: form.style,
        aspectRatio: form.aspect,
        qualityMode: form.quality,
        durationSecs: cfg.fields.duration ? form.duration : undefined,
        templateId: form.templateId || undefined,
        characterId: form.characterId || undefined,
        inputImageUrl: form.face?.url,
        characterImageUrl: form.face?.url,
        faceAssetId: form.face?.assetId,
        backgroundImageUrl: form.background?.url,
        backgroundAssetId: form.background?.assetId,
        logoImageUrl: form.logo?.url,
        logoAssetId: form.logo?.assetId,
        voiceMode: form.voice.voiceMode,
        voiceText:
          form.voice.voiceMode !== 'NONE' ? form.voice.voiceText.trim() : undefined,
        voiceAssetId: form.voice.voiceAssetId,
      };
      const r = await cartoonApi.generate(payload);
      const job = (r.data as { data: { id: string } }).data;
      setActiveJobId(job.id);
      setHistoryKey((k) => k + 1);
      toast.success('Generation started');
    } catch (e) {
      toast.error(getApiError(e));
    } finally {
      setSubmitting(false);
    }
  }

  const tabs: TabItem[] = Object.values(MODE_CONFIGS).map((c) => ({
    key: c.key,
    label: c.label,
    icon: <c.icon className="h-4 w-4" />,
  }));

  return (
    <div className="space-y-6">
      <Tabs items={tabs} value={mode} onChange={switchMode} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* ── Form ─────────────────────────────────────────── */}
        <Reveal className="lg:col-span-3">
          <Card className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-white">{cfg.label}</h2>
              <p className="text-sm text-gray-400">{cfg.blurb}</p>
            </div>

            {cfg.fields.prompt && (
              <PromptField
                value={form.prompt}
                onChange={(v) => set({ prompt: v })}
                required={cfg.fields.promptRequired}
              />
            )}

            {suggested && (
              <SuggestedSettings
                items={[
                  ...(suggested.quality ? [{ label: suggested.quality }] : []),
                  ...(suggested.aspect ? [{ label: suggested.aspect }] : []),
                  ...(suggested.duration
                    ? [{ label: `${suggested.duration}s` }]
                    : []),
                  ...(suggested.voiceMode
                    ? [{ label: `Voice: ${suggested.voiceMode}` }]
                    : []),
                ]}
                onApply={applySuggested}
                onDismiss={() => setSuggested(null)}
              />
            )}

            {cfg.fields.face && (
              <AssetSlot
                label={mode === 'HUMAN_CARTOON' ? 'Face / subject image' : 'Reference image'}
                assetType="FACE"
                required={cfg.fields.faceRequired}
                value={form.face}
                onChange={(v) => set({ face: v })}
              />
            )}
            {cfg.fields.background && (
              <AssetSlot
                label="Background"
                assetType="BACKGROUND"
                value={form.background}
                onChange={(v) => set({ background: v })}
              />
            )}
            {cfg.fields.logo && (
              <AssetSlot
                label="Logo / product"
                assetType="LOGO"
                value={form.logo}
                onChange={(v) => set({ logo: v })}
              />
            )}

            {cfg.fields.character && characters.length > 0 && (
              <div>
                <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-gray-500">
                  Saved character
                </label>
                <select
                  value={form.characterId}
                  onChange={(e) => set({ characterId: e.target.value })}
                  className="w-full rounded-xl border border-white/10 bg-surface-700/50 px-4 py-2.5 text-sm text-white focus:border-brand-500/40 focus:outline-none"
                >
                  <option value="">None</option>
                  {characters.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}

            <StyleSelector
              styles={cfg.styles}
              value={form.style}
              onChange={(v) => set({ style: v })}
            />

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <QualitySelector value={form.quality} onChange={(v) => set({ quality: v })} />
              <AspectSelector value={form.aspect} onChange={(v) => set({ aspect: v })} />
            </div>

            {cfg.fields.duration && (
              <>
                <DurationSlider
                  value={form.duration}
                  max={10}
                  onChange={(v) => { set({ duration: v }); setDurationHint(null); }}
                />
                {durationHint && (
                  <p className="mt-1 text-[11px] text-yellow-400">{durationHint}</p>
                )}
              </>
            )}

            {cfg.fields.template && templates.length > 0 && (
              <div>
                <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-gray-500">
                  Template
                </label>
                <select
                  value={form.templateId}
                  onChange={(e) => set({ templateId: e.target.value })}
                  className="w-full rounded-xl border border-white/10 bg-surface-700/50 px-4 py-2.5 text-sm text-white focus:border-brand-500/40 focus:outline-none"
                >
                  <option value="">No template</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
            )}

            <VoicePanel value={form.voice} onChange={(v) => set({ voice: v })} />
          </Card>
        </Reveal>

        {/* ── Preview / generate / history ─────────────────── */}
        <div className="space-y-6 lg:col-span-2">
          <Card className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-200">
              <Eye className="h-4 w-4 text-brand-400" /> Preview &amp; generate
            </div>
            <ul className="space-y-1.5 text-xs text-gray-400">
              <li>Mode: <span className="text-gray-200">{cfg.label}</span></li>
              <li>Style: <span className="text-gray-200">{form.style}</span></li>
              <li>Quality: <span className="text-gray-200">{form.quality}</span></li>
              <li>
                Assets:{' '}
                <span className="text-gray-200">
                  {[form.face && 'image', form.background && 'bg', form.logo && 'logo']
                    .filter(Boolean)
                    .join(', ') || 'none'}
                </span>
              </li>
              <li>
                Voice:{' '}
                <span className="text-gray-200">
                  {form.voice.voiceMode === 'NONE'
                    ? 'none'
                    : `${form.voice.voiceMode} · ${form.voice.emotion}`}
                </span>
              </li>
            </ul>

            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-surface-800/50 px-4 py-3">
              <span className="flex items-center gap-2 text-sm text-gray-300">
                <Coins className="h-4 w-4 text-brand-400" /> Estimated cost
              </span>
              <Badge tone="brand">{credits} credits</Badge>
            </div>

            {validationError && (
              <p className="text-xs text-yellow-400">{validationError}</p>
            )}

            <Button
              fullWidth
              size="lg"
              loading={submitting}
              disabled={submitting || !!validationError}
              icon={<Wand2 className="h-4 w-4" />}
              onClick={generate}
            >
              {submitting ? 'Submitting…' : `Generate · ${credits} credits`}
            </Button>
          </Card>

          {activeJobId && (
            <ErrorBoundary>
              <JobProgress
                jobId={activeJobId}
                onRetry={generate}
              />
            </ErrorBoundary>
          )}
        </div>
      </div>

      <ErrorBoundary>
        <HistoryPanel refreshKey={historyKey} />
      </ErrorBoundary>
    </div>
  );
}
