# coding: utf-8
"""
LivePortrait Engine — Production Real-Time Stable Version

Full-parity inference path:
  * face crop + alignment (source and driving)
  * relative-motion driving with a per-session neutral reference (x_d_0)
  * stitching
  * EMA temporal smoothing
  * paste-back compositing into the source avatar frame (background preserved)

The whole-frame / absolute-pose / raw-tile path that caused background
scatter, identity deformation and jitter has been removed.
"""

from __future__ import annotations

import os
import sys
import time
import base64
import logging
import urllib.request
import threading

from dataclasses import dataclass
from collections import OrderedDict
from typing import Any, Optional

logger = logging.getLogger(__name__)


# ============================================================
# PATHS
# ============================================================

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

LIVEPORTRAIT_PATH = os.environ.get(
    "LIVEPORTRAIT_PATH", os.path.expanduser("~/LivePortrait")
)

LIVEPORTRAIT_MODELS_DIR = os.path.join(LIVEPORTRAIT_PATH, "pretrained_weights")


# ============================================================
# TUNABLES
# ============================================================

# EMA smoothing factor for driving keypoints. Higher = more responsive,
# lower = smoother (less jitter). 0.5 is a good real-time default.
EMA_ALPHA = float(os.environ.get("LIVEPORTRAIT_EMA_ALPHA", "0.5"))

# Bounded per-session driving state (neutral reference + EMA history).
SESSION_CAP = 64


# ============================================================
# ENGINE INFO
# ============================================================


@dataclass
class EngineInfo:
    ready: bool
    device: str
    backend: str
    model: str
    half_precision: bool = False
    not_ready_reason: Optional[str] = None


@dataclass
class SourcePack:
    """Everything computed once per avatar for relative driving + paste-back."""

    f_s: Any                 # 3D appearance feature
    x_s: Any                 # posed source keypoints (kp_source for warp_decode)
    x_s_info: Any            # full source kp info: kp (canonical), exp, scale, t, R
    R_s: Any                 # source rotation matrix
    crop_M_c2o: Any          # crop -> original affine (paste-back)
    mask_ori: Any            # blend mask sized to the original avatar frame
    src_img: Any             # original avatar RGB image (paste-back canvas)


@dataclass
class DriveState:
    """Per-session driving baseline + EMA history."""

    x_d_0_info: Any = None   # neutral first-frame driving kp_info
    R_d_0: Any = None        # neutral first-frame rotation
    x_d_prev: Any = None     # last smoothed x_d_new (EMA history)


# ============================================================
# SIMPLE LRU CACHE
# ============================================================


class LRU:
    def __init__(self, cap: int = 8):
        self.cap = cap
        self.data = OrderedDict()

    def get(self, key):
        if key not in self.data:
            return None

        self.data.move_to_end(key)
        return self.data[key]

    def put(self, key, value):
        self.data[key] = value
        self.data.move_to_end(key)

        if len(self.data) > self.cap:
            self.data.popitem(last=False)


# ============================================================
# LIVEPORTRAIT ENGINE
# ============================================================


class LivePortraitEngine:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)

            cls._instance.info = EngineInfo(
                ready=False,
                device="cpu",
                backend="cpu",
                model="stub",
                not_ready_reason="not_initialized",
            )

            cls._instance._pipeline = None
            cls._instance._wrapper = None
            cls._instance._cropper = None
            cls._instance._crop_cfg = None
            cls._instance._inference_cfg = None

            # Free functions pulled from the LivePortrait library at init —
            # these live in src.utils.*, NOT on the wrapper. The `_fn` suffix
            # avoids colliding with the `_paste_back` compositing method.
            cls._instance._get_rotation_matrix_fn = None
            cls._instance._prepare_paste_back_fn = None
            cls._instance._paste_back_fn = None

            cls._instance._torch = None
            cls._instance._np = None
            cls._instance._cv2 = None

            cls._instance._cache = LRU(8)
            cls._instance._sessions = LRU(SESSION_CAP)
            cls._instance._lock = threading.Lock()

        return cls._instance

    # ========================================================
    # WARMUP
    # ========================================================

    def warmup(self) -> bool:
        """
        FastAPI startup hook.
        """

        try:
            info = self.initialize()
            return bool(info and info.ready)

        except Exception:
            logger.exception("[LivePortrait] warmup failed")
            return False

    # ========================================================
    # COMPATIBILITY PROPERTIES
    # ========================================================

    @property
    def ready(self) -> bool:
        return self.info.ready

    @property
    def device(self) -> str:
        return self.info.device

    @property
    def model(self) -> str:
        return self.info.model

    @property
    def half_precision(self) -> bool:
        return self.info.half_precision

    # ========================================================
    # INIT
    # ========================================================

    def initialize(self) -> EngineInfo:

        if self.info.ready:
            return self.info

        logger.info("[LivePortrait] initializing...")

        # ----------------------------------------------------
        # IMPORT DEPS
        # ----------------------------------------------------

        try:
            import numpy as np
            import torch
            import cv2

            self._np = np
            self._torch = torch
            self._cv2 = cv2

        except Exception as e:
            return self._fail(f"missing-deps: {e}")

        # ----------------------------------------------------
        # VALIDATE PATHS
        # ----------------------------------------------------

        if not os.path.isdir(LIVEPORTRAIT_PATH):
            return self._fail(f"bad LIVEPORTRAIT_PATH: {LIVEPORTRAIT_PATH}")

        if not os.path.isdir(LIVEPORTRAIT_MODELS_DIR):
            return self._fail(f"missing weights: {LIVEPORTRAIT_MODELS_DIR}")

        if LIVEPORTRAIT_PATH not in sys.path:
            sys.path.insert(0, LIVEPORTRAIT_PATH)

        # ----------------------------------------------------
        # IMPORT LIVEPORTRAIT
        # ----------------------------------------------------

        try:
            from src.live_portrait_pipeline import LivePortraitPipeline
            from src.config.inference_config import InferenceConfig
            from src.config.crop_config import CropConfig

            # Rotation + paste-back are module-level helpers in LivePortrait,
            # not methods on the wrapper.
            from src.utils.camera import get_rotation_matrix
            from src.utils.crop import prepare_paste_back, paste_back

        except Exception as e:
            return self._fail(f"import-failed: {e}")

        # ----------------------------------------------------
        # BUILD PIPELINE
        # ----------------------------------------------------

        try:
            inference_cfg = InferenceConfig()
            crop_cfg = CropConfig()

            self._pipeline = LivePortraitPipeline(
                inference_cfg=inference_cfg, crop_cfg=crop_cfg
            )

            self._wrapper = self._pipeline.live_portrait_wrapper
            self._cropper = getattr(self._pipeline, "cropper", None)
            self._inference_cfg = inference_cfg
            self._crop_cfg = crop_cfg

            self._get_rotation_matrix_fn = get_rotation_matrix
            self._prepare_paste_back_fn = prepare_paste_back
            self._paste_back_fn = paste_back

            if self._wrapper is None:
                return self._fail("wrapper-missing")

            if self._cropper is None:
                return self._fail("cropper-missing")

        except Exception as e:
            return self._fail(f"pipeline-failed: {e}")

        # ----------------------------------------------------
        # READY
        # ----------------------------------------------------

        use_cuda = self._torch.cuda.is_available()

        self.info = EngineInfo(
            ready=True,
            device="cuda" if use_cuda else "cpu",
            backend="cuda" if use_cuda else "cpu",
            model="liveportrait",
            half_precision=bool(getattr(inference_cfg, "flag_use_half_precision", False)),
            not_ready_reason=None,
        )

        logger.info(f"[LivePortrait] READY on {self.info.device}")

        return self.info

    # ========================================================
    # PROCESS (ROUTE COMPATIBILITY)
    # ========================================================

    def process(
        self,
        avatar_url: str,
        frame: str,
        session_id: Optional[str] = None,
    ):
        """
        Compatibility wrapper for avatar_reenact route.
        """
        return self.drive(avatar_url, frame, session_id)

    # ========================================================
    # MAIN INFERENCE
    # ========================================================

    def drive(self, avatar_url: str, frame_b64: str, session_id: Optional[str] = None):

        if not self.info.ready:
            return None, 0, self.info.not_ready_reason

        if not self._lock.acquire(timeout=1.0):
            return None, 0, "busy"

        try:
            source = self._get_source(avatar_url)

            if source is None:
                return None, 0, "bad-avatar"

            frame = self._decode(frame_b64)

            if frame is None:
                return None, 0, "bad-frame"

            state = self._get_session(session_id or "_anon")

            start = time.time()

            output = self._run(source, frame, state)

            latency_ms = (time.time() - start) * 1000

            if output is None:
                return None, latency_ms, "infer-failed"

            out_b64 = self._encode(output)

            return out_b64, latency_ms, None

        except Exception as e:
            logger.exception("[LivePortrait] inference failed")
            return None, 0, f"inference-error: {e}"

        finally:
            self._lock.release()

    # ========================================================
    # SESSION STATE (relative reference + EMA history)
    # ========================================================

    def _get_session(self, session_id: str) -> DriveState:
        state = self._sessions.get(session_id)

        if state is None:
            state = DriveState()
            self._sessions.put(session_id, state)

        return state

    def reset_session(self, session_id: str) -> None:
        """Drop a session's neutral reference + EMA history."""
        self._sessions.put(session_id or "_anon", DriveState())

    # ========================================================
    # CORE LIVEPORTRAIT RUN (per driving frame)
    # ========================================================

    def _run(self, src: SourcePack, frame, state: DriveState):

        torch = self._torch

        try:
            # ----- crop + align the driving face -----
            crop_d = self._crop(frame)

            if crop_d is None:
                # No detectable face this frame — standby, never echo.
                return None

            with torch.no_grad():

                I_d = self._wrapper.prepare_source(crop_d["img_crop_256x256"])

                x_d_info = self._wrapper.get_kp_info(I_d)

                R_d = self._rotation(x_d_info)

                # ----- neutral first-frame reference -----
                if state.x_d_0_info is None:
                    state.x_d_0_info = x_d_info
                    state.R_d_0 = R_d

                x_d_0_info = state.x_d_0_info
                R_d_0 = state.R_d_0

                x_s_info = src.x_s_info

                # ----- relative motion -----
                R_new = (R_d @ R_d_0.permute(0, 2, 1)) @ src.R_s

                delta_new = x_s_info["exp"] + (x_d_info["exp"] - x_d_0_info["exp"])

                scale_new = x_s_info["scale"] * (
                    x_d_info["scale"] / x_d_0_info["scale"]
                )

                t_new = x_s_info["t"] + (x_d_info["t"] - x_d_0_info["t"])
                t_new[..., 2] = 0  # zero out z translation (LivePortrait convention)

                x_c_s = x_s_info["kp"]  # canonical source keypoints

                x_d_new = scale_new * (
                    (x_c_s @ R_new) + delta_new
                ) + t_new

                # ----- stitching -----
                if getattr(self._inference_cfg, "flag_stitching", True):
                    x_d_new = self._wrapper.stitching(src.x_s, x_d_new)

                # ----- EMA temporal smoothing -----
                if state.x_d_prev is not None:
                    x_d_new = EMA_ALPHA * x_d_new + (1.0 - EMA_ALPHA) * state.x_d_prev

                state.x_d_prev = x_d_new

                # ----- warp + decode -----
                out = self._wrapper.warp_decode(src.f_s, src.x_s, x_d_new)

            if isinstance(out, dict):
                out = out.get("out", out)

            out_crop = self._to_rgb(out)

            if out_crop is None:
                return None

            # ----- paste back into the source avatar frame -----
            return self._paste_back(out_crop, src)

        except Exception:
            logger.exception("[LivePortrait] _run failed")
            return None

    # ========================================================
    # ROTATION MATRIX FROM KP INFO
    # ========================================================

    def _rotation(self, kp_info):
        """pitch/yaw/roll (already in degrees after get_kp_info) -> R."""
        return self._get_rotation_matrix_fn(
            kp_info["pitch"], kp_info["yaw"], kp_info["roll"]
        )

    # ========================================================
    # CROP + ALIGN A FACE
    # ========================================================

    def _crop(self, img_rgb):
        """Return crop_info dict (with img_crop_256x256, M_c2o) or None."""
        try:
            crop_info = self._cropper.crop_source_image(img_rgb, self._crop_cfg)

            if not crop_info or "img_crop_256x256" not in crop_info:
                return None

            return crop_info

        except Exception:
            logger.exception("[LivePortrait] crop failed")
            return None

    # ========================================================
    # PASTE BACK
    # ========================================================

    def _paste_back(self, out_crop, src: SourcePack):
        """Composite the animated 256x256 crop back into the avatar frame."""
        try:
            if src.mask_ori is None or src.crop_M_c2o is None:
                # No paste-back data — fall back to the raw crop.
                return out_crop

            return self._paste_back_fn(
                out_crop, src.crop_M_c2o, src.src_img, src.mask_ori
            )

        except Exception:
            logger.exception("[LivePortrait] paste_back failed")
            return out_crop

    # ========================================================
    # SOURCE CACHE (built once per avatar)
    # ========================================================

    def _get_source(self, url):

        cached = self._cache.get(url)

        if cached is not None:
            return cached

        image = self._fetch(url)

        if image is None:
            return None

        wrapper = self._wrapper

        try:
            crop_info = self._crop(image)

            if crop_info is None:
                logger.warning("[LivePortrait] no face in source avatar")
                return None

            with self._torch.no_grad():

                I_s = wrapper.prepare_source(crop_info["img_crop_256x256"])

                x_s_info = wrapper.get_kp_info(I_s)

                R_s = self._rotation(x_s_info)

                f_s = wrapper.extract_feature_3d(I_s)

                x_s = wrapper.transform_keypoint(x_s_info)

            # Paste-back mask sized to the original avatar frame.
            mask_ori = None
            crop_M_c2o = crop_info.get("M_c2o")

            try:
                mask_crop = getattr(self._inference_cfg, "mask_crop", None)
                if mask_crop is not None and crop_M_c2o is not None:
                    h, w = image.shape[:2]
                    mask_ori = self._prepare_paste_back_fn(
                        mask_crop, crop_M_c2o, dsize=(w, h)
                    )
            except Exception:
                logger.exception("[LivePortrait] prepare_paste_back failed")
                mask_ori = None

            pack = SourcePack(
                f_s=f_s,
                x_s=x_s,
                x_s_info=x_s_info,
                R_s=R_s,
                crop_M_c2o=crop_M_c2o,
                mask_ori=mask_ori,
                src_img=image,
            )

            self._cache.put(url, pack)

            return pack

        except Exception:
            logger.exception("[LivePortrait] source build failed")
            return None

    # ========================================================
    # FETCH IMAGE
    # ========================================================

    def _fetch(self, url):

        try:
            # HTTP URL
            if url.startswith("http"):
                data = urllib.request.urlopen(url).read()
                return self._decode_bytes(data)

            # base64 data URL
            if url.startswith("data:"):
                _, b64 = url.split(",", 1)
                return self._decode_bytes(base64.b64decode(b64))

            # local file
            image = self._cv2.imread(url)

            if image is None:
                return None

            return self._cv2.cvtColor(image, self._cv2.COLOR_BGR2RGB)

        except Exception:
            logger.exception("[LivePortrait] fetch failed")
            return None

    # ========================================================
    # DECODE BASE64 FRAME
    # ========================================================

    def _decode(self, b64):

        try:
            raw = base64.b64decode(b64)
            return self._decode_bytes(raw)

        except Exception:
            logger.exception("[LivePortrait] decode failed")
            return None

    # ========================================================
    # DECODE IMAGE BYTES
    # ========================================================

    def _decode_bytes(self, data):

        try:
            np = self._np

            arr = np.frombuffer(data, np.uint8)

            img = self._cv2.imdecode(arr, self._cv2.IMREAD_COLOR)

            if img is None:
                return None

            return self._cv2.cvtColor(img, self._cv2.COLOR_BGR2RGB)

        except Exception:
            logger.exception("[LivePortrait] decode_bytes failed")
            return None

    # ========================================================
    # ENCODE OUTPUT FRAME
    # ========================================================

    def _encode(self, img):

        try:
            bgr = self._cv2.cvtColor(img, self._cv2.COLOR_RGB2BGR)

            ok, buf = self._cv2.imencode(".jpg", bgr)

            if not ok:
                return None

            return base64.b64encode(buf).decode()

        except Exception:
            logger.exception("[LivePortrait] encode failed")
            return None

    # ========================================================
    # TORCH/NUMPY → RGB
    # ========================================================

    def _to_rgb(self, x):
        """
        Convert LivePortrait generator output (BCHW float in [0,1]) into an
        HWC uint8 RGB image. Scaling is deterministic — no content-dependent
        thresholds.
        """

        np = self._np

        if x is None:
            return None

        # dict output
        if isinstance(x, dict):
            x = x.get("out", x)

        # torch tensor
        if hasattr(x, "detach"):
            x = x.detach().float().cpu().numpy()

        # BCHW -> CHW
        if len(x.shape) == 4:
            x = x[0]

        # CHW -> HWC
        if len(x.shape) == 3 and x.shape[0] in (1, 3):
            x = np.transpose(x, (1, 2, 0))

        # generator output is float in [0, 1]
        x = np.clip(x * 255.0, 0, 255).astype(np.uint8)

        return x

    # ========================================================
    # FAIL SAFE
    # ========================================================

    def _fail(self, reason: str):

        self.info = EngineInfo(
            ready=False,
            device="cpu",
            backend="cpu",
            model="stub",
            half_precision=False,
            not_ready_reason=reason,
        )

        logger.warning(f"[LivePortrait] NOT READY: {reason}")

        return self.info


# ============================================================
# EXPORT
# ============================================================

engine = LivePortraitEngine()
