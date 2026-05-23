# coding: utf-8
"""
LivePortrait Engine — Production Real-Time Stable Version
(FIXED + warmup + process compatibility)
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
    x_s: Any
    f_s: Any
    x_c_s: Any


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

            cls._instance._torch = None
            cls._instance._np = None
            cls._instance._cv2 = None

            cls._instance._cache = LRU(8)
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

        except Exception as e:
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

        except Exception as e:
            return self._fail(f"import-failed: {e}")

        # ----------------------------------------------------
        # BUILD PIPELINE
        # ----------------------------------------------------

        try:
            self._pipeline = LivePortraitPipeline(
                inference_cfg=InferenceConfig(), crop_cfg=CropConfig()
            )

            self._wrapper = self._pipeline.live_portrait_wrapper

            if self._wrapper is None:
                return self._fail("wrapper-missing")

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
            half_precision=False,
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
    ):
        """
        Compatibility wrapper for avatar_reenact route.
        """
        return self.drive(avatar_url, frame)

    # ========================================================
    # MAIN INFERENCE
    # ========================================================

    def drive(self, avatar_url: str, frame_b64: str):

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

            start = time.time()

            output = self._run(source, frame)

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
    # CORE LIVEPORTRAIT RUN
    # ========================================================

    def _run(self, src: SourcePack, frame):

        torch = self._torch

        try:
            with torch.no_grad():

                x_d = self._wrapper.prepare_source(frame)

                kp = self._wrapper.get_kp_info(x_d)

                x_d_new = self._wrapper.transform_keypoint(kp)

                out = self._wrapper.warp_decode(src.f_s, src.x_c_s, x_d_new)

            if isinstance(out, dict):
                out = out.get("out")

            return self._to_rgb(out)

        except Exception:
            logger.exception("[LivePortrait] _run failed")
            return None

    # ========================================================
    # SOURCE CACHE
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
            with self._torch.no_grad():

                x_s = wrapper.prepare_source(image)

                f_s = wrapper.extract_feature_3d(x_s)

                kp = wrapper.get_kp_info(x_s)

                x_c_s = wrapper.transform_keypoint(kp)

            pack = SourcePack(x_s=x_s, f_s=f_s, x_c_s=x_c_s)

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
        Convert LivePortrait tensor output into HWC uint8 RGB image.
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

        # normalize
        if x.max() <= 1.0:
            x = x * 255.0

        x = np.clip(x, 0, 255).astype(np.uint8)

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
