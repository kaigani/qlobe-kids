#!/usr/bin/env python3
"""Extract and slice the Letter Road A-Z reward-character sheets.

GPT Image 2 yellow-ground 3x3 sheets
  -> Qwen Image Layered layer_2
  -> deterministic cell slicing / detached-fragment cleanup
  -> 512px transparent reward sprites + magenta/contact-sheet QC
"""

from __future__ import annotations

import argparse
import json
import os
import time
import urllib.request
from collections import deque
from pathlib import Path

from PIL import Image, ImageDraw


GAME = Path(__file__).resolve().parents[1]
ROOT = GAME / "assets" / "rewards"
SOURCE = ROOT / "source"
LAYERED = ROOT / "layered"
FINAL = ROOT / "final"
QA = ROOT / "qa"
SEED = 42

SHEETS = [
    {
        "id": "rewards-a-i",
        "source": "rewards-a-i-yellow.png",
        "items": [
            ("a", "Art Studio", "painting at an easel"),
            ("b", "Bakery", "holding a tray of bread"),
            ("c", "Cupcake Cafe", "presenting a cupcake"),
            ("d", "Dance Studio", "performing a dance pose"),
            ("e", "Engine Garage", "holding a toy wrench"),
            ("f", "Flower Shop", "carrying a bouquet"),
            ("g", "Grocery Market", "holding a produce basket"),
            ("h", "Hat Shop", "trying on a big hat"),
            ("i", "Ice Cream Shop", "holding an ice-cream cone"),
        ],
    },
    {
        "id": "rewards-j-r",
        "source": "rewards-j-r-yellow.png",
        "items": [
            ("j", "Juice Bar", "squeezing an orange"),
            ("k", "Kite Park", "flying a kite"),
            ("l", "Library", "reading an open book"),
            ("m", "Music Shop", "playing a keyboard"),
            ("n", "Nature Center", "watching a butterfly"),
            ("o", "Observatory", "looking through a telescope"),
            ("p", "Pet Store", "holding a puppy"),
            ("q", "Quilt Shop", "holding a patchwork quilt"),
            ("r", "Robot Repair", "repairing a toy robot"),
        ],
    },
    {
        "id": "rewards-s-z",
        "source": "rewards-s-z-yellow.png",
        "items": [
            ("s", "Sweet Shop", "holding a spiral lollipop"),
            ("t", "Toy Shop", "building with toy blocks"),
            ("u", "Umbrella Shop", "twirling a rainbow umbrella"),
            ("v", "Vet Clinic", "checking a kitten"),
            ("w", "Water Park", "splashing with a swim ring"),
            ("x", "Xylophone Hall", "playing a rainbow xylophone"),
            ("y", "Yarn Shop", "knitting a colorful scarf"),
            ("z", "Zoo", "feeding a baby giraffe"),
            ("bonus", "Alphabet Celebration", "holding a golden star"),
        ],
    },
]


def post(url: str, fields: dict[str, str], image: Path) -> bytes:
    boundary = "----qlobe" + os.urandom(8).hex()
    body = bytearray()
    for name, value in fields.items():
        body += (
            f"--{boundary}\r\n"
            f"Content-Disposition: form-data; name=\"{name}\"\r\n\r\n"
            f"{value}\r\n"
        ).encode()
    body += (
        f"--{boundary}\r\n"
        f"Content-Disposition: form-data; name=\"image\"; filename=\"{image.name}\"\r\n"
        "Content-Type: image/png\r\n\r\n"
    ).encode()
    body += image.read_bytes() + b"\r\n"
    body += f"--{boundary}--\r\n".encode()
    request = urllib.request.Request(
        url,
        data=bytes(body),
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    with urllib.request.urlopen(request, timeout=900) as response:
        return response.read()


def get(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=900) as response:
        return response.read()


def layered_extract(api_url: str, sheet: dict, source: Path, destination: Path) -> None:
    prompt = (
        "Bottom layer: the complete solid pure-yellow background. Top layer: "
        "the exact same nine full-body QLOBE character-and-action groupings in "
        "their original 3 by 3 positions on transparent background. Preserve "
        "every face, body, hand, foot, prop, animal, color, detail, scale, "
        "spacing, and silhouette exactly. Keep each vignette complete. Do not "
        "combine, move, replace, omit, crop, or redraw anything."
    )
    result = json.loads(post(
        f"{api_url}/workflows/qwen-image-layered",
        {"prompt": prompt, "layers": "2", "seed": str(SEED)},
        source,
    ))
    job_id = result.get("job_id")
    if not job_id:
        raise RuntimeError(f"Qwen Image Layered returned no job_id: {result}")
    print(f"{sheet['id']}: Qwen job {job_id}", flush=True)
    for _ in range(225):
        time.sleep(4)
        status = json.loads(get(f"{api_url}/jobs/{job_id}"))
        if status.get("status") == "completed":
            destination.write_bytes(get(f"{api_url}/jobs/{job_id}/result?output=layer_2"))
            return
        if status.get("status") in {"failed", "error"}:
            raise RuntimeError(status.get("error") or f"job {job_id} {status.get('status')}")
    raise TimeoutError(f"Qwen job {job_id} timed out")


def remove_detached_specks(tile: Image.Image) -> Image.Image:
    alpha = tile.getchannel("A")
    width, height = alpha.size
    mask = bytearray(alpha.point(lambda value: 255 if value > 8 else 0).tobytes())
    visited = bytearray(width * height)
    components: list[tuple[list[int], bool]] = []
    neighbors = (-width - 1, -width, -width + 1, -1, 1, width - 1, width, width + 1)
    for start, value in enumerate(mask):
        if not value or visited[start]:
            continue
        queue = deque([start])
        visited[start] = 1
        pixels: list[int] = []
        touches_edge = False
        while queue:
            index = queue.popleft()
            pixels.append(index)
            y, x = divmod(index, width)
            if x == 0 or y == 0 or x == width - 1 or y == height - 1:
                touches_edge = True
            for delta in neighbors:
                nxt = index + delta
                if nxt < 0 or nxt >= len(mask) or visited[nxt] or not mask[nxt]:
                    continue
                ny, nx = divmod(nxt, width)
                if abs(nx - x) > 1 or abs(ny - y) > 1:
                    continue
                visited[nxt] = 1
                queue.append(nxt)
        components.append((pixels, touches_edge))
    if not components:
        return tile
    largest = max(len(pixels) for pixels, _ in components)
    total = width * height
    alpha_bytes = bytearray(alpha.tobytes())
    for pixels, touches_edge in components:
        area = len(pixels)
        if area < max(36, round(total * 0.0007)) or (
            touches_edge and area < max(round(total * 0.05), largest * 0.35)
        ):
            for index in pixels:
                alpha_bytes[index] = 0
    tile.putalpha(Image.frombytes("L", (width, height), bytes(alpha_bytes)))
    return tile


def stats(image: Image.Image) -> dict[str, float]:
    hist = image.getchannel("A").histogram()
    total = image.width * image.height
    transparent = hist[0]
    opaque = hist[255]
    return {
        "transparentPct": round(100 * transparent / total, 3),
        "opaquePct": round(100 * opaque / total, 3),
        "partialPct": round(100 * (total - transparent - opaque) / total, 3),
    }


def normalize(tile: Image.Image) -> tuple[Image.Image, list[int], dict[str, float]]:
    tile = tile.convert("RGBA")
    alpha = tile.getchannel("A").point(lambda value: 0 if value <= 4 else value)
    tile.putalpha(alpha)
    tile = remove_detached_specks(tile)
    alpha = tile.getchannel("A")
    bbox = alpha.getbbox()
    if not bbox:
        raise RuntimeError("empty reward cell")
    left, top, right, bottom = bbox
    crop = tile.crop((max(0, left - 8), max(0, top - 8), min(tile.width, right + 8), min(tile.height, bottom + 8)))
    inner = 484
    scale = min(inner / crop.width, inner / crop.height)
    if scale < 1:
        crop = crop.resize(
            (max(1, round(crop.width * scale)), max(1, round(crop.height * scale))),
            Image.Resampling.LANCZOS,
        )
    canvas = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
    canvas.alpha_composite(crop, ((512 - crop.width) // 2, (512 - crop.height) // 2))
    return canvas, list(bbox), stats(canvas)


def write_magenta(sprite: Image.Image, destination: Path) -> None:
    backdrop = Image.new("RGBA", sprite.size, (255, 0, 255, 255))
    backdrop.alpha_composite(sprite)
    backdrop.convert("RGB").save(destination, "PNG", optimize=True)


def contact_sheet(paths: list[Path], destination: Path) -> None:
    cell = 270
    label_h = 28
    canvas = Image.new("RGB", (cell * 3, (cell + label_h) * 3), (255, 0, 255))
    draw = ImageDraw.Draw(canvas)
    for index, path in enumerate(paths):
        sprite = Image.open(path).convert("RGBA")
        sprite.thumbnail((cell - 20, cell - 20), Image.Resampling.LANCZOS)
        x = (index % 3) * cell + (cell - sprite.width) // 2
        y = (index // 3) * (cell + label_h) + (cell - sprite.height) // 2
        canvas.paste(sprite, (x, y), sprite)
        draw.text(((index % 3) * cell + 8, (index // 3) * (cell + label_h) + cell),
                  path.stem, fill=(255, 255, 255))
    canvas.save(destination, "PNG", optimize=True)


def process_sheet(sheet: dict, layer: Path) -> list[dict]:
    image = Image.open(layer).convert("RGBA")
    cw, ch = image.width / 3, image.height / 3
    records = []
    outputs = []
    for index, (letter, destination, action) in enumerate(sheet["items"]):
        row, col = divmod(index, 3)
        tile = image.crop((
            round(col * cw), round(row * ch),
            round((col + 1) * cw), round((row + 1) * ch),
        ))
        sprite, bbox, alpha = normalize(tile)
        output = FINAL / f"{letter}.png"
        sprite.save(output, "PNG", optimize=True)
        write_magenta(sprite, QA / f"{letter}-magenta.png")
        if alpha["transparentPct"] < 15 or alpha["opaquePct"] < 2:
            raise RuntimeError(f"{letter}: implausible alpha {alpha}")
        records.append({
            "id": letter,
            "destination": destination,
            "action": action,
            "sheet": sheet["id"],
            "cell": [row, col],
            "asset": str(output.relative_to(GAME)),
            "bboxInCell": bbox,
            "alpha": alpha,
        })
        outputs.append(output)
        print(f"  {letter}: {destination} alpha={alpha}", flush=True)
    contact_sheet(outputs, QA / f"{sheet['id']}-contact.png")
    return records


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--api-url", default=os.environ.get("QLOBE_QWEN_URL"))
    parser.add_argument("--extract-only", action="store_true")
    args = parser.parse_args()
    if not args.api_url and not args.extract_only:
        raise SystemExit("--api-url or QLOBE_QWEN_URL is required")
    api_url = (args.api_url or "").rstrip("/")
    for folder in (LAYERED, FINAL, QA):
        folder.mkdir(parents=True, exist_ok=True)
    records = []
    for sheet in SHEETS:
        source = SOURCE / sheet["source"]
        layer = LAYERED / f"{sheet['id']}.layer2.png"
        if not layer.exists():
            if args.extract_only:
                raise FileNotFoundError(layer)
            layered_extract(api_url, sheet, source, layer)
        else:
            print(f"{sheet['id']}: reusing {layer.relative_to(GAME)}", flush=True)
        records.extend(process_sheet(sheet, layer))
    pack = {
        "format": "qlobe-reward-pack",
        "formatVersion": 1,
        "generated": "2026-07-28",
        "sourceModel": "gpt-image-2",
        "styleReference": "shared/characters/maya/portrait.png",
        "extractionWorkflow": "qwen-image-layered",
        "seed": SEED,
        "rewards": records,
    }
    (ROOT / "pack.json").write_text(json.dumps(pack, indent=2) + "\n")
    print(f"complete: {len(records)} rewards ({len(records) - 1} A-Z + bonus)", flush=True)


if __name__ == "__main__":
    main()
