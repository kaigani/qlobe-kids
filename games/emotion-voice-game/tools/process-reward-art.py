#!/usr/bin/env python3
"""Layer, cut, normalize, and QA the Emotion Voice Game reward art.

GPT Image 2 masters stay immutable under ``assets/source/gpt-image-2``.  The
optional LAN pass asks Qwen Image Layered for a foreground layer, then accepts
that layer only when the repository cutter still finds the exact authored
asset count.  A failed or incomplete Layered pass is retained as rejected
evidence and the already-transparent GPT master remains the deterministic
fallback.

The local model host is injected with ``--api-url`` or ``QLOBE_QWEN_URL`` and
is never written to a receipt.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import mimetypes
import os
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from collections import deque
from pathlib import Path
from typing import Any

from PIL import Image, ImageChops, ImageFilter


GAME = Path(__file__).resolve().parents[1]
ROOT = GAME.parents[1]
ASSETS = GAME / "assets"
SOURCE = ASSETS / "source"
GPT = SOURCE / "gpt-image-2"
LOCAL = SOURCE / "local-api" / "qwen-layered"
CUTS = SOURCE / "cuts"
PROCESSED = SOURCE / "processed-alpha" / "theater-magic"
QA = SOURCE / "qa" / "theater-magic"
FINALIZER = ROOT / "tools" / "pipeline" / "cutout_finalize.py"
CUTTER = ROOT / "tools" / "cut-asset-sheet.py"


SHEETS: dict[str, dict[str, Any]] = {
    "reward-props": {
        "master": GPT / "reward-props-sheet-master.png",
        "layered": LOCAL / "reward-props-layer2.png",
        "names": [
            "happy-star-left",
            "happy-streamer-green-left",
            "happy-streamer-gold",
            "happy-streamer-green-right",
            "happy-star-right",
            "proud-medal",
            "calm-mobile",
            "silly-hat",
        ],
        "prompt": (
            "Background layer: transparent empty background. Top layer: preserve every "
            "complete handcrafted felt celebration prop exactly as supplied, including "
            "all fibers, stitches, spacing, colors, and silhouettes. Do not redraw, merge, "
            "move, crop, recolor, relight, add, or remove any prop."
        ),
        "final_dir": ASSETS / "rewards",
        "max_size": 520,
        "cutter_padding": 4,
    },
    "theater-tools": {
        "master": GPT / "theater-tools-sheet-master.png",
        "layered": LOCAL / "theater-tools-layer2.png",
        "names": ["replay", "costume-trunk"],
        "prompt": (
            "Background layer: transparent empty background. Top layer: preserve the "
            "complete round felt ear button and the complete open felt costume trunk "
            "exactly as supplied, including fibers, stitching, contents, colors, spacing, "
            "and silhouettes. Do not redraw, merge, move, crop, recolor, add, or remove."
        ),
        "final_dir": ASSETS / "ui",
        "max_size": 560,
        "cutter_padding": 18,
    },
}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def atomic_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", "utf-8")
    os.replace(temporary, path)


def multipart(
    fields: dict[str, Any], files: dict[str, tuple[str, bytes, str]]
) -> tuple[bytes, str]:
    boundary = "----qlobe-emotion-" + uuid.uuid4().hex
    chunks: list[bytes] = []
    for key, value in fields.items():
        chunks.append(
            (
                f"--{boundary}\r\n"
                f'Content-Disposition: form-data; name="{key}"\r\n\r\n'
                f"{value}\r\n"
            ).encode("utf-8")
        )
    for key, (name, data, content_type) in files.items():
        chunks.extend(
            [
                (
                    f"--{boundary}\r\n"
                    f'Content-Disposition: form-data; name="{key}"; filename="{name}"\r\n'
                    f"Content-Type: {content_type}\r\n\r\n"
                ).encode("utf-8"),
                data,
                b"\r\n",
            ]
        )
    chunks.append(f"--{boundary}--\r\n".encode("utf-8"))
    return b"".join(chunks), f"multipart/form-data; boundary={boundary}"


def request_json(url: str, *, data: bytes | None = None, content_type: str = "") -> dict[str, Any]:
    headers = {"Content-Type": content_type} if content_type else {}
    request = urllib.request.Request(url, data=data, headers=headers)
    with urllib.request.urlopen(request, timeout=300) as response:
        payload = json.loads(response.read())
    if not isinstance(payload, dict):
        raise RuntimeError("LAN API returned a non-object response")
    return payload


def run_layered(base: str, key: str, spec: dict[str, Any], *, force: bool) -> dict[str, Any]:
    source = Path(spec["master"])
    destination = Path(spec["layered"])
    recipe_path = destination.with_suffix(".recipe.json")
    if destination.is_file() and recipe_path.is_file() and not force:
        return json.loads(recipe_path.read_text("utf-8"))

    fields = {
        "prompt": spec["prompt"],
        "layers": 2,
        "seed": 42,
        "steps": 20,
        "cfg": 2.5,
    }
    body, content_type = multipart(
        fields,
        {
            "image": (
                source.name,
                source.read_bytes(),
                mimetypes.guess_type(source.name)[0] or "image/png",
            )
        },
    )
    submission = request_json(
        f"{base.rstrip('/')}/workflows/qwen-image-layered",
        data=body,
        content_type=content_type,
    )
    job_id = str(submission.get("job_id") or submission.get("id") or "")
    if not job_id:
        raise RuntimeError("Qwen Image Layered did not return a job id")

    status: dict[str, Any] = {}
    for _ in range(450):
        status = request_json(
            f"{base.rstrip('/')}/jobs/{urllib.parse.quote(job_id)}"
        )
        state = status.get("status")
        if state == "completed":
            break
        if state in {"failed", "error", "cancelled", "canceled"}:
            raise RuntimeError(f"Qwen Image Layered job ended in {state}")
        time.sleep(4)
    else:
        raise TimeoutError("Qwen Image Layered exceeded the 30 minute limit")

    result_url = (
        f"{base.rstrip('/')}/jobs/{urllib.parse.quote(job_id)}/result?output=layer_2"
    )
    with urllib.request.urlopen(result_url, timeout=300) as response:
        result = response.read()
    if not result.startswith(b"\x89PNG"):
        raise RuntimeError("Qwen Image Layered layer_2 was not a PNG")
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(".png.tmp")
    temporary.write_bytes(result)
    os.replace(temporary, destination)

    recipe = {
        "format": "qlobe-recipe",
        "formatVersion": 1,
        "id": f"emotion-voice-{key}-layered",
        "workflow": "qwen-image-layered",
        "prompt": spec["prompt"],
        "seed": 42,
        "source": source.relative_to(GAME).as_posix(),
        "sourceSha256": sha256(source),
        "output": destination.relative_to(GAME).as_posix(),
        "outputSha256": sha256(destination),
        "result": {"status": status.get("status"), "jobIdRecorded": True},
    }
    atomic_json(recipe_path, recipe)
    return recipe


def cutter_command(
    source: Path, key: str, spec: dict[str, Any], *, force: bool, probe: bool = False
) -> subprocess.CompletedProcess[str]:
    out_dir = CUTS / (f"{key}-probe" if probe else key)
    command = [
        sys.executable,
        str(CUTTER),
        str(source),
        str(out_dir),
        "--names",
        *spec["names"],
        "--expected-count",
        str(len(spec["names"])),
        "--padding",
        str(spec["cutter_padding"]),
    ]
    if probe:
        # The exact-count gate only needs cutter metadata. Keep rejected Qwen
        # evidence, but do not duplicate its crops or diagnostic masks.
        command.append("--dry-run")
    else:
        command.extend(["--debug-mask", str(CUTS / f"{key}-mask.png")])
    if force:
        command.append("--force")
    return subprocess.run(command, text=True, capture_output=True)


def choose_source(key: str, spec: dict[str, Any], *, force: bool) -> tuple[Path, dict[str, Any]]:
    master = Path(spec["master"])
    layered = Path(spec["layered"])
    if layered.is_file():
        probe = cutter_command(layered, key, spec, force=True, probe=True)
        if probe.returncode == 0:
            return layered, {"layeredDecision": "accepted", "probe": json.loads(probe.stdout)}
        return master, {
            "layeredDecision": "rejected-exact-count-gate",
            "layeredError": (probe.stderr or probe.stdout).strip(),
        }
    return master, {"layeredDecision": "not-run"}


def keep_largest_component(image: Image.Image, threshold: int = 8) -> Image.Image:
    """Remove neighboring cutter fragments without redrawing the chosen sprite."""
    alpha = image.getchannel("A")
    width, height = image.size
    values = alpha.get_flattened_data() if hasattr(alpha, "get_flattened_data") else alpha.getdata()
    solid = bytearray(1 if value > threshold else 0 for value in values)
    seen = bytearray(width * height)
    largest: list[int] = []
    for start, present in enumerate(solid):
        if not present or seen[start]:
            continue
        component: list[int] = []
        queue = deque([start])
        seen[start] = 1
        while queue:
            index = queue.pop()
            component.append(index)
            x, y = index % width, index // width
            neighbors = (
                index - 1 if x else -1,
                index + 1 if x + 1 < width else -1,
                index - width if y else -1,
                index + width if y + 1 < height else -1,
            )
            for neighbor in neighbors:
                if neighbor >= 0 and solid[neighbor] and not seen[neighbor]:
                    seen[neighbor] = 1
                    queue.append(neighbor)
        if len(component) > len(largest):
            largest = component
    if not largest:
        raise RuntimeError("cutter crop contains no foreground component")
    keep = Image.new("L", image.size, 0)
    keep_data = bytearray(width * height)
    for index in largest:
        keep_data[index] = 255
    keep.frombytes(bytes(keep_data))
    keep = keep.filter(ImageFilter.MaxFilter(3))
    cleaned = image.copy()
    cleaned.putalpha(ImageChops.multiply(alpha, keep))
    return cleaned


def finalize_one(crop: Path, name: str, spec: dict[str, Any]) -> dict[str, Any]:
    # GPT Image 2's transparent output uses 251-254 for much of the visually
    # solid subject.  Promote only that high-confidence core to 255 while
    # preserving the lower-valued antialiased fringe.  Qwen can also leave a
    # 1-4 alpha film across the empty field, so clear that documented floor.
    prepared = PROCESSED / f"{name}-alpha-normalized.png"
    processed = PROCESSED / f"{name}.png"
    magenta = QA / f"{name}-magenta.png"
    processed.parent.mkdir(parents=True, exist_ok=True)
    magenta.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(crop) as opened:
        normalized = keep_largest_component(opened.convert("RGBA"))
        alpha = normalized.getchannel("A").point(
            lambda value: 0 if value <= 4 else 255 if value >= 240 else value
        )
        normalized.putalpha(alpha)
        normalized.save(prepared, "PNG", optimize=True)
    command = [
        sys.executable,
        str(FINALIZER),
        "--input",
        str(prepared),
        "--output",
        str(processed),
        "--magenta",
        str(magenta),
        "--max-size",
        str(spec["max_size"]),
        "--pad",
        "12",
        "--alpha-floor",
        "4",
    ]
    result = subprocess.run(command, text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError(result.stderr or result.stdout or f"failed to finalize {name}")
    finalizer = json.loads(result.stdout)

    final_dir = Path(spec["final_dir"])
    final_dir.mkdir(parents=True, exist_ok=True)
    runtime = final_dir / f"{name}.webp"
    with Image.open(processed) as opened:
        image = opened.convert("RGBA")
        image.save(runtime, "WEBP", quality=90, alpha_quality=100, method=6)
        corners = [
            image.getpixel((0, 0))[3],
            image.getpixel((image.width - 1, 0))[3],
            image.getpixel((0, image.height - 1))[3],
            image.getpixel((image.width - 1, image.height - 1))[3],
        ]
        dimensions = [image.width, image.height]
    if any(corners):
        raise RuntimeError(f"{name} has nontransparent output corners: {corners}")
    return {
        "name": name,
        "crop": crop.relative_to(GAME).as_posix(),
        "alphaNormalized": prepared.relative_to(GAME).as_posix(),
        "processed": processed.relative_to(GAME).as_posix(),
        "runtime": runtime.relative_to(GAME).as_posix(),
        "dimensions": dimensions,
        "bytes": runtime.stat().st_size,
        "sha256": sha256(runtime),
        "cornerAlpha": corners,
        "qaMagenta": magenta.relative_to(GAME).as_posix(),
        "finalizer": finalizer,
    }


def process_sheet(key: str, spec: dict[str, Any], *, force: bool) -> dict[str, Any]:
    accepted, decision = choose_source(key, spec, force=force)
    cut = cutter_command(accepted, key, spec, force=force)
    if cut.returncode:
        raise RuntimeError(cut.stderr or cut.stdout or f"cutter failed for {key}")
    manifest = json.loads(cut.stdout)
    cut_dir = CUTS / key
    finals = [
        finalize_one(cut_dir / f"{name}.png", name, spec)
        for name in spec["names"]
    ]
    return {
        "sheet": key,
        "acceptedSource": accepted.relative_to(GAME).as_posix(),
        "acceptedSourceSha256": sha256(accepted),
        **decision,
        "cutter": manifest,
        "finals": finals,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api-url", default=os.environ.get("QLOBE_QWEN_URL", ""))
    parser.add_argument("--skip-layered", action="store_true")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--only", nargs="+", choices=tuple(SHEETS))
    args = parser.parse_args()
    keys = args.only or list(SHEETS)
    for key in keys:
        if not Path(SHEETS[key]["master"]).is_file():
            raise SystemExit(f"missing GPT Image 2 master: {SHEETS[key]['master']}")

    receipts: list[dict[str, Any]] = []
    if not args.skip_layered:
        if not args.api_url:
            raise SystemExit("set --api-url or QLOBE_QWEN_URL, or pass --skip-layered")
        for key in keys:
            try:
                receipts.append(
                    {"sheet": key, "layered": run_layered(args.api_url, key, SHEETS[key], force=args.force)}
                )
            except (OSError, RuntimeError, TimeoutError, urllib.error.URLError) as error:
                receipts.append({"sheet": key, "layeredError": str(error)})

    for key in keys:
        receipts.append(process_sheet(key, SHEETS[key], force=args.force))

    receipt = {
        "format": "qlobe-emotion-voice-art-receipt",
        "formatVersion": 1,
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "pipeline": [
            "gpt-image-2 masters",
            "qwen-image-layered layer_2 with exact-count acceptance gate",
            "tools/cut-asset-sheet.py",
            "tools/pipeline/cutout_finalize.py",
            "deterministic WebP encode",
        ],
        "results": receipts,
    }
    atomic_json(SOURCE / "theater-magic-processing.json", receipt)
    print(json.dumps(receipt, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
