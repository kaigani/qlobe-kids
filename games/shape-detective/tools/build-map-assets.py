#!/usr/bin/env python3
"""Build the authored Chalk Map board and raster-only placement guides."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter, ImageOps

GAME = Path(__file__).resolve().parents[1]
ROOT = GAME.parents[1]
ASSETS = GAME / "assets"
SOURCE = ASSETS / "source"
QA = SOURCE / "qa/map"
BOARD_SOURCE = SOURCE / "gpt-image-2/chalk-map-board-master.png"
BOARD_OUTPUT = ASSETS / "map-board.webp"
GHOST_NAMES = ("triangle", "circle", "rectangle", "square")
EROSION_PX = 19
PAD_PX = 8


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def relative(path: Path) -> str:
    return str(path.relative_to(ROOT))


def build_board() -> dict:
    if not BOARD_SOURCE.is_file():
        raise SystemExit(f"missing accepted board master: {BOARD_SOURCE}")
    source = Image.open(BOARD_SOURCE).convert("RGB")
    content_box = ImageOps.grayscale(source).point(
        lambda value: 255 if value > 12 else 0
    ).getbbox()
    if not content_box:
        raise SystemExit("accepted board master contains no visible frame")
    board = ImageOps.fit(
        source.crop(content_box),
        (1600, 900),
        method=Image.Resampling.LANCZOS,
    )
    board.save(BOARD_OUTPUT, "WEBP", quality=92, method=6)
    preview = board.copy()
    preview.thumbnail((640, 360), Image.Resampling.LANCZOS)
    preview.save(QA / "board-at-640.png", "PNG", optimize=True)
    return {
        "source": relative(BOARD_SOURCE),
        "output": relative(BOARD_OUTPUT),
        "sourceSha256": sha256(BOARD_SOURCE),
        "outputSha256": sha256(BOARD_OUTPUT),
        "size": [1600, 900],
        "method": "trim near-black outer ground + ImageOps.fit Lanczos; opaque WebP q92 method6",
        "trim": {"luminanceAbove": 12, "bbox": list(content_box)},
        "qa": relative(QA / "board-at-640.png"),
    }


def build_ghost(name: str) -> tuple[dict, Image.Image]:
    source = ASSETS / "shapes" / f"{name}.webp"
    if not source.is_file():
        raise SystemExit(f"missing accepted shape cutout: {source}")
    shape = Image.open(source).convert("RGBA")
    bbox = shape.getchannel("A").getbbox()
    if not bbox:
        raise SystemExit(f"shape has no alpha content: {source}")
    shape = shape.crop(bbox)
    alpha = shape.getchannel("A")

    # Separate the colored chalk body from its near-neutral dark cast shadow,
    # then retain a narrow inner band. A small close fills texture pinholes;
    # multiplying by the source alpha restores its broken handmade edge.
    body_values = []
    for (red, green, blue, _), alpha_value in zip(
        shape.get_flattened_data(), alpha.get_flattened_data()
    ):
        chroma = max(red, green, blue) - min(red, green, blue)
        body_values.append(
            255 if alpha_value >= 48 and max(red, green, blue) >= 45 and chroma >= 15 else 0
        )
    core = Image.new("L", shape.size)
    core.putdata(body_values)
    core = core.filter(ImageFilter.MaxFilter(9))
    core = ImageChops.multiply(core, alpha.point(lambda value: 255 if value >= 48 else 0))
    core = ImageOps.expand(core, border=PAD_PX, fill=0)
    alpha = ImageOps.expand(alpha, border=PAD_PX, fill=0)
    eroded = core.filter(ImageFilter.MinFilter(EROSION_PX))
    outline = ImageChops.multiply(ImageChops.subtract(core, eroded), alpha)

    # Source luminance modulates color and opacity, preserving real powder and
    # hand pressure rather than turning the guide into a flat vector line.
    texture = ImageOps.expand(
        ImageOps.autocontrast(ImageOps.grayscale(shape)),
        border=PAD_PX,
        fill=0,
    )
    chalk_rgb = ImageOps.colorize(texture, black=(148, 116, 58), white=(255, 249, 204))
    texture_alpha = ImageEnhance.Contrast(texture).enhance(0.72).point(
        lambda value: 170 + round(value * 85 / 255)
    )
    outline = ImageChops.multiply(outline, texture_alpha)

    ghost = Image.new("RGBA", core.size)
    ghost.paste(chalk_rgb, mask=outline)
    ghost.putalpha(outline)

    output = ASSETS / "ghosts" / f"{name}.webp"
    output.parent.mkdir(parents=True, exist_ok=True)
    ghost.save(output, "WEBP", quality=90, method=6)
    return ({
        "source": relative(source),
        "output": relative(output),
        "sourceSha256": sha256(source),
        "outputSha256": sha256(output),
        "size": list(ghost.size),
        "method": "colored-body mask + MinFilter(19) inner edge + source-luminance chalk texture",
        "params": {
            "alphaThreshold": 48,
            "minimumRgb": 45,
            "minimumChroma": 15,
            "bodyClosePx": 9,
            "erosionPx": EROSION_PX,
            "padPx": PAD_PX,
            "webpQuality": 90,
            "webpMethod": 6,
        },
    }, ghost)


def composite_sheet(
    panels: list[tuple[str, Image.Image]],
    background: tuple[int, int, int],
    path: Path,
) -> None:
    sheet = Image.new("RGB", (800, 220), background)
    draw = ImageDraw.Draw(sheet)
    ink = (20, 24, 25) if sum(background) > 450 else (255, 249, 204)
    for index, (name, panel) in enumerate(panels):
        preview = panel.copy()
        preview.thumbnail((184, 180), Image.Resampling.LANCZOS)
        x = index * 200 + (200 - preview.width) // 2
        y = (185 - preview.height) // 2
        sheet.paste(preview, (x, y), preview)
        draw.text((index * 200 + 8, 198), name, fill=ink)
    sheet.save(path, "PNG", optimize=True)


def main() -> None:
    QA.mkdir(parents=True, exist_ok=True)
    receipt = {"board": build_board(), "ghosts": {}}
    panels = []
    for name in GHOST_NAMES:
        record, ghost = build_ghost(name)
        receipt["ghosts"][name] = record
        panels.append((name, ghost))

    qa_paths = {
        "magenta": QA / "ghosts-magenta.png",
        "black": QA / "ghosts-black.png",
        "white": QA / "ghosts-white.png",
    }
    composite_sheet(panels, (255, 0, 255), qa_paths["magenta"])
    composite_sheet(panels, (20, 24, 25), qa_paths["black"])
    composite_sheet(panels, (255, 255, 255), qa_paths["white"])
    receipt["qa"] = {key: relative(path) for key, path in qa_paths.items()}
    (QA / "processing.json").write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps(receipt, indent=2))


if __name__ == "__main__":
    main()
