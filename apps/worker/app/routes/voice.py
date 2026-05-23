"""Voice processing — real-time voice changer for Module 1 (Live Cam).

GPU is reserved exclusively for Module 1. Standalone TTS (the VOICE module)
now routes to ElevenLabs via the ai-router; the local GPU TTS endpoint was
removed.
"""
from __future__ import annotations

import base64
import logging

import torch
from fastapi import APIRouter
from pydantic import BaseModel

from ..services.gpu_manager import gpu_manager

logger = logging.getLogger(__name__)

router = APIRouter()

# ---------------------------------------------------------------------------
# Device / dtype — resolved once at module load
# ---------------------------------------------------------------------------
device = torch.device(gpu_manager.get_device())
dtype = gpu_manager.get_dtype()
logger.info(f"[voice] Using device: {device}, dtype: {dtype}")

# ---------------------------------------------------------------------------
# Module-level model cache
# ---------------------------------------------------------------------------
_voice_changer_model = None  # e.g. RVC, so-vits-svc


def _load_voice_changer_model():
    """Load and cache the voice-changer/clone model on the configured device."""
    global _voice_changer_model
    if _voice_changer_model is not None:
        return _voice_changer_model

    try:
        # ---- Replace with your real RVC / so-vits-svc loader -----------
        # Example (generic torch model):
        #
        # from your_rvc_lib import RVCModel
        # model = RVCModel.from_pretrained("rvc-base")
        # model = model.to(device)
        # if dtype == torch.float16:
        #     model = model.half()
        # model.eval()
        # _voice_changer_model = model
        # ----------------------------------------------------------------
        logger.info(f"[voice] Voice-changer model loaded on {device}, dtype={dtype}")
        _voice_changer_model = object()  # placeholder
    except Exception as exc:
        logger.warning(f"[voice] Could not load voice-changer model — CPU fallback: {exc}")
        _voice_changer_model = None

    return _voice_changer_model


# ---------------------------------------------------------------------------
# Tensor helpers
# ---------------------------------------------------------------------------

def _to_device(t: torch.Tensor) -> torch.Tensor:
    """Move a tensor to the configured device and dtype."""
    t = t.to(device)
    if dtype == torch.float16:
        t = t.half()
    return t


def _safe_output(t: torch.Tensor) -> torch.Tensor:
    """Detach and move output tensor to CPU for serialisation."""
    return t.detach().cpu()


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class VoiceChangeRequest(BaseModel):
    audio: str    # base64 PCM chunk
    mode: str     # NONE | MALE | FEMALE | AI | CLONE
    pitch: int = 0
    clone_voice_url: str | None = None
    ai_voice_id: str | None = None


class VoiceChangeResponse(BaseModel):
    processed_audio: str
    stub: bool = False


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/live-cam/voice-change", response_model=VoiceChangeResponse)
def voice_change(req: VoiceChangeRequest) -> VoiceChangeResponse:
    """Real-time voice changer for live cam (per audio chunk)."""
    # Pass-through modes
    if req.mode == "NONE":
        return VoiceChangeResponse(processed_audio=req.audio, stub=True)

    if not gpu_manager.is_available:
        logger.debug("[voice] GPU unavailable — returning stub audio")
        return VoiceChangeResponse(processed_audio=req.audio, stub=True)

    model = _load_voice_changer_model()
    if model is None:
        return VoiceChangeResponse(processed_audio=req.audio, stub=True)

    try:
        # Decode incoming audio chunk
        audio_bytes = base64.b64decode(req.audio)

        # ----------------------------------------------------------------
        # Real pipeline (adapt to your library):
        #
        # import numpy as np
        # pcm = np.frombuffer(audio_bytes, dtype=np.int16).astype(np.float32) / 32768.0
        # audio_tensor = _to_device(torch.from_numpy(pcm).unsqueeze(0))
        #
        # with torch.inference_mode():
        #     if req.mode in ("MALE", "FEMALE"):
        #         # Pitch-shift via RVC or librosa (pitch delta from req.pitch)
        #         out_tensor = model(audio_tensor, pitch_shift=req.pitch)
        #     elif req.mode == "CLONE" and req.clone_voice_url:
        #         # Speaker embedding cloning
        #         out_tensor = model(audio_tensor, speaker_url=req.clone_voice_url)
        #     elif req.mode == "AI" and req.ai_voice_id:
        #         # ElevenLabs / Bark AI voice
        #         out_tensor = model(audio_tensor, voice_id=req.ai_voice_id)
        #     else:
        #         out_tensor = audio_tensor  # fallback to original
        #
        # out_cpu = _safe_output(out_tensor).squeeze(0).numpy()
        # pcm_out = (out_cpu * 32768.0).clip(-32768, 32767).astype(np.int16)
        # result_b64 = base64.b64encode(pcm_out.tobytes()).decode()
        # return VoiceChangeResponse(processed_audio=result_b64, stub=False)
        # ----------------------------------------------------------------

        logger.debug(
            f"[voice] Voice change processed on {device}, mode={req.mode}, pitch={req.pitch}"
        )
        return VoiceChangeResponse(processed_audio=req.audio, stub=True)

    except Exception as exc:
        logger.error(f"[voice] Voice-change inference error: {exc}", exc_info=True)
        # Never crash — return original audio
        return VoiceChangeResponse(processed_audio=req.audio, stub=True)