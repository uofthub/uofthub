"""
uofthub's image scanner: NudeNet behind one authenticated endpoint.

The API sends it the bytes of each uploaded image and decides for itself what
counts as nudity (api/src/lib/imageScan.ts); this only reports what NudeNet
sees. It runs on a free Render instance that sleeps when idle, and keeps
nothing: no image is written to disk or logged.
"""

import hmac
import io
import os
import warnings

import numpy as np
from fastapi import FastAPI, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from nudenet import NudeDetector
from PIL import Image, ImageOps

TOKEN = os.environ["SCANNER_TOKEN"]
# The API's largest image upload, with room for the request around it.
MAX_BYTES = 26 * 1024 * 1024
# Detection runs at 320px; anything much larger only costs memory.
MAX_SIDE = 1280
# A small file can still decode to an enormous image, and the free instance
# has 512MB. Past this, refuse rather than only warn.
Image.MAX_IMAGE_PIXELS = 50_000_000
warnings.simplefilter("error", Image.DecompressionBombWarning)

detector = NudeDetector()  # the 320n model bundled with the package
app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)


@app.get("/health")
def health():
    return {"ok": True}


def load(body: bytes) -> np.ndarray:
    image = Image.open(io.BytesIO(body))
    image.draft("RGB", (MAX_SIDE, MAX_SIDE))  # a JPEG decodes at a fraction of its size
    image = ImageOps.exif_transpose(image)  # the first frame, for a GIF
    image.thumbnail((MAX_SIDE, MAX_SIDE))
    # NudeNet converts from RGBA itself (cv2.COLOR_RGBA2BGR), so it gets RGBA.
    return np.asarray(image.convert("RGBA"))


@app.post("/scan")
async def scan(request: Request):
    auth = request.headers.get("authorization", "")
    if not hmac.compare_digest(auth.encode(), f"Bearer {TOKEN}".encode()):
        raise HTTPException(status_code=401)
    body = await request.body()
    if len(body) > MAX_BYTES:
        raise HTTPException(status_code=413)
    try:
        pixels = load(body)
    except Exception:
        raise HTTPException(status_code=422, detail="Not an image")
    detections = await run_in_threadpool(detector.detect, pixels)
    return {
        "detections": [{"class": d["class"], "score": float(d["score"])} for d in detections]
    }
