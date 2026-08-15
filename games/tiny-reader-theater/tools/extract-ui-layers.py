#!/usr/bin/env python3
"""Extract Tiny Reader Theater UI art with qwen-image-layered.

The source artwork is intentionally retained under assets/source/opaque.  This
tool submits every opaque UI element plus the generated six-piece UI kit, saves
the model's true-alpha layer_2 outputs, writes magenta QA composites, and
produces the runtime PNGs.  Jobs are submitted together so ComfyUI can queue
them efficiently; completed layer_2 files make the run resumable.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import sys
import time
import urllib.request

from PIL import Image, ImageChops, ImageDraw


GAME = Path(__file__).resolve().parents[1]
SOURCE = GAME / "assets" / "source"
OPAQUE = SOURCE / "opaque"
LAYERED = SOURCE / "layered"
QA = SOURCE / "qa"
RUNTIME = GAME / "assets" / "ui"
KIT = GAME / "assets" / "ui-kit"
API = os.environ.get("QLOBE_QWEN_URL", "http://192.168.1.181:8100").rstrip("/")
SEED = 42
JOB_IDS_PATH = SOURCE / "qwen-jobs.json"


JOBS = {
    "title-lockup": (OPAQUE / "title-lockup.png", "the exact stitched felt Tiny Reader Theater curtain title lockup"),
    "world-forest": (OPAQUE / "world-forest.png", "the exact complete Forest felt world card"),
    "world-castle": (OPAQUE / "world-castle.png", "the exact complete Castle felt world card"),
    "world-outer-space": (OPAQUE / "world-outer-space.png", "the exact complete Outer Space felt world card"),
    "choice-map": (OPAQUE / "choice-map.png", "the exact complete stitched felt map choice card"),
    "choice-bird": (OPAQUE / "choice-bird.png", "the exact complete stitched felt bird choice card"),
    "choice-door": (OPAQUE / "choice-door.png", "the exact complete stitched felt secret-door choice card"),
    "choice-dig-log": (OPAQUE / "choice-dig-log.png", "the exact complete stitched felt log choice card"),
    "choice-hop-mud": (OPAQUE / "choice-hop-mud.png", "the exact complete stitched felt mud choice card"),
    "choice-climb-tree": (OPAQUE / "choice-climb-tree.png", "the exact complete stitched felt tree choice card"),
    "choice-make-nest": (OPAQUE / "choice-make-nest.png", "the exact complete stitched felt nest choice card"),
    "choice-sing-bird": (OPAQUE / "choice-sing-bird.png", "the exact complete stitched felt singing bird choice card"),
    "choice-share-nut": (OPAQUE / "choice-share-nut.png", "the exact complete stitched felt nut choice card"),
    "choice-down-steps": (OPAQUE / "choice-down-steps.png", "the exact complete stitched felt stone-steps choice card"),
    "choice-peek-den": (OPAQUE / "choice-peek-den.png", "the exact complete stitched felt animal-den choice card"),
    "choice-follow-bugs": (OPAQUE / "choice-follow-bugs.png", "the exact complete stitched felt glowing-bugs choice card"),
    "ending-stamp-filled": (OPAQUE / "ending-stamp-filled.png", "the exact complete filled felt tree ending stamp"),
    "ending-stamp-outline": (OPAQUE / "ending-stamp-outline.png", "the exact complete outline felt tree ending stamp"),
    "ui-kit": (SOURCE / "ui-kit-raw.png", "all six exact blank stitched felt UI components, each kept complete and unchanged"),
}


def submit(source: Path, description: str) -> str:
    prompt = (
        "Background layer: a single perfectly flat solid magenta background. "
        f"Top layer: {description} from the input image on true transparency. "
        "Keep every subject identical to the input, including its silhouette, felt texture, stitches, lighting, and colors. "
        "Do not redesign, crop, add text, or add any new object."
    )
    proc = subprocess.run(
        [
            "curl", "-s", "-X", "POST", f"{API}/workflows/qwen-image-layered",
            "-F", f"image=@{source}", "-F", f"prompt={prompt}",
            "-F", "layers=2", "-F", f"seed={SEED}", "--max-time", "180",
        ],
        capture_output=True,
        check=False,
        text=True,
    )
    payload = json.loads(proc.stdout or "{}")
    job_id = payload.get("job_id") or payload.get("id")
    if not job_id:
        raise RuntimeError(f"submission failed: {proc.stdout[:300]}")
    return str(job_id)


def status(job_id: str) -> str:
    with urllib.request.urlopen(f"{API}/jobs/{job_id}", timeout=30) as response:
        return str(json.load(response).get("status", "unknown"))


def download(job_id: str, output: Path) -> None:
    with urllib.request.urlopen(f"{API}/jobs/{job_id}/result?output=layer_2", timeout=180) as response:
        output.write_bytes(response.read())


def clean_alpha(image: Image.Image, floor: int = 8) -> Image.Image:
    rgba = image.convert("RGBA")
    alpha = rgba.getchannel("A").point(lambda value: 0 if value <= floor else value)
    rgba.putalpha(alpha)
    return rgba


def repair_against_source(layer: Image.Image, source_path: Path) -> Image.Image:
    """Preserve the exact source RGB and restore any card pieces Qwen dropped.

    qwen-image-layered is the semantic extractor, but it can classify a dark
    foreground tree or border as background.  The sources have a uniform,
    edge-connected white/magenta ground, so a conservative corner flood gives
    us a deterministic silhouette floor.  Unioning that floor with Qwen's soft
    alpha retains model-produced antialiasing while preventing subject loss.
    """
    source = Image.open(source_path).convert("RGBA")
    if source.size != layer.size:
        source = source.resize(layer.size, Image.Resampling.LANCZOS)
    flooded = source.convert("RGB")
    marker = (1, 254, 1)
    for xy in ((0, 0), (flooded.width - 1, 0), (0, flooded.height - 1), (flooded.width - 1, flooded.height - 1)):
        ImageDraw.floodfill(flooded, xy, marker, thresh=28)
    marker_image = Image.new("RGB", flooded.size, marker)
    local_alpha = ImageChops.difference(flooded, marker_image).convert("L").point(lambda value: 0 if value == 0 else 255)
    qwen_alpha = layer.getchannel("A")
    qwen_hist = qwen_alpha.histogram()
    qwen_transparent_pct = 100 * sum(qwen_hist[:10]) / (layer.width * layer.height)
    # A fully opaque layer_2 is an extraction failure (observed on the filled
    # tree stamp). In that case the conservative flat-ground silhouette is the
    # repair; otherwise union it with Qwen so semantic subject pieces cannot be
    # lost while model-produced edge coverage remains available.
    alpha = local_alpha if qwen_transparent_pct < 2 else ImageChops.lighter(qwen_alpha, local_alpha)
    source.putalpha(alpha)
    return source


def alpha_stats(image: Image.Image) -> dict[str, float]:
    alpha = image.getchannel("A")
    hist = alpha.histogram()
    total = image.width * image.height
    transparent = sum(hist[:10])
    opaque = sum(hist[246:])
    return {
        "transparentPct": round(100 * transparent / total, 3),
        "opaquePct": round(100 * opaque / total, 3),
        "partialPct": round(100 * (total - transparent - opaque) / total, 3),
    }


def trim(image: Image.Image, pad: int = 10, max_size: int = 720) -> Image.Image:
    alpha = image.getchannel("A")
    bbox = alpha.point(lambda value: 255 if value > 8 else 0).getbbox()
    if not bbox:
        raise RuntimeError("empty alpha extraction")
    left, top, right, bottom = bbox
    box = (
        max(0, left - pad), max(0, top - pad),
        min(image.width, right + pad), min(image.height, bottom + pad),
    )
    result = image.crop(box)
    if max(result.size) > max_size:
        scale = max_size / max(result.size)
        result = result.resize(
            (max(1, round(result.width * scale)), max(1, round(result.height * scale))),
            Image.Resampling.LANCZOS,
        )
    return result


def magenta(image: Image.Image, output: Path) -> None:
    backing = Image.new("RGBA", image.size, (255, 0, 255, 255))
    backing.alpha_composite(image)
    backing.convert("RGB").save(output, optimize=True)


def process_asset(name: str, layer_path: Path) -> dict[str, object]:
    image = clean_alpha(Image.open(layer_path))
    image = repair_against_source(image, JOBS[name][0])
    stats = alpha_stats(image)
    max_size = 1200 if name == "title-lockup" else (280 if name.startswith("ending-stamp") else 600)
    final = trim(image, max_size=max_size)
    magenta(final, QA / f"{name}-magenta.png")
    final.save(RUNTIME / f"{name}.webp", "WEBP", quality=90, method=6)
    return {"name": name, "sourceSize": list(image.size), "finalSize": list(final.size), "alpha": stats}


def process_kit(layer_path: Path) -> list[dict[str, object]]:
    image = clean_alpha(Image.open(layer_path))
    # The kit's Qwen layer retained all six components and provides clean edge
    # RGB. Preserve that output directly; reusing the magenta-ground source RGB
    # would introduce a chroma fringe into otherwise valid soft alpha.
    magenta(image, QA / "ui-kit-magenta.png")
    cells = [
        ("portrait-card", (0.00, 0.00, 0.31, 0.61)),
        ("word-tile", (0.31, 0.12, 0.64, 0.56)),
        ("label-plaque", (0.64, 0.16, 1.00, 0.54)),
        ("action-button", (0.00, 0.66, 0.352, 0.90)),
        ("story-banner", (0.35, 0.64, 0.685, 0.92)),
        ("endings-panel", (0.69, 0.58, 1.00, 0.92)),
    ]
    output = []
    for name, (x0, y0, x1, y1) in cells:
        left = round(x0 * image.width)
        right = round(x1 * image.width)
        top = round(y0 * image.height)
        bottom = round(y1 * image.height)
        final = trim(image.crop((left, top, right, bottom)), max_size=720)
        magenta(final, QA / f"ui-{name}-magenta.png")
        final.save(KIT / f"{name}.webp", "WEBP", quality=90, method=6)
        output.append({"name": name, "finalSize": list(final.size), "alpha": alpha_stats(final)})
    return output


def main() -> None:
    for directory in (LAYERED, QA, RUNTIME, KIT):
        directory.mkdir(parents=True, exist_ok=True)

    try:
        recorded_jobs = json.loads(JOB_IDS_PATH.read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        recorded_jobs = {}
    pending: dict[str, str] = {}
    for name, (source, description) in JOBS.items():
        output = LAYERED / f"{name}.layer2.png"
        if output.exists() and output.stat().st_size > 20_000:
            print(f"{name}: reuse layer_2", flush=True)
            continue
        if not source.exists():
            raise FileNotFoundError(source)
        resumed = recorded_jobs.get(name)
        pending[name] = str(resumed or submit(source, description))
        recorded_jobs[name] = pending[name]
        JOB_IDS_PATH.write_text(json.dumps(recorded_jobs, indent=2) + "\n")
        print(f"{name}: {'resume' if resumed else 'submitted'} {pending[name]}", flush=True)

    deadline = time.time() + 3600
    while pending and time.time() < deadline:
        for name in list(pending):
            job_id = pending[name]
            current = status(job_id)
            if current == "completed":
                download(job_id, LAYERED / f"{name}.layer2.png")
                print(f"{name}: downloaded layer_2", flush=True)
                del pending[name]
            elif current in {"failed", "error"}:
                raise RuntimeError(f"{name}: qwen job {current}")
        if pending:
            time.sleep(10)
    if pending:
        raise TimeoutError(f"timed out: {sorted(pending)}")

    report: list[dict[str, object]] = []
    for name in JOBS:
        layer_path = LAYERED / f"{name}.layer2.png"
        if name == "ui-kit":
            report.extend(process_kit(layer_path))
        else:
            report.append(process_asset(name, layer_path))
    (QA / "alpha-report.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # noqa: BLE001
        print(f"ERROR: {exc}", file=sys.stderr)
        raise
