#!/usr/bin/env python3
"""Rhythm Copycat — deterministic finalize of the kawaii layered cutouts.

Kawaii pixel pipeline (ui-mockups/PROMPTS.md style): reads
assets/source/kw-*.layer2.png cutouts plus the raw t2i/ideogram masters,
writes the runtime tree (assets/{bg,cards,dots,kiki,pads,ui}), and emits a
magenta composite contact sheet under assets/source/qa/ for visual QA.

Idempotent: every output is rebuilt from source on each run.
"""
import json
import os
import subprocess
import sys

from PIL import Image, ImageEnhance, ImageFilter

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


def key_dot(path):
    """Chroma-key a flat sticker on the kawaii charcoal master.

    Distance-from-corner alpha with a soft band; the charcoal is (near) uniform
    so a luminance+distance key is stable across the four dot colours.
    """
    import math
    img = Image.open(path).convert("RGB")
    w, h = img.size
    px = img.load()
    corners = [px[3, 3], px[w - 4, 3], px[3, h - 4], px[w - 4, h - 4]]
    bg = tuple(sum(c[i] for c in corners) // 4 for i in range(3))
    out = img.convert("RGBA")
    opx = out.load()
    # band edges: below DIST0 -> clear, above DIST1 -> opaque
    dist0, dist1 = 26.0, 60.0
    for y in range(h):
        for x in range(w):
            r, g, b = opx[x, y][:3]
            # The halo is warm and muddy; the charcoal is near-neutral. A chroma
            # (max-min) key keeps the saturated disc and drops both.
            sat = max(r, g, b) - min(r, g, b)
            if sat <= 36:
                a = 0
            elif sat >= 76:
                a = 255
            else:
                a = int(255 * (sat - 36) / 40)
            if a < 255:
                opx[x, y] = (r, g, b, a)
    return out


def disc_crop(img, pad=8, alpha_th=190):
    """Crop to the bright disc body inside a keyed dot master."""
    a = img.getchannel("A")
    core = a.point(lambda v: 255 if v > alpha_th else 0)
    box = core.getbbox()
    if not box:
        return img
    x0, y0, x1, y1 = box
    x0 = max(0, x0 - pad); y0 = max(0, y0 - pad)
    x1 = min(img.width, x1 + pad); y1 = min(img.height, y1 + pad)
    return img.crop((x0, y0, x1, y1))


def central_dot_crop(img):
    """Keep the authored center dot from the generated dot contact sheet.

    The LAN generation sometimes returns a playful contact sheet around the
    requested dot. The previous alpha/saturation crop retained every saturated
    face in that sheet, which made the runtime beat tokens unreadable. The
    central colored dot is intentionally consistent across the four masters,
    so crop a small square around that authored subject after keying.
    """
    side = int(min(img.width, img.height) * 0.30)
    cx, cy = img.width // 2, img.height // 2
    x0 = max(0, cx - side // 2)
    y0 = max(0, cy - side // 2)
    return img.crop((x0, y0, min(img.width, x0 + side), min(img.height, y0 + side)))


def layer2(name, required=True):
    p = os.path.join(SRC, f"{name}.layer2.png")
    if not os.path.exists(p):
        if required:
            raise SkipAsset(f"{name} extraction pending")
        return None
    return Image.open(p).convert("RGBA")


def pop(img, sat=1.34, bright=1.08):
    """HSV pop toward the mockups' saturated citrus look, then a crispness pass."""
    hsv = img.convert("HSV")
    h, sv, v = hsv.split()
    sv = ImageEnhance.Brightness(sv).enhance(sat)
    v = ImageEnhance.Brightness(v).enhance(bright)
    out = Image.merge("HSV", (h, sv, v)).convert("RGB")
    out = ImageEnhance.Contrast(out).enhance(1.05)
    return out


def crisp(img, radius=1.6, percent=105, threshold=2):
    return img.filter(ImageFilter.UnsharpMask(radius=radius, percent=percent, threshold=threshold))


def cover_rgb(src, target):
    img = Image.open(os.path.join(SRC, f"{src}.png")).convert("RGB")
    cw, ch = img.size
    scale = max(target[0] / cw, target[1] / ch)
    img = img.resize((int(cw * scale + 0.5), int(ch * scale + 0.5)), Image.LANCZOS)
    left = (img.width - target[0]) // 2
    top = (img.height - target[1]) // 2
    return img.crop((left, top, left + target[0], top + target[1]))


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
        img = layer2(f"kw-kiki-{name}")
        contact.append((img, f"kiki-{name}"))
        pose_spec["poses"].append({
            "pose": name, "source": os.path.join(SRC, f"kw-kiki-{name}.layer2.png"),
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
        "label": "Kiki the kawaii kitten", "canvas": [1024, 1024], "anchor": [0.5, 0.94921875],
        "transition": {"kind": "paper-pop", "durationMs": 220},
        "poses": {name: {"art": f"poses/{name}.webp",
                         "alt": f"Kiki the kawaii kitten — {name} pose"} for name in POSE_NAMES},
    }
    with open(os.path.join(ROOT, "assets", "kiki", "poses.json"), "w") as f:
        json.dump(manifest, f, indent=1)

    # ---- pads --------------------------------------------------------------
    for pad in ["clap", "stomp", "tap", "shake"]:
        img = trim(floored_alpha(layer2(f"kw-pad-{pad}"))).convert("RGBA")
        contact.append((img, f"pad-{pad}"))
        report[f"pad-{pad}"] = {"bytes": save_webp(pad_square(img),
            os.path.join(ROOT, "assets", "pads", f"{pad}.webp"), (512, 512)),
            "alpha": alpha_stats(img)}

    # ---- dots: chroma-keyed locally -----------------------------------------
    # The layered workflow rejects micro-subjects (the 4 stickers came back as
    # full-frame noise twice), so the flat charcoal-backed dot masters are keyed
    # deterministically: alpha = color distance from the background corner.
    for color in ["blue", "green", "orange", "red"]:
        img = key_dot(os.path.join(SRC, f"kw-dot-{color}.png"))
        # The krea masters bake a wide warm shadow around the disc; crop to the
        # disc body so the sticker dot, not its halo, fills the sprite.
        img = central_dot_crop(img).convert("RGBA")
        contact.append((img, f"dot-{color}"))
        report[f"dot-{color}"] = {"bytes": save_webp(pad_square(img),
            os.path.join(ROOT, "assets", "dots", f"{color}.webp"), (160, 160)),
            "alpha": alpha_stats(img)}

    # ---- tray / plaque / button / star / djembe ----------------------------
    _src = layer2("kw-tray")
    tray = trim(floored_alpha(_src))
    contact.append((tray, "tray"))
    report["tray"] = {"size": tray.size,
                      "bytes": save_webp(tray, os.path.join(ROOT, "assets", "ui", "tray.webp")),
                      "alpha": alpha_stats(tray)}

    _src = layer2("kw-plaque")
    plaque = trim(floored_alpha(_src))
    contact.append((plaque, "plaque"))
    report["plaque"] = {"size": plaque.size,
                        "bytes": save_webp(plaque, os.path.join(ROOT, "assets", "ui", "plaque.webp")),
                        "alpha": alpha_stats(plaque)}

    _src = layer2("kw-button")
    button = trim(floored_alpha(_src)).convert("RGBA")
    r, g, b, a = button.split()
    button = pop(button.convert("RGB"), sat=1.36, bright=1.1).convert("RGBA")
    button.putalpha(a)
    contact.append((button, "button"))
    report["button"] = {"size": button.size,
                        "bytes": save_webp(pad_square(button), os.path.join(ROOT, "assets", "ui", "button.webp"), (760, 760)),
                        "alpha": alpha_stats(button)}

    _src = layer2("kw-star")
    star = trim(floored_alpha(_src))
    contact.append((star, "star"))
    report["star"] = {"size": star.size,
                      "bytes": save_webp(pad_square(star), os.path.join(ROOT, "assets", "ui", "star.webp"), (256, 256)),
                      "alpha": alpha_stats(star)}

    _src = layer2("kw-djembe")
    djembe = trim(floored_alpha(_src))
    contact.append((djembe, "djembe"))
    report["djembe"] = {"size": djembe.size,
                        "bytes": save_webp(pad_square(djembe), os.path.join(ROOT, "assets", "ui", "djembe.webp"), (384, 384)),
                        "alpha": alpha_stats(djembe)}

    _src = layer2("kw-maraca")
    maraca = trim(floored_alpha(_src))
    contact.append((maraca, "maraca"))
    report["maraca"] = {"size": maraca.size,
                        "bytes": save_webp(pad_square(maraca), os.path.join(ROOT, "assets", "ui", "maraca.webp"), (384, 384)),
                        "alpha": alpha_stats(maraca)}

    for icon in ["tambourine", "woodblock"]:
        _src = layer2(f"kw-{icon}")
        art = trim(floored_alpha(_src))
        contact.append((art, icon))
        report[icon] = {"size": art.size,
                        "bytes": save_webp(pad_square(art), os.path.join(ROOT, "assets", "ui", f"{icon}.webp"), (384, 384)),
                        "alpha": alpha_stats(art)}

    # ---- beat cards (three colored variants) --------------------------------
    for color in ["orange", "yellow", "teal"]:
        _src = layer2(f"kw-card-{color}")
        card = trim(floored_alpha(_src)).convert("RGBA")
        r, g, b, a = card.split()
        # Flatten the chunky 3D bevel toward the mockups' flat sticker look,
        # then pop the palette.
        card = card.convert("RGB")
        card = ImageEnhance.Contrast(card).enhance(0.88)
        hsv = card.convert("HSV")
        h, sv, v = hsv.split()
        v = ImageEnhance.Brightness(v).enhance(1.06)
        card = Image.merge("HSV", (h, sv, v)).convert("RGB")
        card = pop(card, sat=1.24).convert("RGBA")
        card.putalpha(a)
        card = crisp(card)
        contact.append((card, f"card-{color}"))
        report[f"card-{color}"] = {"size": card.size,
                                   "bytes": save_webp(card, os.path.join(ROOT, "assets", "cards", f"{color}.webp"), (560, 640)),
                                   "alpha": alpha_stats(card)}

    # ---- title (ideogram master, layered cutout) ------------------------------
    _src = layer2("kw-title")
    title = trim(floored_alpha(_src)).convert("RGBA")
    tw, th = title.size
    scale = min(1.0, 1200 / tw, 400 / th)
    contact.append((title.convert("RGB"), "title"))
    report["title"] = {"size": title.size,
                       "bytes": save_webp(title, os.path.join(ROOT, "assets", "ui", "title.webp"),
                                          (int(tw * scale), int(th * scale)), quality=88),
                       "alpha": alpha_stats(title)}

    # ---- backgrounds (opaque WebP, cover-cropped to 1600x1200) -------------
    for src, name, extra in [("kw-bg-splash", "splash", 1.0), ("kw-bg-play", "play", 1.05), ("kw-bg-end", "end", 1.12)]:
        img = crisp(pop(cover_rgb(src, (1600, 1200)), sat=1.34 * extra))
        out = os.path.join(ROOT, "assets", "bg", f"{name}.webp")
        img.save(out, "WEBP", quality=82, method=6)
        report[name] = {"bytes": os.path.getsize(out)}

    # ---- hub tile (curated 6:5 from the kawaii product shot) ---------------
    tile_src = os.path.join(SRC, "kw-hub-tile.png")
    if os.path.exists(tile_src):
        tile = Image.open(tile_src).convert("RGB")
        cw, ch = tile.size
        target_ratio = 640 / 533
        if cw / ch > target_ratio:
            new_w = int(ch * target_ratio)
            tile = tile.crop(((cw - new_w) // 2, 0, (cw + new_w) // 2, ch))
        else:
            new_h = int(cw / target_ratio)
            tile = tile.crop((0, (ch - new_h) // 2, cw, (ch + new_h) // 2))
        tile = tile.resize((640, 533), Image.LANCZOS)
        tile_out = os.path.join(ROOT, "..", "..", "assets", "hub", "tiles", "rhythm-copycat.jpg")
        os.makedirs(os.path.dirname(tile_out), exist_ok=True)
        tile.save(tile_out, "JPEG", quality=86)
        report["hub-tile"] = {"bytes": os.path.getsize(tile_out)}

    # ---- magenta contact sheet ----------------------------------------------
    cols = 5
    cell_size = 220
    cards = []
    for img, label in contact:
        img = img.convert("RGBA")
        box = subject_box(img)
        if box:
            img = img.crop(box)
        img = pad_square(img, 0.04)
        img.thumbnail((cell_size, cell_size))
        canvas = Image.new("RGBA", (cell_size, cell_size), MAGENTA + (255,))
        canvas.alpha_composite(img, ((cell_size - img.width) // 2, (cell_size - img.height) // 2))
        cards.append((canvas.convert("RGB"), label))

    rows = (len(cards) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * cell_size, rows * cell_size), (20, 20, 24))
    for i, (card, _label) in enumerate(cards):
        sheet.paste(card, ((i % cols) * cell_size, (i // cols) * cell_size))
    sheet_path = os.path.join(QA, "kawaii-contact.jpg")
    sheet.save(sheet_path, "JPEG", quality=88)
    report["contact-sheet"] = sheet_path


if __name__ == "__main__":
    main()
