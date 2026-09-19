#!/usr/bin/env python3
"""Cut, normalize, and QA Happy Ripe Fruit production art.

The GPT Image 2 sources already carry real RGBA alpha.  The repository cutter
is still the required authority for component discovery and exact-count gates;
this script then trims its crops, writes compact lossless WebP runtime assets,
builds badge/finale compositions, and produces hostile-magenta QA images.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[3]
GAME = Path(__file__).resolve().parents[1]
SOURCE = GAME / "assets" / "source"
GPT = SOURCE / "gpt-image-2"
CROPS = SOURCE / "crops"
QA = SOURCE / "qa"
CUTTER = ROOT / "tools" / "cut-asset-sheet.py"

FRUITS = ["strawberry", "banana", "apple", "lemon", "cherry", "pear"]
STAGES = ["early", "ripe", "late"]

SHEETS: dict[str, dict[str, Any]] = {
    "fruit": {
        "source": GPT / "fruit-stages-source.png",
        "names": [f"{fruit}-{stage}" for stage in STAGES for fruit in FRUITS],
        "minArea": 1200,
        "close": 3,
        "limit": (330, 340),
        "dest": GAME / "assets" / "fruit",
    },
    "plants": {
        "source": GPT / "plants-source.png",
        "names": FRUITS,
        "minArea": 1800,
        "close": 3,
        "limit": (760, 720),
        "dest": GAME / "assets" / "plants",
    },
    "ui": {
        "source": GPT / "ui-source.png",
        "names": [
            "basket-empty",
            "badge-medallion",
            "locked-ribbon",
            "reward-wreath",
            "stage-early",
            "stage-ripe",
            "stage-late",
            "prompt-plaque",
        ],
        "minArea": 1200,
        "close": 4,
        "limits": {
            "basket-empty": (620, 620),
            "badge-medallion": (420, 420),
            "locked-ribbon": (520, 260),
            "reward-wreath": (460, 460),
            "stage-early": (190, 190),
            "stage-ripe": (190, 190),
            "stage-late": (190, 190),
            "prompt-plaque": (820, 380),
        },
        "dest": GAME / "assets" / "ui",
    },
    "title": {
        "source": GPT / "title-source.png",
        "names": ["title"],
        "minArea": 4000,
        "close": 6,
        "limit": (940, 700),
        "dest": GAME / "assets",
    },
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def crop_visible(image: Image.Image, pad: int = 10) -> Image.Image:
    rgba = image.convert("RGBA")
    alpha = rgba.getchannel("A").point(lambda value: 0 if value <= 8 else value)
    rgba.putalpha(alpha)
    box = alpha.getbbox()
    if box is None:
        raise ValueError("asset has no visible alpha")
    left, top, right, bottom = box
    return rgba.crop(
        (
            max(0, left - pad),
            max(0, top - pad),
            min(rgba.width, right + pad),
            min(rgba.height, bottom + pad),
        )
    )


def save_magenta(image: Image.Image, path: Path) -> None:
    rgba = image.convert("RGBA")
    matte = Image.new("RGBA", rgba.size, (255, 0, 255, 255))
    matte.alpha_composite(rgba)
    path.parent.mkdir(parents=True, exist_ok=True)
    matte.convert("RGB").save(path, "PNG", optimize=True)


def alpha_stats(path: Path) -> dict[str, float | int]:
    with Image.open(path) as opened:
        rgba = opened.convert("RGBA")
    hist = rgba.getchannel("A").histogram()
    pixels = rgba.width * rgba.height
    return {
        "width": rgba.width,
        "height": rgba.height,
        "transparentPct": round(sum(hist[:8]) * 100 / pixels, 3),
        "opaquePct": round(sum(hist[248:]) * 100 / pixels, 3),
    }


def run_cutter(kind: str, force: bool, dry_run: bool) -> None:
    spec = SHEETS[kind]
    out = CROPS / kind
    mask = QA / f"{kind}-mask.png"
    command = [
        sys.executable,
        str(CUTTER),
        str(spec["source"]),
        str(out),
        "--names",
        *spec["names"],
        "--expected-count",
        str(len(spec["names"])),
        "--padding",
        "12",
        "--alpha-threshold",
        "8",
        "--min-area",
        str(spec["minArea"]),
        "--close-radius",
        str(spec["close"]),
        "--debug-mask",
        str(mask),
        "--format",
        "png",
    ]
    if force:
        command.append("--force")
    if dry_run:
        command.append("--dry-run")
    print(f"cut {kind}: exact count {len(spec['names'])}", flush=True)
    subprocess.run(command, check=True)


def finalize_sheet(kind: str, report: dict[str, Any]) -> None:
    spec = SHEETS[kind]
    destination: Path = spec["dest"]
    destination.mkdir(parents=True, exist_ok=True)
    for name in spec["names"]:
        crop = CROPS / kind / f"{name}.png"
        with Image.open(crop) as opened:
            image = crop_visible(opened)
        limit = spec.get("limits", {}).get(name, spec.get("limit", (720, 720)))
        image.thumbnail(limit, Image.Resampling.LANCZOS)
        output = destination / ("title.webp" if kind == "title" else f"{name}.webp")
        image.save(output, "WEBP", lossless=True, method=6, exact=True)
        qa_path = QA / kind / f"{name}-magenta.png"
        save_magenta(image, qa_path)
        report[str(output.relative_to(GAME)).replace("\\", "/")] = {
            "source": str(crop.relative_to(GAME)).replace("\\", "/"),
            "sourceSha256": sha256(crop),
            "dimensions": list(image.size),
            "bytes": output.stat().st_size,
            "alpha": alpha_stats(output),
            "qaMagenta": str(qa_path.relative_to(GAME)).replace("\\", "/"),
        }


def finalize_orchard(report: dict[str, Any]) -> Image.Image:
    source = GPT / "orchard-source.png"
    with Image.open(source) as opened:
        image = opened.convert("RGB")
    scale = max(1440 / image.width, 1080 / image.height)
    image = image.resize(
        (round(image.width * scale), round(image.height * scale)),
        Image.Resampling.LANCZOS,
    )
    left = (image.width - 1440) // 2
    top = (image.height - 1080) // 2
    image = image.crop((left, top, left + 1440, top + 1080))
    output = GAME / "assets" / "orchard.webp"
    quality = 86
    while True:
        image.save(output, "WEBP", quality=quality, method=6)
        if output.stat().st_size <= 420 * 1024 or quality <= 68:
            break
        quality -= 3
    report[str(output.relative_to(GAME)).replace("\\", "/")] = {
        "source": str(source.relative_to(GAME)).replace("\\", "/"),
        "sourceSha256": sha256(source),
        "dimensions": [1440, 1080],
        "quality": quality,
        "bytes": output.stat().st_size,
    }
    return image


def contain(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    result = image.convert("RGBA").copy()
    result.thumbnail(size, Image.Resampling.LANCZOS)
    return result


def centered_paste(base: Image.Image, overlay: Image.Image, center: tuple[int, int]) -> None:
    x = round(center[0] - overlay.width / 2)
    y = round(center[1] - overlay.height / 2)
    base.alpha_composite(overlay, (x, y))


def build_badges(report: dict[str, Any]) -> None:
    medallion_path = GAME / "assets" / "ui" / "badge-medallion.webp"
    with Image.open(medallion_path) as opened:
        medallion = opened.convert("RGBA")
    destination = GAME / "assets" / "badges"
    destination.mkdir(parents=True, exist_ok=True)
    for fruit in FRUITS:
        with Image.open(GAME / "assets" / "fruit" / f"{fruit}-ripe.webp") as opened:
            subject = contain(opened, (round(medallion.width * 0.58), round(medallion.height * 0.58)))
        badge = medallion.copy()
        centered_paste(badge, subject, (badge.width // 2, round(badge.height * 0.48)))
        output = destination / f"{fruit}.webp"
        badge.save(output, "WEBP", lossless=True, method=6, exact=True)
        qa_path = QA / "badges" / f"{fruit}-magenta.png"
        save_magenta(badge, qa_path)
        report[str(output.relative_to(GAME)).replace("\\", "/")] = {
            "source": [
                str(medallion_path.relative_to(GAME)).replace("\\", "/"),
                f"assets/fruit/{fruit}-ripe.webp",
            ],
            "dimensions": list(badge.size),
            "bytes": output.stat().st_size,
            "qaMagenta": str(qa_path.relative_to(GAME)).replace("\\", "/"),
        }


def build_basket_variants(report: dict[str, Any]) -> None:
    source = GAME / "assets" / "ui" / "basket-empty.webp"
    with Image.open(source) as opened:
        basket = opened.convert("RGBA")
    # Runtime places the current ripe-fruit sprites inside these bases.  Keep
    # stable filenames for configuration/validation without baking a wrong
    # fruit identity into another station's basket.
    for name in ("basket-one", "basket-two", "basket-three"):
        output = GAME / "assets" / "ui" / f"{name}.webp"
        basket.save(output, "WEBP", lossless=True, method=6, exact=True)
        report[str(output.relative_to(GAME)).replace("\\", "/")] = {
            "source": "assets/ui/basket-empty.webp",
            "dimensions": list(basket.size),
            "bytes": output.stat().st_size,
            "note": "base basket; runtime overlays the currently harvested ripe fruit",
        }


def build_party(orchard: Image.Image, report: dict[str, Any]) -> None:
    party = orchard.convert("RGBA")
    # A feathered pool of warm light preserves the orchard texture without a
    # rectangular edge around the finale composition.
    mask = Image.new("L", party.size, 0)
    ImageDraw.Draw(mask).ellipse((110, 95, 1330, 1065), fill=104)
    mask = mask.filter(ImageFilter.GaussianBlur(105))
    veil = Image.new("RGBA", party.size, (255, 250, 220, 0))
    veil.putalpha(mask)
    party.alpha_composite(veil)
    with Image.open(GAME / "assets" / "ui" / "basket-empty.webp") as opened:
        basket = contain(opened, (680, 540))
    centered_paste(party, basket, (720, 760))
    centers = [(470, 600), (565, 560), (655, 590), (760, 570), (860, 595), (955, 560)]
    for fruit, center in zip(FRUITS, centers):
        with Image.open(GAME / "assets" / "fruit" / f"{fruit}-ripe.webp") as opened:
            subject = contain(opened, (175, 190))
        centered_paste(party, subject, center)
    with Image.open(GAME / "assets" / "ui" / "reward-wreath.webp") as opened:
        wreath = contain(opened, (360, 360))
    centered_paste(party, wreath, (720, 350))
    output = GAME / "assets" / "party.webp"
    quality = 86
    rgb = party.convert("RGB")
    while True:
        rgb.save(output, "WEBP", quality=quality, method=6)
        if output.stat().st_size <= 500 * 1024 or quality <= 68:
            break
        quality -= 3
    report[str(output.relative_to(GAME)).replace("\\", "/")] = {
        "source": "deterministic composition of orchard, basket, wreath, and six accepted ripe sprites",
        "dimensions": [1440, 1080],
        "quality": quality,
        "bytes": output.stat().st_size,
    }


def finalize_hub(report: dict[str, Any]) -> None:
    source = GPT / "hub-final-source.png"
    if not source.is_file():
        return
    with Image.open(source) as opened:
        image = opened.convert("RGB")

    def cover(size: tuple[int, int]) -> Image.Image:
        scale = max(size[0] / image.width, size[1] / image.height)
        resized = image.resize(
            (round(image.width * scale), round(image.height * scale)),
            Image.Resampling.LANCZOS,
        )
        left = (resized.width - size[0]) // 2
        top = (resized.height - size[1]) // 2
        return resized.crop((left, top, left + size[0], top + size[1]))

    outputs = [
        (ROOT / "assets" / "hub" / "tiles" / "happy-ripe-fruit.jpg", (640, 533), 88),
        (GAME / "assets" / "og-image.jpg", (1200, 630), 88),
    ]
    for output, size, quality in outputs:
        output.parent.mkdir(parents=True, exist_ok=True)
        cover(size).save(output, "JPEG", quality=quality, optimize=True, progressive=True)
        key = str(output.relative_to(ROOT)).replace("\\", "/")
        report[key] = {
            "source": str(source.relative_to(GAME)).replace("\\", "/"),
            "sourceSha256": sha256(source),
            "dimensions": list(size),
            "quality": quality,
            "bytes": output.stat().st_size,
        }


def main() -> int:
    parser = argparse.ArgumentParser(description="Process Happy Ripe Fruit art")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    required = [GPT / "orchard-source.png", *(spec["source"] for spec in SHEETS.values())]
    missing = [str(path) for path in required if not path.is_file()]
    if missing:
        raise FileNotFoundError("missing sources: " + ", ".join(missing))

    for kind in SHEETS:
        run_cutter(kind, args.force, args.dry_run)
    if args.dry_run:
        print("finalize: orchard, 18 fruits, 6 plants, 8 UI props, title, 6 badges, basket bases, party")
        return 0

    report: dict[str, Any] = {}
    orchard = finalize_orchard(report)
    for kind in SHEETS:
        finalize_sheet(kind, report)
    build_badges(report)
    build_basket_variants(report)
    build_party(orchard, report)
    finalize_hub(report)

    manifest = {
        "format": "happy-ripe-fruit-processing-v1",
        "generator": "GPT Image 2 built-in",
        "sourceAlpha": "native RGBA; no layered redraw required",
        "cutter": "tools/cut-asset-sheet.py",
        "sources": {path.name: sha256(path) for path in sorted(GPT.glob("*.png"))},
        "outputs": report,
    }
    target = SOURCE / "processing.json"
    target.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"processed": len(report), "manifest": str(target.relative_to(GAME))}))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (FileNotFoundError, ValueError, subprocess.CalledProcessError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        raise SystemExit(2)
