#!/usr/bin/env python3
"""Post-process newly generated raws into the repo:
- tiles: flood-fill alpha key (transparent bg, keep soft shadow) -> 512 RGBA
- objects: resize -> 512 RGB (white bg kept, cards are white)
Only processes raws missing from assets/gen (idempotent). Run with pillow venv."""
import os
from collections import deque
from PIL import Image

ROOT = "/Users/kaigani/Documents/PROJECTS/DEVELOPMENT/260612 phonics game"
RAW_T = f"{ROOT}/02 generated/raw/tiles"
RAW_O = f"{ROOT}/02 generated/raw/objects"
GEN_T = f"{ROOT}/sound-sprouts/assets/gen/tiles"
GEN_O = f"{ROOT}/sound-sprouts/assets/gen/objects"
os.makedirs(GEN_T, exist_ok=True)
os.makedirs(GEN_O, exist_ok=True)

def alpha_key_tile(src, dst):
    im = Image.open(src).convert("RGB")
    w, h = im.size
    px = im.load()
    # BFS flood-fill from the four borders over near-white exterior pixels
    ext = bytearray(w * h)
    q = deque()
    def near_white(x, y):
        r, g, b = px[x, y]
        return r > 243 and g > 243 and b > 243
    for x in range(w):
        for y in (0, h - 1):
            if not ext[y * w + x] and near_white(x, y):
                ext[y * w + x] = 1; q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if not ext[y * w + x] and near_white(x, y):
                ext[y * w + x] = 1; q.append((x, y))
    while q:
        x, y = q.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not ext[ny * w + nx] and near_white(nx, ny):
                ext[ny * w + nx] = 1; q.append((nx, ny))
    out = Image.new("RGBA", (w, h))
    op = out.load()
    minx, miny, maxx, maxy = w, h, 0, 0
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            if ext[y * w + x]:
                lum = (r * 299 + g * 587 + b * 114) // 1000
                a = max(0, min(255, 255 - lum))  # white->0, grey shadow->faint
            else:
                a = 255
            op[x, y] = (r, g, b, a)
            if a > 8:
                minx, miny = min(minx, x), min(miny, y)
                maxx, maxy = max(maxx, x), max(maxy, y)
    if maxx <= minx:
        out.resize((512, 512), Image.LANCZOS).save(dst); return
    mw, mh = maxx - minx, maxy - miny
    pad = int(max(mw, mh) * 0.06)
    box = (max(0, minx - pad), max(0, miny - pad), min(w, maxx + pad), min(h, maxy + pad))
    crop = out.crop(box)
    side = max(crop.size)
    sq = Image.new("RGBA", (side, side))
    sq.paste(crop, ((side - crop.size[0]) // 2, (side - crop.size[1]) // 2))
    sq.resize((512, 512), Image.LANCZOS).save(dst)

def process():
    have_t = set(os.path.splitext(f)[0] for f in os.listdir(GEN_T))
    have_o = set(os.path.splitext(f)[0] for f in os.listdir(GEN_O))
    nt = no = 0
    for f in sorted(os.listdir(RAW_T)):
        k = os.path.splitext(f)[0]
        if not f.endswith(".png") or k in have_t: continue
        try:
            alpha_key_tile(f"{RAW_T}/{f}", f"{GEN_T}/{k}.png"); nt += 1
        except Exception as e:
            print("TILE FAIL", k, e)
    for f in sorted(os.listdir(RAW_O)):
        k = os.path.splitext(f)[0]
        if not f.endswith(".png") or k in have_o: continue
        try:
            Image.open(f"{RAW_O}/{f}").convert("RGB").resize((512, 512), Image.LANCZOS).save(f"{GEN_O}/{k}.png")
            no += 1
        except Exception as e:
            print("OBJ FAIL", k, e)
    print(f"processed {nt} new tiles, {no} new objects")
    print("gen/tiles total:", len(os.listdir(GEN_T)), "| gen/objects total:", len(os.listdir(GEN_O)))

if __name__ == "__main__":
    process()
