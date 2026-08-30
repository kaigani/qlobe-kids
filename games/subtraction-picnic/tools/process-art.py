#!/usr/bin/env python3
"""Reproduce Subtraction Picnic's Qwen layered cutouts and shipping WebP art.

The GPT Image 2 masters are first separated with tools/cut-asset-sheet.py.
This script performs the approved Studio tail for every cut:

    qwen-image-layered layer_2 -> cutout_finalize.py -> shipping WebP

The LAN endpoint is read from tools/state/local.json and is never printed.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import subprocess
import time
import urllib.error
import urllib.request
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from PIL import Image, ImageChops, ImageFilter


HERE = Path(__file__).resolve().parent
GAME = HERE.parent
ROOT = GAME.parents[1]
ASSETS = GAME / "assets"
SOURCE = ASSETS / "source"
CROPS = SOURCE / "crops"
LAYERED = SOURCE / "layered"
QA = SOURCE / "qa"
FINALIZER = ROOT / "tools" / "pipeline" / "cutout_finalize.py"
LOCAL_CONFIG = ROOT / "tools" / "state" / "local.json"


ASSET_SPECS = [
    ("characters", "squirrel", CROPS / "characters/squirrel.png", ASSETS / "characters/squirrel.webp"),
    ("characters", "fox", CROPS / "characters/fox.png", ASSETS / "characters/fox.webp"),
    ("characters", "bear", CROPS / "characters/bear.png", ASSETS / "characters/bear.webp"),
    ("foods", "apple", CROPS / "foods/apple.png", ASSETS / "foods/apple.webp"),
    ("foods", "strawberry", CROPS / "foods/strawberry.png", ASSETS / "foods/strawberry.webp"),
    ("foods", "cracker", CROPS / "foods/cracker.png", ASSETS / "foods/cracker.webp"),
    ("foods", "grapes", CROPS / "foods/grapes.png", ASSETS / "foods/grapes.webp"),
    ("foods", "sandwich", CROPS / "foods/sandwich.png", ASSETS / "foods/sandwich.webp"),
    ("props", "book-card", CROPS / "props/book-card.png", ASSETS / "ui/book-card.webp"),
    ("props", "blanket", CROPS / "props/blanket.png", ASSETS / "props/blanket.webp"),
    ("props", "basket", CROPS / "props/basket.png", ASSETS / "props/basket.webp"),
    ("ui", "banner", CROPS / "ui/banner.png", ASSETS / "ui/banner.webp"),
    ("ui", "equation-card", CROPS / "ui/equation-card.png", ASSETS / "ui/equation-card.webp"),
    ("ui", "answer-yellow", CROPS / "ui/answer-yellow.png", ASSETS / "ui/answer-yellow.webp"),
    ("ui", "answer-green", CROPS / "ui/answer-green.png", ASSETS / "ui/answer-green.webp"),
    ("ui", "answer-blue", CROPS / "ui/answer-blue.png", ASSETS / "ui/answer-blue.webp"),
    ("hud", "home", CROPS / "hud/home.png", ASSETS / "ui/hud-home.webp"),
    ("hud", "back", CROPS / "hud/back.png", ASSETS / "ui/hud-back.webp"),
    ("hud", "sound", CROPS / "hud/sound.png", ASSETS / "ui/hud-sound.webp"),
    ("hud", "next", CROPS / "hud/next.png", ASSETS / "ui/hud-next.webp"),
    ("hud", "refill", CROPS / "hud/refill.png", ASSETS / "ui/hud-refill.webp"),
    ("hud", "pip", CROPS / "hud/pip.png", ASSETS / "ui/pip.webp"),
    ("title", "title", SOURCE / "gpt-image-2/title-lockup-master.png", ASSETS / "title.webp"),
]


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def post_multipart(url: str, fields: dict[str, str], image: Path) -> bytes:
    boundary = f"----qlobe-{uuid.uuid4().hex}"
    body = io.BytesIO()
    for key, value in fields.items():
        body.write(f"--{boundary}\r\n".encode())
        body.write(f'Content-Disposition: form-data; name="{key}"\r\n\r\n'.encode())
        body.write(str(value).encode())
        body.write(b"\r\n")
    body.write(f"--{boundary}\r\n".encode())
    body.write(
        f'Content-Disposition: form-data; name="image"; filename="{image.name}"\r\n'.encode()
    )
    body.write(b"Content-Type: image/png\r\n\r\n")
    body.write(image.read_bytes())
    body.write(b"\r\n")
    body.write(f"--{boundary}--\r\n".encode())
    request = urllib.request.Request(
        url,
        data=body.getvalue(),
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    with urllib.request.urlopen(request, timeout=180) as response:
        return response.read()


def extract_layer(base: str, source: Path, prompt: str, seed: int) -> bytes:
    payload = post_multipart(
        f"{base}/workflows/qwen-image-layered",
        {"prompt": prompt, "layers": "2", "seed": str(seed)},
        source,
    )
    remote_id = json.loads(payload).get("job_id")
    if not remote_id:
        raise RuntimeError("Qwen layered workflow returned no job id")
    deadline = time.monotonic() + 1800
    while time.monotonic() < deadline:
        time.sleep(3)
        with urllib.request.urlopen(f"{base}/jobs/{remote_id}", timeout=60) as response:
            status = json.loads(response.read())
        if status.get("status") == "completed":
            with urllib.request.urlopen(
                f"{base}/jobs/{remote_id}/result?output=layer_2", timeout=300
            ) as response:
                pixels = response.read()
            if not pixels.startswith(b"\x89PNG"):
                raise RuntimeError("Qwen layer_2 result was not PNG data")
            return pixels
        if status.get("status") == "failed":
            raise RuntimeError(str(status.get("error") or "Qwen layered extraction failed"))
    raise TimeoutError("Qwen layered extraction exceeded 30 minutes")


def prompt_for(name: str) -> str:
    subject = {
        "book-card": "open blank storybook with three empty cream page panels",
        "equation-card": "blank stitched cream equation parchment",
        "answer-yellow": "blank yellow watercolor answer tile",
        "answer-green": "blank green watercolor answer tile",
        "answer-blue": "blank blue watercolor answer tile",
        "home": "ivory watercolor medallion with a coral cottage symbol",
        "back": "ivory watercolor medallion with a moss-green left arrow",
        "sound": "ivory watercolor medallion with a blue speaker and two sound waves",
        "next": "ivory watercolor medallion with a golden right arrow",
        "refill": "ivory watercolor medallion with two teal circular arrows",
        "pip": "simple golden-green oval watercolor counting leaf token",
        "title": "two-line SUBTRACTION PICNIC watercolor title lockup, with exact spelling and leaf ornaments",
    }.get(name, f"hand-painted watercolor {name}")
    return (
        "Background layer: the complete plain background only. "
        f"Top layer: the exact same {subject} from the input image, isolated on a truly transparent background. "
        "Preserve its silhouette, watercolor texture, proportions, colors, lettering if present, and every painted detail. "
        "Do not redesign, restyle, crop, add, remove, or duplicate anything."
    )


def encode_webp(source: Path, destination: Path, max_size: int, quality: int = 88) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(source) as image:
        image.load()
        if max(image.size) > max_size:
            image.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
        image.save(destination, "WEBP", quality=quality, method=6)


def border_connected_matte(source: Path, destination: Path) -> None:
    """Remove only plain background connected to the crop border.

    This is the Studio-approved deterministic fallback when Layered returns an
    opaque plate or a near-blank alpha plane. It never redraws source pixels.
    """
    with Image.open(source) as opened:
        image = opened.convert("RGB")
    width, height = image.size
    pixels = image.load()
    border = []
    for x in range(width):
        border.extend((pixels[x, 0], pixels[x, height - 1]))
    for y in range(height):
        border.extend((pixels[0, y], pixels[width - 1, y]))
    background = tuple(sorted(pixel[channel] for pixel in border)[len(border) // 2] for channel in range(3))

    seen = bytearray(width * height)
    connected = bytearray(width * height)
    stack: list[int] = []

    def push(x: int, y: int) -> None:
        index = y * width + x
        if seen[index]:
            return
        seen[index] = 1
        pixel = pixels[x, y]
        if max(abs(pixel[channel] - background[channel]) for channel in range(3)) <= 32:
            stack.append(index)

    for x in range(width):
        push(x, 0)
        push(x, height - 1)
    for y in range(height):
        push(0, y)
        push(width - 1, y)
    while stack:
        index = stack.pop()
        connected[index] = 1
        x, y = index % width, index // width
        if x:
            push(x - 1, y)
        if x < width - 1:
            push(x + 1, y)
        if y:
            push(x, y - 1)
        if y < height - 1:
            push(x, y + 1)

    alpha = Image.frombytes("L", (width, height), bytes(0 if value else 255 for value in connected))
    alpha = alpha.filter(ImageFilter.GaussianBlur(1.15))
    alpha = alpha.point(lambda value: 0 if value < 20 else min(255, int(value * 1.18)))
    result = image.convert("RGBA")
    result.putalpha(alpha)
    destination.parent.mkdir(parents=True, exist_ok=True)
    result.save(destination, "PNG", optimize=True)


def keep_largest_component(path: Path, pad: int = 4) -> None:
    """Drop a second sheet object that intruded into a rectangular crop."""
    with Image.open(path) as opened:
        image = opened.convert("RGBA")
    alpha = image.getchannel("A")
    width, height = image.size
    pixels = alpha.load()
    seen = bytearray(width * height)
    components: list[list[int]] = []
    for y in range(height):
        for x in range(width):
            start = y * width + x
            if seen[start] or pixels[x, y] < 250:
                continue
            seen[start] = 1
            stack = [start]
            members: list[int] = []
            while stack:
                index = stack.pop()
                px, py = index % width, index // width
                members.append(index)
                for nx, ny in ((px - 1, py), (px + 1, py), (px, py - 1), (px, py + 1)):
                    if nx < 0 or nx >= width or ny < 0 or ny >= height:
                        continue
                    neighbor = ny * width + nx
                    if seen[neighbor]:
                        continue
                    seen[neighbor] = 1
                    if pixels[nx, ny] >= 250:
                        stack.append(neighbor)
            components.append(members)
    if not components:
        return
    keep = max(components, key=len)
    support_bytes = bytearray(width * height)
    for index in keep:
        support_bytes[index] = 255
    filter_size = max(3, pad * 2 + 1)
    if filter_size % 2 == 0:
        filter_size += 1
    support = Image.frombytes("L", (width, height), bytes(support_bytes))
    support = support.filter(ImageFilter.MaxFilter(filter_size)).filter(ImageFilter.GaussianBlur(1.0))
    image.putalpha(ImageChops.multiply(alpha, support))
    image.save(path, "PNG", optimize=True)


def run_finalizer(layer_path: Path, final_png: Path, magenta: Path, name: str) -> dict:
    run = subprocess.run(
        [
            "python3",
            str(FINALIZER),
            "--input",
            str(layer_path),
            "--output",
            str(final_png),
            "--magenta",
            str(magenta),
            "--max-size",
            "900" if name in {"banner", "equation-card", "book-card", "title"} else "640",
            "--pad",
            "16",
        ],
        capture_output=True,
        text=True,
        timeout=300,
    )
    output_lines = run.stdout.strip().splitlines()
    qa = json.loads(output_lines[-1]) if output_lines else {}
    qa["returnCode"] = run.returncode
    return qa


def finalize_one(
    base: str,
    index: int,
    spec: tuple[str, str, Path, Path],
    force: bool,
    offline_fallback: bool,
) -> dict:
    category, name, source, destination = spec
    if not source.exists():
        raise FileNotFoundError(source)
    if destination.exists() and not force:
        return {"name": name, "status": "skipped", "destination": str(destination.relative_to(GAME))}

    folder = LAYERED / category
    folder.mkdir(parents=True, exist_ok=True)
    QA.mkdir(parents=True, exist_ok=True)
    layer_path = folder / f"{name}.layer2.png"
    final_png = folder / f"{name}.final.png"
    magenta = QA / f"{category}-{name}-magenta.png"
    prompt = prompt_for(name)
    failures: list[str] = []

    # Reuse an already-downloaded Layered result before making any new call.
    if layer_path.exists():
        qa = run_finalizer(layer_path, final_png, magenta, name)
        if qa.get("pass") and final_png.exists():
            encode_webp(
                final_png,
                destination,
                900 if name in {"banner", "equation-card", "book-card", "title"} else 640,
            )
            return {
                "name": name,
                "category": category,
                "status": "ok",
                "workflow": "qwen-image-layered",
                "output": "layer_2",
                "prompt": prompt,
                "source": str(source.relative_to(GAME)),
                "sourceSha256": sha256(source),
                "layer2": str(layer_path.relative_to(GAME)),
                "destination": str(destination.relative_to(GAME)),
                "destinationSha256": sha256(destination),
                "qa": qa,
            }
        failures.append(str(qa.get("reason") or "existing Layered output failed QA"))
        rejected = folder / f"{name}.qwen-rejected.png"
        rejected.write_bytes(layer_path.read_bytes())

    if not offline_fallback:
        seed = 4200 + index
        try:
            layer_path.write_bytes(extract_layer(base, source, prompt, seed))
            qa = run_finalizer(layer_path, final_png, magenta, name)
            if qa.get("pass") and final_png.exists():
                encode_webp(
                    final_png,
                    destination,
                    900 if name in {"banner", "equation-card", "book-card", "title"} else 640,
                )
                return {
                    "name": name,
                    "category": category,
                    "status": "ok",
                    "workflow": "qwen-image-layered",
                    "output": "layer_2",
                    "seed": seed,
                    "prompt": prompt,
                    "source": str(source.relative_to(GAME)),
                    "sourceSha256": sha256(source),
                    "layer2": str(layer_path.relative_to(GAME)),
                    "destination": str(destination.relative_to(GAME)),
                    "destinationSha256": sha256(destination),
                    "qa": qa,
                }
            failures.append(str(qa.get("reason") or "Layered finalize failed"))
            rejected = folder / f"{name}.qwen-rejected.png"
            rejected.write_bytes(layer_path.read_bytes())
        except (OSError, ValueError, RuntimeError, TimeoutError, urllib.error.URLError) as exc:
            failures.append(str(exc))

    # A failed generative extraction must never be massaged into passing. Use
    # the deterministic, non-redrawing border-connected fallback instead.
    fallback_layer = folder / f"{name}.cpu-layer2.png"
    border_connected_matte(source, fallback_layer)
    if name == "blanket":
        keep_largest_component(fallback_layer)
    qa = run_finalizer(fallback_layer, final_png, magenta, name)
    if not qa.get("pass") or not final_png.exists():
        raise RuntimeError(f"{name}: deterministic matte failed QA: {qa.get('reason')}")
    encode_webp(
        final_png,
        destination,
        900 if name in {"banner", "equation-card", "book-card", "title"} else 640,
    )
    return {
        "name": name,
        "category": category,
        "status": "ok-fallback",
        "workflow": "deterministic-border-connected-matte",
        "qwenAttempts": failures,
        "source": str(source.relative_to(GAME)),
        "sourceSha256": sha256(source),
        "layer2": str(fallback_layer.relative_to(GAME)),
        "destination": str(destination.relative_to(GAME)),
        "destinationSha256": sha256(destination),
        "qa": qa,
    }


def build_backdrop() -> dict:
    source = SOURCE / "gpt-image-2/meadow-backdrop-master.png"
    destination = ASSETS / "backdrop.webp"
    destination.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(source) as image:
        image.load()
        image.thumbnail((1600, 1200), Image.Resampling.LANCZOS)
        image.save(destination, "WEBP", quality=86, method=6)
    return {
        "name": "backdrop",
        "status": "ok",
        "workflow": "gpt-image-2",
        "source": str(source.relative_to(GAME)),
        "sourceSha256": sha256(source),
        "destination": str(destination.relative_to(GAME)),
        "destinationSha256": sha256(destination),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--workers", type=int, default=2)
    parser.add_argument(
        "--offline-fallback",
        action="store_true",
        help="reuse existing Layered results, then use the deterministic matte without new LAN calls",
    )
    args = parser.parse_args()

    config = json.loads(LOCAL_CONFIG.read_text())
    base = str(config.get("qwenUrl") or "").rstrip("/")
    if not base:
        raise SystemExit("tools/state/local.json has no qwenUrl")

    results: list[dict] = []
    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
        futures = {
            pool.submit(finalize_one, base, index, spec, args.force, args.offline_fallback): spec[1]
            for index, spec in enumerate(ASSET_SPECS, start=1)
        }
        for future in as_completed(futures):
            name = futures[future]
            result = future.result()
            results.append(result)
            print(f"{name}: {result['status']}", flush=True)

    results.append(build_backdrop())
    results.sort(key=lambda item: item["name"])
    manifest = {
        "schema": "qlobe-subtraction-picnic-art-v1",
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "assets": results,
    }
    (SOURCE / "art-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"wrote {len(results)} assets and assets/source/art-manifest.json")


if __name__ == "__main__":
    main()
