#!/usr/bin/env python3
"""Finalize Pattern Train's approved GPT Image 2 sheets into runtime art.

The shared cutter owns object detection and immutable source crops. This script
only removes the wide low-alpha generation glow, trims transparent padding,
resizes with Lanczos, and writes quality-optimized WebP runtime derivatives
plus a magenta alpha QC contact sheet. It never edits the source masters or
cutter manifests.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageChops, ImageFilter


GAME = Path(__file__).resolve().parents[1]
SOURCE = GAME / "assets" / "source"
ART = GAME / "assets" / "art"
TOKENS = ART / "tokens"
QA = SOURCE / "qa"


def clean_alpha(path: Path, *, max_size: tuple[int, int]) -> Image.Image:
    image = Image.open(path).convert("RGBA")
    alpha = image.getchannel("A")

    # GPT Image 2 keeps the subject alpha-clean but may add a broad colored
    # glow at very low opacity. Keep the original antialiasing only near the
    # high-confidence opaque subject core; discard distant haze.
    core = alpha.point(lambda value: 255 if value >= 150 else 0)
    near_subject = core.filter(ImageFilter.MaxFilter(17))
    cleaned_alpha = ImageChops.multiply(alpha, near_subject)
    image.putalpha(cleaned_alpha)

    bbox = cleaned_alpha.point(lambda value: 255 if value > 6 else 0).getbbox()
    if not bbox:
        raise ValueError(f"no visible subject after alpha cleanup: {path}")
    pad = 4
    left, top, right, bottom = bbox
    bbox = (
        max(0, left - pad),
        max(0, top - pad),
        min(image.width, right + pad),
        min(image.height, bottom + pad),
    )
    image = image.crop(bbox)
    image.thumbnail(max_size, Image.Resampling.LANCZOS)
    return image


def save_alpha(source: Path, destination: Path, size: tuple[int, int]) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    image = clean_alpha(source, max_size=size)
    # Quality 88 keeps the painted grain and clean silhouettes while avoiding
    # multi-hundred-kilobyte lossless sprites on older tablets. `exact` keeps
    # RGB values under transparent pixels stable for dependable edge cleanup.
    image.save(destination, "WEBP", lossless=False, quality=88, method=6, exact=True)


def save_background() -> None:
    source = SOURCE / "gpt-image-2" / "railway-meadow-master.png"
    image = Image.open(source).convert("RGB")
    image.thumbnail((1600, 1200), Image.Resampling.LANCZOS)
    image.save(ART / "railway-meadow.webp", "WEBP", quality=78, method=6)


def save_hub_tile() -> None:
    edited = SOURCE / "local-api" / "krea2" / "hub-tile-qwen-edit.png"
    original = SOURCE / "local-api" / "krea2" / "hub-tile-master.png"
    source = edited if edited.is_file() else original
    if not source.is_file():
        return
    image = Image.open(source).convert("RGB")
    target = 640 / 533
    ratio = image.width / image.height
    if ratio > target:
        width = round(image.height * target)
        left = (image.width - width) // 2
        image = image.crop((left, 0, left + width, image.height))
    elif ratio < target:
        height = round(image.width / target)
        top = (image.height - height) // 2
        image = image.crop((0, top, image.width, top + height))
    image = image.resize((640, 533), Image.Resampling.LANCZOS)
    image.save(GAME.parents[1] / "assets" / "hub" / "tiles" / "pattern-train.jpg", "JPEG", quality=88, optimize=True)


def alpha_contact(paths: list[Path]) -> None:
    tile = 240
    columns = 5
    rows = (len(paths) + columns - 1) // columns
    sheet = Image.new("RGB", (columns * tile, rows * tile), "#ff00ff")
    for index, path in enumerate(paths):
        image = Image.open(path).convert("RGBA")
        image.thumbnail((tile - 24, tile - 24), Image.Resampling.LANCZOS)
        x = (index % columns) * tile + (tile - image.width) // 2
        y = (index // columns) * tile + (tile - image.height) // 2
        sheet.paste(image, (x, y), image)
    QA.mkdir(parents=True, exist_ok=True)
    sheet.save(QA / "alpha-magenta-contact.png", "PNG", optimize=True)


def main() -> None:
    ART.mkdir(parents=True, exist_ok=True)
    TOKENS.mkdir(parents=True, exist_ok=True)
    save_background()

    title = SOURCE / "gpt-image-2" / "title-lockup-master.png"
    save_alpha(title, ART / "title-lockup.webp", (960, 420))

    rail = SOURCE / "cuts" / "rail-ui"
    for name, size in {
        "locomotive": (520, 440),
        "wagon": (420, 280),
        "tray": (760, 360),
        "plaque": (720, 360),
        "button-yellow": (560, 280),
        "button-coral": (560, 280),
    }.items():
        save_alpha(rail / f"{name}.png", ART / f"{name}.webp", size)

    token_cuts = SOURCE / "cuts" / "tokens"
    token_paths: list[Path] = []
    for name in ("red-triangle", "blue-square", "yellow-circle", "green-star", "clap", "stomp", "tap", "shake"):
        destination = TOKENS / f"{name}.webp"
        save_alpha(token_cuts / f"{name}.png", destination, (300, 300))
        token_paths.append(destination)

    effects = SOURCE / "cuts" / "mode-effects"
    effect_paths: list[Path] = []
    for name, size in {
        "mode-shapes": (560, 420),
        "mode-actions": (560, 420),
        "mode-builder": (560, 420),
        "gold-star": (280, 280),
        "spark": (260, 300),
        "whistle": (360, 280),
    }.items():
        destination = ART / f"{name}.webp"
        save_alpha(effects / f"{name}.png", destination, size)
        effect_paths.append(destination)

    save_hub_tile()
    alpha_contact([
        ART / "title-lockup.webp",
        ART / "locomotive.webp",
        ART / "wagon.webp",
        ART / "tray.webp",
        ART / "plaque.webp",
        ART / "button-yellow.webp",
        ART / "button-coral.webp",
        *token_paths,
        *effect_paths,
    ])


if __name__ == "__main__":
    main()
