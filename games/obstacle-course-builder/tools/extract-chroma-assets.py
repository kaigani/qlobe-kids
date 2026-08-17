#!/usr/bin/env python3
"""Rebuild the two production cutouts that cross contact-sheet cell edges.

The source sheets are retained GPT Image 2 masters.  Their backgrounds are
high-saturation chroma fields with slight lighting gradients, so extraction is
based on hue/saturation instead of an exact RGB match.
"""

from __future__ import annotations

import colorsys
from pathlib import Path

from PIL import Image


GAME = Path(__file__).resolve().parents[1]
SOURCE = GAME / "assets/source/gpt-image-2"


def smoothstep(edge0: float, edge1: float, value: float) -> float:
    value = max(0.0, min(1.0, (value - edge0) / (edge1 - edge0)))
    return value * value * (3.0 - 2.0 * value)


def hue_distance(a: float, b: float) -> float:
    distance = abs(a - b)
    return min(distance, 1.0 - distance)


def keep_components(image: Image.Image, count: int = 1) -> Image.Image:
    """Drop neighboring-cell crumbs without changing the intended cutout(s)."""
    alpha = image.getchannel("A")
    width, height = image.size
    values = alpha.get_flattened_data() if hasattr(alpha, "get_flattened_data") else alpha.getdata()
    foreground = {index for index, value in enumerate(values) if value > 16}
    components: list[set[int]] = []
    while foreground:
        seed = foreground.pop()
        component = {seed}
        stack = [seed]
        while stack:
            index = stack.pop()
            x, y = index % width, index // width
            for nx, ny in ((x - 1, y - 1), (x, y - 1), (x + 1, y - 1),
                           (x - 1, y),                 (x + 1, y),
                           (x - 1, y + 1), (x, y + 1), (x + 1, y + 1)):
                neighbor = ny * width + nx
                if 0 <= nx < width and 0 <= ny < height and neighbor in foreground:
                    foreground.remove(neighbor)
                    component.add(neighbor)
                    stack.append(neighbor)
        components.append(component)

    components.sort(key=len, reverse=True)
    keep = set().union(*components[:count]) if components else set()
    pixels = image.load()
    for y in range(height):
        for x in range(width):
            red, green, blue, value = pixels[x, y]
            if y * width + x not in keep or value <= 2:
                pixels[x, y] = (0, 0, 0, 0)
    return image


def extract(
    source: Path,
    crop: tuple[int, int, int, int],
    key_hue: float,
    output: Path,
    components: int = 1,
) -> None:
    image = Image.open(source).convert("RGB").crop(crop)
    rgba = Image.new("RGBA", image.size)
    source_pixels = image.load()
    output_pixels = rgba.load()

    for y in range(image.height):
        for x in range(image.width):
            red, green, blue = source_pixels[x, y]
            hue, saturation, _value = colorsys.rgb_to_hsv(red / 255, green / 255, blue / 255)
            hue_match = 1.0 - smoothstep(0.035, 0.13, hue_distance(hue, key_hue))
            saturation_match = smoothstep(0.28, 0.68, saturation)
            key_strength = hue_match * saturation_match
            alpha = round(255 * (1.0 - smoothstep(0.18, 0.82, key_strength)))
            output_pixels[x, y] = (red, green, blue, alpha)

    rgba = keep_components(rgba, components)
    bounds = rgba.getchannel("A").getbbox()
    if not bounds:
        raise RuntimeError(f"No foreground found in {source.name}")
    cutout = rgba.crop(bounds)
    max_content = 330
    scale = min(max_content / cutout.width, max_content / cutout.height, 1.25)
    size = (max(1, round(cutout.width * scale)), max(1, round(cutout.height * scale)))
    if size != cutout.size:
        cutout = cutout.resize(size, Image.Resampling.LANCZOS)

    # Lanczos can carry chroma RGB into fully transparent edge pixels.  Zeroing
    # those pixels prevents coloured seams in browsers that resample WebP.
    cutout_pixels = cutout.load()
    for y in range(cutout.height):
        for x in range(cutout.width):
            red, green, blue, alpha = cutout_pixels[x, y]
            if alpha <= 2:
                cutout_pixels[x, y] = (0, 0, 0, 0)

    canvas = Image.new("RGBA", (362, 362))
    origin = ((canvas.width - cutout.width) // 2, (canvas.height - cutout.height) // 2)
    canvas.alpha_composite(cutout, origin)
    output.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output, "WEBP", lossless=True, method=6)


def clean_existing(output: Path, components: int = 1) -> None:
    image = keep_components(Image.open(output).convert("RGBA"), components)
    image.save(output, "WEBP", lossless=True, method=6)


def main() -> None:
    extract(
        SOURCE / "jungle-sprites-master.png",
        (390, 725, 780, 1040),
        5 / 6,
        GAME / "assets/obstacles/jungle-fruit-carry.webp",
    )
    extract(
        SOURCE / "ui-kit-master.png",
        (370, 350, 735, 725),
        1 / 3,
        GAME / "assets/ui/finish-flag.webp",
    )
    extract(
        SOURCE / "backyard-sprites-master.png",
        (1035, 715, 1448, 1086),
        5 / 6,
        GAME / "assets/props/backyard-goal.webp",
    )
    extract(
        SOURCE / "jungle-sprites-master.png",
        (1035, 715, 1448, 1086),
        5 / 6,
        GAME / "assets/props/jungle-goal.webp",
    )
    extract(
        SOURCE / "ui-kit-master.png",
        (660, 700, 1055, 1065),
        1 / 3,
        GAME / "assets/ui/swatches.webp",
        components=3,
    )
    for relative in (
        "assets/obstacles/backyard-rainbow-tunnel.webp",
        "assets/obstacles/backyard-foam-block-carry.webp",
        "assets/guides/puppy-cheer.webp",
        "assets/guides/monkey-cheer.webp",
        "assets/guides/penguin-belly-slide.webp",
        "assets/props/foam-block.webp",
        "assets/props/fruit.webp",
        "assets/ui/scrap-basket.webp",
    ):
        clean_existing(GAME / relative)


if __name__ == "__main__":
    main()
