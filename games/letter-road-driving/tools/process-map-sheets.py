#!/usr/bin/env python3
"""Extract and slice Letter Road 3x3 sprite sheets.

Production flow:
  GPT Image 2 yellow-ground sheet
  -> Qwen Image Layered (layer_2)
  -> deterministic 3x3 slicing
  -> alpha crop/pad/normalize
  -> per-sprite magenta QC + machine-readable manifest

The source sheets are deliberately retained as regeneration lineage. Runtime
sprites are transparent PNGs in assets/map/{destinations,props}/.
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
MAP = GAME / "assets" / "map"
SOURCE = MAP / "source"
LAYERED = MAP / "layered"
DESTINATIONS = MAP / "destinations"
PROPS = MAP / "props"
QA = MAP / "qa"
SEED = 42

SHEETS = [
    {
        "id": "destinations-a-i",
        "source": "destinations-a-i-yellow.png",
        "kind": "destination",
        "names": [
            "art-studio", "bakery", "cupcake-cafe",
            "dance-studio", "engine-garage", "flower-shop",
            "grocery-market", "hat-shop", "ice-cream-shop",
        ],
    },
    {
        "id": "destinations-j-r",
        "source": "destinations-j-r-yellow.png",
        "kind": "destination",
        "names": [
            "juice-bar", "kite-park", "library",
            "music-shop", "nature-center", "observatory",
            "pet-store", "quilt-shop", "robot-repair",
        ],
    },
    {
        "id": "destinations-s-z",
        "source": "destinations-s-z-yellow.png",
        "kind": "destination",
        "names": [
            "sweet-shop", "toy-shop", "umbrella-shop",
            "vet-clinic", "water-park", "xylophone-hall",
            "yarn-shop", "zoo", "town-hall",
        ],
    },
    {
        "id": "props-town",
        "source": "props-town-yellow.png",
        "kind": "prop",
        "names": [
            "cottage", "tree", "flower-bed",
            "mailbox", "lamp", "bench",
            "fountain", "picket-fence", "topiary",
        ],
    },
    {
        "id": "props-play",
        "source": "props-play-yellow.png",
        "kind": "prop",
        "names": [
            "flowers", "grass", "pebbles",
            "hydrant", "signpost", "pond",
            "swings", "gazebo", "picnic-table",
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
    noun = "destination buildings" if sheet["kind"] == "destination" else "town scenery props"
    prompt = (
        "Bottom layer: the complete solid pure-yellow background. "
        f"Top layer: the exact same nine {noun} in their original 3 by 3 positions "
        "on transparent background. Preserve every object's identity, colors, "
        "details, scale, spacing, and silhouette exactly. Do not combine, move, "
        "replace, omit, or redraw any object."
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


def alpha_stats(image: Image.Image) -> dict[str, float]:
    hist = image.getchannel("A").histogram()
    total = image.width * image.height
    transparent = hist[0]
    opaque = hist[255]
    partial = total - transparent - opaque
    return {
        "transparentPct": round(100 * transparent / total, 3),
        "opaquePct": round(100 * opaque / total, 3),
        "partialPct": round(100 * partial / total, 3),
    }


def remove_detached_specks(tile: Image.Image) -> Image.Image:
    """Remove Qwen fragments while preserving legitimate multi-part sprites.

    Whole-sheet extraction can leave a thin sliver of the neighboring row at a
    cell boundary. Those fragments touch the cell edge and are much smaller
    than the intended subject. We also remove truly tiny isolated islands, but
    keep substantial disconnected pieces such as the three pebbles.
    """
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
        reject = (
            area < max(40, round(total * 0.001))
            or (touches_edge and area < max(round(total * 0.05), largest * 0.35))
        )
        if reject:
            for index in pixels:
                alpha_bytes[index] = 0
    tile.putalpha(Image.frombytes("L", (width, height), bytes(alpha_bytes)))
    return tile


def normalize(tile: Image.Image, size: int, pad: int) -> tuple[Image.Image, list[int], dict[str, float]]:
    tile = tile.convert("RGBA")
    alpha = tile.getchannel("A").point(lambda value: 0 if value <= 4 else value)
    tile.putalpha(alpha)
    tile = remove_detached_specks(tile)
    alpha = tile.getchannel("A")
    bbox = alpha.getbbox()
    if not bbox:
        raise RuntimeError("empty sprite cell")
    left, top, right, bottom = bbox
    crop = tile.crop((
        max(0, left - pad),
        max(0, top - pad),
        min(tile.width, right + pad),
        min(tile.height, bottom + pad),
    ))
    inner = size - 24
    scale = min(inner / crop.width, inner / crop.height)
    if scale < 1:
        crop = crop.resize(
            (max(1, round(crop.width * scale)), max(1, round(crop.height * scale))),
            Image.Resampling.LANCZOS,
        )
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.alpha_composite(crop, ((size - crop.width) // 2, (size - crop.height) // 2))
    return canvas, list(bbox), alpha_stats(canvas)


def write_magenta(sprite: Image.Image, destination: Path) -> None:
    backdrop = Image.new("RGBA", sprite.size, (255, 0, 255, 255))
    backdrop.alpha_composite(sprite)
    backdrop.convert("RGB").save(destination, "PNG", optimize=True)


def make_contact_sheet(paths: list[Path], destination: Path, title: str) -> None:
    cell = 256
    margin = 20
    label_h = 28
    sheet = Image.new("RGB", (cell * 3 + margin * 2, (cell + label_h) * 3 + margin * 2), (255, 0, 255))
    draw = ImageDraw.Draw(sheet)
    for index, path in enumerate(paths):
        sprite = Image.open(path).convert("RGBA")
        sprite.thumbnail((cell - 16, cell - 16), Image.Resampling.LANCZOS)
        x = margin + (index % 3) * cell + (cell - sprite.width) // 2
        y = margin + (index // 3) * (cell + label_h) + (cell - sprite.height) // 2
        sheet.paste(sprite, (x, y), sprite)
        draw.text((margin + (index % 3) * cell + 8, margin + (index // 3) * (cell + label_h) + cell),
                  path.stem, fill=(255, 255, 255))
    sheet.save(destination, "PNG", optimize=True)
    print(f"{title}: contact sheet {destination.relative_to(GAME)}", flush=True)


def process_sheet(sheet: dict, layer_path: Path) -> list[dict]:
    image = Image.open(layer_path).convert("RGBA")
    output_dir = DESTINATIONS if sheet["kind"] == "destination" else PROPS
    size = 384 if sheet["kind"] == "destination" else 320
    cw = image.width / 3
    ch = image.height / 3
    records = []
    outputs = []
    for index, name in enumerate(sheet["names"]):
        row, col = divmod(index, 3)
        x0, y0 = round(col * cw), round(row * ch)
        x1, y1 = round((col + 1) * cw), round((row + 1) * ch)
        tile = image.crop((x0, y0, x1, y1))
        sprite, bbox, stats = normalize(tile, size, 8)
        output = output_dir / f"{name}.png"
        qc = QA / f"{name}-magenta.png"
        sprite.save(output, "PNG", optimize=True)
        write_magenta(sprite, qc)
        if stats["transparentPct"] < 20 or stats["opaquePct"] < 2:
            raise RuntimeError(f"{name}: implausible alpha stats {stats}")
        records.append({
            "id": name,
            "kind": sheet["kind"],
            "sheet": sheet["id"],
            "cell": [row, col],
            "asset": str(output.relative_to(GAME)),
            "bboxInCell": bbox,
            "alpha": stats,
        })
        outputs.append(output)
        print(f"  {name}: alpha={stats}", flush=True)
    make_contact_sheet(outputs, QA / f"{sheet['id']}-contact.png", sheet["id"])
    return records


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--api-url", default=os.environ.get("QLOBE_QWEN_URL"))
    parser.add_argument("--extract-only", action="store_true",
                        help="reuse existing layer_2 outputs and only reslice/QC")
    args = parser.parse_args()
    if not args.api_url and not args.extract_only:
        raise SystemExit("--api-url or QLOBE_QWEN_URL is required")
    api_url = (args.api_url or "").rstrip("/")
    for folder in (LAYERED, DESTINATIONS, PROPS, QA):
        folder.mkdir(parents=True, exist_ok=True)

    records = []
    for sheet in SHEETS:
        source = SOURCE / sheet["source"]
        layer = LAYERED / f"{sheet['id']}.layer2.png"
        if not source.exists():
            raise FileNotFoundError(source)
        if not layer.exists():
            if args.extract_only:
                raise FileNotFoundError(layer)
            layered_extract(api_url, sheet, source, layer)
        else:
            print(f"{sheet['id']}: reusing {layer.relative_to(GAME)}", flush=True)
        records.extend(process_sheet(sheet, layer))

    manifest = {
        "format": "qlobe-map-sprite-pack",
        "formatVersion": 1,
        "generated": "2026-07-28",
        "sourceModel": "gpt-image-2",
        "extractionWorkflow": "qwen-image-layered",
        "seed": SEED,
        "sheets": [sheet["id"] for sheet in SHEETS],
        "sprites": records,
    }
    (MAP / "pack.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"complete: {len(records)} sprites", flush=True)


if __name__ == "__main__":
    main()
