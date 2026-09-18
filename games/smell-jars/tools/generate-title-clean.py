#!/usr/bin/env python3
"""Rebuild the reviewed Smell Jars title with approved local Qwen workflows.

The script deliberately returns every regeneration to pending human review.
API coordinates come only from ``--api-url`` or ``QLOBE_QWEN_URL`` and are
never serialized into the recipe.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import io
import json
import os
import subprocess
import sys
import time
import uuid
from pathlib import Path
from urllib.request import Request, urlopen

from PIL import Image


GAME = Path(__file__).resolve().parents[1]
REPO = GAME.parents[1]
SOURCE = GAME / "assets/source/gpt-image-2/title-source.png"
OUT = GAME / "assets/source/local-api/title"
FINAL = OUT / "title-clean.final.png"
MAGENTA = OUT / "title-clean.qa-magenta.png"
RECIPE = OUT / "title-clean.recipe.json"

EDIT_PROMPT = (
    "Preserve this exact wooden hanging title plaque, exact words Smell Jars, "
    "exact rounded white lettering, exact wood grain, exact two tan ropes, "
    "proportions, lighting, and camera. Remove ONLY every thin red, yellow, "
    "magenta, or colored fringe, halo, speck, and stray mark around the outer "
    "silhouette. Give the plaque and ropes clean natural-color edges. No redesign, "
    "no added objects, no missing letters, no changed text. Place it centered on "
    "a perfectly uniform neutral charcoal gray background for clean extraction."
)
LAYER_PROMPT = (
    "Background layer: the entire uniform charcoal gray background only. Top "
    "layer: the complete wooden hanging Smell Jars plaque with both full ropes, "
    "exact lettering and clean natural edges. Preserve the edited source exactly, "
    "no redesign, no added or removed details; transparent outside the plaque "
    "and ropes."
)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def multipart(url: str, fields: dict[str, str], image_path: Path, timeout: int) -> bytes:
    boundary = f"----qlobe-smell-jars-title-{uuid.uuid4().hex}"
    body = bytearray()
    for key, value in fields.items():
        body += (
            f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"'
            f"\r\n\r\n{value}\r\n"
        ).encode()
    body += (
        f'--{boundary}\r\nContent-Disposition: form-data; name="image"; '
        f'filename="{image_path.name}"\r\nContent-Type: image/png\r\n\r\n'
    ).encode()
    body += image_path.read_bytes()
    body += f"\r\n--{boundary}--\r\n".encode()
    request = Request(
        url,
        data=bytes(body),
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    with urlopen(request, timeout=timeout) as response:
        return response.read()


def validate_image(data: bytes, label: str) -> None:
    try:
        image = Image.open(io.BytesIO(data))
        image.verify()
    except Exception as error:
        raise RuntimeError(f"{label} did not return a valid image") from error


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api-url", default=os.environ.get("QLOBE_QWEN_URL"))
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    if not args.api_url:
        parser.error("pass --api-url or set QLOBE_QWEN_URL")
    if not SOURCE.is_file():
        raise SystemExit(f"missing source: {SOURCE}")

    OUT.mkdir(parents=True, exist_ok=True)
    edit = OUT / f"title-clean-qwen-edit-seed{args.seed}.png"
    layer = OUT / f"title-clean-qwen-layer2-seed{args.seed}.png"
    base = args.api_url.rstrip("/")

    if args.force or not edit.is_file():
        data = multipart(
            f"{base}/workflows/qwen-image-edit?sync=true",
            {"prompt": EDIT_PROMPT, "seed": str(args.seed)},
            SOURCE,
            20 * 60,
        )
        validate_image(data, "qwen-image-edit")
        edit.write_bytes(data)

    if args.force or not layer.is_file():
        submitted = json.loads(multipart(
            f"{base}/workflows/qwen-image-layered",
            {"prompt": LAYER_PROMPT, "layers": "2", "seed": str(args.seed)},
            edit,
            5 * 60,
        ))
        job = submitted.get("job_id") or submitted.get("id")
        if not job:
            raise RuntimeError(f"qwen-image-layered returned no job id: {submitted}")
        for _ in range(450):
            with urlopen(f"{base}/jobs/{job}", timeout=60) as response:
                status = str(json.loads(response.read()).get("status", "")).lower()
            if status in {"completed", "complete", "success", "succeeded"}:
                break
            if status in {"failed", "error", "cancelled", "canceled"}:
                raise RuntimeError(f"qwen-image-layered failed: {status}")
            time.sleep(2)
        else:
            raise TimeoutError("qwen-image-layered timed out")
        with urlopen(f"{base}/jobs/{job}/result?output=layer_2", timeout=5 * 60) as response:
            data = response.read()
        validate_image(data, "qwen-image-layered layer_2")
        layer.write_bytes(data)

    result = subprocess.run(
        [
            sys.executable,
            str(REPO / "tools/pipeline/cutout_finalize.py"),
            "--input", str(layer),
            "--output", str(FINAL),
            "--magenta", str(MAGENTA),
            "--max-size", "1120",
            "--pad", "12",
            "--alpha-floor", "4",
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    outcome = json.loads(result.stdout.strip().splitlines()[-1])
    recipe = {
        "format": "qlobe-recipe",
        "formatVersion": 1,
        "id": "smell-jars-title-clean-edit-layered",
        "kind": "image",
        "asset": str(FINAL.relative_to(GAME)).replace("\\", "/"),
        "artDirection": "Toy",
        "source": str(SOURCE.relative_to(GAME)).replace("\\", "/"),
        "sourceSha256": sha256(SOURCE),
        "steps": [
            {
                "workflow": "qwen-image-edit",
                "seed": args.seed,
                "prompt": EDIT_PROMPT,
                "output": str(edit.relative_to(GAME)).replace("\\", "/"),
                "outputSha256": sha256(edit),
            },
            {
                "workflow": "qwen-image-layered",
                "seed": args.seed,
                "layers": 2,
                "selectedOutput": "layer_2",
                "prompt": LAYER_PROMPT,
                "output": str(layer.relative_to(GAME)).replace("\\", "/"),
                "outputSha256": sha256(layer),
            },
            {
                "op": "tools/pipeline/cutout_finalize.py",
                "maxSize": 1120,
                "pad": 12,
                "alphaFloor": 4,
                "outputSha256": sha256(FINAL),
            },
        ],
        "qa": {
            "status": "pending-human-review",
            "alpha": outcome.get("alpha", {}),
            "flags": outcome.get("flags", []),
            "magenta": str(MAGENTA.relative_to(GAME)).replace("\\", "/"),
            "review": "Regenerated output requires exact-text, fringe, and silhouette review.",
        },
        "createdAt": dt.datetime.now(dt.timezone.utc).isoformat(),
    }
    RECIPE.write_text(json.dumps(recipe, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(FINAL), "qa": recipe["qa"]}, indent=2))


if __name__ == "__main__":
    main()
