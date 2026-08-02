#!/usr/bin/env python3
"""Deterministically turn accepted GPT Image 2 sources into runtime clay art."""

from collections import deque
from math import ceil
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
PRODUCTION = ASSETS / "production"
PARTS = ASSETS / "parts"
MOUTHS = ASSETS / "mouths"
VISEMES = ["a", "o", "e", "wr", "ts", "ln", "uq", "mbp", "fv"]


def trim_alpha(image: Image.Image, padding: int = 16) -> Image.Image:
    image = image.convert("RGBA")
    bbox = image.getchannel("A").getbbox()
    if not bbox:
        raise ValueError("asset is fully transparent")
    left = max(0, bbox[0] - padding)
    top = max(0, bbox[1] - padding)
    right = min(image.width, bbox[2] + padding)
    bottom = min(image.height, bbox[3] + padding)
    return image.crop((left, top, right, bottom))


def keep_main_component(image: Image.Image, threshold: int = 18) -> Image.Image:
    """Remove a neighboring contact-sheet object that crosses a cell boundary."""
    image = image.convert("RGBA")
    alpha = image.getchannel("A")
    width, height = image.size
    pixels = alpha.load()
    seen = bytearray(width * height)
    components: list[list[tuple[int, int]]] = []
    for y in range(height):
        for x in range(width):
            offset = y * width + x
            if seen[offset] or pixels[x, y] <= threshold:
                continue
            seen[offset] = 1
            queue = deque([(x, y)])
            component: list[tuple[int, int]] = []
            while queue:
                px, py = queue.popleft()
                component.append((px, py))
                for nx, ny in ((px - 1, py), (px + 1, py), (px, py - 1), (px, py + 1)):
                    if nx < 0 or ny < 0 or nx >= width or ny >= height:
                        continue
                    candidate = ny * width + nx
                    if seen[candidate] or pixels[nx, ny] <= threshold:
                        continue
                    seen[candidate] = 1
                    queue.append((nx, ny))
            components.append(component)
    if not components:
        return image
    keep = set(max(components, key=len))
    data = image.load()
    for y in range(height):
        for x in range(width):
            if pixels[x, y] > threshold and (x, y) not in keep:
                data[x, y] = (0, 0, 0, 0)
    return image


def fit(image: Image.Image, max_width: int, max_height: int) -> Image.Image:
    image = image.copy()
    image.thumbnail((max_width, max_height), Image.Resampling.LANCZOS)
    return image


def save_webp(image: Image.Image, path: Path, *, quality: int = 88) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "WEBP", quality=quality, method=6)


def cell(sheet: Image.Image, col: int, row: int, cols: int, rows: int) -> Image.Image:
    x0 = round(col * sheet.width / cols)
    x1 = round((col + 1) * sheet.width / cols)
    y0 = round(row * sheet.height / rows)
    y1 = round((row + 1) * sheet.height / rows)
    return sheet.crop((x0, y0, x1, y1))


def matte_preview(items: list[tuple[str, Image.Image]], out: Path) -> None:
    columns = 5
    tile_w, tile_h = 250, 220
    canvas = Image.new("RGB", (tile_w * columns, tile_h * ceil(len(items) / columns)), "#ff00ff")
    draw = ImageDraw.Draw(canvas)
    for index, (name, source) in enumerate(items):
        thumb = fit(source, tile_w - 34, tile_h - 42)
        x = (index % columns) * tile_w + (tile_w - thumb.width) // 2
        y = (index // columns) * tile_h + (tile_h - thumb.height) // 2 + 8
        canvas.paste(thumb, (x, y), thumb)
        draw.text((index % columns * tile_w + 10, index // columns * tile_h + 8), name, fill="white")
    canvas.save(out, "JPEG", quality=90, optimize=True)


def main() -> None:
    source = Image.open(ASSETS / "source" / "workshop-gpt-image-2.png").convert("RGB")
    source.thumbnail((1536, 1024), Image.Resampling.LANCZOS)
    source.save(ASSETS / "workshop.webp", "WEBP", quality=84, method=6)

    title = fit(trim_alpha(Image.open(PRODUCTION / "title-alpha.png"), 22), 960, 500)
    alive = fit(trim_alpha(Image.open(PRODUCTION / "alive-alpha.png"), 18), 720, 320)
    save_webp(title, ASSETS / "title.webp", quality=90)
    save_webp(alive, ASSETS / "alive.webp", quality=90)

    bodies_source = PRODUCTION / "bodies-layer2.png"
    bodies_sheet = Image.open(bodies_source if bodies_source.exists() else PRODUCTION / "bodies-alpha.png").convert("RGBA")
    body_names = ["dino", "monster", "unicorn"]
    qa_items: list[tuple[str, Image.Image]] = []
    for col, name in enumerate(body_names):
        source_cell = fit(cell(bodies_sheet, col, 0, 3, 1), 760, 760)
        body = fit(trim_alpha(keep_main_component(source_cell), 20), 650, 650)
        save_webp(body, ASSETS / f"{name}.webp", quality=90)
        qa_items.append((name, body))

    extra_bodies_sheet = Image.open(PRODUCTION / "bodies-extra-layer2.png").convert("RGBA")
    for col, name in enumerate(["blob", "bird", "dragon"]):
        source_cell = fit(cell(extra_bodies_sheet, col, 0, 3, 1), 760, 760)
        body = fit(trim_alpha(keep_main_component(source_cell), 20), 650, 650)
        save_webp(body, ASSETS / f"{name}.webp", quality=90)
        qa_items.append((name, body))

    parts_source = PRODUCTION / "parts-layer2.png"
    parts_sheet = Image.open(parts_source if parts_source.exists() else PRODUCTION / "parts-alpha.png").convert("RGBA")
    part_names = [
        "eyes-pair", "eye-big", "eyes-three", "smile",
        "horn-yellow", "horns-purple", "spikes-blue", "wing-teal",
        "wing-lavender", "spots", "heart", "rainbow-mane",
    ]
    for index, name in enumerate(part_names):
        source_cell = fit(cell(parts_sheet, index % 4, index // 4, 4, 3), 440, 380)
        part = fit(trim_alpha(keep_main_component(source_cell), 14), 360, 300)
        save_webp(part, PARTS / f"{name}.webp", quality=90)
        qa_items.append((name, part))

    for sheet_name, names in [
        ("parts-eyes-v2-layer2.png", [
            "eyes-pair", "eye-big", "eyes-three", "eyes-insect",
            "eyes-stalk", "eyes-sleepy", "eyes-starry", "eyes-mismatch",
        ]),
        ("parts-top-v2-layer2.png", [
            "horn-yellow", "horns-purple", "spikes-blue", "rainbow-mane",
            "antennae-bug", "crest-leaf", "antlers-crystal", "mohawk-clay",
        ]),
        ("parts-wings-v2-layer2.png", [
            "wing-teal", "wing-lavender", "wing-butterfly", "wing-bee",
            "wing-ladybug", "wing-feather", "wing-leaf", "wing-rainbow",
        ]),
        ("parts-decor-v2-layer2.png", [
            "spot-coral", "spot-yellow", "spot-teal", "spot-blue",
            "heart", "star-badge", "flower-pink", "swirl-purple",
        ]),
        ("parts-limbs-layer2.png", [
            "arm-coral", "hand-teal", "flipper-blue", "claw-pink",
            "boot-yellow", "foot-green", "tail-purple", "tentacle-orange",
        ]),
        ("parts-dress-layer2.png", [
            "bow-tie", "glasses-blue", "crown-yellow", "dress-flower",
            "party-hat", "dress-star", "bow-purple", "scarf-striped",
        ]),
    ]:
        sheet = Image.open(PRODUCTION / sheet_name).convert("RGBA")
        for index, name in enumerate(names):
            source_cell = fit(cell(sheet, index % 4, index // 4, 4, 2), 440, 380)
            part = fit(trim_alpha(keep_main_component(source_cell), 14), 360, 300)
            save_webp(part, PARTS / f"{name}.webp", quality=90)
            qa_items.append((name, part))

    balls = Image.open(PRODUCTION / "blob-balls-layer2.png").convert("RGBA")
    ball_names = [
        "ball-coral", "ball-yellow", "ball-teal", "ball-blue",
        "ball-lavender", "ball-orange", "ball-mint", "ball-cream",
        "ball-purple", "ball-pink", "ball-lime", "ball-brown",
    ]
    for index, name in enumerate(ball_names):
        source_cell = cell(balls, index % 4, index // 4, 4, 3)
        ball = fit(trim_alpha(keep_main_component(source_cell), 16), 380, 380)
        save_webp(ball, PARTS / f"{name}.webp", quality=90)
        qa_items.append((name, ball))

    mouth_qa: list[tuple[str, Image.Image]] = []
    for mouth in ["goofy", "sparkle", "robot", "bubbly", "fangs", "smirk", "hero", "beak"]:
        sheet = Image.open(PRODUCTION / f"mouth-{mouth}-visemes-layer2.png").convert("RGBA")
        for index, viseme in enumerate(VISEMES):
            # Preserve identical cell framing so the mouth does not jump while talking.
            frame = fit(cell(sheet, index % 3, index // 3, 3, 3), 420, 420)
            save_webp(frame, MOUTHS / mouth / f"{viseme}.webp", quality=91)
            mouth_qa.append((f"{mouth}-{viseme}", frame))

    trash_source = fit(Image.open(PRODUCTION / "trash-layer2.png"), 480, 480)
    trash = fit(trim_alpha(keep_main_component(trash_source, 18), 20), 360, 360)
    save_webp(trash, ASSETS / "trash.webp", quality=90)
    qa_items.append(("trash", trash))

    matte_preview(qa_items, PRODUCTION / "qa-magenta.jpg")
    matte_preview(mouth_qa, PRODUCTION / "qa-mouths-magenta.jpg")


if __name__ == "__main__":
    main()
