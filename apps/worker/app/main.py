"""AiCruzz GPU worker — FastAPI service."""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path
from .services.liveportrait_engine import engine

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .routes import face_swap, health, voice, avatar_reenact
from .services.gpu_manager import gpu_manager

# ---------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------
# Upload directory
# ---------------------------------------------------------------------
UPLOAD_DIR = Path(
    os.getenv("UPLOAD_DIR", "/home/ubuntu/worker/uploads/generated")
).resolve()

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


# ---------------------------------------------------------------------
# Lifespan (startup / shutdown)
# ---------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle."""
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    logger.info(f"Upload directory ready: {UPLOAD_DIR}")

    logger.info("Initializing GPU manager…")
    info = gpu_manager.initialize()

    logger.info(
        "GPU ready: available=%s backend=%s name=%s fp16=%s xformers=%s",
        info.available,
        info.backend,
        info.device_name,
        info.fp16_supported,
        info.xformers_available,
    )

    logger.info("Initializing LivePortrait engine...")
    engine.warmup()

    logger.info(
        "LivePortrait ready=%s device=%s backend=%s reason=%s",
        engine.info.ready,
        engine.info.device,
        engine.info.backend,
        engine.info.not_ready_reason,
    )

    yield

    logger.info("Shutting down worker…")
    gpu_manager.cleanup()


# ---------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------
app = FastAPI(
    title="AiCruzz Worker",
    version="1.0.0",
    description="GPU processing service for AiCruzz platform",
    lifespan=lifespan,
)

# ---------------------------------------------------------------------
# Middleware
# ---------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------
# Static files
# ---------------------------------------------------------------------
app.mount(
    "/uploads/generated",
    StaticFiles(directory=str(UPLOAD_DIR), check_dir=True),
    name="generated",
)

# ---------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------
app.include_router(health.router, tags=["health"])
app.include_router(face_swap.router, tags=["face-swap"])
app.include_router(voice.router, tags=["voice"])

# ✅ FIX: Live Cam reenact route (THIS WAS MISSING)
app.include_router(avatar_reenact.router, prefix="/live-cam", tags=["live-cam"])


# ---------------------------------------------------------------------
# Root
# ---------------------------------------------------------------------
@app.get("/")
def root():
    return {"service": "AiCruzz Worker", "docs": "/docs"}
