#!/usr/bin/env python3
"""Finalize GPT Image 2 stage sources into consistent runtime JPEGs."""

from __future__ import annotations

from pathlib import Path

from PIL import Image

GAME = Path(__file__).resolve().parents[1]
SOURCE = GAME / "assets" / "source" / "gpt-image-2-stage-expansion"
OUTPUT = GAME / "assets" / "bg"
STAGES = ("enchanted-castle", "moon-adventure", "forest-cottage")


def main() -> None:
    for name in STAGES:
        image = Image.open(SOURCE / f"{name}.png").convert("RGB")
        source_ratio = image.width / image.height
        target_ratio = 4 / 3
        if source_ratio > target_ratio:
            width = round(image.height * target_ratio)
            left = (image.width - width) // 2
            image = image.crop((left, 0, left + width, image.height))
        elif source_ratio < target_ratio:
            height = round(image.width / target_ratio)
            top = (image.height - height) // 2
            image = image.crop((0, top, image.width, top + height))
        image = image.resize((1400, 1050), Image.Resampling.LANCZOS)
        destination = OUTPUT / f"{name}.jpg"
        image.save(destination, "JPEG", quality=88, optimize=True, progressive=True)
        print(f"{destination.relative_to(GAME)} {destination.stat().st_size // 1024}KB")


if __name__ == "__main__":
    main()
