#!/usr/bin/env python3
"""Finalize Nature Scavenger Hunt's generated Claymation asset family.

The nondeterministic GPT Image 2 masters live under assets/source/gpt-image-2.
This script performs the deterministic/replayable tail:

1. verify or cut the contact sheets with tools/cut-asset-sheet.py;
2. remove the dark ground from opaque UI crops with qwen-image-layered;
3. alpha-trim, pad, normalize, and write magenta QA composites;
4. encode compact runtime WebP files and the opaque forest plate.

The LAN host comes from QLOBE_QWEN_URL or git-ignored tools/state/local.json.
No host, credential, or personal path is written to committed output.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image


GAME = Path(__file__).resolve().parents[1]
REPO = GAME.parents[1]
ASSETS = GAME / "assets"
SOURCE = ASSETS / "source"
MASTERS = SOURCE / "gpt-image-2"
CROPS = SOURCE / "crops"
LAYERED = SOURCE / "layered"
KEYED = SOURCE / "keyed"
FINALIZED = SOURCE / "finalized"
QA = SOURCE / "qa"

SEED = 42

TREASURES = [
    "leaf", "stone", "berries", "dewdrop", "flower", "pinecone",
    "feather", "twig", "acorn", "mushroom", "shell", "seed",
]

UI_COMPONENTS = [
    "clipboard", "mission-plaque", "action-button", "halo-ray-top",
    "halo-ray-upper-left", "halo-ray-upper-right", "quest-card", "check-badge",
    "halo-ray-left", "halo-ring", "halo-ray-right", "halo-ray-lower-left",
    "halo-ray-lower-right", "halo-ray-bottom",
]

UI_FINALS = {
    "clipboard": 820,
    "mission-plaque": 760,
    "action-button": 680,
    "quest-card": 640,
    "check-badge": 280,
    "found-halo": 500,
}

ITEM_SIZES = {name: 420 for name in TREASURES}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def local_api() -> str:
    value = os.environ.get("QLOBE_QWEN_URL", "").strip()
    if value:
        return value.rstrip("/")
    config_path = REPO / "tools" / "state" / "local.json"
    try:
        data = json.loads(config_path.read_text("utf-8"))
        value = str(data.get("qwenUrl", "")).strip()
    except (OSError, ValueError, TypeError):
        value = ""
    if not value:
        raise SystemExit("Set QLOBE_QWEN_URL or tools/state/local.json qwenUrl")
    return value.rstrip("/")


def post_multipart(url: str, fields: dict[str, object], files: dict[str, Path]) -> bytes:
    boundary = "----qlobenature" + os.urandom(8).hex()
    body = bytearray()
    for name, value in fields.items():
        body += (
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n"
            f"{value}\r\n"
        ).encode()
    for name, path in files.items():
        body += (
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"; "
            f"filename=\"{path.name}\"\r\nContent-Type: application/octet-stream\r\n\r\n"
        ).encode()
        body += path.read_bytes() + b"\r\n"
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


def valid_image(path: Path, min_bytes: int = 5_000) -> bool:
    if not path.is_file() or path.stat().st_size < min_bytes:
        return False
    try:
        with Image.open(path) as image:
            image.verify()
        return True
    except OSError:
        return False


def run(command: list[str]) -> None:
    subprocess.run(command, cwd=REPO, check=True)


def ensure_crops(force: bool) -> None:
    treasure_boxes = CROPS / "treasures" / "boxes.json"
    if force or not treasure_boxes.is_file():
        run([
            sys.executable, "tools/cut-asset-sheet.py",
            str(MASTERS / "clay-treasure-sheet.png"), str(CROPS / "treasures"),
            "--names", *TREASURES, "--expected-count", str(len(TREASURES)),
            "--padding", "18", "--min-area", "1500", "--alpha-threshold", "8",
            "--close-radius", "0", "--order", "reading",
            "--debug-mask", str(CROPS / "treasure-mask.png"), "--force",
        ])

    ui_boxes = CROPS / "ui" / "boxes.json"
    if force or not ui_boxes.is_file():
        run([
            sys.executable, "tools/cut-asset-sheet.py",
            str(MASTERS / "clay-ui-sheet.png"), str(CROPS / "ui"),
            "--names", *UI_COMPONENTS, "--expected-count", str(len(UI_COMPONENTS)),
            "--padding", "20", "--min-area", "2500", "--background-color", "#20252b",
            "--distance-threshold", "48", "--chroma-threshold", "18",
            "--close-radius", "0", "--order", "reading",
            "--debug-mask", str(CROPS / "ui-mask.png"), "--force",
        ])

    for name, master, folder in (
        ("hedgehog", MASTERS / "hedgehog-guide-master.png", CROPS / "hedgehog"),
        ("title", MASTERS / "title-lockup-master.png", CROPS / "title"),
    ):
        if force or not (folder / f"{name}.png").is_file():
            run([
                sys.executable, "tools/cut-asset-sheet.py", str(master), str(folder),
                "--names", name, "--expected-count", "1", "--padding", "24",
                "--min-area", "5000", "--alpha-threshold", "8", "--order", "reading",
                "--debug-mask", str(CROPS / f"{name}-mask.png"), "--force",
            ])


def make_halo_source(force: bool) -> Path:
    """Crop the cutter-verified union of the ring and eight detached ray pieces."""
    output = CROPS / "ui" / "found-halo-source.png"
    if output.is_file() and not force:
        return output
    with Image.open(MASTERS / "clay-ui-sheet.png") as image:
        # Union of verified components 4–6 and 9–14 from crops/ui/boxes.json.
        image.crop((1040, 504, 1514, 973)).save(output, "PNG", optimize=True)
    return output


def layered_cutout(api: str, source: Path, output: Path, subject: str, force: bool) -> None:
    if valid_image(output) and not force:
        print(f"layered cached: {output.relative_to(GAME)}", flush=True)
        return
    output.parent.mkdir(parents=True, exist_ok=True)
    prompt = (
        "Background layer: the flat dark charcoal background and contact shadow only. "
        f"Top layer: the complete {subject} as one faithful subject on a transparent background. "
        "Preserve its exact clay texture, colors, lighting, silhouette, inner holes, and proportions. "
        "Remove only the dark background; do not redraw, restyle, crop, or add anything."
    )
    raw = post_multipart(
        f"{api}/workflows/qwen-image-layered",
        {"prompt": prompt, "layers": 2, "seed": SEED},
        {"image": source},
    )
    job = json.loads(raw)
    job_id = job.get("job_id")
    if not job_id:
        raise RuntimeError(f"Layered workflow returned no job id for {source.name}: {job}")
    for _ in range(180):
        time.sleep(5)
        state = json.loads(get(f"{api}/jobs/{job_id}"))
        status = state.get("status")
        if status == "completed":
            data = get(f"{api}/jobs/{job_id}/result?output=layer_2")
            if not data.startswith(b"\x89PNG\r\n\x1a\n"):
                raise RuntimeError(f"Layered result was not PNG for {source.name}")
            output.write_bytes(data)
            print(f"layered wrote: {output.relative_to(GAME)}", flush=True)
            return
        if status in {"failed", "error"}:
            raise RuntimeError(f"Layered job failed for {source.name}: {state.get('error')}")
    raise TimeoutError(f"Layered job timed out for {source.name}")


def chroma_key(source: Path, output: Path, force: bool) -> None:
    """Deterministic fallback when the approved Layered service is unavailable."""
    if valid_image(output) and not force:
        print(f"keyed cached: {output.relative_to(GAME)}", flush=True)
        return
    output.parent.mkdir(parents=True, exist_ok=True)
    helper = Path.home() / ".codex" / "skills" / ".system" / "imagegen" / "scripts" / "remove_chroma_key.py"
    if not helper.is_file():
        raise SystemExit(f"Missing imagegen chroma helper: {helper}")
    key_input = source
    with Image.open(source) as image:
        if image.mode == "RGBA":
            key_input = KEYED / f"{source.stem}-rgb.png"
            image.convert("RGB").save(key_input, "PNG", optimize=True)
    run([
        sys.executable, str(helper), "--input", str(key_input), "--out", str(output),
        "--key-color", "#20252b", "--soft-matte",
        "--transparent-threshold", "18", "--opaque-threshold", "72",
        "--edge-contract", "1", "--edge-feather", "0.6", "--despill", "--force",
    ])


def finalize_cutout(source: Path, runtime: Path, max_size: int, force: bool) -> dict:
    with Image.open(source) as probe:
        if probe.mode == "RGBA":
            alpha_channel = probe.getchannel("A")
            alpha_max = alpha_channel.getextrema()[1]
            alpha_values = list(alpha_channel.getdata())
            opaque_ratio = sum(value == 255 for value in alpha_values) / max(1, len(alpha_values))
            if 0 < alpha_max < 255 or opaque_ratio < 0.01:
                normalized = FINALIZED / f"{runtime.stem}-alpha-normalized.png"
                image = probe.convert("RGBA")
                high = min(240, alpha_max)
                low = 8
                alpha = image.getchannel("A").point(lambda value: (
                    0 if value <= low else
                    255 if value >= high else
                    round((value - low) * 255 / max(1, high - low))
                ))
                image.putalpha(alpha)
                image.save(normalized, "PNG", optimize=True)
                source = normalized
    final_png = FINALIZED / runtime.with_suffix(".png").name
    magenta = QA / f"{runtime.stem}-magenta.jpg"
    if force or not valid_image(final_png):
        run([
            sys.executable, "tools/pipeline/cutout_finalize.py",
            "--input", str(source), "--output", str(final_png),
            "--magenta", str(magenta), "--max-size", str(max_size),
            "--pad", "18", "--alpha-floor", "8",
        ])
    runtime.parent.mkdir(parents=True, exist_ok=True)
    if force or not valid_image(runtime):
        with Image.open(final_png) as image:
            image.convert("RGBA").save(runtime, "WEBP", quality=88, method=6)
    with Image.open(runtime) as image:
        alpha = image.getchannel("A")
        alpha_extrema = list(alpha.getextrema())
        size = list(image.size)
    return {
        "file": str(runtime.relative_to(GAME)).replace("\\", "/"),
        "source": str(source.relative_to(GAME)).replace("\\", "/"),
        "size": size,
        "bytes": runtime.stat().st_size,
        "sha256": sha256(runtime),
        "alphaExtrema": alpha_extrema,
        "magentaQa": str(magenta.relative_to(GAME)).replace("\\", "/"),
    }


def finalize_background(force: bool) -> dict:
    output = ASSETS / "backgrounds" / "forest.webp"
    output.parent.mkdir(parents=True, exist_ok=True)
    if force or not valid_image(output):
        with Image.open(MASTERS / "forest-background-master.png") as image:
            image = image.convert("RGB").resize((1440, 1080), Image.Resampling.LANCZOS)
            image.save(output, "WEBP", quality=82, method=6)
    with Image.open(output) as image:
        size = list(image.size)
    return {
        "file": str(output.relative_to(GAME)).replace("\\", "/"),
        "source": str((MASTERS / "forest-background-master.png").relative_to(GAME)).replace("\\", "/"),
        "size": size,
        "bytes": output.stat().st_size,
        "sha256": sha256(output),
    }


def produce(force: bool, skip_layered: bool, use_chroma_key: bool) -> None:
    for folder in (LAYERED, KEYED, FINALIZED, QA):
        folder.mkdir(parents=True, exist_ok=True)
    ensure_crops(force=False)

    ui_sources: dict[str, Path] = {
        name: CROPS / "ui" / f"{name}.png"
        for name in ("clipboard", "mission-plaque", "action-button", "quest-card", "check-badge")
    }
    ui_sources["found-halo"] = make_halo_source(force)

    if use_chroma_key:
        for name, source in ui_sources.items():
            chroma_key(source, KEYED / f"{name}.png", force)
    elif not skip_layered:
        api = local_api()
        subjects = {
            "clipboard": "blank clay clipboard",
            "mission-plaque": "blank cream mission plaque with green rim",
            "action-button": "blank green clay action button plaque",
            "quest-card": "blank cream quest card with brown rim",
            "check-badge": "green circular clay check badge",
            "found-halo": "golden clay halo ring and all eight detached ray pieces",
        }
        for name, source in ui_sources.items():
            layered_cutout(api, source, LAYERED / f"{name}.layer2.png", subjects[name], force)

    receipt: dict[str, object] = {
        "format": "qlobe-asset-production-receipt",
        "formatVersion": 1,
        "game": "nature-scavenger-hunt",
        "artDirection": "Claymation",
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "generation": {
            "masterModel": "gpt-image-2 (Codex built-in image generation)",
            "layerWorkflow": (
                "local charcoal-key selected after qwen-image-layered candidate failed visual QA"
                if use_chroma_key else "qwen-image-layered"
            ),
            "layerSeed": SEED,
            "promptSource": "assets/source/PROMPTS.md",
        },
        "assets": [],
    }
    assets_out: list[dict] = receipt["assets"]  # type: ignore[assignment]
    assets_out.append(finalize_background(force))

    for name, max_size in UI_FINALS.items():
        source = (KEYED / f"{name}.png") if use_chroma_key else (LAYERED / f"{name}.layer2.png")
        if not source.is_file():
            raise SystemExit(f"Missing extracted output {source}; rerun the extraction stage")
        assets_out.append(finalize_cutout(source, ASSETS / "ui" / f"{name}.webp", max_size, force))

    # The GPT title master already carries a useful transparent matte. Running
    # it through the charcoal-key fallback first would discard that alpha and
    # turn its fully transparent RGB-black canvas into a smoky rectangle.
    # finalize_cutout() normalizes the supplied partial alpha safely instead.
    title_source = CROPS / "title" / "title.png"
    assets_out.append(finalize_cutout(
        title_source, ASSETS / "ui" / "title.webp", 1000, force,
    ))
    assets_out.append(finalize_cutout(
        CROPS / "hedgehog" / "hedgehog.png", ASSETS / "guide" / "hedgehog.webp", 760, force,
    ))
    for name, max_size in ITEM_SIZES.items():
        assets_out.append(finalize_cutout(
            CROPS / "treasures" / f"{name}.png", ASSETS / "items" / f"{name}.webp",
            max_size, force,
        ))

    receipt_path = SOURCE / "production-receipt.json"
    receipt_path.write_text(json.dumps(receipt, indent=2) + "\n", "utf-8")
    print(f"wrote {receipt_path.relative_to(GAME)}", flush=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true", help="regenerate and re-encode every stage")
    parser.add_argument("--skip-layered", action="store_true", help="reuse existing layered outputs")
    parser.add_argument(
        "--use-chroma-key", action="store_true",
        help="use deterministic charcoal-key extraction after a Layered service failure",
    )
    args = parser.parse_args()
    produce(args.force, args.skip_layered, args.use_chroma_key)


if __name__ == "__main__":
    main()
