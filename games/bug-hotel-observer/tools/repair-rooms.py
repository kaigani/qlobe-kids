#!/usr/bin/env python3
"""One-off repair jobs for assets that resisted the standard gen-art.py ladder.

Recorded here (committed) for provenance rather than run as ad-hoc curl:

  1. bg-room-bark   — round-2 sibling-swap diorama had correct materials and
                      single-room composition but pitch-black hollows; this
                      edit lightens the hollows on that exact image.
  2. bg-room-log    — material-swap conditioned on the REPAIRED bark diorama
                      (the anchor reference kept re-rendering the whole hotel
                      facade at every seed; see gen-art.py ROOM_SIBLING_SWAP
                      history in the sidecars).
  3. bug-roly-poly-happy — the edit model recoloured the grey plates on four
                      consecutive attempts; this take changes ONLY the face.

Usage:  QLOBE_QWEN_URL=http://<host>:<port> python3 tools/repair-rooms.py
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import importlib.util

_spec = importlib.util.spec_from_file_location(
    "gen_art", Path(__file__).parent / "gen-art.py")
gen_art = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(gen_art)

RAW = gen_art.RAW_EDIT
PAPER_GARDEN = gen_art.PAPER_GARDEN
CUTOUT_BG = gen_art.CUTOUT_BG

JOBS = [
    dict(
        id="bg-room-bark",
        ref=RAW / "bg-room-bark-round2-rejected.keep",
        out=RAW / "bg-room-bark.png",
        prompt=(
            'Keep this exact picture: same composition, same cut-paper layers, same '
            'colours, same lighting. Change only the inside of the arched hollows: '
            'instead of solid black, each hollow is softly lit warm kraft-brown paper '
            'in gentle shadow, as if soft daylight reaches a little way inside a cosy '
            'paper cave. Everything else stays identical. ' + PAPER_GARDEN
        ),
    ),
    dict(
        id="bg-room-log",
        ref=RAW / "bg-room-bark.png",  # the repaired bark diorama
        out=RAW / "bg-room-log.png",
        prompt=(
            'Keep the exact same composition, camera, framing, arched hollows in the '
            'same positions, warm lighting and layered cut-paper diorama construction '
            'as the reference image. Change only the materials: the torn bark shingles '
            'become stacked paper log slices with concentric cut rings in soft '
            'grey-brown weathered wood tones, with dark crumbly paper soil along the '
            'bottom edge, a few small pale cream paper bracket fungus shelves, and '
            'little cushions of deep green paper moss. The arched hollows stay softly '
            'lit warm shadowed paper caves. Empty hollows: absolutely no insects, no '
            'bugs, no creatures, no animals, no eyes. ' + PAPER_GARDEN
        ),
    ),
    dict(
        id="bug-roly-poly-happy",
        ref=RAW / "bug-roly-poly-idle.png",
        out=RAW / "bug-roly-poly-happy.png",
        prompt=(
            'This exact papercraft pill woodlouse, completely unchanged: same slate-grey '
            'armour plates with the same markings, same pose, same legs, same antennae, '
            'same size, same camera angle. The ONLY difference: its eyes are open wider '
            'with delight and its mouth is an open happy smile with rosy paper cheeks. '
            'Do not change any plate colour. ' + CUTOUT_BG + ' ' + PAPER_GARDEN
        ),
    ),
]


def main() -> None:
    for job in JOBS:
        ref = Path(job["ref"])
        if not ref.exists():
            sys.exit(f"missing ref {ref}")
        print(f"[repair] {job['id']} ...", flush=True)
        png = gen_art.call_edit(job["prompt"], ref, seed=42)
        Path(job["out"]).write_bytes(png)
        sidecar = Path(str(job["out"]) + ".json")
        sidecar.write_text(json.dumps(dict(
            id=job["id"], workflow="qwen-image-edit", prompt=job["prompt"],
            seed=42, ref=str(ref.name), repaired=True,
            generated_at=time.strftime("%Y-%m-%dT%H:%M:%S"),
        ), indent=2))
        print(f"[repair] {job['id']} ok ({Path(job['out']).stat().st_size} bytes)")


if __name__ == "__main__":
    main()
