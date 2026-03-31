"""
qr_protected.py

Protected QR generator with fixed geometry and deterministic center pattern.
All geometry values must remain unchanged to preserve EC Level H compatibility.
"""

import hashlib
from PIL import Image, ImageDraw
import qrcode
from qrcode.constants import ERROR_CORRECT_H

try:
    from qr_center import generate_micro_qr_pil
except ImportError:
    from .qr_center import generate_micro_qr_pil


def generate_protected_qr(token: str, size: int = 600, border: int = 1) -> Image.Image:
    """
    Generate a fixed-geometry protected QR image.

    The token drives deterministic center pattern generation while the QR data
    remains decodable at Error Correction Level H.
    """
    # Hash the token to seed the deterministic center pattern.
    sig_hex = hashlib.sha256(token.encode("utf-8")).hexdigest()

    # Use EC Level H to tolerate center overlay without losing decode ability.
    qr = qrcode.QRCode(error_correction=ERROR_CORRECT_H, box_size=1, border=border)
    qr.add_data(token)
    qr.make(fit=True)

    matrix = qr.get_matrix()
    modules = len(matrix)
    total_modules = modules + 2 * border
    module_px = max(1, size // total_modules)
    img_size_exact = module_px * total_modules

    padding = 0
    if img_size_exact < size:
        padding = (size - img_size_exact) // 2
        img_size_exact = size

    # Create a white canvas for deterministic module rendering.
    img = Image.new("RGB", (img_size_exact, img_size_exact), (255, 255, 255))
    px = img.load()

    # Render QR modules using integer pixel sizes for crisp edges.
    for r in range(modules):
        for c in range(modules):
            if matrix[r][c]:
                x0 = padding + (c + border) * module_px
                y0 = padding + (r + border) * module_px
                for yy in range(y0, y0 + module_px):
                    for xx in range(x0, x0 + module_px):
                        if xx < img_size_exact and yy < img_size_exact:
                            px[xx, yy] = (0, 0, 0)

    # The fixed center geometry constants are contract-bound.
    square_modules = 15
    outer_padding_modules = 1.0
    dot_size_modules = 0.85
    inner_padding_modules = 1.0
    pattern_size_modules = 14.0
    hollow_hole_modules = 0.5

    center_module_x = modules // 2
    center_module_y = modules // 2
    half_square = square_modules // 2

    square_start_module_x = center_module_x - half_square
    square_start_module_y = center_module_y - half_square
    square_start_px_x = padding + (square_start_module_x + border) * module_px
    square_start_px_y = padding + (square_start_module_y + border) * module_px
    square_size_px = square_modules * module_px

    # Draw a white square to host the pattern and marker dots.
    draw = ImageDraw.Draw(img)
    draw.rectangle(
        [
            square_start_px_x,
            square_start_px_y,
            square_start_px_x + square_size_px,
            square_start_px_y + square_size_px,
        ],
        fill=(255, 255, 255),
        outline=None,
    )

    # Pattern size is fixed to preserve verification crop alignment.
    pattern_size_px = int(pattern_size_modules * module_px)
    pattern_modules_count = int(pattern_size_modules * 4)
    pattern = generate_micro_qr_pil(
        sig_hex, pattern_size_px, modules=pattern_modules_count
    )
    pattern_rgb = pattern.convert("RGB")

    paste_center_x = (
        padding + int((center_module_x + border) * module_px) + module_px // 2
    )
    paste_center_y = (
        padding + int((center_module_y + border) * module_px) + module_px // 2
    )
    paste_x = paste_center_x - pattern_size_px // 2
    paste_y = paste_center_y - pattern_size_px // 2
    img.paste(pattern_rgb, (paste_x, paste_y))

    dot_size_px = int(dot_size_modules * module_px)
    dot_area_start = outer_padding_modules
    dot_area_end = square_modules - outer_padding_modules
    dot_area_size = dot_area_end - dot_area_start

    total_dot_width = 4 * dot_size_modules
    spacing = (dot_area_size - total_dot_width) / 3

    dot_positions = []

    y_top = square_start_px_y + int(outer_padding_modules * module_px)
    for i in range(4):
        x = square_start_px_x + int(
            (outer_padding_modules + i * (dot_size_modules + spacing)) * module_px
        )
        dot_positions.append((x, y_top))

    x_right = (
        square_start_px_x
        + square_size_px
        - int((outer_padding_modules + dot_size_modules) * module_px)
    )
    for i in range(1, 3):
        y = square_start_px_y + int(
            (outer_padding_modules + i * (dot_size_modules + spacing)) * module_px
        )
        dot_positions.append((x_right, y))

    y_bottom = (
        square_start_px_y
        + square_size_px
        - int((outer_padding_modules + dot_size_modules) * module_px)
    )
    for i in range(3, -1, -1):
        x = square_start_px_x + int(
            (outer_padding_modules + i * (dot_size_modules + spacing)) * module_px
        )
        dot_positions.append((x, y_bottom))

    x_left = square_start_px_x + int(outer_padding_modules * module_px)
    for i in range(2, 0, -1):
        y = square_start_px_y + int(
            (outer_padding_modules + i * (dot_size_modules + spacing)) * module_px
        )
        dot_positions.append((x_left, y))

    # Draw 12 marker dots; dot index 6 is hollow to encode orientation.
    for idx, (dx, dy) in enumerate(dot_positions):
        dot_bbox = [dx, dy, dx + dot_size_px, dy + dot_size_px]
        draw.rectangle(dot_bbox, fill=(0, 0, 0), outline=None)

        if idx == 6:
            hole_size_px = int(hollow_hole_modules * module_px)
            hole_offset = (dot_size_px - hole_size_px) // 2
            hole_x = dx + hole_offset
            hole_y = dy + hole_offset
            hole_bbox = [hole_x, hole_y, hole_x + hole_size_px, hole_y + hole_size_px]
            draw.rectangle(hole_bbox, fill=(255, 255, 255), outline=None)

    return img.convert("RGB")
