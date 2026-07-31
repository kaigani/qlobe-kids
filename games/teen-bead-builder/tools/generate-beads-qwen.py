#!/usr/bin/env python3
"""Derive a matched clay-bead color set through Qwen edit + layered extraction.

The accepted coral bead is the identity reference for every color. Raw edits,
true-alpha layered results, magenta QA composites, and prompts are retained in
assets/source/qwen-beads/. Shipping WebPs share one 240px canvas and one 220px
subject diameter, so runtime CSS never needs to enlarge an atlas crop.
"""

from __future__ import annotations

import argparse
import io
import json
import os
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

from PIL import Image

GAME = Path(__file__).resolve().parents[1]
REPO = GAME.parents[1]
ASSETS = GAME / "assets"
RUNTIME = ASSETS / "manipulatives"
SOURCE = ASSETS / "source" / "qwen-beads"
EDIT_DIR = SOURCE / "edit"
LAYER_DIR = SOURCE / "layered"
CUTOUT_DIR = SOURCE / "cutout"
QA_DIR = SOURCE / "qa"
REFERENCE = SOURCE / "coral-reference-charcoal.png"
MANIFEST = SOURCE / "prompts.json"

COLORS = {
    "gold": "warm golden-yellow",
    "coral": "vivid coral-red",
    "teal": "rich turquoise-teal",
    "green": "fresh olive-green",
    "blue": "medium cornflower-blue",
    "cream": "warm pale cream-beige",
}

# Qwen Layered can leave a uniform low-alpha full-frame film on saturated
# teal/green subjects. Their accepted seed-1337 layers cluster at alpha 29-37
# while the bead core is 254-255, so 64 cleanly separates background from art.
ALPHA_FLOORS = {"teal": 64, "green": 64}
EDIT_SEEDS = {color: 42 for color in COLORS} | {"cream": 1337}
LAYER_SEEDS = {color: 42 for color in COLORS} | {"teal": 1337, "green": 1337, "cream": 1337}


def api_base() -> str:
    base = os.environ.get("QLOBE_QWEN_URL", "").rstrip("/")
    if not base:
        local = REPO / "tools" / "state" / "local.json"
        if local.exists():
            base = str(json.loads(local.read_text()).get("qwenUrl", "")).rstrip("/")
    if not base:
        raise SystemExit("QLOBE_QWEN_URL is not configured")
    return base


def post_multipart(url: str, fields: dict[str, str], files: dict[str, Path]) -> bytes:
    boundary = "----teenbead" + os.urandom(8).hex()
    body = io.BytesIO()
    for name, value in fields.items():
        body.write(f"--{boundary}\r\n".encode())
        body.write(f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode())
        body.write(f"{value}\r\n".encode())
    for name, path in files.items():
        body.write(f"--{boundary}\r\n".encode())
        body.write(
            f'Content-Disposition: form-data; name="{name}"; filename="{path.name}"\r\n'.encode()
        )
        body.write(b"Content-Type: application/octet-stream\r\n\r\n")
        body.write(path.read_bytes())
        body.write(b"\r\n")
    body.write(f"--{boundary}--\r\n".encode())
    request = urllib.request.Request(
        url,
        data=body.getvalue(),
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    with urllib.request.urlopen(request, timeout=900) as response:
        return response.read()


def get(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=900) as response:
        return response.read()


def make_reference() -> None:
    source = Image.open(RUNTIME / "bead-coral.webp").convert("RGBA")
    alpha = source.getchannel("A")
    bbox = alpha.point(lambda value: 255 if value >= 8 else 0).getbbox()
    if not bbox:
        raise SystemExit("coral reference has no visible alpha")
    source = source.crop(bbox)
    scale = 520 / max(source.size)
    source = source.resize(
        (round(source.width * scale), round(source.height * scale)), Image.Resampling.LANCZOS
    )
    canvas = Image.new("RGBA", (1024, 1024), (37, 39, 42, 255))
    canvas.alpha_composite(source, ((1024 - source.width) // 2, (1024 - source.height) // 2))
    canvas.convert("RGB").save(REFERENCE, "PNG", optimize=True)


def edit_prompt(color: str) -> str:
    return (
        "Use case: precise-object-edit. Asset type: clay bead game sprite source. "
        f"Change only the clay color of the single bead to {COLORS[color]}. "
        "Keep the exact same hand-formed donut-bead shape, outer silhouette, round center hole, "
        "camera angle, scale, lighting, fingerprints, small dents, and stop-motion clay texture as "
        "the reference. Keep one complete bead centered with generous uninterrupted dark-charcoal "
        "margin on all four sides. The entire outer edge must remain visible and must not touch or "
        "cross the image boundary. Preserve the perfectly flat uniform dark-charcoal background. "
        "The clay color is uniform: no dots, speckles, seeds, inclusions, painted marks, or food-like "
        "decoration. No crop, no sliced or flat edge, no extra object, no text, no UI, no plastic, "
        "no vector art."
    )


def layered_prompt(color: str) -> str:
    return (
        "Background layer: the plain dark-charcoal background only.\n"
        f"Top layer: the exact single complete {COLORS[color]} hand-formed clay donut bead from the "
        "image on a transparent background, including its full outer silhouette and center hole. "
        "Keep the bead identical to the input. Do not crop, redraw, add a rim, or add a shadow."
    )


def run_edit(base: str, color: str, seed: int, force: bool) -> Path:
    output = EDIT_DIR / f"bead-{color}.png"
    if output.exists() and output.stat().st_size > 5000 and not force:
        return output
    print(f"edit {color}", flush=True)
    output.write_bytes(
        post_multipart(
            f"{base}/workflows/qwen-image-edit?sync=true",
            {"prompt": edit_prompt(color), "seed": str(seed)},
            {"image": REFERENCE},
        )
    )
    Image.open(output).verify()
    return output


def run_layered(base: str, color: str, source: Path, seed: int, force: bool) -> Path:
    output = LAYER_DIR / f"bead-{color}.layer2.png"
    if output.exists() and output.stat().st_size > 5000 and not force:
        return output
    print(f"layer {color}", flush=True)
    response = post_multipart(
        f"{base}/workflows/qwen-image-layered",
        {"prompt": layered_prompt(color), "layers": "2", "seed": str(seed)},
        {"image": source},
    )
    job = json.loads(response).get("job_id")
    if not job:
        raise RuntimeError(f"layered workflow returned no job id for {color}: {response[:300]!r}")
    for _ in range(180):
        time.sleep(5)
        status = json.loads(get(f"{base}/jobs/{job}"))
        if status.get("status") == "completed":
            output.write_bytes(get(f"{base}/jobs/{job}/result?output=layer_2"))
            Image.open(output).verify()
            return output
        if status.get("status") in {"failed", "error"}:
            raise RuntimeError(f"layered workflow failed for {color}: {status.get('error')}")
    raise TimeoutError(f"layered workflow timed out for {color}")


def finalize(color: str, layer: Path) -> dict:
    cutout = CUTOUT_DIR / f"bead-{color}.png"
    magenta = QA_DIR / f"bead-{color}-magenta.png"
    result = subprocess.run(
        [
            sys.executable,
            str(REPO / "tools" / "pipeline" / "cutout_finalize.py"),
            "--input", str(layer),
            "--output", str(cutout),
            "--magenta", str(magenta),
            "--max-size", "512",
            "--pad", "12",
            "--alpha-floor", str(ALPHA_FLOORS.get(color, 4)),
        ],
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode:
        raise RuntimeError(f"cutout QA failed for {color}: {result.stdout or result.stderr}")
    qa = json.loads(result.stdout)

    image = Image.open(cutout).convert("RGBA")
    alpha = image.getchannel("A").point(lambda value: 255 if value >= 8 else 0)
    bbox = alpha.getbbox()
    if not bbox:
        raise RuntimeError(f"empty finalized cutout for {color}")
    image = image.crop(bbox)
    scale = 220 / max(image.size)
    image = image.resize(
        (round(image.width * scale), round(image.height * scale)), Image.Resampling.LANCZOS
    )
    canvas = Image.new("RGBA", (240, 240), (0, 0, 0, 0))
    canvas.alpha_composite(image, ((240 - image.width) // 2, (240 - image.height) // 2))
    canvas.save(RUNTIME / f"bead-{color}.webp", "WEBP", lossless=True, method=6)
    qa["runtimeCanvas"] = [240, 240]
    qa["runtimeSubject"] = list(image.size)
    return qa


def contact_sheet(paths: list[Path], output: Path, background: tuple[int, int, int]) -> None:
    sheet = Image.new("RGB", (1080, 720), background)
    for index, path in enumerate(paths):
        image = Image.open(path).convert("RGB")
        scale = min(360 / image.width, 360 / image.height)
        image = image.resize(
            (round(image.width * scale), round(image.height * scale)), Image.Resampling.LANCZOS
        )
        x = (index % 3) * 360 + (360 - image.width) // 2
        y = (index // 3) * 360 + (360 - image.height) // 2
        sheet.paste(image, (x, y))
    sheet.save(output, "PNG", optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    for directory in (SOURCE, EDIT_DIR, LAYER_DIR, CUTOUT_DIR, QA_DIR):
        directory.mkdir(parents=True, exist_ok=True)
    make_reference()
    base = api_base()

    edits = {color: run_edit(base, color, EDIT_SEEDS[color], args.force) for color in COLORS}
    layers = {
        color: run_layered(base, color, edits[color], LAYER_SEEDS[color], args.force)
        for color in COLORS
    }
    qa = {color: finalize(color, layers[color]) for color in COLORS}
    contact_sheet(
        [EDIT_DIR / f"bead-{color}.png" for color in COLORS],
        QA_DIR / "edit-contact.png",
        (37, 39, 42),
    )
    contact_sheet(
        [QA_DIR / f"bead-{color}-magenta.png" for color in COLORS],
        QA_DIR / "layered-contact.png",
        (255, 0, 255),
    )
    MANIFEST.write_text(json.dumps({
        "workflow": "qwen-image-edit -> qwen-image-layered -> cutout_finalize",
        "reference": str(REFERENCE.relative_to(GAME)),
        "colors": {
            color: {
                "editSeed": EDIT_SEEDS[color],
                "layeredSeed": LAYER_SEEDS[color],
                "editPrompt": edit_prompt(color),
                "layeredPrompt": layered_prompt(color),
                "qa": qa[color],
            }
            for color in COLORS
        },
    }, indent=2) + "\n")
    print(json.dumps(qa, indent=2))


if __name__ == "__main__":
    main()
