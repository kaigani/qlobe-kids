#!/usr/bin/env python3
"""Build Snack Addition Stories runtime art and alpha-QA plates.

GPT Image 2 masters are retained under ``assets/source/gpt-image-2``. Contact
sheets must first be separated with the repository's ``cut-asset-sheet.py``;
the resulting ``boxes.json`` receipts are inputs to this deterministic step.
This script never redraws an asset. It trims transparent padding, resizes,
encodes WebP/JPEG derivatives, and makes magenta edge-review plates.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter


HERE = Path(__file__).resolve().parent
GAME = HERE.parent
ROOT = GAME.parents[1]
ASSETS = GAME / "assets"
SOURCE = ASSETS / "source"
QA = SOURCE / "qa"


SPECS = [
    (SOURCE / "gpt-image-2/picnic-backdrop-master.png", ASSETS / "backdrop.webp", 1600, 84),
    (SOURCE / "gpt-image-2/title-lockup.png", ASSETS / "title.webp", 1000, 90),
    (SOURCE / "crops/foods/blackberry.png", ASSETS / "foods/blackberry.webp", 420, 90),
    (SOURCE / "crops/foods/raspberry.png", ASSETS / "foods/raspberry.webp", 420, 90),
    (SOURCE / "crops/foods/strawberry.png", ASSETS / "foods/strawberry.webp", 420, 90),
    (SOURCE / "crops/foods/blueberry.png", ASSETS / "foods/blueberry.webp", 420, 90),
    (SOURCE / "crops/foods/orange.png", ASSETS / "foods/orange.webp", 420, 90),
    (SOURCE / "crops/foods/watermelon.png", ASSETS / "foods/watermelon.webp", 420, 90),
    (SOURCE / "crops/foods/cracker.png", ASSETS / "foods/cracker.webp", 420, 90),
    (SOURCE / "crops/foods/sandwich-cracker.png", ASSETS / "foods/sandwich-cracker.webp", 420, 90),
    (SOURCE / "crops/ui/tray.png", ASSETS / "ui/tray.webp", 900, 90),
    (SOURCE / "crops/ui/prompt-plaque.png", ASSETS / "ui/prompt-plaque.webp", 800, 90),
    (SOURCE / "crops/ui/equation-plaque.png", ASSETS / "ui/equation-plaque.webp", 720, 90),
    (SOURCE / "crops/ui/story-card.png", ASSETS / "ui/story-card.webp", 640, 90),
    (SOURCE / "crops/ui/answer-pink.png", ASSETS / "ui/answer-pink.webp", 560, 90),
    (SOURCE / "crops/ui/answer-lavender.png", ASSETS / "ui/answer-lavender.webp", 560, 90),
    (SOURCE / "crops/ui/answer-mint.png", ASSETS / "ui/answer-mint.webp", 560, 90),
    (SOURCE / "crops/ui/action-button.png", ASSETS / "ui/action-button.webp", 640, 90),
    (SOURCE / "crops/ui/celebration-banner.png", ASSETS / "ui/celebration-banner.webp", 720, 90),
    (SOURCE / "crops/mascot/sun-idle.png", ASSETS / "characters/sun-idle.webp", 560, 90),
    (SOURCE / "crops/mascot/sun-cheer.png", ASSETS / "characters/sun-cheer.webp", 560, 90),
]


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def alpha_bounds(image: Image.Image) -> tuple[int, int, int, int] | None:
    if image.mode != "RGBA":
        return None
    return image.getchannel("A").getbbox()


def trim_alpha(image: Image.Image, padding: int = 3) -> Image.Image:
    if image.mode != "RGBA":
        return image
    bounds = image.getchannel("A").getbbox()
    if not bounds:
        raise ValueError("asset has no visible alpha pixels")
    left, top, right, bottom = bounds
    left = max(0, left - padding)
    top = max(0, top - padding)
    right = min(image.width, right + padding)
    bottom = min(image.height, bottom + padding)
    return image.crop((left, top, right, bottom))


def cutter_matte(source: Path, image: Image.Image) -> Image.Image:
    """Replace generated sheet alpha with the cutter's accepted silhouette.

    GPT Image 2 can leave attractive RGB behind nearly-transparent pixels. The
    crop receipt and binary debug mask are authoritative: shrinking one pixel
    and feathering back to the detected edge removes that hidden color film
    without making cocoa facial details translucent.
    """
    try:
        relative = source.relative_to(SOURCE / "crops")
    except ValueError:
        if image.mode == "RGBA":
            alpha = image.getchannel("A").point(lambda value: 0 if value <= 15 else value)
            image.putalpha(alpha)
        return image
    group = relative.parts[0]
    receipt_path = SOURCE / "crops" / group / "boxes.json"
    mask_path = QA / f"{group}-mask.png"
    receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
    entry = next(item for item in receipt["assets"] if item["file"] == source.name)
    with Image.open(mask_path) as opened:
        alpha = opened.convert("L").crop(tuple(entry["cropBbox"]))
    if alpha.size != image.size:
        alpha = alpha.resize(image.size, Image.Resampling.NEAREST)
    alpha = alpha.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.72))
    alpha = keep_largest_component(alpha)
    result = image.convert("RGB").convert("RGBA")
    result.putalpha(alpha)
    return result


def keep_largest_component(alpha: Image.Image, pad: int = 3) -> Image.Image:
    """Remove a neighboring contact-sheet object intruding at a crop edge."""
    width, height = alpha.size
    pixels = alpha.load()
    seen = bytearray(width * height)
    components: list[list[int]] = []
    for y in range(height):
        for x in range(width):
            start = y * width + x
            if seen[start] or pixels[x, y] < 128:
                continue
            seen[start] = 1
            stack = [start]
            members: list[int] = []
            while stack:
                index = stack.pop()
                px, py = index % width, index // width
                members.append(index)
                for nx, ny in ((px - 1, py), (px + 1, py), (px, py - 1), (px, py + 1)):
                    if nx < 0 or nx >= width or ny < 0 or ny >= height:
                        continue
                    neighbor = ny * width + nx
                    if seen[neighbor]:
                        continue
                    seen[neighbor] = 1
                    if pixels[nx, ny] >= 128:
                        stack.append(neighbor)
            components.append(members)
    if not components:
        return alpha
    support_bytes = bytearray(width * height)
    for index in max(components, key=len):
        support_bytes[index] = 255
    size = pad * 2 + 1
    support = Image.frombytes("L", (width, height), bytes(support_bytes))
    support = support.filter(ImageFilter.MaxFilter(size)).filter(ImageFilter.GaussianBlur(0.8))
    return ImageChops.multiply(alpha, support)


def resized(image: Image.Image, max_edge: int) -> Image.Image:
    if max(image.size) <= max_edge:
        return image
    copy = image.copy()
    copy.thumbnail((max_edge, max_edge), Image.Resampling.LANCZOS)
    return copy


def magenta_plate(image: Image.Image, destination: Path) -> None:
    rgba = image.convert("RGBA")
    matte = Image.new("RGBA", rgba.size, (255, 0, 184, 255))
    matte.alpha_composite(rgba)
    destination.parent.mkdir(parents=True, exist_ok=True)
    matte.convert("RGB").save(destination, "PNG", optimize=True)


def encode(source: Path, destination: Path, max_edge: int, quality: int) -> dict:
    with Image.open(source) as opened:
        opened.load()
        image = opened.convert("RGBA") if opened.mode in {"RGBA", "LA", "P"} else opened.convert("RGB")
    if image.mode == "RGBA":
        image = cutter_matte(source, image)
        image = trim_alpha(image)
    image = resized(image, max_edge)
    destination.parent.mkdir(parents=True, exist_ok=True)
    image.save(destination, "WEBP", quality=quality, method=6)
    if image.mode == "RGBA":
        magenta_plate(image, QA / f"{destination.parent.name}-{destination.stem}-magenta.png")
    extrema = image.getchannel("A").getextrema() if image.mode == "RGBA" else None
    return {
        "source": source.relative_to(GAME).as_posix(),
        "sourceSha256": digest(source),
        "destination": destination.relative_to(GAME).as_posix(),
        "destinationSha256": digest(destination),
        "size": list(image.size),
        "mode": image.mode,
        "alphaExtrema": list(extrema) if extrema else None,
        "quality": quality,
    }


def contact_sheet(records: list[dict]) -> None:
    transparent = [record for record in records if record["mode"] == "RGBA"]
    cell_w, cell_h = 240, 210
    columns = 5
    rows = (len(transparent) + columns - 1) // columns
    sheet = Image.new("RGB", (columns * cell_w, rows * cell_h), (255, 0, 184))
    draw = ImageDraw.Draw(sheet)
    for index, record in enumerate(transparent):
        with Image.open(GAME / record["destination"]) as opened:
            art = opened.convert("RGBA")
        art.thumbnail((cell_w - 28, cell_h - 46), Image.Resampling.LANCZOS)
        x = index % columns * cell_w + (cell_w - art.width) // 2
        y = index // columns * cell_h + 8 + (cell_h - 40 - art.height) // 2
        base = sheet.crop((x, y, x + art.width, y + art.height)).convert("RGBA")
        base.alpha_composite(art)
        sheet.paste(base.convert("RGB"), (x, y))
        label = Path(record["destination"]).stem
        draw.text((index % columns * cell_w + 8, index // columns * cell_h + cell_h - 28), label, fill=(45, 20, 35))
    sheet.save(QA / "runtime-alpha-contact.png", "PNG", optimize=True)


def hub_tile() -> dict | None:
    source = SOURCE / "krea2/hub-tile-seed42.png"
    if not source.exists():
        return None
    destination = ROOT / "assets/hub/tiles/snack-addition-stories.jpg"
    with Image.open(source) as opened:
        image = opened.convert("RGB")
    target_ratio = 640 / 533
    ratio = image.width / image.height
    if ratio > target_ratio:
        width = round(image.height * target_ratio)
        left = (image.width - width) // 2
        image = image.crop((left, 0, left + width, image.height))
    elif ratio < target_ratio:
        height = round(image.width / target_ratio)
        top = (image.height - height) // 2
        image = image.crop((0, top, image.width, top + height))
    image = image.resize((640, 533), Image.Resampling.LANCZOS)
    destination.parent.mkdir(parents=True, exist_ok=True)
    image.save(destination, "JPEG", quality=89, optimize=True, progressive=True)
    return {
        "source": source.relative_to(GAME).as_posix(),
        "sourceSha256": digest(source),
        "destination": destination.relative_to(ROOT).as_posix(),
        "destinationSha256": digest(destination),
        "size": [640, 533],
        "mode": "RGB",
        "quality": 89,
    }


def main() -> None:
    missing = [str(source) for source, *_ in SPECS if not source.exists()]
    if missing:
        raise SystemExit("missing cut/source assets:\n" + "\n".join(missing))
    QA.mkdir(parents=True, exist_ok=True)
    records = [encode(*spec) for spec in SPECS]
    contact_sheet(records)
    hub = hub_tile()
    manifest = {
        "format": "snack-addition-art-manifest",
        "formatVersion": 1,
        "assets": records,
        "hubTile": hub,
        "cutterReceipts": [
            "assets/source/crops/foods/boxes.json",
            "assets/source/crops/ui/boxes.json",
            "assets/source/crops/mascot/boxes.json",
        ],
    }
    (SOURCE / "art-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    total = sum((GAME / record["destination"]).stat().st_size for record in records)
    print(f"built {len(records)} runtime assets ({total / 1024:.1f} KiB)")
    print(f"alpha contact: {QA / 'runtime-alpha-contact.png'}")
    if hub:
        print("built curated 640x533 Krea hub tile")


if __name__ == "__main__":
    main()
