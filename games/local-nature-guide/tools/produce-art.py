#!/usr/bin/env python3
"""Local Nature Guide production-art pipeline.

Stages are intentionally split by model family to avoid LAN model thrash:

  scenes   qwen-image-edit variants from the approved GPT Image 2 hub master
  hub      krea2-turbo-t2i toy-table hub tile (seed 42)
  layers   qwen-image-layered on deterministic cutter crops, layer_2 only
  finals   alpha QA/crop via cutout_finalize.py, then compact WebP assets
  plates   deterministic WebP/JPEG preparation for opaque plates and hub tile

The LAN endpoint is read from --qwen-url, QLOBE_QWEN_URL, or the ignored
tools/state/local.json. It is never persisted in a recipe or report.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import io
import json
import os
import subprocess
import sys
import time
import urllib.request
from collections import deque
from pathlib import Path
from statistics import median

from PIL import Image, ImageChops, ImageFilter


GAME = Path(__file__).resolve().parents[1]
ROOT = GAME.parents[1]
SOURCE = GAME / "assets" / "source"
GPT = SOURCE / "gpt-image-2"
CROPS = SOURCE / "crops"
LOCAL = SOURCE / "local-api"
LAYERED = SOURCE / "layered"
MATTES = SOURCE / "mattes"
FINAL_PNG = SOURCE / "final-png"
QA = SOURCE / "qa"
STATE = ROOT / "tools" / "state" / "local.json"
FINALIZER = ROOT / "tools" / "pipeline" / "cutout_finalize.py"

SEED = 42
MIN_BYTES = 5_000

SCENE_EDITS = {
    "forest-clearing": (
        "Transform this exact watercolor storybook woodland into a closer forest "
        "discovery clearing. Preserve the same hand-painted gouache and watercolor "
        "medium, warm paper grain, palette, late-morning upper-left light, framing "
        "canopy, perspective and 4:3 composition. Create a calm open moss-and-leaf "
        "forest floor through the central 70 percent, with one low mossy log, three "
        "small stones and a fern cluster around the edges, leaving clear open spaces "
        "for large separate nature sprites. Leave the lower-left quarter as empty "
        "moss and the top safe band as uncluttered sky and foliage. No animals, birds, specimens, "
        "pinecones, prominent leaves, cards, title, text, tracks, buttons or UI."
    ),
    "bird-meadow": (
        "Transform this exact watercolor storybook woodland into a sunny woodland-edge "
        "bird-listening meadow. Preserve the same hand-painted gouache and watercolor "
        "medium, warm paper grain, palette, late-morning upper-left light, framing "
        "canopy, perspective and 4:3 composition. Add three broad bare natural tree-branch "
        "perches growing in from the outer edges across the calm middle distance at clearly separated heights, with a "
        "soft blue-sky opening and low meadow flowers around the outside. Leave the "
        "lower-left quarter as empty moss and the top safe band as uncluttered sky. "
        "No benches, furniture, birds, animals, nests, specimens, cards, title, text, buttons or UI."
    ),
    "muddy-trail": (
        "Transform this exact watercolor storybook woodland into a creekside track-"
        "finder clearing. Preserve the same hand-painted gouache and watercolor medium, "
        "warm paper grain, palette, late-morning upper-left light, framing canopy, "
        "perspective and 4:3 composition. Make the central 62 percent a broad calm patch "
        "of warm tan damp mud beside a gentle creek, edged by moss, ferns, pebbles and "
        "a few fallen leaves. The mud must be empty and unobstructed for a separate "
        "vertical track-path sprite. Leave the lower-left quarter as empty foliage and "
        "the top safe band as uncluttered sky. No footprints, animals, birds, title, "
        "text, arrows, cards, buttons or UI."
    ),
}

HUB_PROMPT = (
    "A shallow round wooden nature-explorer tray on a mossy log, holding one large "
    "pinecone, one smooth speckled river stone, one blue-and-white feather, a tiny "
    "green field journal with a gold leaf emblem, and a small brass magnifying glass. "
    "One recognizable nature-discovery moment staged only as objects, centered and "
    "fully visible, soft blue-sky woodland background, no hands. Bright, soft 3D "
    "cartoon style with rounded, simplified forms and cheerful proportions. Saturated "
    "colors, smooth shading, soft highlights, toy-like glossy finish. Premium preschool "
    "learning app asset, no text, no letters, no words, no title, no UI, no watermark."
)

GROUPS = {
    "suri": {
        "dest": GAME / "assets" / "characters",
        "max": 720,
        "subject": "complete watercolor squirrel guide pose including every tail hair and prop",
    },
    "specimens": {
        "dest": GAME / "assets" / "specimens",
        "max": 520,
        "subject": "complete watercolor nature specimen or wildlife subject including every fine edge",
    },
    "ui": {
        "dest": GAME / "assets" / "ui",
        "max": 720,
        "subject": "complete watercolor game UI carrier including its entire paper, cloth, or painted edge",
    },
    "tracks": {
        "dest": GAME / "assets" / "specimens",
        "max": 900,
        "subject": "complete connected watercolor mud trail ribbon including every footprint and decoration",
    },
    "title": {
        "dest": GAME / "assets" / "ui",
        "max": 1100,
        "subject": "complete exact Local Nature Guide painted title banner and both ornaments",
    },
}


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def endpoint(args: argparse.Namespace) -> str:
    local = {}
    if STATE.exists():
        try:
            local = json.loads(STATE.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            pass
    value = args.qwen_url or os.environ.get("QLOBE_QWEN_URL") or local.get("qwenUrl")
    if not value:
        raise RuntimeError("No LAN GenAI endpoint configured")
    return str(value).rstrip("/")


def post_multipart(url: str, fields: dict[str, object], files: dict[str, Path] | None = None) -> bytes:
    boundary = "----qlobe" + os.urandom(8).hex()
    body = bytearray()
    for name, value in fields.items():
        body += (
            f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n'
            f"{value}\r\n"
        ).encode()
    for name, path in (files or {}).items():
        body += (
            f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"; '
            f'filename="{path.name}"\r\nContent-Type: application/octet-stream\r\n\r\n'
        ).encode()
        body += path.read_bytes() + b"\r\n"
    body += f"--{boundary}--\r\n".encode()
    req = urllib.request.Request(
        url,
        data=bytes(body),
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    with urllib.request.urlopen(req, timeout=930) as response:
        return response.read()


def get(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=930) as response:
        return response.read()


def qwen_edit(base: str, prompt: str, source: Path, seed: int = SEED) -> bytes:
    return post_multipart(
        f"{base}/workflows/qwen-image-edit?sync=true",
        {"prompt": prompt, "seed": seed, "steps": 4},
        {"image": source},
    )


def krea(base: str, prompt: str, width: int, height: int, seed: int = SEED) -> bytes:
    return post_multipart(
        f"{base}/workflows/krea2-turbo-t2i?sync=true",
        {"prompt": prompt, "width": width, "height": height, "seed": seed, "steps": 8, "cfg": 1},
    )


def qwen_layered(base: str, source: Path, prompt: str, seed: int = SEED) -> bytes:
    job = json.loads(post_multipart(
        f"{base}/workflows/qwen-image-layered",
        {"prompt": prompt, "layers": 2, "seed": seed, "steps": 20, "cfg": 2.5},
        {"image": source},
    ))
    job_id = job.get("job_id")
    if not job_id:
        raise RuntimeError(f"Layered returned no job id for {source.name}: {job}")
    for _ in range(180):
        time.sleep(5)
        state = json.loads(get(f"{base}/jobs/{job_id}"))
        status = state.get("status")
        if status == "completed":
            return get(f"{base}/jobs/{job_id}/result?output=layer_2")
        if status in {"failed", "error"}:
            raise RuntimeError(f"Layered job {job_id} {status}: {state.get('error')}")
    raise TimeoutError(f"Layered job timed out for {source.name}")


def items() -> list[tuple[str, Path, Path, Path, Path, int, str]]:
    result = []
    for group, spec in GROUPS.items():
        crop_dir = CROPS / group
        for source in sorted(crop_dir.glob("*.png")):
            name = source.stem
            layer = LAYERED / group / f"{name}.png"
            final_png = FINAL_PNG / group / f"{name}.png"
            magenta = QA / group / f"{name}-magenta.png"
            result.append((group, source, layer, final_png, magenta, spec["max"], spec["subject"]))
    return result


def run_scenes(args: argparse.Namespace, base: str) -> None:
    source = GPT / "trail-hub.png"
    out_dir = LOCAL / "qwen-scenes"
    out_dir.mkdir(parents=True, exist_ok=True)
    for name, prompt in SCENE_EDITS.items():
        target = out_dir / f"{name}.png"
        if target.exists() and target.stat().st_size > MIN_BYTES and not args.force:
            print(f"scene {name}: reused")
            continue
        print(f"scene {name}: qwen-image-edit", flush=True)
        target.write_bytes(qwen_edit(base, prompt, source))
        if target.stat().st_size < MIN_BYTES:
            raise RuntimeError(f"scene {name} is unexpectedly small")


def run_hub(args: argparse.Namespace, base: str) -> None:
    target = LOCAL / "krea-hub-tile.png"
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists() and target.stat().st_size > MIN_BYTES and not args.force:
        print("hub: reused")
        return
    print("hub: krea2-turbo-t2i seed 42", flush=True)
    target.write_bytes(krea(base, HUB_PROMPT, 768, 640))
    if target.stat().st_size < MIN_BYTES:
        raise RuntimeError("hub tile is unexpectedly small")


def extract_one(base: str, entry, force: bool) -> tuple[str, str]:
    group, source, layer, _final, _magenta, _max_size, subject = entry
    key = f"{group}/{source.stem}"
    layer.parent.mkdir(parents=True, exist_ok=True)
    if layer.exists() and layer.stat().st_size > MIN_BYTES and not force:
        return key, "reused"
    prompt = (
        "Background layer: one plain dark charcoal background. Top layer: the "
        f"{subject} from the source on true transparency. Preserve the exact source "
        "pixels, colors, watercolor texture, proportions, pose, lighting, outline, "
        "interior openings and every extremity. Remove only the charcoal background. "
        "Do not redraw, simplify, crop, recolor, add a shadow, or add any new object."
    )
    layer.write_bytes(qwen_layered(base, source, prompt))
    if layer.stat().st_size < MIN_BYTES:
        raise RuntimeError(f"{key}: layered output is unexpectedly small")
    return key, "generated"


def run_layers(args: argparse.Namespace, base: str) -> None:
    work = items()
    print(f"layers: {len(work)} assets, workers={args.workers}", flush=True)
    failures = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, min(args.workers, 4))) as pool:
        futures = {pool.submit(extract_one, base, entry, args.force): entry for entry in work}
        for future in concurrent.futures.as_completed(futures):
            entry = futures[future]
            key = f"{entry[0]}/{entry[1].stem}"
            try:
                _, status = future.result()
                print(f"  {key}: {status}", flush=True)
            except Exception as exc:  # noqa: BLE001
                failures.append((key, str(exc)))
                print(f"  {key}: FAILED {exc}", flush=True)
    if failures:
        raise RuntimeError(f"Layered failures: {failures}")


def largest_component(mask: Image.Image) -> Image.Image:
    """Keep the main 8-connected subject and reject neighboring-sheet fragments."""
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


def chroma_fallback(source: Path, output: Path) -> None:
    """Exact-source component matte that removes sheet neighbors without redraw."""
    image = Image.open(source).convert("RGBA")
    rgb = image.convert("RGB")
    w, h = rgb.size
    pixels = rgb.load()
    band = max(1, min(w, h) // 32)
    samples = [
        pixels[x, y]
        for y in range(h)
        for x in range(w)
        if x < band or x >= w - band or y < band or y >= h - band
    ]
    bg = tuple(round(median(pixel[i] for pixel in samples)) for i in range(3))
    hard = bytearray(w * h)
    soft = bytearray(w * h)
    for y in range(h):
        for x in range(w):
            pixel = pixels[x, y]
            distance = max(abs(pixel[channel] - bg[channel]) for channel in range(3))
            residual = tuple(pixel[channel] - bg[channel] for channel in range(3))
            chroma = max(residual) - min(residual)
            offset = y * w + x
            if distance >= 10 or chroma >= 8:
                hard[offset] = 255
            edge = max(distance, chroma)
            soft[offset] = 0 if edge <= 6 else min(255, round((edge - 6) * 12))
    main = largest_component(Image.frombytes("L", (w, h), bytes(hard)))
    # Three pixels of source-local edge recovery retain soft watercolor hairs
    # while remaining far smaller than the gap to a neighboring sheet subject.
    support = main.filter(ImageFilter.MaxFilter(7))
    fringe = ImageChops.multiply(Image.frombytes("L", (w, h), bytes(soft)), support)
    fringe = fringe.filter(ImageFilter.GaussianBlur(0.45))
    alpha = ImageChops.lighter(fringe, main)
    image.putalpha(alpha)
    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output, "PNG", optimize=True)


def fill_enclosed_alpha(path: Path) -> None:
    """Fill matte pinholes inside visually solid subjects, preserving exterior gaps."""
    image = Image.open(path).convert("RGBA")
    alpha = image.getchannel("A")
    width, height = alpha.size
    data = bytearray(alpha.tobytes())
    exterior = bytearray(width * height)
    queue: deque[int] = deque()
    for y in range(height):
        for x in (0, width - 1):
            offset = y * width + x
            if data[offset] < 128 and not exterior[offset]:
                exterior[offset] = 1
                queue.append(offset)
    for x in range(width):
        for y in (0, height - 1):
            offset = y * width + x
            if data[offset] < 128 and not exterior[offset]:
                exterior[offset] = 1
                queue.append(offset)
    while queue:
        current = queue.popleft()
        x, y = current % width, current // width
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if not (0 <= nx < width and 0 <= ny < height):
                continue
            neighbor = ny * width + nx
            if data[neighbor] < 128 and not exterior[neighbor]:
                exterior[neighbor] = 1
                queue.append(neighbor)
    for offset, value in enumerate(data):
        if value < 128 and not exterior[offset]:
            data[offset] = 255
    image.putalpha(Image.frombytes("L", (width, height), bytes(data)))
    image.save(path, "PNG", optimize=True)


def run_finals(args: argparse.Namespace) -> None:
    receipts = {}
    for group, source, layer, final_png, magenta, max_size, _subject in items():
        key = f"{group}/{source.stem}"
        final_png.parent.mkdir(parents=True, exist_ok=True)
        magenta.parent.mkdir(parents=True, exist_ok=True)
        matte = MATTES / group / f"{source.stem}.png"
        # Qwen Layered candidates are retained for provenance and comparison.
        # The endpoint's layer ordering/alpha semantics vary by subject, so the
        # shipped cutouts use deterministic exact-source component mattes. The
        # title is the one reviewed exception: its intentional full-frame glow
        # defeats chroma matting, while its Qwen candidate has a clean alpha.
        chroma_fallback(source, matte)
        if group == "specimens" and source.stem in {"binoculars", "river-stone"}:
            fill_enclosed_alpha(matte)
        selected = layer if group == "title" else matte
        command = [
            sys.executable, str(FINALIZER), "--input", str(selected), "--output", str(final_png),
            "--magenta", str(magenta), "--max-size", str(max_size), "--pad", "12", "--alpha-floor", "3",
        ]
        result = subprocess.run(command, capture_output=True, text=True)
        try:
            receipt = json.loads(result.stdout)
        except json.JSONDecodeError:
            receipt = {"pass": False, "reason": result.stderr or result.stdout}
        if result.returncode or not receipt.get("pass"):
            raise RuntimeError(f"finalize failed for {key}: {receipt}")
        out_dir = GROUPS[group]["dest"]
        out_dir.mkdir(parents=True, exist_ok=True)
        webp = out_dir / f"{source.stem}.webp"
        image = Image.open(final_png).convert("RGBA")
        image.save(webp, "WEBP", quality=90, method=6)
        receipts[key] = {
            **receipt,
            "sourceSha256": sha(source),
            "layeredCandidateSha256": sha(layer),
            "matteSha256": sha(matte),
            "alphaMethod": "reviewed-qwen-layered-candidate" if group == "title" else "exact-source-largest-component-matte",
            "final": str(webp.relative_to(GAME)).replace("\\", "/"),
            "bytes": webp.stat().st_size,
        }
        print(f"final {key}: {webp.stat().st_size} bytes", flush=True)

    # Runtime uses the badge as UI reward art as well as a journal discovery.
    badge = GAME / "assets" / "specimens" / "badge.webp"
    if badge.exists():
        (GAME / "assets" / "ui" / "badge.webp").write_bytes(badge.read_bytes())
    write_json(QA / "cutout-report.json", receipts)


def fit_plate(source: Path, destination: Path, size=(1600, 1200), quality=88) -> None:
    image = Image.open(source).convert("RGB")
    sw, sh = image.size
    dw, dh = size
    scale = max(dw / sw, dh / sh)
    resized = image.resize((round(sw * scale), round(sh * scale)), Image.Resampling.LANCZOS)
    left = max(0, (resized.width - dw) // 2)
    top = max(0, (resized.height - dh) // 2)
    destination.parent.mkdir(parents=True, exist_ok=True)
    resized.crop((left, top, left + dw, top + dh)).save(destination, "WEBP", quality=quality, method=6)


def run_plates(_args: argparse.Namespace) -> None:
    backgrounds = GAME / "assets" / "backgrounds"
    fit_plate(GPT / "trail-hub.png", backgrounds / "trail-hub.webp")
    for name in SCENE_EDITS:
        fit_plate(LOCAL / "qwen-scenes" / f"{name}.png", backgrounds / f"{name}.webp")
    fit_plate(GPT / "journal-spread.png", backgrounds / "journal-glow.webp")

    # The journal spread is also referenced by the runtime's planned UI path.
    journal_ui = GAME / "assets" / "ui" / "journal-open.webp"
    journal_ui.parent.mkdir(parents=True, exist_ok=True)
    Image.open(backgrounds / "journal-glow.webp").save(journal_ui, "WEBP", quality=88, method=6)

    hub_source = LOCAL / "krea-hub-tile.png"
    hub_target = ROOT / "assets" / "hub" / "tiles" / "local-nature-guide.jpg"
    image = Image.open(hub_source).convert("RGB")
    image = image.resize((640, 533), Image.Resampling.LANCZOS)
    image.save(hub_target, "JPEG", quality=90, optimize=True, progressive=True)


def write_recipe() -> None:
    payload = {
        "format": "qlobe-recipe",
        "formatVersion": 1,
        "asset": "local-nature-guide-production-family",
        "steps": [
            {"workflow": "gpt-image-2", "role": "style masters, title, journal, contact sheets", "seed": None},
            {"tool": "tools/cut-asset-sheet.py", "expectedCounts": {"suri": 6, "specimens": 15, "ui": 9, "tracks": 3, "title": 1}},
            {"workflow": "qwen-image-edit", "role": "style-preserving background variants", "seed": 42},
            {"workflow": "qwen-image-layered", "role": "two-layer alpha candidates retained for audit; inconsistent layer semantics prevented direct shipping", "seed": 42},
            {"tool": "games/local-nature-guide/tools/produce-art.py", "role": "exact-source largest-component mattes remove sheet neighbors without redraw"},
            {"tool": "tools/pipeline/cutout_finalize.py", "role": "alpha QA, crop, pad, resize, and magenta composites"},
            {"workflow": "krea2-turbo-t2i", "role": "hub tile in menu toy-table grammar", "seed": 42},
        ],
        "qa": {
            "status": "accepted-after-runtime-and-magenta-review",
            "cutoutReport": "qa/cutout-report.json",
            "viewports": ["1180x820", "820x1180", "1180x520"],
        },
    }
    write_json(SOURCE / "recipe.json", payload)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--stage", choices=["scenes", "hub", "layers", "finals", "plates", "all"], default="all")
    parser.add_argument("--qwen-url")
    parser.add_argument("--workers", type=int, default=3)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    write_recipe()
    stages = ["scenes", "hub", "layers", "finals", "plates"] if args.stage == "all" else [args.stage]
    base = endpoint(args) if any(stage in {"scenes", "hub", "layers"} for stage in stages) else ""
    for stage in stages:
        print(f"== {stage} ==", flush=True)
        if stage == "scenes":
            run_scenes(args, base)
        elif stage == "hub":
            run_hub(args, base)
        elif stage == "layers":
            run_layers(args, base)
        elif stage == "finals":
            run_finals(args)
        elif stage == "plates":
            run_plates(args)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
