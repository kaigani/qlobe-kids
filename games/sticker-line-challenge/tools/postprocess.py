#!/usr/bin/env python3
"""Sticker Line Challenge — deterministic finalize: trim, resize, encode, QA.
Resumable: skips outputs that already exist. Run from anywhere."""
import os, sys
from PIL import Image

GAME = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(GAME, "assets", "source")
LAY = os.path.join(SRC, "layered")
OUT = os.path.join(GAME, "assets")
QA = os.path.join(os.path.dirname(os.path.dirname(GAME)), "qa-shots", "sticker-line-challenge")
os.makedirs(QA, exist_ok=True)

def trim(im, thresh=10, pad=8):
    a = im.getchannel("A").point(lambda v: 255 if v > thresh else 0)
    box = a.getbbox()
    if not box:
        raise SystemExit(f"empty alpha bbox for {im}")
    l, t, r, b = box
    l, t = max(0, l - pad), max(0, t - pad)
    r, b = min(im.width, r + pad), min(im.height, b + pad)
    return im.crop((l, t, r, b))

def alpha_report(name, im):
    h = im.getchannel("A").histogram()
    total = sum(h)
    transparent = sum(h[:16]) / total
    opaque = sum(h[240:]) / total
    partial = 1 - transparent - opaque
    print(f"  alpha[{name}] transparent={transparent:.2%} opaque={opaque:.2%} partial={partial:.2%}")
    return transparent > 0.05 and opaque > 0.2

def qa_composite(name, im):
    bg = Image.new("RGBA", im.size, (255, 0, 255, 255))
    bg.alpha_composite(im)
    bg.convert("RGB").save(os.path.join(QA, f"qa-{name}.png"))

def save_webp(im, path, maxdim, quality=88):
    im2 = im.copy()
    im2.thumbnail((maxdim, maxdim), Image.LANCZOS)
    im2.save(path, "WEBP", quality=quality, method=6)
    print(f"  wrote {os.path.relpath(path, GAME)} {im2.size} {os.path.getsize(path)//1024}KB")

def do_layered(name, out_path, maxdim, quality=88, thresh=10):
    src = os.path.join(LAY, f"{name}-layer2.png")
    dst = os.path.join(OUT, out_path)
    if os.path.exists(dst):
        print(f"[skip] {out_path}")
        return
    im = Image.open(src).convert("RGBA")
    im = trim(im, thresh=thresh)
    ok = alpha_report(name, im)
    qa_composite(name, im)
    if not ok:
        print(f"  !! WARNING: suspicious alpha on {name} — eyeball qa-{name}.png")
    save_webp(im, dst, maxdim, quality)

def dark_key(name, out_path, maxw, lo=60, hi=140):
    """Luminance key for small utility sprites generated on flat charcoal."""
    dst = os.path.join(OUT, out_path)
    if os.path.exists(dst):
        print(f"[skip] {out_path}")
        return
    im = Image.open(os.path.join(SRC, f"{name}.png")).convert("RGBA")
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, _ = px[x, y]
            lum = 0.299 * r + 0.587 * g + 0.114 * b
            if lum <= lo:
                a = 0
            elif lum >= hi:
                a = 255
            else:
                a = int((lum - lo) / (hi - lo) * 255)
            px[x, y] = (r, g, b, a)
    im = trim(im, pad=2)
    w, h = im.size
    nw = maxw
    im = im.resize((nw, max(1, round(h * nw / w))), Image.LANCZOS)
    qa_composite(name, im)
    im.save(dst, "PNG")
    print(f"  wrote {out_path} {im.size} {os.path.getsize(dst)//1024}KB")

def do_bg(name, quality=82):
    dst = os.path.join(OUT, f"{name}.jpg")
    if os.path.exists(dst):
        print(f"[skip] {name}.jpg")
        return
    im = Image.open(os.path.join(SRC, f"{name}.png")).convert("RGB")
    im = im.resize((1600, 1200), Image.LANCZOS)
    q = quality
    im.save(dst, "JPEG", quality=q, optimize=True, progressive=True)
    while os.path.getsize(dst) > 300 * 1024 and q > 55:
        q -= 5
        im.save(dst, "JPEG", quality=q, optimize=True, progressive=True)
    print(f"  wrote {name}.jpg {os.path.getsize(dst)//1024}KB q={q}")

print("== backdrops ==")
for n in ("bg-splash", "bg-play", "bg-end"):
    do_bg(n)
print("== sprites ==")
for n, p, m, *rest in [
    ("page", "page.webp", 1400),
    ("title", "title.webp", 1100),
    ("card-wave", "cards/wave.webp", 460),
    ("card-zigzag", "cards/zigzag.webp", 460),
    ("card-loop", "cards/loop.webp", 460),
    ("buddy-star", "buddies/star.webp", 420),
    ("buddy-rainbow", "buddies/rainbow.webp", 420),
    ("buddy-heart", "buddies/heart.webp", 420),
    ("buddy-flower", "buddies/flower.webp", 420),
    ("banner-green", "ui/banner-green.webp", 640),
    ("banner-pink", "ui/banner-pink.webp", 720, 40),
]:
    do_layered(n, p, m, thresh=(rest[0] if rest else 10))
print("== keyed utility sprites ==")
dark_key("dash", "ui/dash.png", 72)
dark_key("blob", "ui/blob.png", 120)
print("done")
