#!/usr/bin/env python3
# coding: utf-8
"""
LivePortrait parity verification — RUN ON THE GPU WORKER.

The LivePortrait `src/` package, pretrained weights and the GPU only exist on
the worker box, so these checks cannot run on a dev laptop. SSH to the worker
and run:

    cd apps/worker && ./venv/bin/python verify_liveportrait.py [avatar_url_or_path]

It validates, in order:
  1. imports resolve against the *installed* LivePortrait version
  2. the wrapper/cropper expose every method the engine calls
  3. engine warms up and avatar_available (engine.ready) is True
  4. a source + driving frame round-trips and the OUTPUT DIMENSIONS MATCH the
     original avatar frame (proves paste-back, not a raw 256x256 tile)

Exit code 0 = all green. Non-zero = first failure is printed.
"""

from __future__ import annotations

import base64
import sys

FAIL = "\033[31mFAIL\033[0m"
OK = "\033[32mOK\033[0m"


def die(msg: str) -> None:
    print(f"[{FAIL}] {msg}")
    sys.exit(1)


def main() -> None:
    avatar = sys.argv[1] if len(sys.argv) > 1 else None

    # --- 1. imports against the installed LivePortrait version ---------------
    try:
        from app.services.liveportrait_engine import engine, LIVEPORTRAIT_PATH
    except Exception as e:  # pragma: no cover
        die(f"cannot import engine module: {e}")

    print(f"[{OK}] engine module imported (LIVEPORTRAIT_PATH={LIVEPORTRAIT_PATH})")

    info = engine.initialize()
    if not info.ready:
        die(f"engine not ready (avatar_available=False): {info.not_ready_reason}")
    print(f"[{OK}] engine.ready=True  device={info.device}  model={info.model}")

    # --- 2. wrapper/cropper expose every method the engine calls -------------
    wrapper = engine._wrapper
    cropper = engine._cropper

    required_wrapper = [
        "prepare_source", "get_kp_info", "transform_keypoint",
        "extract_feature_3d", "warp_decode", "get_rotation_matrix",
        "stitching", "prepare_paste_back", "paste_back",
    ]
    missing = [m for m in required_wrapper if not callable(getattr(wrapper, m, None))]
    if missing:
        die(f"wrapper missing methods (version mismatch): {missing}")
    print(f"[{OK}] wrapper exposes all {len(required_wrapper)} required methods")

    if not callable(getattr(cropper, "crop_source_image", None)):
        die("cropper missing crop_source_image (version mismatch)")
    print(f"[{OK}] cropper.crop_source_image present")

    if getattr(wrapper, "mask_crop", None) is None:
        print("[warn] wrapper.mask_crop is None — paste-back falls back to raw crop")
    else:
        print(f"[{OK}] wrapper.mask_crop present (paste-back mask available)")

    # --- 3 & 4. round-trip + output dimensions match avatar frame -----------
    if not avatar:
        print("\n[skip] no avatar arg — pass an avatar path/URL to test inference "
              "+ output dimensions, e.g. ./venv/bin/python verify_liveportrait.py "
              "/path/to/avatar.jpg")
        print(f"\n[{OK}] STATIC CHECKS PASSED")
        return

    src_img = engine._fetch(avatar)
    if src_img is None:
        die(f"could not fetch avatar: {avatar}")
    h, w = src_img.shape[:2]
    print(f"[{OK}] avatar fetched  dims={w}x{h}")

    # Use the avatar itself as a driving frame for a self-contained smoke test.
    cv2 = engine._cv2
    ok, buf = cv2.imencode(".jpg", cv2.cvtColor(src_img, cv2.COLOR_RGB2BGR))
    if not ok:
        die("could not encode driving frame")
    frame_b64 = base64.b64encode(buf).decode()

    out_b64, latency_ms, reason = engine.process(
        avatar_url=avatar, frame=frame_b64, session_id="verify"
    )
    if reason is not None or out_b64 is None:
        die(f"inference returned no frame: reason={reason}")

    out_img = engine._decode(out_b64)
    if out_img is None:
        die("output frame failed to decode")
    oh, ow = out_img.shape[:2]

    if (ow, oh) != (w, h):
        die(f"OUTPUT DIMS {ow}x{oh} != avatar {w}x{h} "
            "(paste-back not applied — would scatter background)")
    print(f"[{OK}] output dims {ow}x{oh} match avatar {w}x{h}  "
          f"(paste-back composited)  latency={latency_ms:.0f}ms")

    print(f"\n[{OK}] ALL CHECKS PASSED — avatar_available=True, parity verified")


if __name__ == "__main__":
    main()
