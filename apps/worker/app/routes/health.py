"""Health check endpoints."""
from fastapi import APIRouter

from ..services.gpu_manager import gpu_manager

router = APIRouter()


@router.get("/health")
def health() -> dict:
    """Health check — returns GPU + avatar-engine availability.

    `gpu_available` is the hardware signal used by the AI router's GPU ping.
    `avatar_available` is the LivePortrait engine signal used by the WebRTC
    proxy's avatar `isReady()` check. The engine is imported lazily so a
    misconfigured engine module never breaks this diagnostic endpoint.
    """
    info = gpu_manager.info

    avatar_available: bool = False
    avatar_reason: str | None = "engine-not-loaded"
    try:
        from ..services.liveportrait_engine import engine
        avatar_available = bool(engine.ready)
        avatar_reason = None if engine.ready else engine.info.not_ready_reason
    except Exception as exc:  # pragma: no cover — diagnostic must never 500
        avatar_reason = f"engine-import-failed: {exc}"

    return {
        "status": "ok",
        "service": "AiCruzz Worker",
        "version": "1.0.0",
        "gpu_available": info.available,
        "gpu_name": info.device_name,
        "gpu_count": info.device_count,
        "fp16_supported": info.fp16_supported,
        "backend": info.backend,
        "avatar_available": avatar_available,
        "avatar_reason": avatar_reason,
    }
