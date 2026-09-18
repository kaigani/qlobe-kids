#!/usr/bin/env python3
"""Finalize accepted GPT Image 2 cutter inputs into runtime WebP assets.

This script performs only deterministic cropping, padding, downscaling, and
format conversion. It does not invent alpha, flood-fill, or chroma-key art.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

from PIL import Image


GAME = Path(__file__).resolve().parents[1]
SOURCE = GAME / "assets" / "source"

SPRITES = {
    "friend-blue": "characters/friend-blue.webp",
    "friend-yellow": "characters/friend-yellow.webp",
    "friend-blue-cheer": "characters/friend-blue-cheer.webp",
    "friend-yellow-cheer": "characters/friend-yellow-cheer.webp",
    "block-blue-long": "blocks/block-blue-long.webp",
    "block-yellow-long": "blocks/block-yellow-long.webp",
    "block-red-long": "blocks/block-red-long.webp",
    "block-green-long": "blocks/block-green-long.webp",
    "block-blue-square": "blocks/block-blue-square.webp",
    "block-yellow-square": "blocks/block-yellow-square.webp",
    "block-red-square": "blocks/block-red-square.webp",
    "block-green-square": "blocks/block-green-square.webp",
    "block-arch": "blocks/block-arch.webp",
    "block-roof": "blocks/block-roof.webp",
    "turn-token": "blocks/turn-token.webp",
    "tower-base": "blocks/tower-base.webp",
}
UI = {n: f"ui/{n}.webp" for n in ("sign-plaque", "player-card", "button-green", "button-blue")}


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def alpha_stats(im: Image.Image) -> dict[str, int] | None:
    if "A" not in im.getbands():
        return None
    a = im.getchannel("A")
    vals = list(a.getdata())
    if not vals or max(vals) == 0 or all(v == 255 for v in vals):
        raise ValueError("RGBA asset must contain both transparent and non-transparent pixels")
    return {"min": min(vals), "max": max(vals),
            "transparent": sum(v == 0 for v in vals),
            "opaque": sum(v == 255 for v in vals),
            "partial": sum(0 < v < 255 for v in vals)}


def prepare(path: Path, limit: int, alpha: bool) -> tuple[Image.Image, dict[str, Any]]:
    with Image.open(path) as opened:
        im = opened.convert("RGBA") if alpha else opened.convert("RGB")
    original = list(im.size)
    stats = alpha_stats(im) if alpha else None
    if alpha:
        channel = im.getchannel("A").point(lambda v: 0 if v <= 4 else v)
        bbox = channel.getbbox()
        if bbox is None:
            raise ValueError(f"empty alpha in {path}")
        im.putalpha(channel)
        pad = 12
        box = (max(0, bbox[0] - pad), max(0, bbox[1] - pad),
               min(im.width, bbox[2] + pad), min(im.height, bbox[3] + pad))
        im = im.crop(box)
    if max(im.size) > limit:
        scale = limit / max(im.size)
        im = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.Resampling.LANCZOS)
    return im, {"input_dimensions": original, "output_dimensions": list(im.size), "alpha": stats}


def save_one(src: Path, dest: Path, limit: int, alpha: bool, report: dict[str, Any]) -> None:
    if not src.is_file():
        raise FileNotFoundError(src)
    im, details = prepare(src, limit, alpha)
    dest.parent.mkdir(parents=True, exist_ok=True)
    im.save(dest, "WEBP", quality=90 if alpha else 88, method=6, exact=True)
    report[str(dest.relative_to(GAME))] = {"input": str(src.relative_to(GAME)), "sha256": sha256(src), **details, "output_size": dest.stat().st_size}


def run() -> dict[str, Any]:
    report: dict[str, Any] = {}
    src = SOURCE / "gpt-image-2" / "playroom-empty.png"
    if not src.is_file():
        raise FileNotFoundError(src)
    # Background is cover-cropped to the exact scene canvas.
    with Image.open(src) as opened:
        bg = opened.convert("RGB")
        input_dimensions = list(bg.size)
    scale = max(1280 / bg.width, 960 / bg.height)
    bg = bg.resize((round(bg.width * scale), round(bg.height * scale)), Image.Resampling.LANCZOS)
    left, top = (bg.width - 1280) // 2, (bg.height - 960) // 2
    scene = bg.crop((left, top, left + 1280, top + 960))
    dest = GAME / "assets/scenes/playroom.webp"
    dest.parent.mkdir(parents=True, exist_ok=True)
    scene.save(dest, "WEBP", quality=88, method=6)
    report[str(dest.relative_to(GAME))] = {"input": str(src.relative_to(GAME)), "sha256": sha256(src), "input_dimensions": input_dimensions, "output_dimensions": [1280, 960], "alpha": None, "output_size": dest.stat().st_size}
    for name, out in SPRITES.items():
        save_one(SOURCE / "gpt-image-2" / "sprites" / f"{name}.png", GAME / "assets" / out, 600 if "cheer" in name else 520 if name.startswith("friend") else 420, True, report)
    for name, out in UI.items():
        save_one(SOURCE / "gpt-image-2" / "ui-transparent" / f"{name}.png", GAME / "assets" / out, 900, True, report)
    (SOURCE / "processing.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Finalize turn-taking tower raster assets")
    parser.parse_args()
    try:
        result = run()
    except (FileNotFoundError, ValueError) as exc:
        parser.error(str(exc))
    print(json.dumps({"processed": len(result), "processing": str((SOURCE / 'processing.json').relative_to(GAME))}, separators=(",", ":")))


if __name__ == "__main__":
    main()
