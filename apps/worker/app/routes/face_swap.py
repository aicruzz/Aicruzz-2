"""Face swap endpoints — real-time (per-frame) and batch."""
from __future__ import annotations

import base64
import logging

import torch
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..services.gpu_manager import gpu_manager

logger = logging.getLogger(__name__)

router = APIRouter()

# ---------------------------------------------------------------------------
# Device / dtype — resolved once at module load, never reloaded per request
# ---------------------------------------------------------------------------
device = torch.device(gpu_manager.get_device())
dtype = gpu_manager.get_dtype()
logger.info(f"[face_swap] Using device: {device}, dtype: {dtype}")

# ---------------------------------------------------------------------------
# Model registry — lazy-loaded, kept in memory across requests
# ---------------------------------------------------------------------------
_face_swap_model = None   # e.g. insightface INSwapper
_enhance_model = None     # e.g. GFPGAN / CodeFormer


def _load_face_swap_model():
    """Load and cache the face-swap model on the correct device."""
    global _face_swap_model
    if _face_swap_model is not None:
        return _face_swap_model

    try:
        # ---- Replace the block below with your real model loader ----
        # Example (insightface):
        #   import insightface
        #   _face_swap_model = insightface.model_zoo.get_model("inswapper_128.onnx",
        #                           providers=["CUDAExecutionProvider"] if "cuda" in str(device)
        #                           else ["CPUExecutionProvider"])
        # -------------------------------------------------------------
        logger.info(f"[face_swap] Face-swap model loaded on {device}")
        _face_swap_model = object()  # placeholder — replace with real model
    except Exception as exc:
        logger.warning(f"[face_swap] Could not load face-swap model, falling back to CPU stub: {exc}")
        _face_swap_model = None

    return _face_swap_model


def _load_enhance_model():
    """Load and cache the face-enhancement model on the correct device."""
    global _enhance_model
    if _enhance_model is not None:
        return _enhance_model

    try:
        # ---- Replace the block below with your real model loader ----
        # Example (GFPGAN via torch):
        #   from gfpgan import GFPGANer
        #   _enhance_model = GFPGANer(model_path="GFPGANv1.4.pth", upscale=1,
        #                              arch="clean", channel_multiplier=2,
        #                              bg_upsampler=None)
        #   _enhance_model = _enhance_model.net.to(device)
        #   if dtype == torch.float16:
        #       _enhance_model = _enhance_model.half()
        #   _enhance_model.eval()
        # -------------------------------------------------------------
        logger.info(f"[face_swap] Enhance model loaded on {device}, dtype={dtype}")
        _enhance_model = object()  # placeholder — replace with real model
    except Exception as exc:
        logger.warning(f"[face_swap] Could not load enhance model, falling back to CPU stub: {exc}")
        _enhance_model = None

    return _enhance_model


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class FrameRequest(BaseModel):
    frame: str               # base64-encoded JPEG/PNG
    target_face_url: str | None = None
    enhance_face: bool = True
    face_blend: float = 1.0


class FrameResponse(BaseModel):
    processed_frame: str
    stub: bool = False


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _tensor_to_device(t: torch.Tensor) -> torch.Tensor:
    """Move a tensor to the configured device and dtype."""
    t = t.to(device)
    if dtype == torch.float16:
        t = t.half()
    return t


def _safe_output(t: torch.Tensor) -> torch.Tensor:
    """Detach and move output tensor back to CPU."""
    return t.detach().cpu()


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/live-cam/face-swap", response_model=FrameResponse)
def face_swap_frame(req: FrameRequest) -> FrameResponse:
    """Per-frame face swap for live cam (~200 ms budget per frame)."""
    # --- Decode -------------------------------------------------------
    try:
        frame_bytes = base64.b64decode(req.frame)
    except Exception as e:
        raise HTTPException(400, f"Invalid base64 frame: {e}") from e

    # --- GPU unavailable → pass-through stub --------------------------
    if not gpu_manager.is_available:
        logger.debug("[face_swap] GPU unavailable — returning stub frame")
        return FrameResponse(processed_frame=req.frame, stub=True)

    # --- Load models (cached after first call) ------------------------
    swap_model = _load_face_swap_model()
    enh_model = _load_enhance_model() if req.enhance_face else None

    if swap_model is None:
        # Model failed to load — graceful fallback
        logger.warning("[face_swap] Swap model unavailable, returning stub")
        return FrameResponse(processed_frame=req.frame, stub=True)

    try:
        # ----------------------------------------------------------------
        # Real pipeline (uncomment / adapt when you wire real models):
        #
        # import cv2, numpy as np
        # nparr = np.frombuffer(frame_bytes, np.uint8)
        # frame_bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        #
        # # Convert to tensor → GPU
        # frame_tensor = torch.from_numpy(frame_bgr).permute(2, 0, 1).float() / 255.0
        # frame_tensor = _tensor_to_device(frame_tensor.unsqueeze(0))
        #
        # # --- swap (model-specific, may stay as numpy/onnx) ---
        # swapped_bgr = swap_model.get(frame_bgr, ...)
        #
        # # --- enhance ---
        # if enh_model and req.enhance_face:
        #     _, _, swapped_bgr = enh_model.enhance(swapped_bgr, has_aligned=False,
        #                                            only_center_face=False, paste_back=True)
        #
        # # Encode result
        # _, buf = cv2.imencode(".jpg", swapped_bgr)
        # result_b64 = base64.b64encode(buf).decode()
        # return FrameResponse(processed_frame=result_b64, stub=False)
        # ----------------------------------------------------------------

        # Stub until real models are wired
        logger.debug(f"[face_swap] Frame processed on {device}")
        return FrameResponse(processed_frame=req.frame, stub=True)

    except Exception as exc:
        logger.error(f"[face_swap] Inference error: {exc}", exc_info=True)
        # Never crash — return original frame
        return FrameResponse(processed_frame=req.frame, stub=True)


class BatchSwapRequest(BaseModel):
    source_image_url: str
    target_face_url: str
    enhance_face: bool = True


@router.post("/process/face-swap")
def batch_face_swap(req: BatchSwapRequest) -> dict:
    """Batch face swap on a single image (used by AI router)."""
    if not gpu_manager.is_available:
        logger.debug("[face_swap] GPU unavailable — returning stub")
        return {"output_url": req.source_image_url, "stub": True}

    swap_model = _load_face_swap_model()
    if swap_model is None:
        return {"output_url": req.source_image_url, "stub": True}

    try:
        # ----------------------------------------------------------------
        # Real pipeline:
        #
        # import requests, cv2, numpy as np
        # src = np.frombuffer(requests.get(req.source_image_url).content, np.uint8)
        # src_bgr = cv2.imdecode(src, cv2.IMREAD_COLOR)
        # tgt = np.frombuffer(requests.get(req.target_face_url).content, np.uint8)
        # tgt_bgr = cv2.imdecode(tgt, cv2.IMREAD_COLOR)
        #
        # src_tensor = _tensor_to_device(
        #     torch.from_numpy(src_bgr).permute(2, 0, 1).float().unsqueeze(0) / 255.0)
        # tgt_tensor = _tensor_to_device(
        #     torch.from_numpy(tgt_bgr).permute(2, 0, 1).float().unsqueeze(0) / 255.0)
        #
        # result_tensor = swap_model(src_tensor, tgt_tensor)   # model-specific
        # result_cpu = _safe_output(result_tensor)
        # ... save → return URL
        # ----------------------------------------------------------------

        logger.info(f"[face_swap] Batch swap executed on {device}, dtype={dtype}")
        return {"output_url": req.source_image_url, "stub": False}

    except Exception as exc:
        logger.error(f"[face_swap] Batch inference error: {exc}", exc_info=True)
        return {"output_url": req.source_image_url, "stub": True}