#!/usr/bin/env python3
"""Build the hub tile from the exact accepted Freeze runtime rasters."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter


GAME = Path(__file__).resolve().parents[1]
ROOT = GAME.parents[1]
SOURCE_OUT = GAME / "assets/source/assembled/freeze-focus-dance-hub-tile.png"
HUB_OUT = ROOT / "assets/hub/tiles/freeze-focus-dance.jpg"
SOURCE_SIZE = (768, 640)
HUB_SIZE = (640, 533)


def open_rgba(relative: str) -> Image.Image:
    return Image.open(GAME / relative).convert("RGBA")


def cover(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    scale = max(size[0] / image.width, size[1] / image.height)
    resized = image.resize(
        (round(image.width * scale), round(image.height * scale)),
        Image.Resampling.LANCZOS,
    )
    left = (resized.width - size[0]) // 2
    top = (resized.height - size[1]) // 2
    return resized.crop((left, top, left + size[0], top + size[1]))


def contain(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    scale = min(size[0] / image.width, size[1] / image.height)
    return image.resize(
        (max(1, round(image.width * scale)), max(1, round(image.height * scale))),
        Image.Resampling.LANCZOS,
    )


def paste_with_shadow(
    canvas: Image.Image,
    image: Image.Image,
    xy: tuple[int, int],
    *,
    offset: tuple[int, int] = (8, 12),
    blur: int = 12,
    opacity: int = 105,
) -> None:
    alpha = image.getchannel("A")
    shadow = Image.new("RGBA", image.size, (34, 17, 10, 0))
    shadow.putalpha(alpha.point(lambda value: value * opacity // 255).filter(ImageFilter.GaussianBlur(blur)))
    canvas.alpha_composite(shadow, (xy[0] + offset[0], xy[1] + offset[1]))
    canvas.alpha_composite(image, xy)


def main() -> None:
    background = cover(open_rgba("assets/scenes/forest-day.webp"), SOURCE_SIZE).convert("RGB")
    background = ImageEnhance.Color(background).enhance(1.04)
    background = ImageEnhance.Contrast(background).enhance(1.03)
    canvas = background.convert("RGBA")

    ground_shadow = Image.new("RGBA", SOURCE_SIZE, (0, 0, 0, 0))
    draw = ImageDraw.Draw(ground_shadow)
    draw.ellipse((250, 532, 660, 618), fill=(47, 25, 13, 105))
    ground_shadow = ground_shadow.filter(ImageFilter.GaussianBlur(18))
    canvas.alpha_composite(ground_shadow)

    owl = contain(open_rgba("assets/animals/owl-reveal.webp"), (160, 180))
    star = contain(open_rgba("assets/ui/focus-star.webp"), (190, 190))
    snowflake = contain(open_rgba("assets/ui/snowflake.webp"), (155, 155))
    pip = contain(open_rgba("assets/characters/pip-dance.webp"), (455, 520))

    paste_with_shadow(canvas, owl, (66, 145), offset=(6, 8), blur=9, opacity=85)
    paste_with_shadow(canvas, star, (48, 414), offset=(7, 10), blur=11, opacity=95)
    paste_with_shadow(canvas, snowflake, (568, 128), offset=(7, 9), blur=10, opacity=95)
    paste_with_shadow(canvas, pip, (260, 78), offset=(10, 14), blur=14, opacity=110)

    SOURCE_OUT.parent.mkdir(parents=True, exist_ok=True)
    canvas.convert("RGB").save(SOURCE_OUT, format="PNG", optimize=True)
    HUB_OUT.parent.mkdir(parents=True, exist_ok=True)
    canvas.convert("RGB").resize(HUB_SIZE, Image.Resampling.LANCZOS).save(
        HUB_OUT,
        format="JPEG",
        quality=92,
        optimize=True,
        progressive=True,
    )


if __name__ == "__main__":
    main()
