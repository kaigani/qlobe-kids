#!/usr/bin/env python3
"""Reproducible Family Timeline art production driver (QLOBE Studio)."""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request
from collections import deque
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageFilter, ImageOps


GAME = Path(__file__).resolve().parents[1]
REPO = GAME.parents[1]
CUT = REPO / "tools" / "pipeline" / "cutout_finalize.py"
MAP_SOURCE = GAME.parent / "globe-spin-stories" / "assets" / "map" / "world-paper-map.webp"
SEEDS = (42, 1337, 9001)

DIRECT_ASSETS = {
    "title/title-lockup.webp": ("title", "title-lockup.png"),
    "ui/pocket-baby.webp": ("timeline-ui", "pocket-baby.png"),
    "ui/pocket-toddler.webp": ("timeline-ui", "pocket-toddler.png"),
    "ui/pocket-now.webp": ("timeline-ui", "pocket-now.png"),
    "ui/candidate-tray.webp": ("timeline-ui", "candidate-tray.png"),
    "ui/rainbow-road.webp": ("timeline-ui", "rainbow-road.png"),
    "ui/start-plate.webp": ("timeline-ui", "start-plate.png"),
    "ui/globe-plate.webp": ("timeline-ui", "globe-plate.png"),
    "ui/book-icon.webp": ("timeline-ui", "book-icon.png"),
    "ui/spin-plate.webp": ("story-controls", "spin-plate.png"),
    "ui/camera-plate.webp": ("story-controls", "camera-plate.png"),
    "ui/story-star.webp": ("story-controls", "story-star.png"),
    "ui/confetti-cluster.webp": ("story-controls", "confetti-cluster.png"),
    "story-cards/food.webp": ("family-story-ui", "food-card.png"),
    "story-cards/place.webp": ("family-story-ui", "place-card.png"),
    "story-cards/celebration.webp": ("family-story-ui", "celebration-card.png"),
    "stamps/food.webp": ("story-controls", "food-stamp.png"),
    "stamps/place.webp": ("story-controls", "place-stamp.png"),
    "stamps/celebration.webp": ("story-controls", "celebration-stamp.png"),
}

HUB_PROMPT = (
    "A premium preschool learning game hub tile in tactile handmade papercraft: "
    "an open cream family scrapbook beside a friendly blue paper globe, a stitched "
    "rainbow timeline crossing the pages, three tiny blank instant-photo memory cards, "
    "paper stars, leaves and flowers on a warm kraft tabletop. Layered cut cardstock, "
    "visible paper fibers, deckled edges, soft physical contact shadows, sky blue, coral, "
    "mustard, leaf green and lavender palette. Cheerful, emotionally warm, uncluttered, "
    "centered 6:5 composition for ages four to seven. No people, no hands, no letters, "
    "no words, no numbers, no UI, no watermark, not glossy, not plastic, not 3D render."
)


def local_settings() -> dict:
    path = REPO / "tools" / "state" / "local.json"
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def api_base() -> str:
    value = os.environ.get("QLOBE_QWEN_URL") or local_settings().get("qwenUrl")
    if not value:
        raise SystemExit("Local image API is not configured")
    return str(value).rstrip("/")


def api(path: str) -> str:
    return f"{api_base()}{path}"


def post_multipart(url: str, fields: dict[str, str], files: dict[str, Path] | None = None) -> bytes:
    boundary = "----qlobe" + os.urandom(8).hex()
    body = bytearray()
    for name, value in fields.items():
        body += (
            f"--{boundary}\r\nContent-Disposition: form-data; "
            f'name="{name}"\r\n\r\n{value}\r\n'
        ).encode()
    for name, path in (files or {}).items():
        body += (
            f"--{boundary}\r\nContent-Disposition: form-data; "
            f'name="{name}"; filename="{path.name}"\r\n'
            "Content-Type: image/png\r\n\r\n"
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


def finalize_cutout(source: Path, output: Path, magenta: Path, max_size: int = 1024) -> dict:
    output.parent.mkdir(parents=True, exist_ok=True)
    magenta.parent.mkdir(parents=True, exist_ok=True)
    cut_output = output
    if output.suffix.lower() == ".webp":
        relative = output.relative_to(GAME / "assets" / "art")
        cut_output = GAME / "assets" / "source" / "processed" / "finalized" / relative.with_suffix(".png")
        cut_output.parent.mkdir(parents=True, exist_ok=True)
    result = subprocess.run([
        sys.executable, str(CUT), "--input", str(source), "--output", str(cut_output),
        "--magenta", str(magenta), "--max-size", str(max_size), "--pad", "12",
        "--alpha-floor", "4",
    ], capture_output=True, text=True)
    try:
        report = json.loads(result.stdout.strip().splitlines()[-1])
    except (json.JSONDecodeError, IndexError):
        report = {"pass": False, "reason": result.stderr.strip() or result.stdout.strip()}
    if report.get("pass") and output.suffix.lower() == ".webp":
        Image.open(cut_output).convert("RGBA").save(
            output, "WEBP", quality=90, method=6, exact=True
        )
    report.update({"source": str(source.relative_to(REPO)), "output": str(output.relative_to(REPO))})
    if cut_output != output:
        report["finalizedPng"] = str(cut_output.relative_to(REPO))
    return report


def normalize_direct_alpha(source: Path, destination: Path) -> None:
    """Normalize GPT Image's almost-opaque 253 alpha without harming soft edges."""
    image = Image.open(source).convert("RGBA")
    alpha = image.getchannel("A").point(
        lambda value: 0 if value <= 4 else (255 if value >= 250 else value)
    )
    image.putalpha(alpha)
    destination.parent.mkdir(parents=True, exist_ok=True)
    image.save(destination, "PNG", optimize=True)


def remove_connected_dark_background(source: Path, destination: Path) -> None:
    """Remove only dark pixels connected to the crop edge; preserve dark card details."""
    image = Image.open(source).convert("RGB")
    width, height = image.size
    pixels = image.load()
    outside = bytearray(width * height)
    queue: deque[tuple[int, int]] = deque()

    def dark(x: int, y: int) -> bool:
        red, green, blue = pixels[x, y]
        return max(red, green, blue) < 105 and abs(red - green) < 35 and abs(green - blue) < 35

    def add(x: int, y: int) -> None:
        index = y * width + x
        if not outside[index] and dark(x, y):
            outside[index] = 255
            queue.append((x, y))

    for x in range(width):
        add(x, 0)
        add(x, height - 1)
    for y in range(height):
        add(0, y)
        add(width - 1, y)
    while queue:
        x, y = queue.popleft()
        if x:
            add(x - 1, y)
        if x + 1 < width:
            add(x + 1, y)
        if y:
            add(x, y - 1)
        if y + 1 < height:
            add(x, y + 1)
    exterior = Image.frombytes("L", (width, height), bytes(outside)).filter(ImageFilter.MaxFilter(3))
    alpha = ImageOps.invert(exterior).filter(ImageFilter.GaussianBlur(.55))
    rgba = image.convert("RGBA")
    rgba.putalpha(alpha)
    destination.parent.mkdir(parents=True, exist_ok=True)
    rgba.save(destination, "PNG", optimize=True)


def layered_extract(source: Path, destination: Path, subject: str, seed: int) -> bool:
    prompt = (
        "The input has one complete rounded-rectangle memory card surrounded only by "
        "dark charcoal. Bottom layer: only that outside charcoal. Top layer: the ENTIRE "
        f"{subject} as one inseparable object, including its full cream stitched border, "
        "blank cream label pocket, blue scene, child, sun, clouds, plants and every item "
        "inside the border. Never split out the child or any internal decoration. Keep "
        "the child's identity, warm brown skin, curly dark hair, facial features, pose, "
        "clothing, papercraft texture, colors, proportions and edges identical. Preserve "
        "all four rounded corners. Do not redesign, add, remove, crop, write, or change "
        "the age."
    )
    payload = json.loads(post_multipart(
        api("/workflows/qwen-image-layered"),
        {"prompt": prompt, "layers": "2", "seed": str(seed)},
        {"image": source},
    ))
    job_id = payload.get("job_id")
    if not job_id:
        return False
    for _ in range(240):
        time.sleep(3)
        state = get_json(api(f"/jobs/{job_id}"))
        status = state.get("status")
        if status == "completed":
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(get_bytes(api(f"/jobs/{job_id}/result?output=layer_2")))
            return destination.stat().st_size > 2_000
        if status in {"failed", "error", "cancelled"}:
            return False
    return False


def extract(args) -> None:
    ledger: dict[str, dict] = {}
    source_folder = GAME / "assets" / "source" / "crops" / "nia-memory-cards"
    candidate_folder = GAME / "assets" / "source" / "local-api" / "layered"
    for name in ("baby", "toddler", "now"):
        source = source_folder / f"{name}.png"
        runtime = GAME / "assets" / "art" / "memories" / f"{name}.webp"
        if runtime.exists() and not args.force:
            ledger[name] = {"status": "cached", "output": str(runtime.relative_to(REPO))}
            continue
        accepted = None
        attempts = []
        # Toddler's whole-card layer passes visual QA. Baby/Now seed 42 prove
        # the model's alternate internal-object split; their exact authored
        # cards therefore use the deterministic connected-edge fallback.
        seeds_for_asset = SEEDS if name == "toddler" else (42,)
        for seed in seeds_for_asset:
            raw = candidate_folder / f"{name}-seed{seed}-layer-2.png"
            candidate = candidate_folder / f"{name}-seed{seed}.png"
            magenta = GAME / "assets" / "source" / "qa" / "alpha" / f"{name}-seed{seed}-magenta.png"
            generated = (raw.exists() and raw.stat().st_size > 2_000) or layered_extract(
                source, raw, f"papercraft {name} memory card featuring Nia", seed
            )
            report = finalize_cutout(raw, candidate, magenta) if generated else {
                "pass": False, "reason": "layered extraction failed", "source": str(source.relative_to(REPO))
            }
            if report.get("pass"):
                bbox = report.get("bbox") or [0, 0, 0, 0]
                source_size = report.get("sourceSize") or [1, 1]
                final_size = report.get("finalSize") or [0, 1]
                width_coverage = (bbox[2] - bbox[0]) / max(1, source_size[0])
                height_coverage = (bbox[3] - bbox[1]) / max(1, source_size[1])
                aspect = final_size[0] / max(1, final_size[1])
                shape_ok = width_coverage >= .70 and height_coverage >= .70 and .68 <= aspect <= .88
                report["visualGate"] = {
                    "pass": shape_ok,
                    "widthCoverage": round(width_coverage, 3),
                    "heightCoverage": round(height_coverage, 3),
                    "aspect": round(aspect, 3),
                }
                if not shape_ok:
                    report["pass"] = False
                    report["reason"] = "whole-card geometry gate failed"
            report["seed"] = seed
            attempts.append(report)
            if report.get("pass"):
                runtime.parent.mkdir(parents=True, exist_ok=True)
                Image.open(candidate).convert("RGBA").save(runtime, "WEBP", quality=90, method=6, exact=True)
                accepted = seed
                break
        ledger[name] = {
            "status": "accepted" if accepted is not None else "failed",
            "acceptedSeed": accepted,
            "output": str(runtime.relative_to(REPO)),
            "attempts": attempts,
        }
        if accepted is None:
            fallback_source = GAME / "assets" / "source" / "processed" / "memories" / f"{name}-connected-cutout.png"
            fallback_magenta = GAME / "assets" / "source" / "qa" / "alpha" / f"{name}-connected-magenta.png"
            remove_connected_dark_background(source, fallback_source)
            fallback_report = finalize_cutout(fallback_source, runtime, fallback_magenta)
            fallback_report["method"] = "connected-dark-background-removal"
            attempts.append(fallback_report)
            if not fallback_report.get("pass"):
                raise SystemExit(f"No passing layered or deterministic extraction for {name}")
            ledger[name].update({"status": "fallback-accepted", "method": fallback_report["method"]})
    qa_path = GAME / "assets" / "source" / "qa" / "layered-ledger.json"
    qa_path.parent.mkdir(parents=True, exist_ok=True)
    qa_path.write_text(json.dumps(ledger, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"stage": "extract", "items": ledger}, indent=2))


def hub(args) -> None:
    raw = post_multipart(
        api("/workflows/krea2-turbo-t2i?sync=true"),
        {
            "prompt": HUB_PROMPT,
            "seed": str(args.seed),
            "width": "768",
            "height": "640",
            "steps": "8",
            "cfg": "1",
        },
    )
    source = GAME / "assets" / "source" / "local-api" / "krea" / f"hub-seed{args.seed}.png"
    source.parent.mkdir(parents=True, exist_ok=True)
    source.write_bytes(raw)
    try:
        image = Image.open(BytesIO(raw)).convert("RGB")
    except Exception as exc:
        raise SystemExit(f"Krea response was not a valid image: {exc}") from exc
    output = REPO / "assets" / "hub" / "tiles" / "family-timeline.jpg"
    if output.exists() and not args.force:
        raise SystemExit(f"Refusing overwrite without --force: {output.relative_to(REPO)}")
    output.parent.mkdir(parents=True, exist_ok=True)
    ImageOps.fit(image, (640, 533), Image.Resampling.LANCZOS).save(
        output, "JPEG", quality=90, optimize=True, progressive=True
    )
    recipe = source.with_suffix(".recipe.json")
    recipe.write_text(json.dumps({
        "workflow": "krea2-turbo-t2i",
        "prompt": HUB_PROMPT,
        "seed": args.seed,
        "sourceSize": [768, 640],
        "output": str(output.relative_to(REPO)),
    }, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"stage": "hub", "status": "complete", "output": str(output.relative_to(REPO))}))


def copy_safe(source: Path, destination: Path, force: bool) -> dict:
    if not source.exists():
        return {"source": str(source), "output": str(destination), "status": "missing"}
    if destination.exists() and not force:
        return {"output": str(destination.relative_to(REPO)), "status": "cached"}
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)
    return {"output": str(destination.relative_to(REPO)), "status": "copied"}


def finalize(args) -> None:
    ledger = []
    qa_folder = GAME / "assets" / "source" / "qa" / "alpha"
    qa_folder.mkdir(parents=True, exist_ok=True)
    background_source = GAME / "assets" / "source" / "gpt-image-2" / "album-environment-master.png"
    background = GAME / "assets" / "art" / "backgrounds" / "album-environment.webp"
    if background_source.exists() and (args.force or not background.exists()):
        background.parent.mkdir(parents=True, exist_ok=True)
        image = Image.open(background_source).convert("RGB")
        image.save(background, "WEBP", quality=86, method=6)
    ledger.append({
        "source": str(background_source.relative_to(REPO)),
        "output": str(background.relative_to(REPO)),
        "status": "finalized" if background.exists() else "missing",
    })
    ledger.append(copy_safe(MAP_SOURCE, GAME / "assets" / "art" / "map" / "world-paper-map.webp", args.force))
    for target, (folder, name) in DIRECT_ASSETS.items():
        source = GAME / "assets" / "source" / "crops" / folder / name
        output = GAME / "assets" / "art" / target
        if output.exists() and not args.force:
            ledger.append({"output": str(output.relative_to(REPO)), "status": "cached"})
            continue
        if not source.exists():
            ledger.append({"source": str(source.relative_to(REPO)), "status": "missing"})
            continue
        normalized = GAME / "assets" / "source" / "processed" / folder / name
        normalize_direct_alpha(source, normalized)
        magenta = qa_folder / f"{folder}-{Path(target).stem}-magenta.png"
        report = finalize_cutout(normalized, output, magenta)
        report["cutSource"] = str(source.relative_to(REPO))
        ledger.append(report)
    qa_path = GAME / "assets" / "source" / "qa" / "production-ledger.json"
    qa_path.write_text(json.dumps(ledger, indent=2) + "\n", encoding="utf-8")
    failures = [item for item in ledger if item.get("status") == "missing" or item.get("pass") is False]
    print(json.dumps({"stage": "finalize", "failures": len(failures), "items": ledger}, indent=2))
    if failures:
        raise SystemExit("Art finalization had missing or failed assets")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("stage", choices=("finalize", "extract", "hub", "all"))
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    if args.stage in {"finalize", "all"}:
        finalize(args)
    if args.stage in {"extract", "all"}:
        extract(args)
    if args.stage in {"hub", "all"}:
        hub(args)


if __name__ == "__main__":
    main()
