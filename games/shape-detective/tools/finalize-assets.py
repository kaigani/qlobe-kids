#!/usr/bin/env python3
"""Finalize Shape Detective cutouts and preserve evidence for every fallback."""
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
from collections import deque
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

GAME = Path(__file__).resolve().parents[1]
ROOT = GAME.parents[1]
LAYER = GAME / "assets/source/layer2"
CROPS = GAME / "assets/source/crops"
FALLBACK = GAME / "assets/source/fallback-alpha"
OUT = GAME / "assets"
QA = GAME / "assets/source/qa/final"
PIPE = ROOT / "tools/pipeline/cutout_finalize.py"

MAPPINGS = [
    *[("shapes", name, "shapes", name, 360, 18)
      for name in "circle triangle square rectangle oval pentagon hexagon star".split()],
    *[("cards", name, "cards", name, 620, 20)
      for name in "shape-clues secret-spots chalk-map".split()],
    *[("ui", name, "ui", name, 760, 20)
      for name in "magnifier clue-plaque action-slab".split()],
    *[("ui", f"rosette-{name}", "rewards", f"rosette-{name}", 280, 16)
      for name in "turquoise yellow coral".split()],
    ("ui", "case-closed", "ui", "case-closed", 720, 16),
]


def relative(path: Path) -> str:
    return str(path.relative_to(ROOT))


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run_pipeline(source: Path, output: Path, magenta: Path, size: int, pad: int) -> tuple[bool, dict]:
    output.parent.mkdir(parents=True, exist_ok=True)
    magenta.parent.mkdir(parents=True, exist_ok=True)
    command = [
        sys.executable,
        str(PIPE),
        "--input", str(source),
        "--output", str(output),
        "--magenta", str(magenta),
        "--max-size", str(size),
        "--pad", str(pad),
        "--alpha-floor", "16",
    ]
    result = subprocess.run(command, capture_output=True, text=True)
    try:
        report = json.loads(result.stdout.strip().splitlines()[-1])
    except (json.JSONDecodeError, IndexError):
        report = {
            "pass": False,
            "reason": "canonical finalizer produced no JSON report",
            "stderr": result.stderr.strip(),
        }
    valid = result.returncode == 0 and report.get("pass") is True and output.is_file()
    return valid, report


def alpha_corners(path: Path) -> list[int]:
    with Image.open(path) as source:
        image = source.convert("RGBA")
        return [
            image.getpixel(point)[3]
            for point in (
                (0, 0),
                (image.width - 1, 0),
                (0, image.height - 1),
                (image.width - 1, image.height - 1),
            )
        ]


def magenta_despill(
    image: Image.Image,
    alpha: Image.Image,
    *,
    open_center: bool = False,
    preserve_pink_material: bool = False,
) -> tuple[Image.Image, Image.Image, dict]:
    """Remove the generated magenta ground and its colored cast-shadow spill.

    The source sheet deliberately used a hot-magenta isolation ground. A plain
    flood key removes the flat field, but generated shadows are scalar-darkened
    magenta and survive as a neon halo. This second pass keys that chroma family
    while protecting neutral slate and the deliberately coral rosette material.
    """
    pixels = list(image.get_flattened_data())
    alpha_values = list(alpha.get_flattened_data())
    output_pixels = []
    output_alpha = []
    keyed_pixels = 0
    despilled_pixels = 0
    for (red, green, blue, _), old_alpha in zip(pixels, alpha_values):
        score = green - 0.23 * min(red, blue)
        factor = max(0.0, min(1.0, (score + 2.0) / 16.0))
        if max(red, green, blue) - min(red, green, blue) < 9 and max(red, green, blue) < 75:
            factor = 1.0
        new_alpha = round(old_alpha * factor)
        if new_alpha < old_alpha:
            keyed_pixels += 1

        spill = max(0.0, min(red, blue) - green * 1.12)
        if spill > 0 and (not preserve_pink_material or factor < 0.999):
            red = max(green, round(red - spill * 1.35))
            blue = max(green, round(blue - spill * 1.05))
            despilled_pixels += 1
        output_pixels.append((red, green, blue, 255))
        output_alpha.append(new_alpha)

    cleaned = Image.new("RGBA", image.size)
    cleaned.putdata(output_pixels)
    cleaned_alpha = Image.new("L", image.size)
    cleaned_alpha.putdata(output_alpha)

    hole_bbox = None
    if open_center:
        width, height = cleaned.size
        alpha_pixels = cleaned_alpha.load()
        start = (width // 2, height // 2)
        queue = deque([start])
        visited = bytearray(width * height)
        component = []
        while queue:
            x, y = queue.pop()
            index = y * width + x
            if visited[index]:
                continue
            visited[index] = 1
            if alpha_pixels[x, y] > 16:
                continue
            component.append((x, y))
            for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                if 0 <= nx < width and 0 <= ny < height:
                    queue.append((nx, ny))
        if component:
            xs = [point[0] for point in component]
            ys = [point[1] for point in component]
            bounds = (min(xs), min(ys), max(xs), max(ys))
            if bounds[0] > 0 and bounds[1] > 0 and bounds[2] < width - 1 and bounds[3] < height - 1:
                ImageDraw.Draw(cleaned_alpha).ellipse(bounds, fill=0)
                hole_bbox = list(bounds)

    cleaned.putalpha(cleaned_alpha)
    return cleaned, cleaned_alpha, {
        "method": "magenta-chroma-shadow-despill",
        "score": "green - 0.23 * min(red, blue)",
        "softRange": [-2, 14],
        "preservePinkMaterial": preserve_pink_material,
        "keyedPixels": keyed_pixels,
        "despilledPixels": despilled_pixels,
        "openCenterEllipse": hole_bbox,
    }


def contiguous_ground_key(
    source: Path,
    output: Path,
    *,
    open_center: bool = False,
    despill_magenta_ground: bool = False,
    preserve_pink_material: bool = False,
) -> dict:
    image = Image.open(source).convert("RGBA")
    rgb = image.convert("RGB")
    width, height = image.size
    pixels = rgb.load()
    samples = [
        pixels[0, 0],
        pixels[width - 1, 0],
        pixels[0, height - 1],
        pixels[width - 1, height - 1],
    ]
    outer_ground = tuple(sum(sample[channel] for sample in samples) // 4 for channel in range(3))
    alpha = Image.new("L", image.size, 255)
    alpha_pixels = alpha.load()
    visited = bytearray(width * height)

    def flood(seeds: list[tuple[int, int]], ground: tuple[int, int, int], threshold: float) -> int:
        queue: deque[tuple[int, int]] = deque()
        for x, y in seeds:
            index = y * width + x
            if not visited[index]:
                visited[index] = 1
                queue.append((x, y))
        removed = 0
        while queue:
            x, y = queue.pop()
            color = pixels[x, y]
            distance = sum((color[channel] - ground[channel]) ** 2 for channel in range(3)) ** 0.5
            if distance > threshold:
                continue
            alpha_pixels[x, y] = 0
            removed += 1
            for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                if 0 <= nx < width and 0 <= ny < height:
                    index = ny * width + nx
                    if not visited[index]:
                        visited[index] = 1
                        queue.append((nx, ny))
        return removed

    border = (
        [(x, 0) for x in range(width)]
        + [(x, height - 1) for x in range(width)]
        + [(0, y) for y in range(height)]
        + [(width - 1, y) for y in range(height)]
    )
    outer_removed = flood(border, outer_ground, 46)
    inner_removed = 0
    if open_center:
        center = (width // 2, height // 2)
        inner_removed = flood([center], pixels[center[0], center[1]], 58)

    alpha = alpha.filter(ImageFilter.GaussianBlur(0.85))
    alpha = alpha.point(lambda value: 0 if value <= 16 else 255 if value >= 244 else value)
    despill_record = None
    if despill_magenta_ground:
        image, alpha, despill_record = magenta_despill(
            image,
            alpha,
            open_center=open_center,
            preserve_pink_material=preserve_pink_material,
        )
    image.putalpha(alpha)
    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output)
    return {
        "outerGroundRgb": list(outer_ground),
        "outerThreshold": 46,
        "outerPixelsRemoved": outer_removed,
        "centerHoleOpened": open_center,
        "centerPixelsRemoved": inner_removed,
        "centerThreshold": 58 if open_center else None,
        "featherPx": 0.85,
        "alphaFloor": 16,
        "despill": despill_record,
    }


def selected(args_only: list[str] | None, family: str, name: str) -> bool:
    if not args_only:
        return True
    return family in args_only or name in args_only or f"{family}/{name}" in args_only


def load_processing() -> dict:
    path = QA / "processing.json"
    if not path.is_file():
        return {}
    try:
        value = json.loads(path.read_text())
        return value if isinstance(value, dict) else {}
    except json.JSONDecodeError:
        return {}


def build_contact_sheet() -> None:
    panels = []
    for family, name, *_ in MAPPINGS:
        path = QA / family / f"{name}.png"
        if path.is_file():
            panels.append((f"{family}/{name}", path))
    rows = max(1, (len(panels) + 3) // 4)
    sheet = Image.new("RGB", (800, rows * 180), (255, 0, 255))
    draw = ImageDraw.Draw(sheet)
    for index, (label, path) in enumerate(panels):
        image = Image.open(path).convert("RGB")
        image.thumbnail((195, 145))
        x, y = (index % 4) * 200, (index // 4) * 180
        sheet.paste(image, (x + (195 - image.width) // 2, y))
        draw.text((x + 3, y + 148), label, fill="white")
    QA.mkdir(parents=True, exist_ok=True)
    sheet.save(QA / "contact-sheet.png")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--only", nargs="*", help="families, names, or family/name keys")
    args = parser.parse_args()
    QA.mkdir(parents=True, exist_ok=True)
    processing = load_processing()

    for family, name, target_family, target, size, pad in MAPPINGS:
        if not selected(args.only, family, name):
            continue
        key = f"{family}/{name}"
        is_case_closed = name == "case-closed"
        raw = (GAME / "assets/source/gpt-image-2/case-closed-alpha-normalized.png"
               if is_case_closed else LAYER / family / f"{name}-seed42.png")
        crop = raw if is_case_closed else CROPS / family / f"{name}.png"
        runtime = OUT / target_family / f"{target}.webp"
        magenta = (QA / "case-closed-magenta.png"
                   if is_case_closed else QA / family / f"{name}.png")
        temporary = runtime.with_suffix(".pipeline.png")
        if not raw.is_file():
            raise SystemExit(f"missing finalization input: {raw}")
        if runtime.is_file() and magenta.is_file() and not args.force:
            print(f"{key}: skip", flush=True)
            continue

        runtime.parent.mkdir(parents=True, exist_ok=True)
        valid, qwen_report = run_pipeline(raw, temporary, magenta, size, pad)
        corners = alpha_corners(raw)
        qwen_rejection = None
        selected_source = raw
        workflow = ("gpt-image-2 accepted master + deterministic alpha normalization "
                    "+ canonical cutout finalization"
                    if is_case_closed else "qwen-image-layered layer_2")
        fallback_record = None

        if is_case_closed and (not valid or max(corners) > 16):
            raise SystemExit(
                f"{key}: accepted alpha-normalized master failed canonical QA: "
                f"{qwen_report.get('reason') or corners}"
            )
        if not is_case_closed and (not valid or max(corners) > 16):
            if temporary.is_file():
                temporary.unlink()
            reason = qwen_report.get("reason")
            if max(corners) > 16:
                reason = f"opaque corner alpha {max(corners)} > 16"
            qwen_rejection = {
                "reason": reason or "canonical alpha QA rejected output",
                "cornerAlpha": corners,
                "canonicalReport": qwen_report
            }
            if not crop.is_file():
                raise SystemExit(f"missing immutable crop fallback: {crop}")
            fallback = FALLBACK / family / f"{name}.png"
            fallback_record = contiguous_ground_key(
                crop,
                fallback,
                open_center=family == "ui" and name == "magnifier",
                despill_magenta_ground=family == "ui",
                preserve_pink_material=name.startswith("rosette-"),
            )
            valid, final_report = run_pipeline(fallback, temporary, magenta, size, pad)
            if not valid:
                raise SystemExit(f"{key}: deterministic fallback rejected: {final_report.get('reason')}")
            selected_source = fallback
            workflow = "deterministic-contiguous-ground-key"
        else:
            final_report = qwen_report

        Image.open(temporary).convert("RGBA").save(runtime, "WEBP", quality=90, method=6)
        temporary.unlink(missing_ok=True)
        record = {
            "workflow": workflow,
            "selectedSource": relative(selected_source),
            "runtime": relative(runtime),
            "magentaQa": relative(magenta),
            "canonicalReport": final_report,
            "sourceSha256": sha256(raw),
            "runtimeSha256": sha256(runtime),
            "magentaSha256": sha256(magenta),
        }
        if is_case_closed:
            record["source"] = relative(raw)
        else:
            record["fallbackProcessing"] = fallback_record
            record["qwenRejection"] = qwen_rejection
            record["rawLayer2"] = relative(raw)
            record["sourceCrop"] = relative(crop)
        processing[key] = record
        print(f"{key}: finalized via {workflow}", flush=True)

    (QA / "processing.json").write_text(json.dumps(processing, indent=2) + "\n")
    build_contact_sheet()


if __name__ == "__main__":
    main()
