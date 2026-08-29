#!/usr/bin/env python3
"""Build deterministic visual QA contacts and an alpha report from game config."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[3]
GAME = ROOT / "games" / "beat-the-bugs"
CONFIG = GAME / "config.json"
OUT = GAME / "assets" / "source" / "qa"
MAGENTA = (234, 0, 142, 255)


def paths(value: Any):
    if isinstance(value, str) and value.lower().endswith(('.png', '.webp', '.jpg', '.jpeg')):
        yield value
    elif isinstance(value, dict):
        for v in value.values():
            yield from paths(v)
    elif isinstance(value, list):
        for v in value:
            yield from paths(v)


def font(size: int):
    try:
        return ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", size)
    except OSError:
        return ImageFont.load_default()


def load_config():
    return json.loads(CONFIG.read_text())


def inventory():
    assets = load_config()["assets"]
    backgrounds = list(paths(assets.get("backgrounds", {})))
    all_paths = list(paths(assets))
    background_set = set(backgrounds)
    non_bg = [p for p in all_paths if p not in background_set]
    return non_bg, backgrounds


def resolve(rel: str) -> Path:
    return GAME / rel


def inspect_asset(rel: str):
    path = resolve(rel)
    with Image.open(path) as source:
        if source.mode not in ("RGBA", "LA", "PA"):
            raise SystemExit(f"alpha check failed (no alpha channel): {rel}")
        image = source.convert("RGBA")
        alpha = image.getchannel("A")
        hist = alpha.histogram()
        total = image.width * image.height
        meaningful = sum(hist[1:])
        opaque = hist[255]
        partial = sum(hist[1:255])
        bbox = alpha.getbbox()
        corners = [alpha.getpixel(p) for p in ((0, 0), (image.width - 1, 0),
                                                (0, image.height - 1),
                                                (image.width - 1, image.height - 1))]
        return image, {
            "path": rel, "dimensions": [image.width, image.height],
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            "alphaExtrema": list(alpha.getextrema()),
            "transparentPercent": round(hist[0] * 100 / total, 3),
            "opaquePercent": round(opaque * 100 / total, 3),
            "partialPercent": round(partial * 100 / total, 3),
            "bbox": list(bbox) if bbox else None,
            "cornerAlpha": corners,
        }


def build_contacts(non_bg, backgrounds, report):
    OUT.mkdir(parents=True, exist_ok=True)
    cell_w, cell_h, cols = 240, 210, 5
    sheet = Image.new("RGBA", (cols * cell_w, ((len(non_bg) + cols - 1) // cols) * cell_h), MAGENTA)
    draw = ImageDraw.Draw(sheet)
    label_font = font(13)
    for index, rel in enumerate(non_bg):
        image, _ = report[index]
        image.thumbnail((cell_w - 20, cell_h - 42), Image.Resampling.LANCZOS)
        x = (index % cols) * cell_w + (cell_w - image.width) // 2
        y = (index // cols) * cell_h + 8
        sheet.alpha_composite(image, (x, y))
        label = rel.removeprefix("assets/")
        draw.text(((index % cols) * cell_w + 6, (index // cols) * cell_h + cell_h - 28),
                  label, fill="white", font=label_font, stroke_width=2, stroke_fill="black")
    sheet.convert("RGB").save(OUT / "cutouts-contact-magenta.png", optimize=False)

    bw, bh, bcols = 360, 270, 3
    bsheet = Image.new("RGB", (bcols * bw, ((len(backgrounds) + bcols - 1) // bcols) * bh), "#fff4df")
    draw = ImageDraw.Draw(bsheet)
    for index, rel in enumerate(backgrounds):
        with Image.open(resolve(rel)) as source:
            image = source.convert("RGB")
        image.thumbnail((bw - 16, bh - 42), Image.Resampling.LANCZOS)
        x = (index % bcols) * bw + (bw - image.width) // 2
        y = (index // bcols) * bh + 8
        bsheet.paste(image, (x, y))
        draw.text(((index % bcols) * bw + 8, (index // bcols) * bh + bh - 27), rel.removeprefix("assets/"), fill="#4b2633", font=label_font)
    bsheet.save(OUT / "backgrounds-contact.jpg", quality=92, optimize=False)


def main():
    parser = argparse.ArgumentParser(description="Build Beat the Bugs raster QA contacts and alpha report.")
    parser.add_argument("--check", action="store_true", help="validate inventory without writing outputs")
    args = parser.parse_args()
    non_bg, backgrounds = inventory()
    missing = [p for p in non_bg + backgrounds if not resolve(p).is_file()]
    print(f"plan: {len(non_bg)} non-background + {len(backgrounds)} backgrounds")
    for rel in non_bg + backgrounds:
        print(f"  {'MISSING ' if rel in missing else 'ready   '}{rel}")
    if missing:
        print(f"missing: {len(missing)}")
        raise SystemExit(1)
    records, report = [], []
    for rel in non_bg:
        image, record = inspect_asset(rel)
        if record["partialPercent"] + record["transparentPercent"] < 1 or not record["bbox"]:
            raise SystemExit(f"alpha check failed (transparency/visibility): {rel}")
        if max(record["dimensions"]) > 1600 and not any(token in rel.lower() for token in ("title", "prompt", "maya")):
            raise SystemExit(f"alpha check failed (oversize): {rel}")
        if any(c > 64 for c in record["cornerAlpha"]):
            raise SystemExit(f"alpha check failed (corner alpha): {rel}")
        report.append((image, record)); records.append(record)
    if args.check:
        print(f"alpha: {len(records)} checked; no writes")
        return
    build_contacts(non_bg, backgrounds, report)
    (OUT / "alpha-report.json").write_text(json.dumps(records, indent=2) + "\n")
    print(f"wrote: {OUT / 'cutouts-contact-magenta.png'}, {OUT / 'backgrounds-contact.jpg'}, {OUT / 'alpha-report.json'}")


if __name__ == "__main__":
    main()
