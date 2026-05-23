"""AiCruzz GPU worker package.

This module is imported before any submodule (routes, services), so it is the
correct place to set environment variables that must be in place before
``torch`` is initialized. ``PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True``
reduces fragmentation and is essential to avoid CUDA OOMs during Module 1
(Deep Fake Live Cam) face-swap / voice-change inference.
"""
from __future__ import annotations

import os

os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

__version__ = "1.0.0"
