#!/usr/bin/env python3
"""Build Ari the armadillo's pose-actor pack.

Modelled exactly on `games/counting-treasure-cups/tools/gen-actors.py`, minus
the neutral-from-scratch step: Ari's neutral is CONDITIONED on the finished
armadillo art in the concept mockups (`03-a-for-armadillo.png`), not invented,
so he matches what the human already reviewed.

Five stages, each idempotent (a stage whose output exists is skipped unless
--force names it):

  0. ref        (done ahead of time, committed) a tight PIL crop of the
                 armadillo out of 03-a-for-armadillo.png, arms-and-all,
                 background still attached — assets/source/actors/ari/ari-ref-crop.png
  1. neutral    qwen-image-edit on the ref crop, redrawn CALM: all four feet
                 down, both front paws relaxed, NOT waving. A cheerful
                 raised-arm reference bleeds into every derived pose
                 (docs/polish-process.md §3) — this step exists to kill that
                 before it can propagate.
  2. derives    qwen-image-edit, conditioned on the NEUTRAL image so the
                 character, palette and style stay identical across all six
                 poses.
  3. cutout     qwen-image-layered (ASYNC job flow — sync=true returns the
                 composite, not the cutout).
  4. assemble   tools/pipeline/pose_actor_assemble.py normalizes the six
                 sprites onto ONE shared scale and a common baseline at
                 ~420px canvas, so a paper-pop swap cannot change how big
                 Ari is.

    export QLOBE_QWEN_URL=http://<host>:<port>
    python3 games/flashlight-cave/tools/gen-actors.py
    python3 games/flashlight-cave/tools/gen-actors.py --force neutral

Intermediates land in assets/source/actors/ari/, committed, so a single bad
pose can be regenerated without redoing the set.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

GAME = Path(__file__).resolve().parents[1]
REPO = GAME.parents[1]
SRC = GAME / "assets" / "source" / "actors" / "ari"
OUT = GAME / "assets" / "pose-actors" / "ari"

POSES = ["neutral", "enter", "notice", "interact", "react", "celebrate"]

REF = SRC / "ari-ref-crop.png"

DARK = ("The background is a perfectly flat, solid, uniform dark charcoal background, "
        "no gradient, no texture, no shadows on the background.")

SUBJECT = ("Ari, a warm brown cartoon armadillo character with a pink snout, big round "
           "friendly eyes, pink-lined ears, and a banded shell across his back, in a "
           "bright, soft 3D cartoon toy style with glossy highlights")

NEUTRAL_PROMPT = (
    f"Redraw this exact same armadillo character, {SUBJECT}, but standing calmly at "
    "rest: all four feet on the ground, both front paws relaxed down in front of him "
    "(NOT raised, NOT waving), a gentle closed-mouth or softly-open friendly smile, "
    "calm neutral expression, ears up and relaxed. Keep the character, face, colours, "
    "proportions and art style completely identical to the reference — only the pose "
    "changes to this calm standing pose. Full body, head to feet, 3/4 view facing the "
    "viewer. " + DARK
)

DERIVES = {
    "enter": (
        "walking in from the side, mid-step, head turned toward the viewer with a "
        "friendly curious expression, tail trailing behind"
    ),
    "notice": (
        "head tilted up and to one side, one paw raised near his snout, eyes wide, "
        "ears perked forward, curious and attentive"
    ),
    "interact": (
        "standing on his back legs, mouth open mid-sentence as if talking to the "
        "viewer, one front paw open and gesturing forward invitingly"
    ),
    "react": (
        "a gentle playful surprise, both front paws raised a little in front of his "
        "chest, shoulders up, eyebrows raised, curled slightly into his shell, kind "
        "startled expression, never scared"
    ),
    "celebrate": (
        "standing on his back legs cheering, both front paws thrown up high above his "
        "head, big open happy smile, eyes closed with joy"
    ),
}


def api(path: str) -> str:
    base = os.environ.get("QLOBE_QWEN_URL", "").rstrip("/")
    if not base:
        sys.exit("QLOBE_QWEN_URL is not set (see .claude/skills/local-genai)")
    return f"{base}{path}"


def post_multipart(url: str, fields: dict, files: dict | None = None) -> bytes:
    boundary = "----qlobe" + os.urandom(8).hex()
    body = bytearray()
    for name, value in fields.items():
        body += f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n".encode()
    for name, path in (files or {}).items():
        body += (f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"; "
                 f"filename=\"{Path(path).name}\"\r\nContent-Type: application/octet-stream\r\n\r\n").encode()
        body += Path(path).read_bytes() + b"\r\n"
    body += f"--{boundary}--\r\n".encode()
    req = urllib.request.Request(url, data=bytes(body),
                                 headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
    with urllib.request.urlopen(req, timeout=900) as resp:
        return resp.read()


def get(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=900) as resp:
        return resp.read()


def cutout(src: Path, dst: Path, subject: str, seed: int = 42) -> bool:
    """qwen-image-layered, async job flow. layer_2 is the subject with true alpha."""
    prompt = (f"Solid flat green background layer. Top layer: the exact same {subject} "
              f"from the image. Keep it identical to the input image.")
    job = json.loads(post_multipart(api("/workflows/qwen-image-layered"),
                                    {"prompt": prompt, "layers": "2", "seed": str(seed)},
                                    {"image": str(src)}))
    job_id = job.get("job_id")
    if not job_id:
        print(f"    !! no job id: {job}")
        return False
    for _ in range(120):
        time.sleep(5)
        state = json.loads(get(api(f"/jobs/{job_id}")))
        if state.get("status") == "completed":
            dst.write_bytes(get(api(f"/jobs/{job_id}/result?output=layer_2")))
            return True
        if state.get("status") in ("failed", "error"):
            print(f"    !! job {state.get('status')}: {state.get('error')}")
            return False
    print("    !! job timed out")
    return False


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", nargs="*", default=[], help="pose names to regenerate")
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    raw = SRC / "raw"
    alpha = SRC / "alpha"
    raw.mkdir(parents=True, exist_ok=True)
    alpha.mkdir(parents=True, exist_ok=True)

    if not REF.exists():
        sys.exit(f"missing reference crop: {REF}")

    print("=== Ari the armadillo ===")

    # 1) neutral, conditioned on the cropped mockup reference — CALM, arms down
    neutral = raw / "neutral.png"
    if not neutral.exists() or "neutral" in args.force:
        print("  neutral (qwen-image-edit on ari-ref-crop.png, calm arms-down)")
        neutral.write_bytes(post_multipart(
            api("/workflows/qwen-image-edit?sync=true"),
            {"prompt": NEUTRAL_PROMPT, "seed": str(args.seed)},
            {"image": str(REF)}))

    # 2) derives, each conditioned on the neutral so the character holds
    for pose, action in DERIVES.items():
        dst = raw / f"{pose}.png"
        if dst.exists() and pose not in args.force:
            continue
        print(f"  {pose} (qwen-image-edit from neutral)")
        dst.write_bytes(post_multipart(
            api("/workflows/qwen-image-edit?sync=true"),
            {"prompt": (f"Redraw this exact same armadillo character {action}. Keep the "
                        f"character, face, colours, proportions and art style completely "
                        f"identical to the reference — only the pose changes. Full body, "
                        f"head to feet. {DARK}"),
             "seed": str(args.seed)},
            {"image": str(neutral)}))

    # 3) cutouts
    for pose in POSES:
        src, dst = raw / f"{pose}.png", alpha / f"{pose}.png"
        if not src.exists():
            print(f"  !! missing raw {pose}")
            continue
        if dst.exists() and pose not in args.force:
            continue
        print(f"  cutout {pose}")
        cutout(src, dst, SUBJECT, args.seed)

    # 4) assemble — ~420px canvas (this game budgets 30-80 KB/pose, <=500 KB
    # total, well under counting-treasure-cups' 1024px canvas)
    pack = OUT
    (pack / "poses").mkdir(parents=True, exist_ok=True)
    have = [p for p in POSES if (alpha / f"{p}.png").exists()]
    if "neutral" not in have:
        sys.exit("no neutral cutout — cannot assemble")
    spec_json = SRC / "assemble.json"
    spec_json.write_text(json.dumps({
        "canvas": 440, "maxArt": 386, "baseline": 418,
        "alphaFloor": 8, "bboxThreshold": 24, "quality": 88, "method": 6, "maxUpscale": 2.0,
        "contact": str(SRC / "contact.webp"),
        "poses": [{"pose": p, "source": str(alpha / f"{p}.png"),
                   "output": str(pack / "poses" / f"{p}.webp")} for p in have],
    }, indent=1))
    print(f"  assemble {len(have)} pose(s)")
    result = subprocess.run(
        [sys.executable, str(REPO / "tools" / "pipeline" / "pose_actor_assemble.py"),
         "--spec", str(spec_json)], capture_output=True, text=True)
    print("   ", result.stdout.strip()[:400] or result.stderr.strip()[:400])
    info = {}
    try:
        info = json.loads(result.stdout)
    except Exception:                                            # noqa: BLE001
        pass
    anchor = info.get("anchor") or [0.5, 418 / 440]

    (pack / "poses.json").write_text(json.dumps({
        "format": "qlobe-pose-actor",
        "formatVersion": 1,
        "id": "ari",
        "label": "Ari the armadillo",
        "canvas": [440, 440],
        "anchor": anchor,
        "transition": {"kind": "paper-pop", "durationMs": 220},
        "poses": {p: {"art": f"poses/{p}.webp", "alt": f"Ari the armadillo — {p} pose"}
                  for p in have},
    }, indent=1) + "\n")
    print(f"  wrote {pack / 'poses.json'}")


if __name__ == "__main__":
    main()
