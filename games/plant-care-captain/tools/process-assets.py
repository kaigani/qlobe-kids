#!/usr/bin/env python3
"""Finalize Plant Care Captain's accepted authored art.

The composition sheets are cut first with tools/cut-asset-sheet.py. This script
does not locate or redraw assets: it turns the accepted cutter crops into
runtime WebP files, creates magenta alpha-QA views, builds the catalog tile and
social card, and records byte-level provenance.

The UI master has a plain charcoal matte. Individual Qwen Layered attempts are
retained as rejected evidence because several returned nearly empty alpha and
one removed the leaf ornament. The accepted UI path therefore removes only the
sampled neutral matte from the immutable cutter crops, preserving GPT Image 2
pixels and antialiased shadows.
"""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from collections import deque
from pathlib import Path

from PIL import Image, ImageChops, ImageFilter, ImageOps


GAME = Path(__file__).resolve().parents[1]
ROOT = GAME.parents[1]
ASSETS = GAME / "assets"
SOURCE = ASSETS / "source"
CUTS = SOURCE / "cuts"
NORMALIZED = SOURCE / "normalized-alpha"
FINALIZED = SOURCE / "finalized"
QA = SOURCE / "qa"
FINALIZER = ROOT / "tools" / "pipeline" / "cutout_finalize.py"

PLANTS = ("sunflower", "pea", "basil")
STATES = ("dry", "watered", "misted", "bloom")
TOOLS = ("watering-can", "mister", "shears", "dry-leaf")
EFFECTS = (
    "water-drop-1", "water-drop-2", "water-drop-3",
    "mist-cloud", "glint", "rosette",
)
UI = (
    "choice-card", "instruction-plaque", "action-button",
    "progress-tray", "intro-cloud", "moisture-gauge",
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def ensure_dirs() -> None:
    for path in (
        ASSETS / "backgrounds", ASSETS / "plants", ASSETS / "tools",
        ASSETS / "effects", ASSETS / "ui", SOURCE / "local-api" / "deterministic-ui",
        NORMALIZED / "plants", NORMALIZED / "tools", NORMALIZED / "effects", NORMALIZED / "ui",
        FINALIZED / "plants", FINALIZED / "tools", FINALIZED / "effects",
        FINALIZED / "ui", QA / "magenta" / "plants", QA / "magenta" / "tools",
        QA / "magenta" / "effects", QA / "magenta" / "ui", QA / "contact",
        ROOT / "assets" / "hub" / "tiles",
    ):
        path.mkdir(parents=True, exist_ok=True)


def sampled_matte_alpha(source: Path, destination: Path) -> None:
    """Remove a flat neutral matte while retaining the source RGB unchanged."""
    image = Image.open(source).convert("RGBA")
    rgb = image.convert("RGB")
    width, height = rgb.size
    # The cutter leaves a clean matte border. A 7px corner patch is more robust
    # than one pixel against compression noise and the master's mild vignette.
    samples: list[tuple[int, int, int]] = []
    for left, top in ((0, 0), (width - 7, 0), (0, height - 7), (width - 7, height - 7)):
        samples.extend(rgb.crop((left, top, left + 7, top + 7)).getdata())
    ordered = sorted(samples)
    background = ordered[len(ordered) // 2]

    solid = Image.new("RGB", rgb.size, background)
    difference = ImageChops.difference(rgb, solid)
    # max-channel distance is stable on a neutral ground and keeps terracotta,
    # cream, green, and blue subject pixels safely separated.
    distance = difference.convert("RGB").split()
    maximum = ImageChops.lighter(ImageChops.lighter(distance[0], distance[1]), distance[2])
    low, high = 18, 58
    alpha = maximum.point(
        lambda value: 0 if value <= low else (255 if value >= high else round((value - low) * 255 / (high - low)))
    ).filter(ImageFilter.GaussianBlur(0.55))
    # Remove tiny matte texture but never erode an opaque subject edge.
    alpha = alpha.point(lambda value: 0 if value < 6 else value)
    image.putalpha(alpha)
    destination.parent.mkdir(parents=True, exist_ok=True)
    image.save(destination, "PNG", optimize=True)


def normalize_authored_alpha(source: Path, destination: Path) -> None:
    """Canonicalize GPT's visually opaque 240–254 band for Studio QA.

    GPT Image 2's transparent PNGs use alpha 254 for large fully visible areas.
    The shared finalizer intentionally counts only exact 255 as opaque, so the
    otherwise excellent cutouts fail its near-blank gate. Snapping the top 6%
    to 255 and the invisible tail to 0 preserves the antialiased middle band.
    """
    image = Image.open(source).convert("RGBA")
    alpha = image.getchannel("A").point(
        lambda value: 0 if value <= 5 else (255 if value >= 240 else value)
    )
    image.putalpha(alpha)
    destination.parent.mkdir(parents=True, exist_ok=True)
    image.save(destination, "PNG", optimize=True)


def isolate_largest_alpha_component(source: Path, destination: Path) -> None:
    """Keep one cutter-detected component when rectangular bboxes overlap.

    The three authored drops are separate alpha components, but their diagonal
    arrangement makes their rectangular cutter crops overlap. This masks the
    two neighboring fragments from each crop without changing the selected
    component's pixels.
    """
    image = Image.open(source).convert("RGBA")
    alpha = image.getchannel("A")
    width, height = image.size
    active = bytearray(1 if value > 8 else 0 for value in alpha.getdata())
    seen = bytearray(width * height)
    components: list[list[int]] = []
    for start, is_active in enumerate(active):
        if not is_active or seen[start]:
            continue
        seen[start] = 1
        queue: deque[int] = deque([start])
        component: list[int] = []
        while queue:
            offset = queue.popleft()
            component.append(offset)
            x, y = offset % width, offset // width
            for neighbor in (
                offset - 1 if x else -1,
                offset + 1 if x + 1 < width else -1,
                offset - width if y else -1,
                offset + width if y + 1 < height else -1,
            ):
                if neighbor >= 0 and active[neighbor] and not seen[neighbor]:
                    seen[neighbor] = 1
                    queue.append(neighbor)
        components.append(component)
    if not components:
        raise RuntimeError(f"No alpha component found in {source}")
    keep = set(max(components, key=len))
    values = list(alpha.getdata())
    image.putalpha(Image.new("L", image.size))
    clean_alpha = Image.new("L", image.size)
    clean_alpha.putdata([value if index in keep else 0 for index, value in enumerate(values)])
    image.putalpha(clean_alpha)
    destination.parent.mkdir(parents=True, exist_ok=True)
    image.save(destination, "PNG", optimize=True)


def finalize(source: Path, group: str, name: str, max_size: int) -> tuple[Path, Path]:
    png = FINALIZED / group / f"{name}.png"
    magenta = QA / "magenta" / group / f"{name}.png"
    subprocess.run(
        [
            sys.executable, str(FINALIZER), "--input", str(source),
            "--output", str(png), "--magenta", str(magenta),
            "--max-size", str(max_size), "--pad", "16", "--alpha-floor", "5",
        ],
        check=True,
    )
    return png, magenta


def encode_webp(source: Path, destination: Path, quality: int = 90) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    image = Image.open(source).convert("RGBA")
    image.save(destination, "WEBP", quality=quality, method=6, exact=True)


def cover(source: Path, size: tuple[int, int]) -> Image.Image:
    return ImageOps.fit(Image.open(source).convert("RGB"), size, Image.Resampling.LANCZOS, centering=(0.5, 0.5))


def paste_contain(canvas: Image.Image, art: Image.Image, box: tuple[int, int, int, int]) -> None:
    left, top, right, bottom = box
    item = art.convert("RGBA")
    item.thumbnail((right - left, bottom - top), Image.Resampling.LANCZOS)
    x = left + (right - left - item.width) // 2
    y = bottom - item.height
    canvas.alpha_composite(item, (x, y))


def contact_sheet(paths: list[Path], destination: Path, columns: int, cell: tuple[int, int]) -> None:
    rows = (len(paths) + columns - 1) // columns
    sheet = Image.new("RGB", (columns * cell[0], rows * cell[1]), (255, 0, 255))
    for index, path in enumerate(paths):
        art = Image.open(path).convert("RGBA")
        art.thumbnail((cell[0] - 24, cell[1] - 24), Image.Resampling.LANCZOS)
        x = (index % columns) * cell[0] + (cell[0] - art.width) // 2
        y = (index // columns) * cell[1] + (cell[1] - art.height) // 2
        sheet.paste(art, (x, y), art)
    sheet.save(destination, "JPEG", quality=88, optimize=True)


def main() -> None:
    ensure_dirs()
    records: dict[str, dict[str, object]] = {}
    contact_plants: list[Path] = []
    contact_small: list[Path] = []

    for plant in PLANTS:
        for state in STATES:
            name = f"{plant}-{state}"
            source = CUTS / plant / f"{state}.png"
            normalized = NORMALIZED / "plants" / f"{name}.png"
            normalize_authored_alpha(source, normalized)
            png, magenta = finalize(normalized, "plants", name, 720)
            output = ASSETS / "plants" / f"{name}.webp"
            encode_webp(png, output)
            contact_plants.append(png)
            records[output.relative_to(GAME).as_posix()] = {
                "source": source.relative_to(GAME).as_posix(),
                "normalizedAlpha": normalized.relative_to(GAME).as_posix(),
                "finalized": png.relative_to(GAME).as_posix(),
                "alphaQa": magenta.relative_to(GAME).as_posix(),
                "sha256": sha256(output),
                "bytes": output.stat().st_size,
            }

    for name in (*TOOLS, *EFFECTS):
        group = "tools" if name in TOOLS else "effects"
        source = CUTS / "tools" / f"{name}.png"
        normalized = NORMALIZED / group / f"{name}.png"
        normalize_source = source
        if name.startswith("water-drop-"):
            isolated = NORMALIZED / group / f"{name}-isolated.png"
            isolate_largest_alpha_component(source, isolated)
            normalize_source = isolated
        normalize_authored_alpha(normalize_source, normalized)
        png, magenta = finalize(normalized, group, name, 560)
        output = ASSETS / group / f"{name}.webp"
        encode_webp(png, output)
        contact_small.append(png)
        records[output.relative_to(GAME).as_posix()] = {
            "source": source.relative_to(GAME).as_posix(),
            "normalizedAlpha": normalized.relative_to(GAME).as_posix(),
            "finalized": png.relative_to(GAME).as_posix(),
            "alphaQa": magenta.relative_to(GAME).as_posix(),
            "sha256": sha256(output),
            "bytes": output.stat().st_size,
        }

    keyed_dir = SOURCE / "local-api" / "deterministic-ui"
    for name in UI:
        opaque = CUTS / "ui-opaque" / f"{name}.png"
        keyed = keyed_dir / f"{name}.png"
        sampled_matte_alpha(opaque, keyed)
        png, magenta = finalize(keyed, "ui", name, 900)
        output = ASSETS / "ui" / f"{name}.webp"
        encode_webp(png, output)
        contact_small.append(png)
        records[output.relative_to(GAME).as_posix()] = {
            "source": opaque.relative_to(GAME).as_posix(),
            "extraction": "sampled neutral-matte alpha; Qwen individual candidates rejected",
            "finalized": png.relative_to(GAME).as_posix(),
            "alphaQa": magenta.relative_to(GAME).as_posix(),
            "sha256": sha256(output),
            "bytes": output.stat().st_size,
        }

    title_source = CUTS / "title" / "title-lockup.png"
    title_normalized = NORMALIZED / "ui" / "title-lockup.png"
    normalize_authored_alpha(title_source, title_normalized)
    title_png, title_magenta = finalize(title_normalized, "ui", "title-lockup", 1200)
    title_output = ASSETS / "ui" / "title-lockup.webp"
    encode_webp(title_png, title_output, quality=92)
    records[title_output.relative_to(GAME).as_posix()] = {
        "source": title_source.relative_to(GAME).as_posix(),
        "normalizedAlpha": title_normalized.relative_to(GAME).as_posix(),
        "finalized": title_png.relative_to(GAME).as_posix(),
        "alphaQa": title_magenta.relative_to(GAME).as_posix(),
        "sha256": sha256(title_output),
        "bytes": title_output.stat().st_size,
    }

    backgrounds = {
        "greenhouse": SOURCE / "gpt-image-2" / "greenhouse-workbench-master.png",
        "greenhouse-thriving": SOURCE / "local-api" / "qwen-edit" / "greenhouse-thriving-empty-seed1337.png",
    }
    for name, source in backgrounds.items():
        output = ASSETS / "backgrounds" / f"{name}.webp"
        size = (1440, 1080) if name == "greenhouse" else (1152, 864)
        cover(source, size).save(output, "WEBP", quality=84, method=6)
        records[output.relative_to(GAME).as_posix()] = {
            "source": source.relative_to(GAME).as_posix(),
            "sha256": sha256(output),
            "bytes": output.stat().st_size,
            "dimensions": list(size),
        }

    hub_source = SOURCE / "local-api" / "krea" / "hub-seed42.png"
    hub_output = ROOT / "assets" / "hub" / "tiles" / "plant-care-captain.jpg"
    cover(hub_source, (640, 533)).save(hub_output, "JPEG", quality=89, optimize=True, progressive=True)

    # Social art is an authored raster composition of accepted game assets.
    social = cover(backgrounds["greenhouse-thriving"], (1200, 630)).convert("RGBA")
    blooms = [FINALIZED / "plants" / f"{plant}-bloom.png" for plant in PLANTS]
    for path, box in zip(blooms, ((55, 190, 420, 620), (410, 190, 790, 620), (780, 190, 1145, 620))):
        paste_contain(social, Image.open(path), box)
    title = Image.open(title_png).convert("RGBA")
    title.thumbnail((700, 260), Image.Resampling.LANCZOS)
    social.alpha_composite(title, ((1200 - title.width) // 2, 12))
    social.convert("RGB").save(ASSETS / "og-image.jpg", "JPEG", quality=90, optimize=True, progressive=True)

    contact_sheet(contact_plants, QA / "contact" / "plant-states.jpg", 4, (330, 430))
    contact_sheet(contact_small, QA / "contact" / "tools-ui.jpg", 4, (320, 300))

    manifest = {
        "pipeline": "GPT Image 2 masters -> repository cutter -> accepted Qwen Layered or deterministic matte extraction -> shared cutout finalizer -> WebP",
        "assets": records,
        "hub": {
            "source": hub_source.relative_to(GAME).as_posix(),
            "output": hub_output.relative_to(ROOT).as_posix(),
            "sha256": sha256(hub_output),
            "bytes": hub_output.stat().st_size,
        },
        "rejectedCandidates": {
            "uiGrouped": "local-api/layered/ui-carriers-layer2.png dropped three of six carriers",
            "uiIndividual": "individual Qwen outputs retained under local-api/layered/ui-individual; four had near-empty alpha and the intro cloud lost its leaf ornament",
            "thrivingSeed42": "qwen-edit/greenhouse-thriving-seed42.png added an identity-breaking generic center plant",
        },
    }
    (ASSETS / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"runtimeAssets": len(records), "hub": str(hub_output), "qa": str(QA)}, indent=2))


if __name__ == "__main__":
    main()
