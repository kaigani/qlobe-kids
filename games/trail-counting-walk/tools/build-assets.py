#!/usr/bin/env python3
"""Deterministically finalize Trail Counting Walk production art."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from collections import deque
from pathlib import Path
from statistics import median
from typing import Any

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageOps


GAME = Path(__file__).resolve().parents[1]
REPO = GAME.parents[1]
SOURCE = GAME / "assets" / "source"
MASTERS = SOURCE / "gpt-image-2"
LAYERED = SOURCE / "layer2"
CUTS = SOURCE / "crops"
FINAL_PNG = SOURCE / "final-png"
MATTES = SOURCE / "mattes"
QA = SOURCE / "qa" / "finals"
ART = GAME / "assets" / "art"
FINALIZER = REPO / "tools" / "pipeline" / "cutout_finalize.py"
HUB_SOURCE = SOURCE / "local-api" / "hub-tile-master.png"
HUB = REPO / "assets" / "hub" / "tiles" / "trail-counting-walk.jpg"

NAMES = (
    "route-5", "route-10", "route-20", "stone",
    "fox-idle", "fox-hop", "fox-celebrate", "pennant",
    "star", "finish-flag", "button-orange", "active-mat",
)
FOX = ("fox-idle", "fox-hop", "fox-celebrate")
MAX_SIZE = {
    "route-5": 640,
    "route-10": 640,
    "route-20": 640,
    "stone": 440,
    "fox-idle": 620,
    "fox-hop": 620,
    "fox-celebrate": 620,
    "pennant": 380,
    "star": 260,
    "finish-flag": 380,
    "button-orange": 520,
    "active-mat": 430,
    "title": 1180,
}


def require(path: Path) -> Image.Image:
    if not path.is_file() or path.stat().st_size == 0:
        raise FileNotFoundError(path)
    with Image.open(path) as image:
        image.load()
        return image.copy()


def atomic_webp(image: Image.Image, path: Path, quality: int = 88) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    image.save(temporary, "WEBP", quality=quality, method=6, exact=True)
    os.replace(temporary, path)


def cover_crop(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    image = image.convert("RGB")
    scale = max(size[0] / image.width, size[1] / image.height)
    image = image.resize(
        (round(image.width * scale), round(image.height * scale)),
        Image.Resampling.LANCZOS,
    )
    left = (image.width - size[0]) // 2
    top = (image.height - size[1]) // 2
    return image.crop((left, top, left + size[0], top + size[1]))


def validate_cutter_manifest() -> None:
    manifest_path = CUTS / "boxes.json"
    manifest = json.loads(manifest_path.read_text("utf-8"))
    found = tuple(asset.get("name") for asset in manifest.get("assets", []))
    if found != NAMES:
        raise ValueError(f"cutter manifest mismatch: {found!r}")
    if len(found) != 12:
        raise ValueError("the required expected-count=12 cutter gate did not pass")


def largest_component(mask: Image.Image) -> Image.Image:
    """Return only the largest 8-connected foreground component."""
    width, height = mask.size
    data = mask.tobytes()
    seen = bytearray(width * height)
    largest: list[int] = []
    for offset, value in enumerate(data):
        if not value or seen[offset]:
            continue
        seen[offset] = 1
        queue = deque([offset])
        component: list[int] = []
        while queue:
            current = queue.popleft()
            component.append(current)
            x, y = current % width, current // width
            for ny in range(max(0, y - 1), min(height, y + 2)):
                for nx in range(max(0, x - 1), min(width, x + 2)):
                    neighbor = ny * width + nx
                    if data[neighbor] and not seen[neighbor]:
                        seen[neighbor] = 1
                        queue.append(neighbor)
        if len(component) > len(largest):
            largest = component
    selected = bytearray(width * height)
    for offset in largest:
        selected[offset] = 255
    return Image.frombytes("L", (width, height), bytes(selected))


def exact_source_matte(source: Path, output: Path, *, fill_interior: bool = False) -> dict[str, Any]:
    """Remove only the contiguous charcoal ground while preserving GPT pixels."""
    image = require(source).convert("RGBA")
    rgb = image.convert("RGB")
    width, height = rgb.size
    pixels = rgb.load()
    band = max(1, min(width, height) // 30)
    samples = [
        pixels[x, y]
        for y in range(height)
        for x in range(width)
        if x < band or x >= width - band or y < band or y >= height - band
    ]
    background = tuple(round(median(pixel[channel] for pixel in samples)) for channel in range(3))
    hard = bytearray(width * height)
    soft = bytearray(width * height)
    for y in range(height):
        for x in range(width):
            pixel = pixels[x, y]
            distance = max(abs(pixel[channel] - background[channel]) for channel in range(3))
            residual = tuple(pixel[channel] - background[channel] for channel in range(3))
            chroma = max(residual) - min(residual)
            offset = y * width + x
            if distance >= 10 or chroma >= 8:
                hard[offset] = 255
            edge = max(distance, chroma)
            soft[offset] = 0 if edge <= 6 else min(255, round((edge - 6) * 12))

    main = largest_component(Image.frombytes("L", (width, height), bytes(hard)))
    if fill_interior:
        holes = ImageOps.invert(main)
        ImageDraw.floodfill(holes, (0, 0), 0)
        main = ImageChops.lighter(main, holes)
    support = main.filter(ImageFilter.MaxFilter(7))
    fringe = ImageChops.multiply(Image.frombytes("L", (width, height), bytes(soft)), support)
    fringe = fringe.filter(ImageFilter.GaussianBlur(0.45))
    image.putalpha(ImageChops.lighter(fringe, main))
    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output, "PNG", optimize=True)
    return {
        "sampledBackgroundRgb": list(background),
        "filledInteriorHoles": fill_interior,
    }


def alpha_review(source: Path) -> dict[str, Any]:
    image = require(source).convert("RGBA")
    histogram = image.getchannel("A").histogram()
    total = image.width * image.height
    return {
        "transparentPct": round(histogram[0] * 100 / total, 3),
        "opaquePct": round(histogram[255] * 100 / total, 3),
        "maxAlpha": max(index for index, count in enumerate(histogram) if count),
    }


def prepare_cutout_source(name: str, fallback: Path) -> tuple[Path, dict[str, Any]]:
    """Use a valid Layered subject, otherwise apply the established exact-source matte."""
    layered = LAYERED / f"{name}-seed42.png"
    review = alpha_review(layered)
    if review["opaquePct"] >= 1.0 and review["transparentPct"] >= 5.0:
        return layered, {
            "workflow": "qwen-image-layered",
            "layer": "layer_2",
            "layeredReview": {"status": "accepted", **review},
        }

    matte = MATTES / f"{name}.png"
    matte_info = exact_source_matte(fallback, matte, fill_interior=name.startswith("route-"))
    return matte, {
        "workflow": "exact-source-contiguous-ground-matte",
        "layer": None,
        "layeredReview": {
            "status": "rejected",
            "reason": "layer_2 had no opaque subject core",
            "source": str(layered.relative_to(GAME)).replace("\\", "/"),
            **review,
        },
        "fallbackSource": str(fallback.relative_to(GAME)).replace("\\", "/"),
        **matte_info,
    }


def run_finalizer(
    name: str,
    source: Path,
    force: bool,
    provenance: dict[str, Any],
) -> dict[str, Any]:
    output = FINAL_PNG / f"{name}.png"
    magenta = QA / f"{name}-magenta.png"
    if force:
        output.unlink(missing_ok=True)
    output.parent.mkdir(parents=True, exist_ok=True)
    magenta.parent.mkdir(parents=True, exist_ok=True)
    command = [
        sys.executable,
        str(FINALIZER),
        "--input", str(source),
        "--output", str(output),
        "--magenta", str(magenta),
        "--max-size", str(MAX_SIZE[name]),
        "--pad", "12",
        "--alpha-floor", "4",
    ]
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    try:
        report = json.loads(result.stdout.strip().splitlines()[-1])
    except (json.JSONDecodeError, IndexError):
        report = {"pass": False, "reason": result.stderr.strip() or result.stdout.strip()}
    report.update({
        "source": str(source.relative_to(GAME)).replace("\\", "/"),
        "output": str(output.relative_to(GAME)).replace("\\", "/"),
        "magenta": str(magenta.relative_to(GAME)).replace("\\", "/"),
        **provenance,
    })
    if result.returncode or not report.get("pass") or not output.is_file():
        raise RuntimeError(f"{name}: alpha finalizer rejected asset: {report}")
    return report


def build_backgrounds(report: list[dict[str, Any]]) -> None:
    for name in ("world-select", "world-meadow", "world-creek", "world-ridge"):
        source = MASTERS / f"{name}-master.png"
        target = ART / f"{name}.webp"
        image = cover_crop(require(source), (1440, 1080))
        atomic_webp(image, target, quality=76)
        report.append({
            "name": name,
            "source": str(source.relative_to(GAME)).replace("\\", "/"),
            "output": str(target.relative_to(GAME)).replace("\\", "/"),
            "size": list(image.size),
            "bytes": target.stat().st_size,
            "workflow": "gpt-image-2",
        })


def build_cutouts(force: bool, report: list[dict[str, Any]]) -> None:
    alpha_reports: dict[str, Any] = {}
    for name in NAMES:
        source, provenance = prepare_cutout_source(name, CUTS / f"{name}.png")
        alpha_reports[name] = run_finalizer(name, source, force, provenance)

    title_source, title_provenance = prepare_cutout_source("title", MASTERS / "title-master.png")
    alpha_reports["title"] = run_finalizer("title", title_source, force, title_provenance)

    # Normalize all pose sprites to one canvas, common scale, and common floor
    # so swapping idle/hop/celebrate never makes Pip jump incidentally.
    fox_images = {name: require(FINAL_PNG / f"{name}.png").convert("RGBA") for name in FOX}
    common_scale = min(1.0, 580 / max(max(image.size) for image in fox_images.values()))
    for name, image in fox_images.items():
        if common_scale < 1:
            image = image.resize(
                (round(image.width * common_scale), round(image.height * common_scale)),
                Image.Resampling.LANCZOS,
            )
        canvas = Image.new("RGBA", (640, 640))
        canvas.alpha_composite(image, ((640 - image.width) // 2, 628 - image.height))
        atomic_webp(canvas, ART / f"{name}.webp", quality=91)

    for name in (*NAMES[:4], *NAMES[7:]):
        atomic_webp(require(FINAL_PNG / f"{name}.png").convert("RGBA"), ART / f"{name}.webp", quality=91)
    atomic_webp(require(FINAL_PNG / "title.png").convert("RGBA"), ART / "title.webp", quality=92)

    for name, alpha_report in alpha_reports.items():
        runtime = ART / f"{name}.webp"
        runtime_name = name
        alpha_report.update({
            "name": runtime_name,
            "runtime": str(runtime.relative_to(GAME)).replace("\\", "/"),
            "bytes": runtime.stat().st_size,
        })
        report.append(alpha_report)


def build_hub(report: list[dict[str, Any]]) -> None:
    image = cover_crop(require(HUB_SOURCE), (640, 533))
    HUB.parent.mkdir(parents=True, exist_ok=True)
    image.save(HUB, "JPEG", quality=90, optimize=True, progressive=True)
    report.append({
        "name": "hub-tile",
        "source": str(HUB_SOURCE.relative_to(GAME)).replace("\\", "/"),
        "output": str(HUB.relative_to(REPO)).replace("\\", "/"),
        "size": [640, 533],
        "bytes": HUB.stat().st_size,
        "workflow": "krea2-turbo-t2i",
    })


def validate_outputs() -> None:
    for name in ("world-select", "world-meadow", "world-creek", "world-ridge"):
        with Image.open(ART / f"{name}.webp") as image:
            if image.size != (1440, 1080) or image.mode != "RGB":
                raise ValueError(f"{name}: expected opaque 1440x1080 WebP")
    for name in (*NAMES, "title"):
        with Image.open(ART / f"{name}.webp") as image:
            image.load()
            if "A" not in image.getbands() or image.getchannel("A").getbbox() is None:
                raise ValueError(f"{name}: runtime alpha missing")
    for name in FOX:
        with Image.open(ART / f"{name}.webp") as image:
            if image.size != (640, 640):
                raise ValueError(f"{name}: normalized pose canvas changed")
    with Image.open(HUB) as image:
        if image.size != (640, 533) or image.mode != "RGB":
            raise ValueError("hub tile must be opaque 640x533 RGB")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    validate_cutter_manifest()
    ART.mkdir(parents=True, exist_ok=True)
    report: list[dict[str, Any]] = []
    build_backgrounds(report)
    build_cutouts(args.force, report)
    build_hub(report)
    validate_outputs()
    ledger = SOURCE / "qa" / "production-report.json"
    ledger.parent.mkdir(parents=True, exist_ok=True)
    ledger.write_text(json.dumps(report, indent=2) + "\n", "utf-8")
    print(f"built {len(report)} production assets")
    for item in report:
        print(f"{item['name']:18} {item.get('bytes', 0):8} bytes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
