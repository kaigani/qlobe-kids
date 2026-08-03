#!/usr/bin/env python3
"""Deterministic Tangram Tales finalizer.

GPT Image 2 owns the visible paper material. This script slices accepted source
plates, masks that material into exact tangram geometry, bakes subtle physical
depth, and writes compact runtime WebP assets. It makes no network calls.
"""

from __future__ import annotations

import json
import math
import random
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
SOURCE = ASSETS / "source"
PIECES = ASSETS / "pieces"
SCENES = ASSETS / "scenes"
UI = ASSETS / "ui"

COLORS = ["coral", "orange", "yellow", "green", "teal", "blue", "violet"]
PIECE_COLORS = {
    "large-a": "coral",
    "large-b": "blue",
    "medium": "orange",
    "small-a": "violet",
    "small-b": "teal",
    "square": "yellow",
    "parallelogram": "green",
}


def save_webp(image: Image.Image, path: Path, *, quality: int = 84, lossless: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "WEBP", quality=quality, method=6, lossless=lossless)


def cover(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    target_w, target_h = size
    scale = max(target_w / image.width, target_h / image.height)
    resized = image.resize((round(image.width * scale), round(image.height * scale)), Image.Resampling.LANCZOS)
    left = (resized.width - target_w) // 2
    top = (resized.height - target_h) // 2
    return resized.crop((left, top, left + target_w, top + target_h))


def alpha_crop(image: Image.Image, padding: int = 8) -> Image.Image:
    alpha = image.getchannel("A")
    bbox = alpha.getbbox()
    if not bbox:
        raise ValueError("transparent image has no subject")
    left = max(0, bbox[0] - padding)
    top = max(0, bbox[1] - padding)
    right = min(image.width, bbox[2] + padding)
    bottom = min(image.height, bbox[3] + padding)
    return image.crop((left, top, right, bottom))


def clean_qwen_alpha(image: Image.Image) -> Image.Image:
    """Remove near-transparent Layered residue without changing subject pixels."""
    image = image.convert("RGBA")
    alpha = image.getchannel("A").point(
        lambda value: 0 if value < 16 else round((value - 16) * 255 / 239)
    )
    image.putalpha(alpha)
    return image


def square_icon(image: Image.Image, size: int = 256, padding: int = 10) -> Image.Image:
    """Alpha-trim an accepted icon cell and center it on a stable square canvas."""
    icon = alpha_crop(image.convert("RGBA"), padding)
    scale = min((size - padding * 2) / icon.width, (size - padding * 2) / icon.height)
    icon = icon.resize(
        (max(1, round(icon.width * scale)), max(1, round(icon.height * scale))),
        Image.Resampling.LANCZOS,
    )
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.alpha_composite(icon, ((size - icon.width) // 2, (size - icon.height) // 2))
    return canvas


def material_swatches() -> dict[str, Image.Image]:
    atlas = Image.open(SOURCE / "paper-atlas-gpt-image-2.png").convert("RGB")
    result: dict[str, Image.Image] = {}
    for index, name in enumerate(COLORS):
        x0 = round(index * atlas.width / 7)
        x1 = round((index + 1) * atlas.width / 7)
        inset = min(18, max(8, (x1 - x0) // 16))
        cell = atlas.crop((x0 + inset, 22, x1 - inset, atlas.height - 22))
        swatch = cover(cell, (512, 512))
        swatch.save(SOURCE / f"paper-{name}.png", optimize=True)
        result[name] = swatch
    return result


def rough_polygon(points: list[tuple[float, float]], size: int, seed: int) -> list[tuple[float, float]]:
    rng = random.Random(seed)
    output: list[tuple[float, float]] = []
    for index, start in enumerate(points):
        end = points[(index + 1) % len(points)]
        sx, sy = start[0] * size, start[1] * size
        ex, ey = end[0] * size, end[1] * size
        dx, dy = ex - sx, ey - sy
        length = max(1.0, math.hypot(dx, dy))
        nx, ny = -dy / length, dx / length
        steps = max(8, round(length / 14))
        for step in range(steps):
            t = step / steps
            envelope = math.sin(math.pi * t) ** 0.35
            jitter = rng.uniform(-1.7, 1.7) * envelope
            output.append((sx + dx * t + nx * jitter, sy + dy * t + ny * jitter))
    return output


def make_piece(name: str, material: Image.Image, points: list[tuple[float, float]], seed: int) -> None:
    size = 512
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).polygon(rough_polygon(points, size, seed), fill=255)
    # Down/up sampling gives a soft cut-paper antialias without losing the
    # deliberately irregular scissor edge.
    mask = mask.resize((size // 2, size // 2), Image.Resampling.LANCZOS).resize((size, size), Image.Resampling.LANCZOS)

    shadow = Image.new("L", (size, size), 0)
    shadow.paste(mask, (6, 9))
    shadow = shadow.filter(ImageFilter.GaussianBlur(7))
    shadow = shadow.point(lambda value: round(value * 0.36))

    bevel_shift = Image.new("L", (size, size), 0)
    bevel_shift.paste(mask, (0, -5))
    lower_edge = ImageChops.subtract(mask, bevel_shift).filter(ImageFilter.GaussianBlur(1.2))

    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    shadow_layer = Image.new("RGBA", (size, size), (77, 48, 38, 0))
    shadow_layer.putalpha(shadow)
    out.alpha_composite(shadow_layer)
    paper = material.convert("RGBA")
    paper.putalpha(mask)
    out.alpha_composite(paper)
    edge = Image.new("RGBA", (size, size), (83, 49, 31, 0))
    edge.putalpha(lower_edge.point(lambda value: round(value * 0.45)))
    out.alpha_composite(edge)
    save_webp(out, PIECES / f"{name}.webp", quality=86)

    ghost = Image.new("RGBA", (size, size), (151, 119, 76, 0))
    ghost.putalpha(mask.point(lambda value: round(value * 0.23)))
    save_webp(ghost, PIECES / f"ghost-{name}.webp", quality=88, lossless=True)


def textured_plate(size: tuple[int, int], outer: Image.Image, inner: Image.Image | None = None, *, radius: int = 52) -> Image.Image:
    w, h = size
    canvas = Image.new("RGBA", size, (0, 0, 0, 0))
    shadow_mask = Image.new("L", size, 0)
    ImageDraw.Draw(shadow_mask).rounded_rectangle((20, 22, w - 20, h - 13), radius=radius, fill=150)
    shadow_mask = shadow_mask.filter(ImageFilter.GaussianBlur(9))
    shadow = Image.new("RGBA", size, (74, 42, 30, 0))
    shadow.putalpha(shadow_mask)
    canvas.alpha_composite(shadow)

    outer_mask = Image.new("L", size, 0)
    ImageDraw.Draw(outer_mask).rounded_rectangle((18, 14, w - 18, h - 24), radius=radius, fill=255)
    outer_fill = cover(outer.convert("RGB"), size).convert("RGBA")
    outer_fill.putalpha(outer_mask)
    canvas.alpha_composite(outer_fill)

    if inner is not None:
        inset = max(24, round(min(w, h) * 0.055))
        inner_mask = Image.new("L", size, 0)
        ImageDraw.Draw(inner_mask).rounded_rectangle((18 + inset, 14 + inset, w - 18 - inset, h - 24 - inset), radius=max(18, radius - inset // 2), fill=255)
        inner_fill = cover(inner.convert("RGB"), size).convert("RGBA")
        inner_fill.putalpha(inner_mask)
        canvas.alpha_composite(inner_fill)
        stitch = ImageDraw.Draw(canvas)
        stitch.rounded_rectangle((18 + inset // 2, 14 + inset // 2, w - 18 - inset // 2, h - 24 - inset // 2), radius=radius, outline=(255, 245, 216, 210), width=5)
    return canvas


def main() -> None:
    for folder in (PIECES, SCENES, UI):
        folder.mkdir(parents=True, exist_ok=True)

    theatre = Image.open(SOURCE / "theatre-gpt-image-2.png").convert("RGB")
    theatre = cover(theatre, (1600, 1200))
    save_webp(theatre, ASSETS / "theatre.webp", quality=82)

    title_source = SOURCE / "title-layer2.png"
    if title_source.exists():
        title = alpha_crop(clean_qwen_alpha(Image.open(title_source)), 12)
    else:
        # Safe offline fallback: an opaque GPT Image 2 paper plaque on the same
        # warm cream stock as the theatre. Qwen layer_2 replaces this crop once
        # the configured external endpoint has been explicitly approved.
        opaque = Image.open(SOURCE / "title-opaque-gpt-image-2.png").convert("RGB")
        title = opaque.crop((130, 170, 1410, 820))
    scale = min(1.0, 1000 / title.width)
    title = title.resize((round(title.width * scale), round(title.height * scale)), Image.Resampling.LANCZOS)
    save_webp(title, ASSETS / "title.webp", quality=86)

    # Compose a dedicated splash plate. This keeps the safe opaque fallback
    # visually seamless without pretending it is transparent: the title's
    # paper field feathers into the accepted theatre paper at authoring time.
    splash = theatre.convert("RGBA")
    splash_title = title.copy()
    splash_scale = min(1.0, 820 / splash_title.width)
    splash_title = splash_title.resize((round(splash_title.width * splash_scale), round(splash_title.height * splash_scale)), Image.Resampling.LANCZOS)
    if "A" in splash_title.getbands():
        splash_mask = splash_title.getchannel("A")
    else:
        splash_mask = Image.new("L", splash_title.size, 0)
        inset = 28
        ImageDraw.Draw(splash_mask).rounded_rectangle(
            (inset, inset, splash_title.width - inset, splash_title.height - inset),
            radius=70, fill=255,
        )
        splash_mask = splash_mask.filter(ImageFilter.GaussianBlur(32))
    x = (splash.width - splash_title.width) // 2
    y = 105
    splash.paste(splash_title.convert("RGBA"), (x, y), splash_mask)
    save_webp(splash.convert("RGB"), ASSETS / "splash.webp", quality=82)

    scene_sheet = Image.open(SOURCE / "reveal-scenes-gpt-image-2.png").convert("RGB")
    for index, name in enumerate(("fox", "fish", "bird")):
        x0 = round(index * scene_sheet.width / 3)
        x1 = round((index + 1) * scene_sheet.width / 3)
        cell = scene_sheet.crop((x0 + 7, 7, x1 - 7, scene_sheet.height - 7))
        save_webp(cover(cell, (1200, 1200)), SCENES / f"{name}.webp", quality=82)

    swatches = material_swatches()
    polygons = {
        "large-a": [(0.13, 0.13), (0.87, 0.87), (0.13, 0.87)],
        "large-b": [(0.13, 0.13), (0.87, 0.87), (0.13, 0.87)],
        "medium": [(0.17, 0.17), (0.83, 0.83), (0.17, 0.83)],
        "small-a": [(0.22, 0.22), (0.78, 0.78), (0.22, 0.78)],
        "small-b": [(0.22, 0.22), (0.78, 0.78), (0.22, 0.78)],
        "square": [(0.19, 0.19), (0.81, 0.19), (0.81, 0.81), (0.19, 0.81)],
        "parallelogram": [(0.10, 0.27), (0.64, 0.27), (0.90, 0.73), (0.36, 0.73)],
    }
    for index, (name, color) in enumerate(PIECE_COLORS.items()):
        make_piece(name, swatches[color], polygons[name], 4100 + index)

    cream = theatre.crop((560, 330, 1072, 842)).resize((512, 512), Image.Resampling.LANCZOS)
    for name, color in (("fox-card", "coral"), ("fish-card", "blue"), ("bird-card", "green"), ("free-card", "violet")):
        save_webp(textured_plate((512, 620), swatches[color], cream, radius=44), UI / f"{name}.webp", quality=80)
    for name, color in (("play", "violet"), ("next", "blue"), ("again", "orange"), ("done", "green"), ("turn", "orange")):
        save_webp(textured_plate((512, 220), swatches[color], None, radius=88), UI / f"button-{name}.webp", quality=80)
    save_webp(textured_plate((760, 230), cream, None, radius=60), UI / "prompt-plate.webp", quality=80)
    save_webp(textured_plate((360, 180), cream, None, radius=64), UI / "badge.webp", quality=80)
    save_webp(textured_plate((1200, 280), cream, None, radius=68), UI / "tray.webp", quality=80)

    # The completion and rotation symbols are accepted GPT Image 2 papercraft,
    # not font glyphs or CSS/vector illustrations. The source sheet was matted
    # with the imagegen skill's chroma-key helper before this deterministic crop.
    icon_sheet = Image.open(SOURCE / "ui-icons-alpha.png").convert("RGBA")
    half = icon_sheet.width // 2
    icon_cells = {
        "completion-star": icon_sheet.crop((12, 12, half - 12, icon_sheet.height - 12)),
        "turn-clockwise": icon_sheet.crop((half + 12, 12, icon_sheet.width - 12, icon_sheet.height - 12)),
    }
    for name, cell in icon_cells.items():
        save_webp(square_icon(cell), UI / f"{name}.webp", quality=88)

    face_sheet = Image.open(SOURCE / "face-details-alpha.png").convert("RGBA")
    half = face_sheet.width // 2
    face_cells = {
        "face-eye": face_sheet.crop((12, 12, half - 12, face_sheet.height - 12)),
        "face-nose": face_sheet.crop((half + 12, 12, face_sheet.width - 12, face_sheet.height - 12)),
    }
    for name, cell in face_cells.items():
        save_webp(square_icon(cell), UI / f"{name}.webp", quality=88)

    report = {}
    for path in sorted(ASSETS.rglob("*.webp")):
        image = Image.open(path)
        alpha = image.getchannel("A") if "A" in image.getbands() else None
        report[str(path.relative_to(ROOT))] = {
            "width": image.width,
            "height": image.height,
            "bytes": path.stat().st_size,
            "alpha": alpha is not None,
            "transparentCorners": bool(alpha and all(alpha.getpixel(point) < 8 for point in ((0, 0), (image.width - 1, 0), (0, image.height - 1), (image.width - 1, image.height - 1)))),
        }
    (SOURCE / "finalize-report.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
