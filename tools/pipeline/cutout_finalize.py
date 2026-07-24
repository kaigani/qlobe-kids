#!/usr/bin/env python3
"""Deterministic cutout finalize + alpha QA (QLOBE Studio v2 spec §11, cutout standard).

Consumes the `qwen-image-layered` layer_2 RGBA PNG (the subject with true alpha)
and produces the shipping cutout plus its QA artifacts. This is the "finalize +
QA" stage of the layered-extraction standard documented in the project-level
`local-genai` skill:

  alpha histogram (record the partial-band %) + magenta composite (eyeball the
  silhouette) -> bbox-crop + pad -> resize to the platform target -> PNG.

It is a SUBPROCESS helper, not part of the stdlib-only authoring server: the
server shells out to it exactly the way it shells out to ffmpeg and the
whisper-visemes venv. It uses Pillow (PIL); if PIL is unavailable the caller
gets a clear non-zero exit, the same failure discipline as a missing aligner.

Usage:
  python3 tools/pipeline/cutout_finalize.py \
    --input layer_2.png --output final.png --magenta qa-magenta.png \
    --max-size 640 --pad 12

Emits a single JSON object on stdout describing the QA result:
  { "pass": bool, "reason": str|null, "flags": [str],
    "alpha": { "transparentPct": f, "opaquePct": f, "partialPct": f },
    "bbox": [l,t,r,b]|null, "sourceSize": [w,h], "finalSize": [w,h] }

QA gate (auto-retry drivers key off `pass`):
  - fully transparent (no subject extracted)      -> fail  "empty extraction"
  - near-blank opaque core (< MIN_OPAQUE_PCT)      -> fail  "near-blank extraction"
  - background not removed (< MIN_TRANSPARENT_PCT) -> fail  "background not removed"
  - partial-alpha band > PARTIAL_FLAG_PCT          -> flag  (recorded, not a fail)
"""

from __future__ import annotations

import argparse
import json
import sys

MIN_TRANSPARENT_PCT = 5.0   # below this the dark ground was not separated out
MIN_OPAQUE_PCT = 1.0        # below this essentially nothing was extracted
PARTIAL_FLAG_PCT = 2.0      # halo / fringe warning threshold (spec: flag >2%)
MAGENTA = (255, 0, 255)


def finalize(input_path, output_path, magenta_path, max_size, pad):
    try:
        from PIL import Image
    except Exception as exc:  # noqa: BLE001 — surfaced verbatim to the caller
        return {"pass": False, "reason": f"Pillow (PIL) unavailable: {exc}",
                "flags": [], "alpha": None, "bbox": None,
                "sourceSize": None, "finalSize": None}

    img = Image.open(input_path).convert("RGBA")
    w, h = img.size
    alpha = img.getchannel("A")
    hist = alpha.histogram()
    total = w * h
    transparent = hist[0]
    opaque = hist[255]
    partial = total - transparent - opaque
    pct = lambda n: round(100.0 * n / total, 3) if total else 0.0
    alpha_stats = {
        "transparentPct": pct(transparent),
        "opaquePct": pct(opaque),
        "partialPct": pct(partial),
    }

    bbox = alpha.getbbox()  # tight box of every non-zero-alpha pixel
    flags = []
    if alpha_stats["partialPct"] > PARTIAL_FLAG_PCT:
        flags.append(f"alpha-partial-band>{PARTIAL_FLAG_PCT:g}%")

    reason = None
    if bbox is None or alpha_stats["opaquePct"] < 0.001:
        reason = "empty extraction (fully transparent layer_2)"
    elif alpha_stats["opaquePct"] < MIN_OPAQUE_PCT:
        reason = f"near-blank extraction (opaque core {alpha_stats['opaquePct']}% < {MIN_OPAQUE_PCT}%)"
    elif alpha_stats["transparentPct"] < MIN_TRANSPARENT_PCT:
        reason = f"background not removed (transparent {alpha_stats['transparentPct']}% < {MIN_TRANSPARENT_PCT}%)"

    result = {
        "pass": reason is None,
        "reason": reason,
        "flags": flags,
        "alpha": alpha_stats,
        "bbox": list(bbox) if bbox else None,
        "sourceSize": [w, h],
        "finalSize": None,
    }

    # Build a review image: the bbox crop + pad (when a subject exists), else the
    # whole frame — downscaled to the target. Used for the magenta composite, which
    # is ALWAYS written (a QA-failed extraction keeps its magenta so a human can see
    # exactly what went wrong), and, only on PASS, for the shipping cutout.
    if bbox is not None:
        left, top, right, bottom = bbox
        left = max(0, left - pad); top = max(0, top - pad)
        right = min(w, right + pad); bottom = min(h, bottom + pad)
        review = img.crop((left, top, right, bottom))
    else:
        review = img
    rw, rh = review.size
    if max(rw, rh) > max_size:
        s = max_size / max(rw, rh)
        review = review.resize((max(1, round(rw * s)), max(1, round(rh * s))), Image.LANCZOS)

    bg = Image.new("RGBA", review.size, MAGENTA + (255,))
    bg.alpha_composite(review)
    bg.convert("RGB").save(magenta_path, "PNG", optimize=True)

    if reason is not None:
        return result  # QA failed — magenta kept for review, but no shipping file

    review.save(output_path, "PNG", optimize=True)
    result["finalSize"] = list(review.size)
    return result


def main():
    ap = argparse.ArgumentParser(description="Finalize + QA a layered-extraction cutout")
    ap.add_argument("--input", required=True)
    ap.add_argument("--output", required=True)
    ap.add_argument("--magenta", required=True)
    ap.add_argument("--max-size", type=int, default=640)
    ap.add_argument("--pad", type=int, default=12)
    args = ap.parse_args()
    result = finalize(args.input, args.output, args.magenta, args.max_size, args.pad)
    print(json.dumps(result))
    sys.exit(0 if result.get("pass") else 3)


if __name__ == "__main__":
    main()
