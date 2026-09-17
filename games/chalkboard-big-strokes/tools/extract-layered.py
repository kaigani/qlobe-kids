#!/usr/bin/env python3
"""Extract Chalkboard Big Strokes masters with Qwen Image Layered.

The accepted GPT Image 2 masters use a flat chroma ground.  This resumable
authoring-time tool asks the configured LAN workflow for ``layer_2`` and never
prints the private workflow host.
"""

from __future__ import annotations

import argparse
import io
import json
import pathlib
import sys
import time
import urllib.error
import urllib.request

try:
    from PIL import Image
except ImportError:  # pragma: no cover
    sys.exit("Pillow is required: python -m pip install pillow")


ROOT = pathlib.Path(__file__).resolve().parents[3]
GAME = ROOT / "games" / "chalkboard-big-strokes"
LOCAL_CONFIG = ROOT / "tools" / "state" / "local.json"
OUT = GAME / "assets" / "source" / "layered"
SEEDS = (42, 1337, 9001)
ASSETS = {
    "title-lockup": (
        GAME / "assets/source/gpt-image-2/title-lockup-master.png",
        "the complete two-line Chalkboard Big Strokes chalk title lockup, preserving every letter, the smiling sun letter o, and all tiny chalk accents exactly",
    ),
    "chalk-ui-sheet": (
        GAME / "assets/source/gpt-image-2/chalk-ui-sheet-master.png",
        "all twelve toy chalkboard UI objects together in their exact four-column by three-row positions, preserving every wood, felt, chalk, symbol, and dust detail",
    ),
}


def api_base() -> str:
    try:
        data = json.loads(LOCAL_CONFIG.read_text(encoding="utf-8"))
        value = str(data.get("qwenUrl", "")).rstrip("/")
    except (OSError, ValueError):
        value = ""
    if not value:
        sys.exit("Local workflow URL is not configured in tools/state/local.json")
    return value


def multipart(url: str, fields: dict[str, str], image_path: pathlib.Path) -> bytes:
    boundary = f"----chalkboard{time.time_ns()}"
    body = io.BytesIO()
    for key, value in fields.items():
        body.write(f"--{boundary}\r\n".encode())
        body.write(f'Content-Disposition: form-data; name="{key}"\r\n\r\n'.encode())
        body.write(f"{value}\r\n".encode())
    body.write(f"--{boundary}\r\n".encode())
    body.write(
        f'Content-Disposition: form-data; name="image"; filename="{image_path.name}"\r\n'.encode()
    )
    body.write(b"Content-Type: image/png\r\n\r\n")
    body.write(image_path.read_bytes())
    body.write(b"\r\n")
    body.write(f"--{boundary}--\r\n".encode())
    request = urllib.request.Request(
        url,
        data=body.getvalue(),
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    with urllib.request.urlopen(request, timeout=900) as response:
        return response.read()


def submit(base: str, source: pathlib.Path, subject: str, seed: int) -> str:
    prompt = (
        "Background layer: the perfectly flat uniform chroma-green background only\n"
        f"Top layer: {subject}, isolated together on a true transparent background. "
        "Do not repaint, rearrange, add, remove, or crop any foreground detail."
    )
    payload = json.loads(
        multipart(
            f"{base}/workflows/qwen-image-layered",
            {"prompt": prompt, "layers": "2", "seed": str(seed)},
            source,
        )
    )
    job_id = payload.get("job_id") or payload.get("id")
    if not job_id:
        raise RuntimeError("Layered workflow did not return a job id")
    return str(job_id)


def poll(base: str, job_id: str, timeout: int) -> bytes:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        with urllib.request.urlopen(f"{base}/jobs/{job_id}", timeout=60) as response:
            payload = json.loads(response.read())
        status = str(payload.get("status", "")).lower()
        if status in {"completed", "complete", "succeeded", "success"}:
            with urllib.request.urlopen(
                f"{base}/jobs/{job_id}/result?output=layer_2", timeout=300
            ) as response:
                return response.read()
        if status in {"failed", "error", "cancelled", "canceled"}:
            detail = payload.get("error") or payload.get("message") or payload.get("detail")
            if isinstance(detail, dict):
                detail = detail.get("message") or detail.get("error") or "workflow error"
            note = str(detail or "no error detail").replace("\n", " ")[:300]
            raise RuntimeError(f"Layered workflow ended with status {status}: {note}")
        time.sleep(3)
    raise TimeoutError("Layered workflow exceeded the per-asset timeout")


def alpha_ok(data: bytes) -> tuple[bool, str]:
    image = Image.open(io.BytesIO(data)).convert("RGBA")
    histogram = image.getchannel("A").histogram()
    total = image.width * image.height
    transparent = sum(histogram[:8]) / total
    opaque = sum(histogram[248:]) / total
    if transparent < 0.05:
        return False, f"background not removed ({transparent:.1%} transparent)"
    if opaque < 0.01:
        return False, f"near-blank foreground ({opaque:.1%} opaque)"
    return True, f"{image.width}x{image.height}; {transparent:.1%} transparent"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--only", nargs="*", choices=sorted(ASSETS))
    parser.add_argument("--timeout", type=int, default=1800)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    selected = args.only or list(ASSETS)
    missing = [str(ASSETS[name][0]) for name in selected if not ASSETS[name][0].is_file()]
    if missing:
        sys.exit("Missing source masters:\n" + "\n".join(missing))

    OUT.mkdir(parents=True, exist_ok=True)
    base = api_base()
    failures: list[str] = []
    for name in selected:
        source, subject = ASSETS[name]
        target = OUT / f"{name}.png"
        if target.exists() and not args.force:
            ok, note = alpha_ok(target.read_bytes())
            if ok:
                print(f"skip {name}: {note}")
                continue
        for seed in SEEDS:
            print(f"extract {name}: seed {seed}", flush=True)
            try:
                data = poll(base, submit(base, source, subject, seed), args.timeout)
                ok, note = alpha_ok(data)
                if not ok:
                    print(f"reject {name}: {note}", flush=True)
                    continue
                target.write_bytes(data)
                print(f"accept {name}: {note}", flush=True)
                break
            except (OSError, ValueError, RuntimeError, TimeoutError, urllib.error.URLError) as error:
                print(f"retry {name}: {type(error).__name__}: {error}", flush=True)
        else:
            failures.append(name)

    if failures:
        print("failed: " + ", ".join(failures), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
