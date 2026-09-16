#!/usr/bin/env python3
"""Build the shipping Silly Swap Words raster set from approved source layers.

The generated sheets are first validated/named by tools/cut-asset-sheet.py.
Qwen Image Layered then provides layer_2 alpha. This deterministic pass uses the
known 4-column contact sheet layout to isolate cells that still share a few
semi-transparent extraction pixels, removes low-alpha color spill, copies the
nearest opaque subject color into antialiased edge pixels, and writes both a
magenta QA composite and a compact runtime WebP.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt, label

GAME = Path(__file__).resolve().parents[1]
SOURCE = GAME / "assets" / "source"
LAYERED = SOURCE / "layered"
FINAL = SOURCE / "final"
QA = SOURCE / "qa" / "magenta"

UI_NAMES = [
    "letter-well", "prompt-plaque", "mode-swap", "mode-trail",
    "mode-lab", "magic-swap", "success-ribbon", "action-pill",
]
WORDS_A = ["cat", "hat", "hot", "hop", "hog", "dog", "fog", "log", "leg", "pig", "dig", "wig"]
WORDS_B = ["bug", "mug", "rug", "hug", "bun", "sun", "rag", "rat", "bat", "cap", "can", "fig"]

UI_SIZE = {
    "letter-well": 360,
    "prompt-plaque": 860,
    "mode-swap": 430,
    "mode-trail": 430,
    "mode-lab": 430,
    "magic-swap": 360,
    "success-ribbon": 820,
    "action-pill": 620,
}


def clean_alpha(image: Image.Image, alpha_floor: int = 72, core_floor: int = 225) -> Image.Image:
    """Remove colored layer dust, inset its spill band, then decontaminate RGB.

    Qwen's extracted subject is excellent, but its outer 3–5 pixels can inherit
    saturated guide/background colors. Merely clearing low alpha leaves that
    band visible on light screens. We retain the dominant connected silhouette,
    inset four source pixels, and rebuild a two-pixel antialiased edge from the
    subject color. At contact-sheet resolution this is less than two percent of
    a sprite and removes the chroma halo without sanding off clay detail.
    """
    rgba = np.asarray(image.convert("RGBA")).copy()
    alpha = rgba[:, :, 3]
    alpha[alpha <= alpha_floor] = 0
    detected = alpha > 0
    regions, count = label(detected)
    if count:
        sizes = np.bincount(regions.ravel())
        sizes[0] = 0
        biggest = sizes.max()
        keep_ids = np.flatnonzero(sizes >= max(24, biggest * .018))
        detected = np.isin(regions, keep_ids)
    inside = distance_transform_edt(detected)
    # 0 through 4: discard contaminated exterior. 4 through 6: soft rebuilt edge.
    rebuilt = np.clip((inside - 4.0) / 2.0, 0.0, 1.0)
    alpha = np.minimum(alpha, np.rint(rebuilt * 255).astype(np.uint8))
    # Some extractions encode neon guide colors as fully opaque pixels, so an
    # alpha-only cleanup cannot see them. On the narrow exterior band, compare
    # saturated pixels with the nearest deep-interior subject color and replace
    # only strong outliers. Low-saturation details such as eyes, whiskers and
    # cream clay remain untouched.
    deep = inside >= 12.0
    if deep.any():
        nearest_deep = distance_transform_edt(~deep, return_distances=False, return_indices=True)
        dy, dx = nearest_deep[0], nearest_deep[1]
        rgb = rgba[:, :, :3].astype(np.int32)
        reference = rgb[dy, dx]
        delta = np.sqrt(np.square(rgb - reference).sum(axis=2))
        high = rgb.max(axis=2)
        low = rgb.min(axis=2)
        saturation = np.divide(high - low, np.maximum(high, 1), dtype=np.float32)
        spill = (inside > 0) & (inside < 12.0) & (saturation > .72) & (delta > 82)
        rgba[:, :, :3][spill] = reference[spill].astype(np.uint8)
    core = alpha >= core_floor
    fringe = (alpha > 0) & (alpha < core_floor)
    if core.any() and fringe.any():
        nearest = distance_transform_edt(~core, return_distances=False, return_indices=True)
        yy, xx = nearest[0], nearest[1]
        rgba[:, :, :3][fringe] = rgba[yy[fringe], xx[fringe], :3]
    rgba[:, :, 3] = alpha
    return Image.fromarray(rgba, "RGBA")


def trim_pad(image: Image.Image, pad: int = 14) -> Image.Image:
    bbox = image.getchannel("A").getbbox()
    if not bbox:
        raise ValueError("empty alpha after cleanup")
    cut = image.crop(bbox)
    out = Image.new("RGBA", (cut.width + pad * 2, cut.height + pad * 2))
    out.alpha_composite(cut, (pad, pad))
    return out


def contain(image: Image.Image, max_size: int) -> Image.Image:
    if max(image.size) <= max_size:
        return image
    scale = max_size / max(image.size)
    return image.resize((max(1, round(image.width * scale)), max(1, round(image.height * scale))), Image.Resampling.LANCZOS)


def magenta(image: Image.Image, path: Path) -> None:
    bg = Image.new("RGBA", image.size, (255, 0, 255, 255))
    bg.alpha_composite(image)
    bg.convert("RGB").save(path, "PNG", optimize=True)


def emit(image: Image.Image, name: str, runtime_dir: Path, max_size: int) -> dict:
    clean = contain(trim_pad(clean_alpha(image)), max_size)
    runtime_dir.mkdir(parents=True, exist_ok=True)
    FINAL.mkdir(parents=True, exist_ok=True)
    QA.mkdir(parents=True, exist_ok=True)
    clean.save(FINAL / f"{name}.png", "PNG", optimize=True)
    magenta(clean, QA / f"{name}.png")
    runtime = runtime_dir / f"{name}.webp"
    clean.save(runtime, "WEBP", quality=88, method=6)
    alpha = np.asarray(clean.getchannel("A"))
    return {
        "name": name,
        "size": list(clean.size),
        "transparentPct": round(float((alpha == 0).mean() * 100), 3),
        "partialPct": round(float(((alpha > 0) & (alpha < 255)).mean() * 100), 3),
        "runtime": str(runtime.relative_to(GAME)).replace("\\", "/"),
        "bytes": runtime.stat().st_size,
    }


def cells(path: Path, names: list[str], rows: int, cols: int):
    sheet = Image.open(path).convert("RGBA")
    for index, name in enumerate(names):
        row, col = divmod(index, cols)
        left = round(col * sheet.width / cols)
        right = round((col + 1) * sheet.width / cols)
        top = round(row * sheet.height / rows)
        bottom = round((row + 1) * sheet.height / rows)
        yield name, sheet.crop((left, top, right, bottom))


def build_background() -> dict:
    source = Image.open(SOURCE / "gpt-image-2" / "clay-sky-master.png").convert("RGBA")
    # The generator intentionally left a transparent strip beneath the lavender
    # hill. An opaque lavender studio floor is the correct continuation.
    base = Image.new("RGBA", source.size, (151, 99, 192, 255))
    base.alpha_composite(source)
    base = base.resize((1600, 1200), Image.Resampling.LANCZOS).convert("RGB")
    out = GAME / "assets" / "backgrounds" / "clay-sky.webp"
    out.parent.mkdir(parents=True, exist_ok=True)
    base.save(out, "WEBP", quality=86, method=6)
    return {"name": "clay-sky", "size": [1600, 1200], "runtime": str(out.relative_to(GAME)).replace("\\", "/"), "bytes": out.stat().st_size}


def main() -> None:
    records = [build_background()]
    records.append(emit(Image.open(LAYERED / "title.png"), "title", GAME / "assets" / "ui", 1120))
    # The GPT Image 2 sheets already carry native alpha. The official cutter's
    # crops preserve wide carriers and tiny silhouette details better than
    # forcing those pieces back into Qwen's fixed 4-column layer grid, whose
    # ribbon/plaque cells clip at their shared boundary. Qwen's layer_2 outputs
    # remain retained and QA'd in source/, and its title extraction ships.
    for name in UI_NAMES:
        image = Image.open(SOURCE / "crops" / "ui" / f"{name}.png")
        records.append(emit(image, name, GAME / "assets" / "ui", UI_SIZE[name]))
    # These focused GPT Image 2 pieces replaced CSS recoloring and typographic
    # sparkle glyphs during the independent art-direction pass.
    records.append(emit(Image.open(SOURCE / "gpt-image-2" / "action-pill-blue.png"), "action-pill-blue", GAME / "assets" / "ui", 620))
    records.append(emit(Image.open(SOURCE / "gpt-image-2" / "clay-sparkles.png"), "clay-sparkles", GAME / "assets" / "ui", 520))
    for sheet, names in (("words-a", WORDS_A), ("words-b", WORDS_B)):
        for name in names:
            # The contact-sheet fog had two detached wisps. Its curated edit is
            # one coherent rolling bank, so it remains instantly nameable.
            image = Image.open(SOURCE / "gpt-image-2" / "fog-clean.png") if name == "fog" else Image.open(SOURCE / "crops" / sheet / f"{name}.png")
            records.append(emit(image, name, GAME / "assets" / "words", 500))

    # The lab medallion doubles as a friendly nonsense-word character. It is
    # deliberately the same clay actor so children recognize the Lab mode.
    lab = Image.open(FINAL / "mode-lab.png").convert("RGBA")
    records.append(emit(lab, "silly-blob", GAME / "assets" / "characters", 430))
    (FINAL / "build-report.json").write_text(json.dumps({"assets": records}, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"count": len(records), "largestBytes": max(r["bytes"] for r in records), "assets": records}, indent=2))


if __name__ == "__main__":
    main()
