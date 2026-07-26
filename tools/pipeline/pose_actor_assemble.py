#!/usr/bin/env python3
"""Deterministic pose-actor assembly (QLOBE Studio v2, Feature N).

Normalizes six extracted pose sprites onto the stable 1024px stage canvas the
`qlobe-pose-actor` format describes, and encodes them as the runtime WebP pack.
This is the server-side counterpart of `tools/build-storybook-poses.py`, which
does the same job for hand-authored alpha PNGs under a game's
`assets/source/pose-alpha/`.

It is a SUBPROCESS helper, not part of the stdlib-only authoring server: the
server shells out to it exactly the way it shells out to
`tools/pipeline/cutout_finalize.py`, ffmpeg, and the whisper-visemes venv. It
uses Pillow (PIL); if PIL is unavailable the caller gets a clear failure, the
same discipline as a missing aligner.

NORMALIZATION RULE (differs from build-storybook-poses.py in exactly one way —
see "shared scale" below):

  1. ALPHA FLOOR. A layered extraction carries a faint sub-threshold alpha film
     over the whole frame (the flag the cutout QA records as
     `alpha-partial-band>2%`), so a plain `getbbox()` returns the entire frame.
     Every alpha value <= `alphaFloor` is zeroed first; the subject bbox is then
     measured on alpha > `bboxThreshold`. Both defaults match the studio's
     existing client-side convention in workspaces/assemble.js (alpha >= 24).
  2. SHARED SCALE. build-storybook-poses.py fits EACH pose independently to
     MAX_ART (`min(900/w, 900/h, 1.0)` per pose), which lets a wide "celebrate"
     and a tall "notice" come out at different character sizes. Here all six
     poses take ONE scale — the most constraining of the per-pose fits:

         scale = min over poses of min(maxArt / w_i, maxArt / h_i)
               = maxArt / max(every width and height in the set)

     so the largest pose in the set touches MAX_ART exactly, every other pose
     keeps its true size relative to it, and a paper-pop swap cannot change how
     big the character is. `maxUpscale` caps the enlargement of a small source.
  3. COMMON BASELINE. Each scaled crop is centred horizontally on the canvas and
     its BOTTOM edge is placed on `baseline`, exactly as the script does, so the
     manifest anchor is [0.5, baseline / canvas] for the whole set.

Usage:
  python3 tools/pipeline/pose_actor_assemble.py --spec spec.json

The spec is JSON:
  { "canvas": 1024, "maxArt": 900, "baseline": 972, "alphaFloor": 8,
    "bboxThreshold": 24, "quality": 90, "method": 6, "maxUpscale": 2.0,
    "contact": "…/contact.webp",            // optional 3x2 contact strip
    "poses": [ {"pose": "neutral", "source": "…png", "output": "…webp"}, … ] }

A single JSON object is emitted on stdout:
  { "ok": bool, "reason": str|null, "scale": f, "anchor": [f, f],
    "canvas": [w, h], "poses": {name: {box, sourceSize, artSize, placed, bytes}},
    "contactBytes": int|null, "totalBytes": int }
"""

from __future__ import annotations

import argparse
import json
import os
import sys

CANVAS = 1024
MAX_ART = 900
BASELINE = 972
ALPHA_FLOOR = 8         # kill the sub-threshold extraction film
BBOX_THRESHOLD = 24     # workspaces/assemble.js alphaBoxes() uses alpha >= 24
MIN_TOP = 0             # a scaled pose may reach the top of the canvas
MAX_UPSCALE = 2.0


def _floored(image, alpha_floor):
    """RGBA copy with every alpha <= alpha_floor forced to 0."""
    from PIL import Image
    if alpha_floor <= 0:
        return image
    alpha = image.getchannel("A")
    cleaned = alpha.point(lambda v: 0 if v <= alpha_floor else v)
    out = image.copy()
    out.putalpha(cleaned)
    return out


def _subject_box(image, threshold):
    """Tight box of the subject, ignoring alpha at or below `threshold`."""
    mask = image.getchannel("A").point(lambda v: 255 if v > threshold else 0)
    return mask.getbbox()


def assemble(spec):
    try:
        from PIL import Image
    except Exception as exc:  # noqa: BLE001 — surfaced verbatim to the caller
        return {"ok": False, "reason": f"Pillow (PIL) unavailable: {exc}",
                "scale": None, "anchor": None, "canvas": None, "poses": {},
                "contactBytes": None, "totalBytes": 0}

    canvas = int(spec.get("canvas", CANVAS))
    max_art = int(spec.get("maxArt", MAX_ART))
    baseline = int(spec.get("baseline", BASELINE))
    alpha_floor = int(spec.get("alphaFloor", ALPHA_FLOOR))
    threshold = int(spec.get("bboxThreshold", BBOX_THRESHOLD))
    quality = int(spec.get("quality", 90))
    method = int(spec.get("method", 6))
    max_upscale = float(spec.get("maxUpscale", MAX_UPSCALE))
    entries = spec.get("poses") or []
    if not entries:
        return {"ok": False, "reason": "no poses to assemble", "scale": None,
                "anchor": None, "canvas": None, "poses": {}, "contactBytes": None,
                "totalBytes": 0}

    # ---- pass 1: measure every subject box on one common footing --------------
    measured = []
    for entry in entries:
        image = _floored(Image.open(entry["source"]).convert("RGBA"), alpha_floor)
        box = _subject_box(image, threshold)
        if not box:
            return {"ok": False, "reason": f"{entry['pose']}: no visible pixels above alpha {threshold}",
                    "scale": None, "anchor": None, "canvas": None, "poses": {},
                    "contactBytes": None, "totalBytes": 0}
        measured.append((entry, image, box))

    # ---- the ONE scale the whole set shares (see the module docstring) --------
    scale = min(min(max_art / (box[2] - box[0]), max_art / (box[3] - box[1]))
                for _entry, _image, box in measured)
    scale = min(scale, max_upscale)

    # ---- pass 2: crop, resize, place on the common baseline, encode -----------
    poses = {}
    tiles = []
    total = 0
    for entry, image, box in measured:
        crop = image.crop(box)
        width = max(1, round(crop.width * scale))
        height = max(1, round(crop.height * scale))
        if (width, height) != crop.size:
            crop = crop.resize((width, height), Image.LANCZOS)
        top = baseline - height
        if top < MIN_TOP:
            return {"ok": False, "reason": f"{entry['pose']}: does not fit the normalized stage canvas",
                    "scale": scale, "anchor": None, "canvas": [canvas, canvas],
                    "poses": poses, "contactBytes": None, "totalBytes": total}
        left = round((canvas - width) / 2)
        tile = Image.new("RGBA", (canvas, canvas))
        tile.alpha_composite(crop, (left, top))
        tile.save(entry["output"], "WEBP", quality=quality, method=method, exact=True)
        try:
            size = os.path.getsize(entry["output"])
        except OSError:
            size = 0
        total += size
        tiles.append(tile)
        poses[entry["pose"]] = {
            "box": list(box),
            "sourceSize": list(image.size),
            "artSize": [width, height],
            "placed": [left, top],
            "bytes": size,
        }

    # ---- optional 3x2 contact strip (the Review card's thumbnail) -------------
    contact_bytes = None
    contact_path = spec.get("contact")
    if contact_path:
        cell = canvas // 3
        strip = Image.new("RGBA", (cell * 3, cell * 2))
        for index, tile in enumerate(tiles[:6]):
            thumb = tile.resize((cell, cell), Image.LANCZOS)
            strip.alpha_composite(thumb, ((index % 3) * cell, (index // 3) * cell))
        strip.save(contact_path, "WEBP", quality=82, method=method, exact=True)
        try:
            contact_bytes = os.path.getsize(contact_path)
        except OSError:
            contact_bytes = 0

    return {
        "ok": True,
        "reason": None,
        "scale": round(scale, 6),
        "anchor": [0.5, baseline / canvas],
        "canvas": [canvas, canvas],
        "poses": poses,
        "contactBytes": contact_bytes,
        "totalBytes": total,
    }


def main():
    ap = argparse.ArgumentParser(description="Assemble a qlobe-pose-actor WebP pack")
    ap.add_argument("--spec", required=True, help="path to the JSON assembly spec")
    args = ap.parse_args()
    with open(args.spec, "r", encoding="utf-8") as handle:
        spec = json.load(handle)
    result = assemble(spec)
    print(json.dumps(result))
    sys.exit(0 if result.get("ok") else 3)


if __name__ == "__main__":
    main()
