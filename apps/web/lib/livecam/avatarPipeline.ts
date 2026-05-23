/**
 * Client-side real-time avatar reenactment pipeline.
 *
 * mediasoup is an SFU and never decodes frames, so the processed "hero"
 * output is produced in the browser: grab throttled source frames → POST
 * to the webrtc avatar proxy (which fronts the GPU reenactment model) →
 * paint the returned avatar frame to a canvas → expose
 * canvas.captureStream() as the Processed Output stream.
 *
 * HONEST DEGRADATION: when the model is unavailable the pipeline NEVER
 * paints the raw camera as if it were a generated avatar. It renders an
 * explicit standby state (static avatar preview + label) and reports
 * STANDBY / DEGRADED so the UI can be truthful.
 *
 * Stability properties (production hardening):
 *  - Single self-scheduling timer (no rVFC) → works for the detached
 *    capture <video>, predictable cadence, not starved when backgrounded.
 *  - Freeze watchdog → the canvas is always repainted; the processed
 *    stream can never silently freeze on a stale frame.
 *  - Single in-flight request, frames dropped (never queued) so latency
 *    cannot snowball.
 *  - Failure circuit-breaker → when the GPU/proxy is down, network
 *    attempts back off to a slow probe instead of hammering at full FPS.
 *  - Bounded memory → decoded frames use closeable ImageBitmaps.
 *
 * The original camera continues to be produced to mediasoup unchanged
 * (billing / session liveness) — this pipeline is purely additive.
 */

export type AvatarPipelineState =
  | 'IDLE'
  | 'INITIALIZING'
  | 'LIVE'
  | 'STANDBY'
  | 'DEGRADED';

export interface AvatarPipelineConfig {
  avatarUrl?: string;
  backgroundUrl?: string;
  enhance?: boolean;
  blend?: number;
}

export interface AvatarPipelineOptions {
  source: MediaStream;
  httpBase: string;
  /** Read live — sessionId changes across a reconnect. */
  getSession: () => { roomId: string | null; sessionId: string | null };
  getConfig: () => AvatarPipelineConfig;
  onState?: (s: AvatarPipelineState) => void;
  targetFps?: number;
  maxDim?: number;
}

type FrameResponse =
  | { processed: true; frame: string }
  | { processed: false; reason?: string };

const DEFAULT_FPS = 14;
const MIN_FPS = 6;
const DEFAULT_MAX_DIM = 512;
const OUTPUT_W = 720;
const OUTPUT_H = 960; // portrait, matches the Live Cam stage aspect
const REQUEST_TIMEOUT_MS = 1500;
const WATCHDOG_MS = 4000; // max time the canvas may go un-repainted
const INIT_GRACE_MS = 6000; // camera-frames-arriving grace window
const MAX_BACKOFF_MS = 2000;

export class AvatarPipeline {
  private opts: Required<Pick<AvatarPipelineOptions, 'targetFps' | 'maxDim'>> &
    AvatarPipelineOptions;
  private video: HTMLVideoElement;
  private grabCanvas: HTMLCanvasElement;
  private renderCanvas: HTMLCanvasElement;
  private renderCtx: CanvasRenderingContext2D;
  private _output: MediaStream | null = null;
  private _state: AvatarPipelineState = 'IDLE';

  private loopTimer: ReturnType<typeof setTimeout> | null = null;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  private abort: AbortController | null = null;
  private stopped = false;
  private inFlight = false;
  private fps: number;
  private sawProcessed = false;
  private startedAt = 0;
  private lastDrawAt = 0;
  private lastNetAttemptAt = 0;
  private consecutiveFailures = 0;
  private avatarImg: HTMLImageElement | null = null;
  private avatarImgUrl = '';

  constructor(options: AvatarPipelineOptions) {
    this.opts = {
      ...options,
      targetFps: options.targetFps ?? DEFAULT_FPS,
      maxDim: options.maxDim ?? DEFAULT_MAX_DIM,
    };
    this.fps = this.opts.targetFps;

    this.video = document.createElement('video');
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.srcObject = options.source;

    this.grabCanvas = document.createElement('canvas');
    this.renderCanvas = document.createElement('canvas');
    this.renderCanvas.width = OUTPUT_W;
    this.renderCanvas.height = OUTPUT_H;
    const ctx = this.renderCanvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable');
    this.renderCtx = ctx;
  }

  get state(): AvatarPipelineState {
    return this._state;
  }

  get outputStream(): MediaStream | null {
    return this._output;
  }

  start(): void {
    if (this.loopTimer || this.watchdog) return; // idempotent
    this.stopped = false;
    this.startedAt = performance.now();
    this.setState('INITIALIZING');
    this.drawMessage('Initializing avatar pipeline…');

    // Build the output stream once: rendered avatar video + the real mic
    // audio (honest — the user's true voice; lip motion is driven by the
    // source frames the GPU receives).
    const captured = this.renderCanvas.captureStream(this.opts.targetFps);
    this._output = new MediaStream([
      ...captured.getVideoTracks(),
      ...this.opts.source.getAudioTracks(),
    ]);

    void this.video.play().catch(() => {
      /* autoplay rejection is non-fatal — the timer loop still drives draws */
    });

    this.scheduleNext(0);

    // Freeze watchdog: if the canvas hasn't been repainted recently the
    // stream would look frozen — repaint an honest standby and degrade.
    this.watchdog = setInterval(() => {
      if (this.stopped) return;
      if (performance.now() - this.lastDrawAt > WATCHDOG_MS) {
        this.setState(this.sawProcessed ? 'DEGRADED' : 'STANDBY');
        void this.drawStandby(
          this.opts.getConfig().avatarUrl,
          'Live reenactment inactive',
        );
      }
    }, WATCHDOG_MS);
  }

  /** Re-point at a fresh local stream after a reconnect (additive — the
   *  output stream identity is preserved so the <video> keeps playing). */
  updateSource(stream: MediaStream): void {
    this.opts.source = stream;
    this.video.srcObject = stream;
    void this.video.play().catch(() => {});
    if (this._output) {
      this._output
        .getAudioTracks()
        .forEach((t) => this._output!.removeTrack(t));
      stream.getAudioTracks().forEach((t) => this._output!.addTrack(t));
    }
  }

  stop(): void {
    this.stopped = true;
    if (this.loopTimer) {
      clearTimeout(this.loopTimer);
      this.loopTimer = null;
    }
    if (this.watchdog) {
      clearInterval(this.watchdog);
      this.watchdog = null;
    }
    this.abort?.abort();
    this.abort = null;
    this._output?.getVideoTracks().forEach((t) => t.stop());
    this.video.srcObject = null;
    this._output = null;
    this.avatarImg = null;
    this.avatarImgUrl = '';
    this.setState('IDLE');
  }

  // ── internals ─────────────────────────────────────────────────

  private setState(s: AvatarPipelineState): void {
    if (this._state === s) return;
    this._state = s;
    // Lightweight client monitoring — state transitions only, never
    // per-frame, so logs stay readable in production.
    console.info(`[avatar-pipeline] state → ${s}`);
    this.opts.onState?.(s);
  }

  private scheduleNext(delayMs: number): void {
    if (this.stopped) return;
    this.loopTimer = setTimeout(() => {
      void this.tick().finally(() => this.scheduleNext(1000 / this.fps));
    }, delayMs);
  }

  private async tick(): Promise<void> {
    if (this.stopped) return;
    const now = performance.now();

    // Camera not yet delivering frames.
    if (this.video.videoWidth === 0) {
      if (now - this.startedAt > INIT_GRACE_MS) {
        this.setState('DEGRADED');
        await this.drawStandby(undefined, 'Waiting for camera…');
      }
      return;
    }

    const { roomId, sessionId } = this.opts.getSession();
    const cfg = this.opts.getConfig();

    if (!roomId || !sessionId || !cfg.avatarUrl) {
      // No live session or no target identity → honest standby (never the
      // raw camera). Keep repainting so the stream stays alive.
      this.setState(this.sawProcessed ? 'DEGRADED' : 'STANDBY');
      await this.drawStandby(
        cfg.avatarUrl,
        cfg.avatarUrl ? 'Live reenactment inactive' : 'Select a target avatar',
      );
      return;
    }

    // Single in-flight; drop the frame rather than queue it.
    if (this.inFlight) return;

    // Circuit-breaker: when the GPU/proxy is failing, slow network probes
    // (but keep repainting standby every tick so the stream never freezes).
    const backoff =
      this.consecutiveFailures === 0
        ? 0
        : Math.min(
            MAX_BACKOFF_MS,
            250 * 2 ** Math.min(this.consecutiveFailures, 3),
          );
    if (now - this.lastNetAttemptAt < backoff) {
      if (this._state !== 'LIVE') {
        await this.drawStandby(cfg.avatarUrl, 'Live reenactment inactive');
      }
      return;
    }

    this.inFlight = true;
    this.lastNetAttemptAt = now;
    const sentAt = now;
    this.abort = new AbortController();
    const timer = setTimeout(() => this.abort?.abort(), REQUEST_TIMEOUT_MS);
    try {
      const frame = this.grabFrame();
      const res = await fetch(`${this.opts.httpBase}/live-cam/avatar/frame`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId,
          sessionId,
          frame,
          avatarUrl: cfg.avatarUrl,
          backgroundUrl: cfg.backgroundUrl,
          enhance: cfg.enhance,
          blend: cfg.blend,
        }),
        signal: this.abort.signal,
      });
      const data = (await res.json()) as FrameResponse;

      if (res.ok && data.processed) {
        await this.drawProcessed(data.frame);
        this.sawProcessed = true;
        if (this.consecutiveFailures > 0) {
          console.info('[avatar-pipeline] GPU recovered');
        }
        this.consecutiveFailures = 0;
        this.setState('LIVE');
      } else {
        this.onFailure();
        this.setState(this.sawProcessed ? 'DEGRADED' : 'STANDBY');
        await this.drawStandby(cfg.avatarUrl, 'Live reenactment inactive');
      }
      this.adaptFps(performance.now() - sentAt);
    } catch {
      this.onFailure();
      this.setState(this.sawProcessed ? 'DEGRADED' : 'STANDBY');
      await this.drawStandby(cfg.avatarUrl, 'Live reenactment inactive');
      this.adaptFps(REQUEST_TIMEOUT_MS);
    } finally {
      clearTimeout(timer);
      this.inFlight = false;
    }
  }

  private onFailure(): void {
    if (this.consecutiveFailures === 0) {
      console.warn('[avatar-pipeline] GPU/proxy unavailable — honest standby');
    }
    this.consecutiveFailures += 1;
  }

  /** Downscale the source frame and return base64 JPEG (no data: prefix). */
  private grabFrame(): string {
    const vw = this.video.videoWidth;
    const vh = this.video.videoHeight;
    const scale = Math.min(1, this.opts.maxDim / Math.max(vw, vh));
    const w = Math.round(vw * scale);
    const h = Math.round(vh * scale);
    if (this.grabCanvas.width !== w) this.grabCanvas.width = w;
    if (this.grabCanvas.height !== h) this.grabCanvas.height = h;
    const g = this.grabCanvas.getContext('2d')!;
    g.drawImage(this.video, 0, 0, w, h);
    return this.grabCanvas.toDataURL('image/jpeg', 0.7).split(',')[1] ?? '';
  }

  private async drawProcessed(b64: string): Promise<void> {
    // ImageBitmap is explicitly closeable → no per-frame decode leak.
    let bmp: ImageBitmap | null = null;
    try {
      bmp = await createImageBitmap(base64ToBlob(b64, 'image/jpeg'));
      this.coverDraw(bmp);
    } finally {
      bmp?.close();
    }
  }

  private async drawStandby(
    avatarUrl: string | undefined,
    label: string,
  ): Promise<void> {
    const ctx = this.renderCtx;
    ctx.fillStyle = '#0b0b12';
    ctx.fillRect(0, 0, OUTPUT_W, OUTPUT_H);
    if (avatarUrl) {
      try {
        if (this.avatarImgUrl !== avatarUrl) {
          this.avatarImg = await loadImage(avatarUrl);
          this.avatarImgUrl = avatarUrl;
        }
        if (this.avatarImg) {
          ctx.globalAlpha = 0.55;
          this.coverDraw(this.avatarImg, false);
          ctx.globalAlpha = 1;
        }
      } catch {
        /* avatar preview optional */
      }
    }
    // Honest label band — this is a preview, not a live deepfake.
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, OUTPUT_H - 96, OUTPUT_W, 96);
    ctx.fillStyle = '#fef08a';
    ctx.font = '600 26px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, OUTPUT_W / 2, OUTPUT_H - 54);
    ctx.fillStyle = '#9ca3af';
    ctx.font = '400 18px system-ui, sans-serif';
    ctx.fillText(
      'Preview only — GPU avatar standing by',
      OUTPUT_W / 2,
      OUTPUT_H - 26,
    );
    this.lastDrawAt = performance.now();
  }

  private drawMessage(text: string): void {
    const ctx = this.renderCtx;
    ctx.fillStyle = '#0b0b12';
    ctx.fillRect(0, 0, OUTPUT_W, OUTPUT_H);
    ctx.fillStyle = '#9ca3af';
    ctx.font = '500 22px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(text, OUTPUT_W / 2, OUTPUT_H / 2);
    this.lastDrawAt = performance.now();
  }

  private coverDraw(
    img: ImageBitmap | HTMLImageElement,
    clear = true,
  ): void {
    const ctx = this.renderCtx;
    if (clear) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, OUTPUT_W, OUTPUT_H);
    }
    const ir = img.width / img.height;
    const cr = OUTPUT_W / OUTPUT_H;
    let dw = OUTPUT_W;
    let dh = OUTPUT_H;
    if (ir > cr) dw = OUTPUT_H * ir;
    else dh = OUTPUT_W / ir;
    ctx.drawImage(img, (OUTPUT_W - dw) / 2, (OUTPUT_H - dh) / 2, dw, dh);
    this.lastDrawAt = performance.now();
  }

  private adaptFps(latencyMs: number): void {
    const budget = 1000 / this.opts.targetFps;
    if (latencyMs > budget * 1.5 && this.fps > MIN_FPS) {
      this.fps = Math.max(MIN_FPS, this.fps - 2);
    } else if (latencyMs < budget * 0.6 && this.fps < this.opts.targetFps) {
      this.fps = Math.min(this.opts.targetFps, this.fps + 1);
    }
  }
}

function base64ToBlob(b64: string, type: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = src;
  });
}
