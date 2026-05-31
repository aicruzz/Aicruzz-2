"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Wand2,
  Coins,
  Eye,
  Save,
  History,
  RotateCcw,
  Download,
  Share2,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Film,
  Trash2,
  ImagePlus,
  X,
} from "lucide-react";
import toast from "react-hot-toast";
import { videoApi, assetsApi, getApiError } from "@/lib/api";
import { consumeBannerPrefill } from "@/lib/bannerPrefill";
import { parseDurationFromPrompt, normalizeDuration } from "@/lib/duration";
import { SuggestedSettings } from "@/components/banners/SuggestedSettings";
import { cn } from "@/lib/cn";
import {
  Card,
  Button,
  Badge,
  SkeletonCard,
  EmptyState,
  ErrorBoundary,
} from "@/components/ui";
import { Reveal } from "@/components/ui/motion";
import {
  PromptField,
  QualitySelector,
  PillSelect,
} from "@/components/cartoon/studio/StudioControls";
import {
  AssetSlot,
  type AssetValue,
} from "@/components/cartoon/studio/AssetSlot";
import { useVideoEvents, type VideoEvent } from "@/hooks/useVideoEvents";
import { ProviderIndicator } from "./ProviderIndicator";
import { DurationSlider } from "./DurationSlider";
import {
  VoiceNarrationPanel,
  type VideoVoiceSelection,
} from "./VoiceNarrationPanel";

// ---------------------------------------------------------------------------
// Cloudinary upload helper
// POST /api/video/upload-input — accepts image/jpeg, image/png, image/webp,
// video/mp4, video/webm. Returns { success: true, data: { url } } where url
// is a permanent res.cloudinary.com https:// URL safe for Runway / Pika.
// ---------------------------------------------------------------------------
async function uploadToCloudinary(file: File): Promise<string> {
  const r = await videoApi.uploadInput(file);
  const url =
    (r.data as { data?: { url?: string } })?.data?.url ??
    (r.data as { url?: string })?.url;
  if (!url) throw new Error("Cloudinary returned no URL");
  return url;
}

// ---------------------------------------------------------------------------
// Constants / types
// ---------------------------------------------------------------------------

const RESOLUTIONS = [
  { value: "SD_480P", label: "480p", hint: "fastest" },
  { value: "HD_720P", label: "720p", hint: "balanced" },
  { value: "FHD_1080P", label: "1080p", hint: "sharp" },
];

const toBackendQuality = (q: string) => (q === "FAST" ? "STANDARD" : q);

const SETUPS_KEY = "aicruzz_video_setups";

interface Setup {
  name: string;
  prompt: string;
  negativePrompt: string;
  quality: string;
  resolution: string;
  duration: number;
}

interface VideoJob {
  id: string;
  status: "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELLED";
  prompt: string | null;
  durationSeconds: number;
  resolution: string;
  qualityMode: string;
  provider: string | null;
  outputUrl: string | null;
  thumbnailUrl: string | null;
  errorMessage: string | null;
  createdAt: string;
}

const STEPS = ["Queued", "Processing", "Rendering", "Completed"];

function stageIndex(e?: VideoEvent | null): number {
  if (!e) return 0;
  if (e.status === "COMPLETED") return 3;
  if (e.stage === "encoding") return 2;
  if (
    e.stage === "generating" ||
    e.stage === "post-processing" ||
    e.status === "PROCESSING"
  )
    return 1;
  return 0;
}

// ---------------------------------------------------------------------------
// Inline image upload slot (replaces <AssetSlot> for the video input image)
// This gives us direct control over the Cloudinary upload flow.
// ---------------------------------------------------------------------------

interface ImageUploadSlotProps {
  value: AssetValue | null;
  onChange: (v: AssetValue | null) => void;
}

function ImageUploadSlot({ value, onChange }: ImageUploadSlotProps) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }
    setUploading(true);
    try {
      const url = await uploadToCloudinary(file);
      onChange({ url, name: file.name });
      toast.success("Image uploaded to Cloudinary");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-gray-500">
        Image (image-to-video, optional)
      </label>

      {value ? (
        <div className="relative overflow-hidden rounded-xl border border-white/10 bg-surface-800/50">
          {/* Preview */}
          <img
            src={value.url}
            alt={value.name ?? "Input image"}
            className="aspect-video w-full object-cover"
          />
          {/* Remove button */}
          <button
            onClick={() => onChange(null)}
            className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white hover:bg-red-500/80 transition-colors"
            aria-label="Remove image"
          >
            <X className="h-4 w-4" />
          </button>
          {/* Source badge */}
          <div className="absolute bottom-2 left-2">
            <Badge tone="brand" className="text-[10px]">
              Cloudinary ✓
            </Badge>
          </div>
        </div>
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className={cn(
            "flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 bg-surface-800/30 px-4 py-6",
            "text-sm text-gray-500 transition-colors hover:border-brand-500/50 hover:bg-brand-500/5 hover:text-gray-300",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          {uploading ? (
            <>
              <Loader2 className="h-6 w-6 animate-spin text-brand-400" />
              <span>Uploading to Cloudinary…</span>
            </>
          ) : (
            <>
              <ImagePlus className="h-6 w-6 text-gray-600" />
              <span>Click to upload reference image</span>
              <span className="text-xs text-gray-600">
                PNG, JPG, WEBP · uploaded to Cloudinary
              </span>
            </>
          )}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          // Reset so the same file can be re-selected
          e.target.value = "";
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// VideoStudio
// ---------------------------------------------------------------------------

export function VideoStudio() {
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [quality, setQuality] = useState("STANDARD");
  const [resolution, setResolution] = useState("HD_720P");
  const [duration, setDuration] = useState(5);
  const [durationHint, setDurationHint] = useState<string | null>(null);
  const [image, setImage] = useState<AssetValue | null>(null);
  const [voice, setVoice] = useState<VideoVoiceSelection>({
    voiceMode: "NONE",
    voiceText: "",
    emotion: "neutral",
    voiceGender: "FEMALE",
  });

  const [credits, setCredits] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [live, setLive] = useState<VideoEvent | null>(null);

  const [setups, setSetups] = useState<Setup[]>([]);
  const [jobs, setJobs] = useState<VideoJob[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);

  // "Use This Prompt" hand-off from the dashboard showcase. Prompt is
  // prefilled; settings are a non-destructive, opt-in suggestion only —
  // never auto-applied, never persisted, fully independent of Save Setup.
  const [suggested, setSuggested] = useState<{
    quality?: string;
    resolution?: string;
    duration?: number;
    voiceMode?: VideoVoiceSelection["voiceMode"];
  } | null>(null);

  useEffect(() => {
    const pre = consumeBannerPrefill("VIDEO");
    if (!pre) return;
    if (pre.prompt) {
      setPrompt(pre.prompt);
      toast.success("Prompt added from showcase");
    }
    const m = pre.metadata ?? {};
    const s: NonNullable<typeof suggested> = {};
    if (m.qualityTier && ["FAST", "STANDARD", "HIGH", "ULTRA"].includes(m.qualityTier))
      s.quality = m.qualityTier;
    if (m.resolution && ["SD_480P", "HD_720P", "FHD_1080P"].includes(m.resolution))
      s.resolution = m.resolution;
    if (typeof m.durationSecs === "number" && Number.isFinite(m.durationSecs))
      s.duration = Math.min(10, Math.max(5, Math.round(m.durationSecs)));
    if (m.voiceMode && ["NONE", "AI", "UPLOAD", "CLONE"].includes(m.voiceMode))
      s.voiceMode = m.voiceMode as VideoVoiceSelection["voiceMode"];
    if (Object.keys(s).length > 0) setSuggested(s);
  }, []);

  // User-initiated only — applies the suggested settings on explicit click.
  function applySuggested() {
    if (!suggested) return;
    if (suggested.quality) setQuality(suggested.quality);
    if (suggested.resolution) setResolution(suggested.resolution);
    if (typeof suggested.duration === "number") setDuration(suggested.duration);
    if (suggested.voiceMode) {
      const vm = suggested.voiceMode;
      setVoice((v) => ({ ...v, voiceMode: vm }));
    }
    setSuggested(null);
    toast.success("Settings applied");
  }

  const loadJobs = useCallback(async () => {
    try {
      const r = await videoApi.listJobs(1, 12);
      setJobs((r.data as { data: VideoJob[] }).data ?? []);
    } finally {
      setLoadingJobs(false);
    }
  }, []);

  const onEvent = useCallback(
    (e: VideoEvent) => {
      if (e.jobId === activeJobId) setLive(e);
      if (["COMPLETED", "FAILED", "CANCELLED"].includes(e.status)) loadJobs();
    },
    [activeJobId, loadJobs],
  );
  const { state: sse } = useVideoEvents({ onEvent });

  useEffect(() => {
    loadJobs();
    try {
      setSetups(JSON.parse(localStorage.getItem(SETUPS_KEY) ?? "[]"));
    } catch {
      /* ignore */
    }
  }, [loadJobs]);

  // Debounced credit estimate
  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const r = await videoApi.estimate(
          duration,
          resolution,
          toBackendQuality(quality),
        );
        setCredits((r.data as { data: { credits: number } }).data.credits);
      } catch {
        setCredits(null);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [duration, resolution, quality]);

  // Auto-detect duration from the prompt and populate the duration field.
  useEffect(() => {
    const t = setTimeout(() => {
      const raw = parseDurationFromPrompt(prompt);
      if (raw === null) return;
      const { value, clamped } = normalizeDuration(raw, 5, 10);
      setDuration(value);
      setDurationHint(clamped ? 'Duration adjusted to supported maximum (10 seconds).' : null);
    }, 400);
    return () => clearTimeout(t);
  }, [prompt]);

  function persistSetups(next: Setup[]) {
    setSetups(next);
    localStorage.setItem(SETUPS_KEY, JSON.stringify(next));
  }

  async function generate() {
    if (!prompt.trim()) {
      toast.error("A prompt is required");
      return;
    }
    setSubmitting(true);
    setLive(null);
    try {
      const r = await videoApi.generate({
        prompt: prompt.trim(),
        negativePrompt: negativePrompt.trim() || undefined,
        // image.url is always a Cloudinary https:// URL — safe for Runway/Pika
        inputImageUrl: image?.url,
        durationSeconds: duration,
        resolution,
        qualityMode: toBackendQuality(quality),
        voiceEnabled: voice.voiceMode !== "NONE",
        voiceText:
          voice.voiceMode !== "NONE"
            ? voice.voiceText.trim() || undefined
            : undefined,
        voiceGender: voice.voiceMode === "AI" ? voice.voiceGender : undefined,
        // Payload-only extensions — backend may ignore until it honors them.
        voiceAssetId:
          voice.voiceMode === "UPLOAD" || voice.voiceMode === "CLONE"
            ? voice.voiceAssetId
            : undefined,
        voiceStyle: voice.voiceMode !== "NONE" ? voice.emotion : undefined,
        fps: 24,
      });
      const job = (r.data as { data: { id: string } }).data;
      setActiveJobId(job.id);
      toast.success("Video generation started");
      loadJobs();
    } catch (e) {
      toast.error(getApiError(e));
    } finally {
      setSubmitting(false);
    }
  }

  function reuse(j: VideoJob) {
    setPrompt(j.prompt ?? "");
    setResolution(j.resolution);
    setQuality(j.qualityMode);
    setDuration(j.durationSeconds);
    toast.success("Settings loaded");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function share(url: string) {
    try {
      if (navigator.share)
        await navigator.share({ url, title: "AiCruzz video" });
      else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied");
      }
    } catch {
      /* user cancelled */
    }
  }

  const activeStep = stageIndex(live);
  const failed = live?.status === "FAILED" || live?.status === "CANCELLED";
  const done = live?.status === "COMPLETED";

  const connBadge = useMemo(() => {
    if (sse === "open") return <Badge tone="green">Live</Badge>;
    if (sse === "connecting") return <Badge tone="yellow">Connecting…</Badge>;
    return <Badge tone="gray">Offline</Badge>;
  }, [sse]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* ── Form ─────────────────────────────────────────── */}
        <Reveal className="lg:col-span-3">
          <Card className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">
                  Generate video
                </h2>
                <p className="text-sm text-gray-400">
                  Text-to-video or image-to-video, Runway / Pika auto-routed.
                </p>
              </div>
              {connBadge}
            </div>

            <PromptField value={prompt} onChange={setPrompt} required />

            {suggested && (
              <SuggestedSettings
                items={[
                  ...(suggested.quality ? [{ label: suggested.quality }] : []),
                  ...(suggested.resolution
                    ? [{ label: suggested.resolution.replace(/_/g, " ") }]
                    : []),
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

            <div>
              <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-gray-500">
                Negative prompt (optional)
              </label>
              <input
                value={negativePrompt}
                onChange={(e) => setNegativePrompt(e.target.value)}
                placeholder="blurry, distorted, low quality…"
                className="w-full rounded-xl border border-white/10 bg-surface-700/50 px-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none"
              />
            </div>

            {/*
              ImageUploadSlot replaces <AssetSlot>.
              Files are uploaded to Cloudinary via POST /api/chat/upload.
              image.url is always a res.cloudinary.com https:// URL before
              it reaches videoApi.generate — Runway / Pika won't reject it.
            */}
            <ImageUploadSlot value={image} onChange={setImage} />

            <QualitySelector value={quality} onChange={setQuality} />
            <PillSelect
              label="Resolution"
              value={resolution}
              onChange={setResolution}
              options={RESOLUTIONS}
            />
            <DurationSlider
              value={duration}
              max={10}
              onChange={(v) => { setDuration(v); setDurationHint(null); }}
            />
            {durationHint && (
              <p className="mt-1 text-[11px] text-yellow-400">{durationHint}</p>
            )}
            <VoiceNarrationPanel value={voice} onChange={setVoice} />
          </Card>
        </Reveal>

        {/* ── Preview / generate / setups ──────────────────── */}
        <div className="space-y-6 lg:col-span-2">
          <Card className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-200">
              <Eye className="h-4 w-4 text-brand-400" /> Preview &amp; generate
            </div>

            <ProviderIndicator
              quality={quality}
              actualProvider={live?.provider}
            />

            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-surface-800/50 px-4 py-3">
              <span className="flex items-center gap-2 text-sm text-gray-300">
                <Coins className="h-4 w-4 text-brand-400" /> Estimated cost
              </span>
              <Badge tone="brand">{credits ?? "—"} credits</Badge>
            </div>

            <Button
              fullWidth
              size="lg"
              loading={submitting}
              disabled={submitting || !prompt.trim()}
              icon={<Wand2 className="h-4 w-4" />}
              onClick={generate}
            >
              {submitting
                ? "Submitting…"
                : `Generate · ${credits ?? "—"} credits`}
            </Button>

            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                icon={<Save className="h-3.5 w-3.5" />}
                onClick={() => {
                  const name = prompt.trim().slice(0, 40) || "Untitled setup";
                  persistSetups(
                    [
                      {
                        name,
                        prompt,
                        negativePrompt,
                        quality,
                        resolution,
                        duration,
                      },
                      ...setups.filter((s) => s.name !== name),
                    ].slice(0, 12),
                  );
                  toast.success("Setup saved");
                }}
              >
                Save setup
              </Button>
              {image && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    try {
                      await assetsApi.create({
                        type: "SCENE",
                        name: `Video input ${new Date().toLocaleDateString()}`,
                        url: image.url,
                        thumbnailUrl: image.url,
                      });
                      toast.success("Saved to Asset Library");
                    } catch (e) {
                      toast.error(getApiError(e));
                    }
                  }}
                >
                  Save image to library
                </Button>
              )}
            </div>
          </Card>

          {/* Active job progress */}
          {activeJobId && (
            <Card className="space-y-3">
              {!failed && (
                <div className="flex items-center gap-2">
                  {STEPS.map((label, i) => {
                    const reached = i <= activeStep;
                    const current = i === activeStep && !done;
                    const Icon =
                      i === 3 ? CheckCircle2 : i === 0 ? Clock : Loader2;
                    return (
                      <div
                        key={label}
                        className="flex flex-1 items-center gap-2"
                      >
                        <div
                          className={cn(
                            "flex h-7 w-7 items-center justify-center rounded-full border",
                            reached
                              ? "border-brand-500/60 bg-brand-500/15 text-brand-300"
                              : "border-white/10 text-gray-600",
                          )}
                        >
                          <Icon
                            className={cn(
                              "h-3.5 w-3.5",
                              current && "animate-spin",
                            )}
                          />
                        </div>
                        <span
                          className={cn(
                            "text-xs",
                            reached ? "text-gray-200" : "text-gray-600",
                          )}
                        >
                          {label}
                        </span>
                        {i < STEPS.length - 1 && (
                          <div
                            className={cn(
                              "h-px flex-1",
                              i < activeStep
                                ? "bg-brand-500/40"
                                : "bg-white/10",
                            )}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {typeof live?.progress === "number" && !done && !failed && (
                <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full bg-brand-gradient transition-all"
                    style={{ width: `${Math.max(5, live!.progress!)}%` }}
                  />
                </div>
              )}
              {live?.message && !failed && (
                <p className="text-xs text-gray-500">{live.message}</p>
              )}
              {failed && (
                <div className="space-y-3">
                  <div className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/5 p-3">
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                    <p className="text-sm text-red-300">
                      {live?.error ??
                        "Generation failed. Credits were refunded."}
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<RotateCcw className="h-4 w-4" />}
                    onClick={generate}
                  >
                    Retry
                  </Button>
                </div>
              )}
              {done && live?.outputUrl && (
                <div className="space-y-3">
                  <video
                    src={live.outputUrl}
                    poster={live.thumbnailUrl ?? undefined}
                    controls
                    playsInline
                    className="aspect-video w-full rounded-xl border border-white/10 bg-black"
                  />
                  <div className="flex gap-2">
                    <a
                      href={live.outputUrl}
                      download
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Button size="sm" icon={<Download className="h-4 w-4" />}>
                        Download
                      </Button>
                    </a>
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<Share2 className="h-4 w-4" />}
                      onClick={() => share(live!.outputUrl!)}
                    >
                      Share
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* Saved setups */}
          {setups.length > 0 && (
            <Card className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-300">
                <History className="h-4 w-4" /> Saved setups
              </div>
              {setups.map((s) => (
                <div
                  key={s.name}
                  className="flex items-center justify-between gap-2 rounded-lg border border-white/10 px-3 py-2"
                >
                  <button
                    onClick={() => {
                      setPrompt(s.prompt);
                      setNegativePrompt(s.negativePrompt);
                      setQuality(s.quality);
                      setResolution(s.resolution);
                      setDuration(s.duration);
                      toast.success("Setup applied");
                    }}
                    className="min-w-0 flex-1 truncate text-left text-sm text-gray-200 hover:text-brand-300"
                  >
                    {s.name}
                  </button>
                  <button
                    aria-label="Delete setup"
                    onClick={() =>
                      persistSetups(setups.filter((x) => x.name !== s.name))
                    }
                    className="text-gray-500 hover:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </Card>
          )}
        </div>
      </div>

      {/* History */}
      <ErrorBoundary>
        <div>
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-300">
            <History className="h-4 w-4" /> Recent generations
          </div>
          {loadingJobs ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : jobs.length === 0 ? (
            <EmptyState
              icon={<Film className="h-7 w-7" />}
              title="No videos yet"
              description="Your generated videos will appear here."
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {jobs.map((j) => (
                <Card key={j.id} className="space-y-3 p-3">
                  <div className="aspect-video overflow-hidden rounded-xl bg-black">
                    {j.outputUrl ? (
                      <video
                        src={j.outputUrl}
                        poster={j.thumbnailUrl ?? undefined}
                        controls
                        className="h-full w-full"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        {j.status === "FAILED" ? (
                          <XCircle className="h-7 w-7 text-red-400" />
                        ) : (
                          <Loader2 className="h-6 w-6 animate-spin text-brand-400" />
                        )}
                      </div>
                    )}
                  </div>
                  <p className="line-clamp-2 text-xs text-gray-400">
                    {j.prompt}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone="gray">{j.resolution.replace("_", " ")}</Badge>
                    <Badge tone="gray">{j.qualityMode}</Badge>
                    {j.provider && <Badge tone="brand">{j.provider}</Badge>}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<RotateCcw className="h-3.5 w-3.5" />}
                      onClick={() => reuse(j)}
                    >
                      Reuse
                    </Button>
                    {j.outputUrl && (
                      <>
                        <a
                          href={j.outputUrl}
                          download
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={<Download className="h-3.5 w-3.5" />}
                          />
                        </a>
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<Share2 className="h-3.5 w-3.5" />}
                          onClick={() => share(j.outputUrl!)}
                        />
                      </>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </ErrorBoundary>
    </div>
  );
}
