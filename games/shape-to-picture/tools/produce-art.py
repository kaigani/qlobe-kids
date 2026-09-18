#!/usr/bin/env python3
"""Produce Shape Surprise Studio's LAN-assisted art and deterministic finals.

Authoring only. Runtime never calls a model service. The script reads the
ignored ``tools/state/local.json`` (or ``QLOBE_QWEN_URL``), keeps every source
and receipt, and is intentionally resumable.
"""

from __future__ import annotations

import argparse
from collections import deque
import datetime as dt
import hashlib
import json
import os
import subprocess
import sys
import time
import urllib.request
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageOps


GAME = Path(__file__).resolve().parents[1]
ROOT = GAME.parents[1]
GPT = GAME / "assets" / "source" / "gpt-image-2"
LOCAL = GAME / "assets" / "source" / "local-api"
QA = GAME / "assets" / "source" / "qa"

SHAPE_NAMES = [
    "circle-blue", "triangle-yellow", "square-green", "rectangle-coral", "oval-mint",
    "scallop-gold", "triangle-yellow-right", "triangle-coral-right", "trapezoid-blue",
    "circle-cream", "triangle-cone", "circle-pink", "square-orange", "rectangle-blue",
    "square-cream",
]
REVEAL_NAMES = ["kitten", "house", "rocket", "sun", "balloon", "tree"]
UI_NAMES = ["banner", "build-mat", "tray"]

LAYER_JOBS = {
    "shape-pieces-sheet": {
        "source": GPT / "shape-pieces-sheet.png",
        "prompt": (
            "Background layer: only the flat dark charcoal background. Top layer: all fifteen "
            "complete papercraft shape tokens together on true transparency, preserving their exact "
            "positions, scale, colors, paper texture, edges, compact shadows, and 5 by 3 spacing. "
            "Do not crop, redraw, move, merge, add, remove, relight, or restyle anything."
        ),
    },
    "reveal-sheet": {
        "source": GPT / "reveal-sheet.png",
        "prompt": (
            "Background layer: only the flat dark charcoal background. Top layer: all six complete "
            "papercraft reveal characters together on true transparency, preserving the kitten wreath, "
            "house, rocket, sun, balloon, and tree exactly as shown, including all details, positions, "
            "scale, paper texture, edges, and compact shadows. Do not crop, redraw, rearrange, add, "
            "remove, relight, or restyle anything."
        ),
    },
    "ui-furniture-sheet": {
        "source": GPT / "ui-furniture-sheet.png",
        "prompt": (
            "Background layer: only the flat dark charcoal background. Top layer: the complete blank "
            "torn paper banner, blank square assembly mat, and blank three-pocket vertical tray together "
            "on true transparency. Preserve their exact positions, size, cream paper fibers, deckled "
            "edges, navy backing, recessed pockets, and compact shadows. Keep every surface blank. "
            "Do not crop, redraw, move, add symbols, add text, or restyle anything."
        ),
    },
    "title-lockup": {
        "source": GPT / "title-lockup.png",
        "prompt": (
            "Background layer: only the dark charcoal background and ambient halo. Top layer: the exact "
            "complete two-line papercraft title lockup reading SHAPE SURPRISE STUDIO, including the cream "
            "backing, navy edge, star and two tiny geometric ornaments, on true transparency. Preserve "
            "every letter exactly and keep the entire lockup together. Do not crop, redraw, respell, "
            "rearrange, add, remove, relight, or restyle anything."
        ),
    },
}

PLATE_PROMPTS = {
    "boat": (
        "Edit this exact 4:3 papercraft garden backdrop into a joyful finished-picture scene. Preserve "
        "the camera, sky-blue paper, paper fibers, side foliage, flower palette, upper-left light, and "
        "down-right shadows. Add layered cobalt and sky-blue cut-paper waves across the lower third. "
        "Center one large sailboat made unmistakably from a cobalt trapezoid hull, one yellow right "
        "triangle sail, one coral right triangle sail, a thin kraft-paper mast, and a tiny coral flag. "
        "Add one warm yellow paper sun and two small cream clouds. No words, UI, people, logos, or extra boats."
    ),
    "icecream": (
        "Edit this exact 4:3 papercraft garden backdrop into a joyful finished-picture scene. Preserve "
        "the camera, sky-blue paper, paper fibers, side foliage, flower palette, upper-left light, and "
        "down-right shadows. Center one very large ice-cream picture built visibly from a tall tan paper "
        "triangle cone with subtle waffle crosshatch plus three overlapping circular paper scoops in "
        "pink-coral, mint, and sky blue. Add a tiny paper picnic cloth and a few attached paper sprinkles "
        "around the cone, leaving the corners calm. No words, UI, people, logos, or extra ice creams."
    ),
    "home": (
        "Edit this exact 4:3 papercraft garden backdrop into a joyful finished-picture scene. Preserve "
        "the camera, sky-blue paper, paper fibers, side foliage, flower palette, upper-left light, and "
        "down-right shadows. Center one cozy little house built visibly from a golden-orange square wall, "
        "a coral-red triangle roof, a tall cobalt rounded-rectangle door, and one small cream square "
        "window. Add a short paper path and two tiny flower clusters attached near the house. No words, "
        "UI, people, logos, or extra houses."
    ),
    "robot": (
        "Edit this exact 4:3 papercraft garden backdrop into a joyful finished-picture scene. Preserve "
        "the camera, sky-blue paper, paper fibers, side foliage, flower palette, upper-left light, and "
        "down-right shadows. Center one friendly silly robot face built visibly from a large leaf-green "
        "square head, two sky-blue circle eyes, a coral-red horizontal rectangle smile, and two tiny "
        "cream square ear tabs. Add a small paper antenna and a few attached paper gear flowers at the "
        "base. Friendly, not metallic or scary. No words, UI, people, logos, or extra robots."
    ),
}

HUB_PROMPT = (
    "A miniature preschool papercraft play moment: separate colorful paper circle, triangle, square, "
    "rectangle, and trapezoid pieces visibly snapping together into one cheerful sailboat on a warm cream "
    "paper assembly mat, with a tiny finished paper kitten badge and smiling paper sun nearby. Distinct "
    "construction-paper fibers and scissor-cut edges, tactile stacked layers, bright blue and green airy "
    "setting, generous crop-safe margin, instantly reads as shapes becoming pictures. Bright soft 3D "
    "cartoon staging with rounded cheerful proportions, smooth readable lighting, premium preschool "
    "learning app catalog object composition. No title, no text, no letters, no numbers, no UI, no hands, "
    "no screen, no logo, no watermark."
)


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def api_base() -> str:
    value = os.getenv("QLOBE_QWEN_URL", "").strip()
    if value:
        return value.rstrip("/")
    try:
        config = json.loads((ROOT / "tools" / "state" / "local.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise SystemExit(f"Local API configuration unavailable: {exc}") from exc
    value = str(config.get("qwenUrl", "")).strip()
    if not value:
        raise SystemExit("tools/state/local.json has no qwenUrl")
    return value.rstrip("/")


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    tmp.replace(path)


def post_multipart(url: str, fields: dict[str, object], image: Path | None = None) -> bytes:
    boundary = "----qlobe-shape-surprise"
    body = bytearray()
    for name, value in fields.items():
        body += f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode()
    if image is not None:
        body += (
            f'--{boundary}\r\nContent-Disposition: form-data; name="image"; '
            f'filename="{image.name}"\r\nContent-Type: image/png\r\n\r\n'
        ).encode()
        body += image.read_bytes() + b"\r\n"
    body += f"--{boundary}--\r\n".encode()
    request = urllib.request.Request(
        url, data=bytes(body), headers={"Content-Type": f"multipart/form-data; boundary={boundary}"}
    )
    with urllib.request.urlopen(request, timeout=1800) as response:
        return response.read()


def get(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=1800) as response:
        return response.read()


def run_layered(seed: int, force: bool) -> None:
    base = api_base()
    out_dir = LOCAL / "layered"
    out_dir.mkdir(parents=True, exist_ok=True)
    for job_id, job in LAYER_JOBS.items():
        output = out_dir / f"{job_id}-layer2.png"
        recipe = out_dir / f"{job_id}.recipe.json"
        if output.exists() and recipe.exists() and not force:
            print(f"layered cached: {job_id}", flush=True)
            continue
        source = job["source"]
        submitted = json.loads(post_multipart(
            f"{base}/workflows/qwen-image-layered",
            {"prompt": job["prompt"], "layers": 2, "seed": seed},
            source,
        ))
        remote_id = submitted.get("job_id") or submitted.get("id")
        if not remote_id:
            raise SystemExit(f"Qwen Layered returned no job id for {job_id}: {submitted}")
        deadline = time.time() + 1800
        while time.time() < deadline:
            time.sleep(4)
            status = json.loads(get(f"{base}/jobs/{remote_id}"))
            state = status.get("status")
            if state in {"completed", "complete", "success", "succeeded"}:
                data = get(f"{base}/jobs/{remote_id}/result?output=layer_2")
                if not data.startswith(b"\x89PNG\r\n\x1a\n"):
                    raise SystemExit(f"Qwen layer_2 for {job_id} was not PNG")
                output.write_bytes(data)
                break
            if state in {"failed", "error", "cancelled", "canceled"}:
                raise SystemExit(status.get("error") or f"Qwen Layered {job_id} {state}")
        else:
            raise SystemExit(f"Qwen Layered {job_id} timed out")
        write_json(recipe, {
            "format": "qlobe-recipe", "formatVersion": 1, "id": job_id,
            "kind": "image", "asset": output.name, "artDirection": "Papercraft",
            "steps": [{"workflow": "qwen-image-layered", "prompt": job["prompt"],
                       "seed": seed, "layers": 2, "output": "layer_2"}],
            "source": str(source.relative_to(ROOT)), "sourceSha256": sha256(source),
            "outputSha256": sha256(output), "qa": {"status": "pending-finalize"},
            "createdAt": now(),
        })
        print(f"layered wrote: {output.relative_to(ROOT)}", flush=True)


def run_plates(seed: int, force: bool) -> None:
    base = api_base()
    source = GPT / "world-backdrop-master.png"
    out_dir = LOCAL / "qwen-edit"
    out_dir.mkdir(parents=True, exist_ok=True)
    for plate_id, prompt in PLATE_PROMPTS.items():
        output = out_dir / f"{plate_id}-seed{seed}.png"
        recipe = out_dir / f"{plate_id}-seed{seed}.recipe.json"
        if output.exists() and recipe.exists() and not force:
            print(f"plate cached: {plate_id}", flush=True)
            continue
        data = post_multipart(
            f"{base}/workflows/qwen-image-edit?sync=true",
            {"prompt": prompt, "seed": seed}, source,
        )
        if not data.startswith(b"\x89PNG\r\n\x1a\n"):
            raise SystemExit(f"Qwen edit for {plate_id} was not PNG")
        output.write_bytes(data)
        with Image.open(BytesIO(data)) as image:
            size = list(image.size)
        write_json(recipe, {
            "format": "qlobe-recipe", "formatVersion": 1, "id": f"reveal-{plate_id}",
            "kind": "image", "asset": output.name, "artDirection": "Papercraft",
            "steps": [{"workflow": "qwen-image-edit", "prompt": prompt, "seed": seed}],
            "source": str(source.relative_to(ROOT)), "sourceSha256": sha256(source),
            "sourceSize": size, "outputSha256": sha256(output),
            "qa": {"status": "pending-human-review"}, "createdAt": now(),
        })
        print(f"plate wrote: {output.relative_to(ROOT)}", flush=True)


def run_hub(seed: int, force: bool) -> None:
    base = api_base()
    out_dir = LOCAL / "hub"
    out_dir.mkdir(parents=True, exist_ok=True)
    raw = out_dir / f"hub-seed{seed}.png"
    recipe = out_dir / f"hub-seed{seed}.recipe.json"
    if raw.exists() and recipe.exists() and not force:
        print(f"hub cached: {raw.relative_to(ROOT)}")
        return
    data = post_multipart(
        f"{base}/workflows/krea2-turbo-t2i?sync=true",
        {"prompt": HUB_PROMPT, "seed": seed, "width": 768, "height": 640, "steps": 8, "cfg": 1},
    )
    if not data.startswith(b"\x89PNG\r\n\x1a\n"):
        raise SystemExit("Krea hub response was not PNG")
    raw.write_bytes(data)
    with Image.open(BytesIO(data)) as image:
        if image.size != (768, 640):
            raise SystemExit(f"Unexpected Krea hub size {image.size}")
    write_json(recipe, {
        "format": "qlobe-recipe", "formatVersion": 1, "id": f"shape-to-picture-hub-{seed}",
        "kind": "image", "asset": "shape-to-picture.jpg", "artDirection": "Toy menu grammar",
        "template": {"id": "menu-game-tile", "style": "toy-table",
                     "fields": {"subject": "papercraft shapes becoming a sailboat"}},
        "steps": [{"workflow": "krea2-turbo-t2i", "prompt": HUB_PROMPT, "seed": seed,
                   "width": 768, "height": 640, "steps": 8, "cfg": 1}],
        "source": str(raw.relative_to(ROOT)), "sourceSha256": sha256(raw),
        "qa": {"status": "pending-human-review", "finalSize": [640, 533]},
        "createdAt": now(),
    })
    print(f"hub wrote: {raw.relative_to(ROOT)}")


def run_command(args: list[str]) -> str:
    completed = subprocess.run(args, cwd=ROOT, text=True, capture_output=True, check=False)
    if completed.returncode:
        raise SystemExit(f"Command failed ({completed.returncode}): {' '.join(args)}\n{completed.stdout}\n{completed.stderr}")
    return completed.stdout.strip()


def cut_sheet(sheet: Path, out_dir: Path, names: list[str], min_area: int, close_radius: int) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    command = [
        sys.executable, str(ROOT / "tools" / "cut-asset-sheet.py"), str(sheet), str(out_dir),
        "--names", *names, "--expected-count", str(len(names)), "--padding", "18",
        "--min-area", str(min_area), "--background-color", "#20252b",
        "--distance-threshold", "42", "--chroma-threshold", "18",
        "--alpha-threshold", "8", "--close-radius", str(close_radius),
        "--order", "reading", "--debug-mask", str(QA / f"{sheet.stem}-mask.png"), "--force",
    ]
    run_command(command)


def chroma_helper() -> Path:
    helper = Path.home() / ".codex" / "skills" / ".system" / "imagegen" / "scripts" / "remove_chroma_key.py"
    if not helper.is_file():
        raise SystemExit(f"Imagegen chroma helper unavailable: {helper}")
    return helper


def repair_small_alpha_holes(source: Path, keyed: Path, max_area: int = 3000) -> int:
    """Restore enclosed dark details while keeping large intentional holes.

    The charcoal key is close to pupils and smiles. The keyer correctly clears
    all background, including closed paper wreath centres, then this pass fills
    only bounded transparent or semi-transparent islands which cannot reach the
    crop edge. Including the soft-matte fringe is important: otherwise pupils,
    smiles, and paper crosshatch keep a peppering of see-through pixels. RGB
    comes back verbatim from the accepted GPT Image 2 crop.
    """
    original = Image.open(source).convert("RGBA")
    image = Image.open(keyed).convert("RGBA")
    if image.size != original.size:
        raise SystemExit(f"Chroma helper changed dimensions for {source.name}")
    width, height = image.size
    alpha = image.getchannel("A")
    alpha_px = alpha.load()
    seen = bytearray(width * height)
    components: list[list[tuple[int, int]]] = []

    for y in range(height):
        for x in range(width):
            idx = y * width + x
            if seen[idx] or alpha_px[x, y] > 244:
                continue
            seen[idx] = 1
            queue: deque[tuple[int, int]] = deque([(x, y)])
            component: list[tuple[int, int]] = []
            touches_edge = False
            while queue:
                px, py = queue.popleft()
                component.append((px, py))
                touches_edge = touches_edge or px == 0 or py == 0 or px == width - 1 or py == height - 1
                for nx, ny in ((px - 1, py), (px + 1, py), (px, py - 1), (px, py + 1)):
                    if nx < 0 or ny < 0 or nx >= width or ny >= height:
                        continue
                    nidx = ny * width + nx
                    if not seen[nidx] and alpha_px[nx, ny] <= 244:
                        seen[nidx] = 1
                        queue.append((nx, ny))
            if not touches_edge and len(component) <= max_area:
                components.append(component)

    out = image.load()
    src = original.load()
    for component in components:
        for x, y in component:
            red, green, blue, _ = src[x, y]
            out[x, y] = (red, green, blue, 255)
    image.save(keyed, "PNG", optimize=True)
    return sum(len(component) for component in components)


def extract_chroma(source: Path, destination: Path, *, repair_holes: bool = True) -> dict:
    destination.parent.mkdir(parents=True, exist_ok=True)
    run_command([
        sys.executable, str(chroma_helper()), "--input", str(source), "--out", str(destination),
        "--auto-key", "corners", "--soft-matte", "--transparent-threshold", "16",
        "--opaque-threshold", "62", "--spill-cleanup", "--force",
    ])
    repaired = repair_small_alpha_holes(source, destination) if repair_holes else 0
    return {"method": "imagegen-remove-chroma-key", "smallHolePixelsRestored": repaired}


def webp_from_png(source: Path, target: Path, max_side: int, quality: int = 90) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(source) as image:
        image = image.convert("RGBA")
        if max(image.size) > max_side:
            image.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
        image.save(target, "WEBP", quality=quality, method=6, exact=True)


def finalize_cutout(source: Path, final_png: Path, runtime: Path, magenta: Path, max_size: int) -> dict:
    final_png.parent.mkdir(parents=True, exist_ok=True)
    magenta.parent.mkdir(parents=True, exist_ok=True)
    raw = run_command([
        sys.executable, str(ROOT / "tools" / "pipeline" / "cutout_finalize.py"),
        "--input", str(source), "--output", str(final_png), "--magenta", str(magenta),
        "--max-size", str(max_size), "--pad", "12", "--alpha-floor", "4",
    ])
    report = json.loads(raw)
    if not report.get("pass"):
        raise SystemExit(f"Cutout QA failed for {source.name}: {report}")
    webp_from_png(final_png, runtime, max_size)
    report.update({"source": str(source.relative_to(ROOT)), "runtime": str(runtime.relative_to(ROOT)),
                   "runtimeBytes": runtime.stat().st_size})
    return report


def save_budget_webp(source: Path, target: Path, size: tuple[int, int], budget: int) -> dict:
    target.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(source) as opened:
        image = ImageOps.fit(opened.convert("RGB"), size, method=Image.Resampling.LANCZOS)
        chosen = None
        for quality in range(90, 57, -4):
            image.save(target, "WEBP", quality=quality, method=6)
            chosen = quality
            if target.stat().st_size <= budget:
                break
    return {"source": str(source.relative_to(ROOT)), "runtime": str(target.relative_to(ROOT)),
            "size": list(size), "quality": chosen, "bytes": target.stat().st_size,
            "budget": budget, "pass": target.stat().st_size <= budget}


def run_finalize(seed: int) -> None:
    cuts = LOCAL / "cuts"
    keyed = LOCAL / "keyed"
    finalized = LOCAL / "finalized"
    cut_sheet(GPT / "shape-pieces-sheet.png", cuts / "shapes", SHAPE_NAMES, 6500, 3)
    cut_sheet(GPT / "reveal-sheet.png", cuts / "reveals", REVEAL_NAMES, 20000, 4)
    cut_sheet(GPT / "ui-furniture-sheet.png", cuts / "ui", UI_NAMES, 25000, 4)

    reports: dict[str, object] = {
        "cutouts": {}, "plates": {},
        "layeredAttempts": {
            "status": "rejected",
            "reason": "layer_2 outputs were opaque composites; reveal layer contained no subjects",
            "retainedAt": str((LOCAL / "layered").relative_to(ROOT)),
        },
    }
    for name in SHAPE_NAMES:
        source = cuts / "shapes" / f"{name}.png"
        matte = keyed / "shapes" / f"{name}.png"
        extraction = extract_chroma(source, matte)
        report = finalize_cutout(
            matte, finalized / "shapes" / f"{name}.png",
            GAME / "assets" / "sprites" / f"{name}.webp", QA / "magenta" / f"shape-{name}.png", 420,
        )
        report.update(extraction)
        reports["cutouts"][f"shape:{name}"] = report
    for name in REVEAL_NAMES:
        source = cuts / "reveals" / f"{name}.png"
        matte = keyed / "reveals" / f"{name}.png"
        extraction = extract_chroma(source, matte)
        report = finalize_cutout(
            matte, finalized / "reveals" / f"{name}.png",
            GAME / "assets" / "reveals" / f"{name}.webp", QA / "magenta" / f"reveal-{name}.png", 720,
        )
        report.update(extraction)
        reports["cutouts"][f"reveal:{name}"] = report
    for name in UI_NAMES:
        source = cuts / "ui" / f"{name}.png"
        matte = keyed / "ui" / f"{name}.png"
        extraction = extract_chroma(source, matte)
        report = finalize_cutout(
            matte, finalized / "ui" / f"{name}.png",
            GAME / "assets" / "ui" / f"{name}.webp", QA / "magenta" / f"ui-{name}.png",
            1000 if name != "tray" else 800,
        )
        report.update(extraction)
        reports["cutouts"][f"ui:{name}"] = report
    title_source = LOCAL / "layered" / "title-lockup-layer2.png"
    title_matte = keyed / "ui" / "title.png"
    title_extraction = extract_chroma(title_source, title_matte, repair_holes=False)
    title_report = finalize_cutout(
        title_matte, finalized / "ui" / "title.png",
        GAME / "assets" / "ui" / "title.webp", QA / "magenta" / "ui-title.png", 1100,
    )
    title_report.update(title_extraction)
    reports["cutouts"]["ui:title"] = title_report

    reports["background"] = save_budget_webp(
        GPT / "world-backdrop-master.png", GAME / "assets" / "backgrounds" / "paper-garden.webp",
        (1600, 1200), 300_000,
    )
    for plate_id in PLATE_PROMPTS:
        source = LOCAL / "qwen-edit" / f"{plate_id}-seed{seed}.png"
        reports["plates"][plate_id] = save_budget_webp(
            source, GAME / "assets" / "backgrounds" / f"reveal-{plate_id}.webp",
            (1600, 1200), 300_000,
        )
    hub_source = LOCAL / "hub" / f"hub-seed{seed}.png"
    hub_final = ROOT / "assets" / "hub" / "tiles" / "shape-to-picture.jpg"
    hub_final.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(hub_source) as image:
        ImageOps.fit(image.convert("RGB"), (640, 533), method=Image.Resampling.LANCZOS).save(
            hub_final, "JPEG", quality=90, optimize=True, progressive=True,
        )
    reports["hub"] = {"source": str(hub_source.relative_to(ROOT)),
                      "runtime": str(hub_final.relative_to(ROOT)), "bytes": hub_final.stat().st_size,
                      "size": [640, 533]}
    write_json(QA / "art-finalize.json", reports)
    print(json.dumps(reports, indent=2))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("stage", choices=["layer", "plates", "hub", "finalize", "all"])
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    if args.stage in {"layer", "all"}:
        run_layered(args.seed, args.force)
    if args.stage in {"plates", "all"}:
        run_plates(args.seed, args.force)
    if args.stage in {"hub", "all"}:
        run_hub(args.seed, args.force)
    if args.stage in {"finalize", "all"}:
        run_finalize(args.seed)


if __name__ == "__main__":
    main()
