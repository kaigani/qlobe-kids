#!/usr/bin/env python3
"""Extract accepted Big Paper Murals contact sheets with Qwen Layered.

The local model API is authoring-time only. The script is resumable and always
fetches layer_2, the true-alpha foreground, never the composite layer_0.
"""

from __future__ import annotations

import argparse
import json
import time
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "source"
JOBS = (
    (
        "living-stamps-magenta.png",
        "living-stamps-layer2.png",
        "Background layer: the perfectly flat bright magenta background only. "
        "Top layer: all eight exact papercraft sticker subjects from the 4 by 2 "
        "contact sheet together on a transparent background. Preserve every "
        "subject pixel, color, paper texture, expression, scale, and grid position. "
        "Keep the green leaves, orange tiger, red rocket and car, yellow sun, blue "
        "house and paint friend, purple planet, and white paper borders opaque. "
        "Do not crop, rearrange, redraw, merge, add, recolor, or remove anything.",
    ),
    (
        "tool-icons-magenta.png",
        "tool-icons-layer2.png",
        "Background layer: the perfectly flat bright magenta background only. "
        "Top layer: all four exact papercraft tool groups from the 4 by 1 contact "
        "sheet together on a transparent background. Preserve the blue brush with "
        "coral paint, green roller and paint stripe, purple stamp and star print, "
        "and yellow/coral music notes exactly, including all texture, colors, scale, "
        "and grid positions. Do not crop, rearrange, redraw, merge, add, recolor, "
        "or remove anything.",
    ),
)


def post_multipart(url: str, fields: dict[str, str], image: Path) -> bytes:
    boundary = "----qlobe-big-paper-murals"
    body = bytearray()
    for name, value in fields.items():
        body += (
            f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"'
            f"\r\n\r\n{value}\r\n"
        ).encode()
    body += (
        f'--{boundary}\r\nContent-Disposition: form-data; name="image"; '
        f'filename="{image.name}"\r\nContent-Type: image/png\r\n\r\n'
    ).encode()
    body += image.read_bytes() + b"\r\n"
    body += f"--{boundary}--\r\n".encode()
    request = urllib.request.Request(
        url,
        data=bytes(body),
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    with urllib.request.urlopen(request, timeout=240) as response:
        return response.read()


def get(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=240) as response:
        return response.read()


def extract(base: str, source: Path, destination: Path, prompt: str, seed: int) -> None:
    submitted = json.loads(
        post_multipart(
            f"{base}/workflows/qwen-image-layered",
            {"prompt": prompt, "layers": "2", "seed": str(seed)},
            source,
        )
    )
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
    parser.add_argument("--api-url", required=True, help="Local GenAI API base URL")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    base = args.api_url.rstrip("/")

    for source_name, output_name, prompt in JOBS:
        source = SOURCE / source_name
        output = SOURCE / output_name
        if output.exists() and output.stat().st_size > 10_000 and not args.force:
            print(f"skip {output.name}", flush=True)
            continue
        print(f"extract {source.name} with Qwen Layered seed {args.seed}", flush=True)
        extract(base, source, output, prompt, args.seed)
        print(f"wrote {output.name} ({output.stat().st_size // 1024} KB)", flush=True)


if __name__ == "__main__":
    main()
