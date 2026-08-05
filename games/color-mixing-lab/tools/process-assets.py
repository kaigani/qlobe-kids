#!/usr/bin/env python3
"""Finalize Color Mixing Lab contact sheets into production WebP assets.

The normal documented project path is Qwen Image Layered ``layer_2``. This
script keeps that path available, but defaults to local chroma plates produced
with the installed imagegen helper because direct LAN uploads were denied by
the execution safety gate for this run. The selected local path is a hard
color-distance matte with a one-pixel contracted/feathered edge, not a flood
fill. A soft despill pass was rejected during visual QA because it altered
orange, purple, and cream watercolor pigments.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import time
import urllib.request
from pathlib import Path

from PIL import Image


GAME = Path(__file__).resolve().parents[1]
ROOT = GAME.parents[1]
SRC = GAME / "assets/source"
MASTER = SRC / "gpt-image-2"
SLICES = SRC / "slices"
LAYERS = SRC / "layers"
FINAL_MASTERS = SRC / "final"
QA = SRC / "qa"
OUT = GAME / "assets"

GROUPS = [
    ("mode-cards-sheet.png", ["ui/mode-discover", "ui/mode-predict", "ui/mode-recipe"], 420),
    ("flasks-sheet.png", ["flasks/red", "flasks/yellow", "flasks/blue", "flasks/empty"], 420),
    ("beakers-sheet.png", ["beakers/empty", "beakers/orange", "beakers/green", "beakers/purple"], 600),
    ("mascots-sheet.png", ["mascots/orange", "mascots/green", "mascots/purple"], 420),
    ("streams-sheet.png", ["effects/stream-red", "effects/stream-yellow", "effects/stream-blue"], 640),
    ("swirls-sheet.png", ["effects/swirl-orange", "effects/swirl-green", "effects/swirl-purple"], 520),
]

# The mascot generation's raised hands intentionally reach wider than one
# equal third. The inspected transparent gutters are 698–741 and 1319–1364;
# split inside those gutters so Orange keeps its right hand and Green never
# inherits Orange's disconnected fingertip.
SHEET_X_BOUNDS = {
    "mascots-sheet.png": (0, 720, 1342, 2048),
}


def configured_qwen_url(cli_value: str | None) -> str:
    try:
        state = json.loads((ROOT / "tools/state/local.json").read_text("utf-8"))
    except Exception:
        state = {}
    return (cli_value or os.getenv("QLOBE_QWEN_URL") or state.get("qwenUrl") or "").rstrip("/")


def post_multipart(url: str, fields: dict[str, str], image_path: Path) -> bytes:
    boundary = "----qlobe-color-lab"
    body = bytearray()
    for key, value in fields.items():
        body += (
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"{key}\"\r\n\r\n"
            f"{value}\r\n"
        ).encode()
    body += (
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"image\"; "
        f"filename=\"{image_path.name}\"\r\nContent-Type: image/png\r\n\r\n"
    ).encode()
    body += image_path.read_bytes()
    body += f"\r\n--{boundary}--\r\n".encode()
    request = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    with urllib.request.urlopen(request, timeout=300) as response:
        return response.read()


def get(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=300) as response:
        return response.read()


def extraction_prompt(subject: str) -> str:
    return (
        "Layer 1 is only a flat dark charcoal background. Layer 2 must be the complete "
        f"{subject} alone on true transparency; preserve exact shape, colors, texture, and "
        "every part; no background, shadows, redraw, crop, or omissions."
    )


def qwen_layer(base: str, source: Path, destination: Path, subject: str, seed: int, force: bool) -> int:
    if destination.exists() and destination.stat().st_size > 5_000 and not force:
        return seed
    payload = json.loads(
        post_multipart(
            f"{base}/workflows/qwen-image-layered",
            {"prompt": extraction_prompt(subject), "layers": "2", "seed": str(seed)},
            source,
        )
    )
    job_id = payload.get("job_id") or payload.get("id")
    if not job_id:
        raise RuntimeError(f"Qwen did not return a job id: {payload}")
    for _ in range(450):
        time.sleep(4)
        status = json.loads(get(f"{base}/jobs/{job_id}")).get("status")
        if status == "completed":
            data = get(f"{base}/jobs/{job_id}/result?output=layer_2")
            if not data.startswith(b"\x89PNG"):
                raise RuntimeError("Qwen layer_2 result was not PNG")
            destination.write_bytes(data)
            return seed
        if status in {"failed", "error", "cancelled", "canceled"}:
            raise RuntimeError(f"Qwen job failed: {status}")
    raise TimeoutError(job_id)


def run_finalize(raw: Path, png_master: Path, magenta: Path, max_edge: int) -> dict:
    command = [
        "python3",
        str(ROOT / "tools/pipeline/cutout_finalize.py"),
        "--input",
        str(raw),
        "--output",
        str(png_master),
        "--magenta",
        str(magenta),
        "--max-size",
        str(max_edge),
        "--pad",
        "12",
        "--alpha-floor",
        "4",
    ]
    result = json.loads(subprocess.check_output(command, text=True))
    if not result.get("pass"):
        raise RuntimeError(f"cutout QA failed for {raw.name}: {result}")
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--method", choices=("local-chroma", "qwen-layered"), default="local-chroma")
    parser.add_argument("--qwen-url")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    qwen_url = configured_qwen_url(args.qwen_url)
    if args.method == "qwen-layered" and not qwen_url:
        raise SystemExit("QLOBE_QWEN_URL/local qwenUrl is not configured")

    for folder in (SLICES, LAYERS, FINAL_MASTERS, QA):
        folder.mkdir(parents=True, exist_ok=True)

    records: dict[str, dict] = {}
    for sheet_name, names, max_edge in GROUPS:
        source_sheet = MASTER / sheet_name
        alpha_sheet_path = MASTER / f"{Path(sheet_name).stem}-alpha.png"
        chroma_sheet_path = MASTER / f"{Path(sheet_name).stem}-magenta.png"
        alpha_sheet = None
        if args.method == "local-chroma":
            if not alpha_sheet_path.is_file():
                raise FileNotFoundError(f"missing local chroma alpha sheet: {alpha_sheet_path}")
            if not chroma_sheet_path.is_file():
                raise FileNotFoundError(f"missing local chroma source sheet: {chroma_sheet_path}")
            # A precise background edit may normalize the canvas by a few pixels
            # (the mascot sheet changed from 2052×766 to 2048×768). The edited
            # magenta plate and its derived alpha are the registered pair, so
            # slice those together rather than scaling either one back to the
            # nondeterministic first generation.
            source = Image.open(chroma_sheet_path).convert("RGBA")
            alpha_sheet = Image.open(alpha_sheet_path).convert("RGBA")
            if alpha_sheet.size != source.size:
                raise RuntimeError(f"source/alpha sheet size mismatch for {sheet_name}")
        else:
            source = Image.open(source_sheet).convert("RGBA")
        width, height = source.size
        cell_width = width // len(names)
        bounds = SHEET_X_BOUNDS.get(sheet_name)
        if bounds and (len(bounds) != len(names) + 1 or bounds[0] != 0 or bounds[-1] != width):
            raise RuntimeError(f"invalid inspected crop bounds for {sheet_name}: {bounds}, width={width}")

        for index, name in enumerate(names):
            crop = (
                (bounds[index], 0, bounds[index + 1], height)
                if bounds
                else (index * cell_width, 0, (index + 1) * cell_width, height)
            )
            stem = name.replace("/", "-")
            source_slice = SLICES / f"{stem}-source.png"
            source.crop(crop).save(source_slice, "PNG", optimize=True)

            raw_layer = LAYERS / f"{stem}-alpha.png"
            if args.method == "local-chroma":
                assert alpha_sheet is not None
                alpha_sheet.crop(crop).save(raw_layer, "PNG", optimize=True)
                selected_seed = None
                steps = [
                    {
                        "workflow": "gpt-image-2",
                        "op": "precise-object-edit",
                        "change": "background-only to flat #ff00ff",
                        "source": str(source_sheet.relative_to(GAME)),
                        "chromaSource": str(chroma_sheet_path.relative_to(GAME)),
                    },
                    {
                        "op": "remove-chroma-key",
                        "method": (
                            "hard color-distance matte; tolerance 60; edge-contract 1; "
                            "edge-feather 0.5 (not flood fill)"
                        ),
                        "selectedOutput": str(alpha_sheet_path.relative_to(GAME)),
                    },
                ]
            else:
                selected_seed = qwen_layer(
                    qwen_url,
                    source_slice,
                    raw_layer,
                    name.split("/")[-1],
                    args.seed,
                    args.force,
                )
                steps = [
                    {
                        "workflow": "qwen-image-layered",
                        "prompt": extraction_prompt(name.split("/")[-1]),
                        "selectedOutput": "layer_2",
                        "seed": selected_seed,
                    }
                ]

            final_png = FINAL_MASTERS / f"{stem}.png"
            magenta = QA / f"{stem}-magenta.png"
            result = run_finalize(raw_layer, final_png, magenta, max_edge)
            final = OUT / f"{name}.webp"
            final.parent.mkdir(parents=True, exist_ok=True)
            subprocess.run(
                [
                    "cwebp",
                    "-quiet",
                    "-q",
                    "88",
                    "-alpha_q",
                    "100",
                    "-m",
                    "6",
                    str(final_png),
                    "-o",
                    str(final),
                ],
                check=True,
            )
            records[name] = {
                "source": str(source_sheet.relative_to(GAME)),
                "crop": list(crop),
                "method": args.method,
                "steps": steps,
                "rawAlpha": str(raw_layer.relative_to(GAME)),
                "final": str(final.relative_to(GAME)),
                "alpha": result["alpha"],
                "finalSize": result["finalSize"],
                "finalKB": round(final.stat().st_size / 1024, 1),
                "validation": "passed",
            }

    (SRC / "processing.json").write_text(
        json.dumps(
            {
                "format": "qlobe-color-lab-processing",
                "formatVersion": 1,
                "method": args.method,
                "intermediatePolicy": (
                    "Cell slices, raw alpha mattes, final PNG masters, and magenta QA "
                    "plates are reproducible working files and are not shipped; rerun this "
                    "script to regenerate them from the retained full-sheet sources."
                ),
                "objects": records,
            },
            indent=2,
        )
        + "\n",
        "utf-8",
    )
    print(f"ART DONE {len(records)}/{sum(len(names) for _, names, _ in GROUPS)} ({args.method})")


if __name__ == "__main__":
    main()
