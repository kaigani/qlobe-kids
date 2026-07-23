#!/usr/bin/env python3
"""Normalize Story Stones pose cutouts onto a stable 1024px stage canvas.

Source alpha PNGs remain editable under assets/source/pose-alpha. Runtime WebP
files share one baseline/anchor so paper-pop swaps do not visibly jump.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
GAME = ROOT / "games" / "story-stones"
POSES = ("neutral", "enter", "notice", "interact", "react", "celebrate")
CANVAS = 1024
MAX_ART = 900
BASELINE = 972


def normalized(source: Path) -> Image.Image:
    image = Image.open(source).convert("RGBA")
    alpha = image.getchannel("A")
    box = alpha.getbbox()
    if not box:
        raise ValueError(f"{source} has no visible pixels")
    image = image.crop(box)
    scale = min(MAX_ART / image.width, MAX_ART / image.height, 1.0)
    size = (max(1, round(image.width * scale)), max(1, round(image.height * scale)))
    if size != image.size:
        image = image.resize(size, Image.Resampling.LANCZOS)
    output = Image.new("RGBA", (CANVAS, CANVAS))
    left = round((CANVAS - image.width) / 2)
    top = BASELINE - image.height
    if top < 20:
        raise ValueError(f"{source} cannot fit the normalized stage canvas")
    output.alpha_composite(image, (left, top))
    return output


def build_actor(actor_id: str, label: str | None = None) -> dict:
    source_dir = GAME / "assets" / "source" / "pose-alpha" / actor_id
    output_dir = GAME / "assets" / "pose-actors" / actor_id / "poses"
    output_dir.mkdir(parents=True, exist_ok=True)
    poses = {}
    for pose in POSES:
        source = source_dir / f"{pose}.png"
        if not source.exists():
            raise FileNotFoundError(source)
        output = output_dir / f"{pose}.webp"
        normalized(source).save(output, "WEBP", quality=90, method=6, exact=True)
        poses[pose] = {
            "art": f"poses/{pose}.webp",
            "alt": f"{label or actor_id.replace('-', ' ').title()} — {pose} pose",
        }
    manifest = {
        "format": "qlobe-pose-actor",
        "formatVersion": 1,
        "id": actor_id,
        "label": label or actor_id.replace("-", " ").title(),
        "canvas": [CANVAS, CANVAS],
        "anchor": [0.5, BASELINE / CANVAS],
        "transition": {"kind": "paper-pop", "durationMs": 220},
        "poses": poses,
    }
    path = output_dir.parent / "poses.json"
    path.write_text(json.dumps(manifest, indent=2) + "\n")
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("actor")
    parser.add_argument("--label")
    args = parser.parse_args()
    manifest = build_actor(args.actor, args.label)
    print(f"built {manifest['id']}: {len(manifest['poses'])} poses")


if __name__ == "__main__":
    main()
