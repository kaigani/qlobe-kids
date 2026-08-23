#!/usr/bin/env python3
"""Extract Reading Buddies sprite sheets with Qwen Image Layered.

The source masters deliberately use a flat charcoal production ground. This
script submits each accepted sheet as a two-layer job and saves `layer_2`, the
transparent foreground. It is resumable and never prints the configured LAN
host.

Usage:
    python3 games/picture-word-match/tools/generate-layered.py
    python3 games/picture-word-match/tools/generate-layered.py --only title controls
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
    sys.exit("Pillow is required: python3 -m pip install pillow")


ROOT = pathlib.Path(__file__).resolve().parents[3]
GAME = ROOT / "games" / "picture-word-match"
LOCAL_CONFIG = ROOT / "tools" / "state" / "local.json"
OUT = GAME / "assets" / "source" / "layered"
SEEDS = (42, 1337, 9001)

ASSETS = {
    "title": (
        GAME / "assets/source/gpt-image-2/title-master.png",
        "the complete hand-painted Reading Buddies title lockup, preserving every letter and its cream paper edge",
    ),
    "words-animals": (
        GAME / "assets/source/gpt-image-2/words-animals-master.png",
        "all six watercolor animal subjects, preserving their exact 3 by 2 positions and every painted detail",
    ),
    "words-food": (
        GAME / "assets/source/local-api/words-food-qwen-edit.png",
        "all six watercolor food subjects, preserving their exact 3 by 2 positions and every painted detail",
    ),
    "words-things": (
        GAME / "assets/source/local-api/words-things-qwen-edit.png",
        "all six watercolor everyday-object subjects, preserving their exact 3 by 2 positions and every painted detail",
    ),
    "emblems": (
        GAME / "assets/source/gpt-image-2/emblems-master.png",
        "all six watercolor chapter and activity emblems, preserving their exact 3 by 2 positions and every painted detail",
    ),
    "carriers": (
        GAME / "assets/source/gpt-image-2/carriers-master.png",
        "all blank watercolor cards, ribbons, five small seed tiles, and green check stamp, preserving their exact positions and paper texture",
    ),
    "book-rewards": (
        GAME / "assets/source/gpt-image-2/book-rewards-master.png",
        "all six watercolor books, ribbon, trail, and reward-stamp objects, preserving their exact 3 by 2 positions and every painted detail",
    ),
    "controls": (
        GAME / "assets/source/gpt-image-2/controls-master.png",
        "all six watercolor control objects, preserving their exact 3 by 2 positions, symbols, and paper texture",
    ),
}


def api_base() -> str:
    try:
        data = json.loads(LOCAL_CONFIG.read_text())
        value = str(data.get("qwenUrl", "")).rstrip("/")
    except (OSError, ValueError):
        value = ""
    if not value:
        sys.exit("Local workflow URL is not configured in tools/state/local.json")
    return value


def multipart(url: str, fields: dict[str, str], image_path: pathlib.Path) -> bytes:
    boundary = f"----readingbuddies{time.time_ns()}"
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
        "Background layer: the perfectly flat uniform dark charcoal background\n"
        f"Top layer: {subject}, isolated together on a transparent background"
    )
    raw = multipart(
        f"{base}/workflows/qwen-image-layered",
        {"prompt": prompt, "layers": "2", "seed": str(seed)},
        source,
    )
    payload = json.loads(raw)
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
            raise RuntimeError(f"Layered workflow ended with status {status}")
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
