#!/usr/bin/env python3
"""Deterministically finalize the accepted Block Tower Measure source art."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw


GAME = Path(__file__).resolve().parents[1]
REPO = GAME.parents[1]
SOURCE = GAME / "assets" / "source"
ART = GAME / "assets" / "art"
RESAMPLE = Image.Resampling.LANCZOS


def trim_alpha(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    box = rgba.getchannel("A").getbbox()
    if not box:
        raise ValueError("source contains no visible pixels")
    return rgba.crop(box)


def contain(image: Image.Image, size: tuple[int, int], padding: int = 8) -> Image.Image:
    image = trim_alpha(image)
    max_width = size[0] - padding * 2
    max_height = size[1] - padding * 2
    scale = min(max_width / image.width, max_height / image.height)
    rendered = image.resize(
        (max(1, round(image.width * scale)), max(1, round(image.height * scale))),
        RESAMPLE,
    )
    canvas = Image.new("RGBA", size, (0, 0, 0, 0))
    canvas.alpha_composite(
        rendered,
        ((size[0] - rendered.width) // 2, (size[1] - rendered.height) // 2),
    )
    return canvas


def save_webp(image: Image.Image, path: Path, *, quality: int = 92) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "WEBP", quality=quality, method=6, exact=True)


def crop_ratio(image: Image.Image, ratio: float) -> Image.Image:
    width, height = image.size
    current = width / height
    if current > ratio:
        target = round(height * ratio)
        left = (width - target) // 2
        return image.crop((left, 0, left + target, height))
    target = round(width / ratio)
    top = (height - target) // 2
    return image.crop((0, top, width, top + target))


def cells(image: Image.Image, columns: int, rows: int) -> list[Image.Image]:
    result = []
    for row in range(rows):
        for column in range(columns):
            left = round(column * image.width / columns)
            right = round((column + 1) * image.width / columns)
            top = round(row * image.height / rows)
            bottom = round((row + 1) * image.height / rows)
            result.append(image.crop((left, top, right, bottom)))
    return result


def make_qc(paths: list[Path]) -> None:
    tiles = []
    for path in paths:
        image = Image.open(path).convert("RGBA")
        image.thumbnail((300, 220), RESAMPLE)
        hostile = Image.new("RGBA", image.size, (34, 255, 88, 255))
        hostile.alpha_composite(image)
        tiles.append((path.name, hostile.convert("RGB")))

    tile_width, tile_height = 320, 255
    columns = 4
    rows = (len(tiles) + columns - 1) // columns
    sheet = Image.new("RGB", (tile_width * columns, tile_height * rows), "#151225")
    draw = ImageDraw.Draw(sheet)
    for index, (label, image) in enumerate(tiles):
        x = (index % columns) * tile_width
        y = (index // columns) * tile_height
        sheet.paste(image, (x + (tile_width - image.width) // 2, y + 8))
        draw.text((x + 10, y + 232), label, fill="white")
    sheet.save(SOURCE / "final-alpha-qc-green.jpg", "JPEG", quality=90, optimize=True)


def main() -> None:
    ART.mkdir(parents=True, exist_ok=True)

    backdrop = Image.open(SOURCE / "workshop-gpt-image-2.png").convert("RGB")
    backdrop = crop_ratio(backdrop, 4 / 3).resize((1440, 1080), RESAMPLE)
    save_webp(backdrop, ART / "workshop.webp", quality=86)

    title = contain(Image.open(SOURCE / "title-alpha-v3.png"), (1000, 600), 18)
    save_webp(title, ART / "title.webp", quality=93)

    robot = contain(Image.open(SOURCE / "robot-alpha-v3.png"), (640, 760), 16)
    save_webp(robot, ART / "robot-cheer.webp", quality=92)

    block_names = ["coral", "mustard", "teal", "lime", "violet"]
    block_atlas = Image.open(SOURCE / "block-atlas-alpha-v3.png").convert("RGBA")
    final_alpha: list[Path] = []
    for name, cell in zip(block_names, cells(block_atlas, 5, 1), strict=True):
        path = ART / f"block-{name}.webp"
        save_webp(contain(cell, (320, 320), 12), path, quality=93)
        final_alpha.append(path)

    # The generated items are separate, but the wide plaques deliberately use
    # more than one nominal grid-cell width. These reviewed source-coordinate
    # boxes avoid the neighboring slivers that equal 3×2 slicing would include.
    prop_specs = [
        ("ruler.webp", (180, 720), 8, (120, 48, 320, 575)),
        ("panel-cream.webp", (800, 320), 8, (370, 170, 960, 510)),
        ("mat-blue.webp", (720, 300), 8, (970, 165, 1510, 515)),
        ("star.webp", (300, 300), 8, (20, 575, 390, 960)),
        ("button-coral.webp", (680, 280), 8, (385, 625, 960, 945)),
        ("card-teal.webp", (720, 360), 8, (970, 615, 1510, 950)),
    ]
    prop_atlas = Image.open(SOURCE / "ui-atlas-alpha-v3.png").convert("RGBA")
    for filename, size, padding, box in prop_specs:
        path = ART / filename
        save_webp(contain(prop_atlas.crop(box), size, padding), path, quality=93)
        final_alpha.append(path)

    final_alpha.extend([ART / "title.webp", ART / "robot-cheer.webp"])
    make_qc(final_alpha)

    # Keep the hub art in the same papercraft world as the game. An evaluated
    # Krea→Qwen alternative failed count/style review and is not a production
    # dependency; this GPT Image 2 composition preserves the exact 2-vs-4 lesson.
    hub_source = SOURCE / "hub-tile-papercraft-gpt-image-2.png"
    hub = crop_ratio(Image.open(hub_source).convert("RGB"), 640 / 533)
    hub = hub.resize((640, 533), RESAMPLE)
    hub_target = REPO / "assets" / "hub" / "tiles" / "block-tower-measure.jpg"
    hub.save(hub_target, "JPEG", quality=91, optimize=True, progressive=True)
    print(f"{hub_target.relative_to(REPO)}\t{hub_target.stat().st_size} bytes")

    for path in sorted(ART.glob("*")):
        print(f"{path.relative_to(GAME)}\t{path.stat().st_size} bytes")


if __name__ == "__main__":
    main()
