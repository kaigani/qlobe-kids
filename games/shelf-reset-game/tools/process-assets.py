#!/usr/bin/env python3
"""Extract and finalize Shelf Reset's coordinated GPT Image 2 asset sheets.

The source masters are immutable.  Qwen Image Edit first replaces the dark
studio sweep with a flat key colour while preserving every disconnected asset.
The imagegen skill's chroma helper makes the alpha matte, the repository asset
sheet cutter detects/logs individual sprites, and the shared cutout finalizer
produces alpha QA plates before compact runtime WebP files are written.

An earlier whole-sheet Qwen Image Layered trial is retained under
``assets/source/local-api/layers-rejected`` for provenance: that workflow
silently omitted disconnected sprites and therefore failed the cutter's exact
count gate.  Nothing from that rejected pass ships at runtime.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

from PIL import Image, ImageOps


GAME = Path(__file__).resolve().parents[1]
ROOT = GAME.parents[1]
SOURCE = GAME / "assets" / "source"
GPT = SOURCE / "gpt-image-2"
LOCAL = SOURCE / "local-api"
KEYED = LOCAL / "keyed"
LAYERS = LOCAL / "layers"
CUTS = SOURCE / "cuts"
FINAL = SOURCE / "final"
QA = SOURCE / "qa"

SHEETS = {
    "shelf": (GPT / "shelf-master.png", "one complete empty three-cubby wooden shelf"),
    "ui": (GPT / "ui-helper-sheet-master.png", "all six separate UI and helper assets"),
    "art": (GPT / "art-sheet-master.png", "all nine separate art-shelf assets"),
    "blocks": (GPT / "blocks-sheet-master.png", "all nine separate block-shelf assets"),
    "nature": (GPT / "nature-sheet-master.png", "all nine separate nature-shelf assets"),
    "cards": (GPT / "mode-cards-sheet-master.png", "all three separate wooden shelf-choice cards"),
}

CUT_GROUPS = {
    "ui": [
        "title-plaque", "progress-pill", "tray",
        "helper-neutral", "helper-point", "helper-cheer",
    ],
    "art": [
        "home-brushes", "home-paints", "home-tools",
        "art-brush-blue", "art-brush-red", "art-paint-red",
        "art-paint-blue", "art-palette", "art-crayons",
    ],
    "blocks": [
        "home-arches", "home-cubes", "home-cylinders",
        "block-arch-red", "block-arch-yellow", "block-cube-blue",
        "block-cube-wood", "block-cylinder-green", "block-cylinder-yellow",
    ],
    "nature": [
        "home-leaves", "home-pinecones", "home-treasures",
        "nature-leaf-oak", "nature-leaf-maple", "nature-pinecone-tall",
        "nature-pinecone-round", "nature-stone-gray", "nature-acorn",
    ],
    "cards": ["art", "blocks", "nature"],
}


def configured_url(cli_value: str | None) -> str:
    try:
        state = json.loads((ROOT / "tools" / "state" / "local.json").read_text("utf-8"))
    except Exception:
        state = {}
    return (cli_value or os.getenv("QLOBE_QWEN_URL") or state.get("qwenUrl") or "").rstrip("/")


def post_multipart(url: str, fields: dict[str, str], image: Path) -> bytes:
    boundary = "----qlobe-shelf-reset"
    body = bytearray()
    for key, value in fields.items():
        body += (
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"{key}\"\r\n\r\n"
            f"{value}\r\n"
        ).encode()
    body += (
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"image\"; "
        f"filename=\"{image.name}\"\r\nContent-Type: image/png\r\n\r\n"
    ).encode()
    body += image.read_bytes()
    body += f"\r\n--{boundary}--\r\n".encode()
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


def extraction_prompt(subject: str) -> str:
    return (
        "Layer 1 is only the complete dark studio background. Layer 2 contains "
        f"{subject}, preserving every asset exactly, at its original position and scale, "
        "with true transparency outside the subjects. Preserve identity, wood grain, cloth "
        "fibers, colors, highlights, and every edge. Do not redraw, recolor, combine, move, "
        "crop, omit, add, or create a floor/background. Keep separate sheet assets separate."
    )


def key_prompt(subject: str) -> str:
    return (
        "Change only the dark studio background into one perfectly flat, solid, "
        "even chroma-magenta background (#FF00FF), edge to edge. Preserve "
        f"{subject} exactly: keep every separate asset, its original position, size, "
        "shape, face, wood grain, cloth fibres, colour, highlights, shadows inside "
        "the object, and soft edge detail. Do not add, remove, crop, combine, move, "
        "redraw, relight, recolour, resize, or duplicate any asset. Remove all cast "
        "shadows that belong to the old background. No floor, horizon, vignette, "
        "gradient, texture, border, text, or extra objects."
    )


def key_and_matte(base: str, key: str, source: Path, force: bool) -> None:
    keyed = KEYED / f"{key}-magenta.png"
    matte = LAYERS / f"{key}-layer2.png"
    if force or not keyed.is_file() or keyed.stat().st_size < 5_000:
        print(f"keying {key} with qwen-image-edit", flush=True)
        raw = post_multipart(
            f"{base}/workflows/qwen-image-edit?sync=true",
            {"prompt": key_prompt(SHEETS[key][1]), "seed": "42"},
            source,
        )
        if not raw.startswith(b"\x89PNG"):
            raise RuntimeError(f"Qwen Image Edit did not return PNG for {key}")
        keyed.write_bytes(raw)
    if force or not matte.is_file() or matte.stat().st_size < 5_000:
        subprocess.run(
            [
                sys.executable,
                str(Path.home() / ".codex" / "skills" / ".system" / "imagegen" /
                    "scripts" / "remove_chroma_key.py"),
                "--input", str(keyed),
                "--out", str(matte),
                "--auto-key", "border",
                "--tolerance", "44",
                "--edge-feather", "0.7",
                "--edge-contract", "0",
                "--force",
            ],
            check=True,
        )
    remove_key_shadow(matte)


def remove_key_shadow(path: Path) -> None:
    """Drop dark magenta cast-shadow pixels left by the generative key edit.

    This deliberately narrow hue test preserves red/orange art and the purple
    progress plaque while removing the key-coloured floor shadow seen below a
    few objects.  It only changes alpha; surviving source pixels are untouched.
    """
    with Image.open(path) as source:
        image = source.convert("RGBA")
    pixels = image.load()
    changed = 0
    for y in range(image.height):
        for x in range(image.width):
            red, green, blue, alpha = pixels[x, y]
            if (
                alpha > 0
                and red >= 70
                and blue >= red * 0.45
                and blue <= red * 0.95
                and green <= red * 0.25
            ):
                pixels[x, y] = (0, 0, 0, 0)
                changed += 1
    if changed:
        image.save(path, "PNG")
        print(f"removed {changed} key-shadow pixels from {path.name}", flush=True)


def submit_layer(base: str, key: str, source: Path, force: bool) -> str | None:
    target = LAYERS / f"{key}-layer2.png"
    if target.is_file() and target.stat().st_size > 5_000 and not force:
        return None
    payload = json.loads(
        post_multipart(
            f"{base}/workflows/qwen-image-layered",
            {"prompt": extraction_prompt(SHEETS[key][1]), "layers": "2", "seed": "42"},
            source,
        )
    )
    job_id = payload.get("job_id") or payload.get("id")
    if not job_id:
        raise RuntimeError(f"Qwen did not return a job id for {key}: {payload}")
    print(f"queued {key}: {job_id}", flush=True)
    return str(job_id)


def wait_layers(base: str, pending: dict[str, str]) -> None:
    for attempt in range(600):
        for key, job_id in list(pending.items()):
            state = json.loads(get(f"{base}/jobs/{job_id}"))
            status = state.get("status")
            if status == "completed":
                data = get(f"{base}/jobs/{job_id}/result?output=layer_2")
                if not data.startswith(b"\x89PNG"):
                    raise RuntimeError(f"{key} layer_2 was not PNG")
                (LAYERS / f"{key}-layer2.png").write_bytes(data)
                pending.pop(key)
                print(f"layered {key}", flush=True)
            elif status in {"failed", "error", "cancelled", "canceled"}:
                raise RuntimeError(f"Qwen job failed for {key}: {state}")
        if not pending:
            return
        if attempt % 6 == 0:
            print("waiting: " + ", ".join(sorted(pending)), flush=True)
        time.sleep(4)
    raise TimeoutError("Qwen layered jobs timed out: " + ", ".join(sorted(pending)))


def run_cutter(key: str, names: list[str]) -> None:
    destination = CUTS / key
    destination.mkdir(parents=True, exist_ok=True)
    command = [
        sys.executable,
        str(ROOT / "tools" / "cut-asset-sheet.py"),
        str(LAYERS / f"{key}-layer2.png"),
        str(destination),
        "--names", *names,
        "--expected-count", str(len(names)),
        "--padding", "16",
        "--min-area", "3000",
        "--alpha-threshold", "8",
        "--close-radius", "8" if key == "ui" else "3",
        "--debug-mask", str(QA / f"{key}-cut-mask.png"),
        "--force",
    ]
    subprocess.run(command, check=True)


def finalize_cut(source: Path, destination: Path, maximum: int, qa_name: str) -> dict:
    png = FINAL / f"{qa_name}.png"
    magenta = QA / f"{qa_name}-magenta.png"
    result = subprocess.run(
        [
            sys.executable,
            str(ROOT / "tools" / "pipeline" / "cutout_finalize.py"),
            "--input", str(source),
            "--output", str(png),
            "--magenta", str(magenta),
            "--max-size", str(maximum),
            "--pad", "14",
            "--alpha-floor", "4",
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    report = json.loads(result.stdout)
    destination.parent.mkdir(parents=True, exist_ok=True)
    Image.open(png).convert("RGBA").save(destination, "WEBP", quality=88, method=6, exact=True)
    report["runtime"] = str(destination.relative_to(GAME))
    report["bytes"] = destination.stat().st_size
    return report


def cover(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    fitted = ImageOps.fit(image.convert("RGB"), size, method=Image.Resampling.LANCZOS)
    return fitted


def build_runtime() -> dict[str, dict]:
    records: dict[str, dict] = {}
    art_dir = GAME / "assets" / "art"
    cards_dir = GAME / "assets" / "cards"
    objects_dir = GAME / "assets" / "objects"
    for folder in (art_dir, cards_dir, objects_dir, FINAL, QA):
        folder.mkdir(parents=True, exist_ok=True)

    room = cover(Image.open(GPT / "room-master.png"), (1600, 1200))
    room.save(art_dir / "room.webp", "WEBP", quality=84, method=6)
    records["room"] = {"runtime": "assets/art/room.webp", "size": [1600, 1200]}

    records["shelf-frame"] = finalize_cut(
        LAYERS / "shelf-layer2.png", art_dir / "shelf-frame.webp", 1400, "shelf-frame"
    )

    ui_destinations = {
        "title-plaque": (art_dir / "title-plaque.webp", 900),
        "progress-pill": (art_dir / "progress-pill.webp", 600),
        "tray": (art_dir / "tray.webp", 760),
        "helper-neutral": (art_dir / "helper-neutral.webp", 650),
        "helper-point": (art_dir / "helper-point.webp", 650),
        "helper-cheer": (art_dir / "helper-cheer.webp", 650),
    }
    for name, (destination, maximum) in ui_destinations.items():
        records[name] = finalize_cut(CUTS / "ui" / f"{name}.png", destination, maximum, name)

    for key in ("art", "blocks", "nature"):
        for name in CUT_GROUPS[key]:
            maximum = 360 if name.startswith("home-") else 320
            records[name] = finalize_cut(
                CUTS / key / f"{name}.png", objects_dir / f"{name}.webp", maximum, name
            )

    for name in CUT_GROUPS["cards"]:
        records[f"card-{name}"] = finalize_cut(
            CUTS / "cards" / f"{name}.png", cards_dir / f"{name}.webp", 620, f"card-{name}"
        )
    return records


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--qwen-url")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--skip-key", action="store_true")
    parser.add_argument("--key-only", choices=sorted(SHEETS))
    args = parser.parse_args()
    base = configured_url(args.qwen_url)
    if not base and not args.skip_key:
        parser.error("QLOBE_QWEN_URL/tools/state/local.json qwenUrl is required")

    for folder in (KEYED, LAYERS, CUTS, FINAL, QA):
        folder.mkdir(parents=True, exist_ok=True)

    if args.key_only:
        source = SHEETS[args.key_only][0]
        if not source.is_file():
            raise FileNotFoundError(source)
        key_and_matte(base, args.key_only, source, args.force)
        print(f"KEY DONE {args.key_only}", flush=True)
        return 0

    if not args.skip_key:
        for key, (source, _) in SHEETS.items():
            if not source.is_file():
                raise FileNotFoundError(source)
            key_and_matte(base, key, source, args.force)

    for key, names in CUT_GROUPS.items():
        run_cutter(key, names)
    records = build_runtime()
    (SOURCE / "processing.json").write_text(
        json.dumps(
            {
                "format": "qlobe-shelf-reset-processing",
                "formatVersion": 1,
                "gptModel": "gpt-image-2",
                "extraction": {
                    "workflow": "qwen-image-edit",
                    "seed": 42,
                    "edit": "flat #FF00FF background only",
                    "matte": "imagegen/scripts/remove_chroma_key.py; border sampled, hard tolerance 44",
                    "keyShadowCleanup": "deterministic alpha-only narrow magenta hue rule",
                    "rejectedTrial": "qwen-image-layered omitted disconnected assets",
                },
                "cutter": "tools/cut-asset-sheet.py",
                "assets": records,
            },
            indent=2,
        )
        + "\n",
        "utf-8",
    )
    print(f"ART DONE {len(records)} runtime assets", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
