#!/usr/bin/env python3
"""Isolate the reviewed central sparkle with the approved Qwen Layered API."""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import subprocess
import sys
import time
from pathlib import Path
from urllib.request import Request, urlopen

from PIL import Image


GAME = Path(__file__).resolve().parents[1]
ROOT = GAME.parents[1]
SOURCE = GAME / "assets/source/cuts/props/spark-b.png"
OUT = GAME / "assets/source/layered"
PROMPT = (
    "Background layer: every partial neighboring object, all colored fringe, "
    "and all empty ground. Top layer: only the one complete central golden "
    "four-point wooden sparkle, preserving its exact shape, wood texture, "
    "lighting, and shadow; transparent background; no redesign and no extra pieces."
)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def multipart(url: str, fields: dict[str, str], file_path: Path) -> dict:
    boundary = "----qlobe-smell-jars-spark"
    body = bytearray()
    for key, value in fields.items():
        body += f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n'.encode()
    body += f'--{boundary}\r\nContent-Disposition: form-data; name="image"; filename="{file_path.name}"\r\n'.encode()
    body += b"Content-Type: image/png\r\n\r\n"
    body += file_path.read_bytes()
    body += f"\r\n--{boundary}--\r\n".encode()
    request = Request(
        url,
        data=bytes(body),
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    with urlopen(request, timeout=300) as response:
        return json.loads(response.read())


def keep_largest_alpha_component(source: Path, destination: Path, threshold: int = 128) -> None:
    """Drop disconnected scraps while preserving the generated component pixels exactly."""
    image = Image.open(source).convert("RGBA")
    alpha = image.getchannel("A")
    width, height = image.size
    pixels = alpha.load()
    visited: set[tuple[int, int]] = set()
    components: list[list[tuple[int, int]]] = []

    for y in range(height):
        for x in range(width):
            if pixels[x, y] <= threshold or (x, y) in visited:
                continue
            stack = [(x, y)]
            visited.add((x, y))
            component: list[tuple[int, int]] = []
            while stack:
                px, py = stack.pop()
                component.append((px, py))
                for nx, ny in ((px - 1, py), (px + 1, py), (px, py - 1), (px, py + 1)):
                    if (
                        0 <= nx < width
                        and 0 <= ny < height
                        and (nx, ny) not in visited
                        and pixels[nx, ny] > threshold
                    ):
                        visited.add((nx, ny))
                        stack.append((nx, ny))
            components.append(component)

    if not components:
        raise RuntimeError("Qwen sparkle extraction contained no visible alpha component")
    core = set(max(components, key=len))
    keep: set[tuple[int, int]] = set()
    for x, y in core:
        for ny in range(max(0, y - 3), min(height, y + 4)):
            for nx in range(max(0, x - 3), min(width, x + 4)):
                keep.add((nx, ny))
    output = image.copy()
    output_pixels = output.load()
    for y in range(height):
        for x in range(width):
            r, g, b, source_alpha = output_pixels[x, y]
            if (x, y) not in keep:
                output_pixels[x, y] = (r, g, b, 0)
            else:
                # The layer export carries a faint, nearly uniform matte alpha.
                # Remove it while retaining the generated soft edge around the core.
                clean_alpha = max(0, min(255, round((source_alpha - 24) * 255 / 231)))
                output_pixels[x, y] = (r, g, b, clean_alpha)
    output.save(destination, "PNG")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--api-url", default=os.environ.get("QLOBE_QWEN_URL"))
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    if not args.api_url:
        raise SystemExit("Pass --api-url or set QLOBE_QWEN_URL")
    OUT.mkdir(parents=True, exist_ok=True)
    prepared = OUT / "spark-layer-input.png"
    layered = OUT / "spark.layer2.png"
    raw_cutout = OUT / "spark.raw-cutout.png"
    raw_magenta = OUT / "spark.raw-qa-magenta.png"
    isolated = OUT / "spark.isolated.png"
    final = OUT / "spark.final.png"
    magenta = OUT / "spark.qa-magenta.png"
    source_image = Image.open(SOURCE).convert("RGBA")
    source_image.thumbnail((340, 340), Image.Resampling.LANCZOS)
    prepared_image = Image.new("RGBA", (512, 512), (72, 72, 72, 255))
    prepared_image.alpha_composite(
        source_image,
        ((512 - source_image.width) // 2, (512 - source_image.height) // 2),
    )
    prepared_image.convert("RGB").save(prepared, "PNG")
    if args.force or not layered.is_file():
        submitted = multipart(
            f"{args.api_url.rstrip('/')}/workflows/qwen-image-layered",
            {"prompt": PROMPT, "layers": "2", "seed": str(args.seed)},
            prepared,
        )
        job = submitted.get("job_id") or submitted.get("id")
        if not job:
            raise RuntimeError(f"Qwen returned no job id: {submitted}")
        for _ in range(450):
            with urlopen(f"{args.api_url.rstrip('/')}/jobs/{job}", timeout=60) as response:
                status = str(json.loads(response.read()).get("status", "")).lower()
            if status in {"completed", "complete", "success", "succeeded"}:
                break
            if status in {"failed", "error", "cancelled", "canceled"}:
                raise RuntimeError(f"Qwen extraction failed: {status}")
            time.sleep(2)
        else:
            raise TimeoutError("Qwen sparkle extraction timed out")
        with urlopen(
            f"{args.api_url.rstrip('/')}/jobs/{job}/result?output=layer_2",
            timeout=300,
        ) as response:
            layered.write_bytes(response.read())
    subprocess.run(
        [
            sys.executable,
            str(ROOT / "tools/pipeline/cutout_finalize.py"),
            "--input", str(layered),
            "--output", str(raw_cutout),
            "--magenta", str(raw_magenta),
            "--max-size", "512",
            "--pad", "0",
            "--alpha-floor", "4",
        ],
        check=True,
    )
    keep_largest_alpha_component(raw_cutout, isolated)
    subprocess.run(
        [
            sys.executable,
            str(ROOT / "tools/pipeline/cutout_finalize.py"),
            "--input", str(isolated),
            "--output", str(final),
            "--magenta", str(magenta),
            "--max-size", "240",
            "--pad", "12",
            "--alpha-floor", "4",
        ],
        check=True,
    )
    recipe = {
        "format": "qlobe-recipe",
        "formatVersion": 1,
        "id": "smell-jars-spark-layered-alpha",
        "kind": "image",
        "asset": str(final.relative_to(GAME)),
        "artDirection": "Toy",
        "steps": [
            {
                "tool": "deterministic Pillow matte preparation",
                "background": "#484848",
                "canvas": [512, 512],
            },
            {
                "workflow": "qwen-image-layered",
                "prompt": PROMPT,
                "seed": args.seed,
                "layers": 2,
                "selectedOutput": "layer_2",
            },
            {
                "tool": "largest connected alpha component",
                "threshold": 128,
                "edgeRadius": 3,
                "matteAlphaFloor": 24,
                "purpose": "remove disconnected neighboring sheet fragments",
            },
            {
                "tool": "tools/pipeline/cutout_finalize.py",
                "maxSize": 240,
                "pad": 12,
                "alphaFloor": 4,
            },
        ],
        "source": str(SOURCE.relative_to(GAME)),
        "sourceSha256": sha256(SOURCE),
        "prepared": str(prepared.relative_to(GAME)),
        "preparedSha256": sha256(prepared),
        "layer2Sha256": sha256(layered),
        "finalSha256": sha256(final),
        "qa": {
            "status": "pending-human-review",
            "magenta": str(magenta.relative_to(GAME)),
        },
        "createdAt": dt.datetime.now(dt.timezone.utc).isoformat(),
    }
    (OUT / "spark.recipe.json").write_text(
        json.dumps(recipe, indent=2) + "\n",
        encoding="utf-8",
    )
    print(final)


if __name__ == "__main__":
    main()
