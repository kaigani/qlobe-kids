#!/usr/bin/env python3
"""Separate accepted GPT Image 2 foreground props with local Qwen Layered."""

from __future__ import annotations

import argparse
import json
import time
import urllib.request
from pathlib import Path


GAME = Path(__file__).resolve().parents[1]
REPO = GAME.parents[1]
SOURCE = GAME / "assets" / "source" / "gpt-image-2"

PROPS = {
    "tub": (
        "foreground-tub-chroma.png",
        "Background layer: the bright magenta background only. Top layer: the exact complete "
        "coral-red handmade clay playdough tub, its cream rim, open lid, hinge, and dough mound "
        "together on transparent background. Preserve every color, texture, shape, position, "
        "and scale from the input. Do not crop, redraw, rearrange, add, remove, or add a shadow.",
    ),
    "roller": (
        "foreground-roller-chroma.png",
        "Background layer: the bright magenta background only. Top layer: the exact complete "
        "cream, orange, and teal handmade clay rolling pin on transparent background. Preserve "
        "every color, texture, shape, position, and scale from the input. Do not crop, redraw, "
        "rearrange, add, remove, or add a shadow.",
    ),
    "tile": (
        "foreground-tile-chroma.png",
        "Background layer: the bright magenta background only. Top layer: the exact complete "
        "blank cream, teal, and coral handmade clay letter tile on transparent background. "
        "Preserve every color, texture, shape, position, and scale from the input. Keep the face "
        "blank. Do not crop, redraw, rearrange, add, remove, add symbols, or add a shadow.",
    ),
}


def api_base() -> str:
    config = json.loads((REPO / "tools" / "state" / "local.json").read_text())
    value = str(config.get("qwenUrl", "")).rstrip("/")
    if not value:
        raise RuntimeError("tools/state/local.json does not configure qwenUrl")
    return value


def post_multipart(url: str, fields: dict[str, str], image: Path) -> bytes:
    boundary = "----qlobe-playdough-layered"
    body = bytearray()
    for name, value in fields.items():
        body += f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode()
    body += (
        f'--{boundary}\r\nContent-Disposition: form-data; name="image"; filename="{image.name}"\r\n'
        'Content-Type: image/png\r\n\r\n'
    ).encode()
    body += image.read_bytes() + b"\r\n"
    body += f"--{boundary}--\r\n".encode()
    request = urllib.request.Request(url, data=bytes(body), headers={
        "Content-Type": f"multipart/form-data; boundary={boundary}",
    })
    with urllib.request.urlopen(request, timeout=180) as response:
        return response.read()


def get(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=180) as response:
        return response.read()


def extract(base: str, source: Path, destination: Path, prompt: str, seed: int) -> None:
    submitted = json.loads(post_multipart(
        f"{base}/workflows/qwen-image-layered",
        {"prompt": prompt, "layers": "2", "seed": str(seed)},
        source,
    ))
    job_id = submitted.get("job_id") or submitted.get("id")
    if not job_id:
        raise RuntimeError(f"Qwen Layered returned no job id: {submitted}")
    deadline = time.time() + 30 * 60
    while time.time() < deadline:
        time.sleep(4)
        status = json.loads(get(f"{base}/jobs/{job_id}"))
        if status.get("status") == "completed":
            data = get(f"{base}/jobs/{job_id}/result?output=layer_2")
            if not data.startswith(b"\x89PNG\r\n\x1a\n"):
                raise RuntimeError("Qwen layer_2 result was not PNG")
            destination.write_bytes(data)
            return
        if status.get("status") in {"failed", "error", "cancelled", "canceled"}:
            raise RuntimeError(status.get("error") or f"Qwen job {status.get('status')}")
    raise TimeoutError(f"Qwen job {job_id} exceeded 30 minutes")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    base = api_base()
    for prop_id, (source_name, prompt) in PROPS.items():
        output = SOURCE / f"foreground-{prop_id}-layer2.png"
        if output.exists() and not args.force:
            print(f"skip {output.name}", flush=True)
            continue
        print(f"extract {prop_id} with Qwen Layered", flush=True)
        extract(base, SOURCE / source_name, output, prompt, args.seed)
        print(f"wrote {output.name} ({output.stat().st_size // 1024} KB)", flush=True)


if __name__ == "__main__":
    main()
