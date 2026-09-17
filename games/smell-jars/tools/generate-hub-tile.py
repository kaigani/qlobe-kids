#!/usr/bin/env python3
"""Generate a review-only Krea 2 hub tile candidate for Smell Jars."""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import time
from pathlib import Path
from urllib.request import Request, urlopen

from PIL import Image, ImageOps


GAME = Path(__file__).resolve().parents[1]
REPO = GAME.parents[1]
OUT = GAME / "assets/source/local-api/hub"
PROMPT = (
    "A premium preschool Toy-world miniature scent-apothecary tableau on a warm honey-maple table: "
    "one large pale-maple open smell jar releasing three broad soft handcrafted scent curls in sunny yellow, "
    "mint green, and muted violet; beside it exactly three chunky round wooden ingredient medallions showing "
    "a lemon, mint leaves, and two cinnamon sticks; a low recessed wooden tray and tiny friendly carved sun "
    "mascot complete the composition. Bright soft 3D toy illustration, rounded safe forms, fine wood grain, "
    "matte painted relief, cream and sage room hints, warm upper-left studio light, strong readable 6:5 menu "
    "silhouette. No title, no writing, no letters, no numbers, no labels, no UI, no border, no people, no "
    "glass potion bottles, no dark magic, no photorealism, no flat vector art, no watermark."
)


def request_bytes(url: str, data: bytes | None = None, headers: dict | None = None) -> bytes:
    request = Request(url, data=data, headers=headers or {})
    with urlopen(request, timeout=300) as response:
        return response.read()


def submit(base: str, seed: int) -> bytes:
    boundary = "----qlobe-smell-jars-hub"
    fields = {"prompt": PROMPT, "seed": seed, "width": 768, "height": 640, "steps": 8, "cfg": 1}
    body = bytearray()
    for key, value in fields.items():
        body += f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n'.encode()
    body += f"--{boundary}--\r\n".encode()
    payload = json.loads(request_bytes(
        f"{base}/workflows/krea2-turbo-t2i",
        bytes(body),
        {"Content-Type": f"multipart/form-data; boundary={boundary}"},
    ))
    job = payload.get("job_id") or payload.get("id")
    if not job:
        raise RuntimeError("Krea did not return a job id")
    for _ in range(450):
        state = json.loads(request_bytes(f"{base}/jobs/{job}"))
        status = str(state.get("status", "")).lower()
        if status in {"done", "completed", "complete", "success", "succeeded"}:
            return request_bytes(f"{base}/jobs/{job}/result")
        if status in {"failed", "error", "cancelled", "canceled"}:
            raise RuntimeError(f"Krea failed: {status}")
        time.sleep(2)
    raise TimeoutError("Krea hub generation timed out")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--api-url", default=os.environ.get("QLOBE_QWEN_URL"))
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    if not args.api_url:
        raise SystemExit("Pass --api-url or set QLOBE_QWEN_URL")
    OUT.mkdir(parents=True, exist_ok=True)
    raw = OUT / f"krea2-seed-{args.seed}.png"
    candidate = OUT / f"krea2-seed-{args.seed}-candidate.jpg"
    recipe = OUT / f"krea2-seed-{args.seed}.recipe.json"
    if args.force or not raw.is_file():
        raw.write_bytes(submit(args.api_url.rstrip("/"), args.seed))
    with Image.open(raw) as source:
        source.load()
        image = ImageOps.fit(source.convert("RGB"), (640, 533), Image.Resampling.LANCZOS)
        image.save(candidate, "JPEG", quality=91, optimize=True, progressive=True)
    payload = {
        "format": "qlobe-recipe",
        "formatVersion": 1,
        "id": f"smell-jars-hub-krea2-seed-{args.seed}",
        "kind": "image",
        "asset": str(candidate.relative_to(GAME)),
        "artDirection": "Toy",
        "steps": [{"workflow": "krea2-turbo-t2i", "prompt": PROMPT, "seed": args.seed,
                   "width": 768, "height": 640, "steps": 8, "cfg": 1}],
        "source": str(raw.relative_to(GAME)),
        "sourceSha256": hashlib.sha256(raw.read_bytes()).hexdigest(),
        "candidateSha256": hashlib.sha256(candidate.read_bytes()).hexdigest(),
        "qa": {"status": "pending-human-review", "finalSize": [640, 533], "productionOverwrite": False},
        "createdAt": dt.datetime.now(dt.timezone.utc).isoformat(),
    }
    recipe.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(candidate)


if __name__ == "__main__":
    main()
