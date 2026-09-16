#!/usr/bin/env python3
"""Generate a Krea 2 hub-tile candidate; publish only with --publish."""

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
OUT = GAME / "assets" / "source" / "local-api" / "hub"
PRODUCTION = REPO / "assets" / "hub" / "tiles" / "silly-swap-words.jpg"
PROMPT = (
    "a premium handcrafted claymation toy-world scene for a preschool game menu tile, "
    "one adorable orange clay kitten beside three chunky blank cream clay letter wells, "
    "a round happy blue clay magic-swap face with tiny yellow star sparkles, all arranged "
    "as one bold readable group on a lavender clay tabletop beneath a cheerful turquoise "
    "clay sky, visible fingerprints and hand-shaped seams, warm studio lighting, satin-matte "
    "plasticine, bright coral purple aqua yellow palette, spacious 6:5 composition; absolutely "
    "no writing, letters, numbers, logos, UI text, border, frame, flat vector, or photorealism"
)


def endpoint(explicit: str | None) -> str:
    if explicit:
        return explicit.rstrip("/")
    value = os.environ.get("QLOBE_QWEN_URL")
    if value:
        return value.rstrip("/")
    try:
        state = json.loads((REPO / "tools" / "state" / "local.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        state = {}
    value = state.get("qwenUrl") or state.get("qwen_url") or state.get("base_url")
    if not value:
        raise RuntimeError("local generation endpoint is not configured")
    return str(value).rstrip("/")


def multipart(fields: dict[str, object], boundary: str) -> bytes:
    return b"".join(
        (f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n').encode()
        for key, value in fields.items()
    ) + f"--{boundary}--\r\n".encode()


def generate(base: str, seed: int) -> tuple[bytes, str]:
    boundary = "----QlobeSillySwapKrea"
    body = multipart({"prompt": PROMPT, "seed": seed, "width": 768, "height": 640, "steps": 8, "cfg": 1}, boundary)
    req = Request(base + "/workflows/krea2-turbo-t2i", data=body, method="POST", headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
    with urlopen(req, timeout=60) as response:
        submitted = json.load(response)
    job = submitted.get("job_id") or submitted.get("id")
    if not job:
        raise RuntimeError("Krea 2 returned no job id")
    for _ in range(450):
        with urlopen(f"{base}/jobs/{job}", timeout=60) as response:
            status = json.load(response)
        value = str(status.get("status", "")).lower()
        if value in {"completed", "done", "success", "succeeded"}:
            with urlopen(f"{base}/jobs/{job}/result", timeout=300) as response:
                return response.read(), str(job)
        if value in {"failed", "error", "cancelled", "canceled"}:
            raise RuntimeError(f"Krea 2 job ended with {value}")
        time.sleep(2)
    raise TimeoutError("Krea 2 job did not finish in time")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--api-url")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--publish", action="store_true")
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    raw = OUT / f"silly-swap-words-krea2-seed-{args.seed}.png"
    candidate = OUT / f"silly-swap-words-krea2-seed-{args.seed}.jpg"
    recipe = OUT / f"silly-swap-words-krea2-seed-{args.seed}.recipe.json"
    job = None
    if recipe.exists():
        try:
            job = json.loads(recipe.read_text(encoding="utf-8")).get("jobId")
        except (OSError, ValueError):
            pass
    if args.force or not raw.exists():
        payload, job = generate(endpoint(args.api_url), args.seed)
        raw.write_bytes(payload)
    with Image.open(raw) as source:
        source.load()
        if min(source.size) < 512 or raw.stat().st_size < 5000:
            raise RuntimeError("Krea 2 output failed size validation")
        image = ImageOps.fit(source.convert("RGB"), (640, 533), Image.Resampling.LANCZOS)
    image.save(candidate, "JPEG", quality=91, optimize=True)
    if args.publish:
        PRODUCTION.parent.mkdir(parents=True, exist_ok=True)
        image.save(PRODUCTION, "JPEG", quality=91, optimize=True)
    data = {
        "format": "qlobe-recipe", "formatVersion": 1, "id": "silly-swap-words-hub-krea2",
        "kind": "image", "asset": str(candidate.relative_to(REPO)).replace("\\", "/"),
        "artDirection": "Claymation", "jobId": job,
        "steps": [{"workflow": "krea2-turbo-t2i", "prompt": PROMPT, "seed": args.seed, "width": 768, "height": 640, "steps": 8, "cfg": 1}],
        "source": raw.name, "sourceSha256": hashlib.sha256(raw.read_bytes()).hexdigest(),
        "candidateSha256": hashlib.sha256(candidate.read_bytes()).hexdigest(),
        "qa": {"status": "published-after-human-review" if args.publish else "pending-human-review", "finalSize": [640, 533]},
        "createdAt": dt.datetime.now(dt.timezone.utc).isoformat(),
    }
    recipe.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    print(f"generated {candidate.relative_to(REPO)}" + (" and published hub tile" if args.publish else ""))


if __name__ == "__main__":
    main()
