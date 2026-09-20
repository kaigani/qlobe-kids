#!/usr/bin/env python3
"""Deterministically finalize TaleTeller's reviewed raster masters.

The nondeterministic GPT Image 2 and Qwen Layered sources remain immutable.
This script only resizes, pads, encodes, records hashes, and makes a hostile
magenta alpha contact sheet. Run the repository asset-sheet cutter before this
script; it intentionally refuses to infer sheet cells.
"""

from __future__ import annotations

import hashlib
import json
from collections import deque
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


GAME = Path(__file__).resolve().parents[1]
ASSETS = GAME / "assets"
SOURCE = ASSETS / "source"
GPT = SOURCE / "gpt-image-2"
CUTS = SOURCE / "cuts-layered"
RAW_CUTS = SOURCE / "cuts"
QA = SOURCE / "qa"
SOURCE_METHODS: dict[str, str] = {}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def fit_alpha(source: Path, destination: Path, canvas: tuple[int, int], fill: float = 0.9) -> None:
    image = Image.open(source).convert("RGBA")
    alpha_box = image.getchannel("A").getbbox()
    if not alpha_box:
        raise RuntimeError(f"{source} contains no visible alpha")
    image = image.crop(alpha_box)
    max_w = max(1, int(canvas[0] * fill))
    max_h = max(1, int(canvas[1] * fill))
    scale = min(max_w / image.width, max_h / image.height)
    size = (max(1, round(image.width * scale)), max(1, round(image.height * scale)))
    image = image.resize(size, Image.Resampling.LANCZOS)
    output = Image.new("RGBA", canvas, (0, 0, 0, 0))
    output.alpha_composite(image, ((canvas[0] - size[0]) // 2, (canvas[1] - size[1]) // 2))
    destination.parent.mkdir(parents=True, exist_ok=True)
    output.save(destination, "WEBP", quality=90, method=6, exact=True)


def save_background(source: Path, destination: Path) -> None:
    image = Image.open(source).convert("RGB")
    target = (1448, 1086)
    if image.size != target:
        ratio = max(target[0] / image.width, target[1] / image.height)
        resized = image.resize(
            (round(image.width * ratio), round(image.height * ratio)),
            Image.Resampling.LANCZOS,
        )
        left = (resized.width - target[0]) // 2
        top = (resized.height - target[1]) // 2
        image = resized.crop((left, top, left + target[0], top + target[1]))
    destination.parent.mkdir(parents=True, exist_ok=True)
    image.save(destination, "WEBP", quality=82, method=6)


def alpha_fraction(path: Path) -> float:
    image = Image.open(path).convert("RGBA")
    histogram = image.getchannel("A").histogram()
    return sum(histogram[:16]) / max(1, sum(histogram))


def remove_connected_charcoal(source: Path, destination: Path) -> Path:
    """Remove only charcoal reachable from the crop border.

    The cream sticker rim keeps subject blacks (eyes, ink, paws) disconnected
    from the matte. This is the fidelity-preserving fallback when a reviewed
    Qwen Layered result drops or redraws a sheet subject.
    """
    image = Image.open(source).convert("RGBA")
    width, height = image.size
    rgb = image.convert("RGB")
    pixels = rgb.load()
    border = []
    for x in range(width):
        border.extend((pixels[x, 0], pixels[x, height - 1]))
    for y in range(height):
        border.extend((pixels[0, y], pixels[width - 1, y]))
    background = tuple(sorted(value[channel] for value in border)[len(border) // 2] for channel in range(3))

    seen = bytearray(width * height)
    matte = bytearray(width * height)
    queue: deque[int] = deque()

    def visit(x: int, y: int) -> None:
        index = y * width + x
        if seen[index]:
            return
        seen[index] = 1
        color = pixels[x, y]
        if max(abs(color[channel] - background[channel]) for channel in range(3)) <= 42:
            queue.append(index)

    for x in range(width):
        visit(x, 0)
        visit(x, height - 1)
    for y in range(height):
        visit(0, y)
        visit(width - 1, y)
    while queue:
        index = queue.popleft()
        matte[index] = 1
        x, y = index % width, index // width
        if x:
            visit(x - 1, y)
        if x + 1 < width:
            visit(x + 1, y)
        if y:
            visit(x, y - 1)
        if y + 1 < height:
            visit(x, y + 1)

    alpha = Image.frombytes("L", (width, height), bytes(0 if pixel else 255 for pixel in matte))
    alpha = alpha.filter(ImageFilter.GaussianBlur(0.65))
    image.putalpha(alpha)
    destination.parent.mkdir(parents=True, exist_ok=True)
    image.save(destination, "PNG", optimize=True)
    return destination


def cut_source(group: str, name: str) -> Path:
    layered = CUTS / group / f"{name}.png"
    key = f"{group}/{name}"
    # The choice-card separation retained every card, but introduced faint
    # horizontal gutter fragments outside several card silhouettes. Prefer the
    # deterministic border-connected matte for those visually prominent cards.
    if group != "choices" and layered.exists() and alpha_fraction(layered) >= 0.05:
        SOURCE_METHODS[key] = "qwen-image-layered layer_2"
        return layered
    raw = RAW_CUTS / group / f"{name}.png"
    if not raw.exists():
        raise FileNotFoundError(f"missing cutter output {raw}")
    processed = SOURCE / "processed-alpha" / group / f"{name}.png"
    rejection = (
        "Layered output rejected after visual QC for gutter artifacts"
        if group == "choices"
        else "Layered sheet rejected or incomplete"
    )
    SOURCE_METHODS[key] = f"border-connected charcoal removal after shared cutter; {rejection}"
    return remove_connected_charcoal(raw, processed)


def record(path: Path) -> dict:
    image = Image.open(path)
    return {
        "path": path.relative_to(GAME).as_posix(),
        "width": image.width,
        "height": image.height,
        "mode": image.mode,
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
    }


def magenta_contact(paths: list[Path], destination: Path) -> None:
    cell = 220
    cols = 6
    rows = (len(paths) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * cell, rows * cell), (255, 0, 255))
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()
    for index, path in enumerate(paths):
        image = Image.open(path).convert("RGBA")
        image.thumbnail((cell - 24, cell - 44), Image.Resampling.LANCZOS)
        x = (index % cols) * cell + (cell - image.width) // 2
        y = (index // cols) * cell + 8
        sheet.paste(image, (x, y), image)
        label = path.stem[:25]
        draw.rectangle(
            ((index % cols) * cell, (index // cols + 1) * cell - 30,
             (index % cols + 1) * cell, (index // cols + 1) * cell),
            fill=(35, 27, 45),
        )
        draw.text(((index % cols) * cell + 8, (index // cols + 1) * cell - 22), label, fill="white", font=font)
    destination.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(destination, "JPEG", quality=91, optimize=True, progressive=True)


def main() -> None:
    finals: list[Path] = []

    for name in ("splash", "forest", "ocean", "moon"):
        destination = ASSETS / "art" / f"{name}.webp"
        save_background(GPT / f"{name}-master.png", destination)
        finals.append(destination)

    title = ASSETS / "ui" / "title.webp"
    fit_alpha(SOURCE / "cuts" / "title" / "title.png", title, (1200, 500), 0.96)
    finals.append(title)

    ui_sizes = {
        "home": (320, 320),
        "back": (320, 320),
        "sound": (320, 320),
        "sound-off": (320, 320),
        "mic": (360, 360),
        "replay": (320, 320),
        "next": (320, 320),
        "storybook": (480, 360),
        "star": (320, 320),
        "sentence-ribbon": (800, 280),
    }
    for name, size in ui_sizes.items():
        destination = ASSETS / "ui" / f"{name}.webp"
        fit_alpha(cut_source("ui", name), destination, size, 0.94)
        finals.append(destination)

    character_names = ("fox", "whale", "moon-bunny")
    for name in character_names:
        destination = ASSETS / "characters" / f"{name}.webp"
        fit_alpha(cut_source("characters-vocab", name), destination, (560, 560), 0.94)
        finals.append(destination)

    vocab_sources = {
        "fox": "fox",
        "butterfly": "butterfly",
        "stream": "stream",
        "flowers": "flowers",
        "whale": "whale",
        "coral": "coral",
        "turtle": "turtle",
        "bubbles": "bubbles",
        "bunny": "moon-bunny",
        "crater": "crater",
        "rover": "rover",
        "star": "story-star",
    }
    for name, source_name in vocab_sources.items():
        destination = ASSETS / "vocab" / f"{name}.webp"
        fit_alpha(
            cut_source("characters-vocab", source_name),
            destination,
            (360, 360),
            0.92,
        )
        finals.append(destination)

    choice_names = (
        "bridge", "boat", "duck", "fireflies", "dolphins", "turtle",
        "pearl", "song", "moon-hop", "rover", "crystal", "star-friend",
    )
    for name in choice_names:
        destination = ASSETS / "choices" / f"{name}.webp"
        fit_alpha(cut_source("choices", name), destination, (440, 440), 0.96)
        finals.append(destination)

    transparent_finals = [path for path in finals if path.parent.name != "art"]
    magenta_contact(transparent_finals, QA / "final-alpha-magenta.jpg")

    report = {
        "format": "qlobe-asset-build",
        "formatVersion": 1,
        "game": "picture-narration",
        "sources": {
            path.name: {"sha256": sha256(path), "bytes": path.stat().st_size}
            for path in sorted(GPT.glob("*.png"))
        },
        "outputs": [record(path) for path in finals],
        "sourceMethods": SOURCE_METHODS,
        "qa": (QA / "final-alpha-magenta.jpg").relative_to(GAME).as_posix(),
    }
    (SOURCE / "build-report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"outputs": len(finals), "bytes": sum(path.stat().st_size for path in finals)}))


if __name__ == "__main__":
    main()
