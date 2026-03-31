"""
qr_center.py

Deterministic micro-pattern helpers used to draw the copy-sensitive graphic
inside the QR center.
"""

import hashlib
import numpy as np
from PIL import Image, ImageDraw


def _expand_bits(sig_hex: str, needed_bits: int) -> np.ndarray:
    """
    Expand a hash digest into a deterministic bitstream.

    Args:
        sig_hex: Hex string derived from a token hash.
        needed_bits: Number of bits required by the pattern grid.

    Returns:
        Numpy array of 0/1 bits with length needed_bits.
    """
    blocks = []
    counter = 0
    while len(blocks) * 256 < needed_bits:
        payload = f"{sig_hex}:{counter}".encode("utf-8")
        digest = hashlib.sha256(payload).digest()
        blocks.append(np.unpackbits(np.frombuffer(digest, dtype=np.uint8)))
        counter += 1

    bits = np.concatenate(blocks)
    return bits[:needed_bits]


def generate_micro_qr_pil(
    sig_hex: str, out_size: int, modules: int = 21
) -> Image.Image:
    """
    Generate a deterministic micro-pattern as a PIL image.

    The output is strictly binary (black/white) to maximize pattern stability
    after print-scan cycles.

    Args:
        sig_hex: Hex digest used to derive the pattern bits.
        out_size: Output size in pixels.
        modules: Number of modules across the pattern grid.

    Returns:
        PIL image containing the micro-pattern.
    """
    im = Image.new("RGBA", (out_size, out_size), (255, 255, 255, 255))
    draw_q = ImageDraw.Draw(im)

    # Quiet zone reduces edge artifacts after print/scan cycles.
    quiet = max(0, out_size // 48)
    inner_size = max(1, out_size - 2 * quiet)

    actual_modules = min(modules, inner_size)
    if actual_modules < 1:
        actual_modules = 1

    module_px = max(1, inner_size // actual_modules)
    used_size = module_px * actual_modules
    margin = quiet + max(0, (inner_size - used_size) // 2)

    # Expand bits to fill the full module grid deterministically.
    needed = actual_modules * actual_modules
    bits = _expand_bits(sig_hex, needed)

    idx = 0
    for r in range(actual_modules):
        for c in range(actual_modules):
            bx = margin + c * module_px
            by = margin + r * module_px
            bit = int(bits[idx])
            idx += 1
            if bit:
                draw_q.rectangle(
                    [bx, by, bx + module_px - 1, by + module_px - 1],
                    fill=(0, 0, 0, 255),
                )

    # Simple finder-like corners increase robustness in noisy captures.
    finder_m = max(1, actual_modules // 7)

    def draw_finder(top_r, left_c):
        fx0 = margin + left_c * module_px
        fy0 = margin + top_r * module_px
        fw = finder_m * module_px
        draw_q.rectangle([fx0, fy0, fx0 + fw - 1, fy0 + fw - 1], fill=(0, 0, 0, 255))
        pad = max(1, module_px // 2)
        x0_in = fx0 + pad
        y0_in = fy0 + pad
        x1_in = fx0 + fw - 1 - pad
        y1_in = fy0 + fw - 1 - pad
        if x1_in >= x0_in and y1_in >= y0_in:
            draw_q.rectangle([x0_in, y0_in, x1_in, y1_in], fill=(255, 255, 255, 255))
            pad2 = pad * 2
            x0_c = fx0 + pad2
            y0_c = fy0 + pad2
            x1_c = fx0 + fw - 1 - pad2
            y1_c = fy0 + fw - 1 - pad2
            if x1_c >= x0_c and y1_c >= y0_c:
                draw_q.rectangle([x0_c, y0_c, x1_c, y1_c], fill=(0, 0, 0, 255))

    draw_finder(0, 0)
    draw_finder(0, actual_modules - finder_m)
    draw_finder(actual_modules - finder_m, 0)

    return im
