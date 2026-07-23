#!/usr/bin/env python3
"""Build Story Stones production props, stones, backdrop, and hub art.

AI outputs stay in assets/source. This deterministic pass gives runtime assets
stable canvases and keeps all thumbnails visually consistent with the game.
"""

from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
GAME = ROOT / "games/story-stones"
ASSETS = GAME / "assets"
ACTORS = ["dragon", "orange-cat", "white-cat", "friendly-monster", "owl"]
PROPS = ["croissant", "rose", "magic-rock", "treasure-chest", "golden-key", "magic-bag", "wishing-star"]


def contain_alpha(source: Path, size: int, inset: int = 34) -> Image.Image:
    image = Image.open(source).convert("RGBA")
    box = image.getbbox()
    if not box:
        raise ValueError(f"No visible pixels in {source}")
    image = image.crop(box)
    scale = min((size - inset * 2) / image.width, (size - inset * 2) / image.height)
    image = image.resize((round(image.width * scale), round(image.height * scale)), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (size, size))
    canvas.alpha_composite(image, ((size - image.width) // 2, (size - image.height) // 2))
    return canvas


def build_props() -> None:
    output = ASSETS / "props"
    output.mkdir(parents=True, exist_ok=True)
    for prop in PROPS:
        image = contain_alpha(ASSETS / "source/props-alpha" / f"{prop}.png", 640, 28)
        image.save(output / f"{prop}.webp", "WEBP", lossless=True, method=6)


def stone_art(item: str, color: str, source: Path) -> Image.Image:
    size = 512
    image = Image.new("RGBA", (size, size))
    draw = ImageDraw.Draw(image)
    draw.ellipse((22, 34, 490, 482), fill="#fff3cf", outline="#292137", width=18)
    draw.ellipse((48, 58, 464, 450), fill=color, outline="#f7d985", width=9)
    draw.arc((72, 75, 438, 418), 194, 326, fill="#ffffff88", width=13)
    art = contain_alpha(source, 380, 14)
    image.alpha_composite(art, (66, 62))
    return image


def build_stones() -> None:
    colors = {
        "dragon": "#f3bd38", "orange-cat": "#ee8d38", "white-cat": "#8fc9dd",
        "friendly-monster": "#a77bc8", "owl": "#ce8b3f", "croissant": "#e8a642",
        "rose": "#dd6254", "magic-rock": "#4ca3c8", "treasure-chest": "#d28c3d",
        "golden-key": "#efbd3b", "magic-bag": "#d3a05b", "wishing-star": "#f0bd38",
    }
    output = ASSETS / "stones"
    output.mkdir(parents=True, exist_ok=True)
    for actor in ACTORS:
        source = ASSETS / "pose-actors" / actor / "poses/neutral.webp"
        stone_art(actor, colors[actor], source).resize((256, 256), Image.Resampling.LANCZOS).save(output / f"{actor}.png")
    for prop in PROPS:
        source = ASSETS / "props" / f"{prop}.webp"
        stone_art(prop, colors[prop], source).resize((256, 256), Image.Resampling.LANCZOS).save(output / f"{prop}.png")


def build_backdrop_and_hub() -> None:
    source = ASSETS / "source/backdrops/castle-meadow-gpt-image-2-v2.png"
    backdrop = Image.open(source).convert("RGB")
    backdrop.save(ASSETS / "backdrops/castle-meadow-storybook.webp", "WEBP", quality=91, method=6)

    hub = backdrop.resize((900, 506), Image.Resampling.LANCZOS).convert("RGBA")
    placements = [("orange-cat", 40, 176, 280), ("dragon", 310, 118, 335), ("friendly-monster", 650, 182, 255)]
    for actor, x, y, size in placements:
        art = contain_alpha(ASSETS / "pose-actors" / actor / "poses/neutral.webp", size, 3)
        hub.alpha_composite(art, (x, y))
    hub.convert("RGB").save(ROOT / "assets/hub/tiles/story-stones.jpg", quality=90, optimize=True)


def main() -> None:
    build_props()
    build_stones()
    build_backdrop_and_hub()
    print("Built 7 props, 12 stones, storybook backdrop, and hub tile.")


if __name__ == "__main__":
    main()
