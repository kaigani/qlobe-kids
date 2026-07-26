#!/usr/bin/env python3
"""Derive the game's stage plates from the concept cutouts. Deterministic, no model.

The compositing trick this game depends on: a container (cup or chest) is drawn
TWICE — once whole as the back plate, and once masked to everything below its near
rim as the FRONT plate. Treasure sprites are drawn between the two, so they are
visibly *inside* the container. Because the front plate is literally the same
pixels as the back plate, an empty container composites pixel-identical to the
source art and the seam is invisible.

Inputs live in assets/source/ (see ASSETS.md for their provenance); outputs land in
assets/. Re-run after replacing any source cutout:

    python3 games/counting-treasure-cups/tools/build-plates.py
    python3 games/counting-treasure-cups/tools/build-plates.py --proof   # + QA sheet
"""

from __future__ import annotations

import argparse
import json
import math
import os
from pathlib import Path

from PIL import Image, ImageDraw

GAME = Path(__file__).resolve().parents[1]
SRC = GAME / "assets" / "source"
OUT = GAME / "assets"

# Alpha below this is extraction film, not art — zero it before measuring anything.
ALPHA_FLOOR = 6

# --- Cup (assets/source/ship-plate.png, 1024x768) -------------------------------
# The concept art is 4:3, but the ship's deck has to reach both screen edges on a
# 16:9 tablet while the cup stays a sensible size. So the plate is mirror-extended
# by SHIP_PAD on each side: the deck planking and railing continue outward, and the
# result is wide enough to span the width at a scale that keeps the cup in
# proportion. Every ship coordinate in config.json is offset by SHIP_PAD.
SHIP_PAD = 260

# The bowl mouth is an ellipse and the near lip is its lower arc; everything from
# that arc down is the front plate. These are the INNER lip, measured off the
# plate by drawing candidates over it — an outer-lip cut leaves a band where
# treasure shows on top of the gold rim.
CUP_RIM = dict(cx=782, cy=177, ax=157, ay=20)

# --- Chest (assets/source/chest-foreground-open-alpha.png, 1024x792) ------------
# The near rim of the box is LEVEL at y=368 — measured by detecting the top of the
# gold band across every column, which reads 368 from x=370 to x=670. An earlier
# hand-read had it sloping up to y=322 on the right, which cut the front plate too
# high and let coins show over the right-hand rim.
CHEST_RIM = ((0, 368), (1024, 368))


def load(path: Path) -> Image.Image:
    im = Image.open(path).convert("RGBA")
    a = im.getchannel("A").point(lambda v: 0 if v <= ALPHA_FLOOR else v)
    im.putalpha(a)
    return im


def mirror_extend(im: Image.Image, pad: int) -> Image.Image:
    """Widen by mirroring the outer `pad` columns outward — the deck planking and
    railing read as continuing past the original frame."""
    left = im.crop((0, 0, pad, im.height)).transpose(Image.FLIP_LEFT_RIGHT)
    right = im.crop((im.width - pad, 0, im.width, im.height)).transpose(Image.FLIP_LEFT_RIGHT)
    out = Image.new("RGBA", (im.width + pad * 2, im.height))
    out.paste(left, (0, 0))
    out.paste(im, (pad, 0))
    out.paste(right, (pad + im.width, 0))
    return out


def front_from_ellipse(im: Image.Image, cx, cy, ax, ay) -> Image.Image:
    """Keep everything at or below the lower arc of the mouth ellipse."""
    mask = Image.new("L", im.size, 0)
    d = ImageDraw.Draw(mask)
    for x in range(im.size[0]):
        t = (x - cx) / ax
        y = cy + ay * math.sqrt(1 - t * t) if abs(t) <= 1 else cy
        d.line([(x, round(y)), (x, im.size[1])], fill=255)
    out = im.copy()
    out.putalpha(Image.composite(im.getchannel("A"), Image.new("L", im.size, 0), mask))
    return out


def front_from_line(im: Image.Image, p0, p1) -> Image.Image:
    """Keep everything at or below the straight near-rim line through p0..p1."""
    (x0, y0), (x1, y1) = p0, p1
    mask = Image.new("L", im.size, 0)
    d = ImageDraw.Draw(mask)
    for x in range(im.size[0]):
        t = (x - x0) / (x1 - x0)
        d.line([(x, round(y0 + t * (y1 - y0))), (x, im.size[1])], fill=255)
    out = im.copy()
    out.putalpha(Image.composite(im.getchannel("A"), Image.new("L", im.size, 0), mask))
    return out


def save(im: Image.Image, name: str, colors: int | None = 224) -> None:
    path = OUT / name
    if colors:
        im = im.quantize(colors=colors, method=Image.FASTOCTREE)
    im.save(path, "PNG", optimize=True)
    print(f"  {name:22s} {im.size[0]}x{im.size[1]}  {os.path.getsize(path)/1024:6.1f} KB")


def build_full_chest() -> None:
    """The end-screen reward: the chest heaped with treasure.

    An empty chest is a flat payoff for "What a haul!", so this pre-composites a
    full one using the SAME back/treasure/front sandwich and the SAME slot
    geometry the game plays with — read straight out of config.json, so the
    reward can never drift from what the child just filled.
    """
    config = json.loads((GAME / "config.json").read_text())
    beach = config["stages"]["beach"]
    treasures = config["treasures"]

    back = load(OUT / "beach-back.png")
    front = load(OUT / "beach-front.png")
    size = round(beach["itemScale"] * beach["plate"][0])

    # A rich mixed haul, front row first so later pieces sit behind (as in play).
    order = ["coin", "gem-red", "gem-blue", "coin", "gem-green", "coin", "gem-purple", "coin"]
    art = {"coin": treasures["coin"][0], **{Path(p).stem: p for p in treasures["gem"]}}

    layer = Image.new("RGBA", back.size)
    for i, key in reversed(list(enumerate(order))):        # back of the heap first
        src = GAME / art[key].lstrip("./")
        piece = Image.open(src).convert("RGBA")
        piece = piece.resize((size, round(size * piece.height / piece.width)), Image.LANCZOS)
        cx, cy = beach["slots"][i]
        layer.alpha_composite(piece, (cx - piece.width // 2, cy - piece.height // 2))

    out = back.copy()
    out.alpha_composite(layer)
    out.alpha_composite(front)
    save(out, "chest-full.png", colors=224)


def proof_sheet() -> None:
    """Composite back → marker → front for each container, so the seam can be eyeballed."""
    for stem, marker_boxes in (
        ("ship", [(430 + SHIP_PAD, 120, 170), (512 + SHIP_PAD, 100, 170), (594 + SHIP_PAD, 120, 170)]),
        ("beach", [(430, 290, 150), (512, 268, 150), (594, 290, 150)]),
    ):
        back = Image.open(OUT / f"{stem}-back.png").convert("RGBA")
        front = Image.open(OUT / f"{stem}-front.png").convert("RGBA")
        sheet = Image.new("RGBA", back.size, (255, 0, 255, 255))
        sheet.alpha_composite(back)
        d = ImageDraw.Draw(sheet)
        for cx, cy, size in marker_boxes:
            d.ellipse([cx - size // 2, cy - size // 2, cx + size // 2, cy + size // 2],
                      fill=(0, 220, 60, 255), outline=(0, 0, 0, 255), width=4)
        sheet.alpha_composite(front)
        out = GAME / "assets" / "source" / f"proof-{stem}.png"
        sheet.convert("RGB").save(out)
        print(f"  proof-{stem}.png")


# Treasure sprites and the tile card: trim the extraction film, downscale, and
# quantize. 300 px is twice the largest on-screen size on a retina tablet.
SPRITES = [
    ("ui-diamond-red-alpha.png", "gem-red.png", 300),
    ("ui-diamond-blue-alpha.png", "gem-blue.png", 300),
    ("ui-diamond-green-alpha.png", "gem-green.png", 300),
    ("ui-diamond-purple-alpha.png", "gem-purple.png", 300),
    ("ui-gold-coin-alpha.png", "coin.png", 300),
    ("ui-tile-alpha.png", "tile.png", 320),
]


def build_sprite(src: Path, maxdim: int) -> Image.Image:
    im = load(src)
    box = im.getchannel("A").point(lambda v: 255 if v >= 16 else 0).getbbox()
    im = im.crop(box)
    s = min(maxdim / im.width, maxdim / im.height, 1.0)
    if s < 1.0:
        im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
    return im


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--proof", action="store_true", help="also write the QA proof sheets")
    args = ap.parse_args()

    print("treasure sprites:")
    for src, dst, maxdim in SPRITES:
        if not (SRC / src).exists():
            print(f"  -- {dst} (source missing, keeping existing)")
            continue
        save(build_sprite(SRC / src, maxdim), dst, colors=192)

    print("cup / ship stage:")
    ship = mirror_extend(load(SRC / "ship-plate.png"), SHIP_PAD)
    save(ship, "ship-back.png")
    save(front_from_ellipse(ship, **CUP_RIM), "ship-front.png")

    print("chest / beach stage:")
    chest = load(SRC / "chest-foreground-open-alpha.png")
    save(chest, "beach-back.png")
    save(front_from_line(chest, *CHEST_RIM), "beach-front.png")

    print("end-screen reward:")
    build_full_chest()

    if args.proof:
        print("proof sheets:")
        proof_sheet()


if __name__ == "__main__":
    main()
