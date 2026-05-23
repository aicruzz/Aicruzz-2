"""AiCruzz GPU worker — FastAPI service."""
from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .routes import face_swap, health, voice
from .services.gpu_manager import gpu_manager

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

UPLOAD_DIR = Path(
    os.getenv("UPLOAD_DIR", "/home/ubuntu/worker/uploads/generated")
).resolve()
# Make sure the directory exists at *import* time, not just inside lifespan,
# so the StaticFiles mount below never raises on a fresh deploy.
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup/shutdown lifecycle."""
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    logger.info(f"Upload directory ready: {UPLOAD_DIR}")

    logger.info("Initializing GPU manager…")
    info = gpu_manager.initialize()
    logger.info(
        f"GPU ready: available={info.available} backend={info.backend} "
        f"name={info.device_name} fp16={info.fp16_supported} "
        f"xformers={info.xformers_available}"
    )
    yield
    logger.info("Shutting down worker…")
    gpu_manager.cleanup()


app = FastAPI(
    title="AiCruzz Worker",
    version="1.0.0",
    description="GPU processing service for AiCruzz platform",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve generated files as static assets using an absolute path so uvicorn
# resolves the mount the same way regardless of CWD.
# e.g. http://32.192.133.173:8000/uploads/generated/video-abc123.mp4
app.mount(
    "/uploads/generated",
    StaticFiles(directory=str(UPLOAD_DIR), check_dir=True),
    name="generated",
)

# Register route modules. The GPU is reserved exclusively for Module 1
# (Deep Fake Live Cam) — face swap + live voice change. Video/image/TTS
# local-inference routes were removed; those modules use external APIs.
app.include_router(health.router,     tags=["health"])
app.include_router(face_swap.router,  tags=["face-swap"])
app.include_router(voice.router,      tags=["voice"])


@app.get("/")
def root():
    return {"service": "AiCruzz Worker", "docs": "/docs"}