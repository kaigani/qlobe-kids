#!/usr/bin/env python3
"""Deterministically finalize Secret Message Copy production art.

The GPT Image 2 masters and exact-count cutter manifests remain under
``assets/source``.  This script removes the flat authoring key, normalizes the
generator's real alpha, runs the shared cutout QA gate, encodes compact runtime
WebP files, and writes a hash-bound processing receipt plus a QA contact sheet.

Run from the repository root:

    python games/secret-message-copy/tools/process-assets.py
"""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw
from PIL import ImageOps


ROOT = Path(__file__).resolve().parents[3]
GAME = ROOT / "games" / "secret-message-copy"
ASSETS = GAME / "assets"
SOURCE = ASSETS / "source"
GPT = SOURCE / "gpt-image-2"
CROPS = SOURCE / "crops"
LAYERS = SOURCE / "layers"
FINAL = SOURCE / "final-png"
QA = SOURCE / "qa"
ART = ASSETS / "art"
HUB = ROOT / "assets" / "hub" / "tiles" / "secret-message-copy.jpg"
FINALIZER = ROOT / "tools" / "pipeline" / "cutout_finalize.py"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def ensure_dirs() -> None:
    for folder in (LAYERS, FINAL, QA, ART):
        folder.mkdir(parents=True, exist_ok=True)


def chroma_matte(source: Path, destination: Path) -> None:
    """Soft-key the uniform magenta while recovering antialiased edge colour."""
    image = Image.open(source).convert("RGBA")
    rgba = np.asarray(image, dtype=np.float32)
    rgb = rgba[:, :, :3]
    samples = np.concatenate(
        (
            rgb[:12, :12].reshape(-1, 3),
            rgb[:12, -12:].reshape(-1, 3),
            rgb[-12:, :12].reshape(-1, 3),
            rgb[-12:, -12:].reshape(-1, 3),
        )
    )
    key = np.median(samples, axis=0)
    distance = np.linalg.norm(rgb - key, axis=2)
    # GPT contact sheets often contain a saturated violet transition band
    # between the painted subject and the exact magenta key.  A conventional
    # narrow key treats that band as opaque and leaves a visible neon outline
    # in-game.  The wider confidence ramp rejects the violet spill while
    # retaining the much more distant navy, red, parchment, and brown paint.
    alpha = np.clip((distance - 68.0) / 106.0, 0.0, 1.0)
    safe = np.maximum(alpha[:, :, None], 0.07)
    recovered = (rgb - (1.0 - alpha[:, :, None]) * key) / safe
    recovered = np.clip(recovered, 0, 255)
    recovered[alpha <= 0.01] = 0
    # The contact-sheet cutter deliberately pads each connected subject.  A
    # neighbouring cell can still peek into that rectangular safety margin
    # when the generator makes a gutter unusually tight.  Preserve only the
    # named subject's largest connected alpha component and its antialiased
    # fringe; this is deterministic and prevents cross-cell contamination.
    binary = (alpha > 0.08).astype(np.uint8)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(binary, 8)
    if count > 1:
        largest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
        keep = (labels == largest).astype(np.uint8)
        keep = cv2.dilate(keep, np.ones((3, 3), np.uint8), iterations=1)
        alpha *= keep
        recovered[keep == 0] = 0

    # Decontaminate the remaining soft edge.  Straight-alpha PNG/WebP keeps
    # RGB values even where alpha is tiny, so magenta RGB in those pixels can
    # bleed back during browser scaling.  Propagate nearby confident subject
    # colour into the transition instead of storing key-coloured edge pixels.
    known = alpha >= 0.98
    filled = recovered.copy()
    frontier = known.astype(np.float32)
    kernel = np.ones((3, 3), np.float32)
    for _ in range(12):
        counts = cv2.filter2D(frontier, -1, kernel, borderType=cv2.BORDER_CONSTANT)
        adjacent = (~known) & (counts > 0)
        if not np.any(adjacent):
            break
        for channel in range(3):
            totals = cv2.filter2D(
                filled[:, :, channel] * frontier,
                -1,
                kernel,
                borderType=cv2.BORDER_CONSTANT,
            )
            filled[:, :, channel][adjacent] = totals[adjacent] / counts[adjacent]
        known[adjacent] = True
        frontier = known.astype(np.float32)
    transition = (alpha > 0.0) & (alpha < 0.98)
    recovered[transition] = filled[transition]
    output = np.dstack((recovered, np.round(alpha * 255.0))).astype(np.uint8)
    Image.fromarray(output).save(destination, "PNG", optimize=True)


def preserve_alpha(source: Path, destination: Path) -> None:
    """Keep generated alpha while normalizing its 254-valued solid core."""
    image = Image.open(source).convert("RGBA")
    alpha = image.getchannel("A").point(
        lambda value: 0 if value <= 8 else (255 if value >= 224 else value)
    )
    image.putalpha(alpha)
    image.save(destination, "PNG", optimize=True)


def finalize(name: str, source: Path, max_size: int) -> tuple[Path, dict]:
    output = FINAL / f"{name}.png"
    magenta = QA / f"{name}-magenta.png"
    command = [
        sys.executable,
        str(FINALIZER),
        "--input",
        str(source),
        "--output",
        str(output),
        "--magenta",
        str(magenta),
        "--max-size",
        str(max_size),
        "--pad",
        "10",
        "--alpha-floor",
        "4",
    ]
    run = subprocess.run(command, capture_output=True, text=True, check=False)
    try:
        result = json.loads(run.stdout.strip())
    except json.JSONDecodeError as error:
        raise RuntimeError(run.stderr.strip() or run.stdout.strip()) from error
    if run.returncode or not result.get("pass"):
        raise RuntimeError(f"cutout QA failed for {name}: {result}")
    return output, result


def encode_webp(source: Path, destination: Path, quality: int = 90) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    Image.open(source).save(
        destination, "WEBP", quality=quality, method=6, exact=True
    )


def encode_backdrop(source: Path, destination: Path) -> None:
    image = Image.open(source).convert("RGB").resize(
        (1600, 1200), Image.Resampling.LANCZOS
    )
    image.save(destination, "WEBP", quality=82, method=6)


def runtime_asset(
    receipt: dict,
    name: str,
    source: Path,
    *,
    matte: str,
    max_size: int,
    output_name: str | None = None,
) -> None:
    layer = LAYERS / f"{name}.png"
    if matte == "chroma":
        chroma_matte(source, layer)
    else:
        preserve_alpha(source, layer)
    final_png, qa = finalize(name, layer, max_size)
    runtime = ART / f"{output_name or name}.webp"
    encode_webp(final_png, runtime)
    receipt["assets"][f"art/{runtime.name}"] = {
        "source": str(source.relative_to(GAME)).replace("\\", "/"),
        "sourceSha256": sha256(source),
        "matte": matte,
        "qa": qa,
        "outputBytes": runtime.stat().st_size,
    }


def contact_sheet(paths: list[Path], destination: Path) -> None:
    cell = (300, 250)
    columns = 4
    rows = (len(paths) + columns - 1) // columns
    sheet = Image.new("RGB", (columns * cell[0], rows * cell[1]), (255, 0, 255))
    draw = ImageDraw.Draw(sheet)
    for index, path in enumerate(paths):
        image = Image.open(path).convert("RGBA")
        image.thumbnail((cell[0] - 32, cell[1] - 32), Image.Resampling.LANCZOS)
        x = (index % columns) * cell[0] + (cell[0] - image.width) // 2
        y = (index // columns) * cell[1] + (cell[1] - image.height) // 2
        sheet.paste(image, (x, y), image)
        draw.rectangle(
            (
                (index % columns) * cell[0],
                (index // columns) * cell[1],
                (index % columns + 1) * cell[0] - 1,
                (index // columns + 1) * cell[1] - 1,
            ),
            outline=(45, 22, 70),
            width=2,
        )
    sheet.save(destination, "PNG", optimize=True)


def main() -> None:
    ensure_dirs()
    receipt: dict = {
        "format": "qlobe-asset-processing-v1",
        "game": "secret-message-copy",
        "cutoutFinalizer": str(FINALIZER.relative_to(ROOT)).replace("\\", "/"),
        "assetCutter": "tools/cut-asset-sheet.py",
        "assets": {},
    }

    keyed = {
        "envelope-star": 560,
        "envelope-moon": 560,
        "envelope-heart": 560,
        "stamp-star": 380,
        "stamp-moon": 380,
        "stamp-heart": 380,
        "seal-burst": 460,
    }
    for name, size in keyed.items():
        runtime_asset(
            receipt,
            name,
            CROPS / "object-kit" / f"{name}.png",
            matte="chroma",
            max_size=size,
        )

    for name in ("owl-neutral", "owl-guide", "owl-carry", "owl-cheer"):
        runtime_asset(
            receipt,
            name,
            CROPS / "owl-poses" / f"{name}.png",
            matte="chroma",
            max_size=700,
        )

    for name, size in {
        "nav-home": 256,
        "nav-back": 256,
        "nav-sound": 256,
        "nav-muted": 256,
        "button-next": 560,
        "button-replay": 560,
    }.items():
        runtime_asset(
            receipt,
            name,
            CROPS / "nav-kit" / f"{name}.png",
            matte="alpha",
            max_size=size,
        )

    runtime_asset(
        receipt,
        "title-lockup",
        GPT / "title-lockup-master.png",
        matte="alpha",
        max_size=1100,
    )
    runtime_asset(
        receipt,
        "paper-sheet",
        GPT / "paper-sheet-wide-master.png",
        matte="alpha",
        max_size=1400,
    )

    for source_name, output_name in (
        ("desk-backdrop-master.png", "backdrop-desk.webp"),
        ("delivery-backdrop-master.png", "backdrop-delivery.webp"),
    ):
        source = GPT / source_name
        output = ART / output_name
        encode_backdrop(source, output)
        receipt["assets"][f"art/{output.name}"] = {
            "source": str(source.relative_to(GAME)).replace("\\", "/"),
            "sourceSha256": sha256(source),
            "size": [1600, 1200],
            "outputBytes": output.stat().st_size,
        }

    hub_source = GPT / "hub-tile-fallback-master.png"
    with Image.open(hub_source) as image:
        hub = ImageOps.fit(
            image.convert("RGB"), (640, 533), method=Image.Resampling.LANCZOS
        )
    hub.save(HUB, "JPEG", quality=88, optimize=True, progressive=True)
    receipt["assets"]["../../../assets/hub/tiles/secret-message-copy.jpg"] = {
        "source": str(hub_source.relative_to(GAME)).replace("\\", "/"),
        "sourceSha256": sha256(hub_source),
        "workflow": "built-in-gpt-image-2 fallback after Krea worker failure",
        "size": [640, 533],
        "outputBytes": HUB.stat().st_size,
    }

    finals = sorted(ART.glob("*.webp"))
    contact_sheet(finals, QA / "runtime-contact-sheet-magenta.png")
    (SOURCE / "processing.json").write_text(
        json.dumps(receipt, indent=2) + "\n", encoding="utf-8"
    )
    print(
        json.dumps(
            {
                "processed": len(receipt["assets"]),
                "receipt": str((SOURCE / "processing.json").relative_to(ROOT)).replace(
                    "\\", "/"
                ),
            }
        )
    )


if __name__ == "__main__":
    main()
