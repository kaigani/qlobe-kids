#!/usr/bin/env python3
"""Extract the accepted GPT Image 2 contact sheets with local Qwen Layered."""

from __future__ import annotations

import argparse
import json
import time
import urllib.request
from pathlib import Path

GAME = Path(__file__).resolve().parents[1]
REPO = GAME.parents[1]
SOURCE = GAME / "assets" / "source"
PRODUCTION = GAME / "assets" / "production"

JOBS = [
    (
        "bodies-gpt-image-2-magenta.png",
        "bodies-layer2.png",
        "Background layer: the perfectly flat bright magenta background only. "
        "Top layer: the exact three complete handmade clay creature bodies from the image—"
        "orange dinosaur, green monster, and cream unicorn—together on transparent background. "
        "Keep every body, color, texture, shape, position, and scale identical to the input. "
        "Do not crop, rearrange, redraw, add eyes, add decorations, or add shadows.",
    ),
    (
        "parts-gpt-image-2-chroma.png",
        "parts-layer2.png",
        "Background layer: the perfectly flat bright green background only. "
        "Top layer: all twelve exact handmade clay creature decorations from the 4 by 3 contact "
        "sheet together on transparent background. Keep every object, group, color, texture, "
        "shape, grid position, and scale identical to the input. Preserve the black eye pupils "
        "and the teal wing color. Do not crop, rearrange, redraw, merge, add, or remove objects.",
    ),
    (
        "bodies-extra-gpt-image-2-magenta.png",
        "bodies-extra-layer2.png",
        "Background layer: the perfectly flat bright magenta background only. "
        "Top layer: the exact three complete blank handmade clay creature bodies from the "
        "image—blue blob, yellow bird, and lavender dragon—together on transparent background. "
        "Keep every body, color, texture, shape, position, and scale identical to the input. "
        "Do not crop, rearrange, redraw, add eyes, add decorations, or add shadows.",
    ),
    (
        "parts-limbs-gpt-image-2-chroma.png",
        "parts-limbs-layer2.png",
        "Background layer: the perfectly flat bright green background only. Top layer: all "
        "eight exact handmade clay limb pieces from the 4 by 2 contact sheet together on "
        "transparent background. Keep every piece, color, texture, shape, orientation, grid "
        "position, and scale identical. Do not crop, rearrange, redraw, merge, add, or remove.",
    ),
    (
        "parts-dress-gpt-image-2-chroma.png",
        "parts-dress-layer2.png",
        "Background layer: the perfectly flat bright green background only. Top layer: all "
        "eight exact handmade clay dress-up pieces from the 4 by 2 contact sheet together on "
        "transparent background. Keep every piece, color, texture, shape, grid position, and "
        "scale identical. Do not crop, rearrange, redraw, merge, add, or remove.",
    ),
    (
        "trash-gpt-image-2-chroma.png",
        "trash-layer2.png",
        "Background layer: the perfectly flat bright green background only. Top layer: the "
        "exact complete brown, cream, and coral handmade clay trash bin on transparent "
        "background. Keep its color, texture, dark opening, shape, position, and scale "
        "identical. Do not crop, redraw, add, remove, or add a shadow.",
    ),
    *[
        (
            source,
            output,
            "Background layer: the perfectly flat bright magenta background only. Top layer: "
            f"all {count} exact handmade clay pieces from the {grid} contact sheet together on "
            "transparent background. Keep every piece, color, texture, silhouette, orientation, "
            "grid position, and scale identical to the input. Do not crop, rearrange, redraw, "
            "merge, add, or remove any piece.",
        )
        for source, output, count, grid in [
            ("parts-eyes-v2-gpt-image-2-magenta.png", "parts-eyes-v2-layer2.png", 8, "4 by 2"),
            ("parts-top-v2-gpt-image-2-magenta.png", "parts-top-v2-layer2.png", 8, "4 by 2"),
            ("parts-wings-v2-gpt-image-2-magenta.png", "parts-wings-v2-layer2.png", 8, "4 by 2"),
            ("parts-decor-v2-gpt-image-2-magenta.png", "parts-decor-v2-layer2.png", 8, "4 by 2"),
            ("blob-balls-gpt-image-2-magenta.png", "blob-balls-layer2.png", 12, "4 by 3"),
        ]
    ],
    *[
        (
            f"mouth-{name}-visemes-gpt-image-2-chroma.png",
            f"mouth-{name}-visemes-layer2.png",
            "Background layer: the perfectly flat bright green background only. Top layer: all "
            "nine exact mouth viseme sprites from the 3 by 3 contact sheet together on transparent "
            "background. Keep the exact mouth shapes, colors, texture, lighting, scale, and grid "
            "positions identical. Preserve dark mouth interiors, pupils if any, cream teeth, and "
            "tongues. Do not crop, rearrange, redraw, merge, add, or remove anything.",
        )
        for name in ["goofy", "sparkle", "robot", "bubbly", "fangs", "smirk", "hero", "beak"]
    ],
]


def api_base() -> str:
    config = json.loads((REPO / "tools" / "state" / "local.json").read_text())
    value = str(config.get("qwenUrl", "")).rstrip("/")
    if not value:
        raise RuntimeError("tools/state/local.json does not configure qwenUrl")
    return value


def post_multipart(url: str, fields: dict[str, str], image: Path) -> bytes:
    boundary = "----qlobe-clay-layered"
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
    PRODUCTION.mkdir(parents=True, exist_ok=True)
    for source_name, output_name, prompt in JOBS:
        output = PRODUCTION / output_name
        if output.exists() and not args.force:
            print(f"skip {output.name}", flush=True)
            continue
        print(f"extract {source_name} with Qwen Layered", flush=True)
        extract(base, SOURCE / source_name, output, prompt, args.seed)
        print(f"wrote {output.name} ({output.stat().st_size // 1024} KB)", flush=True)


if __name__ == "__main__":
    main()
