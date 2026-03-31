"""
qr_decoder.py

Decode QR data and verify the copy-sensitive center pattern.
Verification is based on deterministic pattern regeneration from the token.
"""

import hashlib
import numpy as np
import cv2
from PIL import Image
import qrcode
from qrcode.constants import ERROR_CORRECT_H

try:
    from qr_center import generate_micro_qr_pil
except ImportError:
    from .qr_center import generate_micro_qr_pil


def _decode_with_detector(detector: cv2.QRCodeDetector, image: np.ndarray) -> str:
    data, _, _ = detector.detectAndDecode(image)
    if data:
        return data
    if hasattr(detector, "detectAndDecodeCurved"):
        data, _, _ = detector.detectAndDecodeCurved(image)
        if data:
            return data
    return ""


def decode_qr_data(image_bgr: np.ndarray) -> str:
    """
    Decode QR payload using OpenCV QRCodeDetector.

    Args:
        image_bgr: OpenCV BGR image containing a QR code.

    Returns:
        Decoded string payload or empty string if not found.
    """
    if image_bgr is None:
        return ""

    detector = cv2.QRCodeDetector()
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)

    # Try multiple pre-processing variants to handle photos and screens.
    attempts = [
        image_bgr,
        gray,
        cv2.GaussianBlur(gray, (3, 3), 0),
        cv2.adaptiveThreshold(
            gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 5
        ),
    ]
    scales = [1.0, 0.75, 1.25, 1.5]

    for attempt in attempts:
        for scale in scales:
            if scale == 1.0:
                resized = attempt
            else:
                interp = cv2.INTER_CUBIC if scale > 1.0 else cv2.INTER_AREA
                resized = cv2.resize(
                    attempt, None, fx=scale, fy=scale, interpolation=interp
                )
            data = _decode_with_detector(detector, resized)
            if data:
                return data

    return ""


def _extract_center_from_region(
    region_bgr: np.ndarray, expected_size_px: int
) -> np.ndarray:
    expected_size_px = max(1, int(expected_size_px))
    # Convert to grayscale for stable thresholding and comparison.
    img_pil = Image.fromarray(cv2.cvtColor(region_bgr, cv2.COLOR_BGR2RGB)).convert("L")
    w, h = img_pil.size
    cx, cy = w // 2, h // 2
    half = expected_size_px // 2

    x1 = max(0, cx - half)
    y1 = max(0, cy - half)
    x2 = min(w, cx + half)
    y2 = min(h, cy + half)

    box = img_pil.crop((x1, y1, x2, y2))
    # Keep nearest-neighbor resizing to preserve binary structure.
    if box.size != (expected_size_px, expected_size_px):
        box = box.resize((expected_size_px, expected_size_px), Image.Resampling.NEAREST)

    return np.array(box)


def get_qr_module_count(token: str) -> int:
    """
    Reconstruct the QR module count from the token.

    The generator uses the same QR configuration (EC level H, border=1), so
    we can infer the exact module grid used during rendering.
    """
    qr = qrcode.QRCode(error_correction=ERROR_CORRECT_H, box_size=1, border=1)
    qr.add_data(token)
    qr.make(fit=True)
    matrix = qr.get_matrix()
    return len(matrix)


def _extract_center_from_warp(
    warped_bgr: np.ndarray,
    module_count: int,
    border_modules: int,
    pattern_size_modules: float,
) -> np.ndarray:
    """
    Crop the center pattern based on the QR module grid.

    The warped QR is treated as a square grid with a known module count and
    border size. This yields a stable center crop even for skewed photos.
    """
    if warped_bgr is None or module_count <= 0:
        return _extract_center_from_region(warped_bgr, 154)

    size = min(warped_bgr.shape[0], warped_bgr.shape[1])
    total_modules = module_count + 2 * border_modules
    if total_modules <= 0:
        return _extract_center_from_region(warped_bgr, 154)

    module_px = size / float(total_modules)
    center_module = module_count // 2
    center_px = (border_modules + center_module + 0.5) * module_px
    pattern_size_px = max(8, int(round(pattern_size_modules * module_px)))

    half = pattern_size_px / 2.0
    x1 = int(round(center_px - half))
    y1 = int(round(center_px - half))
    x2 = int(round(center_px + half))
    y2 = int(round(center_px + half))

    x1 = max(0, x1)
    y1 = max(0, y1)
    x2 = min(warped_bgr.shape[1], x2)
    y2 = min(warped_bgr.shape[0], y2)

    if x2 <= x1 or y2 <= y1:
        return _extract_center_from_region(warped_bgr, pattern_size_px)

    crop = warped_bgr[y1:y2, x1:x2]
    return _extract_center_from_region(crop, pattern_size_px)


def extract_center_pattern(
    image_bgr: np.ndarray, expected_size_px: int = 154
) -> np.ndarray:
    """
    Extract the fixed-size center pattern from the QR region.

    The crop targets the QR center; if detection fails, the full image is
    treated as the region to keep behavior deterministic.

    Args:
        image_bgr: OpenCV BGR image containing a QR code.
        expected_size_px: Size of the square crop in pixels.

    Returns:
        Grayscale numpy array of the center pattern.
    """
    detector = cv2.QRCodeDetector()
    _, bbox, _ = detector.detectAndDecode(image_bgr)

    if bbox is not None and len(bbox) > 0:
        pts = bbox[0].astype(np.int32)
        x_min, y_min = pts.min(axis=0)
        x_max, y_max = pts.max(axis=0)
        padding = 5
        x_min = max(0, x_min - padding)
        y_min = max(0, y_min - padding)
        x_max = min(image_bgr.shape[1], x_max + padding)
        y_max = min(image_bgr.shape[0], y_max + padding)
        qr_region = image_bgr[y_min:y_max, x_min:x_max]
    else:
        qr_region = image_bgr

    return _extract_center_from_region(qr_region, expected_size_px)


def extract_center_pattern_variants(
    image_bgr: np.ndarray,
    expected_size_px: int = 154,
    module_count: "int | None" = None,
    border_modules: int = 1,
    pattern_size_modules: float = 14.0,
) -> list[tuple[str, np.ndarray]]:
    """
    Extract multiple center pattern variants to improve robustness.

    Returns:
        List of grayscale numpy arrays.
    """
    patterns: list[tuple[str, np.ndarray]] = []

    detector = cv2.QRCodeDetector()
    ok, bbox = detector.detect(image_bgr)
    if ok and bbox is not None and len(bbox) > 0:
        pts = bbox[0].astype(np.float32)
        s = pts.sum(axis=1)
        diff = np.diff(pts, axis=1)
        rect = np.zeros((4, 2), dtype=np.float32)
        rect[0] = pts[np.argmin(s)]
        rect[2] = pts[np.argmax(s)]
        rect[1] = pts[np.argmin(diff)]
        rect[3] = pts[np.argmax(diff)]

        width_a = np.linalg.norm(rect[2] - rect[3])
        width_b = np.linalg.norm(rect[1] - rect[0])
        height_a = np.linalg.norm(rect[1] - rect[2])
        height_b = np.linalg.norm(rect[0] - rect[3])
        top_edge = rect[1] - rect[0]
        angle = abs(np.degrees(np.arctan2(top_edge[1], top_edge[0])))
        max_dim = max(width_a, width_b, height_a, height_b, 1.0)
        aspect_skew = abs(width_a - height_a) / max_dim
        use_axis = angle < 5.0 and aspect_skew < 0.05

        size = int(max(width_a, width_b, height_a, height_b))
        size = max(size, expected_size_px + 20)
        dst = np.array(
            [[0, 0], [size - 1, 0], [size - 1, size - 1], [0, size - 1]],
            dtype=np.float32,
        )
        matrix = cv2.getPerspectiveTransform(rect, dst)
        warped = cv2.warpPerspective(image_bgr, matrix, (size, size))
        scaled_expected = max(24, int(expected_size_px * size / 600))
        if module_count:
            # Try both border assumptions: detector bbox may or may not include quiet zone.
            patterns.append(
                (
                    "warp-grid-b1",
                    _extract_center_from_warp(
                        warped,
                        module_count,
                        border_modules,
                        pattern_size_modules,
                    ),
                )
            )
            patterns.append(
                (
                    "warp-grid-b0",
                    _extract_center_from_warp(
                        warped,
                        module_count,
                        0,
                        pattern_size_modules,
                    ),
                )
            )
            patterns.append(
                ("warp", _extract_center_from_region(warped, scaled_expected))
            )
        else:
            patterns.append(
                ("warp", _extract_center_from_region(warped, scaled_expected))
            )

        if use_axis:
            patterns.append(("axis", extract_center_pattern(image_bgr, expected_size_px)))

    # Only fall back to axis crop when warp-based extraction is unavailable.
    if not patterns:
        patterns.append(("axis", extract_center_pattern(image_bgr, expected_size_px)))

    return patterns


def verify_pattern_authenticity(
    pattern_array: np.ndarray, token: str, pattern_modules: int = 56
) -> dict:
    """
    Verify the center pattern by regenerating it from the token hash and
    computing binary match + correlation confidence.

    Args:
        pattern_array: Extracted grayscale pattern.
        token: Payload string encoded in the QR data.
        pattern_modules: Module count for the micro-pattern grid.

    Returns:
        Dict with authenticity decision, confidence score, and metrics.
    """
    sig_hex = hashlib.sha256(token.encode("utf-8")).hexdigest()
    pattern_size_px = pattern_array.shape[0]
    expected_pattern = generate_micro_qr_pil(
        sig_hex, pattern_size_px, modules=pattern_modules
    )
    expected_array = np.array(expected_pattern.convert("L"))

    expected_binary = (expected_array < 128).astype(np.uint8)
    actual_binary = (pattern_array < 128).astype(np.uint8)

    binary_match = (expected_binary == actual_binary).sum() / pattern_array.size

    if expected_binary.std() > 0 and actual_binary.std() > 0:
        binary_corr = np.corrcoef(expected_binary.flatten(), actual_binary.flatten())[
            0, 1
        ]
    else:
        binary_corr = 1.0 if binary_match > 0.99 else 0.0

    # Weight binary match higher than correlation to avoid scan noise bias.
    confidence = binary_match * 0.7 + binary_corr * 0.3
    is_authentic = confidence > 0.70
    is_photocopy = confidence < 0.55

    return {
        "is_authentic": bool(is_authentic),
        "confidence_score": float(confidence),
        "binary_match_ratio": float(binary_match),
        "binary_correlation": float(binary_corr),
        "is_photocopy": bool(is_photocopy),
    }
