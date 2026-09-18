#!/usr/bin/env python3
"""Reproducible art production for Family Story Interview.

Stages:
  finalize-master  GPT Image 2 workspace master -> compact runtime WebP
  extract          cutter crops -> Qwen Image Layered layer_2 -> alpha QA/finals
  hub              Krea 2 toy-table source -> curated 640x533 hub JPEG

The model host is injected through QLOBE_QWEN_URL. No LAN address is stored in
the repository. The GPT Image 2 masters and their prompts live under
assets/source/gpt-image-2; this script never overwrites those sources.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from collections import deque
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageFilter, ImageOps


GAME = Path(__file__).resolve().parents[1]
REPO = GAME.parents[1]
SOURCE = GAME / "assets" / "source"
ART = GAME / "assets" / "art"
LAYERED = SOURCE / "layered"
QA = SOURCE / "qa" / "alpha"
FINALIZER = REPO / "tools" / "pipeline" / "cutout_finalize.py"
HUB_TILE = REPO / "assets" / "hub" / "tiles" / "family-story-interview.jpg"
SEEDS = (42, 1337, 9001)


@dataclass(frozen=True)
class Asset:
    key: str
    crop: str
    output: str
    subject: str
    max_size: int


ASSETS = (
    Asset("microphone", "reporter-props/microphone.png", "props/microphone.png",
          "hand-painted watercolor reporter microphone with a warm wood handle", 520),
    Asset("camera-notebook", "reporter-props/camera-notebook.png", "props/camera-notebook.png",
          "hand-painted watercolor instant camera joined with a reporter notebook", 520),
    Asset("question-card", "reporter-props/question-card.png", "props/question-card.png",
          "blank torn cream watercolor question card with blue paper tape", 560),
    Asset("record-plate", "reporter-props/record-plate.png", "controls/record-plate.png",
          "blank wide coral stitched-fabric watercolor button plate", 560),
    Asset("play-plate", "reporter-props/play-plate.png", "controls/play-plate.png",
          "blank wide leaf-green stitched-fabric watercolor button plate", 560),
    Asset("photo-plate", "reporter-props/photo-plate.png", "controls/photo-plate.png",
          "blank wide faded-denim-blue stitched-fabric watercolor button plate", 560),
    Asset("memory-book", "reporter-props/memory-book.png", "props/memory-book.png",
          "closed teal-and-cream watercolor family memory album with a heart", 560),
    Asset("heart-sticker", "reporter-props/heart-sticker.png", "stickers/heart.png",
          "coral watercolor paper heart sticker", 360),
    Asset("star-sticker", "reporter-props/star-sticker.png", "stickers/star.png",
          "honey-yellow watercolor paper star sticker", 360),
    Asset("flower-sticker", "reporter-props/flower-sticker.png", "stickers/flower.png",
          "pressed yellow watercolor flower sticker with green leaves", 360),
    Asset("toy-train", "reporter-props/toy-train.png", "props/toy-train.png",
          "blue-and-red hand-painted watercolor wooden toy train", 480),
    Asset("teddy-bear", "reporter-props/teddy-bear.png", "props/teddy-bear.png",
          "honey-brown watercolor teddy bear with a teal bow", 460),
    Asset("when-little-card", "topic-cards/when-little-card.png", "cards/when-little.png",
          "complete torn-paper watercolor childhood question card with child, moon, stars, and teddy", 680),
    Asset("favorite-toy-card", "topic-cards/favorite-toy-card.png", "cards/favorite-things.png",
          "complete torn-paper watercolor favorite-things card with teddy, train, ball, and blocks", 680),
    Asset("family-tradition-card", "topic-cards/family-tradition-card.png", "cards/family-traditions.png",
          "complete torn-paper watercolor family-tradition card with a multigenerational family baking", 680),
    Asset("reporter-guide", "topic-cards/reporter-guide.png", "characters/reporter-guide.png",
          "full-body watercolor child reporter in green cardigan holding a microphone", 760),
    Asset("grownup-listener", "grownup-listener/grownup-listener.png", "characters/grownup-listener.png",
          "inclusive watercolor grown-up listening portrait in a torn-paper medallion", 620),
    Asset("title-lockup", "title/title-lockup.png", "title/family-story-interview.png",
          "complete torn-paper title banner reading Family Story Interview with flowers, tape, and stitches", 1280),
)


HUB_PROMPT = (
    "A premium preschool learning app hub tile painted as a tactile watercolor "
    "storybook still life: one friendly child reporter microphone leaning beside "
    "a small teal clothbound family memory album with a coral paper heart, a "
    "cream instant camera, and three tiny hand-cut paper sticker shapes on a warm "
    "wood tabletop. Soft wet-on-wet pigment blooms, colored-pencil outlines, "
    "visible rag-paper fibers, stitched fabric and torn paper edges, warm cream, "
    "leaf green, faded teal, coral and honey palette, gentle contact shadows, "
    "centered recognizable grouping with clean breathing room. Whimsical and "
    "emotionally warm for ages three to eight, handcrafted rather than 3D. No "
    "people, no hands, no title, no letters, no words, no numbers, no UI, no "
    "watermark. 6:5 composition."
)


def api(path: str) -> str:
    base = os.environ.get("QLOBE_QWEN_URL", "").rstrip("/")
    if not base:
        raise SystemExit("QLOBE_QWEN_URL is not set")
    return f"{base}{path}"


def post_multipart(url: str, fields: dict[str, str], files: dict[str, Path] | None = None) -> bytes:
    boundary = "----qlobe" + os.urandom(8).hex()
    body = bytearray()
    for name, value in fields.items():
        body += (
            f"--{boundary}\r\nContent-Disposition: form-data; "
            f"name=\"{name}\"\r\n\r\n{value}\r\n"
        ).encode()
    for name, path in (files or {}).items():
        body += (
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"; "
            f"filename=\"{path.name}\"\r\nContent-Type: image/png\r\n\r\n"
        ).encode()
        body += path.read_bytes() + b"\r\n"
    body += f"--{boundary}--\r\n".encode()
    request = urllib.request.Request(
        url,
        data=bytes(body),
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    with urllib.request.urlopen(request, timeout=900) as response:
        return response.read()


def get_bytes(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=900) as response:
        return response.read()


def get_json(url: str) -> dict:
    return json.loads(get_bytes(url))


def layered_extract(source: Path, destination: Path, subject: str, seed: int) -> bool:
    prompt = (
        "Solid flat green background layer. "
        f"Top layer: the exact same {subject} from the input image. "
        "Keep the subject's watercolor texture, colors, proportions, edges, "
        "paper fibers, facial features, and every detail identical. Do not "
        "redesign, add, remove, crop, or write anything."
    )
    payload = json.loads(post_multipart(
        api("/workflows/qwen-image-layered"),
        {"prompt": prompt, "layers": "2", "seed": str(seed)},
        {"image": source},
    ))
    job_id = payload.get("job_id")
    if not job_id:
        print(f"  no job id: {payload}", flush=True)
        return False
    for _ in range(240):
        time.sleep(3)
        state = get_json(api(f"/jobs/{job_id}"))
        status = state.get("status")
        if status == "completed":
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(get_bytes(api(f"/jobs/{job_id}/result?output=layer_2")))
            return destination.stat().st_size > 2000
        if status in {"failed", "error", "cancelled"}:
            print(f"  layered job {status}: {state.get('error')}", flush=True)
            return False
    print("  layered job timed out", flush=True)
    return False


def finalize_cutout(layered: Path, output: Path, magenta: Path, max_size: int) -> dict:
    output.parent.mkdir(parents=True, exist_ok=True)
    magenta.parent.mkdir(parents=True, exist_ok=True)
    command = [
        sys.executable, str(FINALIZER),
        "--input", str(layered),
        "--output", str(output),
        "--magenta", str(magenta),
        "--max-size", str(max_size),
        "--pad", "12",
        "--alpha-floor", "4",
    ]
    result = subprocess.run(command, capture_output=True, text=True)
    try:
        report = json.loads(result.stdout.strip().splitlines()[-1])
    except (json.JSONDecodeError, IndexError):
        report = {"pass": False, "reason": result.stderr.strip() or result.stdout.strip()}
    return report


def extract_assets(only: set[str], force: bool) -> None:
    ledger_path = LAYERED / "qa.json"
    ledger = json.loads(ledger_path.read_text("utf-8")) if ledger_path.exists() else {}
    selected = [asset for asset in ASSETS if not only or asset.key in only]
    unknown = sorted(only - {asset.key for asset in ASSETS})
    if unknown:
        raise SystemExit(f"unknown asset key(s): {', '.join(unknown)}")
    for index, asset in enumerate(selected, 1):
        crop = SOURCE / "crops" / asset.crop
        output = ART / asset.output
        if output.exists() and not force:
            print(f"[{index}/{len(selected)}] skip {asset.key}", flush=True)
            continue
        print(f"[{index}/{len(selected)}] extract {asset.key}", flush=True)
        accepted = None
        for seed in SEEDS:
            layered = LAYERED / f"{asset.key}-seed{seed}.png"
            if force or not layered.exists():
                try:
                    if not layered_extract(crop, layered, asset.subject, seed):
                        continue
                except (urllib.error.URLError, TimeoutError) as exc:
                    print(f"  request failed at seed {seed}: {exc}", flush=True)
                    continue
            report = finalize_cutout(
                layered,
                output,
                QA / f"{asset.key}-magenta.png",
                asset.max_size,
            )
            report.update({
                "workflow": "qwen-image-layered",
                "source": str(crop.relative_to(GAME)).replace("\\", "/"),
                "layered": str(layered.relative_to(GAME)).replace("\\", "/"),
                "output": str(output.relative_to(GAME)).replace("\\", "/"),
                "seed": seed,
                "prompt": (
                    "Preserve the exact source subject and watercolor details; "
                    "separate it from the flat charcoal ground as layer_2."
                ),
            })
            ledger[asset.key] = report
            ledger_path.parent.mkdir(parents=True, exist_ok=True)
            ledger_path.write_text(json.dumps(dict(sorted(ledger.items())), indent=2) + "\n", "utf-8")
            if report.get("pass"):
                accepted = seed
                print(f"  accepted seed {seed}: {report.get('alpha')}", flush=True)
                break
            print(f"  rejected seed {seed}: {report.get('reason')}", flush=True)
        if accepted is None:
            print(f"  FAILED {asset.key}; inspect retained candidates", flush=True)


def fill_mask_holes(mask: Image.Image) -> Image.Image:
    """Fill only dark regions enclosed by the cutter silhouette.

    The generated charcoal-ground sheets deliberately use a pale paper edge on
    every object. The cutter finds that outer edge reliably, but legitimately
    dark painted details (microphone grille, camera lens, hair) can resemble the
    ground and appear as holes in its threshold mask. Flooding inverse-mask
    pixels from the crop border distinguishes real exterior ground from those
    enclosed details without touching the source RGB pixels.
    """
    binary = mask.convert("L").point(lambda value: 255 if value >= 128 else 0)
    width, height = binary.size
    pixels = binary.load()
    outside = bytearray(width * height)
    queue: deque[tuple[int, int]] = deque()

    def seed(x: int, y: int) -> None:
        index = y * width + x
        if not outside[index] and pixels[x, y] == 0:
            outside[index] = 1
            queue.append((x, y))

    for x in range(width):
        seed(x, 0)
        seed(x, height - 1)
    for y in range(height):
        seed(0, y)
        seed(width - 1, y)
    while queue:
        x, y = queue.popleft()
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < width and 0 <= ny < height:
                index = ny * width + nx
                if not outside[index] and pixels[nx, ny] == 0:
                    outside[index] = 1
                    queue.append((nx, ny))

    alpha = Image.new("L", (width, height), 255)
    alpha_pixels = alpha.load()
    for y in range(height):
        row = y * width
        for x in range(width):
            if outside[row + x]:
                alpha_pixels[x, y] = 0
    return alpha.filter(ImageFilter.GaussianBlur(0.65))


def matte_assets(only: set[str], force: bool) -> None:
    selected = [asset for asset in ASSETS if not only or asset.key in only]
    unknown = sorted(only - {asset.key for asset in ASSETS})
    if unknown:
        raise SystemExit(f"unknown asset key(s): {', '.join(unknown)}")
    ledger_path = SOURCE / "matted" / "qa.json"
    ledger = json.loads(ledger_path.read_text("utf-8")) if ledger_path.exists() else {}
    group_cache: dict[str, tuple[dict, Image.Image]] = {}
    for index, asset in enumerate(selected, 1):
        output = ART / asset.output
        if output.exists() and not force:
            print(f"[{index}/{len(selected)}] skip {asset.key}", flush=True)
            continue
        group = asset.crop.split("/", 1)[0]
        if group not in group_cache:
            manifest = json.loads((SOURCE / "crops" / group / "boxes.json").read_text("utf-8"))
            mask_name = {
                "reporter-props": "reporter-props-mask.png",
                "topic-cards": "topic-cards-mask.png",
                "grownup-listener": "grownup-listener-mask.png",
                "title": "title-mask.png",
            }[group]
            group_cache[group] = (manifest, Image.open(SOURCE / "qa" / mask_name).convert("L"))
        manifest, sheet_mask = group_cache[group]
        record = next(item for item in manifest["assets"] if item["name"] == asset.key)
        left, top, right, bottom = record["cropBbox"]
        crop = Image.open(SOURCE / "crops" / asset.crop).convert("RGBA")
        alpha = fill_mask_holes(sheet_mask.crop((left, top, right, bottom)))
        if alpha.size != crop.size:
            raise RuntimeError(f"mask/crop mismatch for {asset.key}: {alpha.size} != {crop.size}")
        crop.putalpha(alpha)
        matted = SOURCE / "matted" / f"{asset.key}.png"
        matted.parent.mkdir(parents=True, exist_ok=True)
        crop.save(matted, "PNG", optimize=True)
        report = finalize_cutout(matted, output, QA / f"{asset.key}-magenta.png", asset.max_size)
        report.update({
            "workflow": "deterministic-cutter-mask-matte",
            "source": str((SOURCE / "crops" / asset.crop).relative_to(GAME)).replace("\\", "/"),
            "mask": str((SOURCE / "qa" / {
                "reporter-props": "reporter-props-mask.png",
                "topic-cards": "topic-cards-mask.png",
                "grownup-listener": "grownup-listener-mask.png",
                "title": "title-mask.png",
            }[group]).relative_to(GAME)).replace("\\", "/"),
            "matted": str(matted.relative_to(GAME)).replace("\\", "/"),
            "output": str(output.relative_to(GAME)).replace("\\", "/"),
            "notes": "Exact GPT Image 2 crop pixels; cutter silhouette; enclosed dark-detail hole fill; 0.65px alpha feather.",
        })
        ledger[asset.key] = report
        ledger_path.parent.mkdir(parents=True, exist_ok=True)
        ledger_path.write_text(json.dumps(dict(sorted(ledger.items())), indent=2) + "\n", "utf-8")
        status = "accepted" if report.get("pass") else "FAILED"
        print(f"[{index}/{len(selected)}] {status} {asset.key}: {report.get('alpha') or report.get('reason')}", flush=True)


def finalize_master(force: bool) -> None:
    source = SOURCE / "gpt-image-2" / "scrapbook-workspace-master.png"
    output = ART / "backgrounds" / "scrapbook-workspace.webp"
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists() and not force:
        print(f"skip {output.relative_to(GAME)}")
        return
    image = Image.open(source).convert("RGB")
    image.save(output, "WEBP", quality=84, method=6)
    print(f"wrote {output.relative_to(GAME)} ({output.stat().st_size} bytes)")


def cover_fit(image: Image.Image, width: int, height: int) -> Image.Image:
    scale = max(width / image.width, height / image.height)
    resized = image.resize(
        (round(image.width * scale), round(image.height * scale)),
        Image.Resampling.LANCZOS,
    )
    left = (resized.width - width) // 2
    top = (resized.height - height) // 2
    return resized.crop((left, top, left + width, top + height))


def generate_hub(seed: int, force: bool) -> None:
    source_dir = SOURCE / "krea"
    source_dir.mkdir(parents=True, exist_ok=True)
    source = source_dir / f"hub-seed{seed}.png"
    if force or not source.exists():
        print(f"generate Krea 2 hub candidate seed {seed}", flush=True)
        source.write_bytes(post_multipart(
            api("/workflows/krea2-turbo-t2i?sync=true"),
            {
                "prompt": HUB_PROMPT,
                "width": "768",
                "height": "640",
                "steps": "8",
                "cfg": "1",
                "seed": str(seed),
            },
        ))
    previous = SOURCE / "hub" / "previous-hub-tile.jpg"
    previous.parent.mkdir(parents=True, exist_ok=True)
    if HUB_TILE.exists() and not previous.exists():
        previous.write_bytes(HUB_TILE.read_bytes())
    tile = cover_fit(Image.open(source).convert("RGB"), 640, 533)
    HUB_TILE.parent.mkdir(parents=True, exist_ok=True)
    tile.save(HUB_TILE, "JPEG", quality=88, optimize=True, progressive=True)
    recipe = {
        "workflow": "krea2-turbo-t2i",
        "prompt": HUB_PROMPT,
        "seed": seed,
        "width": 768,
        "height": 640,
        "steps": 8,
        "cfg": 1,
        "source": str(source.relative_to(GAME)).replace("\\", "/"),
        "output": str(HUB_TILE.relative_to(REPO)).replace("\\", "/"),
    }
    (source_dir / "hub-recipe.json").write_text(json.dumps(recipe, indent=2) + "\n", "utf-8")
    print(f"wrote {HUB_TILE.relative_to(REPO)} ({HUB_TILE.stat().st_size} bytes)")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("stage", choices=("finalize-master", "extract", "matte", "hub", "all"))
    parser.add_argument("--only", nargs="*", default=[])
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    if args.stage in {"finalize-master", "all"}:
        finalize_master(args.force)
    if args.stage in {"extract", "all"}:
        extract_assets(set(args.only), args.force)
    if args.stage in {"matte", "all"}:
        matte_assets(set(args.only), args.force)
    if args.stage in {"hub", "all"}:
        generate_hub(args.seed, args.force)


if __name__ == "__main__":
    main()
