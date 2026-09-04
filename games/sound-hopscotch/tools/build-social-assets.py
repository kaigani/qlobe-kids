#!/usr/bin/env python3
"""Build the catalog tile and social card from finalized Sound Hopscotch art."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


GAME = Path(__file__).resolve().parents[1]
ROOT = GAME.parents[1]
ASSETS = GAME / "assets"
FONT = ROOT / "shared" / "fonts" / "fredoka-latin-600-normal.woff2"


def cover(source: Path, size: tuple[int, int]) -> Image.Image:
    image = Image.open(source).convert("RGB")
    scale = max(size[0] / image.width, size[1] / image.height)
    image = image.resize((round(image.width * scale), round(image.height * scale)), Image.Resampling.LANCZOS)
    left = (image.width - size[0]) // 2
    top = (image.height - size[1]) // 2
    return image.crop((left, top, left + size[0], top + size[1])).convert("RGBA")


def contain(source: Path, size: tuple[int, int]) -> Image.Image:
    image = Image.open(source).convert("RGBA")
    image.thumbnail(size, Image.Resampling.LANCZOS)
    return image


def paste_center(canvas: Image.Image, image: Image.Image, center: tuple[int, int]) -> None:
    canvas.alpha_composite(image, (round(center[0] - image.width / 2), round(center[1] - image.height / 2)))


def letter_pad(color: str, letter: str, size: int) -> Image.Image:
    tile = contain(ASSETS / "pads" / f"pad-{color}.webp", (size, size))
    layer = Image.new("RGBA", tile.size)
    draw = ImageDraw.Draw(layer)
    font = ImageFont.truetype(str(FONT), round(size * .48))
    bbox = draw.textbbox((0, 0), letter, font=font, stroke_width=max(2, size // 45))
    x = (tile.width - (bbox[2] - bbox[0])) / 2 - bbox[0]
    y = (tile.height - (bbox[3] - bbox[1])) / 2 - bbox[1] - size * .015
    draw.text((x, y), letter, font=font, fill=(82, 51, 46), stroke_width=max(2, size // 45), stroke_fill=(255, 249, 221))
    tile.alpha_composite(layer)
    return tile


def save_jpeg(image: Image.Image, destination: Path, quality: int = 90) -> dict:
    destination.parent.mkdir(parents=True, exist_ok=True)
    image.convert("RGB").save(destination, "JPEG", quality=quality, optimize=True, progressive=True)
    payload = destination.read_bytes()
    return {"file": str(destination.relative_to(ROOT)).replace("\\", "/"), "bytes": len(payload), "sha256": hashlib.sha256(payload).hexdigest()}


def build_hub() -> dict:
    canvas = cover(ASSETS / "backgrounds" / "meadow.webp", (640, 533))
    bunny = contain(ASSETS / "characters" / "bunny-hop.webp", (270, 265))
    paste_center(canvas, bunny, (365, 205))
    for x, color, letter, angle in [(115, "coral", "A", -4), (320, "yellow", "M", 2), (525, "blue", "S", 5)]:
        tile = letter_pad(color, letter, 178).rotate(angle, Image.Resampling.BICUBIC, expand=True)
        paste_center(canvas, tile, (x, 418))
    return save_jpeg(canvas, ROOT / "assets" / "hub" / "tiles" / "sound-hopscotch.jpg", 91)


def build_og() -> dict:
    canvas = cover(ASSETS / "backgrounds" / "meadow.webp", (1200, 630))
    title = contain(ASSETS / "title.webp", (585, 280))
    paste_center(canvas, title, (355, 168))
    bunny = contain(ASSETS / "characters" / "bunny-hop.webp", (390, 390))
    paste_center(canvas, bunny, (900, 228))
    for x, color, letter, angle in [(215, "coral", "A", -4), (485, "yellow", "M", 2), (755, "blue", "S", 5)]:
        tile = letter_pad(color, letter, 205).rotate(angle, Image.Resampling.BICUBIC, expand=True)
        paste_center(canvas, tile, (x, 515))
    return save_jpeg(canvas, ASSETS / "og-image.jpg", 91)


def main() -> None:
    results = [build_hub(), build_og()]
    recipe = {
        "recipeVersion": "qlobe-recipe-v1",
        "method": "deterministic Pillow composite of finalized GPT Image 2 assets",
        "referenceOnly": {
            "file": "games/sound-hopscotch/assets/source/local-api/krea-hub-seed42.png",
            "workflow": "krea2-turbo-t2i",
            "seed": 42,
            "decision": "retained as exploration; not shipped because the bow moved from the character's neck to its head"
        },
        "sources": [
            "games/sound-hopscotch/assets/backgrounds/meadow.webp",
            "games/sound-hopscotch/assets/title.webp",
            "games/sound-hopscotch/assets/characters/bunny-hop.webp",
            "games/sound-hopscotch/assets/pads/pad-coral.webp",
            "games/sound-hopscotch/assets/pads/pad-yellow.webp",
            "games/sound-hopscotch/assets/pads/pad-blue.webp"
        ],
        "outputs": results
    }
    target = ASSETS / "source" / "local-api" / "social-assets.recipe.json"
    target.write_text(json.dumps(recipe, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
