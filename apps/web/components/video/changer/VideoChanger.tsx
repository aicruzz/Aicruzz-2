"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Replace,
  Wand2,
  Download,
  Share2,
  Play,
  Loader2,
  CheckCircle2,
  Clock,
  XCircle,
  RotateCcw,
  Film,
  X,
} from "lucide-react";
import toast from "react-hot-toast";
import { clsx as cn } from "clsx";
import { videoApi, getApiError } from "@/lib/api";
import { Card, Button, Badge } from "@/components/ui";
import { PillSelect } from "@/components/cartoon/studio/StudioControls";
import { AssetSlot, type AssetValue } from "@/components/cartoon/studio/AssetSlot";
import { VIDEO_QUALITY_OPTIONS } from "@/components/video/studio/videoQuality";
import {
  VoiceNarrationPanel,
  type VideoVoiceSelection,
} from "@/components/video/studio/VoiceNarrationPanel";
import { useVideoEvents, type VideoEvent } from "@/hooks/useVideoEvents";

const RESOLUTIONS = [
  { value: "SD_480P", label: "480p", hint: "fastest" },
  { value: "HD_720P", label: "720p", hint: "balanced" },
  { value: "FHD_1080P", label: "1080p", hint: "sharp" },
];

const DURATIONS = [
  { value: "5", label: "5s" },
  { value: "10", label: "10s" },
];

// Professional, provider-agnostic progress labels (no provider names).
const STEPS = ["Analyzing", "Swapping face", "Rendering", "Finalizing"];
const STAGE_MESSAGES: Record<string, string> = {
  queued: "Preparing your video…",
  generating: "Analyzing faces and matching identity…",
  "post-processing": "Blending features and refining edges…",
  encoding: "Rendering the result…",
  completed: "Finalizing your video…",
};

function stageIndex(e?: VideoEvent | null): number {
  if (!e) return 0;
  if (e.status === "COMPLETED") return 3;
  if (e.stage === "encoding") return 2;
  if (e.stage === "generating" || e.stage === "post-processing" || e.status === "PROCESSING")
    return 1;
  return 0;
}

function professionalStageMessage(e?: VideoEvent | null): string {
  if (!e) return "Preparing your video…";
  if (e.status === "QUEUED") return STAGE_MESSAGES.queued;
  return (e.stage && STAGE_MESSAGES[e.stage]) || "Optimizing quality…";
}

export function VideoChanger() {
  const [targetImage, setTargetImage] = useState<AssetValue | null>(null);
  const [sourceVideoUrl, setSourceVideoUrl] = useState<string | null>(null);
  const [sourceVideoName, setSourceVideoName] = useState<string | null>(null);
  const [uploadingVideo, setUploadingVideo] = useState(false);

  const [quality, setQuality] = useState("STANDARD");
  const [resolution, setResolution] = useState("HD_720P");
  const [duration, setDuration] = useState("5");
  const [voice, setVoice] = useState<VideoVoiceSelection>({
    voiceMode: "NONE", // NONE = keep the original video's voice
    voiceText: "",
    emotion: "neutral",
    voiceGender: "FEMALE",
  });

  const [credits, setCredits] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [live, setLive] = useState<VideoEvent | null>(null);
  const videoFileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Live progress via the shared SSE feed (same pipeline as Video Studio).
  useVideoEvents({
    onEvent: (e) => {
      if (activeJobId && e.jobId === activeJobId) setLive(e);
    },
  });

  // Credit estimate (provider-independent, quality-only).
  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const r = await videoApi.estimate(Number(duration), resolution, quality);
        setCredits((r.data as { data: { credits: number } }).data.credits);
      } catch {
        setCredits(null);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [duration, resolution, quality]);

  async function uploadSourceVideo(file: File) {
    setUploadingVideo(true);
    try {
      const r = await videoApi.uploadInput(file);
      const url =
        (r.data as { data?: { url?: string } })?.data?.url ??
        (r.data as { url?: string })?.url;
      if (!url) throw new Error("Upload returned no URL");
      setSourceVideoUrl(url);
      setSourceVideoName(file.name);
    } catch (e) {
      toast.error(getApiError(e));
    } finally {
      setUploadingVideo(false);
      if (videoFileRef.current) videoFileRef.current.value = "";
    }
  }

  const swap = useCallback(async () => {
    if (!targetImage?.url) {
      toast.error("Add a target face image");
      return;
    }
    if (!sourceVideoUrl) {
      toast.error("Upload a source video");
      return;
    }
    setSubmitting(true);
    setLive(null);
    try {
      const r = await videoApi.faceSwap({
        targetImageUrl: targetImage.url,
        inputVideoUrl: sourceVideoUrl,
        durationSeconds: Number(duration),
        resolution,
        qualityMode: quality,
        // voiceMode NONE → keep the original video's voice; AI/Saved/Clone →
        // generated narration + lip sync (shared backend pipeline).
        voiceEnabled: voice.voiceMode !== "NONE",
        voiceText:
          voice.voiceMode !== "NONE"
            ? voice.voiceText.trim() || undefined
            : undefined,
        voiceGender: voice.voiceMode === "AI" ? voice.voiceGender : undefined,
        voiceAssetId:
          voice.voiceMode === "UPLOAD" || voice.voiceMode === "CLONE"
            ? voice.voiceAssetId
            : undefined,
        voiceStyle: voice.voiceMode !== "NONE" ? voice.emotion : undefined,
        fps: 24,
      });
      const job = (r.data as { data: { id: string } }).data;
      setActiveJobId(job.id);
      toast.success("Face swap started");
    } catch (e) {
      toast.error(getApiError(e));
    } finally {
      setSubmitting(false);
    }
  }, [targetImage, sourceVideoUrl, duration, resolution, quality, voice]);

  async function share(url: string) {
    try {
      if (navigator.share) await navigator.share({ url, title: "AiCruzz video" });
      else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied");
      }
    } catch {
      /* cancelled */
    }
  }

  const activeStep = stageIndex(live);
  const failed = live?.status === "FAILED" || live?.status === "CANCELLED";
  const done = live?.status === "COMPLETED";

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Inputs */}
      <Card className="space-y-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
            <Replace className="h-5 w-5 text-brand-400" /> Swap a face into a video
          </h2>
          <p className="text-sm text-gray-400">
            Identity, expression and lip sync are preserved automatically.
          </p>
        </div>

        {/* Target face/head image */}
        <AssetSlot
          label="Target face / head"
          assetType="FACE"
          value={targetImage}
          onChange={setTargetImage}
          required
        />

        {/* Source video */}
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
            Source video
          </p>
          {sourceVideoUrl ? (
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-surface-800/50 p-3">
              <Film className="h-4 w-4 text-brand-400" />
              <span className="flex-1 truncate text-sm text-gray-200">
                {sourceVideoName ?? "Uploaded video"}
              </span>
              <button
                type="button"
                onClick={() => {
                  setSourceVideoUrl(null);
                  setSourceVideoName(null);
                }}
                className="text-gray-400 hover:text-white"
                aria-label="Remove video"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => videoFileRef.current?.click()}
              disabled={uploadingVideo}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 bg-surface-800/40 px-4 py-6 text-sm text-gray-400 transition-colors hover:border-brand-500/40 hover:text-brand-300 disabled:opacity-50"
            >
              {uploadingVideo ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Uploading…
                </>
              ) : (
                <>
                  <Film className="h-4 w-4" /> Upload a video (mp4 / webm)
                </>
              )}
            </button>
          )}
          <input
            ref={videoFileRef}
            type="file"
            accept="video/mp4,video/webm"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadSourceVideo(f);
            }}
          />
        </div>

        {/* Quality / resolution / duration */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <PillSelect
            label="Quality"
            value={quality}
            onChange={setQuality}
            options={VIDEO_QUALITY_OPTIONS}
          />
          <PillSelect
            label="Resolution"
            value={resolution}
            onChange={setResolution}
            options={RESOLUTIONS}
          />
          <PillSelect
            label="Duration"
            value={duration}
            onChange={setDuration}
            options={DURATIONS}
          />
        </div>

        {/* Voice — NONE keeps the original video's voice. */}
        <VoiceNarrationPanel value={voice} onChange={setVoice} />
        <p className="text-[11px] text-gray-500">
          “None” keeps the original video’s voice. Choose AI / Saved / Cloned voice
          to replace it with narration (lip-synced automatically).
        </p>

        <div className="flex items-center justify-between">
          <Badge tone="gray">{credits ?? "—"} credits</Badge>
          <Button
            size="lg"
            loading={submitting}
            disabled={submitting || !targetImage?.url || !sourceVideoUrl}
            icon={<Wand2 className="h-4 w-4" />}
            onClick={() => swap()}
          >
            {submitting ? "Starting…" : "Swap face"}
          </Button>
        </div>
      </Card>

      {/* Progress / result */}
      <Card className="space-y-3">
        {!activeJobId ? (
          <div className="flex h-full min-h-[16rem] flex-col items-center justify-center gap-2 text-center text-gray-500">
            <Replace className="h-8 w-8 text-gray-600" />
            <p className="text-sm">Your swapped video will appear here.</p>
          </div>
        ) : (
          <>
            {!failed && (
              <div className="flex items-center gap-2">
                {STEPS.map((label, i) => {
                  const reached = i <= activeStep;
                  const current = i === activeStep && !done;
                  const Icon = i === 3 ? CheckCircle2 : i === 0 ? Clock : Loader2;
                  return (
                    <div key={label} className="flex flex-1 items-center gap-2">
                      <div
                        className={cn(
                          "flex h-7 w-7 items-center justify-center rounded-full border",
                          reached
                            ? "border-brand-500/60 bg-brand-500/15 text-brand-300"
                            : "border-white/10 text-gray-600",
                        )}
                      >
                        <Icon className={cn("h-3.5 w-3.5", current && "animate-spin")} />
                      </div>
                      <span
                        className={cn("text-xs", reached ? "text-gray-200" : "text-gray-600")}
                      >
                        {label}
                      </span>
                      {i < STEPS.length - 1 && (
                        <div
                          className={cn(
                            "h-px flex-1",
                            i < activeStep ? "bg-brand-500/40" : "bg-white/10",
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

            {!failed && !done && (
              <p className="text-xs text-gray-500">
                {live?.message || professionalStageMessage(live)}
              </p>
            )}

            {failed && (
              <div className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/5 p-3">
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                <p className="text-sm text-red-300">
                  {live?.error ?? "Face swap failed. Credits were refunded."}
                </p>
              </div>
            )}

            {done && live?.outputUrl && (
              <div className="space-y-3">
                <video
                  ref={videoRef}
                  src={live.outputUrl}
                  poster={live.thumbnailUrl ?? undefined}
                  controls
                  playsInline
                  className="aspect-video w-full rounded-xl border border-white/10 bg-black"
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<Play className="h-4 w-4" />}
                    onClick={() => {
                      const v = videoRef.current;
                      if (v) {
                        v.currentTime = 0;
                        void v.play();
                      }
                    }}
                  >
                    Replay
                  </Button>
                  <a href={live.outputUrl} download target="_blank" rel="noreferrer">
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
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<RotateCcw className="h-4 w-4" />}
                    onClick={() => swap()}
                  >
                    Run again
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
