#!/usr/bin/env python3
"""Generate a review-only Krea 2 hub candidate for Happy Ripe Fruit."""

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
    "a premium handcrafted Kawaii preschool game tableau in a magical sunny fruit orchard, "
    "one large honey-colored woven harvest basket centered and overflowing with exactly six instantly readable "
    "happy ripe fruit friends: one ruby strawberry, one golden curved banana, one shiny red apple, one sunny yellow "
    "lemon, one paired deep-red cherry character, and one golden-green pear; plump smiling faces, leaf-green orchard "
    "framing, tiny white daisies, blue sky, warm cream edge lights, cocoa contours, hand-painted gouache texture "
    "combined with soft sculpted clay volume, warm upper-left morning light, strong centered 6:5 menu-tile silhouette, "
    "the basket and six fruit fill most of the frame; absolutely no writing, letters, numbers, title, logo, UI, button, "
    "border, device, hand, extra fruit, flat vector art, photorealism, mold, or clutter"
)


def api_url(explicit=None):
    if explicit:
        return explicit.rstrip("/")
    if os.environ.get("QLOBE_QWEN_URL"):
        return os.environ["QLOBE_QWEN_URL"].rstrip("/")
    state = REPO / "tools/state/local.json"
    try:
        value = json.loads(state.read_text(encoding="utf-8")).get("qwenUrl")
    except (OSError, ValueError):
        value = None
    return str(value).rstrip("/") if value else None


def submit_and_poll(base, seed):
    fields = {"prompt": PROMPT, "seed": seed, "width": 768, "height": 640, "steps": 8, "cfg": 1}
    boundary = "----QLOBEHappyRipeFruit"
    body = b"".join(
        (
            f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n'
        ).encode()
        for key, value in fields.items()
    ) + f"--{boundary}--\r\n".encode()
    request = Request(
        base + "/workflows/krea2-turbo-t2i",
        data=body,
        method="POST",
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    with urlopen(request, timeout=90) as response:
        submitted = json.load(response)
    job_id = submitted.get("job_id") or submitted.get("id")
    if not job_id:
        raise RuntimeError("Krea workflow returned no job id")
    for _ in range(int(os.environ.get("QLOBE_QWEN_TIMEOUT", "900"))):
        with urlopen(f"{base}/jobs/{job_id}", timeout=60) as response:
            state = json.load(response)
        status = str(state.get("status", "")).lower()
        if status in {"done", "completed", "complete", "success", "succeeded"}:
            with urlopen(f"{base}/jobs/{job_id}/result", timeout=300) as response:
                return response.read()
        if status in {"failed", "error", "cancelled", "canceled"}:
            raise RuntimeError(f"Krea workflow failed: {status}")
        time.sleep(1)
    raise TimeoutError("Krea workflow polling timed out")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--api-url")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    raw = OUT / f"hub-krea-seed-{args.seed}.png"
    candidate = OUT / f"hub-krea-seed-{args.seed}-candidate.jpg"
    recipe = OUT / f"hub-krea-seed-{args.seed}.recipe.json"
    if args.check:
        print(json.dumps({"seed": args.seed, "raw": str(raw), "candidate": str(candidate)}, indent=2))
        return
    OUT.mkdir(parents=True, exist_ok=True)
    if args.force or not raw.is_file():
        base = api_url(args.api_url)
        if not base:
            raise RuntimeError("local API is not configured")
        raw.write_bytes(submit_and_poll(base, args.seed))
    with Image.open(raw) as opened:
        opened.load()
        if opened.width < 512 or opened.height < 512 or raw.stat().st_size < 5000:
            raise RuntimeError("Krea result is too small")
        image = ImageOps.fit(opened.convert("RGB"), (640, 533), Image.Resampling.LANCZOS)
    image.save(candidate, "JPEG", quality=92, optimize=True)
    receipt = {
        "format": "qlobe-recipe",
        "formatVersion": 1,
        "id": "happy-ripe-fruit-hub-krea-exploration",
        "kind": "image",
        "asset": str(candidate.relative_to(REPO)).replace("\\", "/"),
        "artDirection": "Kawaii",
        "steps": [{"workflow": "krea2-turbo-t2i", "prompt": PROMPT, "seed": args.seed,
                   "width": 768, "height": 640, "steps": 8, "cfg": 1}],
        "source": raw.name,
        "sourceSha256": hashlib.sha256(raw.read_bytes()).hexdigest(),
        "candidateSha256": hashlib.sha256(candidate.read_bytes()).hexdigest(),
        "job": "sanitized-local-job-id",
        "qa": {"status": "pending-art-director", "finalSize": [640, 533], "productionOverwrite": False},
        "createdAt": dt.datetime.now(dt.timezone.utc).isoformat(),
    }
    recipe.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print(f"generated {candidate.relative_to(REPO)}")


if __name__ == "__main__":
    main()
