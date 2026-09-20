#!/usr/bin/env python3
"""Generate the dedicated Puppet Patience Theater Krea 2 hub candidate."""

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
ROOT = GAME.parents[1]
OUT = GAME / "assets/source/krea"
PROMPT = (
    "A premium preschool game hub illustration: an orange wool-felt fox puppet in a green vest and burgundy bow tie sits calmly "
    "on a little blue stool while a cream felt rabbit in a purple pinafore takes a turn on a blue felt swing; a chestnut felt "
    "squirrel with teal neckerchief cheers beside them. Miniature cranberry velvet puppet theater, warm apricot felt backdrop, "
    "honey wooden floor, tiny gold stars, clear friendly faces, tactile wool fibers, visible blanket stitching, cozy handmade "
    "stop-motion toy photography, centered readable 6:5 composition; no words, title, UI, border, logo, watermark, extra limbs, "
    "extra characters, plastic, vector art, or clutter"
)


def base_url(explicit=None):
    if explicit:
        return explicit.rstrip("/")
    if os.environ.get("QLOBE_QWEN_URL"):
        return os.environ["QLOBE_QWEN_URL"].rstrip("/")
    return str(json.loads((ROOT / "tools/state/local.json").read_text("utf-8"))["qwenUrl"]).rstrip("/")


def generate(base, seed):
    fields = {"prompt": PROMPT, "seed": seed, "width": 768, "height": 640, "steps": 8, "cfg": 1}
    boundary = "----QlobePatienceHub"
    body = b"".join((f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n').encode()
                    for key, value in fields.items()) + f"--{boundary}--\r\n".encode()
    request = Request(base + "/workflows/krea2-turbo-t2i", data=body, method="POST",
                      headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
    with urlopen(request, timeout=60) as response:
        payload = json.load(response)
    job_id = payload.get("job_id") or payload.get("id")
    if not job_id:
        raise RuntimeError("Krea response had no job id")
    for _ in range(int(os.environ.get("QLOBE_QWEN_TIMEOUT", "900"))):
        with urlopen(f"{base}/jobs/{job_id}", timeout=60) as response:
            status = json.load(response)
        state = str(status.get("status", "")).lower()
        if state in {"done", "completed", "complete", "success", "succeeded"}:
            with urlopen(f"{base}/jobs/{job_id}/result", timeout=300) as response:
                return response.read(), job_id
        if state in {"failed", "error", "cancelled", "canceled"}:
            raise RuntimeError(f"Krea failed: {state}")
        time.sleep(1)
    raise TimeoutError("Krea polling timed out")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--api-url")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    raw = OUT / f"hub-tile-seed-{args.seed}.png"
    preview = OUT / "hub-tile-preview.jpg"
    if args.force or not raw.is_file():
        data, job_id = generate(base_url(args.api_url), args.seed)
        raw.write_bytes(data)
    else:
        job_id = "reused"
    with Image.open(raw) as opened:
        final = ImageOps.fit(opened.convert("RGB"), (640, 533), Image.Resampling.LANCZOS)
        final.save(preview, "JPEG", quality=92, optimize=True)
    receipt = {
        "format": "qlobe-recipe", "formatVersion": 1, "id": "puppet-patience-theater-hub-krea2",
        "kind": "image", "asset": str(preview.relative_to(ROOT)).replace("\\", "/"),
        "source": str(raw.relative_to(ROOT)).replace("\\", "/"),
        "steps": [{"workflow": "krea2-turbo-t2i", "prompt": PROMPT, "seed": args.seed,
                   "width": 768, "height": 640, "steps": 8, "cfg": 1}],
        "job": "sanitized-local-job-id", "sourceSha256": hashlib.sha256(raw.read_bytes()).hexdigest(),
        "previewSha256": hashlib.sha256(preview.read_bytes()).hexdigest(),
        "qa": {"status": "awaiting-human-review", "finalSize": [640, 533]},
        "createdAt": dt.datetime.now(dt.timezone.utc).isoformat(),
    }
    (OUT / "hub-tile-recipe.json").write_text(json.dumps(receipt, indent=2) + "\n", "utf-8")
    print(f"generated {preview} seed={args.seed} job={job_id}")


if __name__ == "__main__":
    main()
