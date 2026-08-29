#!/usr/bin/env python3
"""Prepare deterministic, locally sourced raster assets for Beat the Bugs."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


GAME_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = GAME_ROOT.parents[1]

SPLASH = GAME_ROOT / "assets/source/gpt-image-2/mockups/01-splash.png"
AQUA = GAME_ROOT / "assets/source/gpt-image-2/background-lab-aqua.png"
CORAL = GAME_ROOT / "assets/source/gpt-image-2/background-lab-coral.png"
MAYA = REPO_ROOT / "shared/characters/maya/portrait.png"

CROPS = {
    "title.png": (200, 45, 1270, 320),
    "mission-suds.png": (200, 525, 730, 1025),
    "mission-smile.png": (710, 525, 1245, 1025),
}


def outputs() -> list[Path]:
    return [
        *(GAME_ROOT / "assets/source/crops/splash" / name for name in CROPS),
        *(GAME_ROOT / "assets/bg" / name for name in ("splash.webp", "suds.webp", "finale.webp", "smile.webp", "splash-portrait.webp")),
        GAME_ROOT / "assets/hero-maya.webp",
    ]


def sources() -> list[Path]:
    return [SPLASH, AQUA, CORAL, MAYA]


def check() -> int:
    missing = [str(path.relative_to(REPO_ROOT)) for path in sources() if not path.is_file()]
    if missing:
        print("Missing source(s): " + ", ".join(missing))
        return 1
    print("Sources OK")
    for path in outputs():
        print(f"planned {path.relative_to(REPO_ROOT)}")
    return 0


def save_webp(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.convert("RGBA").save(path, "WEBP", lossless=True, method=6)


def build() -> None:
    crop_dir = GAME_ROOT / "assets/source/crops/splash"
    crop_dir.mkdir(parents=True, exist_ok=True)
    with Image.open(SPLASH) as source:
        source = source.convert("RGBA")
        for name, box in CROPS.items():
            source.crop(box).save(crop_dir / name, "PNG")

    with Image.open(AQUA) as aqua:
        aqua = aqua.convert("RGBA")
        for name in ("splash.webp", "suds.webp", "finale.webp"):
            save_webp(aqua, GAME_ROOT / "assets/bg" / name)
        width, height = aqua.size
        crop_width = round(height * 3 / 4)
        left = (width - crop_width) // 2
        portrait = aqua.crop((left, 0, left + crop_width, height)).resize((900, 1200), Image.Resampling.LANCZOS)
        save_webp(portrait, GAME_ROOT / "assets/bg/splash-portrait.webp")

    with Image.open(CORAL) as coral:
        save_webp(coral, GAME_ROOT / "assets/bg/smile.webp")
    with Image.open(MAYA) as maya:
        save_webp(maya, GAME_ROOT / "assets/hero-maya.webp")

    for path in outputs():
        with Image.open(path) as image:
            print(f"wrote {path.relative_to(REPO_ROOT)} {image.width}x{image.height}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="validate sources and print planned outputs without writing")
    args = parser.parse_args()
    result = check()
    if args.check or result:
        return result
    build()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
