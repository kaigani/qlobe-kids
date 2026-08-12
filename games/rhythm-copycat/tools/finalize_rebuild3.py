#!/usr/bin/env python3
"""Deterministic finalize for rebuild-3 assets: alpha-trim, pad, resize, encode.
Only touches assets that have an approved .layer2.png source in assets/source/rebuild3.
Usage: python3 tools/finalize_rebuild3.py [name ...]   (default: all approved below)
"""
import sys
import pathlib
from PIL import Image

GAME = pathlib.Path(__file__).resolve().parent.parent
SRC = GAME / "assets" / "source" / "rebuild3"

# name -> (source layer2, destination, max width px, webp quality)
PLAN = {
    "title": ("title.layer2.png", "assets/ui/title.webp", 880, 62),
    "pad-clap": ("pad-clap.layer2.png", "assets/pads/clap.webp", 448, 80),
    "pad-stomp": ("pad-stomp.layer2.png", "assets/pads/stomp.webp", 448, 74),
    "pad-tap": ("pad-tap2.layer2.png", "assets/pads/tap.webp", 448, 80),
    "pad-shake": ("pad-shake2.layer2.png", "assets/pads/shake.webp", 448, 80),
    "track": ("track.layer2.png", "assets/ui/tray.webp", 1000, 80),
}

def finalize(name):
    src_name, dest_rel, max_w, quality = PLAN[name]
    src = SRC / src_name
    if not src.exists():
        print(f"[{name}] missing source {src_name}"); return False
    im = Image.open(src).convert("RGBA")
    bbox = im.getchannel("A").getbbox()
    if not bbox:
        print(f"[{name}] EMPTY ALPHA"); return False
    im = im.crop(bbox)
    pad = max(4, im.width // 100)
    canvas = Image.new("RGBA", (im.width + 2 * pad, im.height + 2 * pad), (0, 0, 0, 0))
    canvas.paste(im, (pad, pad))
    if canvas.width > max_w:
        h = round(canvas.height * max_w / canvas.width)
        canvas = canvas.resize((max_w, h), Image.LANCZOS)
    dest = GAME / dest_rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(dest, "WEBP", quality=quality, method=6)
    print(f"[{name}] -> {dest_rel} {canvas.size} {dest.stat().st_size // 1024}KB")
    return True

names = sys.argv[1:] or list(PLAN)
for n in names:
    finalize(n)
