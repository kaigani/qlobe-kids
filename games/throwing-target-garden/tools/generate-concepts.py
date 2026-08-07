#!/usr/bin/env python3
"""Generate four reproducible Krea 2 visual-development studies."""

from __future__ import annotations

import argparse
import datetime
import hashlib
import json
import os
import tempfile
import urllib.request
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageOps


GAME = Path(__file__).resolve().parents[1]
ROOT = GAME.parents[1]
STATE = ROOT / "tools/state/local.json"
OUT = GAME / "assets/source/krea2-concepts"
WIDTH = 1024
HEIGHT = 768
MAX_IMAGE_BYTES = 32 * 1024 * 1024
WORKFLOW = "krea2-turbo-t2i"

COMMON = (
    "Use case: stylized-concept. Asset type: game visual-development study. "
    "Style/medium: a cozy felt-and-fabric preschool diorama with visible fuzzy "
    "fibers, embroidery, stuffed depth, imperfect hand-cut edges, and warm "
    "tactile shadows. Color palette: saturated teal, sky blue, leaf green, "
    "cream, orange, red, yellow, blue, and purple. Composition/framing: "
    "front-facing 4:3 tablet composition. Lighting/mood: premium, safe, warm, "
    "and joyful. Constraints: no vector art, CSS art, photorealism, logos, "
    "watermarks, letters, or words. "
)

STUDIES = (
    (
        "01-world-stage",
        "Primary request: a calm full-bleed handmade felt garden stage with a "
        "dark teal scalloped canopy, two stitched trees, and layered shrubs "
        "framing a clear sky-blue central 55 percent. Smiling plush flowers sit "
        "low at the edges. No target, beanbag, basket, device, UI, or text.",
    ),
    (
        "02-core-play",
        "Primary request: a tactile felt play composition with one large cream "
        "stuffed circular target carrying one clearly readable stitched blue "
        "numeral 3, a woven soft basket low at center, and red, yellow, and blue "
        "beanbags resting beside or inside it. Keep open upper zones for runtime "
        "HUD. No flying object, device, child, UI, or text.",
    ),
    (
        "03-mode-shelf",
        "Primary request: a warm felt garden mode shelf with three separate "
        "large cream stitched activity cards arranged in one row. The first card "
        "shows a red-and-cream bullseye, the second shows three overlapping red, "
        "yellow, and blue felt rings, and the third shows a winding stitched path "
        "with three colored stepping-stone circles. Keep every card fully visible "
        "with consistent scale and generous space around it. No labels, title, "
        "device, child, UI chrome, or text.",
    ),
    (
        "04-garden-match",
        "Primary request: a celebratory felt garden composition with a soft "
        "basket containing one blue beanbag as the clear destination, a separate "
        "rainbow target as the recognition cue, cheering plush flowers, and "
        "sparse felt confetti. Preserve generous empty zones for real HTML. No "
        "flying object, device, UI, or text.",
    ),
)


def api_url(cli_value: str | None) -> str:
    try:
        state = json.loads(STATE.read_text())
    except (OSError, json.JSONDecodeError):
        state = {}
    return (
        cli_value
        or os.getenv("QLOBE_QWEN_URL")
        or state.get("qwenUrl")
        or ""
    ).rstrip("/")


def post_multipart(url: str, fields: dict[str, object]) -> bytes:
    boundary = "----qlobe" + os.urandom(8).hex()
    body = bytearray()
    for name, value in fields.items():
        body += (
            f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"'
            f"\r\n\r\n{value}\r\n"
        ).encode()
    body += f"--{boundary}--\r\n".encode()
    request = urllib.request.Request(
        url,
        data=bytes(body),
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    with urllib.request.urlopen(request, timeout=900) as response:
        return response.read(MAX_IMAGE_BYTES + 1)


def validate_png_bytes(data: bytes) -> None:
    if len(data) > MAX_IMAGE_BYTES or not data.startswith(b"\x89PNG\r\n\x1a\n"):
        raise RuntimeError("Krea result was not a valid PNG under 32 MiB")
    with Image.open(BytesIO(data)) as image:
        image.load()
        if image.format != "PNG" or image.size != (WIDTH, HEIGHT):
            raise RuntimeError(
                f"Krea result was {image.format} {image.size}; "
                f"expected PNG {(WIDTH, HEIGHT)}"
            )


def validate_png(path: Path) -> None:
    if not path.is_file():
        raise RuntimeError(f"missing Krea study: {path.name}")
    validate_png_bytes(path.read_bytes())


def write_bytes_atomic(path: Path, data: bytes) -> None:
    descriptor, temporary_name = tempfile.mkstemp(
        dir=path.parent,
        prefix=f".{path.name}.",
        suffix=".tmp",
    )
    os.close(descriptor)
    temporary = Path(temporary_name)
    try:
        temporary.write_bytes(data)
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def write_json(path: Path, payload: object) -> None:
    write_bytes_atomic(
        path,
        (json.dumps(payload, indent=2, ensure_ascii=False) + "\n").encode(),
    )


def file_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def create_contact_sheet(paths: list[Path]) -> None:
    sheet = Image.new("RGB", (WIDTH, HEIGHT), "#f7f1e3")
    for index, path in enumerate(paths):
        with Image.open(path) as image:
            tile = ImageOps.fit(
                image.convert("RGB"),
                (WIDTH // 2, HEIGHT // 2),
                method=Image.Resampling.LANCZOS,
            )
        sheet.paste(tile, ((index % 2) * WIDTH // 2, (index // 2) * HEIGHT // 2))
    descriptor, temporary_name = tempfile.mkstemp(
        dir=OUT,
        prefix=".concept-contact.",
        suffix=".tmp",
    )
    os.close(descriptor)
    temporary = Path(temporary_name)
    try:
        sheet.save(temporary, "WEBP", quality=90, method=6)
        temporary.replace(OUT / "concept-contact.webp")
    finally:
        temporary.unlink(missing_ok=True)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--qwen-url")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--force", action="store_true")
    parser.add_argument(
        "--study",
        choices=[study_id for study_id, _ in STUDIES],
        help="regenerate or validate only one study, then rebuild the contact sheet",
    )
    args = parser.parse_args()

    endpoint = api_url(args.qwen_url)
    if not endpoint:
        parser.error(
            "LAN endpoint is required via --qwen-url, QLOBE_QWEN_URL, "
            "or tools/state/local.json"
        )

    OUT.mkdir(parents=True, exist_ok=True)
    paths: list[Path] = []
    for study_id, request in STUDIES:
        prompt = COMMON + request
        source = OUT / f"{study_id}.png"
        recipe = OUT / f"{study_id}.recipe.json"
        selected = args.study is None or args.study == study_id
        if selected and (args.force or not source.is_file()):
            print(f"generating {study_id} with Krea 2 seed {args.seed}", flush=True)
            image_bytes = post_multipart(
                f"{endpoint}/workflows/{WORKFLOW}?sync=true",
                {
                    "prompt": prompt,
                    "seed": args.seed,
                    "width": WIDTH,
                    "height": HEIGHT,
                },
            )
            validate_png_bytes(image_bytes)
            write_bytes_atomic(source, image_bytes)
        elif selected:
            print(f"reusing {source.relative_to(ROOT)}", flush=True)
        validate_png(source)
        if selected:
            candidate = str(source.relative_to(ROOT))
            write_json(
                recipe,
                {
                    "format": "qlobe-recipe",
                    "formatVersion": 1,
                    "id": f"throwing-target-garden-concept-{study_id}",
                    "kind": "image",
                    "workflow": WORKFLOW,
                    "prompt": prompt,
                    "seed": args.seed,
                    "width": WIDTH,
                    "height": HEIGHT,
                    "candidate": candidate,
                    "candidateSha256": file_sha256(source),
                    "status": "candidate",
                    "license": "CC-BY-4.0",
                    "created": datetime.date.today().isoformat(),
                },
            )
        paths.append(source)

    create_contact_sheet(paths)
    print(f"concept studies ready: {OUT.relative_to(ROOT)}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
