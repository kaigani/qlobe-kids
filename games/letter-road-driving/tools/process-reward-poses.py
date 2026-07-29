#!/usr/bin/env python3
"""Separate and normalize the 26 individually generated Letter Road rewards.

Each GPT Image 2 source is a near-full-canvas pose actor on a yellow authoring
ground. Qwen Image Layered removes that ground, then this script crops the
silhouette into a consistent 512px transparent runtime asset and emits
magenta/contact-sheet QA.
"""

from __future__ import annotations

import argparse
import json
import os
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from PIL import Image, ImageDraw


GAME = Path(__file__).resolve().parents[1]
ROOT = GAME / "assets" / "rewards" / "pose"
SOURCE = ROOT / "source"
LAYERED = ROOT / "layered"
FINAL = ROOT / "final"
QA = ROOT / "qa"
SEED = 42

REWARDS = [
    ("a", "Art Studio", "painting at an easel"),
    ("b", "Bakery", "presenting bread"),
    ("c", "Cupcake Cafe", "presenting a giant cupcake"),
    ("d", "Dance Studio", "dancing with a ribbon"),
    ("e", "Engine Garage", "repairing a toy engine"),
    ("f", "Flower Shop", "hugging a bouquet"),
    ("g", "Grocery Market", "carrying produce"),
    ("h", "Hat Shop", "trying on a giant hat"),
    ("i", "Ice Cream Shop", "holding a giant ice-cream cone"),
    ("j", "Juice Bar", "squeezing an orange"),
    ("k", "Kite Park", "flying a kite"),
    ("l", "Library", "reading a picture book"),
    ("m", "Music Shop", "playing a keyboard"),
    ("n", "Nature Center", "watching a butterfly"),
    ("o", "Observatory", "using a telescope"),
    ("p", "Pet Store", "cuddling a puppy"),
    ("q", "Quilt Shop", "holding a patchwork quilt"),
    ("r", "Robot Repair", "repairing a friendly robot"),
    ("s", "Sweet Shop", "holding a giant lollipop"),
    ("t", "Toy Shop", "building with blocks"),
    ("u", "Umbrella Shop", "twirling a rainbow umbrella"),
    ("v", "Vet Clinic", "checking a kitten"),
    ("w", "Water Park", "leaping through a splash"),
    ("x", "Xylophone Hall", "playing a rainbow xylophone"),
    ("y", "Yarn Shop", "knitting a rainbow scarf"),
    ("z", "Zoo", "feeding a baby giraffe"),
]

SHEETS = [
    ("a-i", REWARDS[0:9]),
    ("j-r", REWARDS[9:18]),
    ("s-z", REWARDS[18:26]),
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


def build_sheet(sheet_id: str, rewards: list[tuple[str, str, str]]) -> Path:
    destination = SOURCE / f"{sheet_id}-individuals-yellow.png"
    canvas = Image.new("RGB", (3072, 3072), (255, 255, 0))
    for index, (letter, _, _) in enumerate(rewards):
        image = Image.open(SOURCE / f"{letter}-yellow.png").convert("RGB")
        image.thumbnail((1000, 1000), Image.Resampling.LANCZOS)
        row, col = divmod(index, 3)
        x = col * 1024 + (1024 - image.width) // 2
        y = row * 1024 + (1024 - image.height) // 2
        canvas.paste(image, (x, y))
    canvas.save(destination, "PNG", optimize=True)
    return destination


def layered_extract_sheet(
    api_url: str,
    sheet_id: str,
    rewards: list[tuple[str, str, str]],
) -> Path:
    source = build_sheet(sheet_id, rewards)
    destination = LAYERED / f"{sheet_id}.layer2.png"
    if destination.exists():
        print(f"{sheet_id}: reusing existing layer", flush=True)
        return destination
    count = len(rewards)
    prompt = (
        "Bottom layer: only the complete yellow background. Top layer: only "
        f"the exact {count} large full-body QLOBE pose-actor groups in their "
        "original 3 by 3 cells on true transparent alpha. Preserve every face, "
        "body part, finger, foot, prop, animal, liquid splash, color, detail, "
        "scale, spacing, and silhouette exactly. Keep all parts of each reward "
        "vignette, including detached but intentional props. Do not crop, move, "
        "combine, redraw, replace, omit, or add anything."
    )
    result = json.loads(post(
        f"{api_url}/workflows/qwen-image-layered",
        {"prompt": prompt, "layers": "2", "seed": str(SEED)},
        source,
    ))
    job_id = result.get("job_id")
    if not job_id:
        raise RuntimeError(f"{sheet_id}: Qwen returned no job_id: {result}")
    print(f"{sheet_id}: Qwen job {job_id}", flush=True)
    for _ in range(300):
        time.sleep(4)
        status = json.loads(get(f"{api_url}/jobs/{job_id}"))
        if status.get("status") == "completed":
            destination.write_bytes(get(f"{api_url}/jobs/{job_id}/result?output=layer_2"))
            print(f"{sheet_id}: layer complete", flush=True)
            return destination
        if status.get("status") in {"failed", "error"}:
            raise RuntimeError(status.get("error") or f"{sheet_id}: job failed")
    raise TimeoutError(f"{sheet_id}: Qwen job timed out")


def alpha_stats(image: Image.Image) -> dict[str, float]:
    histogram = image.getchannel("A").histogram()
    total = image.width * image.height
    transparent = histogram[0]
    opaque = histogram[255]
    return {
        "transparentPct": round(100 * transparent / total, 3),
        "opaquePct": round(100 * opaque / total, 3),
        "partialPct": round(100 * (total - transparent - opaque) / total, 3),
    }


def normalize(image: Image.Image) -> tuple[Image.Image, list[int], dict[str, float]]:
    image = image.convert("RGBA")
    alpha = image.getchannel("A").point(lambda value: 0 if value <= 4 else value)
    image.putalpha(alpha)
    bbox = alpha.getbbox()
    if not bbox:
        raise RuntimeError("empty transparent reward cell")
    left, top, right, bottom = bbox
    crop = image.crop((
        max(0, left - 12),
        max(0, top - 12),
        min(image.width, right + 12),
        min(image.height, bottom + 12),
    ))
    inner = 492
    scale = min(inner / crop.width, inner / crop.height)
    if scale != 1:
        crop = crop.resize(
            (max(1, round(crop.width * scale)), max(1, round(crop.height * scale))),
            Image.Resampling.LANCZOS,
        )
    canvas = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
    canvas.alpha_composite(crop, ((512 - crop.width) // 2, (512 - crop.height) // 2))
    return canvas, list(bbox), alpha_stats(canvas)


def write_magenta(sprite: Image.Image, destination: Path) -> None:
    backdrop = Image.new("RGBA", sprite.size, (255, 0, 255, 255))
    backdrop.alpha_composite(sprite)
    backdrop.thumbnail((512, 512), Image.Resampling.LANCZOS)
    backdrop.convert("RGB").save(destination, "PNG", optimize=True)


def contact_sheet(records: list[dict], name: str) -> None:
    cell = 320
    label_height = 30
    canvas = Image.new("RGB", (cell * 3, (cell + label_height) * 3), (255, 0, 255))
    draw = ImageDraw.Draw(canvas)
    for index, record in enumerate(records):
        sprite = Image.open(GAME / record["asset"]).convert("RGBA")
        sprite.thumbnail((cell - 12, cell - 12), Image.Resampling.LANCZOS)
        x = (index % 3) * cell + (cell - sprite.width) // 2
        y = (index // 3) * (cell + label_height) + (cell - sprite.height) // 2
        canvas.paste(sprite, (x, y), sprite)
        draw.text((
            (index % 3) * cell + 10,
            (index // 3) * (cell + label_height) + cell + 4,
        ), f"{record['id'].upper()} — {record['destination']}", fill=(255, 255, 255))
    canvas.save(QA / f"{name}-contact.png", "PNG", optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--api-url", default=os.environ.get("QLOBE_QWEN_URL"))
    parser.add_argument("--extract-only", action="store_true")
    parser.add_argument("--workers", type=int, default=4)
    args = parser.parse_args()
    if not args.api_url and not args.extract_only:
        raise SystemExit("--api-url or QLOBE_QWEN_URL is required")
    for folder in (LAYERED, FINAL, QA):
        folder.mkdir(parents=True, exist_ok=True)

    layers: dict[str, Path] = {}
    if args.extract_only:
        layers = {sheet_id: LAYERED / f"{sheet_id}.layer2.png" for sheet_id, _ in SHEETS}
    else:
        with ThreadPoolExecutor(max_workers=min(3, max(1, args.workers))) as executor:
            jobs = {
                executor.submit(
                    layered_extract_sheet,
                    args.api_url.rstrip("/"),
                    sheet_id,
                    rewards,
                ): sheet_id
                for sheet_id, rewards in SHEETS
            }
            for job in as_completed(jobs):
                sheet_id = jobs[job]
                layers[sheet_id] = job.result()

    records = []
    for sheet_id, rewards in SHEETS:
        layer = layers[sheet_id]
        if not layer.exists():
            raise FileNotFoundError(layer)
        sheet = Image.open(layer).convert("RGBA")
        cell_width, cell_height = sheet.width / 3, sheet.height / 3
        for index, (letter, destination, action) in enumerate(rewards):
            row, col = divmod(index, 3)
            tile = sheet.crop((
                round(col * cell_width),
                round(row * cell_height),
                round((col + 1) * cell_width),
                round((row + 1) * cell_height),
            ))
            sprite, bbox, alpha = normalize(tile)
            output = FINAL / f"{letter}.png"
            sprite.save(output, "PNG", optimize=True)
            write_magenta(sprite, QA / f"{letter}-magenta.png")
            if alpha["transparentPct"] < 8 or alpha["opaquePct"] < 8:
                raise RuntimeError(f"{letter}: implausible alpha {alpha}")
            records.append({
                "id": letter,
                "destination": destination,
                "action": action,
                "source": str((SOURCE / f"{letter}-yellow.png").relative_to(GAME)),
                "layer": str(layer.relative_to(GAME)),
                "cell": [row, col],
                "asset": str(output.relative_to(GAME)),
                "bboxInCell": bbox,
                "alpha": alpha,
            })
            print(f"{letter}: final alpha={alpha}", flush=True)

    for start, name in ((0, "a-i"), (9, "j-r"), (18, "s-z")):
        contact_sheet(records[start:start + 9], name)
    pack = {
        "format": "qlobe-pose-reward-pack",
        "formatVersion": 1,
        "generated": "2026-07-28",
        "sourceModel": "gpt-image-2",
        "generationMode": "26 individual built-in generations",
        "compositionReference": "user-supplied large quilt-shop pose-actor mockup",
        "styleReference": "shared/characters/maya/portrait.png",
        "extractionWorkflow": "qwen-image-layered",
        "seed": SEED,
        "rewards": records,
    }
    (ROOT / "pack.json").write_text(json.dumps(pack, indent=2) + "\n")
    print(f"complete: {len(records)} individual pose rewards", flush=True)


if __name__ == "__main__":
    main()
