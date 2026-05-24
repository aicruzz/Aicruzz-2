"""Live Cam avatar reenactment endpoint.

POST /live-cam/avatar-reenact

Request:
  { frame: str(b64), avatar_url: str, session_id?: str, client_ts?: int(ms),
    background_url?: str, enhance_face?: bool, face_blend?: float }

Response (always 200; discriminated union):
  processed=true  → { processed: true, imageBase64, processed_frame, latencyMs }
  processed=false → { processed: false, reason: "<code>", latencyMs }

Real inference is provided by ``LivePortraitEngine`` — see
``apps/worker/AVATAR_SETUP.md`` for installation. If the engine is not
ready (deps / weights / env missing), this route returns honest standby
with a structured reason; it never echoes the raw frame back.

Backpressure: only one frame inflight per session_id. A second frame
arriving while the first is still running is dropped with
``reason: "dropped-backpressure"`` — the client always sends the freshest
frame next tick, so dropping is the right strategy for realtime.
"""
from __future__ import annotations

import asyncio
import logging
import time

from fastapi import APIRouter
from pydantic import BaseModel

from ..services.liveportrait_engine import engine

logger = logging.getLogger(__name__)
router = APIRouter()


# ---------------------------------------------------------------------------
# Per-session inflight gating + stale-frame drop
# ---------------------------------------------------------------------------

# Sessions currently running inference. Acquired under _inflight_lock so the
# check-and-add is atomic; cleared in finally.
_inflight: set[str] = set()
_inflight_lock = asyncio.Lock()

# Drop frames whose client timestamp is older than this — by the time we'd
# render them they'd be ancient.
STALE_FRAME_MS = 500

# Diagnostic counters (per session_id), emitted by the webrtc proxy already
# but useful here for OOM/drop attribution.
_dropped_backpressure = 0
_dropped_stale = 0
_dropped_throttle = 0

# First-frame deep trace: emit a stage-by-stage log the FIRST time each
# session is seen, then go silent so steady-state inference at 14fps doesn't
# flood the log. Bounded to keep long-lived processes safe.
_first_frame_seen: set[str] = set()
_FIRST_FRAME_CAP = 512


def _trace_first_frame(sid: str, stage: str, **kw: object) -> None:
    """Log one stage if we haven't already finished tracing this session."""
    if sid in _first_frame_seen:
        return
    extras = " ".join(f"{k}={v}" for k, v in kw.items())
    logger.info("[avatar_reenact] FIRST-FRAME sid=%s stage=%s %s", sid, stage, extras)


# Public failure taxonomy. Any internal reason not in this set is collapsed
# to ``inference-failed`` so the frontend's switch statement stays exhaustive.
_VALID_REASONS = {
    "model-not-loaded",
    "weights-missing",
    "gpu-unavailable",
    "gpu-oom",
    "inference-failed",
    "avatar-fetch-failed",
    "stale-frame",
    "dropped-backpressure",
}


def _normalize(reason: str | None) -> str:
    if reason and reason in _VALID_REASONS:
        return reason
    return "inference-failed"


class AvatarReenactRequest(BaseModel):
    frame: str
    avatar_url: str
    session_id: str | None = None
    client_ts: int | None = None
    background_url: str | None = None
    enhance_face: bool = True
    face_blend: float = 1.0


class AvatarReenactResponse(BaseModel):
    processed: bool = False
    # Both keys carry the same JPEG base64 — `imageBase64` is the contract
    # the latest TS provider reads; `processed_frame` keeps backward
    # compatibility with any older proxy.
    imageBase64: str | None = None
    processed_frame: str | None = None
    reason: str | None = None
    latencyMs: float | None = None


def _ok(b64: str, latency_ms: float) -> AvatarReenactResponse:
    return AvatarReenactResponse(
        processed=True,
        imageBase64=b64,
        processed_frame=b64,
        latencyMs=round(latency_ms, 1),
    )


def _bad(reason: str | None, latency_ms: float = 0.0) -> AvatarReenactResponse:
    return AvatarReenactResponse(
        processed=False,
        reason=_normalize(reason),
        latencyMs=round(latency_ms, 1) if latency_ms else None,
    )


@router.post("/live-cam/avatar-reenact", response_model=AvatarReenactResponse)
async def avatar_reenact(req: AvatarReenactRequest) -> AvatarReenactResponse:
    global _dropped_backpressure, _dropped_stale

    sid = req.session_id or "_anon"

    # 1. Engine readiness — never block, never echo. Surfaces the precise
    #    not_ready_reason so the webrtc layer can log it once.
    if not engine.ready:
        reason = engine.info.not_ready_reason or "model-not-loaded"
        _trace_first_frame(sid, "ENGINE_NOT_READY", reason=reason)
        _finalize_first_frame(sid)
        return _bad(reason)

    if not req.avatar_url:
        _trace_first_frame(sid, "BAD_REQUEST", reason="no-avatar")
        _finalize_first_frame(sid)
        return _bad("avatar-fetch-failed")
    if not req.frame:
        _trace_first_frame(sid, "BAD_REQUEST", reason="no-frame")
        _finalize_first_frame(sid)
        return _bad("inference-failed")

    _trace_first_frame(
        sid,
        "FRAME_RECEIVED",
        frame_bytes=len(req.frame),
        avatar_url_set=bool(req.avatar_url),
        client_ts=req.client_ts or 0,
    )

    # 2. Stale-frame drop — discards frames the client already lapped.
    if req.client_ts:
        age_ms = max(0, int(time.time() * 1000) - int(req.client_ts))
        if age_ms > STALE_FRAME_MS:
            _dropped_stale += 1
            _trace_first_frame(sid, "STALE_CHECK_DROP", age_ms=age_ms)
            _finalize_first_frame(sid)
            return _bad("stale-frame")
        _trace_first_frame(sid, "STALE_CHECK_PASS", age_ms=age_ms)

    # 3. Single-flight per session — drop overlapping frames.
    async with _inflight_lock:
        if sid in _inflight:
            _dropped_backpressure += 1
            _trace_first_frame(sid, "INFLIGHT_REJECT")
            _finalize_first_frame(sid)
            return _bad("dropped-backpressure")
        _inflight.add(sid)
    _trace_first_frame(sid, "INFLIGHT_ACQUIRED")

    t_request = time.perf_counter()
    try:
        # 4. Run inference off the event loop so other endpoints stay
        #    responsive while the GPU is busy.
        _trace_first_frame(sid, "INFERENCE_START")

        def run_inference():
            return engine.process(
                avatar_url=req.avatar_url,
                frame=req.frame,
            )

        out_b64, latency_ms, reason = await asyncio.to_thread(run_inference)
        _trace_first_frame(
            sid,
            "INFERENCE_DONE",
            latency_ms=round(latency_ms, 1),
            reason=reason or "ok",
        )

        if reason is not None or out_b64 is None:
            _trace_first_frame(sid, "RESPONSE_EMITTED", processed=False, reason=_normalize(reason))
            _finalize_first_frame(sid)
            return _bad(reason, latency_ms)

        wall_ms = (time.perf_counter() - t_request) * 1000
        logger.debug(
            "[avatar_reenact] sid=%s ok latency=%.1fms wall=%.1fms",
            sid, latency_ms, wall_ms,
        )
        _trace_first_frame(
            sid, "RESPONSE_EMITTED",
            processed=True,
            latency_ms=round(latency_ms, 1),
            wall_ms=round(wall_ms, 1),
        )
        _finalize_first_frame(sid)
        return _ok(out_b64, latency_ms)
    finally:
        async with _inflight_lock:
            _inflight.discard(sid)


def _finalize_first_frame(sid: str) -> None:
    """Add session to traced set after RESPONSE_EMITTED. Bounded eviction
    keeps a long-lived process from leaking memory."""
    if sid in _first_frame_seen:
        return
    if len(_first_frame_seen) >= _FIRST_FRAME_CAP:
        # Drop one arbitrary entry; we only need to keep the set bounded.
        _first_frame_seen.pop()
    _first_frame_seen.add(sid)


@router.get("/live-cam/avatar-reenact/stats")
async def avatar_reenact_stats() -> dict:
    """Diagnostic — lightweight counters since process start."""
    return {
        "engine_ready": engine.ready,
        "device": engine.info.device,
        "backend": engine.info.backend,
        "half_precision": engine.info.half_precision,
        "model": engine.info.model,
        "not_ready_reason": engine.info.not_ready_reason,
        "inflight_sessions": len(_inflight),
        "dropped_backpressure": _dropped_backpressure,
        "dropped_stale": _dropped_stale,
        "dropped_throttle": _dropped_throttle,
        "first_frames_traced": len(_first_frame_seen),
    }
