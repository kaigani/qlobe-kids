#!/usr/bin/env python3
"""Build deterministic Chalkboard Big Strokes runtime art from accepted sources."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image


GAME = Path(__file__).resolve().parents[1]
SOURCE = GAME / "assets/source"
FINAL = SOURCE / "final"
MAGENTA = SOURCE / "qa-magenta"
ART = GAME / "assets/art"
HUB = GAME.parents[1] / "assets/hub/tiles/chalkboard-big-strokes.jpg"

CUTOUTS = (
    "mode-card-cyan", "mode-card-yellow", "mode-card-pink", "mode-card-white",
    "button-plaque", "felt-eraser", "chalk-buddy", "chalk-pieces", "sparkle",
    "nav-home", "nav-sound", "nav-replay", "nav-back",
)


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def normalize_title() -> Path:
    source = SOURCE / "gpt-image-2/title-lockup-master.png"
    image = Image.open(source).convert("RGBA")
    alpha = image.getchannel("A").point(
        lambda value: 0 if value <= 7 else (255 if value >= 224 else value)
    )
    image.putalpha(alpha)
    bbox = alpha.getbbox()
    if bbox is None:
        raise RuntimeError("title lockup is empty")
    left, top, right, bottom = bbox
    pad = 16
    image = image.crop((max(0, left - pad), max(0, top - pad),
                        min(image.width, right + pad), min(image.height, bottom + pad)))
    if image.width > 1024:
        height = round(image.height * (1024 / image.width))
        image = image.resize((1024, height), Image.Resampling.LANCZOS)
    target = FINAL / "title-lockup.png"
    image.save(target, "PNG", optimize=True)
    review = Image.new("RGBA", image.size, (255, 0, 255, 255))
    review.alpha_composite(image)
    review.convert("RGB").save(MAGENTA / "title-lockup.png", "PNG", optimize=True)
    return target


def normalize_nav_back() -> Path:
    source = SOURCE / "gpt-image-2/nav-back-master.png"
    image = Image.open(source).convert("RGBA")
    alpha = image.getchannel("A").point(
        lambda value: 0 if value <= 7 else (255 if value >= 248 else value)
    )
    image.putalpha(alpha)
    bbox = alpha.getbbox()
    if bbox is None:
        raise RuntimeError("back button is empty")
    left, top, right, bottom = bbox
    pad = 12
    image = image.crop((max(0, left - pad), max(0, top - pad),
                        min(image.width, right + pad), min(image.height, bottom + pad)))
    if max(image.size) > 384:
        scale = 384 / max(image.size)
        image = image.resize(
            (round(image.width * scale), round(image.height * scale)), Image.Resampling.LANCZOS
        )
    target = FINAL / "nav-back.png"
    image.save(target, "PNG", optimize=True)
    review = Image.new("RGBA", image.size, (255, 0, 255, 255))
    review.alpha_composite(image)
    review.convert("RGB").save(MAGENTA / "nav-back.png", "PNG", optimize=True)
    return target


def encode_webp(source: Path, target: Path, *, quality: int) -> None:
    image = Image.open(source)
    image.save(target, "WEBP", quality=quality, method=6, exact=True)


def build_hub_tile() -> None:
    source = SOURCE / "gpt-image-2/hub-tile-master.png"
    image = Image.open(source).convert("RGBA")
    backdrop = Image.new("RGBA", image.size, (246, 222, 177, 255))
    backdrop.alpha_composite(image)
    image = backdrop.convert("RGB")
    target_ratio = 640 / 533
    source_ratio = image.width / image.height
    if source_ratio > target_ratio:
        width = round(image.height * target_ratio)
        left = (image.width - width) // 2
        image = image.crop((left, 0, left + width, image.height))
    elif source_ratio < target_ratio:
        height = round(image.width / target_ratio)
        top = (image.height - height) // 2
        image = image.crop((0, top, image.width, top + height))
    image = image.resize((640, 533), Image.Resampling.LANCZOS)
    HUB.parent.mkdir(parents=True, exist_ok=True)
    image.save(HUB, "JPEG", quality=91, optimize=True, progressive=True)


def main() -> None:
    FINAL.mkdir(parents=True, exist_ok=True)
    MAGENTA.mkdir(parents=True, exist_ok=True)
    ART.mkdir(parents=True, exist_ok=True)
    title = normalize_title()
    normalize_nav_back()
    board = SOURCE / "gpt-image-2/board-backdrop-master.png"
    encode_webp(board, ART / "board-backdrop.webp", quality=80)
    encode_webp(title, ART / "title-lockup.webp", quality=88)
    for name in CUTOUTS:
        source = FINAL / f"{name}.png"
        if not source.is_file():
            raise FileNotFoundError(source)
        encode_webp(source, ART / f"{name}.webp", quality=88)
    build_hub_tile()

    report = {
        "format": "qlobe-asset-build-report",
        "formatVersion": 1,
        "inputs": {
            str(path.relative_to(GAME)).replace("\\", "/"): digest(path)
            for path in (
                board, title, SOURCE / "gpt-image-2/hub-tile-master.png",
                SOURCE / "gpt-image-2/nav-back-master.png",
                *(FINAL / f"{name}.png" for name in CUTOUTS),
            )
        },
        "outputs": {
            str(path.relative_to(GAME)).replace("\\", "/"): {
                "sha256": digest(path), "bytes": path.stat().st_size,
            }
            for path in sorted(ART.glob("*.webp"))
        },
    }
    report["hubTile"] = {
        "path": str(HUB.relative_to(GAME.parents[1])).replace("\\", "/"),
        "sha256": digest(HUB), "bytes": HUB.stat().st_size,
    }
    (FINAL / "build-report.json").write_text(
        json.dumps(report, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps({"ok": True, "assets": len(report["outputs"])}, indent=2))


if __name__ == "__main__":
    main()
