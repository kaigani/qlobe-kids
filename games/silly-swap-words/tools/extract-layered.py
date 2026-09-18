#!/usr/bin/env python3
"""Extract Silly Swap Words production sheets with Qwen Image Layered.

The accepted GPT Image 2 masters remain immutable under ``assets/source``.
This resumable authoring-time tool submits one workflow family at a time,
polls the asynchronous jobs, and stores only the true-alpha ``layer_2`` output.
It never records or prints the configured LAN host.
"""

from __future__ import annotations

import argparse
import io
import json
import os
import pathlib
import sys
import time
import urllib.error
import urllib.request

from PIL import Image


ROOT = pathlib.Path(__file__).resolve().parents[3]
GAME = ROOT / "games" / "silly-swap-words"
CONFIG = ROOT / "tools" / "state" / "local.json"
SOURCE = GAME / "assets" / "source" / "gpt-image-2"
OUT = GAME / "assets" / "source" / "layered"
SEEDS = (42, 1337, 9001, 7)

ASSETS = {
    "title": (
        SOURCE / "title-master.png",
        "the complete Silly Swap Words clay title plaque, preserving every correctly spelled letter, the tiny star, clay texture, and warm shadow exactly",
    ),
    "ui-carriers": (
        SOURCE / "ui-carriers-master.png",
        "all eight complete clay UI objects, preserving their exact two-row positions, symbols, shapes, colors, textures, and blank text surfaces",
    ),
    "words-a": (
        SOURCE / "words-a-master.png",
        "all twelve complete clay word-picture subjects, preserving their exact three-by-four positions and every sculpted detail",
    ),
    "words-b": (
        SOURCE / "words-b-master.png",
        "all twelve complete clay word-picture subjects, preserving their exact three-by-four positions and every sculpted detail",
    ),
}


def api_base() -> str:
    value = os.environ.get("QLOBE_QWEN_URL", "").strip()
    if not value:
        try:
            value = str(json.loads(CONFIG.read_text()).get("qwenUrl", "")).strip()
        except (OSError, ValueError):
            value = ""
    if not value:
        raise SystemExit("QLOBE_QWEN_URL is not set and tools/state/local.json has no qwenUrl")
    return value.rstrip("/")


def multipart(url: str, fields: dict[str, str], image_path: pathlib.Path) -> bytes:
    boundary = f"----sillyswap{time.time_ns()}"
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
        "Bottom layer: only the source background, dark glow, and stray edge-color residue, with no foreground subjects.\n"
        f"Top layer: {subject}, isolated together on genuine transparency. "
        "Keep the foreground identical. Do not redraw, crop, rearrange, add, remove, relight, or rewrite anything."
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
        raise RuntimeError("layered workflow returned no job id")
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
            raise RuntimeError(f"layered workflow ended with status {status}")
        time.sleep(3)
    raise TimeoutError("layered workflow exceeded the per-asset timeout")


def alpha_stats(data: bytes) -> tuple[bool, dict[str, float | int]]:
    image = Image.open(io.BytesIO(data)).convert("RGBA")
    histogram = image.getchannel("A").histogram()
    total = image.width * image.height
    transparent = sum(histogram[:8]) / total
    opaque = sum(histogram[248:]) / total
    partial = 1 - transparent - opaque
    stats: dict[str, float | int] = {
        "width": image.width,
        "height": image.height,
        "transparentPct": round(transparent * 100, 3),
        "opaquePct": round(opaque * 100, 3),
        "partialPct": round(partial * 100, 3),
    }
    return transparent >= 0.05 and opaque >= 0.01, stats


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--only", nargs="*", choices=sorted(ASSETS))
    parser.add_argument("--timeout", type=int, default=1800)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    chosen = args.only or list(ASSETS)
    missing = [str(ASSETS[name][0]) for name in chosen if not ASSETS[name][0].is_file()]
    if missing:
        raise SystemExit("missing source masters:\n" + "\n".join(missing))

    OUT.mkdir(parents=True, exist_ok=True)
    base = api_base()
    failures: list[str] = []
    for name in chosen:
        source, subject = ASSETS[name]
        target = OUT / f"{name}.png"
        recipe = OUT / f"{name}.recipe.json"
        if target.exists() and not args.force:
            ok, stats = alpha_stats(target.read_bytes())
            if ok:
                print(f"skip {name}: {stats}")
                continue
        accepted = False
        for seed in SEEDS:
            print(f"extract {name}: seed {seed}", flush=True)
            try:
                job_id = submit(base, source, subject, seed)
                data = poll(base, job_id, args.timeout)
                ok, stats = alpha_stats(data)
                if not ok:
                    print(f"reject {name}: alpha QA {stats}", flush=True)
                    continue
                target.write_bytes(data)
                prompt = (
                    "Bottom layer: only the source background, dark glow, and stray edge-color residue, with no foreground subjects.\n"
                    f"Top layer: {subject}, isolated together on genuine transparency. "
                    "Keep the foreground identical. Do not redraw, crop, rearrange, add, remove, relight, or rewrite anything."
                )
                recipe.write_text(
                    json.dumps(
                        {
                            "format": "qlobe-recipe",
                            "formatVersion": 1,
                            "workflow": "qwen-image-layered",
                            "seed": seed,
                            "selectedOutput": "layer_2",
                            "source": str(source.relative_to(ROOT)).replace("\\", "/"),
                            "output": str(target.relative_to(ROOT)).replace("\\", "/"),
                            "qa": stats,
                            "prompt": prompt,
                        },
                        indent=2,
                    )
                    + "\n"
                )
                print(f"accept {name}: {stats}", flush=True)
                accepted = True
                break
            except (OSError, ValueError, RuntimeError, TimeoutError, urllib.error.URLError) as error:
                print(f"retry {name}: {type(error).__name__}: {error}", flush=True)
        if not accepted:
            failures.append(name)

    if failures:
        print("failed: " + ", ".join(failures), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
