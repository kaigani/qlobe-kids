#!/usr/bin/env python3
"""Build optimized runtime art from the approved Sweep the Trail masters."""

from __future__ import annotations

import json
import os
from pathlib import Path

from PIL import Image, ImageOps


GAME = Path(__file__).resolve().parents[1]
REPO = GAME.parents[1]
SOURCE = GAME / "assets" / "source"
OUT = GAME / "assets" / "art"
RESAMPLE = Image.Resampling.LANCZOS


def open_clean(path: Path) -> Image.Image:
    if not path.exists():
        raise FileNotFoundError(path)
    image = Image.open(path)
    image.load()
    return image


def save_scene(source: Path, name: str) -> dict:
    image = open_clean(source).convert("RGB")
    image = ImageOps.fit(image, (1600, 1200), method=RESAMPLE, centering=(0.5, 0.5))
    target = OUT / "backgrounds" / f"{name}.webp"
    target.parent.mkdir(parents=True, exist_ok=True)
    image.save(target, "WEBP", quality=86, method=6)
    return receipt(source, target, image)


def trim_alpha(image: Image.Image, pad_ratio: float = 0.035) -> Image.Image:
    image = image.convert("RGBA")
    alpha = image.getchannel("A")
    bbox = alpha.getbbox()
    if not bbox:
        raise ValueError("fully transparent input")
    image = image.crop(bbox)
    pad = max(8, round(max(image.size) * pad_ratio))
    canvas = Image.new("RGBA", (image.width + pad * 2, image.height + pad * 2), (0, 0, 0, 0))
    canvas.alpha_composite(image, (pad, pad))
    return canvas


def save_alpha(source: Path, category: str, name: str, max_size: int, quality: int = 90) -> dict:
    image = trim_alpha(open_clean(source))
    image.thumbnail((max_size, max_size), RESAMPLE)
    target = OUT / category / f"{name}.webp"
    target.parent.mkdir(parents=True, exist_ok=True)
    image.save(target, "WEBP", quality=quality, method=6, lossless=False)
    return receipt(source, target, image)


def receipt(source: Path, target: Path, image: Image.Image) -> dict:
    return {
        "source": Path(os.path.relpath(source, GAME)).as_posix(),
        "target": Path(os.path.relpath(target, GAME)).as_posix(),
        "width": image.width,
        "height": image.height,
        "bytes": target.stat().st_size,
    }


def main() -> None:
    gpt = SOURCE / "gpt-image-2"
    layered = SOURCE / "layered"
    cuts = SOURCE / "cuts" / "mode-cards"
    built: list[dict] = []

    built += [
        save_scene(gpt / "select-background-master.png", "select"),
        save_scene(gpt / "leaf-background-master.png", "leaf-lane"),
        save_scene(gpt / "acorn-background-master.png", "acorn-bend"),
        save_scene(gpt / "porch-background-master.png", "porch-path"),
    ]

    built.append(save_alpha(gpt / "title-lockup-master.png", "ui", "title", 1000, 92))
    for name in ("leaf-lane", "acorn-bend", "porch-path"):
        edited = gpt / f"mode-{name}-transparent-master.png"
        source = edited if edited.exists() else layered / f"card-{name}.png"
        if not source.exists():
            source = cuts / f"{name}.png"
        built.append(save_alpha(source, "ui", f"mode-{name}", 760, 90))

    built.append(save_alpha(gpt / "progress-plaque-transparent-master.png", "ui", "progress-plaque", 640, 90))
    built.append(save_alpha(gpt / "broom-transparent-master.png", "sprites", "broom", 700, 91))

    sizes = {
        "squirrel-idle": 640,
        "squirrel-cheer": 640,
        "basket": 520,
        "dustpan": 520,
        "leaf-orange": 280,
        "leaf-mustard": 280,
        "leaf-green": 280,
        "acorn": 280,
        "crumb": 280,
        "star-cluster": 440,
    }
    for name, max_size in sizes.items():
        built.append(save_alpha(layered / f"{name}.png", "sprites", name, max_size, 90))

    hub_source = SOURCE / "local-api" / "hub" / "hub-krea-seed-42.png"
    hub = ImageOps.fit(open_clean(hub_source).convert("RGB"), (640, 533), method=RESAMPLE)
    hub_target = REPO / "assets" / "hub" / "tiles" / "sweep-the-trail.jpg"
    hub_target.parent.mkdir(parents=True, exist_ok=True)
    hub.save(hub_target, "JPEG", quality=90, optimize=True, progressive=True, subsampling=1)
    built.append(receipt(hub_source, hub_target, hub))

    receipt_path = SOURCE / "finalize-receipt.json"
    receipt_path.write_text(json.dumps({"version": 1, "assets": built}, indent=2) + "\n", encoding="utf-8")
    total = sum(item["bytes"] for item in built)
    print(json.dumps({"assets": len(built), "runtimeBytes": total, "receipt": str(receipt_path)}, indent=2))


if __name__ == "__main__":
    main()
