#!/usr/bin/env python3
"""Deterministically prepare Garden Delivery artwork from approved masters."""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
SRC = ROOT / "games/garden-delivery-game/assets/source/gpt-image-2"
ASSETS = ROOT / "games/garden-delivery-game/assets"

def grid_crop(name, cols, rows, outputs, folder="cells"):
    im = Image.open(SRC / name).convert("RGB")
    expected = {"character-props-magenta-edit.png": (1254, 1254),
                "flowers-magenta-edit.png": (1448, 1086),
                "flowers-sheet.png": (1448, 1086),
                "ui-effects-sheet.png": (1448, 1086)}[name]
    assert im.size == expected, f"{name}: expected {expected}, got {im.size}"
    xs = [round(i * im.width / cols) for i in range(cols + 1)]
    ys = [round(i * im.height / rows) for i in range(rows + 1)]
    outdir = SRC / folder; outdir.mkdir(parents=True, exist_ok=True)
    assert len(outputs) == cols * rows
    for i, outname in enumerate(outputs):
        x, y = i % cols, i // cols
        cell = im.crop((xs[x], ys[y], xs[x+1], ys[y+1]))
        cell.save(outdir / f"{outname}.png", format="PNG", optimize=True)

def main():
    # The accepted dark-ground masters are retained beside these high-fidelity
    # GPT Image edits. The edits change only the background to the imagegen
    # skill's removable magenta key so no private source upload is required.
    grid_crop("character-props-magenta-edit.png", 2, 2,
              ["sunny-carry-source", "sunny-cheer-source", "bucket-source", "garden-helper-source"])
    grid_crop("flowers-magenta-edit.png", 3, 2,
              ["rose-thirsty", "tulip-thirsty", "daisy-thirsty", "rose-bloom", "tulip-bloom", "daisy-bloom"])
    grid_crop("flowers-sheet.png", 3, 2,
              ["rose-thirsty", "tulip-thirsty", "daisy-thirsty", "rose-bloom", "tulip-bloom", "daisy-bloom"],
              folder="original-cells")
    grid_crop("ui-effects-sheet.png", 4, 2,
              ["flower-card-source", "balance-rail-source", "pour-rail-source", "clay-button-source",
               "petal-source", "water-drop-source", "water-stream-source", "water-splash-source"])

    bgdir = ASSETS / "backgrounds"; bgdir.mkdir(exist_ok=True)
    for stem in ("garden-map", "garden-path", "garden-party"):
        im = Image.open(SRC / f"{stem}-master.png").convert("RGB").resize((1440,1080), Image.Resampling.LANCZOS)
        im.save(bgdir / f"{stem}.webp", "WEBP", quality=84, method=6)

    # Use the approved imagegen chroma-key result, then trim, pad, and cap width.
    im = Image.open(ASSETS / "source/local-api/chroma/title-final.png").convert("RGBA")
    bbox = im.getbbox(); assert bbox
    im = im.crop(bbox)
    pad = 24
    padded = Image.new("RGBA", (im.width+pad*2, im.height+pad*2), (0,0,0,0)); padded.paste(im,(pad,pad)); im = padded
    if im.width > 1000:
        im = im.resize((1000, round(im.height*1000/im.width)), Image.Resampling.LANCZOS)
    im.save(ASSETS / "title.webp", "WEBP", quality=90, method=6)

    # The first UI contact sheet let a neighboring cell cross the crop edge.
    # Browser review rejected that frame; package the clean isolated rerender.
    im = Image.open(ASSETS / "source/local-api/chroma/flower-card-clean-final.png").convert("RGBA")
    im.save(ASSETS / "ui/flower-card.webp", "WEBP", quality=90, method=6)

    # Purple petals were too close to the general magenta key. These two
    # subject-safe red-key finals keep the tulip fully opaque on green scenery.
    for state in ("thirsty", "bloom"):
        im = Image.open(ASSETS / f"source/local-api/character-chroma/tulip-{state}-red-final.png").convert("RGBA")
        im.save(ASSETS / f"flowers/tulip-{state}.webp", "WEBP", quality=90, method=6)

    hubsrc = ASSETS / "source/local-api/hub-krea2-seed42.png"
    im = Image.open(hubsrc).convert("RGB")
    target = im.height * 6 / 5
    left = max(0, round((im.width-target)/2)); right = min(im.width, left + round(target))
    im = im.crop((left, 0, right, im.height)).resize((640,533), Image.Resampling.LANCZOS)
    out = ROOT / "assets/hub/tiles/garden-delivery-game.jpg"; out.parent.mkdir(parents=True, exist_ok=True)
    im.save(out, "JPEG", quality=88, optimize=True, subsampling=0)

if __name__ == "__main__": main()
