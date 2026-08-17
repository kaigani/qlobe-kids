#!/usr/bin/env python3
"""Finalize Name Puzzle assets from authoritative Qwen layer_2 PNGs."""
from collections import deque
from pathlib import Path
import json

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
MASTERS = ROOT / "assets/source/gpt-image-2"
LAYERED = ROOT / "assets/source/layered"
OUT = ROOT / "assets"
QA = ROOT / "assets/source/qa-layered"
QA.mkdir(parents=True, exist_ok=True)
ROSTER = "aria belle ellie emma ezra hazel henry jack james liam levi lily lucas lucy luna mateo noah nora owen sofia".split()


def layer(key):
    path = LAYERED / f"{key}.layer2.png"
    if not path.is_file():
        raise RuntimeError(f"missing Qwen layer_2 source: {path}")
    opened = Image.open(path)
    if opened.format != "PNG" or "A" not in opened.getbands():
        raise RuntimeError(f"{path}: expected an RGBA PNG")
    return opened.convert("RGBA")


def trim(image):
    alpha = image.getchannel("A")
    box = alpha.point(lambda value: 255 if value > 8 else 0).getbbox()
    if not box:
        raise RuntimeError("empty Qwen alpha layer")
    return image.crop(box)


def fit(image, size):
    image = trim(image)
    image.thumbnail(size, Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", size, (0, 0, 0, 0))
    canvas.alpha_composite(image, ((size[0] - image.width) // 2, (size[1] - image.height) // 2))
    return canvas


def save(image, path, quality=90):
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "WEBP", quality=quality, method=6)


for name in ROSTER:
    save(fit(layer(name), (640, 720)), OUT / f"characters/{name}.webp")

save(Image.open(MASTERS / "classroom-master.png").convert("RGB"), OUT / "art/classroom.webp", 84)
save(fit(layer("title"), (900, 600)), OUT / "ui/title.webp")
save(fit(layer("star-medal"), (340, 420)), OUT / "ui/star-medal.webp")
save(fit(layer("name-board"), (1200, 1200)), OUT / "ui/name-board.webp")


def grid(layer_key, names, columns, rows, size):
    """Crop cells only after Qwen has supplied the sheet's alpha matte."""
    sheet = layer(layer_key)
    for index, name in enumerate(names):
        column, row = index % columns, index // columns
        cell = sheet.crop((
            column * sheet.width // columns,
            row * sheet.height // rows,
            (column + 1) * sheet.width // columns,
            (row + 1) * sheet.height // rows,
        ))
        save(fit(cell, size), OUT / f"ui/{name}.webp")


def alpha_component_boxes(image, expected):
    """Locate whole objects without changing a single Qwen alpha value."""
    alpha = image.getchannel("A")
    width, height = alpha.size
    mask = bytearray(1 if value >= 16 else 0 for value in alpha.tobytes())
    seen = bytearray(width * height)
    components = []
    for start, present in enumerate(mask):
        if not present or seen[start]:
            continue
        seen[start] = 1
        queue = deque([start])
        area = 0
        min_x = max_x = start % width
        min_y = max_y = start // width
        while queue:
            index = queue.popleft()
            area += 1
            x, y = index % width, index // width
            min_x, max_x = min(min_x, x), max(max_x, x)
            min_y, max_y = min(min_y, y), max(max_y, y)
            for neighbor in (index - 1, index + 1, index - width, index + width):
                if neighbor < 0 or neighbor >= len(mask) or seen[neighbor] or not mask[neighbor]:
                    continue
                if neighbor == index - 1 and x == 0 or neighbor == index + 1 and x == width - 1:
                    continue
                seen[neighbor] = 1
                queue.append(neighbor)
        components.append((area, (min_x, min_y, max_x + 1, max_y + 1)))
    selected = sorted(components, reverse=True)[:expected]
    if len(selected) != expected:
        raise RuntimeError(f"expected {expected} Qwen-alpha components, found {len(selected)}")
    boxes = []
    for _, (left, top, right, bottom) in selected:
        pad = 4
        boxes.append((max(0, left - pad), max(0, top - pad), min(width, right + pad), min(height, bottom + pad)))
    return sorted(boxes, key=lambda box: box[0])


def component_grid(layer_key, names, size):
    sheet = layer(layer_key)
    for name, box in zip(names, alpha_component_boxes(sheet, len(names)), strict=True):
        save(fit(sheet.crop(box), size), OUT / f"ui/{name}.webp")


grid(
    "panel-kit",
    "panel-coral panel-mustard panel-green panel-lavender panel-plum panel-teal".split(),
    3, 2, (560, 360),
)
component_grid(
    "navigation-kit",
    "hud-home hud-back hud-sound pager-prev pager-next".split(),
    (300, 300),
)

for name in "letter-red letter-orange letter-yellow letter-green letter-teal letter-sky letter-lavender letter-slot".split():
    save(fit(layer(name), (300, 300)), OUT / f"ui/{name}.webp")

# Saturated checker contact sheet and machine-readable alpha evidence.
files = list((OUT / "characters").glob("*.webp")) + list((OUT / "art").glob("*.webp")) + list((OUT / "ui").glob("*.webp"))
report = {}
thumbs = []
for file in sorted(files):
    image = Image.open(file).convert("RGBA")
    alpha = image.getchannel("A")
    histogram = alpha.histogram()
    data = alpha.get_flattened_data()
    is_opaque_stage = file == OUT / "art/classroom.webp"
    report[str(file.relative_to(ROOT))] = {
        "size": image.size,
        "transparent_pixels": histogram[0],
        "alpha_min": min(data),
        "alpha_max": max(data),
        "extractionWorkflow": "opaque-source-master" if is_opaque_stage else "qwen-image-layered",
        "matteAuthority": "not-applicable-opaque" if is_opaque_stage else "layer_2",
    }
    thumb = image.copy()
    thumb.thumbnail((160, 120))
    thumbs.append((file.name, thumb))

sheet_width = 640
sheet_height = ((len(thumbs) + 3) // 4) * 155
sheet = Image.new("RGB", (sheet_width, sheet_height), (255, 0, 180))
draw = ImageDraw.Draw(sheet)
for index, (name, thumb) in enumerate(thumbs):
    x = (index % 4) * 160
    y = (index // 4) * 155
    for yy in range(y, y + 120, 16):
        for xx in range(x, x + 160, 16):
            color = (255, 0, 180) if ((xx // 16 + yy // 16) % 2 == 0) else (255, 180, 240)
            draw.rectangle((xx, yy, xx + 15, yy + 15), fill=color)
    sheet.paste(thumb, (x + (160 - thumb.width) // 2, y + (120 - thumb.height) // 2), thumb)
    draw.text((x + 3, y + 122), name, fill="white")
sheet.save(QA / "contact-sheet.png")
(QA / "alpha-report.json").write_text(json.dumps(report, indent=2) + "\n")
