"""Health check endpoints."""
from fastapi import APIRouter

from ..services.gpu_manager import gpu_manager

router = APIRouter()


@router.get("/health")
def health() -> dict:
    """Health check — returns GPU availability for the AI router."""
    info = gpu_manager.info
    return {
        "status": "ok",
        "service": "AiCruzz Worker",
        "version": "1.0.0",
        "gpu_available": info.available,
        "gpu_name": info.device_name,
        "gpu_count": info.device_count,
        "fp16_supported": info.fp16_supported,
        "backend": info.backend,
    }
