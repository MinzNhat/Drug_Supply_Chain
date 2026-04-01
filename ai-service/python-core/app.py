"""
FastAPI service for product packaging appearance verification.

This service runs YOLO inference on one uploaded image and returns
an acceptance decision payload consumed by backend `AiVerifierService`.
"""

import logging
import os
import threading
import time
from pathlib import Path

import cv2
import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from decision_policy import decide_packaging_authenticity

try:
    from ultralytics import YOLO
except Exception as import_error:  # pragma: no cover - handled by runtime checks
    YOLO = None
    ULTRALYTICS_IMPORT_ERROR = str(import_error)
else:
    ULTRALYTICS_IMPORT_ERROR = ""

logger = logging.getLogger(__name__)

app = FastAPI(
    title="DrugGuard AI Appearance Verifier",
    description="YOLO-based product packaging authenticity scoring",
    version="1.0.0",
)

MODEL_LOCK = threading.Lock()
MODEL_INSTANCE = None
MODEL_LOAD_ERROR = ""


def read_env_float(name: str, fallback: float) -> float:
    """Parse floating-point env value with fallback."""
    raw = os.getenv(name, "")
    try:
        return float(raw) if raw else fallback
    except ValueError:
        return fallback


def read_env_int(name: str, fallback: int) -> int:
    """Parse integer env value with fallback."""
    raw = os.getenv(name, "")
    try:
        return int(raw) if raw else fallback
    except ValueError:
        return fallback


def parse_label_set(raw_text: str, defaults: set[str]) -> set[str]:
    """Parse normalized comma-separated label aliases."""
    if not raw_text:
        return defaults
    values = {
        item.strip().lower()
        for item in raw_text.split(",")
        if item.strip().strip().lower()
    }
    return values or defaults


MODEL_PATH = Path(os.getenv("AI_MODEL_PATH", "/models/best.pt")).expanduser()
INFERENCE_DEVICE = os.getenv("AI_INFERENCE_DEVICE", "cpu")
INFERENCE_IMG_SIZE = read_env_int("AI_INFERENCE_IMG_SIZE", 640)
CONFIDENCE_THRESHOLD = read_env_float("AI_CONFIDENCE_THRESHOLD", 0.5)
COUNTERFEIT_MIN_SCORE = read_env_float("AI_COUNTERFEIT_MIN_SCORE", 0.6)
AUTHENTIC_MIN_SCORE = read_env_float("AI_AUTHENTIC_MIN_SCORE", 0.75)
COUNTERFEIT_LABELS = parse_label_set(
    os.getenv("AI_COUNTERFEIT_LABELS", "counterfeit,fake,gia"),
    {"counterfeit", "fake", "gia"},
)
AUTHENTIC_LABELS = parse_label_set(
    os.getenv("AI_AUTHENTIC_LABELS", "authentic,genuine,real"),
    {"authentic", "genuine", "real"},
)


def resolve_model():
    """Lazy-load the YOLO model once for process lifetime."""
    global MODEL_INSTANCE
    global MODEL_LOAD_ERROR

    if MODEL_INSTANCE is not None:
        return MODEL_INSTANCE

    with MODEL_LOCK:
        if MODEL_INSTANCE is not None:
            return MODEL_INSTANCE

        if YOLO is None:
            MODEL_LOAD_ERROR = (
                ULTRALYTICS_IMPORT_ERROR or "Failed to import ultralytics"
            )
            raise RuntimeError(MODEL_LOAD_ERROR)

        if not MODEL_PATH.exists():
            MODEL_LOAD_ERROR = f"Model file not found at {MODEL_PATH}"
            raise FileNotFoundError(MODEL_LOAD_ERROR)

        try:
            MODEL_INSTANCE = YOLO(str(MODEL_PATH))
            MODEL_LOAD_ERROR = ""
            logger.info("ai-model-loaded")
            return MODEL_INSTANCE
        except Exception as error:  # pragma: no cover - runtime safety path
            MODEL_LOAD_ERROR = str(error)
            raise RuntimeError(MODEL_LOAD_ERROR) from error


def to_image_bgr(raw_bytes: bytes) -> np.ndarray:
    """Decode raw upload bytes into OpenCV BGR image."""
    np_img = np.frombuffer(raw_bytes, dtype=np.uint8)
    image = cv2.imdecode(np_img, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("Invalid image data")
    return image


def score_labels(detections: list[dict]) -> tuple[float, float]:
    """Aggregate max confidence for counterfeit and authentic labels."""
    counterfeit_score = 0.0
    authentic_score = 0.0

    for detection in detections:
        label = str(detection.get("label", "")).lower()
        confidence = float(detection.get("confidence", 0.0))

        if any(alias in label for alias in COUNTERFEIT_LABELS):
            counterfeit_score = max(counterfeit_score, confidence)

        if any(alias in label for alias in AUTHENTIC_LABELS):
            authentic_score = max(authentic_score, confidence)

    return counterfeit_score, authentic_score


def infer_detections(image_bgr: np.ndarray) -> dict:
    """Run one YOLO inference pass and normalize detection payload."""
    model = resolve_model()
    started = time.perf_counter()

    results = model.predict(
        source=image_bgr,
        conf=CONFIDENCE_THRESHOLD,
        imgsz=INFERENCE_IMG_SIZE,
        device=INFERENCE_DEVICE,
        verbose=False,
    )

    elapsed_ms = round((time.perf_counter() - started) * 1000.0, 2)
    primary = results[0]

    names = primary.names if isinstance(primary.names, dict) else {}
    detections = []

    if primary.boxes is not None:
        for box in primary.boxes:
            cls_id = int(box.cls[0])
            confidence = float(box.conf[0])
            coords = box.xyxy[0].tolist()
            label = str(names.get(cls_id, cls_id))

            detections.append(
                {
                    "label": label,
                    "confidence": round(confidence, 4),
                    "bbox": [round(float(point), 2) for point in coords],
                }
            )

    counterfeit_score, authentic_score = score_labels(detections)
    max_detection_score = max(
        [float(item["confidence"]) for item in detections] or [0.0]
    )

    accepted, verdict, decision_reason = decide_packaging_authenticity(
        counterfeit_score=counterfeit_score,
        authentic_score=authentic_score,
        counterfeit_min_score=COUNTERFEIT_MIN_SCORE,
        authentic_min_score=AUTHENTIC_MIN_SCORE,
    )

    return {
        "accepted": accepted,
        "is_authentic": accepted,
        "confidence_score": round(max(max_detection_score, counterfeit_score), 4),
        "verdict": verdict,
        "decision_reason": decision_reason,
        "counterfeit_min_score": round(COUNTERFEIT_MIN_SCORE, 4),
        "authentic_min_score": round(AUTHENTIC_MIN_SCORE, 4),
        "counterfeit_score": round(counterfeit_score, 4),
        "authentic_score": round(authentic_score, 4),
        "detections": detections,
        "model_path": str(MODEL_PATH),
        "latency_ms": elapsed_ms,
    }


@app.get("/health")
async def health_check() -> dict:
    """Readiness endpoint for orchestration and diagnostics."""
    return {
        "status": "ok",
        "model_path": str(MODEL_PATH),
        "model_ready": MODEL_INSTANCE is not None,
        "model_load_error": MODEL_LOAD_ERROR,
    }


@app.post("/verify")
async def verify_packaging_image(image: UploadFile = File(...)) -> dict:
    """Verify one packaging image and return backend-compatible fields."""
    content_type = (image.content_type or "").lower()
    if content_type and not content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="image field must be image/*")

    raw = await image.read()
    if not raw:
        raise HTTPException(status_code=400, detail="image field is required")

    try:
        image_bgr = to_image_bgr(raw)
        result = infer_detections(image_bgr)
        return result
    except FileNotFoundError as error:
        logger.warning("ai-model-missing: %s", error)
        raise HTTPException(
            status_code=503,
            detail="AI model is not available",
        ) from error
    except RuntimeError as error:
        logger.warning("ai-runtime-error: %s", error)
        raise HTTPException(
            status_code=503,
            detail="AI verifier cannot load model",
        ) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:  # pragma: no cover - defensive fallback
        logger.exception("ai-verify-failed")
        raise HTTPException(
            status_code=500,
            detail=f"AI verification failed: {error}",
        ) from error
