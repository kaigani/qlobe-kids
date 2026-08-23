#!/usr/bin/env python3
"""Turn layered watercolor contact sheets into deterministic game assets.

This tool intentionally performs no illustration or compositing beyond alpha QA.
It expects the Studio's transparent PNG exports in assets/source/layered.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageOps

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "source"
LAYERED = SOURCE / "layered"
QA = SOURCE / "qa"

WORDS = ["cat", "dog", "pig", "hen", "fox", "bug", "bun", "jam", "ham", "fig", "yam", "nut", "bus", "hat", "box", "cup", "jet", "van"]
CATEGORIES = ["animals", "food", "things"]
MODES = ["picture", "listen", "build"]


def fail(message: str) -> "NoReturn":
    raise RuntimeError(message)


def require(path: Path) -> Path:
    if not path.is_file():
        fail(f"missing required layered input: {path}")
    return path


def open_rgba(path: Path) -> Image.Image:
    try:
        image = Image.open(require(path)).convert("RGBA")
        # Qwen Layered leaves a frame-wide alpha film at values 1–4 on some
        # sheets. It is visually transparent but poisons getbbox(), leaving a
        # tiny subject inside a large runtime canvas. Threshold evidence on all
        # accepted sheets shows 8 removes only that film while retaining every
        # painted anti-aliased edge.
        alpha = image.getchannel("A").point(lambda value: 0 if value <= 8 else value)
        image.putalpha(alpha)
        return image
    except Exception as exc:
        fail(f"cannot read {path}: {exc}")


def trim(image: Image.Image) -> Image.Image:
    alpha = image.getchannel("A")
    box = alpha.getbbox()
    return image.crop(box) if box else image


def save(image: Image.Image, path: Path, *, size: tuple[int, int] | None = None, quality: int = 84) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image = trim(image)
    if size:
        # Image.thumbnail() only shrinks. Several extracted UI pieces are
        # smaller than their authored runtime canvas, so thumbnail() left a
        # tiny book/button floating in a large transparent box. True contain
        # fitting deliberately scales in either direction, then centers.
        scale = min(size[0] / image.width, size[1] / image.height)
        fitted = (max(1, round(image.width * scale)), max(1, round(image.height * scale)))
        if image.size != fitted:
            image = image.resize(fitted, Image.Resampling.LANCZOS)
        canvas = Image.new("RGBA", size, (0, 0, 0, 0))
        canvas.paste(image, ((size[0] - image.width) // 2, (size[1] - image.height) // 2), image)
        image = canvas
    # LANCZOS can reintroduce alpha values 1–8 around already-cleared matte
    # pixels. Reapply the evidence-based floor at output size, then zero RGB
    # only where alpha is truly gone. This prevents red/blue hairlines in
    # imperfect thumbnailers while preserving painted antialiasing above 8.
    alpha = image.getchannel("A").point(lambda value: 0 if value <= 8 else value)
    image.putalpha(alpha)
    transparent = alpha.point(lambda value: 255 if value == 0 else 0)
    image.paste((0, 0, 0, 0), (0, 0), transparent)
    image.save(path, "WEBP", lossless=True if "A" in image.getbands() else False, quality=quality, method=6)


def cells(image: Image.Image, columns: int, rows: int) -> list[Image.Image]:
    width, height = image.size
    if width < columns or height < rows:
        fail(f"layered sheet {image.size} is too small for {columns}x{rows}")
    return [image.crop((x * width // columns, y * height // rows, (x + 1) * width // columns, (y + 1) * height // rows)) for y in range(rows) for x in range(columns)]


def relative_crop(image: Image.Image, box: tuple[float, float, float, float]) -> Image.Image:
    """Crop a normalized box from a generated sheet.

    The prompt fixes object order, but image models do not always honor equal
    mathematical row heights. These authored boxes follow the accepted source
    compositions and deliberately end in the generous gaps between objects.
    """
    width, height = image.size
    left, top, right, bottom = box
    return image.crop((round(left * width), round(top * height), round(right * width), round(bottom * height)))


def keep_largest_alpha_island(image: Image.Image, floor: int = 8) -> Image.Image:
    """Remove detached slivers introduced at a neighboring sprite boundary.

    Applied only to single-piece subjects, carriers, and stamps. Multi-part
    emblems, books, sound ripples, and trails intentionally keep all islands.
    """
    image = image.convert("RGBA")
    alpha = image.getchannel("A")
    width, height = image.size
    values = alpha.tobytes()
    seen = bytearray(width * height)
    largest: list[int] = []
    for start, value in enumerate(values):
        if seen[start] or value <= floor:
            continue
        seen[start] = 1
        stack = [start]
        component: list[int] = []
        while stack:
            index = stack.pop()
            component.append(index)
            x, y = index % width, index // width
            for neighbor in (
                index - 1 if x else -1,
                index + 1 if x + 1 < width else -1,
                index - width if y else -1,
                index + width if y + 1 < height else -1,
            ):
                if neighbor >= 0 and not seen[neighbor] and values[neighbor] > floor:
                    seen[neighbor] = 1
                    stack.append(neighbor)
        if len(component) > len(largest):
            largest = component
    if not largest:
        return image
    allowed = bytearray(width * height)
    for index in largest:
        allowed[index] = values[index]
    image.putalpha(Image.frombytes("L", (width, height), bytes(allowed)))
    return image


def qa_sheet(name: str, images: list[Image.Image], columns: int) -> None:
    if not images:
        return
    size = 220
    rows = (len(images) + columns - 1) // columns
    sheet = Image.new("RGBA", (columns * size, rows * size), (255, 0, 255, 255))
    for index, item in enumerate(images):
        item = trim(item)
        item.thumbnail((size - 20, size - 20), Image.Resampling.LANCZOS)
        x = (index % columns) * size + (size - item.width) // 2
        y = (index // columns) * size + (size - item.height) // 2
        sheet.alpha_composite(item, (x, y))
    QA.mkdir(parents=True, exist_ok=True)
    sheet.convert("RGB").save(QA / f"{name}-alpha-qa.jpg", quality=90)


def process() -> None:
    background = open_rgba(SOURCE / "gpt-image-2" / "reading-garden-master.png").convert("RGB")
    background = ImageOps.fit(background, (1600, 1200), method=Image.Resampling.LANCZOS)
    (ROOT / "assets" / "art").mkdir(parents=True, exist_ok=True)
    background.save(ROOT / "assets" / "art" / "reading-garden.webp", "WEBP", quality=84, method=6)

    title = open_rgba(LAYERED / "title.png")
    save(title, ROOT / "assets" / "ui" / "reading-buddies-title.webp", size=(1120, 360))

    for sheet_name, names in (("words-animals.png", WORDS[:6]), ("words-food.png", WORDS[6:12]), ("words-things.png", WORDS[12:])):
        parts = [keep_largest_alpha_island(part) for part in cells(open_rgba(LAYERED / sheet_name), 3, 2)]
        qa_sheet(sheet_name[:-4], parts, 3)
        for name, part in zip(names, parts):
            save(part, ROOT / "assets" / "words" / f"{name}.webp", size=(360, 300))

    emblem_sheet = open_rgba(LAYERED / "emblems.png")
    emblem_parts = [
        relative_crop(emblem_sheet, box)
        for box in (
            (0.00, 0.00, 0.35, 0.50), (0.36, 0.00, 0.66, 0.50), (0.68, 0.00, 1.00, 0.50),
            (0.00, 0.50, 0.37, 1.00), (0.39, 0.50, 0.68, 1.00), (0.70, 0.50, 1.00, 1.00),
        )
    ]
    qa_sheet("emblems", emblem_parts, 3)
    for name, part in zip(CATEGORIES, emblem_parts[:3]):
        save(part, ROOT / "assets" / "categories" / f"{name}.webp", size=(320, 260))
    for name, part in zip(MODES, emblem_parts[3:6]):
        save(part, ROOT / "assets" / "modes" / f"{name}.webp", size=(320, 260))

    carrier_sheet = open_rgba(LAYERED / "carriers.png")
    quarter = ((0.00, 0.25), (0.25, 0.50), (0.50, 0.75), (0.75, 1.00))
    # Accepted master geometry: tall cards occupy the upper 54%, ribbons the
    # middle 20%, and letter seeds/check the lower 26%. The explicit dark gaps
    # are safer cut lines than equal thirds and preserve the painted edges.
    carrier_parts = [keep_largest_alpha_island(relative_crop(carrier_sheet, (left, 0.00, right, 0.55))) for left, right in quarter]
    carrier_parts += [keep_largest_alpha_island(relative_crop(carrier_sheet, (left, 0.53, right, 0.70))) for left, right in quarter]
    carrier_parts += [relative_crop(carrier_sheet, (left, 0.70, right, 1.00)) for left, right in quarter]
    qa_sheet("carriers", carrier_parts, 4)
    for part, color in zip(carrier_parts[:4], ("blue", "orange", "green", "lavender")):
        save(part, ROOT / "assets" / "ui" / f"picture-frame-{color}.webp", size=(420, 520))
    for part, color in zip(carrier_parts[4:8], ("blue", "orange", "green", "lavender")):
        save(part, ROOT / "assets" / "ui" / f"word-ribbon-{color}.webp", size=(520, 180))

    # The production prompt puts two separate seed tiles in each of the first
    # two cells of row three, then one yellow seed and the check in cells 3–4.
    # Split those paired cells once more so gameplay receives five independent
    # 96px+ touch pieces rather than two baked pairs.
    seed_parts = [
        keep_largest_alpha_island(relative_crop(carrier_sheet, box))
        for box in (
            (0.00, 0.70, 0.137, 1.00),
            (0.137, 0.70, 0.25, 1.00),
            (0.25, 0.70, 0.39, 1.00),
            (0.39, 0.70, 0.50, 1.00),
            (0.50, 0.70, 0.75, 1.00),
        )
    ]
    qa_sheet("letter-seeds", seed_parts, 5)
    for number, part in enumerate(seed_parts, 1):
        save(part, ROOT / "assets" / "ui" / f"letter-seed-{number}.webp", size=(180, 180))
    save(keep_largest_alpha_island(carrier_parts[11]), ROOT / "assets" / "ui" / "check.webp", size=(180, 180))

    book_sheet = open_rgba(LAYERED / "book-rewards.png")
    book_parts = [
        relative_crop(book_sheet, box)
        for box in (
            (0.00, 0.00, 0.40, 0.56),
            (0.40, 0.00, 0.72, 0.56),
            (0.72, 0.00, 1.00, 0.56),
            (0.00, 0.52, 0.385, 1.00),
            (0.38, 0.52, 0.69, 1.00),
            (0.70, 0.52, 1.00, 1.00),
        )
    ]
    qa_sheet("book-rewards", book_parts, 3)
    save(book_parts[0], ROOT / "assets" / "ui" / "open-book.webp", size=(1100, 650))
    save(book_parts[1], ROOT / "assets" / "ui" / "listening-book.webp", size=(520, 380))
    save(book_parts[2], ROOT / "assets" / "ui" / "collection-book.webp", size=(650, 580))
    save(book_parts[3], ROOT / "assets" / "ui" / "celebration-ribbon.webp", size=(700, 200))
    save(book_parts[4], ROOT / "assets" / "ui" / "trail.webp", size=(700, 300))
    reward_parts = [
        keep_largest_alpha_island(relative_crop(book_sheet, box))
        for box in (
            (0.70, 0.52, 0.80, 1.00),
            (0.80, 0.52, 0.885, 1.00),
            (0.89, 0.52, 1.00, 1.00),
        )
    ]
    qa_sheet("reward-stamps", reward_parts, 3)
    for name, part in zip(("star", "leaf", "acorn"), reward_parts):
        save(part, ROOT / "assets" / "ui" / f"reward-{name}.webp", size=(180, 180))

    control_parts = cells(open_rgba(LAYERED / "controls.png"), 3, 2)
    qa_sheet("controls", control_parts, 3)
    for name, part in zip(("home", "back", "sound"), control_parts[:3]):
        save(part, ROOT / "assets" / "ui" / f"{name}.webp", size=(150, 150))
    save(control_parts[3], ROOT / "assets" / "ui" / "action-teal.webp", size=(320, 180))
    save(control_parts[4], ROOT / "assets" / "ui" / "action-blue.webp", size=(320, 180))
    save(control_parts[5], ROOT / "assets" / "ui" / "letter-slot.webp", size=(180, 180))

    manifest = {}
    for path in sorted((ROOT / "assets").rglob("*.webp")):
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        with Image.open(path) as image:
            manifest[str(path.relative_to(ROOT)).replace("\\", "/")] = {"width": image.width, "height": image.height, "sha256": digest}
    (SOURCE / "asset-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.parse_args()
    try:
        process()
    except RuntimeError as exc:
        print(f"finalize-assets: error: {exc}", file=sys.stderr)
        return 2
    print("finalize-assets: wrote processed assets and manifest")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
