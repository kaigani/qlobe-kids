#!/usr/bin/env python3
"""Curate the approved Studio/Krea source into the platform hub tile.

Generation itself happens in QLOBE Studio with the ``menu-game-tile``
template. This deterministic tail archives its source and recipe, then makes
the exact 640x533 JPEG consumed by the hub registry.
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path

from PIL import Image


GAME = Path(__file__).resolve().parents[1]
REPO = GAME.parents[1]
MEDIA = REPO / "shared" / "media" / "nature-scavenger-hunt-hub"
ARCHIVE = GAME / "assets" / "source" / "local-api" / "hub"
TILE = REPO / "assets" / "hub" / "tiles" / "nature-scavenger-hunt.jpg"


def main() -> None:
    source = MEDIA / "nature-scavenger-hunt-hub.png"
    recipe = MEDIA / "recipe.json"
    if not source.is_file() or not recipe.is_file():
        raise SystemExit("Generate nature-scavenger-hunt-hub in QLOBE Studio first")

    ARCHIVE.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, ARCHIVE / "krea2-hub-master.png")

    data = json.loads(recipe.read_text("utf-8"))
    data["qa"] = {
        "status": "accepted",
        "notes": "Strong silhouette, one focal treasure, blank clipboard, no text; hand-curated for the platform hub.",
    }
    data.pop("created", None)
    (ARCHIVE / "recipe.json").write_text(json.dumps(data, indent=2) + "\n", "utf-8")

    TILE.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(source) as image:
        image = image.convert("RGB").resize((640, 533), Image.Resampling.LANCZOS)
        image.save(TILE, "JPEG", quality=90, optimize=True, progressive=True)
    print(f"archived {source.relative_to(REPO)}")
    print(f"wrote {TILE.relative_to(REPO)} (640x533)")


if __name__ == "__main__":
    main()
