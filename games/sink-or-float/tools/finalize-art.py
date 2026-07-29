#!/usr/bin/env python3
"""Sink or Float Lab — deterministic art finalization.

cutouts/*.png (1024 RGBA redraws) -> alpha-trim, pad, resize, encode to runtime
assets; magenta QA composites; backdrop/splash/og/hub derivatives. Resumable
and idempotent — safe to re-run after replacing any source.
"""
import os
import sys

from PIL import Image

DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(DIR, "assets", "source")
CUT = os.path.join(SRC, "cutouts")
QA = os.path.join(SRC, "qa")
os.makedirs(QA, exist_ok=True)

OBJECTS = ["duck", "rock", "wooden-block", "sponge", "cork", "apple", "leaf",
           "key", "coin", "marble", "spoon", "shell", "watermelon", "pebble",
           "log", "paperclip", "orange", "egg"]
UI = ["badge-sink", "badge-float"]
# Mode icons are opaque framed-painting tiles from the *-cream anchors, not cutouts.
MODE_ICONS = {"icon-predict-cream": "mode-predict", "icon-tricky-cream": "mode-tricky",
              "icon-pond-cream": "mode-pond"}


def trim_pad(im, pad_frac=0.04):
    a = im.getchannel("A")
    bbox = a.point(lambda p: 255 if p > 8 else 0).getbbox()
    if bbox:
        im = im.crop(bbox)
    w, h = im.size
    pad = int(max(w, h) * pad_frac)
    canvas = Image.new("RGBA", (w + 2 * pad, h + 2 * pad), (0, 0, 0, 0))
    canvas.paste(im, (pad, pad))
    return canvas


def resize_long(im, target):
    w, h = im.size
    s = target / max(w, h)
    if s < 1:
        im = im.resize((max(1, round(w * s)), max(1, round(h * s))), Image.LANCZOS)
    return im


def magenta(im, out):
    bgc = Image.new("RGBA", im.size, (255, 0, 255, 255))
    bgc.alpha_composite(im)
    bgc.convert("RGB").save(out, quality=85)


def do_cutout(name, target, out_path, fmt):
    src = os.path.join(CUT, f"{name}.png")
    if not os.path.exists(src):
        print(f"MISSING {name}")
        return
    if os.path.exists(out_path) and os.path.getmtime(out_path) > os.path.getmtime(src):
        print(f"skip {name}")
        return
    im = Image.open(src).convert("RGBA")
    im = resize_long(trim_pad(im), target)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    if fmt == "webp":
        im.save(out_path, "WEBP", quality=90, method=6)
    else:
        im.save(out_path, "PNG", optimize=True)
    magenta(im, os.path.join(QA, f"{name}-magenta.jpg"))
    print(f"done {name} {im.size} {os.path.getsize(out_path)//1024}KB")


def full_bleed(src_name, out_path, quality=82):
    src = os.path.join(SRC, "anchors", src_name)
    if not os.path.exists(src):
        print(f"MISSING {src_name}")
        return
    if os.path.exists(out_path) and os.path.getmtime(out_path) > os.path.getmtime(src):
        print(f"skip {src_name}")
        return
    im = Image.open(src).convert("RGB")
    im = im.resize((1600, 1200), Image.LANCZOS)
    q = quality
    while q >= 60:
        im.save(out_path, "WEBP", quality=q, method=6)
        if os.path.getsize(out_path) <= 300 * 1024:
            break
        q -= 6
    print(f"done {os.path.basename(out_path)} q={q} {os.path.getsize(out_path)//1024}KB")


def cover_crop(im, tw, th):
    w, h = im.size
    s = max(tw / w, th / h)
    im = im.resize((round(w * s), round(h * s)), Image.LANCZOS)
    w, h = im.size
    x, y = (w - tw) // 2, (h - th) // 2
    return im.crop((x, y, x + tw, y + th))


def main():
    for n in OBJECTS:
        do_cutout(n, 400, os.path.join(DIR, "assets", "objects", f"{n}.webp"), "webp")
    for n in UI:
        do_cutout(n, 300, os.path.join(DIR, "assets", "ui", f"{n}.png"), "png")
    for src_name, out_name in MODE_ICONS.items():
        src = os.path.join(SRC, "anchors", f"{src_name}.png")
        out = os.path.join(DIR, "assets", "ui", f"{out_name}.png")
        if os.path.exists(src) and not (os.path.exists(out) and os.path.getmtime(out) > os.path.getmtime(src)):
            os.makedirs(os.path.dirname(out), exist_ok=True)
            cover_crop(Image.open(src).convert("RGB"), 640, 640).resize((300, 300), Image.LANCZOS).save(out, "PNG", optimize=True)
            print(f"done {out_name} (opaque tile) {os.path.getsize(out)//1024}KB")
    do_cutout("jar", 1100, os.path.join(DIR, "assets", "jar.png"), "png")
    do_cutout("journal", 800, os.path.join(DIR, "assets", "journal.png"), "png")

    full_bleed("bg.png", os.path.join(DIR, "assets", "bg.webp"))
    full_bleed("splash.png", os.path.join(DIR, "assets", "splash.webp"))

    sp = os.path.join(SRC, "anchors", "splash.png")
    og = os.path.join(DIR, "assets", "og-image.jpg")
    if os.path.exists(sp) and not (os.path.exists(og) and os.path.getmtime(og) > os.path.getmtime(sp)):
        cover_crop(Image.open(sp).convert("RGB"), 1200, 630).save(og, quality=85)
        print(f"done og-image.jpg {os.path.getsize(og)//1024}KB")

    ht = os.path.join(SRC, "anchors", "hub-tile.png")
    out = os.path.join(SRC, "hub", "tile-candidate.jpg")
    if os.path.exists(ht) and not os.path.exists(out):
        os.makedirs(os.path.dirname(out), exist_ok=True)
        cover_crop(Image.open(ht).convert("RGB"), 640, 533).save(out, quality=88)
        print("done hub tile candidate")
    print("FINALIZE DONE")


if __name__ == "__main__":
    sys.exit(main())
