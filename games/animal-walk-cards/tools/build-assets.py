#!/usr/bin/env python3
"""Build optimized Animal Motion Cards runtime art from accepted sources."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageOps


GAME = Path(__file__).resolve().parents[1]
ROOT = GAME.parents[1]
ASSETS = GAME / "assets"
SOURCE = ASSETS / "source"
GPT = SOURCE / "gpt-image-2"
CUTS = SOURCE / "cuts"
FINAL = SOURCE / "finalized"
QA = SOURCE / "qa"
ART = ASSETS / "art"
ANIMALS = ("frog", "bear", "crab", "bunny", "penguin", "flamingo")
RESAMPLE = Image.Resampling.LANCZOS


def fit_max(image: Image.Image, maximum: int) -> Image.Image:
    image = image.copy()
    image.thumbnail((maximum, maximum), RESAMPLE)
    return image


def trim_alpha(image: Image.Image, pad: int = 0) -> Image.Image:
    rgba = image.convert("RGBA")
    bbox = rgba.getchannel("A").getbbox()
    if bbox:
        rgba = rgba.crop(bbox)
    if pad:
        rgba = ImageOps.expand(rgba, border=pad, fill=(0, 0, 0, 0))
    return rgba


def save_webp(source: Path, destination: Path, maximum: int, *, trim: bool = False) -> None:
    if not source.is_file():
        raise FileNotFoundError(source)
    image = Image.open(source)
    image = trim_alpha(image, 8) if trim else image.convert("RGBA")
    image = fit_max(image, maximum)
    destination.parent.mkdir(parents=True, exist_ok=True)
    image.save(destination, "WEBP", quality=84, method=6, exact=True)
    print(f"{destination.relative_to(GAME)} {image.width}x{image.height} {destination.stat().st_size} bytes")


def save_background(source: Path, destination: Path, maximum: int) -> None:
    image = fit_max(Image.open(source).convert("RGB"), maximum)
    destination.parent.mkdir(parents=True, exist_ok=True)
    image.save(destination, "WEBP", quality=82, method=6)
    print(f"{destination.relative_to(GAME)} {image.width}x{image.height} {destination.stat().st_size} bytes")


def write_magenta_qa(source: Path, name: str, maximum: int = 700) -> None:
    image = trim_alpha(Image.open(source), 8)
    image = fit_max(image, maximum)
    canvas = Image.new("RGB", image.size, (255, 0, 255))
    canvas.paste(image, (0, 0), image)
    QA.mkdir(parents=True, exist_ok=True)
    canvas.save(QA / f"final-{name}-magenta.jpg", "JPEG", quality=91, optimize=True)


def cover(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    scale = max(size[0] / image.width, size[1] / image.height)
    resized = image.resize((round(image.width * scale), round(image.height * scale)), RESAMPLE)
    left = (resized.width - size[0]) // 2
    top = (resized.height - size[1]) // 2
    return resized.crop((left, top, left + size[0], top + size[1]))


def compose_og() -> None:
    canvas = cover(Image.open(GPT / "meadow-landscape-master.png").convert("RGB"), (1200, 630))
    title = trim_alpha(Image.open(GPT / "title-lockup-master.png"), 8)
    title.thumbnail((880, 220), RESAMPLE)
    canvas.paste(title, ((1200 - title.width) // 2, 26), title)
    for index, animal in enumerate(("frog", "bear", "crab")):
        card = Image.open(CUTS / "cards" / f"{animal}.png").convert("RGBA")
        card.thumbnail((258, 258), RESAMPLE)
        x = 185 + index * 300
        canvas.paste(card, (x, 332), card)
    target = ASSETS / "og-image.jpg"
    canvas.save(target, "JPEG", quality=88, optimize=True, progressive=True)
    print(f"{target.relative_to(GAME)} 1200x630 {target.stat().st_size} bytes")


def compose_hub_tile() -> None:
    edited = SOURCE / "local-api" / "hub" / "qwen-identity-hub-seed42.png"
    source = edited if edited.is_file() else SOURCE / "local-api" / "hub" / "krea2-hub-master-v2.png"
    image = cover(Image.open(source).convert("RGB"), (640, 533))
    target = ROOT / "assets" / "hub" / "tiles" / "animal-walk-cards.jpg"
    target.parent.mkdir(parents=True, exist_ok=True)
    image.save(target, "JPEG", quality=88, optimize=True, progressive=True)
    print(f"{target.relative_to(ROOT)} 640x533 {target.stat().st_size} bytes")


def main() -> int:
    ART.mkdir(parents=True, exist_ok=True)
    save_background(GPT / "meadow-landscape-master.png", ART / "meadow-landscape.webp", 1600)
    save_background(GPT / "meadow-portrait-master.png", ART / "meadow-portrait.webp", 1600)
    save_webp(GPT / "title-lockup-master.png", ART / "title-lockup.webp", 1100, trim=True)
    write_magenta_qa(GPT / "title-lockup-master.png", "title-lockup", 1100)

    for animal in ANIMALS:
        save_webp(CUTS / "cards" / f"{animal}.png", ART / f"card-{animal}.webp", 640)
        for pose in (1, 2, 3):
            source = FINAL / f"pose-{animal}-{pose}.png"
            save_webp(source, ART / f"pose-{animal}-{pose}.webp", 560, trim=True)
            write_magenta_qa(source, f"pose-{animal}-{pose}")

            child_source = FINAL / f"kid-{animal}-{pose}.png"
            save_webp(child_source, ART / f"kid-{animal}-{pose}.webp", 620, trim=True)
            write_magenta_qa(child_source, f"kid-{animal}-{pose}")

    for name, maximum in (("action-button", 900), ("paw-stamp", 640), ("parade-banner", 900)):
        source = FINAL / f"{name}.png"
        save_webp(source, ART / f"{name}.webp", maximum, trim=True)
        write_magenta_qa(source, name)

    compose_og()
    compose_hub_tile()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
