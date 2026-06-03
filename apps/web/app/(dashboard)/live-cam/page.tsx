"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Camera, ShieldAlert } from "lucide-react";
import toast from "react-hot-toast";
import { Device } from "mediasoup-client";
import type {
  Transport,
  Producer,
  RtpCapabilities,
  TransportOptions,
  DtlsParameters,
  RtpParameters,
} from "mediasoup-client/types";
import { api, authApi, getApiError } from "@/lib/api";
import { consumeBannerPrefill } from "@/lib/bannerPrefill";
import { ErrorBoundary } from "@/components/ui";
import { CreditMeter } from "@/components/live-cam/CreditMeter";
import {
  VoiceSelector,
  type VoiceMode,
} from "@/components/live-cam/VoiceSelector";
import { SessionControls } from "@/components/live-cam/SessionControls";
import { VideoStage } from "@/components/live-cam/VideoStage";
import {
  BackgroundControls,
  type BackgroundValue,
} from "@/components/live-cam/BackgroundControls";
import {
  AvatarControls,
  type AvatarValue,
} from "@/components/live-cam/AvatarControls";
import { useAvatarPipeline } from "@/hooks/useAvatarPipeline";
import { useAuth } from "@/contexts/AuthContext";

// Fallback MUST be a scheme-qualified URL — a bare host produces an invalid
// WebSocket() URL and a scheme-less HTTP derivation. Production overrides this
// via NEXT_PUBLIC_WEBRTC_WS_URL; the default points at the deployed service so
// a missing env var still yields a valid (not localhost) endpoint.
const WS_URL =
  process.env.NEXT_PUBLIC_WEBRTC_WS_URL ??
  "wss://aicruzzwebrtc-production.up.railway.app";
// HTTP origin of the same webrtc service (avatar proxy). Derived from the
// WS URL so a single env var configures both. ws:// → http://, wss:// → https://
const WEBRTC_HTTP_URL = WS_URL.replace(/^ws(s?):/, "http$1:");
const CREDITS_PER_SECOND = 0.2;
const HANDSHAKE_TIMEOUT_MS = 8000;
const MAX_RECONNECT_ATTEMPTS = 6;
const STALL_THRESHOLD_MS = 6000;

type WsMessage = { type: string; data?: unknown };
type ConnState = "idle" | "connecting" | "live" | "reconnecting" | "failed";

export default function LiveCamPage() {
  const { user, refreshUser } = useAuth();

  // Video refs
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const processedVideoRef = useRef<HTMLVideoElement>(null);

  // State
  const [isLive, setIsLive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [hasRecording, setHasRecording] = useState(false);
  const [voiceMode, setVoiceMode] = useState<VoiceMode>("NONE");
  const [background, setBackground] = useState<BackgroundValue>({
    mode: "ORIGINAL",
  });
  const [avatar, setAvatar] = useState<AvatarValue>({});
  const [creditsUsed, setCreditsUsed] = useState(0);
  const [creditsRemaining, setCreditsRemaining] = useState(
    user?.wallet?.credits ?? 0,
  );
  const [secondsElapsed, setSecondsElapsed] = useState(0);
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [, setRoomId] = useState<string | null>(null);
  const [connState, setConnState] = useState<ConnState>("idle");

  // Refs
  const streamRef = useRef<MediaStream | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const deviceRef = useRef<Device | null>(null);
  const sendTransportRef = useRef<Transport | null>(null);
  const videoProducerRef = useRef<Producer | null>(null);
  const audioProducerRef = useRef<Producer | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const creditTickRef = useRef<NodeJS.Timeout | null>(null);
  // Keep a stable ref to roomId/sessionId for use inside callbacks
  const roomIdRef = useRef<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  // Pending request/response correlation: server replies as `${type}.reply`
  const pendingRef = useRef<
    Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>
  >(new Map());

  // ── Hardening refs (additive — no contract changes) ─────────
  const handshakeTimerRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectingRef = useRef(false);
  const intentionalCloseRef = useRef(false);
  // Guard against a fast double-click / double-mount creating two
  // /live-cam/start sessions (double billing) or two WebSockets.
  const startingRef = useRef(false);
  // Bumped on every fresh start / stop so stale async callbacks bail out.
  const sessionEpochRef = useRef(0);
  // Freeze detection for the processed stream.
  const lastFrameTsRef = useRef(0);
  const sawFrameRef = useRef(false);
  const stallTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [stalled, setStalled] = useState(false);
  // Latest voice/background/avatar — read live by the pipeline + replayed
  // after a successful reconnect.
  const voiceModeRef = useRef<VoiceMode>("NONE");
  const backgroundRef = useRef<BackgroundValue>({ mode: "ORIGINAL" });
  const avatarRef = useRef<AvatarValue>({});

  // Additive client-side avatar reenactment pipeline (the Processed Output
  // hero stream). The original camera is still produced to mediasoup
  // unchanged for billing/session — this never touches that path.
  const {
    state: pipelineState,
    start: startPipeline,
    updateSource: updatePipelineSource,
    stop: stopPipeline,
  } = useAvatarPipeline();

  useEffect(() => {
    setCreditsRemaining(user?.wallet?.credits ?? 0);
  }, [user?.wallet?.credits]);

  useEffect(() => {
    voiceModeRef.current = voiceMode;
  }, [voiceMode]);
  useEffect(() => {
    backgroundRef.current = background;
  }, [background]);
  useEffect(() => {
    avatarRef.current = avatar;
  }, [avatar]);

  // ── Get camera/mic access (with graceful fallback) ──────────
  async function getLocalStream(): Promise<MediaStream> {
    const ideal: MediaStreamConstraints = {
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 },
      },
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 48000,
      },
    };
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia(ideal);
    } catch (err) {
      const name = (err as DOMException)?.name;
      if (name === "OverconstrainedError" || name === "NotReadableError") {
        // Retry with relaxed constraints (any camera/mic the device offers).
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
      } else if (name === "NotAllowedError" || name === "SecurityError") {
        throw new Error(
          "Camera/microphone permission denied. Allow access and retry.",
        );
      } else if (name === "NotFoundError") {
        throw new Error("No camera or microphone found on this device.");
      } else {
        throw err;
      }
    }
    streamRef.current = stream;
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
    }
    return stream;
  }

  // Keep isLive in a ref so the ws.onclose closure can read the latest value
  const isLiveRef = useRef(false);
  useEffect(() => {
    isLiveRef.current = isLive;
  }, [isLive]);

  // ── Request/response over the WS, keyed by `${type}.reply` ──
  function wsRequest<T = unknown>(type: string, data: unknown): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        reject(new Error("WebSocket not open"));
        return;
      }
      if (pendingRef.current.has(type)) {
        reject(new Error(`Request already in flight: ${type}`));
        return;
      }
      pendingRef.current.set(type, {
        resolve: (v) => resolve(v as T),
        reject,
      });
      ws.send(JSON.stringify({ type, data }));
    });
  }

  // ── Handle incoming WS messages ─────────────────────────────
  function handleWsMessage(msg: WsMessage) {
    // Request/response correlation: replies arrive as `${type}.reply`
    if (msg.type.endsWith(".reply")) {
      const origType = msg.type.slice(0, -".reply".length);
      const pending = pendingRef.current.get(origType);
      if (pending) {
        pendingRef.current.delete(origType);
        pending.resolve(msg.data);
      }
      return;
    }
    switch (msg.type) {
      case "connected":
        // Server's hello — nothing to do, we proceed via wsRequest.
        break;

      case "credits_exhausted":
        toast.error("Credits exhausted. Session ended automatically.");
        handleStop();
        break;

      case "error": {
        const err = msg.data as { message?: string; for?: string };
        // Resolve the matching pending request (if any) with a rejection
        if (err?.for && pendingRef.current.has(err.for)) {
          const pending = pendingRef.current.get(err.for)!;
          pendingRef.current.delete(err.for);
          pending.reject(new Error(err.message ?? "Unknown error"));
        } else {
          toast.error(String(err?.message ?? "Unknown error"));
        }
        break;
      }
    }
  }

  // ── Connect to WebSocket signalling server ──────────────────
  function connectWebSocket(token: string): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(
        `${WS_URL}/ws?userId=${user?.id}&token=${token}`,
      );
      wsRef.current = ws;

      // Handshake timeout — never hang on a silent socket.
      if (handshakeTimerRef.current) clearTimeout(handshakeTimerRef.current);
      handshakeTimerRef.current = setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          try {
            ws.close();
          } catch {
            /* noop */
          }
          reject(new Error("WebSocket handshake timed out"));
        }
      }, HANDSHAKE_TIMEOUT_MS);

      ws.onopen = () => {
        if (handshakeTimerRef.current) clearTimeout(handshakeTimerRef.current);
        resolve(ws);
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string) as WsMessage;
          handleWsMessage(msg);
        } catch (err) {
          console.error("Failed to parse WS message", err);
        }
      };

      ws.onerror = () => reject(new Error("WebSocket connection failed"));

      ws.onclose = () => {
        // Reject any in-flight requests so callers don't hang. The pending
        // map stays type-keyed — never re-keyed (server reply contract).
        pendingRef.current.forEach((p) =>
          p.reject(new Error("WebSocket closed")),
        );
        pendingRef.current.clear();

        if (intentionalCloseRef.current) return;
        // If attemptReconnect is driving retries it handles its own loop.
        if (reconnectingRef.current) return;

        if (isLiveRef.current) {
          reconnectingRef.current = true;
          setConnState("reconnecting");
          scheduleReconnect();
        }
      };
    });
  }

  // ── Auto-reconnect (exponential backoff, contract-safe) ─────
  const scheduleReconnect = useCallback(() => {
    if (reconnectAttemptRef.current >= MAX_RECONNECT_ATTEMPTS) {
      reconnectingRef.current = false;
      setConnState("failed");
      toast.error("Connection lost. Session ended.");
      handleStop();
      return;
    }
    const attempt = reconnectAttemptRef.current;
    const backoff = Math.min(30000, 1000 * 2 ** attempt) + Math.random() * 500;
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = setTimeout(() => {
      attemptReconnect();
    }, backoff);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function attemptReconnect() {
    const myEpoch = sessionEpochRef.current;
    reconnectAttemptRef.current += 1;
    try {
      // Drop the dead transport/producers before re-establishing.
      videoProducerRef.current?.close();
      audioProducerRef.current?.close();
      sendTransportRef.current?.close();
      videoProducerRef.current = null;
      audioProducerRef.current = null;
      sendTransportRef.current = null;
      deviceRef.current = null;

      // Reuse the local stream if its tracks are still live.
      let stream = streamRef.current;
      const tracksLive =
        !!stream && stream.getTracks().some((t) => t.readyState === "live");
      if (!tracksLive) stream = await getLocalStream();
      if (sessionEpochRef.current !== myEpoch) return;

      // Fresh short-lived WS token (the previous one may have expired).
      const wsRes = await authApi.wsToken();
      if (sessionEpochRef.current !== myEpoch) return;
      const wsTokenValue = (wsRes.data as { data: { token: string } }).data
        .token;
      await connectWebSocket(wsTokenValue);
      if (sessionEpochRef.current !== myEpoch) return;


      const joinReply = await wsRequest<{
        roomId: string;
        sessionId: string;
        rtpCapabilities: RtpCapabilities;
      }>("join", { roomId: roomIdRef.current, sessionId: sessionIdRef.current });
      if (sessionEpochRef.current !== myEpoch) return;
 

      const device = new Device();
      await device.load({ routerRtpCapabilities: joinReply.rtpCapabilities });
      if (sessionEpochRef.current !== myEpoch) return;
      deviceRef.current = device;

      await setupSendTransport(device, stream!);
      if (sessionEpochRef.current !== myEpoch) return;

      // Re-point the pipeline at the (possibly fresh) local stream. The
      // output MediaStream identity is preserved so the <video> keeps
      // playing; the new sessionId is read live via getSession().
      updatePipelineSource(stream!);

      // Success — replay session config for continuity.
      reconnectAttemptRef.current = 0;
      reconnectingRef.current = false;
      setConnState("live");
      setStalled(false);
      sendVoice(voiceModeRef.current);
      sendBackground(backgroundRef.current);
      toast.success("Reconnected");
    } catch {
      if (sessionEpochRef.current !== myEpoch) return;
      // Retry with the next backoff step (or terminate at the cap).
      scheduleReconnect();
    }
  }

  // ── Set up mediasoup-client send transport + producers ──────
  async function setupSendTransport(
    device: Device,
    stream: MediaStream,
  ): Promise<Transport> {
    const transportParams = await wsRequest<TransportOptions>(
      "createSendTransport",
      { roomId: roomIdRef.current, sessionId: sessionIdRef.current },
    );

    const sendTransport = device.createSendTransport(transportParams);
    sendTransportRef.current = sendTransport;

    // mediasoup-client fires `connect` once when the transport needs DTLS
    sendTransport.on(
      "connect",
      (
        { dtlsParameters }: { dtlsParameters: DtlsParameters },
        callback,
        errback,
      ) => {
        wsRequest("connectTransport", {
          roomId: roomIdRef.current,
          sessionId: sessionIdRef.current,
          transportId: sendTransport.id,
          dtlsParameters,
        })
          .then(() => callback())
          .catch((err: Error) => errback(err));
      },
    );

    // Fires for each track we call `produce({ track })` on
    sendTransport.on(
      "produce",
      (
        {
          kind,
          rtpParameters,
        }: { kind: "video" | "audio"; rtpParameters: RtpParameters },
        callback,
        errback,
      ) => {
        wsRequest<{ producerId: string }>("produce", {
          roomId: roomIdRef.current,
          sessionId: sessionIdRef.current,
          kind,
          rtpParameters,
        })
          .then(({ producerId }) => callback({ id: producerId }))
          .catch((err: Error) => errback(err));
      },
    );

    sendTransport.on("connectionstatechange", (state) => {
      if (state === "failed" || state === "disconnected") {
        if (isLiveRef.current && !intentionalCloseRef.current) {
          if (!reconnectingRef.current) {
            reconnectingRef.current = true;
            setConnState("reconnecting");
            scheduleReconnect();
          }
        }
      }
    });

    // Produce video first, then audio — sequential because the server's
    // reply correlation is keyed by message type (no per-request ID).
    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
      videoProducerRef.current = await sendTransport.produce({
        track: videoTrack,
      });
    }
    const audioTrack = stream.getAudioTracks()[0];
    if (audioTrack) {
      audioProducerRef.current = await sendTransport.produce({
        track: audioTrack,
      });
    }

    return sendTransport;
  }

  // ── Start live session ──────────────────────────────────────
  async function handleStart() {
    // Idempotent: a second click, a double-mount, or any race before the
    // disabled state renders must not create a second billed session.
    if (isLiveRef.current || startingRef.current) return;
    startingRef.current = true;
    setLoading(true);
    setConnState("connecting");
    intentionalCloseRef.current = false;
    reconnectingRef.current = false;
    reconnectAttemptRef.current = 0;
    sessionEpochRef.current += 1;
    const myEpoch = sessionEpochRef.current;
    try {
      // 1. Get local stream
      const stream = await getLocalStream();

      // 2. Create session via API
      const res = await api.post("/live-cam/start");
      const { sessionId: sid, roomId: rid } = (
        res.data as { data: { sessionId: string; roomId: string } }
      ).data;

      setSessionId(sid);
      setRoomId(rid);
      roomIdRef.current = rid;
      sessionIdRef.current = sid;

      // 3. Mint a short-lived JWT (5 min) for the WS handshake — cookies
      //    don't reach the separate webrtc service, so we send a token
      //    explicitly. Refreshes are handled per-session, not per-connection.
      const wsRes = await authApi.wsToken();
      const wsTokenValue = (wsRes.data as { data: { token: string } }).data
        .token;
      await connectWebSocket(wsTokenValue);

      // 4. Join the room — the server-issued sessionId here is what mediasoup
      //    tracks. The API-issued sessionId from step 2 stays in our state for
      //    UI display; the WS sessionId is what we send on every subsequent
      //    signaling message.
      const joinReply = await wsRequest<{
        roomId: string;
        sessionId: string;
        rtpCapabilities: RtpCapabilities;
      }>("join", { roomId: rid, sessionId: sid });

      // 5. Load a mediasoup Device with the router's RTP capabilities
      const device = new Device();
      await device.load({ routerRtpCapabilities: joinReply.rtpCapabilities });
      deviceRef.current = device;

      // 6. Create send transport + produce our tracks
      await setupSendTransport(device, stream);
      if (sessionEpochRef.current !== myEpoch) return;

      // 6b. Start the additive avatar reenactment pipeline → Processed Output
      launchPipeline(stream);

      // 7. Start local timer (display only — real billing is server-side)
      setSecondsElapsed(0);
      setCreditsUsed(0);
      timerRef.current = setInterval(() => {
        setSecondsElapsed((s) => s + 1);
        setCreditsUsed((c) => parseFloat((c + CREDITS_PER_SECOND).toFixed(2)));
        setCreditsRemaining((r) =>
          parseFloat(Math.max(0, r - CREDITS_PER_SECOND).toFixed(2)),
        );
      }, 1000);

      setIsLive(true);
      setConnState("live");
      // Apply any pre-selected background once live.
      if (backgroundRef.current.mode === "REPLACE") {
        sendBackground(backgroundRef.current);
      }
      toast.success("Live session started!");
    } catch (err) {
      setConnState("idle");
      toast.error(getApiError(err));
      streamRef.current?.getTracks().forEach((t) => t.stop());
    } finally {
      startingRef.current = false;
      setLoading(false);
    }
  }

  // ── Stop session ────────────────────────────────────────────
  const handleStop = useCallback(() => {
    intentionalCloseRef.current = true;
    reconnectingRef.current = false;
    startingRef.current = false;
    sessionEpochRef.current += 1;

    // Clear timers (incl. hardening timers)
    if (timerRef.current) clearInterval(timerRef.current);
    if (creditTickRef.current) clearInterval(creditTickRef.current);
    if (handshakeTimerRef.current) clearTimeout(handshakeTimerRef.current);
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    if (stallTimerRef.current) clearInterval(stallTimerRef.current);

    // Tear down the avatar pipeline (cancels rVFC, aborts fetches, stops
    // the captured canvas track) before dropping the media tracks.
    stopPipeline();

    // Stop media tracks
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (processedVideoRef.current) processedVideoRef.current.srcObject = null;

    // Close producers + send transport
    videoProducerRef.current?.close();
    audioProducerRef.current?.close();
    sendTransportRef.current?.close();
    videoProducerRef.current = null;
    audioProducerRef.current = null;
    sendTransportRef.current = null;
    deviceRef.current = null;

    // Close WebSocket
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "leave",
          data: { roomId: roomIdRef.current, sessionId: sessionIdRef.current },
        }),
      );
      wsRef.current.close();
    }

    setIsLive(false);
    setConnState("idle");
    setStalled(false);
    sawFrameRef.current = false;
    refreshUser(); // Sync credits from server
    toast("Session ended");
  }, [refreshUser, stopPipeline]);

  // ── Camera / Mic toggles ────────────────────────────────────
  function toggleMute() {
    const stream = streamRef.current;
    if (!stream) return;
    stream.getAudioTracks().forEach((t) => {
      t.enabled = isMuted;
    });
    setIsMuted((m) => !m);
  }

  function toggleCamera() {
    const stream = streamRef.current;
    if (!stream) return;
    stream.getVideoTracks().forEach((t) => {
      t.enabled = !isCameraOn;
    });
    setIsCameraOn((c) => !c);
  }

  // ── Fire-and-forget config senders (reused on reconnect) ────
  function sendVoice(mode: VoiceMode) {
    if (wsRef.current?.readyState === WebSocket.OPEN && isLiveRef.current) {
      wsRef.current.send(
        JSON.stringify({
          type: "setVoice",
          data: {
            roomId: roomIdRef.current,
            sessionId: sessionIdRef.current,
            mode,
            pitch: mode === "MALE" ? -4 : mode === "FEMALE" ? 4 : 0,
          },
        }),
      );
    }
  }

  function sendBackground(cfg: BackgroundValue) {
    if (wsRef.current?.readyState === WebSocket.OPEN && isLiveRef.current) {
      wsRef.current.send(
        JSON.stringify({
          type: "setBackground",
          data: {
            roomId: roomIdRef.current,
            sessionId: sessionIdRef.current,
            mode: cfg.mode,
            backgroundUrl: cfg.backgroundUrl,
          },
        }),
      );
    }
  }

  // ── Launch the client-side avatar pipeline ──────────────────
  function launchPipeline(stream: MediaStream) {
    const out = startPipeline({
      source: stream,
      httpBase: WEBRTC_HTTP_URL,
      getSession: () => ({
        roomId: roomIdRef.current,
        sessionId: sessionIdRef.current,
      }),
      getConfig: () => ({
        avatarUrl: avatarRef.current.avatarUrl,
        backgroundUrl:
          backgroundRef.current.mode === "REPLACE"
            ? backgroundRef.current.backgroundUrl
            : undefined,
      }),
    });
    if (out && processedVideoRef.current) {
      processedVideoRef.current.srcObject = out;
    }
  }

  // ── Avatar change (live switch — no session restart) ────────
  function handleAvatarChange(v: AvatarValue) {
    setAvatar(v);
    avatarRef.current = v;
    // Forward to the server for record / forward-compat (reuses the
    // existing setFaceSwap seam). The live switch itself is driven by the
    // client pipeline reading avatarRef on its next frame.
    if (wsRef.current?.readyState === WebSocket.OPEN && isLiveRef.current) {
      wsRef.current.send(
        JSON.stringify({
          type: "setFaceSwap",
          data: {
            roomId: roomIdRef.current,
            sessionId: sessionIdRef.current,
            targetFaceUrl: v.avatarUrl,
          },
        }),
      );
    }
  }

  // ── Voice mode change ───────────────────────────────────────
  function handleVoiceChange(mode: VoiceMode) {
    setVoiceMode(mode);
    sendVoice(mode);
  }

  // ── Background change ───────────────────────────────────────
  function handleBackgroundChange(cfg: BackgroundValue) {
    setBackground(cfg);
    if (wsRef.current?.readyState === WebSocket.OPEN && isLiveRef.current) {
      sendBackground(cfg);
    } else if (cfg.mode === "REPLACE") {
      toast("Background will apply once the session is live");
    }
  }

  // ── Recording ───────────────────────────────────────────────
  function startRecording() {
    // Prefer the processed avatar output (avatar video + live mic). Fall
    // back to the raw camera with an honest notice when the pipeline isn't
    // producing a real reenactment yet.
    const processed = processedVideoRef.current
      ?.srcObject as MediaStream | null;
    const usingProcessed = !!processed && pipelineState === "LIVE";
    const stream = usingProcessed ? processed : streamRef.current;
    if (!stream) return;
    if (!usingProcessed) {
      toast("Recording raw camera — avatar reenactment not active");
    }
    recordedChunksRef.current = [];
    const mr = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp9" });
    mr.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunksRef.current.push(e.data);
    };
    mr.onstop = () => setHasRecording(true);
    mr.start(1000);
    mediaRecorderRef.current = mr;
    setIsRecording(true);
    toast("Recording started");
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
    toast("Recording stopped — ready to download");
  }

  function downloadRecording() {
    const blob = new Blob(recordedChunksRef.current, { type: "video/webm" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aicruzz-livecam-${Date.now()}.webm`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Cross-module "Use This Prompt" hand-off ─────────────────
  // Live Cam has no prompt and no soft-suggestion surface. We only
  // consume-and-clear the stale prefill entry; settings are never
  // overwritten (incompatible metadata is gracefully ignored).
  useEffect(() => {
    consumeBannerPrefill("LIVE_CAM");
  }, []);

  // ── Freeze detection for the processed stream ───────────────
  // Only fires after at least one real frame has been observed, so an
  // un-wired processed feed never triggers a false "stall".
  useEffect(() => {
    const v = processedVideoRef.current;
    if (!v) return;
    let cancelled = false;
    type RVFCVideo = HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: () => void) => number;
    };
    const rvfc = (v as RVFCVideo).requestVideoFrameCallback?.bind(v);
    const onFrame = () => {
      if (cancelled) return;
      lastFrameTsRef.current = Date.now();
      sawFrameRef.current = true;
      if (rvfc) rvfc(onFrame);
    };
    if (rvfc) rvfc(onFrame);

    stallTimerRef.current = setInterval(() => {
      if (!isLiveRef.current || !sawFrameRef.current) return;
      const frozen = Date.now() - lastFrameTsRef.current > STALL_THRESHOLD_MS;
      if (frozen && !reconnectingRef.current) {
        setStalled(true);
        reconnectingRef.current = true;
        setConnState("reconnecting");
        scheduleReconnect();
      } else if (!frozen && stalled) {
        setStalled(false);
      }
    }, 2000);

    return () => {
      cancelled = true;
      if (stallTimerRef.current) clearInterval(stallTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stop session on unmount
  useEffect(
    () => () => {
      if (isLiveRef.current) handleStop();
    },
    [handleStop],
  );

  const reconnecting = connState === "reconnecting";
  const processedOverlay = reconnecting ? (
    <div className="space-y-1">
      <p className="text-sm font-medium text-gray-200">
        {stalled ? "Output stalled — reconnecting…" : "Reconnecting…"}
      </p>
      <p className="text-xs text-gray-500">
        Restoring the live GPU stream
      </p>
    </div>
  ) : undefined;

  return (
    <ErrorBoundary>
      <div className="mx-auto max-w-7xl space-y-4 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold text-white">
              <Camera className="h-5 w-5 text-red-400" />
              Deep Live Cam
              {isLive && (
                <span className="flex items-center gap-1.5 rounded-full bg-red-500/10 border border-red-500/20 px-2.5 py-1 text-xs font-bold text-red-400">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" />
                  LIVE
                </span>
              )}
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Real-time avatar reenactment · Voice changer · Recording
            </p>
          </div>
        </div>

        {/* Legal notice banner */}
        <div className="flex items-center gap-3 rounded-xl border border-yellow-500/20 bg-yellow-500/5 px-4 py-3">
          <ShieldAlert className="h-4 w-4 text-yellow-400 flex-shrink-0" />
          <p className="text-xs text-yellow-400/80">
            <strong>Legal reminder:</strong> Only use with faces you have
            explicit consent to swap. Non-consensual deepfakes are illegal and
            prohibited. Your session is logged.
          </p>
        </div>

        {/* LEFT: original · CENTER: compact controls · RIGHT: processed */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_minmax(280px,360px)_1fr]">
          <VideoStage
            videoRef={localVideoRef}
            label="You (Original)"
            variant="original"
            isLive={isLive}
            isCameraOn={isCameraOn}
          />

          {/* Compact center control stack */}
          <div className="space-y-3">
            <SessionControls
              isLive={isLive}
              isMuted={isMuted}
              isCameraOn={isCameraOn}
              isRecording={isRecording}
              hasRecording={hasRecording}
              onStart={handleStart}
              onStop={handleStop}
              onToggleMute={toggleMute}
              onToggleCamera={toggleCamera}
              onStartRecording={startRecording}
              onStopRecording={stopRecording}
              onDownloadRecording={downloadRecording}
              loading={loading}
            />

            <CreditMeter
              creditsUsed={creditsUsed}
              creditsRemaining={creditsRemaining}
              secondsElapsed={secondsElapsed}
              isRunning={isLive}
            />

            <AvatarControls
              value={avatar}
              onChange={handleAvatarChange}
            />

            <VoiceSelector
              selected={voiceMode}
              onChange={handleVoiceChange}
              disabled={!isLive}
            />

            <BackgroundControls
              value={background}
              onChange={handleBackgroundChange}
            />

            {/* Session info */}
            {isLive && (
              <div className="glass rounded-xl border border-white/5 p-4 space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                  Session Info
                </h3>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Session ID</span>
                    <span className="font-mono text-gray-400">
                      {sessionId?.slice(0, 8)}…
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Status</span>
                    <span
                      className={
                        reconnecting ? "text-yellow-400" : "text-brand-400"
                      }
                    >
                      {reconnecting ? "Reconnecting" : "Connected"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Rate</span>
                    <span className="text-brand-400">0.2 cr/sec</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Voice</span>
                    <span className="text-gray-300">{voiceMode}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <VideoStage
            videoRef={processedVideoRef}
            label="Processed GPU Output"
            variant="processed"
            isLive={isLive}
            isCameraOn={isCameraOn}
            statusOverlay={processedOverlay}
            pipelineState={pipelineState}
            avatarPreviewUrl={avatar.avatarUrl}
          />
        </div>
      </div>
    </ErrorBoundary>
  );
}
