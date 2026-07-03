#!/usr/bin/env python3
"""Key out the near-white background from the provided splash assets, tight-crop,
then composite each menu button (pill shape + icon + text label) to match the
concept. Outputs transparent PNGs to assets/gen/ui/splash/."""
import os
from collections import deque
from PIL import Image

ROOT = "/Users/kaigani/Documents/PROJECTS/DEVELOPMENT/260612 phonics game"
SRC = f"{ROOT}/01 reference/splash"
OUT = f"{ROOT}/sound-sprouts/assets/gen/ui/splash"
os.makedirs(OUT, exist_ok=True)

def key_crop(name, thr=234, margin=0.02):
    """Flood-fill key near-white exterior (keeps interior whites + soft shadow),
    zero faint residue, crop to content with a small margin."""
    im = Image.open(f"{SRC}/{name}").convert("RGB")
    w, h = im.size
    px = im.load()
    ext = bytearray(w * h)
    q = deque()
    def nw(x, y):
        r, g, b = px[x, y]
        return r > thr and g > thr and b > thr
    for x in range(w):
        for y in (0, h - 1):
            if not ext[y*w+x] and nw(x, y): ext[y*w+x] = 1; q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if not ext[y*w+x] and nw(x, y): ext[y*w+x] = 1; q.append((x, y))
    while q:
        x, y = q.popleft()
        for dx, dy in ((1,0),(-1,0),(0,1),(0,-1)):
            nx, ny = x+dx, y+dy
            if 0 <= nx < w and 0 <= ny < h and not ext[ny*w+nx] and nw(nx, ny):
                ext[ny*w+nx] = 1; q.append((nx, ny))
    out = Image.new("RGBA", (w, h))
    op = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            if ext[y*w+x]:
                lum = (r*299 + g*587 + b*114)//1000
                a = max(0, min(255, 255 - lum))
                if a < 14: a = 0          # drop faint bg residue so crop is tight
            else:
                a = 255
            op[x, y] = (r, g, b, a)
    bbox = out.getbbox()
    if bbox:
        pad = int(max(bbox[2]-bbox[0], bbox[3]-bbox[1]) * margin)
        bbox = (max(0, bbox[0]-pad), max(0, bbox[1]-pad),
                min(w, bbox[2]+pad), min(h, bbox[3]+pad))
        out = out.crop(bbox)
    return out

def scale_to_h(img, target_h):
    r = target_h / img.height
    return img.resize((max(1, round(img.width*r)), target_h), Image.LANCZOS)

def scale_to_fit(img, max_w, max_h):
    r = min(max_w/img.width, max_h/img.height)
    return img.resize((max(1, round(img.width*r)), max(1, round(img.height*r))), Image.LANCZOS)

def compose_button(shape_png, icon_png, label_png, out_name):
    shape = key_crop(shape_png)              # the pill (tight)
    icon = key_crop(icon_png)
    label = key_crop(label_png)
    W, H = shape.size
    canvas = Image.new("RGBA", (W, H))
    canvas.alpha_composite(shape, (0, 0))
    # icon: ~0.82 of button height, centered in the left ~24% of the pill
    ic = scale_to_h(icon, int(H * 0.82))
    icon_cx = int(W * 0.165)
    ix = icon_cx - ic.width // 2
    iy = (H - ic.height) // 2
    canvas.alpha_composite(ic, (max(0, ix), iy))
    # label: fit into the right region, centered there
    region_x0 = ix + ic.width + int(W * 0.02)
    region_x1 = int(W * 0.95)
    lab = scale_to_fit(label, region_x1 - region_x0, int(H * 0.56))
    lx = region_x0 + (region_x1 - region_x0 - lab.width)//2
    ly = (H - lab.height)//2
    canvas.alpha_composite(lab, (lx, ly))
    canvas.save(f"{OUT}/{out_name}.png")
    return canvas.size

# title
title = key_crop("sound_sprouts_title.png")
title.save(f"{OUT}/title.png")
print("title", title.size)
print("btn-make", compose_button("make_a_word_button_shape.png",
      "make_a_word_icon_abc_blocks.png", "make_a_word_title.png", "btn-make"))
print("btn-mystery", compose_button("mystery_picture_button_shape.png",
      "mystery_picture_icon_peeking_cat.png", "mystery_picture_title.png", "btn-mystery"))
print("btn-mixer", compose_button("word_mixer_button_shape.png",
      "word_mixer_icon_bowl_letters.png", "word_mixer_title.png", "btn-mixer"))
print("done ->", OUT)
