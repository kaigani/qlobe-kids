#!/usr/bin/env python3
"""Finalize Shadow Chase layered art into shipping WebP assets.

This is intentionally deterministic and offline.  Qwen layer files are inputs;
GPT Image 2 masters are never modified.  The first pass crops the two 3x2
contact sheets, then applies the same alpha-floor/pad/size rules as the Studio
``cutout_finalize.py`` helper.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import pathlib
import sys
from typing import Any

from PIL import Image, ImageEnhance

GAME = pathlib.Path(__file__).resolve().parents[1]
ASSETS = GAME / "assets"
SOURCE = ASSETS / "source"
LAYERED = SOURCE / "layered"
GPT = SOURCE / "gpt-image-2"
PAUSE_SOURCE = GAME.parent / "letter-treasure-hunt/assets/ui-raster/controls/pause.webp"
PAUSE_OUTPUT = ASSETS / "ui/pause.webp"
TOYS = ("rabbit", "squirrel", "turtle", "fox", "duck", "bear")
UI = ("sun", "star", "choice-plaque", "button-green", "pedestal", "button-round")
OUTS = {
    "rabbit": ASSETS / "toys/rabbit.webp", "squirrel": ASSETS / "toys/squirrel.webp",
    "turtle": ASSETS / "toys/turtle.webp", "fox": ASSETS / "toys/fox.webp",
    "duck": ASSETS / "toys/duck.webp", "bear": ASSETS / "toys/bear.webp",
    "sun": ASSETS / "ui/sun.webp", "star": ASSETS / "ui/star.webp",
    "choice-plaque": ASSETS / "ui/choice-plaque.webp", "button-green": ASSETS / "ui/button-green.webp",
    "pedestal": ASSETS / "ui/pedestal.webp", "button-round": ASSETS / "ui/button-round.webp",
}


def helper():
    path = GAME.parents[1] / "tools/pipeline/cutout_finalize.py"
    spec = importlib.util.spec_from_file_location("cutout_finalize", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {path}")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.finalize


def crop_sheet(source: pathlib.Path, names: tuple[str, ...], dest: pathlib.Path) -> list[pathlib.Path]:
    image = Image.open(source).convert("RGBA")
    w, h = image.size
    paths = []
    for index, name in enumerate(names):
        x, y = index % 3, index // 3
        crop = image.crop((x * w // 3, y * h // 2, (x + 1) * w // 3, (y + 1) * h // 2))
        path = dest / f"{name}-crop.png"
        crop.save(path, "PNG", optimize=True)
        paths.append(path)
    return paths


def write_webp(png: pathlib.Path, output: pathlib.Path, *, quality: int = 92, lossless: bool = False) -> None:
    image = Image.open(png).convert("RGBA")
    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output, "WEBP", lossless=lossless, quality=quality, method=6)


def write_stage(image: Image.Image, output: pathlib.Path) -> dict[str, int | bool]:
    quality = 92
    while True:
        image.save(output, "WEBP", quality=quality, method=6)
        if output.stat().st_size <= 350_000 or quality <= 68:
            break
        quality -= 4
    size = output.stat().st_size
    return {"bytes": size, "quality": quality, "budgetBytes": 350000,
            "withinBudget": size <= 350000}


def grade_stage(stage: Image.Image, moment: str) -> Image.Image:
    """Create restrained raster lighting states; never paint scene geometry in CSS."""
    if moment == "morning":
        base = ImageEnhance.Brightness(stage).enhance(.95)
        base = ImageEnhance.Color(base).enhance(1.06)
        tint, strength = (255, 187, 100), .075
    elif moment == "evening":
        base = ImageEnhance.Brightness(stage).enhance(.88)
        base = ImageEnhance.Color(base).enhance(1.12)
        tint, strength = (229, 117, 67), .105
    else:
        base = ImageEnhance.Brightness(stage).enhance(1.055)
        base = ImageEnhance.Color(base).enhance(.96)
        tint, strength = (255, 246, 218), .035
    wash = Image.new("RGB", base.size, tint)
    return Image.blend(base.convert("RGB"), wash, strength)


def write_pause_asset(source: pathlib.Path, output: pathlib.Path, review: pathlib.Path) -> dict[str, Any]:
    """Warm an existing raster control into this game's leaf-and-wood palette."""
    image = Image.open(source).convert("RGBA")
    bbox = image.getchannel("A").getbbox()
    if bbox:
        image = image.crop(bbox)
    pixels = image.load()
    for y in range(image.height):
        for x in range(image.width):
            r, g, b, a = pixels[x, y]
            if a and g > r * 1.25 and b > r * 1.25 and abs(g - b) < 75:
                luminance = .30 * r + .59 * g + .11 * b
                pixels[x, y] = (
                    min(255, int(luminance * .68)),
                    min(255, int(luminance * 1.04)),
                    min(255, int(luminance * .62)),
                    a,
                )
    image.thumbnail((256, 256), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (272, 272), (0, 0, 0, 0))
    canvas.alpha_composite(image, ((272 - image.width) // 2, (272 - image.height) // 2))
    output.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output, "WEBP", quality=92, method=6)
    magenta = Image.new("RGBA", canvas.size, (255, 0, 255, 255))
    magenta.alpha_composite(canvas)
    magenta.convert("RGB").save(review, "PNG", optimize=True)
    return {
        "pass": True,
        "source": str(source.relative_to(GAME.parents[1])),
        "width": canvas.width,
        "height": canvas.height,
        "bytes": output.stat().st_size,
    }


def keep_largest_component(path: pathlib.Path) -> None:
    """Remove detached extraction fragments while preserving retained alpha."""
    image = Image.open(path).convert("RGBA")
    alpha = image.getchannel("A"); w, h = image.size
    mask = alpha.point(lambda value: 1 if value > 8 else 0)
    seen: set[tuple[int, int]] = set(); largest: set[tuple[int, int]] = set()
    for y in range(h):
        for x in range(w):
            if (x, y) in seen or mask.getpixel((x, y)) == 0: continue
            stack = [(x, y)]; seen.add((x, y)); component = set()
            while stack:
                cx, cy = stack.pop(); component.add((cx, cy))
                for nx, ny in ((cx-1, cy), (cx+1, cy), (cx, cy-1), (cx, cy+1)):
                    if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in seen and mask.getpixel((nx, ny)):
                        seen.add((nx, ny)); stack.append((nx, ny))
            if len(component) > len(largest): largest = component
    keep = Image.new("L", (w, h), 0); kp = keep.load()
    for x, y in largest: kp[x, y] = alpha.getpixel((x, y))
    image.putalpha(keep); image.save(path, "PNG", optimize=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    required = [LAYERED / "toys.png", LAYERED / "title.png", LAYERED / "sun-track.png", PAUSE_SOURCE]
    required += [LAYERED / f"ui-{name}.png" for name in UI]
    missing = [str(p) for p in required if not p.is_file()]
    plan = {"inputs": [str(p) for p in required], "toyOrder": TOYS, "uiOrder": UI,
            "outputs": [str(p) for p in OUTS.values()] + [str(ASSETS / "title.webp"),
                str(ASSETS / "ui/sun-track.webp"), str(ASSETS / "stage.webp"),
                str(ASSETS / "stage-morning.webp"), str(ASSETS / "stage-noon.webp"),
                str(ASSETS / "stage-evening.webp"), str(PAUSE_OUTPUT)]}
    if args.dry_run:
        print(json.dumps({"plan": plan, "missingInputs": missing}, indent=2))
        return 0
    if missing:
        print("Missing layered inputs; no files written:\n" + "\n".join(missing), file=sys.stderr)
        return 2
    crop_dir = SOURCE / "crops"
    qa_dir = SOURCE / "qa-magenta"
    crop_dir.mkdir(parents=True, exist_ok=True); qa_dir.mkdir(parents=True, exist_ok=True)
    for directory in (ASSETS / "toys", ASSETS / "ui", ASSETS / "shadows"):
        directory.mkdir(parents=True, exist_ok=True)
    crops = crop_sheet(LAYERED / "toys.png", TOYS, crop_dir)
    crops += [LAYERED / f"ui-{name}.png" for name in UI]
    finalize = helper()
    qa: dict[str, Any] = {"format": "shadow-chase-art-qa-v1", "assets": {}, "failures": []}
    finalized_png: dict[str, pathlib.Path] = {}
    for name, crop in zip(TOYS + UI, crops):
        shipping = OUTS[name]
        if shipping.exists() and not args.force:
            qa["assets"][name] = {"status": "skipped-valid-output"}
            continue
        if name in TOYS:
            keep_largest_component(crop)
        temp = crop_dir / f"{name}-final.png"
        magenta = qa_dir / f"{name}.png"
        result = finalize(crop, temp, magenta, 640, 12, 4)
        qa["assets"][name] = result
        if not result.get("pass"):
            qa["failures"].append(name); continue
        write_webp(temp, shipping, lossless=False)
        finalized_png[name] = temp
        alpha = Image.open(temp).getchannel("A")
        if name in TOYS:
            shadow = Image.new("RGBA", Image.open(temp).size, (63, 38, 25, 0)); shadow.putalpha(alpha)
            shadow.save(ASSETS / "shadows" / f"{name}.webp", "WEBP", lossless=True, method=6)

    qa["assets"]["pause"] = write_pause_asset(PAUSE_SOURCE, PAUSE_OUTPUT, qa_dir / "pause.png")

    # Combined QA contact sheet preserves the individual magenta reviews.
    # Missing QA tiles are possible on resume; retain a conspicuous placeholder.
    all_names = TOYS + UI + ("title", "sun-track", "pause")
    reviews = []
    for name in all_names:
        tile = qa_dir / f"{name}.png"
        reviews.append(Image.open(tile).convert("RGB") if tile.exists() else Image.new("RGB", (320, 240), (255, 0, 255)))
    cell_w, cell_h = 320, 240
    contact = Image.new("RGB", (cell_w * 3, cell_h * 5), (255, 0, 255))
    for i, image in enumerate(reviews):
        image.thumbnail((cell_w, cell_h), Image.LANCZOS)
        contact.paste(image, ((i % 3) * cell_w, (i // 3) * cell_h))
    contact.save(SOURCE / "qa-magenta-contact-sheet.png", "PNG", optimize=True)
    stage = Image.open(GPT / "stage-source.png").convert("RGB")
    stage_qa = write_stage(stage, ASSETS / "stage.webp")
    variant_qa = {}
    for moment in ("morning", "noon", "evening"):
        variant_qa[moment] = write_stage(
            grade_stage(stage, moment), ASSETS / f"stage-{moment}.webp",
        )
    for name, target in (("title", ASSETS / "title.webp"), ("sun-track", ASSETS / "ui/sun-track.webp")):
        if target.exists() and not args.force: continue
        temp = crop_dir / f"{name}-final.png"; magenta = qa_dir / f"{name}.png"
        result = finalize(LAYERED / f"{name}.png", temp, magenta, 1200, 12, 4)
        qa["assets"][name] = result
        if not result.get("pass"): qa["failures"].append(name)
        else: write_webp(temp, target, lossless=False)
    # Rebuild after title/track processing so fresh runs include every tile.
    contact = Image.new("RGB", (cell_w * 3, cell_h * 5), (255, 0, 255))
    for i, name in enumerate(all_names):
        tile = qa_dir / f"{name}.png"
        image = Image.open(tile).convert("RGB") if tile.exists() else Image.new("RGB", (cell_w, cell_h), (255, 0, 255))
        image.thumbnail((cell_w, cell_h), Image.LANCZOS)
        contact.paste(image, ((i % 3) * cell_w, (i // 3) * cell_h))
    contact.save(SOURCE / "qa-magenta-contact-sheet.png", "PNG", optimize=True)
    review = stage.convert("RGBA")
    # Representative real raster assets, arranged as a human-review overlay.
    for i, name in enumerate(("rabbit", "turtle", "bear")):
        p = OUTS[name]
        if p.exists():
            toy = Image.open(p).convert("RGBA"); toy.thumbnail((220, 220), Image.LANCZOS)
            x = 110 + i * 470; y = review.height - toy.height - 70
            shadow = Image.open(ASSETS / "shadows" / f"{name}.webp").convert("RGBA"); shadow.thumbnail(toy.size, Image.LANCZOS)
            review.alpha_composite(shadow, (x + 18, y + 20)); review.alpha_composite(toy, (x, y))
    for i, name in enumerate(("sun", "star", "choice-plaque", "button-green", "button-round")):
        p = OUTS[name]
        if p.exists():
            ui = Image.open(p).convert("RGBA"); ui.thumbnail((150, 150), Image.LANCZOS)
            review.alpha_composite(ui, (80 + i * 260, 80))
    track = ASSETS / "ui/sun-track.webp"
    if track.exists():
        rail = Image.open(track).convert("RGBA"); rail.thumbnail((700, 220), Image.LANCZOS)
        review.alpha_composite(rail, ((review.width - rail.width) // 2, 300))
    review.convert("RGB").save(SOURCE / "stage-composite-review.png", "PNG", optimize=True)
    qa["stage"] = stage_qa
    qa["stageVariants"] = variant_qa
    if not stage_qa["withinBudget"]: qa["failures"].append("stage-size-budget")
    for moment, result in variant_qa.items():
        if not result["withinBudget"]: qa["failures"].append(f"stage-{moment}-size-budget")
    (SOURCE / "art-qa.json").write_text(json.dumps(qa, indent=2) + "\n")
    if qa["failures"]:
        print("QA failed: " + ", ".join(qa["failures"]), file=sys.stderr); return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
