#!/usr/bin/env python3
"""Rhythm Copycat — deterministic finalize of extracted layered cutouts.

Idempotent: skips outputs that already exist. Reads assets/source/*.layer2.png,
writes the runtime tree (assets/{bg,ui,pads,dots,kiki}), and emits a magenta
composite contact sheet under assets/source/qa/ for visual QA.
"""
import json
import os
from PIL import ImageFilter
import subprocess
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets", "source")
QA = os.path.join(SRC, "qa")
os.makedirs(QA, exist_ok=True)

ALPHA_FLOOR = 8
BBOX_TH = 24
MAGENTA = (255, 0, 255)

POSE_NAMES = ["neutral", "notice", "clap", "stomp", "tap", "shake", "celebrate"]


def floored_alpha(img, floor=ALPHA_FLOOR):
    a = img.getchannel("A")
    cleaned = a.point(lambda v: 0 if v <= floor else v)
    out = img.copy()
    out.putalpha(cleaned)
    return out


def subject_box(img, th=BBOX_TH):
    mask = img.getchannel("A").point(lambda v: 255 if v > th else 0)
    return mask.getbbox()


def trim(img):
    box = subject_box(img)
    if not box:
        return img
    return img.crop(box)


def pad_square(img, pad_frac=0.02):
    w, h = img.size
    side = max(w, h)
    pad = int(side * pad_frac)
    side += 2 * pad
    out = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    out.alpha_composite(img, ((side - w) // 2, (side - h) // 2))
    return out


def save_webp(img, path, size=None, quality=90):
    if size:
        img = img.resize(size, Image.LANCZOS)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, "WEBP", quality=quality, method=6, exact=True)
    return os.path.getsize(path)


def magenta_qa(img, label, out):
    """Composite over magenta so white fringes/holes are obvious."""
    canvas = Image.new("RGBA", img.size, MAGENTA + (255,))
    canvas.alpha_composite(img)
    canvas.convert("RGB").save(out)
    return out


def alpha_stats(img):
    hist = img.getchannel("A").histogram()
    total = sum(hist)
    opaque = sum(hist[240:]) / total if total else 0
    partial = sum(hist[1:240]) / total if total else 0
    empty = hist[0] / total if total else 0
    return {"opaque": round(opaque, 4), "partial": round(partial, 4), "empty": round(empty, 4)}


def layer2(name):
    p = os.path.join(SRC, f"{name}.layer2.png")
    if not os.path.exists(p):
        return None
    return Image.open(p).convert("RGBA")


def need(img, name):
    if img is None:
        raise SkipAsset(name)


class SkipAsset(Exception):
    pass


def main():
    report = {}
    try:
        _run(report)
    except SkipAsset as skipped:
        report["skipped"] = str(skipped)
    print(json.dumps(report, indent=1))


def _run(report):
    contact = []  # (img, label) for the magenta sheet

    # ---- Kiki pose pack via the studio assembler ---------------------------
    pose_spec = {"canvas": 1024, "maxArt": 900, "baseline": 972, "alphaFloor": ALPHA_FLOOR,
                 "bboxThreshold": BBOX_TH, "quality": 90, "method": 6, "maxUpscale": 2.0,
                 "poses": []}
    for name in POSE_NAMES:
        img = layer2(f"kiki-{name}")
        if img is None:
            raise SkipAsset(f"kiki-{name} extraction pending")
        contact.append((img, f"kiki-{name}"))
        pose_spec["poses"].append({
            "pose": name, "source": os.path.join(SRC, f"kiki-{name}.layer2.png"),
            "output": os.path.join(ROOT, "assets", "kiki", "poses", f"{name}.webp"),
        })
    assembler = os.path.join(ROOT, "..", "..", "tools", "pipeline", "pose_actor_assemble.py")
    spec_path = os.path.join(SRC, "pose-spec.json")
    json.dump(pose_spec, open(spec_path, "w"))
    ran = subprocess.run([sys.executable, assembler, "--spec", spec_path],
                         capture_output=True, text=True)
    if ran.returncode != 0:
        report["kiki-assemble"] = f"FAILED: {ran.stderr[-400:]}"
    else:
        info = json.loads(ran.stdout)
        report["kiki-assemble"] = {"ok": True, "scale": info.get("scale"),
                                   "anchor": info.get("anchor"), "bytes": info.get("totalBytes")}

    manifest = {
        "format": "qlobe-pose-actor", "formatVersion": 1, "id": "kiki",
        "label": "Kiki the clay kitten", "canvas": [1024, 1024], "anchor": [0.5, 0.94921875],
        "transition": {"kind": "paper-pop", "durationMs": 220},
        "poses": {name: {"art": f"poses/{name}.webp",
                         "alt": f"Kiki the clay kitten — {name} pose"} for name in POSE_NAMES},
    }
    with open(os.path.join(ROOT, "assets", "kiki", "poses.json"), "w") as f:
        json.dump(manifest, f, indent=1)

    # ---- pads --------------------------------------------------------------
    for pad in ["clap", "stomp", "tap", "shake"]:
        src_img = layer2(f"pad-{pad}")
        if src_img is None: raise SkipAsset("pad extraction pending")
        img = trim(floored_alpha(src_img)).convert("RGBA")
        contact.append((img, f"pad-{pad}"))
        report[f"pad-{pad}"] = {"bytes": save_webp(pad_square(img), 
            os.path.join(ROOT, "assets", "pads", f"{pad}.webp"), (512, 512)),
            "alpha": alpha_stats(img)}

    # ---- dots: 4 cells of the sheet ---------------------------------------
    src_sheet = layer2("dot-sheet")
    if src_sheet is None: raise SkipAsset("dot-sheet extraction pending")
    sheet = floored_alpha(src_sheet)
    w, h = sheet.size
    cell = w // 4
    names = ["coral", "teal", "mustard", "lilac"]
    cell_bboxes = []
    for i, name in enumerate(names):
        raw = sheet.crop((i * cell, 0, (i + 1) * cell, h))
        img = trim(raw)
        contact.append((img, f"dot-{name}"))
        report[f"dot-{name}"] = {"bytes": save_webp(pad_square(img),
            os.path.join(ROOT, "assets", "dots", f"{name}.webp"), (160, 160)),
            "alpha": alpha_stats(img)}
        cell_bboxes.append(subject_box(raw))

    # ---- tray / plaque / button / card / star / djembe --------------------
    _src = layer2("tray")
    if _src is None: raise SkipAsset("tray extraction pending")
    tray = trim(floored_alpha(_src))
    contact.append((tray, "tray"))
    report["tray"] = {"size": tray.size,
                      "bytes": save_webp(tray, os.path.join(ROOT, "assets", "ui", "tray.webp")),
                      "alpha": alpha_stats(tray)}

    _src = layer2("plaque")
    if _src is None: raise SkipAsset("plaque extraction pending")
    plaque = trim(floored_alpha(_src))
    contact.append((plaque, "plaque"))
    report["plaque"] = {"size": plaque.size,
                        "bytes": save_webp(plaque, os.path.join(ROOT, "assets", "ui", "plaque.webp")),
                        "alpha": alpha_stats(plaque)}

    _src = layer2("button")
    if _src is None: raise SkipAsset("button extraction pending")
    button = trim(floored_alpha(_src))
    contact.append((button, "button"))
    report["button"] = {"size": button.size,
                        "bytes": save_webp(pad_square(button), os.path.join(ROOT, "assets", "ui", "button.webp"), (760, 760)),
                        "alpha": alpha_stats(button)}

    _src = layer2("card")
    if _src is None: raise SkipAsset("card extraction pending")
    card = trim(floored_alpha(_src))
    contact.append((card, "card"))
    report["card"] = {"size": card.size,
                      "bytes": save_webp(card.filter(ImageFilter.GaussianBlur(0.5)),
                                        os.path.join(ROOT, "assets", "ui", "card.webp"), (560, 640)),
                      "alpha": alpha_stats(card)}

    _src = layer2("star")
    if _src is None: raise SkipAsset("star extraction pending")
    star = trim(floored_alpha(_src))
    contact.append((star, "star"))
    report["star"] = {"size": star.size,
                      "bytes": save_webp(pad_square(star), os.path.join(ROOT, "assets", "ui", "star.webp"), (256, 256)),
                      "alpha": alpha_stats(star)}

    _src = layer2("djembe")
    if _src is None: raise SkipAsset("djembe extraction pending")
    djembe = trim(floored_alpha(_src))
    contact.append((djembe, "djembe"))
    report["djembe"] = {"size": djembe.size,
                        "bytes": save_webp(pad_square(djembe), os.path.join(ROOT, "assets", "ui", "djembe.webp"), (384, 384)),
                        "alpha": alpha_stats(djembe)}

    # ---- title --------------------------------------------------------------
    _src = layer2("title")
    if _src is None: raise SkipAsset("title extraction pending")
    title = trim(floored_alpha(_src))
    tw, th = title.size
    scale = min(1.0, 1200 / tw, 400 / th)
    contact.append((title, "title"))
    report["title"] = {"size": title.size,
                       "bytes": save_webp(title, os.path.join(ROOT, "assets", "ui", "title.webp"),
                                          (int(tw * scale), int(th * scale)), quality=88),
                       "alpha": alpha_stats(title)}

    # ---- backgrounds (opaque WebP, cover-cropped to 1600x1200) ------------
    for src, name in [("splash-bg", "splash"), ("play-bg", "play")]:
        img = Image.open(os.path.join(SRC, f"{src}.png")).convert("RGB")
        target = (1600, 1200)
        cw, ch = img.size
        scale = max(target[0] / cw, target[1] / ch)
        img = img.resize((int(cw * scale + 0.5), int(ch * scale + 0.5)), Image.LANCZOS)
        left = (img.width - target[0]) // 2
        top = (img.height - target[1]) // 2
        img = img.crop((left, top, left + target[0], top + target[1]))
        out = os.path.join(ROOT, "assets", "bg", f"{name}.webp")
        img.save(out, "WEBP", quality=82, method=6)
        report[name] = {"bytes": os.path.getsize(out)}

    # ---- hub tile (curated 6:5 from the 768x640 product shot) -------------
    tile = Image.open(os.path.join(SRC, "hub-tile.png")).convert("RGB")
    tile = tile.resize((640, 533), Image.LANCZOS)
    tile_out = os.path.join(ROOT, "..", "..", "assets", "hub", "tiles", "rhythm-copycat.jpg")
    os.makedirs(os.path.dirname(tile_out), exist_ok=True)
    tile.save(tile_out, "JPEG", quality=86)
    report["hub-tile"] = {"bytes": os.path.getsize(tile_out)}

    # ---- magenta contact sheet ----------------------------------------------
    cols = 5
    cell_size = 240
    cards = []
    for img, label in contact:
        im = img.copy()
        im.thumbnail((cell_size - 12, cell_size - 12))
        canvas = Image.new("RGBA", (cell_size, cell_size), MAGENTA + (255,))
        canvas.alpha_composite(im, ((cell_size - im.width) // 2, (cell_size - im.height) // 2))
        cards.append((canvas, label))
    rows = (len(cards) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * cell_size, rows * (cell_size + 22)), (30, 30, 40))
    for i, (canvas, label) in enumerate(cards):
        x = (i % cols) * cell_size
        y = (i // cols) * (cell_size + 22)
        sheet.paste(canvas.convert("RGB"), (x, y))
        # label bar
        from PIL import ImageDraw
        d = ImageDraw.Draw(sheet)
        d.text((x + 6, y + cell_size + 4), label, fill=(230, 230, 230))
    sheet.save(os.path.join(QA, "magenta-contact.jpg"), "JPEG", quality=85)


if __name__ == "__main__":
    main()