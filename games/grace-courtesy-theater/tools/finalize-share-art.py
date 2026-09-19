#!/usr/bin/env python3
"""Create the public hub tile from the cast-matched source."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image, ImageOps


GAME = Path(__file__).resolve().parents[1]
ROOT = GAME.parents[1]
SOURCE = GAME / "assets" / "source" / "gpt-image-2" / "hub-cast-match-source.png"
HUB = ROOT / "assets" / "hub" / "tiles" / "grace-courtesy-theater.jpg"
RECEIPT = GAME / "assets" / "source" / "share-finalization.json"


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def save_fit(source: Image.Image, destination: Path, size: tuple[int, int], *, quality: int) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    # Centering slightly above the geometric middle keeps both faces, patches,
    # the heart, and the lower edge of the theatrical valance in wide previews.
    fitted = ImageOps.fit(
        source,
        size,
        method=Image.Resampling.LANCZOS,
        centering=(0.5, 0.46),
    )
    fitted.save(destination, "JPEG", quality=quality, optimize=True, progressive=True)


def main() -> int:
    if not SOURCE.is_file():
        raise FileNotFoundError(SOURCE)
    with Image.open(SOURCE) as opened:
        source = opened.convert("RGB")
        save_fit(source, HUB, (640, 533), quality=92)
        source_size = list(source.size)

    receipt = {
        "format": "grace-courtesy-theater-share-finalization-v1",
        "source": str(SOURCE.relative_to(ROOT)).replace("\\", "/"),
        "sourceDimensions": source_size,
        "sourceSha256": digest(SOURCE),
        "outputs": {
            str(HUB.relative_to(ROOT)).replace("\\", "/"): {
                "dimensions": [640, 533],
                "sha256": digest(HUB),
            },
        },
        "note": "OpenAI image edit matched the approved in-game cast; deterministic crop/encode only.",
    }
    RECEIPT.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"hub": str(HUB)}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
