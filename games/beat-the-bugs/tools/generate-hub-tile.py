#!/usr/bin/env python3
"""Generate a review-only Beat the Bugs Krea hub candidate.

The production hub tile is an ART DIRECTOR-approved GPT Image 2 edit. This
exploration tool intentionally writes only below assets/source/ and can never
overwrite the shared catalog asset.
"""
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
ASSETS = GAME / "assets"
OUTDIR = ASSETS / "source/local-api/hub"
RAW_NAME = "beat-the-bugs-krea-seed-{seed}.png"
CANDIDATE_NAME = "beat-the-bugs-krea-seed-{seed}-candidate.jpg"
RECIPE_NAME = "recipe-candidate-seed-{seed}.json"
PROMPT = ("a premium miniature handcrafted Kawaii hygiene superhero tableau on a warm toy table, composed as five bold connected subjects only: "
          "on the left a pair of brown child hands covered in pearly soap bubbles, in the center a friendly aqua soap shield, "
          "on the right a large joyful open smile with six clean white teeth actively brushed by one chunky turquoise toothbrush, "
          "plus exactly two tiny silly rounded bug villains retreating at the lower outer corners; equal visual weight for hand washing and tooth brushing, "
          "aqua coral lemon lilac candy palette, puffy soft-vinyl clay material, cream rims and cocoa contours, strong readable 6:5 menu-tile silhouette, warm studio lighting; "
          "absolutely no writing, letters, numbers, logos, UI, palettes, trays, cards, buttons, borders, extra props, scary faces, detached clutter, flat vector, or photorealism.")


def api_url(explicit=None):
    if explicit:
        return explicit.rstrip("/")
    value = os.environ.get("QLOBE_QWEN_URL")
    if value:
        return value.rstrip("/")
    state = REPO / "tools/state/local.json"
    try:
        value = json.loads(state.read_text()).get("qwenUrl")
    except (OSError, ValueError):
        value = None
    return str(value).rstrip("/") if value else None


def planned(seed):
    return {
        "raw": str(OUTDIR / RAW_NAME.format(seed=seed)),
        "candidate": str(OUTDIR / CANDIDATE_NAME.format(seed=seed)),
        "receipt": str(OUTDIR / RECIPE_NAME.format(seed=seed)),
        "production": str(REPO / "assets/hub/tiles/beat-the-bugs.jpg"),
        "willOverwriteProduction": False,
    }


def submit_and_poll(base, seed):
    fields = {"prompt": PROMPT, "seed": seed, "width": 768, "height": 640, "steps": 8, "cfg": 1}
    boundary = "----QlobeboundaryBeatBugs"
    body = b"".join((f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n').encode()
                   for key, value in fields.items()) + f"--{boundary}--\r\n".encode()
    request = Request(base + "/workflows/krea2-turbo-t2i", data=body, method="POST",
                      headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
    with urlopen(request, timeout=60) as response:
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


def generate(seed, force, explicit_api):
    raw = OUTDIR / RAW_NAME.format(seed=seed)
    candidate = OUTDIR / CANDIDATE_NAME.format(seed=seed)
    recipe_path = OUTDIR / RECIPE_NAME.format(seed=seed)
    if candidate.is_file() and recipe_path.is_file() and not force:
        print(f"hub exploration: reused {candidate.relative_to(REPO)}")
        return
    OUTDIR.mkdir(parents=True, exist_ok=True)
    if force or not raw.is_file():
        base = api_url(explicit_api)
        if not base:
            raise RuntimeError("QLOBE_QWEN_URL is not configured and no retained raw candidate exists")
        raw.write_bytes(submit_and_poll(base, seed))
    with Image.open(raw) as source:
        source.load()
        if source.width < 512 or source.height < 512 or raw.stat().st_size < 5000:
            raise RuntimeError("Krea result is too small")
        image = ImageOps.fit(source.convert("RGB"), (640, 533), Image.Resampling.LANCZOS)
    image.save(candidate, "JPEG", quality=91, optimize=True)
    receipt = {"format": "qlobe-recipe", "formatVersion": 1, "id": "beat-the-bugs-hub-krea-exploration", "kind": "image",
               "asset": str(candidate.relative_to(REPO)), "artDirection": "Kawaii",
               "steps": [{"workflow": "krea2-turbo-t2i", "prompt": PROMPT, "seed": seed,
                          "width": 768, "height": 640, "steps": 8, "cfg": 1}],
               "source": raw.name, "sourceSha256": hashlib.sha256(raw.read_bytes()).hexdigest(),
               "candidateSha256": hashlib.sha256(candidate.read_bytes()).hexdigest(),
               "qa": {"status": "pending-human-review-exploration-only", "finalSize": [640, 533],
                      "productionOverwrite": False},
               "createdAt": dt.datetime.now(dt.timezone.utc).isoformat()}
    recipe_path.write_text(json.dumps(receipt, indent=2) + "\n")
    print(f"hub exploration: generated {candidate.relative_to(REPO)}; production tile unchanged; human review required")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--api-url")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if args.check:
        if not isinstance(PROMPT, str) or not PROMPT or Image is None:
            raise SystemExit("configuration invalid")
        print(json.dumps(planned(args.seed), indent=2))
        return
    generate(args.seed, args.force, args.api_url)


if __name__ == "__main__":
    main()
