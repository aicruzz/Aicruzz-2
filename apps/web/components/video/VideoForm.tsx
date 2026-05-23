'use client';

import { useState, useEffect, useRef } from 'react';
import { Upload, Mic, X, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { CreditEstimate } from './CreditEstimate';
import { videoApi, getApiError } from '@/lib/api';
import toast from 'react-hot-toast';

type Resolution = 'SD_480P' | 'HD_720P' | 'FHD_1080P';
type QualityMode = 'STANDARD' | 'HIGH' | 'ULTRA';

interface VideoFormProps {
  userCredits: number;
  onJobCreated: (job: unknown) => void;
}

const RESOLUTION_OPTIONS: { value: Resolution; label: string; hint: string }[] = [
  { value: 'SD_480P',    label: '480p SD',  hint: 'Fastest, cheapest' },
  { value: 'HD_720P',    label: '720p HD',  hint: 'Balanced' },
  { value: 'FHD_1080P',  label: '1080p FHD', hint: 'Best quality' },
];

const QUALITY_OPTIONS: { value: QualityMode; label: string; hint: string }[] = [
  { value: 'STANDARD', label: 'Standard', hint: 'Runway / Pika first' },
  { value: 'HIGH',     label: 'High',     hint: 'Best cloud routing (1.3× credits)' },
  { value: 'ULTRA',    label: 'Ultra',    hint: 'Max cloud quality (2× credits)' },
];

export function VideoForm({ userCredits, onJobCreated }: VideoFormProps) {
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [duration, setDuration] = useState(5);
  const [resolution, setResolution] = useState<Resolution>('HD_720P');
  const [qualityMode, setQualityMode] = useState<QualityMode>('STANDARD');
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [voiceText, setVoiceText] = useState('');
  const [voiceGender, setVoiceGender] = useState<'MALE' | 'FEMALE'>('FEMALE');
  const [inputFile, setInputFile] = useState<{ file: File; url: string; uploadedUrl: string } | null>(null);
  const [uploadingInput, setUploadingInput] = useState(false);
  const [estimatedCredits, setEstimatedCredits] = useState(60);
  const [loadingEstimate, setLoadingEstimate] = useState(false);
  const [generating, setGenerating] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Live credit estimate
  useEffect(() => {
    const timer = setTimeout(async () => {
      setLoadingEstimate(true);
      try {
        const res = await videoApi.estimate(duration, resolution, qualityMode);
        const { credits } = (res.data as { data: { credits: number } }).data;
        setEstimatedCredits(credits);
      } catch { /* ignore */ }
      finally { setLoadingEstimate(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [duration, resolution, qualityMode]);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const previewUrl = URL.createObjectURL(file);
    setUploadingInput(true);
    try {
      const res = await videoApi.uploadInput(file);
      const { url } = (res.data as { data: { url: string } }).data;
      setInputFile({ file, url: previewUrl, uploadedUrl: url });
    } catch (err) {
      toast.error(getApiError(err));
    } finally {
      setUploadingInput(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleGenerate() {
    if (!prompt.trim()) { toast.error('Prompt is required'); return; }
    if (userCredits < estimatedCredits) { toast.error('Insufficient credits'); return; }

    setGenerating(true);
    try {
      const res = await videoApi.generate({
        prompt: prompt.trim(),
        negativePrompt: negativePrompt.trim() || undefined,
        inputImageUrl: inputFile?.file.type.startsWith('image/') ? inputFile.uploadedUrl : undefined,
        inputVideoUrl: inputFile?.file.type.startsWith('video/') ? inputFile.uploadedUrl : undefined,
        durationSeconds: duration,
        resolution,
        qualityMode,
        voiceEnabled,
        voiceText: voiceEnabled ? voiceText.trim() : undefined,
        voiceGender: voiceEnabled ? voiceGender : undefined,
        fps: 24,
      });

      const job = (res.data as { data: unknown }).data;
      onJobCreated(job);
      toast.success('Video generation started!');

      // Reset form
      setPrompt('');
      setNegativePrompt('');
      setVoiceText('');
      setInputFile(null);
    } catch (err) {
      toast.error(getApiError(err));
    } finally {
      setGenerating(false);
    }
  }

  const insufficient = userCredits < estimatedCredits;

  return (
    <div className="glass rounded-2xl border border-white/5 p-6 space-y-5">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
        Generate Video
      </h2>

      {/* Prompt */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1.5">
          Prompt <span className="text-red-400">*</span>
        </label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="A cinematic drone shot flying over a futuristic city at night, neon lights reflecting on wet streets…"
          rows={3}
          className="w-full resize-none rounded-xl border border-white/10 bg-surface-700/50 px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500/30 transition-all"
        />
      </div>

      {/* Negative prompt */}
      <Input
        label="Negative Prompt (optional)"
        type="text"
        placeholder="blur, low quality, distortion, watermark"
        value={negativePrompt}
        onChange={(e) => setNegativePrompt(e.target.value)}
        hint="Describe what you don't want in the video"
      />

      {/* Input image/video */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1.5">
          Input Image / Video Template (optional)
        </label>
        {inputFile ? (
          <div className="flex items-center gap-3 rounded-xl border border-brand-500/20 bg-brand-500/5 px-4 py-3">
            {inputFile.file.type.startsWith('image/') ? (
              <img src={inputFile.url} alt="Input" className="h-12 w-16 rounded-lg object-cover flex-shrink-0" />
            ) : (
              <video src={inputFile.url} className="h-12 w-16 rounded-lg object-cover flex-shrink-0" />
            )}
            <p className="flex-1 truncate text-sm text-gray-300">{inputFile.file.name}</p>
            <button onClick={() => setInputFile(null)} className="text-gray-500 hover:text-red-400 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingInput}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 py-5 text-sm text-gray-500 hover:border-brand-500/40 hover:text-brand-400 transition-all"
          >
            {uploadingInput ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand-400 border-t-transparent" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {uploadingInput ? 'Uploading…' : 'Upload image or video template'}
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
          className="hidden"
          onChange={handleFileSelect}
        />
      </div>

      {/* Settings grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Duration */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Duration: <span className="text-brand-400">{duration}s</span>
          </label>
          <input
            type="range"
            min={2}
            max={30}
            value={duration}
            onChange={(e) => setDuration(parseInt(e.target.value))}
            className="w-full accent-brand-500"
          />
          <div className="flex justify-between text-xs text-gray-600 mt-1">
            <span>2s</span>
            <span>30s</span>
          </div>
        </div>

        {/* Resolution */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Resolution</label>
          <div className="space-y-1.5">
            {RESOLUTION_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setResolution(opt.value)}
                className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm transition-all ${
                  resolution === opt.value
                    ? 'border-brand-500/50 bg-brand-500/10 text-brand-400'
                    : 'border-white/10 text-gray-400 hover:border-white/20'
                }`}
              >
                <span className="font-medium">{opt.label}</span>
                <span className="text-xs opacity-60">{opt.hint}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Quality */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Quality</label>
          <div className="space-y-1.5">
            {QUALITY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setQualityMode(opt.value)}
                className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm transition-all ${
                  qualityMode === opt.value
                    ? 'border-brand-500/50 bg-brand-500/10 text-brand-400'
                    : 'border-white/10 text-gray-400 hover:border-white/20'
                }`}
              >
                <span className="font-medium">{opt.label}</span>
                <span className="text-xs opacity-60">{opt.hint}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Voice + lip sync */}
      <div className="rounded-xl border border-white/5 bg-surface-700/30 p-4 space-y-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setVoiceEnabled((v) => !v)}
            className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
              voiceEnabled ? 'bg-brand-500' : 'bg-surface-600'
            }`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${
              voiceEnabled ? 'translate-x-4' : 'translate-x-0'
            }`} />
          </button>
          <div className="flex items-center gap-2">
            <Mic className="h-4 w-4 text-gray-400" />
            <span className="text-sm font-medium text-gray-300">Voice + Lip Sync</span>
          </div>
        </div>

        {voiceEnabled && (
          <div className="space-y-3">
            <textarea
              value={voiceText}
              onChange={(e) => setVoiceText(e.target.value)}
              placeholder="Enter the text to be spoken in the video…"
              rows={2}
              className="w-full resize-none rounded-xl border border-white/10 bg-surface-700/50 px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-brand-500/50"
            />
            <div className="flex gap-2">
              {(['FEMALE', 'MALE'] as const).map((g) => (
                <button
                  key={g}
                  onClick={() => setVoiceGender(g)}
                  className={`flex-1 rounded-lg border py-1.5 text-xs font-medium transition-all ${
                    voiceGender === g
                      ? 'border-brand-500/50 bg-brand-500/10 text-brand-400'
                      : 'border-white/10 text-gray-500 hover:border-white/20'
                  }`}
                >
                  {g === 'FEMALE' ? '👩 Female' : '👨 Male'}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Credit estimate */}
      <CreditEstimate
        credits={estimatedCredits}
        userCredits={userCredits}
        loading={loadingEstimate}
      />

      {/* Generate button */}
      <Button
        variant="primary"
        size="lg"
        fullWidth
        loading={generating}
        disabled={insufficient || !prompt.trim()}
        onClick={handleGenerate}
        icon={<Wand2 className="h-4 w-4" />}
      >
        {generating ? 'Submitting…' : `Generate Video · ${estimatedCredits} credits`}
      </Button>

      {insufficient && (
        <p className="text-center text-xs text-red-400">
          You need {estimatedCredits - userCredits} more credits.{' '}
          <a href="/wallet" className="underline hover:text-red-300">Fund wallet →</a>
        </p>
      )}
    </div>
  );
}
