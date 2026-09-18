#!/usr/bin/env python3
"""Deterministically cut and finish Pattern Bracelet Band production art.

The generative steps are intentionally outside this script. Their accepted
masters and prompts are retained under ``assets/source``. This pass only:

* locates separated objects with the repository's shared asset-sheet cutter;
* removes low-alpha extraction film without redrawing source pixels;
* trims, pads, normalizes, resizes, and encodes runtime assets; and
* writes saturated-magenta QA composites plus a hash manifest.

Run from the repository root:

    python games/pattern-bracelet-band/tools/finalize-assets.py
"""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image


GAME = Path(__file__).resolve().parents[1]
REPO = GAME.parents[1]
ASSETS = GAME / "assets"
SOURCE = ASSETS / "source"
CROPS = SOURCE / "crops"
QA = SOURCE / "qa"


def run_cutter(sheet: Path, out: Path, names: list[str], *, alpha: int, padding: int) -> None:
    out.mkdir(parents=True, exist_ok=True)
    debug = out.parent / f"{out.name}-mask.png"
    subprocess.run(
        [
            sys.executable,
            str(REPO / "tools" / "cut-asset-sheet.py"),
            str(sheet),
            str(out),
            "--names",
            *names,
            "--expected-count",
            str(len(names)),
            "--padding",
            str(padding),
            "--alpha-threshold",
            str(alpha),
            "--close-radius",
            "0",
            "--debug-mask",
            str(debug),
            "--force",
        ],
        check=True,
    )


def clean_alpha(image: Image.Image, floor: int) -> Image.Image:
    rgba = image.convert("RGBA")
    alpha = rgba.getchannel("A").point(lambda value: 0 if value <= floor else value)
    rgba.putalpha(alpha)
    return rgba


def trim(image: Image.Image, *, floor: int, pad: int) -> Image.Image:
    rgba = clean_alpha(image, floor)
    alpha = rgba.getchannel("A")
    bbox = alpha.getbbox()
    if not bbox:
        raise ValueError("asset has no visible pixels after alpha cleanup")
    rgba = rgba.crop(bbox)
    canvas = Image.new("RGBA", (rgba.width + pad * 2, rgba.height + pad * 2), (0, 0, 0, 0))
    canvas.alpha_composite(rgba, (pad, pad))
    return canvas


def contain(image: Image.Image, max_size: int) -> Image.Image:
    if max(image.size) <= max_size:
        return image
    scale = max_size / max(image.size)
    return image.resize(
        (max(1, round(image.width * scale)), max(1, round(image.height * scale))),
        Image.Resampling.LANCZOS,
    )


def square(image: Image.Image, size: int, subject: int) -> Image.Image:
    scale = subject / max(image.size)
    fitted = image.resize(
        (max(1, round(image.width * scale)), max(1, round(image.height * scale))),
        Image.Resampling.LANCZOS,
    )
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.alpha_composite(fitted, ((size - fitted.width) // 2, (size - fitted.height) // 2))
    return canvas


def magenta(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    canvas = Image.new("RGB", image.size, (255, 0, 180))
    canvas.paste(image, mask=image.getchannel("A"))
    canvas.save(path, "PNG", optimize=True)


def save_webp(image: Image.Image, path: Path, *, quality: int = 88, lossless: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(
        path,
        "WEBP",
        quality=quality,
        method=6,
        lossless=lossless,
        exact=True,
    )


def finish_cutout(
    source: Path,
    destination: Path,
    *,
    floor: int,
    pad: int,
    max_size: int | None = None,
    square_size: int | None = None,
    subject_size: int | None = None,
) -> None:
    image = trim(Image.open(source), floor=floor, pad=pad)
    if square_size:
        image = square(image, square_size, subject_size or round(square_size * 0.86))
    elif max_size:
        image = contain(image, max_size)
    # Runtime sprites are displayed well below their source resolution. A
    # high-quality lossy WebP keeps the authored texture while staying inside
    # the platform's 30-80 KB ordinary-sprite budget; alpha remains lossless.
    save_webp(image, destination, quality=88, lossless=False)
    magenta(image, QA / f"{destination.stem}-magenta.png")


def cover_4x3(source: Path, destination: Path) -> None:
    image = Image.open(source).convert("RGB")
    target_ratio = 4 / 3
    ratio = image.width / image.height
    if ratio > target_ratio:
        width = round(image.height * target_ratio)
        left = (image.width - width) // 2
        image = image.crop((left, 0, left + width, image.height))
    elif ratio < target_ratio:
        height = round(image.width / target_ratio)
        top = (image.height - height) // 2
        image = image.crop((0, top, image.width, top + height))
    image = image.resize((1600, 1200), Image.Resampling.LANCZOS)
    save_webp(image, destination, quality=84)


def hub_tile(source: Path, destination: Path) -> None:
    image = Image.open(source).convert("RGB")
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
    image.resize((640, 533), Image.Resampling.LANCZOS).save(
        destination, "JPEG", quality=88, optimize=True, progressive=True
    )


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    run_cutter(
        SOURCE / "bead-sheet-qwen-layer2.png",
        CROPS / "beads",
        ["bead-red", "bead-yellow", "bead-blue", "bead-purple", "bead-teal", "bead-coral"],
        alpha=8,
        padding=18,
    )
    run_cutter(
        SOURCE / "workshop-parts-sheet-gpt-image-2.png",
        CROPS / "parts",
        ["board", "cord", "tray", "mode-plaque", "star"],
        alpha=128,
        padding=24,
    )
    run_cutter(
        SOURCE / "control-sheet-gpt-image-2.png",
        CROPS / "controls",
        ["play", "slower", "faster", "clear", "save", "replay"],
        alpha=128,
        padding=20,
    )
    run_cutter(
        SOURCE / "ui-surfaces-sheet-gpt-image-2.png",
        CROPS / "surfaces",
        ["slot-well", "prompt-plaque", "tempo-plaque", "jewelry-panel"],
        alpha=128,
        padding=20,
    )

    cover_4x3(SOURCE / "workshop-gpt-image-2.png", ASSETS / "workshop.webp")
    cover_4x3(SOURCE / "concert-gpt-image-2.png", ASSETS / "concert.webp")

    title = trim(Image.open(SOURCE / "title-gpt-image-2.png"), floor=8, pad=20)
    title = contain(title, 1100)
    save_webp(title, ASSETS / "title.webp", quality=90)
    magenta(title, QA / "title-magenta.png")

    for name in ("red", "yellow", "blue", "purple", "teal", "coral"):
        finish_cutout(
            CROPS / "beads" / f"bead-{name}.png",
            ASSETS / "beads" / f"bead-{name}.webp",
            floor=8,
            pad=8,
            square_size=512,
            subject_size=448,
        )

    part_specs = {
        "board": (820, 8),
        "cord": (760, 8),
        "tray": (920, 8),
        "mode-plaque": (760, 8),
        "star": (360, 8),
    }
    for name, (max_size, pad) in part_specs.items():
        finish_cutout(
            CROPS / "parts" / f"{name}.png",
            ASSETS / "ui" / f"{name}.webp",
            floor=96,
            pad=pad,
            max_size=max_size,
        )

    for name in ("play", "slower", "faster", "clear", "save", "replay"):
        finish_cutout(
            CROPS / "controls" / f"{name}.png",
            ASSETS / "ui" / f"{name}.webp",
            floor=96,
            pad=6,
            square_size=256,
            subject_size=232,
        )

    surface_specs = {
        "slot-well": {"square_size": 256, "subject_size": 232, "pad": 6},
        "prompt-plaque": {"max_size": 900, "pad": 8},
        "tempo-plaque": {"max_size": 420, "pad": 8},
        "jewelry-panel": {"max_size": 1000, "pad": 8},
    }
    for name, spec in surface_specs.items():
        finish_cutout(
            CROPS / "surfaces" / f"{name}.png",
            ASSETS / "ui" / f"{name}.webp",
            floor=96,
            **spec,
        )

    hub_tile(SOURCE / "hub-tile-gpt-image-2-edit.png", REPO / "assets" / "hub" / "tiles" / "pattern-bracelet-band.jpg")

    runtime = sorted(
        [ASSETS / "workshop.webp", ASSETS / "concert.webp", ASSETS / "title.webp"]
        + list((ASSETS / "beads").glob("*.webp"))
        + [p for p in (ASSETS / "ui").glob("*.webp") if p.stem not in {"banner-ribbon", "star-gold"}]
        + [REPO / "assets" / "hub" / "tiles" / "pattern-bracelet-band.jpg"]
    )
    manifest = {
        "format": "pattern-bracelet-assets-v1",
        "assets": [
            {
                "path": str(path.relative_to(REPO)).replace("\\", "/"),
                "bytes": path.stat().st_size,
                "sha256": sha256(path),
                "size": list(Image.open(path).size),
            }
            for path in runtime
        ],
    }
    (SOURCE / "runtime-manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps({"assets": len(runtime), "bytes": sum(p.stat().st_size for p in runtime)}, indent=2))


if __name__ == "__main__":
    main()
