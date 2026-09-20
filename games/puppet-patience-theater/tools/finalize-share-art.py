#!/usr/bin/env python3
"""Finalize the reviewed production splash capture as the 1200x630 share card."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image, ImageOps


GAME = Path(__file__).resolve().parents[1]
ROOT = GAME.parents[1]
SOURCE = GAME / "qa-shots" / "14-og-splash.png"
OUTPUT = GAME / "assets" / "og-image.jpg"
RECEIPT = GAME / "assets" / "source" / "share-finalization.json"


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> int:
    if not SOURCE.is_file():
        raise FileNotFoundError(f"Run tools/qa.mjs first; missing {SOURCE}")
    with Image.open(SOURCE) as opened:
        source = opened.convert("RGB")
        final = ImageOps.fit(source, (1200, 630), Image.Resampling.LANCZOS)
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        final.save(OUTPUT, "JPEG", quality=90, optimize=True, progressive=True)
        source_size = list(source.size)

    receipt = {
        "format": "puppet-patience-share-finalization-v1",
        "source": "games/puppet-patience-theater/qa-shots/14-og-splash.png",
        "sourceDimensions": source_size,
        "sourceSha256": digest(SOURCE),
        "output": {
            "path": str(OUTPUT.relative_to(ROOT)).replace("\\", "/"),
            "dimensions": [1200, 630],
            "sha256": digest(OUTPUT),
            "bytes": OUTPUT.stat().st_size,
        },
        "note": "Deterministic JPEG finalization from the reviewed real-Chrome production splash capture.",
    }
    RECEIPT.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(receipt["output"]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
