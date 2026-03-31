"""
FastAPI server for Protected QR generation and verification.

This service is stateless and uses Base64 input/output only, avoiding any
filesystem dependencies to keep container execution deterministic and safe.
"""

import base64
import io
import logging
import numpy as np
import cv2
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

try:
    from qr_protected import generate_protected_qr
    from qr_decoder import (
        decode_qr_data,
        extract_center_pattern_variants,
        get_qr_module_count,
        verify_pattern_authenticity,
    )
except ImportError:
    from .qr_protected import generate_protected_qr
    from .qr_decoder import (
        decode_qr_data,
        extract_center_pattern_variants,
        get_qr_module_count,
        verify_pattern_authenticity,
    )

app = FastAPI(
    title="Protected QR Core",
    description="Fixed-geometry protected QR generation and verification",
    version="1.0.0",
)
logger = logging.getLogger(__name__)


class GenerateRequest(BaseModel):
    """
    Request model for QR generation.

    Attributes:
        token: Payload string to encode in the QR data modules.
        size: Target output size in pixels (fixed geometry default is 600).
        border: Quiet zone in modules (fixed geometry default is 1).
    """

    token: str
    size: int = 600
    border: int = 1


class VerifyRequest(BaseModel):
    """
    Request model for QR verification.

    Attributes:
        image_base64: Base64-encoded PNG image content.
    """

    image_base64: str


@app.get("/health")
async def health_check():
    """Health check for container readiness/liveness."""
    return {"status": "ok"}


@app.post("/generate-protected-qr")
async def generate_qr_endpoint(req: GenerateRequest):
    """
    Generate a fixed-geometry QR and return it as Base64 PNG.

    Args:
        req: Request payload with token, size, and border.

    Returns:
        JSON with base64 PNG and success flag.
    """
    if not req.token:
        raise HTTPException(status_code=400, detail="Token is required")

    try:
        # Geometry is fixed by contract; size and border are validated by the caller.
        img = generate_protected_qr(req.token, size=req.size, border=req.border)
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        b64 = base64.b64encode(buf.getvalue()).decode("ascii")
        return {"success": True, "qr_image_base64": b64}
    except Exception:
        logger.exception("Generation failed")
        raise HTTPException(status_code=500, detail="Generation failed")


@app.post("/verify-protected-qr")
async def verify_qr_endpoint(req: VerifyRequest):
    """
    Verify a QR image and return authenticity verdict + confidence score.

    Args:
        req: Request payload with base64 image.

    Returns:
        JSON with decoded token, confidence score, and flags.
    """
    if not req.image_base64:
        raise HTTPException(status_code=400, detail="image_base64 is required")

    try:
        # Decode the input to an OpenCV image for QR detection.
        raw = base64.b64decode(req.image_base64)
        np_img = np.frombuffer(raw, dtype=np.uint8)
        img = cv2.imdecode(np_img, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("Invalid image data")

        # Decode the embedded token from the QR data modules.
        token = decode_qr_data(img)
        if not token:
            return {"token": None, "is_authentic": False, "confidence_score": 0.0}

        # Extract pattern variants and keep the highest confidence.
        module_count = get_qr_module_count(token)
        patterns = extract_center_pattern_variants(
            img,
            expected_size_px=154,
            module_count=module_count,
            border_modules=1,
            pattern_size_modules=14.0,
        )
        verify = None
        for _, pattern in patterns:
            candidate = verify_pattern_authenticity(
                pattern, token, pattern_modules=56
            )
            if verify is None or candidate["confidence_score"] > verify["confidence_score"]:
                verify = candidate

        return {
            "token": token,
            "is_authentic": verify["is_authentic"],
            "confidence_score": verify["confidence_score"],
            "is_photocopy": verify["is_photocopy"],
        }
    except Exception:
        logger.exception("Verification failed")
        raise HTTPException(status_code=500, detail="Verification failed")
