#!/usr/bin/env python3
"""Extract the accepted title with Qwen Image Layered (true alpha layer_2)."""

from __future__ import annotations

import argparse
import io
import json
import os
import time
import urllib.request
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "source"


def post_multipart(url: str, fields: dict[str, str], image: Path) -> bytes:
    boundary = "----qlobe-tangram-title"
    body = bytearray()
    for name, value in fields.items():
        body += (f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n').encode()
    body += (
        f'--{boundary}\r\nContent-Disposition: form-data; name="image"; '
        f'filename="{image.name}"\r\nContent-Type: image/png\r\n\r\n'
    ).encode()
    body += image.read_bytes() + b"\r\n"
    body += f"--{boundary}--\r\n".encode()
    request = urllib.request.Request(url, data=bytes(body), headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
    with urllib.request.urlopen(request, timeout=240) as response:
        return response.read()


def get(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=300) as response:
        return response.read()


def validate_layer(data: bytes) -> dict[str, object]:
    image = Image.open(io.BytesIO(data))
    if image.format != "PNG" or "A" not in image.getbands():
        raise RuntimeError("Qwen layer_2 did not return an alpha PNG")
    alpha = image.getchannel("A")
    corners = [alpha.getpixel(point) for point in (
        (0, 0), (image.width - 1, 0), (0, image.height - 1), (image.width - 1, image.height - 1),
    )]
    significant_alpha = alpha.point(lambda value: 255 if value >= 24 else 0)
    bbox = significant_alpha.getbbox()
    if not bbox or any(value > 16 for value in corners):
        raise RuntimeError("Qwen layer_2 failed transparent-corner QA")
    coverage = ((bbox[2] - bbox[0]) * (bbox[3] - bbox[1])) / (image.width * image.height)
    significant_pixels = sum(1 for value in alpha.get_flattened_data() if value >= 24)
    significant_ratio = significant_pixels / (image.width * image.height)
    if not .05 <= coverage <= .85:
        raise RuntimeError(f"Qwen layer_2 subject coverage is implausible: {coverage:.3f}")
    if not .01 <= significant_ratio <= .65:
        raise RuntimeError(f"Qwen layer_2 opaque area is implausible: {significant_ratio:.3f}")
    return {
        "width": image.width,
        "height": image.height,
        "alphaBoundingBox": list(bbox),
        "boundingBoxCoverage": round(coverage, 4),
        "significantAlphaThreshold": 24,
        "significantAlphaRatio": round(significant_ratio, 4),
        "cornerAlpha": corners,
        "transparentCorners": True,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--local-config", default="tools/state/local.json")
    parser.add_argument("--qwen-url")
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    try:
        config = json.loads(Path(args.local_config).read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        config = {}
    base = str(args.qwen_url or os.environ.get("QLOBE_QWEN_URL") or config.get("qwenUrl") or "").rstrip("/")
    if not base:
        raise SystemExit("qwenUrl is not configured")

    source = SOURCE / "title-chroma-magenta-gpt-image-2.png"
    destination = SOURCE / "title-layer2.png"
    prompt = (
        "Background layer: the perfectly flat bright magenta background only. "
        "Top layer: the entire exact Tangram Tales papercraft title lockup together "
        "on a transparent background, including every cream backing edge, every "
        "colored letter, both yellow stars, and both orange chevrons. Preserve the "
        "exact spelling, letter shapes, green letters, colors, paper texture, scale, "
        "layout, and shadows. Do not crop, redraw, rearrange, add, recolor, darken, "
        "merge, or remove anything."
    )
    submitted = json.loads(post_multipart(
        f"{base}/workflows/qwen-image-layered",
        {"prompt": prompt, "layers": "2", "seed": str(args.seed)},
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
            candidate = SOURCE / f"title-layer2-seed{args.seed}-candidate.png"
            candidate.write_bytes(data)
            qa = validate_layer(data)
            destination.write_bytes(data)
            provenance = {
                "workflow": "qwen-image-layered",
                "source": source.name,
                "output": destination.name,
                "selectedOutput": "layer_2",
                "seed": args.seed,
                "prompt": prompt,
                "qa": qa,
            }
            (SOURCE / "qwen-layered-title.json").write_text(json.dumps(provenance, indent=2) + "\n")
            print(f"wrote {destination.relative_to(ROOT)} ({len(data) // 1024} KB)")
            return
        if status.get("status") in {"failed", "error", "cancelled", "canceled"}:
            raise RuntimeError(status.get("error") or f"Qwen job {status.get('status')}")
    raise TimeoutError(f"Qwen job {job_id} exceeded 30 minutes")


if __name__ == "__main__":
    main()
