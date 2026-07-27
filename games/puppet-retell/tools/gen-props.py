#!/usr/bin/env python3
"""Generate Puppet Retell costume props through Krea 2 + Qwen Layered.

Raw candidates and magenta alpha-QC sheets stay in assets/source/local-api/.
Runtime PNGs are tightly cropped, normalized to a 384px canvas, and written
to assets/props/. The model host is supplied only through QLOBE_QWEN_URL.
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.request
from pathlib import Path

from PIL import Image

GAME = Path(__file__).resolve().parents[1]
SOURCE = GAME / "assets" / "source" / "local-api"
OUTPUT = GAME / "assets" / "props"
SEED = 42
PROPS = {
    "crown": "small golden toy crown with five rounded points and aqua jewels, straight-on view",
    "explorer-hat": "small honey-yellow child explorer hat with teal ribbon, straight-on view",
    "magic-wand": "short toy magic wand, teal handle and round golden star tip, diagonal from lower left to upper right",
    "story-basket": "small woven story basket with rounded handle, warm honey wicker and teal cloth lining, straight-on view",
}
STYLE = (
    "Polished 2D preschool game prop, soft painted texture, chunky rounded shape, "
    "crisp deep-navy outline, warm honey yellow and teal palette, friendly handmade "
    "puppet-workshop style, centered and fully visible, no text, no letters, no "
    "character, no hands, no UI, no shadow. Perfectly flat solid dark charcoal background."
)


def api(path: str) -> str:
    base = os.environ.get("QLOBE_QWEN_URL", "").rstrip("/")
    if not base:
        raise SystemExit("QLOBE_QWEN_URL is not set")
    return f"{base}{path}"


def post(url: str, fields: dict[str, str], files: dict[str, Path] | None = None) -> bytes:
    boundary = "----qlobe" + os.urandom(8).hex()
    body = bytearray()
    for name, value in fields.items():
        body += f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n".encode()
    for name, path in (files or {}).items():
        body += (
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"; "
            f"filename=\"{path.name}\"\r\nContent-Type: application/octet-stream\r\n\r\n"
        ).encode()
        body += path.read_bytes() + b"\r\n"
    body += f"--{boundary}--\r\n".encode()
    request = urllib.request.Request(
        url, data=bytes(body), headers={"Content-Type": f"multipart/form-data; boundary={boundary}"}
    )
    with urllib.request.urlopen(request, timeout=900) as response:
        return response.read()


def get(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=900) as response:
        return response.read()


def layered_cutout(raw: Path, destination: Path, subject: str) -> None:
    result = json.loads(post(
        api("/workflows/qwen-image-layered"),
        {
            "prompt": f"Background layer: solid bright green. Top layer: the exact same {subject}. Keep its shape and colors identical.",
            "layers": "2",
            "seed": str(SEED),
        },
        {"image": raw},
    ))
    job_id = result.get("job_id")
    if not job_id:
        raise RuntimeError(f"Qwen Layered returned no job_id: {result}")
    for _ in range(150):
        time.sleep(4)
        status = json.loads(get(api(f"/jobs/{job_id}")))
        if status.get("status") == "completed":
            destination.write_bytes(get(api(f"/jobs/{job_id}/result?output=layer_2")))
            return
        if status.get("status") in {"failed", "error"}:
            raise RuntimeError(status.get("error") or f"layer job {status.get('status')}")
    raise TimeoutError(f"layer job {job_id} timed out")


def finalize(source: Path, destination: Path, qc_path: Path) -> None:
    image = Image.open(source).convert("RGBA")
    alpha = image.getchannel("A").point(lambda value: 0 if value < 10 else value)
    image.putalpha(alpha)
    bbox = alpha.point(lambda value: 255 if value >= 16 else 0).getbbox()
    if not bbox:
        raise RuntimeError(f"{source.name} has no useful alpha")
    left, top, right, bottom = bbox
    pad = 18
    image = image.crop((
        max(0, left - pad), max(0, top - pad),
        min(image.width, right + pad), min(image.height, bottom + pad),
    ))
    scale = min(344 / image.width, 344 / image.height)
    image = image.resize((max(1, round(image.width * scale)), max(1, round(image.height * scale))), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (384, 384), (0, 0, 0, 0))
    canvas.alpha_composite(image, ((384 - image.width) // 2, (384 - image.height) // 2))
    canvas.save(destination, "PNG", optimize=True)
    magenta = Image.new("RGBA", canvas.size, (255, 0, 255, 255))
    magenta.alpha_composite(canvas)
    magenta.convert("RGB").save(qc_path, "JPEG", quality=90, optimize=True)
    extrema = canvas.getchannel("A").getextrema()
    print(f"{destination.name}: {canvas.size[0]}x{canvas.size[1]} alpha={extrema} {destination.stat().st_size // 1024}KB")


def main() -> None:
    SOURCE.mkdir(parents=True, exist_ok=True)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for name, subject in PROPS.items():
        raw = SOURCE / f"{name}-krea-seed{SEED}.png"
        layered = SOURCE / f"{name}-layered-seed{SEED}.png"
        qc = SOURCE / f"{name}-alpha-qc.jpg"
        final = OUTPUT / f"{name}.png"
        if not raw.exists():
            print(f"{name}: Krea 2")
            raw.write_bytes(post(
                api("/workflows/krea2-turbo-t2i?sync=true"),
                {"prompt": f"{subject}. {STYLE}", "width": "1024", "height": "1024", "seed": str(SEED)},
            ))
        if not layered.exists():
            print(f"{name}: Qwen Layered")
            layered_cutout(raw, layered, subject)
        finalize(layered, final, qc)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"generation failed: {error}", file=sys.stderr)
        raise
