"""GPU resource manager.

Detects available GPUs, configures FP16 precision, exposes a single-job lock
so only one diffusion pipeline runs on the GPU at a time, and provides
``cleanup()`` to release VRAM between jobs.
"""
from __future__ import annotations

import gc
import logging
import threading
from contextlib import contextmanager
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class GpuInfo:
    available: bool
    device_count: int
    device_name: str
    fp16_supported: bool
    backend: str  # "cuda" | "mps" | "cpu"
    xformers_available: bool = False
    total_vram_gb: float = 0.0


class GpuManager:
    """Singleton manager for GPU lifecycle, FP16 optimization and serialization."""

    _instance: "GpuManager | None" = None
    _info: GpuInfo | None = None

    # Serializes GPU work — only one diffusion pipeline runs at a time.
    # FastAPI sync endpoints run in a thread pool, so a threading.Lock is
    # the right primitive here.
    _gpu_lock: threading.Lock = threading.Lock()

    def __new__(cls) -> "GpuManager":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    # ------------------------------------------------------------------
    # Initialization
    # ------------------------------------------------------------------
    def initialize(self) -> GpuInfo:
        """Detect GPU and configure FP16. Called once at startup."""
        if self._info is not None:
            return self._info

        try:
            import torch

            if torch.cuda.is_available():
                count = torch.cuda.device_count()
                name = torch.cuda.get_device_name(0)
                # FP16 supported on Volta (sm_70+) and later
                fp16 = torch.cuda.get_device_capability(0)[0] >= 7
                total_vram = torch.cuda.get_device_properties(0).total_memory / (1024 ** 3)
                xformers_ok = self._detect_xformers()
                self._info = GpuInfo(
                    available=True,
                    device_count=count,
                    device_name=name,
                    fp16_supported=fp16,
                    backend="cuda",
                    xformers_available=xformers_ok,
                    total_vram_gb=round(total_vram, 2),
                )
                logger.info(
                    "GPU initialized: %s (count=%d fp16=%s vram=%.1fGB xformers=%s)",
                    name, count, fp16, total_vram, xformers_ok,
                )
            elif getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
                self._info = GpuInfo(
                    available=True,
                    device_count=1,
                    device_name="Apple Silicon (MPS)",
                    fp16_supported=True,
                    backend="mps",
                )
                logger.info("GPU initialized: Apple Silicon MPS")
            else:
                self._info = GpuInfo(False, 0, "CPU", False, "cpu")
                logger.warning("No GPU available — falling back to CPU")
        except ImportError:
            self._info = GpuInfo(False, 0, "PyTorch not installed", False, "cpu")
            logger.warning("PyTorch not installed — running in stub mode")

        return self._info

    @staticmethod
    def _detect_xformers() -> bool:
        try:
            import xformers  # noqa: F401
            return True
        except ImportError:
            return False

    # ------------------------------------------------------------------
    # Properties
    # ------------------------------------------------------------------
    @property
    def info(self) -> GpuInfo:
        return self._info or self.initialize()

    @property
    def is_available(self) -> bool:
        return self.info.available

    def get_device(self) -> str:
        if self.info.backend == "cuda":
            return "cuda:0"
        if self.info.backend == "mps":
            return "mps"
        return "cpu"

    def get_dtype(self):
        try:
            import torch
            return torch.float16 if self.info.fp16_supported else torch.float32
        except ImportError:
            return None

    # ------------------------------------------------------------------
    # Concurrency + memory discipline
    # ------------------------------------------------------------------
    @contextmanager
    def acquire(self, timeout: float | None = None):
        """Block until the GPU is free, then yield. Always cleans up on exit.

        Used to enforce single-job-at-a-time semantics across the worker so
        concurrent requests queue rather than racing for VRAM.
        """
        acquired = self._gpu_lock.acquire(timeout=timeout) if timeout else self._gpu_lock.acquire()
        if not acquired:
            raise TimeoutError("Timed out waiting for GPU lock")
        try:
            yield
        finally:
            try:
                self.cleanup()
            finally:
                self._gpu_lock.release()

    def cleanup(self) -> None:
        """Release Python and CUDA caches between jobs."""
        gc.collect()
        try:
            import torch
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
                torch.cuda.ipc_collect()
        except ImportError:
            pass
        except Exception as exc:
            logger.debug("cleanup: cuda cache release failed: %s", exc)

    def vram_snapshot(self) -> dict:
        """Return current VRAM usage (debug)."""
        try:
            import torch
            if not torch.cuda.is_available():
                return {"available": False}
            return {
                "available": True,
                "allocated_gb": round(torch.cuda.memory_allocated() / (1024 ** 3), 2),
                "reserved_gb": round(torch.cuda.memory_reserved() / (1024 ** 3), 2),
                "total_gb": self.info.total_vram_gb,
            }
        except Exception:
            return {"available": False}


# Global singleton
gpu_manager = GpuManager()
