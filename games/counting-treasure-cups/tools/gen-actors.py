#!/usr/bin/env python3
"""Build the Captain Goldie and Skipper pose-actor packs.

Four stages, each idempotent (a stage whose output exists is skipped unless
--force names it):

  1. neutral   krea2-turbo-t2i on a flat dark charcoal ground
  2. derives   qwen-image-edit, conditioned on the NEUTRAL image so the character,
               outfit, palette and style stay identical across all six poses
  3. cutout    qwen-image-layered (async job flow — sync=true returns the
               composite, not the cutout)
  4. assemble  tools/pipeline/pose_actor_assemble.py normalizes the six sprites
               onto the 1024 canvas at ONE shared scale and a common baseline,
               so a paper-pop swap cannot change how big the character is

    export QLOBE_QWEN_URL=http://<host>:<port>
    python3 games/counting-treasure-cups/tools/gen-actors.py
    python3 games/counting-treasure-cups/tools/gen-actors.py --actor skipper --force neutral

Intermediates land in assets/source/actors/<id>/ and are kept, so a single bad
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
SRC = GAME / "assets" / "source" / "actors"
OUT = GAME / "assets" / "pose-actors"

POSES = ["neutral", "enter", "notice", "interact", "react", "celebrate"]

DARK = ("The background is a perfectly flat, solid, uniform dark charcoal background, "
        "no gradient, no texture, no shadows on the background.")

STYLE = ("Bright, soft 3D cartoon style with rounded, simplified forms and cheerful "
         "proportions, saturated colours, smooth shading, soft highlights and a toy-like "
         "glossy finish. Premium preschool learning app character art. Full body, head to "
         "feet, standing centred, facing the viewer. No text, no UI, no props other than "
         "those described, no weapons, nothing frightening.")

ACTORS = {
    "captain-goldie": {
        "label": "Captain Goldie",
        # Neutral must be CALM with arms down — a cheerful raised-arm reference
        # bleeds its energy into every derived pose.
        "neutral": (
            "A warm, friendly woman pirate captain for a preschool game, standing calmly at "
            "rest with both arms relaxed down at her sides, a gentle closed-mouth smile. "
            "Round kind face, warm brown skin, dark curly hair, gold hoop earrings. A big "
            "plum-purple tricorn hat with a soft gold feather. A deep red long coat with gold "
            "trim and big cuffs over a cream shirt, a wide brown belt, brown boots. "
            "Absolutely no weapons, no sword, no eyepatch, no scars, no skulls. "
        ),
        "derives": {
            "enter": "walking in from the side with one arm raised in a friendly open-palm wave, smiling warmly",
            "notice": "leaning forward slightly with one hand cupped near her ear, eyebrows raised, curious and attentive",
            "interact": "talking to the viewer, mouth open mid-sentence, one hand open and gesturing invitingly forward",
            "react": "a gentle playful surprise, both hands raised a little in front of her, shoulders up, eyebrows high, kind expression",
            "celebrate": "cheering with both arms raised high above her head, hat tipped back, a big open happy smile",
        },
    },
    "skipper": {
        "label": "Skipper the parrot",
        "neutral": (
            "A small bright cartoon macaw parrot for a preschool game, perched calmly at rest "
            "with wings folded neatly against his body, standing on both feet, beak closed, "
            "one big round friendly eye visible. Scarlet red body and head, blue and yellow "
            "wing flashes, a long red and blue tail, a pale curved beak, grey feet. "
            "Cheerful and soft, never fierce. "
        ),
        "derives": {
            "enter": "flying in from the side with both wings spread wide mid-flap, tail streaming behind",
            "notice": "head tilted sharply to one side, one eye wide, crest feathers lifted, curious",
            "interact": "beak open mid-squawk talking to the viewer, one wing lifted and pointing forward",
            "react": "hopping backwards with both wings flared out and feathers ruffled, comically startled but happy",
            "celebrate": "both wings thrown up high above his head, beak wide open cheering, tail fanned out",
        },
    },
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
    ap.add_argument("--actor", nargs="*", default=list(ACTORS))
    ap.add_argument("--force", nargs="*", default=[], help="pose names to regenerate")
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    for actor_id in args.actor:
        spec = ACTORS[actor_id]
        raw = SRC / actor_id / "raw"
        alpha = SRC / actor_id / "alpha"
        raw.mkdir(parents=True, exist_ok=True)
        alpha.mkdir(parents=True, exist_ok=True)
        print(f"\n=== {spec['label']} ===")

        # 1) neutral
        neutral = raw / "neutral.png"
        if not neutral.exists() or "neutral" in args.force:
            print("  neutral (krea2-turbo-t2i)")
            neutral.write_bytes(post_multipart(
                api("/workflows/krea2-turbo-t2i?sync=true"),
                {"prompt": spec["neutral"] + STYLE + " " + DARK,
                 "width": "1024", "height": "1024", "seed": str(args.seed)}))

        # 2) derives, each conditioned on the neutral so the character holds
        for pose, action in spec["derives"].items():
            dst = raw / f"{pose}.png"
            if dst.exists() and pose not in args.force:
                continue
            print(f"  {pose} (qwen-image-edit from neutral)")
            dst.write_bytes(post_multipart(
                api("/workflows/qwen-image-edit?sync=true"),
                {"prompt": (f"Redraw this exact same character {action}. Keep the character, "
                            f"face, outfit, colours, proportions and art style completely "
                            f"identical to the reference — only the pose changes. Full body, "
                            f"head to feet. {DARK}"),
                 "seed": str(args.seed)},
                {"image": str(neutral)}))

        # 3) cutouts
        subject = spec["neutral"].split(",")[0].strip().rstrip(".")
        for pose in POSES:
            src, dst = raw / f"{pose}.png", alpha / f"{pose}.png"
            if not src.exists():
                print(f"  !! missing raw {pose}")
                continue
            if dst.exists() and pose not in args.force:
                continue
            print(f"  cutout {pose}")
            cutout(src, dst, subject, args.seed)

        # 4) assemble
        pack = OUT / actor_id
        (pack / "poses").mkdir(parents=True, exist_ok=True)
        have = [p for p in POSES if (alpha / f"{p}.png").exists()]
        if "neutral" not in have:
            print("  !! no neutral cutout — cannot assemble")
            continue
        spec_json = SRC / actor_id / "assemble.json"
        spec_json.write_text(json.dumps({
            "canvas": 1024, "maxArt": 900, "baseline": 972,
            "alphaFloor": 8, "bboxThreshold": 24, "quality": 90, "method": 6, "maxUpscale": 2.0,
            "contact": str(SRC / actor_id / "contact.webp"),
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
        anchor = info.get("anchor") or [0.5, 972 / 1024]

        (pack / "poses.json").write_text(json.dumps({
            "format": "qlobe-pose-actor",
            "formatVersion": 1,
            "id": actor_id,
            "label": spec["label"],
            "canvas": [1024, 1024],
            "anchor": anchor,
            "transition": {"kind": "paper-pop", "durationMs": 220},
            "poses": {p: {"art": f"poses/{p}.webp", "alt": f"{spec['label']} — {p} pose"}
                      for p in have},
        }, indent=1) + "\n")
        print(f"  wrote {pack / 'poses.json'}")


if __name__ == "__main__":
    main()
