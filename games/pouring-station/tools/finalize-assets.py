#!/usr/bin/env python3
"""Finalize Pouring Station's reviewed raster sources into runtime WebP files.

The Studio's layered workflow remains the preferred cutout path. The four
compound props that Qwen split semantically (wood token centres / cloth tie)
use deterministic chroma removal from the GPT Image 2 sheet after that sheet
has passed the repository's exact-six-object cutter.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


GAME = Path(__file__).resolve().parents[1]
ROOT = GAME.parents[1]
ASSETS = GAME / "assets"
SOURCE = ASSETS / "source"
FINAL = SOURCE / "finalized"
QA = SOURCE / "qa"


def trim_pad(image: Image.Image, max_size: int, pad: int = 16) -> Image.Image:
    image = image.convert("RGBA")
    alpha = image.getchannel("A").point(lambda value: 0 if value <= 4 else value)
    image.putalpha(alpha)
    box = alpha.getbbox()
    if box is None:
        raise ValueError("empty cutout")
    left, top, right, bottom = box
    left, top = max(0, left - pad), max(0, top - pad)
    right, bottom = min(image.width, right + pad), min(image.height, bottom + pad)
    image = image.crop((left, top, right, bottom))
    if max(image.size) > max_size:
        scale = max_size / max(image.size)
        image = image.resize((round(image.width * scale), round(image.height * scale)), Image.Resampling.LANCZOS)
    return image


def chroma_magenta(path: Path, max_size: int = 512) -> Image.Image:
    image = Image.open(path).convert("RGBA")
    rgba = np.asarray(image).astype(np.float32)
    rgb = rgba[..., :3]
    key = np.array([255.0, 0.0, 255.0], dtype=np.float32)
    distance = np.linalg.norm(rgb - key, axis=2)
    coverage = np.clip((distance - 10.0) / 72.0, 0.0, 1.0)
    coverage *= rgba[..., 3] / 255.0

    # Remove the key colour from anti-aliased edge pixels instead of leaving a
    # pink fringe. Fully covered pixels remain byte-identical to the source.
    safe = np.maximum(coverage[..., None], 1.0 / 255.0)
    clean = (rgb - key * (1.0 - coverage[..., None])) / safe
    clean = np.clip(clean, 0.0, 255.0)
    clean[coverage <= 0.0] = 0.0
    out = np.dstack((clean, coverage * 255.0)).astype(np.uint8)
    return trim_pad(Image.fromarray(out, "RGBA"), max_size=max_size)


def magenta_qa(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    backdrop = Image.new("RGBA", image.size, (255, 0, 255, 255))
    backdrop.alpha_composite(image)
    backdrop.convert("RGB").save(path, "PNG", optimize=True)


def save_png(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "PNG", optimize=True)


def save_webp(image: Image.Image, path: Path, *, quality: int = 90) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "WEBP", quality=quality, method=6)


def material_tile(stream: Image.Image, mode: str) -> Image.Image:
    subject = trim_pad(stream, max_size=560, pad=0)
    if mode == "water":
        # Turn a generated vertical flow sample into a seamless-looking broad
        # liquid surface while preserving its authored bubbles and highlights.
        sample_height = min(subject.height, max(80, subject.height // 5))
        left = round(subject.width * .38)
        right = round(subject.width * .62)
        top = max(0, (subject.height - sample_height) // 2)
        sample = subject.crop((left, top, right, min(subject.height, top + sample_height)))
        tile = sample.resize((256, 256), Image.Resampling.LANCZOS)
        tile = tile.filter(ImageFilter.GaussianBlur(.45))
        return tile
    side = min(subject.width, subject.height)
    left = max(0, (subject.width - side) // 2)
    top = max(0, (subject.height - side) // 2)
    sample = subject.crop((left, top, left + side, top + side))
    return sample.resize((256, 256), Image.Resampling.LANCZOS)


def main() -> None:
    scene = Image.open(SOURCE / "gpt-image-2" / "kitchen-tray.png").convert("RGB")
    save_webp(scene, ASSETS / "scenes" / "kitchen-tray.webp", quality=87)

    # Preferred true-alpha candidates, already inspected and alpha-gated by
    # tools/pipeline/cutout_finalize.py.
    layered = {
        "pitcher": ("items/pitcher.webp", 720),
        "cup": ("items/cup.webp", 640),
        "maya-helper": ("characters/maya-helper.webp", 720),
        "title-plaque": ("ui/title-plaque.webp", 720),
        "prompt-plaque": ("ui/prompt-plaque.webp", 640),
        "stream-water": ("items/stream-water.webp", 720),
        "stream-beans": ("items/stream-beans.webp", 720),
        "stream-rice": ("items/stream-rice.webp", 720),
        "water": ("ui/token-water.webp", 512),
    }
    finalized: dict[str, Image.Image] = {}
    for name, (runtime, size) in layered.items():
        path = FINAL / f"{name}.png"
        if name == "cup" and not path.exists():
            # The cup is intentionally translucent, so the generic cutout gate
            # reports zero fully opaque pixels even though its alpha silhouette
            # and magenta composite pass human review.
            path = SOURCE / "layered" / "cup.layer2.png"
        if not path.exists():
            raise FileNotFoundError(f"reviewed layered source missing: {path}")
        image = trim_pad(Image.open(path), max_size=size)
        finalized[name] = image
        if name == "cup":
            save_png(image, FINAL / "cup-transparent-reviewed.png")
        save_webp(image, ASSETS / runtime)

    hand = trim_pad(Image.open(SOURCE / "layered" / "hand.layer2.png"), max_size=512)
    save_png(hand, FINAL / "guide-hand.png")
    magenta_qa(hand, QA / "guide-hand-magenta.png")
    save_webp(hand, ASSETS / "ui" / "guide-hand.webp")

    # These objects contain meaningful internal parts that the semantic
    # layered model separated incorrectly. Their exact chroma crops came from
    # the mandatory repository cutter and are keyed as complete silhouettes.
    keyed = {
        "beans": "ui/token-beans.webp",
        "rice": "ui/token-rice.webp",
        "star": "ui/reward-star.webp",
        "cloth": "ui/cleanup-cloth.webp",
    }
    for name, runtime in keyed.items():
        image = chroma_magenta(SOURCE / "crops" / f"{name}.png")
        save_png(image, FINAL / f"{name}-complete-keyed.png")
        magenta_qa(image, QA / f"{name}-complete-keyed-magenta.png")
        save_webp(image, ASSETS / runtime)

    for mode in ("water", "beans", "rice"):
        tile = material_tile(finalized[f"stream-{mode}"], mode)
        save_webp(tile, ASSETS / "items" / f"fill-{mode}.webp", quality=88)

    krea = SOURCE / "krea" / "hub-seed42.png"
    if krea.exists():
        hub = Image.open(krea).convert("RGB")
        target_ratio = 640 / 533
        ratio = hub.width / hub.height
        if ratio > target_ratio:
            width = round(hub.height * target_ratio)
            left = (hub.width - width) // 2
            hub = hub.crop((left, 0, left + width, hub.height))
        elif ratio < target_ratio:
            height = round(hub.width / target_ratio)
            top = (hub.height - height) // 2
            hub = hub.crop((0, top, hub.width, top + height))
        hub = hub.resize((640, 533), Image.Resampling.LANCZOS)
        hub_path = ROOT / "assets" / "hub" / "tiles" / "pouring-station.jpg"
        hub_path.parent.mkdir(parents=True, exist_ok=True)
        hub.save(hub_path, "JPEG", quality=90, optimize=True, progressive=True)


if __name__ == "__main__":
    main()
