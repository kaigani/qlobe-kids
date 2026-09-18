#!/usr/bin/env python3
"""Finalize Instrument Detective's reviewed source art into runtime assets.

The GPT Image 2 masters are immutable. Contact-sheet objects are located by the
shared ``tools/cut-asset-sheet.py`` exact-count gate before this script runs.
Qwen Layered candidates are retained beside the masters for audit, but the
reviewed 2026-09-18 candidates dropped subjects, so shipping sprites use an
exact-source contiguous-ground matte. Every cutout still passes the canonical
``tools/pipeline/cutout_finalize.py`` alpha gate and gets a magenta composite.
"""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from collections import deque
from pathlib import Path
from statistics import median

from PIL import Image, ImageChops, ImageFilter


GAME = Path(__file__).resolve().parents[1]
ROOT = GAME.parents[1]
SOURCE = GAME / "assets" / "source"
GPT = SOURCE / "gpt-image-2"
QA = SOURCE / "qa"
MATTES = QA / "mattes"
FINAL_PNGS = QA / "final-pngs"
FINALIZER = ROOT / "tools" / "pipeline" / "cutout_finalize.py"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def largest_component(mask: Image.Image) -> Image.Image:
    """Keep the main 8-connected subject and discard stray generated flecks."""
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


def exact_source_matte(source: Path, output: Path) -> dict:
    """Remove only the contiguous flat ground while keeping source pixels."""
    image = Image.open(source).convert("RGBA")
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
    support = main.filter(ImageFilter.MaxFilter(7))
    fringe = ImageChops.multiply(Image.frombytes("L", (width, height), bytes(soft)), support)
    fringe = fringe.filter(ImageFilter.GaussianBlur(0.45))
    alpha = ImageChops.lighter(fringe, main)
    image.putalpha(alpha)
    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output, "PNG", optimize=True)
    return {"sampledBackgroundRgb": list(background), "matteSha256": sha256(output)}


def finalize_cutout(source: Path, destination: Path, name: str, max_size: int, keyed: bool) -> dict:
    matte = MATTES / f"{name}.png"
    if keyed:
        matte_info = exact_source_matte(source, matte)
        alpha_method = "exact-source-largest-component-contiguous-ground-matte"
    else:
        matte.parent.mkdir(parents=True, exist_ok=True)
        image = Image.open(source).convert("RGBA")
        # GPT's native-alpha sheet uses 252–254 for visually solid material.
        # Normalize only that opaque plateau; keep the soft antialiased edge.
        alpha = image.getchannel("A").point(
            lambda value: 0 if value <= 4 else (255 if value >= 248 else value)
        )
        image.putalpha(alpha)
        image.save(matte, "PNG", optimize=True)
        matte_info = {"matteSha256": sha256(matte)}
        alpha_method = "source-alpha-opaque-plateau-normalized"

    final_png = FINAL_PNGS / f"{name}.png"
    magenta = QA / "magenta" / f"{name}.png"
    final_png.parent.mkdir(parents=True, exist_ok=True)
    magenta.parent.mkdir(parents=True, exist_ok=True)
    command = [
        sys.executable,
        str(FINALIZER),
        "--input", str(matte),
        "--output", str(final_png),
        "--magenta", str(magenta),
        "--max-size", str(max_size),
        "--pad", "14",
        "--alpha-floor", "4",
    ]
    completed = subprocess.run(command, check=False, capture_output=True, text=True)
    try:
        receipt = json.loads(completed.stdout)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"cutout finalizer returned invalid JSON for {name}: {completed.stderr}") from exc
    if completed.returncode or not receipt.get("pass"):
        raise RuntimeError(f"cutout finalizer rejected {name}: {receipt}")

    destination.parent.mkdir(parents=True, exist_ok=True)
    image = Image.open(final_png).convert("RGBA")
    image.save(destination, "WEBP", quality=90, method=6)
    return {
        "source": str(source.relative_to(GAME)).replace("\\", "/"),
        "sourceSha256": sha256(source),
        "alphaMethod": alpha_method,
        **matte_info,
        "qa": receipt,
        "magenta": str(magenta.relative_to(GAME)).replace("\\", "/"),
        "final": str(destination.relative_to(GAME)).replace("\\", "/"),
        "bytes": destination.stat().st_size,
    }


def fit_plate(source: Path, destination: Path, size=(1456, 1092), quality=87) -> dict:
    image = Image.open(source).convert("RGB")
    scale = max(size[0] / image.width, size[1] / image.height)
    image = image.resize((round(image.width * scale), round(image.height * scale)), Image.Resampling.LANCZOS)
    left = max(0, (image.width - size[0]) // 2)
    top = max(0, (image.height - size[1]) // 2)
    image = image.crop((left, top, left + size[0], top + size[1]))
    destination.parent.mkdir(parents=True, exist_ok=True)
    image.save(destination, "WEBP", quality=quality, method=6)
    return {
        "source": str(source.relative_to(GAME)).replace("\\", "/"),
        "sourceSha256": sha256(source),
        "final": str(destination.relative_to(GAME)).replace("\\", "/"),
        "size": list(size),
        "bytes": destination.stat().st_size,
    }


def main() -> int:
    records: dict[str, object] = {
        "format": "instrument-detective-finalize-report",
        "version": 1,
        "layeredReview": {
            "workflow": "qwen-image-layered",
            "seed": 42,
            "selectedOutput": "layer_2",
            "status": "rejected",
            "reason": "instrument sheet retained only drum; owl sheet and title were empty",
            "retainedAt": "assets/source/local-api/layered/",
        },
        "assets": {},
    }
    assets = records["assets"]
    assert isinstance(assets, dict)

    for name in ("maracas", "drum", "bell", "piano", "guitar", "flute"):
        assets[f"instrument/{name}"] = finalize_cutout(
            GPT / "instrument-crops" / f"{name}.png",
            GAME / "assets" / "instruments" / f"{name}.webp",
            f"instrument-{name}",
            600,
            keyed=True,
        )

    for pose in ("listening", "presenting", "celebrating", "conducting"):
        assets[f"character/owl-{pose}"] = finalize_cutout(
            GPT / "owl-pose-crops" / f"{pose}.png",
            GAME / "assets" / "characters" / f"owl-{pose}.webp",
            f"owl-{pose}",
            640,
            keyed=True,
        )

    assets["ui/title"] = finalize_cutout(
        GPT / "title-crop" / "title.png",
        GAME / "assets" / "ui" / "title.webp",
        "title",
        1100,
        keyed=True,
    )

    for name in ("card-green", "card-purple", "card-blue", "listen-button", "primary-button", "progress-plaque"):
        assets[f"ui/{name}"] = finalize_cutout(
            GPT / "ui-crops" / f"{name}.png",
            GAME / "assets" / "ui" / f"{name}.webp",
            f"ui-{name}",
            640,
            keyed=False,
        )

    assets["background/theater"] = fit_plate(
        GPT / "theater-background.png",
        GAME / "assets" / "backgrounds" / "theater.webp",
    )
    assets["background/finale"] = fit_plate(
        GPT / "finale-background.png",
        GAME / "assets" / "backgrounds" / "finale.webp",
    )

    hub_source = SOURCE / "krea2" / "hub-tile-source.png"
    hub = Image.open(hub_source).convert("RGB").resize((640, 533), Image.Resampling.LANCZOS)
    hub_destination = ROOT / "assets" / "hub" / "tiles" / "instrument-detective.jpg"
    hub_destination.parent.mkdir(parents=True, exist_ok=True)
    hub.save(hub_destination, "JPEG", quality=89, optimize=True)
    records["hub"] = {
        "workflow": "krea2-turbo-t2i",
        "seed": 42,
        "source": str(hub_source.relative_to(GAME)).replace("\\", "/"),
        "sourceSha256": sha256(hub_source),
        "final": str(hub_destination.relative_to(ROOT)).replace("\\", "/"),
        "size": [640, 533],
        "bytes": hub_destination.stat().st_size,
    }

    report = SOURCE / "finalize-report.json"
    report.write_text(json.dumps(records, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "assets": len(assets),
        "hub": records["hub"],
        "report": str(report.relative_to(GAME)).replace("\\", "/"),
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
