#!/usr/bin/env python3
"""Produce Grace & Courtesy Theater raster assets from reviewed source sheets.

The source sheets are authored with GPT Image 2. Character and prop sheets then
pass through the LAN Qwen Image Layered workflow so their subjects have genuine
alpha. Every contact sheet is located by the repository cutter with an exact-
count gate before deterministic trim, scale, WebP encode, and magenta QA.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

from PIL import Image


ROOT = Path(__file__).resolve().parents[3]
GAME = Path(__file__).resolve().parents[1]
SOURCE = GAME / "assets" / "source"
GPT = SOURCE / "gpt-image-2"
LAYERED = SOURCE / "layered"
CROPS = SOURCE / "crops"
QA = SOURCE / "qa"
LOCAL_STATE = ROOT / "tools" / "state" / "local.json"
CUTTER = ROOT / "tools" / "cut-asset-sheet.py"
SEEDS = (42, 1337, 9001, 7)

SHEETS: dict[str, dict[str, Any]] = {
    "characters": {
        "source": GPT / "characters-source.png",
        "names": "poppy-neutral poppy-wave poppy-ask poppy-listen poppy-sorry poppy-celebrate coco-neutral coco-wave coco-talk coco-wait coco-sad coco-celebrate".split(),
        "layered": True,
        "grid": (6, 2),
        "close": 4,
        "minArea": 1500,
        "dest": GAME / "assets" / "characters",
        "limit": (430, 600),
    },
    "props": {
        "source": GPT / "props-source.png",
        "names": "welcome-mat red-crayon stacked-blocks drum storybook fallen-blocks wait-clock heart-reward".split(),
        "layered": True,
        "grid": (4, 2),
        "close": 0,
        "minArea": 2000,
        "dest": GAME / "assets" / "props",
        "limit": (420, 360),
    },
    "ui": {
        "source": GPT / "ui-kit-source.png",
        "names": "scenario-card choice-green choice-coral choice-plum button-orange speech-bubble reward-star costume-trunk".split(),
        "layered": False,
        "close": 5,
        "minArea": 1500,
        "dest": GAME / "assets" / "ui",
        "limits": {
            "scenario-card": (720, 520),
            "choice-green": (720, 420),
            "choice-coral": (720, 420),
            "choice-plum": (720, 420),
            "button-orange": (720, 420),
            "speech-bubble": (720, 480),
            "reward-star": (420, 420),
            "costume-trunk": (420, 420),
        },
    },
    "costumes": {
        "source": GPT / "costumes-source.png",
        "names": "poppy-daisy poppy-berry poppy-sunny poppy-twilight coco-daisy coco-berry coco-sunny coco-twilight".split(),
        "layered": False,
        "grid": (4, 2),
        "close": 5,
        "minArea": 1500,
        "dest": GAME / "assets" / "costumes",
        "limit": (360, 190),
    },
    "choices": {
        "source": GPT / "choices-cast-match-source.png",
        "names": "greeting-kind greeting-turn-away greeting-shout asking-kind asking-grab asking-stomp thanks-kind thanks-walk-away thanks-demand turns-kind turns-grab turns-push listening-kind listening-interrupt listening-look-away apology-kind apology-hide apology-blame".split(),
        "layered": False,
        "grid": (3, 6),
        "gutterHalf": 12,
        "close": 5,
        "minArea": 1500,
        "dest": GAME / "assets" / "choices",
        "limit": (260, 260),
    },
    "title": {
        "source": GPT / "title-source.png",
        "names": ["title"],
        "layered": False,
        "close": 7,
        "minArea": 3000,
        "dest": GAME / "assets",
        "limit": (980, 440),
    },
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def api_base() -> str:
    try:
        value = json.loads(LOCAL_STATE.read_text(encoding="utf-8")).get("qwenUrl", "")
    except (OSError, ValueError) as exc:
        raise RuntimeError("tools/state/local.json is missing or invalid") from exc
    if not isinstance(value, str) or not value.strip():
        raise RuntimeError("qwenUrl is not configured in tools/state/local.json")
    return value.rstrip("/")


def multipart(fields: dict[str, str], files: dict[str, Path]) -> tuple[bytes, str]:
    boundary = f"----qlobe-grace-{time.time_ns()}"
    body = io.BytesIO()
    for key, value in fields.items():
        body.write(f"--{boundary}\r\n".encode())
        body.write(f'Content-Disposition: form-data; name="{key}"\r\n\r\n'.encode())
        body.write(str(value).encode())
        body.write(b"\r\n")
    for key, path in files.items():
        body.write(f"--{boundary}\r\n".encode())
        body.write(
            f'Content-Disposition: form-data; name="{key}"; filename="{path.name}"\r\n'.encode()
        )
        body.write(b"Content-Type: image/png\r\n\r\n")
        body.write(path.read_bytes())
        body.write(b"\r\n")
    body.write(f"--{boundary}--\r\n".encode())
    return body.getvalue(), f"multipart/form-data; boundary={boundary}"


def get_bytes(url: str, timeout: int = 300) -> bytes:
    with urllib.request.urlopen(url, timeout=timeout) as response:
        return response.read()


def get_json(url: str, timeout: int = 60) -> dict[str, Any]:
    return json.loads(get_bytes(url, timeout))


def submit_layered(base: str, source: Path, prompt: str, seed: int) -> str:
    body, content_type = multipart(
        {"prompt": prompt, "layers": "2", "seed": str(seed)},
        {"image": source},
    )
    request = urllib.request.Request(
        f"{base}/workflows/qwen-image-layered",
        data=body,
        headers={"Content-Type": content_type},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=900) as response:
        payload = json.loads(response.read())
    job_id = payload.get("job_id") or payload.get("id")
    if not job_id:
        raise RuntimeError("qwen-image-layered returned no job id")
    return str(job_id)


def poll_layered(base: str, job_id: str, timeout: int) -> bytes:
    deadline = time.monotonic() + timeout
    safe_job = urllib.parse.quote(job_id)
    while time.monotonic() < deadline:
        state = get_json(f"{base}/jobs/{safe_job}")
        status = str(state.get("status", "")).lower()
        if status in {"completed", "complete", "succeeded", "success"}:
            return get_bytes(f"{base}/jobs/{safe_job}/result?output=layer_2", 300)
        if status in {"failed", "error", "cancelled", "canceled"}:
            raise RuntimeError(f"qwen-image-layered job ended with {status}")
        time.sleep(3)
    raise TimeoutError("qwen-image-layered timed out")


def alpha_stats(data: bytes) -> dict[str, float | int]:
    with Image.open(io.BytesIO(data)) as opened:
        image = opened.convert("RGBA")
    histogram = image.getchannel("A").histogram()
    pixels = image.width * image.height
    transparent = sum(histogram[:8]) / pixels
    opaque = sum(histogram[248:]) / pixels
    if transparent < 0.05 or opaque < 0.01:
        raise ValueError("layer_2 failed alpha coverage QA")
    return {
        "width": image.width,
        "height": image.height,
        "transparentPct": round(transparent * 100, 3),
        "opaquePct": round(opaque * 100, 3),
    }


def extract_sheet(kind: str, base: str, force: bool, timeout: int) -> Path:
    spec = SHEETS[kind]
    target = LAYERED / f"{kind}.png"
    recipe = LAYERED / f"{kind}.recipe.json"
    if target.is_file() and recipe.is_file() and not force:
        alpha_stats(target.read_bytes())
        print(f"layered {kind}: cached")
        return target
    prompt = (
        "Bottom layer: only the entire production background, with no foreground objects.\n"
        f"Top layer: all exactly {len(spec['names'])} complete foreground assets together in their original positions, "
        "isolated on genuine transparency. Preserve every subject, pose, color, stitch, edge, spacing, scale, and the "
        "whole sheet layout exactly. Do not redraw, crop, rearrange, merge, add, remove, relight, or reinterpret anything."
    )
    LAYERED.mkdir(parents=True, exist_ok=True)
    failures: list[str] = []
    for seed in SEEDS:
        print(f"layered {kind}: seed {seed}", flush=True)
        try:
            data = poll_layered(base, submit_layered(base, spec["source"], prompt, seed), timeout)
            stats = alpha_stats(data)
            target.write_bytes(data)
            recipe.write_text(
                json.dumps(
                    {
                        "format": "qlobe-recipe",
                        "formatVersion": 1,
                        "workflow": "qwen-image-layered",
                        "seed": seed,
                        "selectedOutput": "layer_2",
                        "source": str(spec["source"].relative_to(ROOT)).replace("\\", "/"),
                        "prompt": prompt,
                        "qa": stats,
                    },
                    indent=2,
                )
                + "\n",
                encoding="utf-8",
            )
            return target
        except Exception as exc:  # seed ladder intentionally retries service/model failures
            failures.append(f"{seed}:{type(exc).__name__}:{exc}")
            print(f"layered {kind}: retry after {type(exc).__name__}: {exc}", flush=True)
    raise RuntimeError(f"layered extraction failed for {kind}: {' | '.join(failures)}")


def cutter_sheet(kind: str) -> Path:
    spec = SHEETS[kind]
    return LAYERED / f"{kind}-cut.png" if "grid" in spec else spec["source"]


def prepare_sheet_for_cut(kind: str) -> Path:
    """Clear only guaranteed contact-sheet gutters before component detection.

    Qwen occasionally leaves a one-pixel alpha thread between neighboring
    cells. The authored grids keep every subject well inside its cell, so
    clearing a narrow strip at each exact cell boundary is deterministic and
    does not alter visible artwork.
    """
    spec = SHEETS[kind]
    source = LAYERED / f"{kind}.png" if spec["layered"] else spec["source"]
    target = LAYERED / f"{kind}-cut.png"
    columns, rows = spec["grid"]
    with Image.open(source) as opened:
        image = opened.convert("RGBA")
    alpha = image.getchannel("A")
    pixels = alpha.load()
    half = spec.get("gutterHalf", 4)
    for column in range(1, columns):
        boundary = round(image.width * column / columns)
        for x in range(max(0, boundary - half), min(image.width, boundary + half + 1)):
            for y in range(image.height):
                pixels[x, y] = 0
    for row in range(1, rows):
        boundary = round(image.height * row / rows)
        for y in range(max(0, boundary - half), min(image.height, boundary + half + 1)):
            for x in range(image.width):
                pixels[x, y] = 0
    image.putalpha(alpha)
    image.save(target, "PNG", optimize=True)
    return target


def run_cutter(kind: str, force: bool, dry_run: bool) -> None:
    spec = SHEETS[kind]
    sheet = cutter_sheet(kind)
    output = CROPS / kind
    debug_mask = QA / f"{kind}-mask.png"
    command = [
        sys.executable,
        str(CUTTER),
        str(sheet),
        str(output),
        "--names",
        *spec["names"],
        "--expected-count",
        str(len(spec["names"])),
        "--padding",
        "12",
        "--alpha-threshold",
        "8",
        "--min-area",
        str(spec["minArea"]),
        "--close-radius",
        str(spec["close"]),
        "--debug-mask",
        str(debug_mask),
        "--format",
        "png",
    ]
    if force:
        command.append("--force")
    if dry_run:
        command.append("--dry-run")
    print(f"cut {kind}: exact count {len(spec['names'])}")
    subprocess.run(command, check=True)


def crop_visible(image: Image.Image, pad: int = 12) -> Image.Image:
    rgba = image.convert("RGBA")
    alpha = rgba.getchannel("A").point(lambda value: 0 if value <= 8 else value)
    rgba.putalpha(alpha)
    box = alpha.getbbox()
    if box is None:
        raise ValueError("asset has no visible alpha")
    left, top, right, bottom = box
    return rgba.crop(
        (
            max(0, left - pad),
            max(0, top - pad),
            min(rgba.width, right + pad),
            min(rgba.height, bottom + pad),
        )
    )


def save_magenta(image: Image.Image, path: Path) -> None:
    rgba = image.convert("RGBA")
    matte = Image.new("RGBA", rgba.size, (255, 0, 255, 255))
    matte.alpha_composite(rgba)
    path.parent.mkdir(parents=True, exist_ok=True)
    matte.convert("RGB").save(path, "PNG", optimize=True)


def finalize_cutouts(kind: str, report: dict[str, Any]) -> None:
    spec = SHEETS[kind]
    destination: Path = spec["dest"]
    destination.mkdir(parents=True, exist_ok=True)
    for name in spec["names"]:
        source = CROPS / kind / f"{name}.png"
        if not source.is_file():
            raise FileNotFoundError(source)
        with Image.open(source) as opened:
            image = crop_visible(opened)
        limit = spec.get("limits", {}).get(name, spec.get("limit", (720, 720)))
        image.thumbnail(limit, Image.Resampling.LANCZOS)
        output = destination / ("title.webp" if kind == "title" else f"{name}.webp")
        image.save(output, "WEBP", lossless=True, method=6, exact=True)
        qa_path = QA / kind / f"{name}-magenta.png"
        save_magenta(image, qa_path)
        report[str(output.relative_to(GAME)).replace("\\", "/")] = {
            "source": str(source.relative_to(GAME)).replace("\\", "/"),
            "sourceSha256": sha256(source),
            "dimensions": list(image.size),
            "bytes": output.stat().st_size,
            "qaMagenta": str(qa_path.relative_to(GAME)).replace("\\", "/"),
        }


def finalize_stage(report: dict[str, Any]) -> None:
    source = GPT / "felt-stage-source.png"
    with Image.open(source) as opened:
        image = opened.convert("RGB")
    scale = max(1440 / image.width, 1080 / image.height)
    image = image.resize((round(image.width * scale), round(image.height * scale)), Image.Resampling.LANCZOS)
    left = (image.width - 1440) // 2
    top = (image.height - 1080) // 2
    image = image.crop((left, top, left + 1440, top + 1080))
    output = GAME / "assets" / "stage.webp"
    quality = 86
    while True:
        image.save(output, "WEBP", quality=quality, method=6)
        if output.stat().st_size <= 300 * 1024 or quality <= 68:
            break
        quality -= 3
    report[str(output.relative_to(GAME)).replace("\\", "/")] = {
        "source": str(source.relative_to(GAME)).replace("\\", "/"),
        "sourceSha256": sha256(source),
        "dimensions": [1440, 1080],
        "quality": quality,
        "bytes": output.stat().st_size,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Produce Grace & Courtesy Theater raster assets")
    parser.add_argument("--dry-run", action="store_true", help="print jobs without network or writes")
    parser.add_argument("--force", action="store_true", help="replace layered, crop, and runtime outputs")
    parser.add_argument("--skip-layered", action="store_true", help="reuse already-produced layered sheets")
    parser.add_argument("--timeout", type=int, default=1800, help="per layered job timeout in seconds")
    args = parser.parse_args()

    required = [GPT / "felt-stage-source.png", *(spec["source"] for spec in SHEETS.values())]
    missing = [path for path in required if not path.is_file()]
    if missing:
        raise FileNotFoundError("missing source assets: " + ", ".join(str(path) for path in missing))

    if args.dry_run:
        for kind, spec in SHEETS.items():
            if spec["layered"] and not args.skip_layered:
                print(f"layered {kind}: qwen-image-layered layer_2, seeds {SEEDS}")
            print(f"cut {kind}: tools/cut-asset-sheet.py exact count {len(spec['names'])}")
        print("finalize: stage, title, 12 characters, 8 props, 8 UI pieces, 8 costumes, 18 choice medallions")
        print("qa: alpha assets composited on magenta under assets/source/qa")
        return 0

    QA.mkdir(parents=True, exist_ok=True)
    if not args.skip_layered:
        base = api_base()
        for kind, spec in SHEETS.items():
            if spec["layered"]:
                extract_sheet(kind, base, args.force, args.timeout)
    else:
        for kind, spec in SHEETS.items():
            if spec["layered"] and not (LAYERED / f"{kind}.png").is_file():
                raise FileNotFoundError(LAYERED / f"{kind}.png")

    for kind, spec in SHEETS.items():
        if "grid" in spec:
            prepare_sheet_for_cut(kind)

    for kind in SHEETS:
        run_cutter(kind, args.force, dry_run=False)

    report: dict[str, Any] = {}
    finalize_stage(report)
    for kind in SHEETS:
        finalize_cutouts(kind, report)
    manifest = {
        "format": "grace-courtesy-theater-processing-v1",
        "gptImage2Sources": {
            path.name: sha256(path) for path in sorted(GPT.glob("*.png"))
        },
        "layeredWorkflow": "qwen-image-layered",
        "cutter": "tools/cut-asset-sheet.py",
        "outputs": report,
    }
    (SOURCE / "processing.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"processed": len(report), "manifest": "assets/source/processing.json"}))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (FileNotFoundError, RuntimeError, ValueError, subprocess.CalledProcessError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        raise SystemExit(2)
