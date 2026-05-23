'use client';

import { useState, useEffect, useRef } from 'react';
import { Wand2, Upload, X, Zap, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { cartoonApi, getApiError } from '@/lib/api';
import toast from 'react-hot-toast';

type CartoonType = 'ANIMATED_AD' | 'HUMAN_CARTOON' | 'CUSTOM';

interface CartoonTemplate { id: string; name: string }

interface CartoonFormProps {
  userCredits: number;
  templates: CartoonTemplate[];
  onJobCreated: (job: unknown) => void;
}

const TYPE_OPTIONS = [
  { value: 'ANIMATED_AD' as CartoonType,   label: '📺 Animated Ad',    desc: 'Create animated advertisements', baseCredits: 25 },
  { value: 'HUMAN_CARTOON' as CartoonType, label: '🧑 Human Cartoon',  desc: 'Convert a photo to cartoon style', baseCredits: 15 },
  { value: 'CUSTOM' as CartoonType,        label: '🎨 Custom',          desc: 'Prompt-based cartoon creation', baseCredits: 20 },
];

const STYLE_OPTIONS = ['cartoon', 'anime', 'pixel art', 'watercolor', 'comic book', '3D rendered', 'sketch'];
const ASPECT_OPTIONS = ['16:9', '9:16', '1:1', '4:3'];

export function CartoonForm({ userCredits, templates, onJobCreated }: CartoonFormProps) {
  const [type, setType] = useState<CartoonType>('CUSTOM');
  const [prompt, setPrompt] = useState('');
  const [stylePrompt, setStylePrompt] = useState('cartoon');
  const [durationSecs, setDurationSecs] = useState(5);
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [inputFile, setInputFile] = useState<{ file: File; url: string; uploadedUrl: string } | null>(null);
  const [uploadingInput, setUploadingInput] = useState(false);
  const [estimatedCredits, setEstimatedCredits] = useState(20);
  const [loadingEstimate, setLoadingEstimate] = useState(false);
  const [generating, setGenerating] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(async () => {
      setLoadingEstimate(true);
      try {
        const res = await cartoonApi.estimate(type, type === 'ANIMATED_AD' ? durationSecs : undefined);
        setEstimatedCredits((res.data as { data: { credits: number } }).data.credits);
      } catch { /* ignore */ }
      finally { setLoadingEstimate(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [type, durationSecs]);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const previewUrl = URL.createObjectURL(file);
    setUploadingInput(true);
    try {
      const res = await cartoonApi.uploadAsset(file);
      const { url } = (res.data as { data: { url: string } }).data;
      setInputFile({ file, url: previewUrl, uploadedUrl: url });
    } catch (err) { toast.error(getApiError(err)); }
    finally { setUploadingInput(false); if (fileRef.current) fileRef.current.value = ''; }
  }

  async function handleGenerate() {
    if (!prompt.trim() && type !== 'HUMAN_CARTOON') { toast.error('Prompt is required'); return; }
    if (type === 'HUMAN_CARTOON' && !inputFile) { toast.error('Upload a photo for human cartoon'); return; }
    if (userCredits < estimatedCredits) { toast.error('Insufficient credits'); return; }

    setGenerating(true);
    try {
      const res = await cartoonApi.generate({
        type,
        prompt: prompt.trim() || undefined,
        stylePrompt,
        inputImageUrl: inputFile?.uploadedUrl,
        templateId: selectedTemplate || undefined,
        durationSecs: type === 'ANIMATED_AD' ? durationSecs : undefined,
        aspectRatio,
        animationStyle: stylePrompt,
      });
      onJobCreated((res.data as { data: unknown }).data);
      toast.success('Cartoon generation started!');
      setPrompt('');
      setInputFile(null);
    } catch (err) { toast.error(getApiError(err)); }
    finally { setGenerating(false); }
  }

  const insufficient = userCredits < estimatedCredits;

  return (
    <div className="glass rounded-2xl border border-white/5 p-6 space-y-5">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Generate Cartoon</h2>

      {/* Type selector */}
      <div className="grid grid-cols-3 gap-2">
        {TYPE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setType(opt.value)}
            className={`flex flex-col gap-1 rounded-xl border p-3 text-left transition-all ${
              type === opt.value
                ? 'border-brand-500/50 bg-brand-500/10'
                : 'border-white/10 hover:border-white/20'
            }`}
          >
            <span className="text-sm font-medium text-white">{opt.label}</span>
            <span className="text-[10px] text-gray-500">{opt.desc}</span>
          </button>
        ))}
      </div>

      {/* Human cartoon: photo upload */}
      {type === 'HUMAN_CARTOON' && (
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">
            Upload Photo <span className="text-red-400">*</span>
          </label>
          {inputFile ? (
            <div className="flex items-center gap-3 rounded-xl border border-brand-500/20 bg-brand-500/5 px-4 py-3">
              <img src={inputFile.url} alt="Input" className="h-12 w-12 rounded-xl object-cover" />
              <p className="flex-1 truncate text-sm text-gray-300">{inputFile.file.name}</p>
              <button onClick={() => setInputFile(null)} className="text-gray-500 hover:text-red-400 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploadingInput}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 py-6 text-sm text-gray-500 hover:border-brand-500/40 hover:text-brand-400 transition-all"
            >
              {uploadingInput ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand-400 border-t-transparent" /> : <Upload className="h-4 w-4" />}
              {uploadingInput ? 'Uploading…' : 'Upload a face photo'}
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFileSelect} />
        </div>
      )}

      {/* Prompt */}
      {type !== 'HUMAN_CARTOON' && (
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">
            Prompt <span className="text-red-400">*</span>
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={
              type === 'ANIMATED_AD'
                ? 'A product ad showing a fizzy drink with bubbles and energetic motion…'
                : 'A cartoon character exploring a magical forest…'
            }
            rows={3}
            className="w-full resize-none rounded-xl border border-white/10 bg-surface-700/50 px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50"
          />
        </div>
      )}

      {/* Style + settings */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Style */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Animation Style</label>
          <div className="flex flex-wrap gap-1.5">
            {STYLE_OPTIONS.map((s) => (
              <button
                key={s}
                onClick={() => setStylePrompt(s)}
                className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-all ${
                  stylePrompt === s
                    ? 'border-brand-500/50 bg-brand-500/10 text-brand-400'
                    : 'border-white/10 text-gray-500 hover:border-white/20 hover:text-gray-300'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Aspect + duration */}
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Aspect Ratio</label>
            <div className="flex gap-2">
              {ASPECT_OPTIONS.map((ar) => (
                <button
                  key={ar}
                  onClick={() => setAspectRatio(ar)}
                  className={`flex-1 rounded-lg border py-1.5 text-xs font-medium transition-all ${
                    aspectRatio === ar
                      ? 'border-brand-500/50 bg-brand-500/10 text-brand-400'
                      : 'border-white/10 text-gray-500 hover:border-white/20'
                  }`}
                >
                  {ar}
                </button>
              ))}
            </div>
          </div>

          {type === 'ANIMATED_AD' && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Duration: <span className="text-brand-400">{durationSecs}s</span>
              </label>
              <input type="range" min={2} max={30} value={durationSecs}
                onChange={(e) => setDurationSecs(parseInt(e.target.value))}
                className="w-full accent-brand-500"
              />
            </div>
          )}
        </div>
      </div>

      {/* Template selector */}
      {templates.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">
            Use Template (optional)
          </label>
          <select
            value={selectedTemplate}
            onChange={(e) => setSelectedTemplate(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-surface-700/50 px-3 py-2 text-sm text-gray-300 focus:outline-none focus:ring-1 focus:ring-brand-500/50"
          >
            <option value="">No template</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Credit estimate */}
      <div className={`flex items-center justify-between rounded-xl border px-4 py-3 ${
        insufficient ? 'border-red-500/30 bg-red-500/5' : 'border-brand-500/20 bg-brand-500/5'
      }`}>
        <div className="flex items-center gap-2">
          {insufficient ? <AlertTriangle className="h-4 w-4 text-red-400" /> : <Zap className="h-4 w-4 text-brand-400" />}
          <span className="text-sm text-gray-300">{insufficient ? 'Insufficient credits' : 'Credits required'}</span>
        </div>
        {loadingEstimate ? (
          <div className="h-6 w-12 rounded shimmer" />
        ) : (
          <span className={`text-lg font-bold ${insufficient ? 'text-red-400' : 'text-brand-400'}`}>
            {estimatedCredits}
            <span className="ml-1 text-xs font-normal text-gray-500">/ {userCredits} avail.</span>
          </span>
        )}
      </div>

      {/* Generate button */}
      <Button variant="primary" size="lg" fullWidth loading={generating}
        disabled={insufficient || (!prompt.trim() && type !== 'HUMAN_CARTOON') || (type === 'HUMAN_CARTOON' && !inputFile)}
        onClick={handleGenerate}
        icon={<Wand2 className="h-4 w-4" />}
      >
        {generating ? 'Submitting…' : `Generate Cartoon · ${estimatedCredits} credits`}
      </Button>
    </div>
  );
}
