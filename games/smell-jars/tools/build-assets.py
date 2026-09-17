#!/usr/bin/env python3
"""Build the reviewed Smell Jars raster sources into runtime WebP assets.

The source sheets are cut with ``tools/cut-asset-sheet.py`` before this script
runs.  This stage only trims transparent margins, normalizes alpha, resizes,
encodes, and writes an auditable processing receipt plus a hostile-magenta
contact sheet.  It never redraws generated art.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps


GAME = Path(__file__).resolve().parents[1]
ROOT = GAME.parents[1]
SOURCE = GAME / "assets/source"
GPT = SOURCE / "gpt-image-2"
CUTS = SOURCE / "cuts"
LAYERED = SOURCE / "layered"
OUT = GAME / "assets/art"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def alpha_stats(image: Image.Image) -> dict[str, float] | None:
    if "A" not in image.getbands():
        return None
    hist = image.getchannel("A").histogram()
    total = max(1, image.width * image.height)
    return {
        "transparentPct": round(100 * hist[0] / total, 3),
        "opaquePct": round(100 * hist[255] / total, 3),
        "partialPct": round(100 * sum(hist[1:255]) / total, 3),
    }


def keep_largest_alpha_component(image: Image.Image, threshold: int = 24) -> Image.Image:
    """Drop disconnected cutter bleed while preserving the chosen soft edge."""
    alpha = image.getchannel("A")
    width, height = alpha.size
    pixels = list(alpha.getdata())
    seen = bytearray(width * height)
    largest: list[int] = []
    for start, value in enumerate(pixels):
        if seen[start] or value <= threshold:
            continue
        seen[start] = 1
        component: list[int] = []
        stack = [start]
        while stack:
            index = stack.pop()
            component.append(index)
            x, y = index % width, index // width
            for neighbor in (
                index - 1 if x else -1,
                index + 1 if x + 1 < width else -1,
                index - width if y else -1,
                index + width if y + 1 < height else -1,
            ):
                if neighbor >= 0 and not seen[neighbor] and pixels[neighbor] > threshold:
                    seen[neighbor] = 1
                    stack.append(neighbor)
        if len(component) > len(largest):
            largest = component
    if not largest:
        return image
    core = Image.new("L", (width, height), 0)
    core_pixels = core.load()
    for index in largest:
        core_pixels[index % width, index // width] = 255
    keep = core.filter(ImageFilter.MaxFilter(7))
    keep_pixels = list(keep.getdata())
    clean_alpha = Image.new("L", (width, height), 0)
    clean_alpha.putdata([value if keep_pixels[index] else 0 for index, value in enumerate(pixels)])
    cleaned = image.copy()
    cleaned.putalpha(clean_alpha)
    return cleaned


def cleaned_cutout(
    source: Path,
    maximum: int,
    largest_component: bool = False,
    alpha_erode: int = 0,
) -> Image.Image:
    image = Image.open(source).convert("RGBA")
    if largest_component:
        image = keep_largest_alpha_component(image)
    alpha = image.getchannel("A").point(
        lambda value: 0 if value <= 4 else (255 if value >= 250 else value)
    )
    for _ in range(max(0, alpha_erode)):
        alpha = alpha.filter(ImageFilter.MinFilter(3))
    image.putalpha(alpha)
    bbox = alpha.getbbox()
    if not bbox:
        raise RuntimeError(f"empty alpha: {source}")
    image = image.crop(bbox)
    if max(image.size) > maximum:
        scale = maximum / max(image.size)
        image = image.convert("RGBa").resize(
            (max(1, round(image.width * scale)), max(1, round(image.height * scale))),
            Image.Resampling.LANCZOS,
        ).convert("RGBA")
    return image


def save_cutout(
    source: Path,
    destination: Path,
    maximum: int,
    largest_component: bool = False,
    alpha_erode: int = 0,
) -> dict:
    image = cleaned_cutout(source, maximum, largest_component, alpha_erode)
    destination.parent.mkdir(parents=True, exist_ok=True)
    image.save(destination, "WEBP", quality=91, method=6, exact=True)
    return {
        "source": str(source.relative_to(GAME)),
        "sourceSha256": sha256(source),
        "asset": str(destination.relative_to(GAME)),
        "finalSize": list(image.size),
        "alpha": alpha_stats(image),
        "assetSha256": sha256(destination),
    }


def save_plate(source: Path, destination: Path, size: tuple[int, int]) -> dict:
    image = Image.open(source).convert("RGB")
    image = ImageOps.fit(image, size, Image.Resampling.LANCZOS, centering=(0.5, 0.5))
    destination.parent.mkdir(parents=True, exist_ok=True)
    image.save(destination, "WEBP", quality=86, method=6)
    return {
        "source": str(source.relative_to(GAME)),
        "sourceSha256": sha256(source),
        "asset": str(destination.relative_to(GAME)),
        "finalSize": list(image.size),
        "assetSha256": sha256(destination),
    }


def contact_sheet(records: list[dict], destination: Path) -> None:
    cutouts = [record for record in records if record.get("alpha")]
    cell_w, cell_h, cols = 360, 300, 5
    rows = (len(cutouts) + cols - 1) // cols
    sheet = Image.new("RGB", (cell_w * cols, cell_h * rows), (255, 0, 255))
    draw = ImageDraw.Draw(sheet)
    for index, record in enumerate(cutouts):
        image = Image.open(GAME / record["asset"]).convert("RGBA")
        image.thumbnail((cell_w - 36, cell_h - 54), Image.Resampling.LANCZOS)
        x = index % cols * cell_w + (cell_w - image.width) // 2
        y = index // cols * cell_h + 30 + (cell_h - 45 - image.height) // 2
        tile = Image.new("RGBA", sheet.size, (0, 0, 0, 0))
        tile.alpha_composite(image, (x, y))
        sheet.paste(tile.convert("RGB"), mask=tile.getchannel("A"))
        draw.text((index % cols * cell_w + 8, index // cols * cell_h + 7), Path(record["asset"]).name, fill=(36, 24, 45))
    destination.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(destination, "JPEG", quality=91, optimize=True)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    records: list[dict] = []
    records.append(save_plate(GPT / "environment-wide-source.png", OUT / "environment-wide.webp", (1920, 1080)))
    records.append(save_plate(GPT / "environment-portrait-source.png", OUT / "environment-portrait.webp", (1080, 1440)))

    title_source = SOURCE / "local-api/title/title-clean.final.png"
    if not title_source.is_file():
        title_source = LAYERED / "title.final.png"
    if not title_source.is_file():
        title_source = LAYERED / "title.layer2.png"
    if not title_source.is_file():
        title_source = GPT / "title-source.png"
    records.append(save_cutout(title_source, OUT / "title.webp", 1120, largest_component=True))

    prop_names = (
        "jar-open", "tray", "button-plaque", "check", "lid-yellow",
        "lid-green", "lid-russet", "lid-purple", "lid-cocoa", "lid-pine", "sun",
    )
    prop_max = {"tray": 900, "button-plaque": 720, "jar-open": 560, "sun": 420, "check": 340}
    for name in prop_names:
        records.append(save_cutout(CUTS / "props" / f"{name}.png", OUT / f"{name}.webp", prop_max.get(name, 420)))
    spark_source = LAYERED / "spark.final.png"
    records.append(save_cutout(
        spark_source if spark_source.is_file() else CUTS / "props" / "spark-b.png",
        OUT / "spark.webp", 240,
        largest_component=not spark_source.is_file(),
    ))

    for name in ("lemon", "mint", "cinnamon", "lavender", "cocoa", "pine"):
        records.append(save_cutout(CUTS / "tokens" / f"token-{name}.png", OUT / f"token-{name}.webp", 440))
        records.append(save_cutout(CUTS / "plumes" / f"plume-{name}.png", OUT / f"plume-{name}.webp", 540))

    for name in ("match", "memory"):
        records.append(save_cutout(CUTS / "modes" / f"mode-{name}.png", OUT / f"mode-{name}.webp", 680))

    qc_path = SOURCE / "final-alpha-qc-magenta.jpg"
    contact_sheet(records, qc_path)
    receipt = {
        "format": "qlobe-smell-jars-processing",
        "formatVersion": 1,
        "generator": "GPT Image 2 source art; required shared asset cutter; Qwen Image Layered title and sparkle alpha; deterministic Pillow WebP finalization",
        "records": records,
        "qa": {
            "magentaContactSheet": str(qc_path.relative_to(GAME)),
            "status": "pending-human-review",
        },
    }
    (SOURCE / "processing.json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"assets": len(records), "qc": str(qc_path), "out": str(OUT)}, indent=2))


if __name__ == "__main__":
    main()
