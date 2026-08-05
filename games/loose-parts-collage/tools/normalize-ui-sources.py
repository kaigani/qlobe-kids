#!/usr/bin/env python3
"""Normalize Little Artist UI badge grounds with the local Qwen edit workflow."""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import tempfile
import urllib.request
from pathlib import Path

from PIL import Image, ImageOps, ImageStat


GAME_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = GAME_ROOT.parents[1]
SOURCE_ROOT = GAME_ROOT / "assets/source/local-api"
PLAN_PATH = SOURCE_ROOT / "plan.json"
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
PIPELINE_VERSION = 1
EDIT_PROMPT = (
    "Change only the dark-charcoal background to a perfectly flat solid saturated "
    "chroma-magenta background. Keep the complete circular papercraft badge "
    "identical in shape, scale, position, colors, material texture, physical "
    "shadows, cream outer rim, every backing layer, and central glyph. Do not "
    "redraw, crop, enlarge, move, recolor, add, or remove any part of the badge. "
    "No gradient, texture, vignette, cast shadow, border, or extra object in the "
    "magenta background."
)


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def atomic_write(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as handle:
            handle.write(data)
            temporary = Path(handle.name)
        temporary.replace(path)
    finally:
        if temporary and temporary.exists():
            temporary.unlink()


def configured_base_url(explicit_url: str | None) -> str:
    if explicit_url:
        return explicit_url.rstrip("/")
    if os.getenv("QLOBE_QWEN_URL"):
        return os.environ["QLOBE_QWEN_URL"].rstrip("/")
    state_path = REPO_ROOT / "tools/state/local.json"
    if state_path.exists():
        state = json.loads(state_path.read_text())
        return str(state.get("qwenUrl", "")).rstrip("/")
    return ""


def multipart(fields: dict[str, object], image_path: Path) -> tuple[bytes, str]:
    boundary = "----qlobe-little-artist-ui-normalize"
    body = bytearray()
    for name, value in fields.items():
        body.extend(
            f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"'
            f"\r\n\r\n{value}\r\n".encode()
        )
    body.extend(
        f'--{boundary}\r\nContent-Disposition: form-data; name="image"; '
        f'filename="{image_path.name}"\r\nContent-Type: image/png\r\n\r\n'.encode()
    )
    body.extend(image_path.read_bytes())
    body.extend(f"\r\n--{boundary}--\r\n".encode())
    return bytes(body), boundary


def cell_boxes(size: tuple[int, int], columns: int, rows: int) -> list[tuple[int, int, int, int]]:
    width, height = size
    return [
        (
            round(column * width / columns),
            round(row * height / rows),
            round((column + 1) * width / columns),
            round((row + 1) * height / rows),
        )
        for row in range(rows)
        for column in range(columns)
    ]


def prepare_slices(job: dict) -> dict[str, Path]:
    source = Image.open(SOURCE_ROOT / job["output"]).convert("RGBA")
    layout = job["layout"]
    names = layout["ids"]
    boxes = cell_boxes(source.size, int(layout["columns"]), int(layout["rows"]))
    padding = tuple(int(value) for value in job.get("slicePadding", [0, 0, 0, 0]))
    if len(padding) != 4:
        raise ValueError("ui-sheet slicePadding must contain four values")
    paths: dict[str, Path] = {}
    for name, box in zip(names, boxes):
        cell = source.crop(box)
        if any(padding):
            cell = ImageOps.expand(cell, border=padding, fill=cell.getpixel((0, 0)))
        path = SOURCE_ROOT / "slices" / job["id"] / f"{name}.png"
        buffer = io.BytesIO()
        cell.save(buffer, format="PNG", optimize=True)
        atomic_write(path, buffer.getvalue())
        paths[name] = path
    return paths


def magenta_ground_metrics(data: bytes) -> dict:
    if not data.startswith(PNG_SIGNATURE):
        raise ValueError("Qwen Image Edit result is not a PNG")
    image = Image.open(io.BytesIO(data)).convert("RGB")
    if min(image.size) < 256:
        raise ValueError(f"normalized source is unexpectedly small: {image.size}")
    patch_width = max(8, image.width // 10)
    patch_height = max(8, image.height // 10)
    patches = [
        image.crop((0, 0, patch_width, patch_height)),
        image.crop((image.width - patch_width, 0, image.width, patch_height)),
        image.crop((0, image.height - patch_height, patch_width, image.height)),
        image.crop((
            image.width - patch_width,
            image.height - patch_height,
            image.width,
            image.height,
        )),
    ]
    corner_mean = [
        round(sum(values) / len(values), 2)
        for values in zip(*(ImageStat.Stat(patch).mean for patch in patches))
    ]
    corner_stddev = [
        round(sum(values) / len(values), 2)
        for values in zip(*(ImageStat.Stat(patch).stddev for patch in patches))
    ]
    red, green, blue = corner_mean
    if red < 170 or blue < 90 or green > 100:
        raise ValueError(f"corners are not chroma-magenta: mean={corner_mean}")
    if max(corner_stddev) > 42:
        raise ValueError(f"corner ground is not flat enough: stddev={corner_stddev}")
    return {
        "dimensions": list(image.size),
        "cornerMeanRgb": corner_mean,
        "cornerStddevRgb": corner_stddev,
    }


def recipe_matches(recipe_path: Path, output: Path, source_sha: str, seed: int) -> bool:
    if not output.is_file() or output.stat().st_size < 5_000 or not recipe_path.is_file():
        return False
    try:
        recipe = json.loads(recipe_path.read_text())
    except (OSError, json.JSONDecodeError):
        return False
    return (
        recipe.get("pipelineVersion") == PIPELINE_VERSION
        and recipe.get("sourceSha256") == source_sha
        and recipe.get("prompt") == EDIT_PROMPT
        and recipe.get("seed") == seed
        and recipe.get("outputSha256") == sha256_bytes(output.read_bytes())
    )


def normalize(base_url: str, name: str, source: Path, seed: int, force: bool) -> None:
    output = SOURCE_ROOT / "normalized" / "ui-sheet" / f"{name}.png"
    recipe_path = output.with_suffix(".png.recipe.json")
    source_sha = sha256_bytes(source.read_bytes())
    if not force and recipe_matches(recipe_path, output, source_sha, seed):
        print(f"skip ui/{name} (matching normalized source)", flush=True)
        return
    print(f"normalize ui/{name} workflow=qwen-image-edit seed={seed}", flush=True)
    body, boundary = multipart({"prompt": EDIT_PROMPT, "seed": seed}, source)
    request = urllib.request.Request(
        f"{base_url}/workflows/qwen-image-edit?sync=true",
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    with urllib.request.urlopen(request, timeout=20 * 60) as response:
        data = response.read()
    try:
        quality = magenta_ground_metrics(data)
    except Exception:
        rejected = (
            SOURCE_ROOT / "rejected" / "ui-sheet" / f"{name}-edit-seed{seed}.png"
        )
        atomic_write(rejected, data)
        raise
    atomic_write(output, data)
    recipe = {
        "format": "qlobe-local-edit-recipe",
        "formatVersion": 1,
        "pipelineVersion": PIPELINE_VERSION,
        "assetId": f"ui-sheet/{name}",
        "sourcePath": str(source.relative_to(GAME_ROOT)),
        "sourceSha256": source_sha,
        "source": "local-lan-api",
        "workflow": "qwen-image-edit",
        "seed": seed,
        "prompt": EDIT_PROMPT,
        "quality": quality,
        "outputSha256": sha256_bytes(data),
        "visualQa": "pending-human-review",
    }
    atomic_write(recipe_path, (json.dumps(recipe, indent=2) + "\n").encode())


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--only", help="normalize one UI badge id")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--api-url", help="override configured local API base URL")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    plan = json.loads(PLAN_PATH.read_text())
    job = next(job for job in plan["jobs"] if job["id"] == "ui-sheet")
    slices = prepare_slices(job)
    if args.only and args.only not in slices:
        raise SystemExit(f"unknown UI badge id: {args.only}")
    selected = [args.only] if args.only else list(job["layout"]["ids"])
    if args.dry_run:
        for name in selected:
            print(f"dry-run ui/{name} workflow=qwen-image-edit seed={args.seed}")
        return
    base_url = configured_base_url(args.api_url)
    if not base_url:
        raise SystemExit("Set QLOBE_QWEN_URL or configure tools/state/local.json")
    for name in selected:
        normalize(base_url, name, slices[name], args.seed, args.force)


if __name__ == "__main__":
    main()
