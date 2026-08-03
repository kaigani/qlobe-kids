#!/usr/bin/env python3
"""Trim and resize the transparent GPT Image 2 UI masters for runtime use."""

from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets/source/raster-ui/alpha"
OUTPUT = ROOT / "assets/ui"

MAX_WIDTHS = {
    "prompt-panel": 900,
    "passport-book": 1200,
    "end-card": 920,
    "confetti": 1440,
    "map-pin": 260,
    "passport-cover": 300,
    "seal-leaf": 180,
    "seal-paw": 180,
    "seal-star": 180,
    "stamp-star": 150,
    "button-play": 390,
    "button-spin": 390,
    "button-stamp": 430,
    "button-replay": 390,
}


def trim_with_padding(image: Image.Image, padding: int) -> Image.Image:
    bbox = image.getchannel("A").getbbox()
    if not bbox:
        raise ValueError("image has no visible pixels")
    left, top, right, bottom = bbox
    return image.crop((
        max(0, left - padding),
        max(0, top - padding),
        min(image.width, right + padding),
        min(image.height, bottom + padding),
    ))


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for name, max_width in MAX_WIDTHS.items():
        image = Image.open(SOURCE / f"{name}.png").convert("RGBA")
        # The confetti is a full-screen overlay; every other piece is tightly
        # cropped so its transparent source canvas cannot distort layout.
        if name != "confetti":
            image = trim_with_padding(image, max(8, round(image.width * 0.012)))
        if image.width > max_width:
            height = round(image.height * max_width / image.width)
            image = image.resize((max_width, height), Image.Resampling.LANCZOS)
        image.save(OUTPUT / f"{name}.webp", "WEBP", quality=84, method=6)
        print(f"{name}.webp {image.width}x{image.height}")


if __name__ == "__main__":
    main()
