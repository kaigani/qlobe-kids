#!/usr/bin/env python3
"""Build reviewed Question Ball raster sources into runtime assets.

The shared contact-sheet cutter runs before this tool. This deterministic pass
normalizes GPT Image's visually opaque alpha band, trims, resizes, encodes WebP,
curates the Krea hub tile, and writes processing and hostile-magenta QA receipts.
It never redraws generated art.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps


GAME = Path(__file__).resolve().parents[1]
ROOT = GAME.parents[1]
SOURCE = GAME / "assets/source"
GPT = SOURCE / "gpt-image-2"
CUTS = SOURCE / "cuts"
FINALIZED = SOURCE / "finalized"
OUT = GAME / "assets/art"
QA = SOURCE / "qa"
HUB_SOURCE = SOURCE / "local-api/hub/krea-menu-seed42.png"
HUB_OUTPUT = ROOT / "assets/hub/tiles/question-ball.jpg"


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


def cleaned_cutout(source: Path, maximum: int, *, alpha_floor: int = 5) -> Image.Image:
    image = Image.open(source).convert("RGBA")
    # GPT Image transparent masters commonly store fully visible material at
    # alpha 240–254. Canonicalize only the invisible tail and visually opaque
    # core, preserving the antialiased middle band.
    alpha = image.getchannel("A").point(
        lambda value: 0 if value <= alpha_floor else (255 if value >= 240 else value)
    )
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


def save_cutout(source: Path, destination: Path, maximum: int, *, alpha_floor: int = 5) -> dict:
    image = cleaned_cutout(source, maximum, alpha_floor=alpha_floor)
    destination.parent.mkdir(parents=True, exist_ok=True)
    image.save(destination, "WEBP", quality=90, method=6, exact=True)
    return {
        "source": source.relative_to(GAME).as_posix(),
        "sourceSha256": sha256(source),
        "asset": destination.relative_to(GAME).as_posix(),
        "finalSize": list(image.size),
        "alpha": alpha_stats(image),
        "assetSha256": sha256(destination),
    }


def save_plate(source: Path, destination: Path, size: tuple[int, int], quality: int = 82) -> dict:
    image = Image.open(source).convert("RGB")
    image = ImageOps.fit(image, size, Image.Resampling.LANCZOS, centering=(0.5, 0.5))
    destination.parent.mkdir(parents=True, exist_ok=True)
    image.save(destination, "WEBP", quality=quality, method=6)
    return {
        "source": source.relative_to(GAME).as_posix(),
        "sourceSha256": sha256(source),
        "asset": destination.relative_to(GAME).as_posix(),
        "finalSize": list(image.size),
        "assetSha256": sha256(destination),
    }


def curate_hub_tile() -> dict:
    image = Image.open(HUB_SOURCE).convert("RGB")
    image = ImageOps.fit(image, (640, 533), Image.Resampling.LANCZOS, centering=(0.5, 0.5))
    HUB_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    image.save(HUB_OUTPUT, "JPEG", quality=91, optimize=True, progressive=True)
    return {
        "source": HUB_SOURCE.relative_to(GAME).as_posix(),
        "sourceSha256": sha256(HUB_SOURCE),
        "asset": HUB_OUTPUT.relative_to(ROOT).as_posix(),
        "finalSize": list(image.size),
        "assetSha256": sha256(HUB_OUTPUT),
    }


def contact_sheet(records: list[dict], destination: Path) -> None:
    cutouts = [record for record in records if record.get("alpha")]
    cell_w, cell_h, cols = 360, 320, 5
    rows = (len(cutouts) + cols - 1) // cols
    sheet = Image.new("RGB", (cell_w * cols, cell_h * rows), (255, 0, 255))
    draw = ImageDraw.Draw(sheet)
    for index, record in enumerate(cutouts):
        image = Image.open(GAME / record["asset"]).convert("RGBA")
        image.thumbnail((cell_w - 34, cell_h - 60), Image.Resampling.LANCZOS)
        x = index % cols * cell_w + (cell_w - image.width) // 2
        y = index // cols * cell_h + 34 + (cell_h - 52 - image.height) // 2
        tile = Image.new("RGBA", sheet.size, (0, 0, 0, 0))
        tile.alpha_composite(image, (x, y))
        sheet.paste(tile.convert("RGB"), mask=tile.getchannel("A"))
        draw.text(
            (index % cols * cell_w + 8, index // cols * cell_h + 8),
            Path(record["asset"]).name,
            fill=(40, 24, 48),
        )
    destination.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(destination, "JPEG", quality=92, optimize=True)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    QA.mkdir(parents=True, exist_ok=True)
    records: list[dict] = []
    records.append(save_plate(GPT / "playroom-master.png", OUT / "playroom.webp", (1600, 1200)))
    records.append(save_cutout(FINALIZED / "title.png", OUT / "title.webp", 1100, alpha_floor=16))

    prop_sizes = {
        "ball-idle": 560,
        "ball-open": 600,
        "star": 500,
        "microphone": 420,
        "gesture-toss": 420,
        "topic-routines": 420,
        "topic-animals": 420,
        "topic-imagine": 420,
        "topic-feelings": 420,
        "question-bubble": 440,
    }
    for name, maximum in prop_sizes.items():
        records.append(save_cutout(CUTS / "props" / f"{name}.png", OUT / f"{name}.webp", maximum))

    for name in ("maya-listen", "maya-celebrate", "leo-catch", "leo-celebrate"):
        records.append(save_cutout(CUTS / "characters" / f"{name}.png", OUT / f"{name}.webp", 720))

    ui_sizes = {
        "plaque-navy": 1000,
        "button-green": 900,
        "prompt-panel": 1200,
        "card-gold": 520,
        "card-green": 520,
        "card-lavender": 520,
        "card-coral": 520,
    }
    for name, maximum in ui_sizes.items():
        records.append(save_cutout(CUTS / "ui" / f"{name}.png", OUT / f"{name}.webp", maximum))

    hub = curate_hub_tile()
    qc_path = QA / "final-alpha-contact-magenta.jpg"
    contact_sheet(records, qc_path)
    receipt = {
        "format": "qlobe-question-ball-processing",
        "formatVersion": 1,
        "generator": (
            "GPT Image source masters through Codex built-in generation; required shared "
            "asset cutter; Qwen Image Layered title extraction; Krea 2 hub source; "
            "deterministic Pillow alpha normalization, trim, resize, and WebP/JPEG encoding"
        ),
        "alphaNormalization": {"transparentAtOrBelow": 5, "opaqueAtOrAbove": 240},
        "records": records,
        "hub": hub,
        "qa": {
            "magentaContactSheet": qc_path.relative_to(GAME).as_posix(),
            "status": "pending-human-review",
        },
    }
    (SOURCE / "processing.json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"assets": len(records), "hub": hub["asset"], "qa": str(qc_path)}, indent=2))


if __name__ == "__main__":
    main()
