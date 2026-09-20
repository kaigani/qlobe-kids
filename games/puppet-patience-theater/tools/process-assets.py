#!/usr/bin/env python3
"""Build Puppet Patience Theater runtime art from reviewed source sheets.

GPT Image 2 supplies the coherent source art. The opaque character sheet is
separated with the approved LAN Qwen Image Layered workflow. Every sheet then
passes through tools/cut-asset-sheet.py with an exact-count gate before a
deterministic WebP finalize and saturated-magenta alpha QC pass.
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

from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[3]
GAME = Path(__file__).resolve().parents[1]
SOURCE = GAME / "assets" / "source"
GPT = SOURCE / "gpt-image-2"
LAYERED = SOURCE / "layered"
CROPS = SOURCE / "crops"
QA = SOURCE / "qa"
CUTTER = ROOT / "tools" / "cut-asset-sheet.py"
LOCAL_STATE = ROOT / "tools" / "state" / "local.json"
SEEDS = (42, 1337, 9001, 7)

SHEETS: dict[str, dict[str, Any]] = {
    "characters": {
        "source": GPT / "characters-source.png",
        "cutSource": LAYERED / "characters-cut.png",
        "names": "fox-wave fox-breathe fox-celebrate fox-march rabbit-sit rabbit-swing squirrel-stand squirrel-cookie".split(),
        "dest": GAME / "assets" / "characters",
        "limit": (470, 600),
        "grid": (4, 2),
        "minArea": 1600,
    },
    "props-ui": {
        "source": GPT / "props-ui-source.png",
        "names": "swing cookie-tray parade-drum breathe-flower story-card button-teal button-green button-plum badge-watch badge-breathe badge-turn reward-star".split(),
        "destByIndex": ["props", "props", "props", "ui", "ui", "ui", "ui", "ui", "ui", "ui", "ui", "ui"],
        "limits": {
            "swing": (520, 520), "cookie-tray": (430, 380), "parade-drum": (430, 390),
            "breathe-flower": (360, 480), "story-card": (620, 360),
            "button-teal": (620, 300), "button-green": (620, 300), "button-plum": (620, 300),
            "badge-watch": (260, 260), "badge-breathe": (260, 260), "badge-turn": (260, 260),
            "reward-star": (260, 260),
        },
        "minArea": 1200,
    },
    "stories": {
        "source": GPT / "story-medallions-source.png",
        "names": "story-swing story-bakery story-parade".split(),
        "dest": GAME / "assets" / "stories",
        "limit": (520, 520),
        "minArea": 1600,
    },
    "title": {
        "source": GPT / "title-source.png",
        "names": ["title"],
        "dest": GAME / "assets",
        "limit": (980, 440),
        "minArea": 2400,
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
        value = json.loads(LOCAL_STATE.read_text("utf-8")).get("qwenUrl", "")
    except (OSError, ValueError) as exc:
        raise RuntimeError("tools/state/local.json is missing or invalid") from exc
    if not isinstance(value, str) or not value.strip():
        raise RuntimeError("qwenUrl is not configured")
    return value.rstrip("/")


def multipart(fields: dict[str, str], files: dict[str, Path]) -> tuple[bytes, str]:
    boundary = f"----qlobe-patience-{time.time_ns()}"
    body = io.BytesIO()
    for key, value in fields.items():
        body.write(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{key}\"\r\n\r\n{value}\r\n".encode())
    for key, path in files.items():
        body.write(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{key}\"; filename=\"{path.name}\"\r\n".encode())
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


def alpha_stats(data: bytes) -> dict[str, float | int]:
    with Image.open(io.BytesIO(data)) as opened:
        image = opened.convert("RGBA")
    histogram = image.getchannel("A").histogram()
    pixels = image.width * image.height
    transparent = sum(histogram[:8]) / pixels
    opaque = sum(histogram[248:]) / pixels
    if transparent < 0.08 or opaque < 0.01:
        raise ValueError("layer_2 failed alpha coverage QA")
    return {"width": image.width, "height": image.height,
            "transparentPct": round(transparent * 100, 3), "opaquePct": round(opaque * 100, 3)}


def poll_job(base: str, job_id: str, output: str, timeout: int) -> bytes:
    deadline = time.monotonic() + timeout
    safe_job = urllib.parse.quote(job_id)
    while time.monotonic() < deadline:
        status = str(get_json(f"{base}/jobs/{safe_job}").get("status", "")).lower()
        if status in {"completed", "complete", "succeeded", "success", "done"}:
            return get_bytes(f"{base}/jobs/{safe_job}/result?output={output}")
        if status in {"failed", "error", "cancelled", "canceled"}:
            raise RuntimeError(f"job ended with {status}")
        time.sleep(3)
    raise TimeoutError("local image job timed out")


def edit_character_background(base: str, force: bool, timeout: int) -> Path:
    """Give Layered the flat removable ground it handles reliably."""
    target = LAYERED / "characters-flat-bg.png"
    recipe = LAYERED / "characters-flat-bg.recipe.json"
    if target.is_file() and recipe.is_file() and not force:
        return target
    prompt = (
        "Change only the background. Replace the entire brown gradient background with one perfectly uniform flat dark "
        "charcoal color (#232126), edge to edge, with no gradient, glow, spotlight, floor, shadow, halo, texture, border, or grid. "
        "Preserve all exactly eight puppets, their full silhouettes, faces, poses, clothing, props, fur fibers, colors, scale, "
        "spacing, and exact 4-by-2 positions unchanged. Do not redraw, move, crop, merge, add, or remove any puppet detail."
    )
    body, content_type = multipart(
        {"prompt": prompt, "seed": "42", "steps": "4"},
        {"image": SHEETS["characters"]["source"]},
    )
    request = urllib.request.Request(
        f"{base}/workflows/qwen-image-edit", data=body,
        headers={"Content-Type": content_type}, method="POST")
    with urllib.request.urlopen(request, timeout=900) as response:
        payload = json.loads(response.read())
    job_id = str(payload.get("job_id") or payload.get("id") or "")
    if not job_id:
        raise RuntimeError("qwen-image-edit returned no job id")
    data = poll_job(base, job_id, "output0", timeout)
    with Image.open(io.BytesIO(data)) as opened:
        if opened.width < 800 or opened.height < 500:
            raise ValueError("qwen-image-edit returned an undersized sheet")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    recipe.write_text(json.dumps({
        "format": "qlobe-recipe", "formatVersion": 1,
        "workflow": "qwen-image-edit", "seed": 42,
        "source": str(SHEETS["characters"]["source"].relative_to(ROOT)).replace("\\", "/"),
        "prompt": prompt, "qa": {"status": "requires-visual-identity-review"},
    }, indent=2) + "\n", "utf-8")
    return target


def extract_characters(base: str, edited_source: Path, force: bool, timeout: int) -> Path:
    target = LAYERED / "characters.png"
    recipe = LAYERED / "characters.recipe.json"
    if target.is_file() and recipe.is_file() and not force:
        alpha_stats(target.read_bytes())
        return target
    prompt = (
        "Bottom layer: only the entire background with no puppets or foreground objects.\n"
        "Top layer: all exactly eight complete felt puppet assets together in their original grid positions, "
        "isolated on genuine transparency. Preserve every face, pose, color, stitch, fine fur edge, prop, spacing, "
        "scale, and the whole sheet layout exactly. Do not redraw, crop, rearrange, merge, add, remove, relight, or reinterpret."
    )
    LAYERED.mkdir(parents=True, exist_ok=True)
    failures: list[str] = []
    for seed in SEEDS:
        try:
            body, content_type = multipart(
                {"prompt": prompt, "layers": "2", "seed": str(seed)},
                {"image": edited_source},
            )
            request = urllib.request.Request(
                f"{base}/workflows/qwen-image-layered", data=body,
                headers={"Content-Type": content_type}, method="POST")
            with urllib.request.urlopen(request, timeout=900) as response:
                payload = json.loads(response.read())
            job_id = str(payload.get("job_id") or payload.get("id") or "")
            if not job_id:
                raise RuntimeError("qwen-image-layered returned no job id")
            data = poll_job(base, job_id, "layer_2", timeout)
            stats = alpha_stats(data)
            target.write_bytes(data)
            recipe.write_text(json.dumps({
                "format": "qlobe-recipe", "formatVersion": 1,
                "workflow": "qwen-image-layered", "seed": seed,
                "selectedOutput": "layer_2",
                "source": str(edited_source.relative_to(ROOT)).replace("\\", "/"),
                "prompt": prompt, "qa": stats,
            }, indent=2) + "\n", "utf-8")
            return target
        except Exception as exc:
            failures.append(f"{seed}:{type(exc).__name__}:{exc}")
            print(f"characters layered seed {seed} failed: {exc}", flush=True)
    raise RuntimeError("character extraction failed: " + " | ".join(failures))


def prepare_character_grid(source: Path) -> Path:
    target = SHEETS["characters"]["cutSource"]
    with Image.open(source) as opened:
        image = opened.convert("RGBA")
    alpha = image.getchannel("A")
    pixels = alpha.load()
    cols, rows = SHEETS["characters"]["grid"]
    for col in range(1, cols):
        boundary = round(image.width * col / cols)
        for x in range(max(0, boundary - 5), min(image.width, boundary + 6)):
            for y in range(image.height):
                pixels[x, y] = 0
    for row in range(1, rows):
        boundary = round(image.height * row / rows)
        for y in range(max(0, boundary - 5), min(image.height, boundary + 6)):
            for x in range(image.width):
                pixels[x, y] = 0
    image.putalpha(alpha)
    image.save(target, "PNG", optimize=True)
    return target


def run_cutter(kind: str, force: bool) -> None:
    spec = SHEETS[kind]
    source = spec.get("cutSource", spec["source"])
    command = [
        sys.executable, str(CUTTER), str(source), str(CROPS / kind),
        "--names", *spec["names"], "--expected-count", str(len(spec["names"])),
        "--padding", "12", "--alpha-threshold", "8", "--min-area", str(spec["minArea"]),
        "--close-radius", "6", "--debug-mask", str(QA / f"{kind}-mask.png"), "--format", "png",
    ]
    if force:
        command.append("--force")
    subprocess.run(command, check=True)


def visible_crop(image: Image.Image, pad: int = 12) -> Image.Image:
    rgba = image.convert("RGBA")
    alpha = rgba.getchannel("A").point(lambda value: 0 if value <= 8 else value)
    box = alpha.getbbox()
    if box is None:
        raise ValueError("asset has no visible alpha")
    left, top, right, bottom = box
    rgba.putalpha(alpha)
    return rgba.crop((max(0, left - pad), max(0, top - pad), min(rgba.width, right + pad), min(rgba.height, bottom + pad)))


def save_magenta(image: Image.Image, path: Path) -> None:
    matte = Image.new("RGBA", image.size, (255, 0, 255, 255))
    matte.alpha_composite(image.convert("RGBA"))
    path.parent.mkdir(parents=True, exist_ok=True)
    matte.convert("RGB").save(path, "PNG", optimize=True)


def destination(kind: str, index: int, name: str) -> Path:
    spec = SHEETS[kind]
    if "destByIndex" in spec:
        return GAME / "assets" / spec["destByIndex"][index] / f"{name}.webp"
    return spec["dest"] / ("title.webp" if kind == "title" else f"{name}.webp")


def finalize_sheets(report: dict[str, Any]) -> None:
    for kind, spec in SHEETS.items():
        for index, name in enumerate(spec["names"]):
            source = CROPS / kind / f"{name}.png"
            with Image.open(source) as opened:
                image = visible_crop(opened)
            limit = spec.get("limits", {}).get(name, spec.get("limit", (640, 640)))
            image.thumbnail(limit, Image.Resampling.LANCZOS)
            output = destination(kind, index, name)
            output.parent.mkdir(parents=True, exist_ok=True)
            # Large painterly medallions and the stitched title compress cleanly
            # as high-quality lossy WebP; keep isolated interaction pieces
            # lossless so their fine felt edges remain pristine on stage.
            if kind in {"stories", "title"}:
                image.save(output, "WEBP", quality=86, method=6, exact=True)
            else:
                image.save(output, "WEBP", lossless=True, method=6, exact=True)
            qa_path = QA / kind / f"{name}-magenta.png"
            save_magenta(image, qa_path)
            report[str(output.relative_to(GAME)).replace("\\", "/")] = {
                "source": str(source.relative_to(GAME)).replace("\\", "/"),
                "sourceSha256": sha256(source), "dimensions": list(image.size),
                "bytes": output.stat().st_size,
                "qaMagenta": str(qa_path.relative_to(GAME)).replace("\\", "/"),
            }


def finalize_stage(report: dict[str, Any]) -> None:
    source = GPT / "stage-source.png"
    with Image.open(source) as opened:
        image = ImageOps.fit(opened.convert("RGB"), (1440, 1080), Image.Resampling.LANCZOS)
    output = GAME / "assets" / "stage.webp"
    quality = 86
    while True:
        image.save(output, "WEBP", quality=quality, method=6)
        if output.stat().st_size <= 320 * 1024 or quality <= 68:
            break
        quality -= 3
    report["assets/stage.webp"] = {"source": str(source.relative_to(GAME)).replace("\\", "/"),
                                    "sourceSha256": sha256(source), "dimensions": [1440, 1080],
                                    "bytes": output.stat().st_size, "quality": quality}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--skip-layered", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--timeout", type=int, default=1800)
    args = parser.parse_args()
    required = [GPT / "stage-source.png", *(spec["source"] for spec in SHEETS.values())]
    missing = [path for path in required if not path.is_file()]
    if missing:
        raise FileNotFoundError("missing source assets: " + ", ".join(map(str, missing)))
    if args.dry_run:
        print("edit characters: qwen-image-edit flat background")
        print("layer characters: qwen-image-layered layer_2")
        for kind, spec in SHEETS.items():
            print(f"cut {kind}: exact count {len(spec['names'])}")
        return 0
    QA.mkdir(parents=True, exist_ok=True)
    if args.skip_layered:
        layered = LAYERED / "characters.png"
        if not layered.is_file():
            raise FileNotFoundError(layered)
    else:
        base = api_base()
        edited = edit_character_background(base, args.force, args.timeout)
        layered = extract_characters(base, edited, args.force, args.timeout)
    prepare_character_grid(layered)
    for kind in SHEETS:
        run_cutter(kind, args.force)
    report: dict[str, Any] = {}
    finalize_stage(report)
    finalize_sheets(report)
    manifest = {
        "format": "puppet-patience-processing-v1", "requestedModel": "gpt-image-2",
        "gptImage2Sources": {path.name: sha256(path) for path in sorted(GPT.glob("*.png"))},
        "layeredWorkflow": "qwen-image-layered", "cutter": "tools/cut-asset-sheet.py",
        "outputs": report,
    }
    (SOURCE / "processing.json").write_text(json.dumps(manifest, indent=2) + "\n", "utf-8")
    print(json.dumps({"processed": len(report), "manifest": "assets/source/processing.json"}))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (FileNotFoundError, RuntimeError, ValueError, subprocess.CalledProcessError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        raise SystemExit(2)
