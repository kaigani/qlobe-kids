#!/usr/bin/env python3
"""Generate Flashlight Cave's plates and flashlight sprite.

Idempotent (skip-existing) generators modelled on
`games/counting-treasure-cups/tools/`. Three assets, each its own stage:

  cave-play     THE highest-risk asset. Two independent recipes (A: from
                scratch with krea2-turbo-t2i; B: qwen-image-edit on the
                concept mockup) x 3 seeds each -> 6 candidates in
                assets/source/cave-play/. Pick the winner by eye, then
                `finalize cave-play` crops/resizes/compresses it into
                assets/cave-play.jpg.
  cave-splash   qwen-image-edit on the title mockup, strips text/UI/armadillo.
  flashlight    krea2-turbo-t2i on a flat charcoal ground, then
                qwen-image-layered (ASYNC job flow) for the cutout.

    export QLOBE_QWEN_URL=http://<host>:<port>
    python3 games/flashlight-cave/tools/gen-art.py gen cave-play
    python3 games/flashlight-cave/tools/gen-art.py gen cave-splash
    python3 games/flashlight-cave/tools/gen-art.py gen flashlight
    python3 games/flashlight-cave/tools/gen-art.py finalize cave-play \
        --source assets/source/cave-play/recipe-a-seed42.png
    python3 games/flashlight-cave/tools/gen-art.py finalize cave-splash \
        --source assets/source/cave-splash/seed42.png
    python3 games/flashlight-cave/tools/gen-art.py finalize flashlight

Every candidate is kept in assets/source/ per CLAUDE.md; only the finalize
step writes into assets/.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.request
from pathlib import Path

from PIL import Image

GAME = Path(__file__).resolve().parents[1]
CONCEPT = GAME.parents[2] / "01-game-concepts" / "flashlight-cave" / "output" / "ui-mockups"
SRC = GAME / "assets" / "source"
OUT = GAME / "assets"

SEEDS = [42, 1337, 9001]

# --- prompts --------------------------------------------------------------

CAVE_PLAY_PROMPT_A = (
    "Polished 2D children's game illustration of the inside of a cosy magical "
    "cave, evenly and warmly lit throughout, rounded stalactites and boulders, "
    "navy-blue rock with warm ochre highlights, clusters of violet and cyan "
    "crystals along the floor at both edges, small green plants, several "
    "rounded alcoves and tunnel openings spread evenly across the back wall "
    "left to right (at least five, clearly separated, not clustered), glossy "
    "depth, crisp navy outlines. Uniform ambient lighting - no spotlight, no "
    "light pool, no beam, no dark vignette. No letters, no text, no "
    "characters, no UI, no watermark. 4:3 landscape."
)

CAVE_PLAY_PROMPT_B = (
    "Remove the glowing letter A and the pool of light. Light the whole cave "
    "evenly and warmly. Remove all UI panels and text."
)

CAVE_SPLASH_PROMPT = (
    "Remove all text and the EXPLORE button and the sound button and the "
    "armadillo. Also remove the glowing letter A in the tunnel and the "
    "flashlight prop lying on the ground. Keep the cave mouth, the crystals, "
    "the warm tunnel glow, the dusk sky, empty and uncluttered so text can "
    "sit over it."
)

FLASHLIGHT_SUBJECT = (
    "yellow toy flashlight, 3/4 view, barrel to the lower-left, lens to the "
    "upper-right, glossy plastic"
)

DARK_GROUND = (
    "The background is a perfectly flat, solid, uniform dark charcoal "
    "background, no gradient, no texture, no shadows on the background."
)

FLASHLIGHT_PROMPT = (
    "A " + FLASHLIGHT_SUBJECT + ", bright yellow body with a dark grey lens "
    "ring and a black switch, toy-like glossy finish with soft highlights, "
    "no beam of light drawn, no glow, no rays. Centred, isolated, product-"
    "shot style, premium preschool learning app asset, no text, no UI. "
    + DARK_GROUND
)

# --- API plumbing (verbatim pattern from counting-treasure-cups) ----------


def api(path: str) -> str:
    base = os.environ.get("QLOBE_QWEN_URL", "").rstrip("/")
    if not base:
        sys.exit("QLOBE_QWEN_URL is not set (see .claude/skills/local-genai)")
    return f"{base}{path}"


def post_multipart(url: str, fields: dict, files: dict | None = None) -> bytes:
    boundary = "----qlobe" + os.urandom(8).hex()
    body = bytearray()
    for name, value in fields.items():
        body += f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n".encode()
    for name, path in (files or {}).items():
        body += (f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"; "
                 f"filename=\"{Path(path).name}\"\r\nContent-Type: application/octet-stream\r\n\r\n").encode()
        body += Path(path).read_bytes() + b"\r\n"
    body += f"--{boundary}--\r\n".encode()
    req = urllib.request.Request(url, data=bytes(body),
                                 headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
    with urllib.request.urlopen(req, timeout=900) as resp:
        return resp.read()


def get(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=900) as resp:
        return resp.read()


def cutout_async(src: Path, dst: Path, subject: str, seed: int = 42, layers: int = 2) -> bool:
    """qwen-image-layered, ASYNC job flow. sync=true would return layer_0 (the
    composite) instead of the cutout, so this polls /jobs/{id} and fetches
    layer_2 (the subject with true alpha)."""
    prompt = (f"Solid flat green background layer. Top layer: the exact same {subject} "
              f"from the image. Keep it identical to the input image.")
    job = json.loads(post_multipart(api("/workflows/qwen-image-layered"),
                                    {"prompt": prompt, "layers": str(layers), "seed": str(seed)},
                                    {"image": str(src)}))
    job_id = job.get("job_id")
    if not job_id:
        print(f"    !! no job id: {job}")
        return False
    for _ in range(120):
        time.sleep(5)
        state = json.loads(get(api(f"/jobs/{job_id}")))
        if state.get("status") == "completed":
            dst.write_bytes(get(api(f"/jobs/{job_id}/result?output=layer_2")))
            return True
        if state.get("status") in ("failed", "error"):
            print(f"    !! job {state.get('status')}: {state.get('error')}")
            return False
    print("    !! job timed out")
    return False


# --- generation stages ------------------------------------------------------


def gen_cave_play(force: bool = False) -> None:
    d = SRC / "cave-play"
    d.mkdir(parents=True, exist_ok=True)
    for seed in SEEDS:
        dst = d / f"recipe-a-seed{seed}.png"
        if dst.exists() and not force:
            print(f"  skip {dst.name}")
            continue
        print(f"  recipe A (krea2-turbo-t2i) seed {seed}")
        dst.write_bytes(post_multipart(
            api("/workflows/krea2-turbo-t2i?sync=true"),
            {"prompt": CAVE_PLAY_PROMPT_A, "width": "1600", "height": "1200", "seed": str(seed)}))
    for seed in SEEDS:
        dst = d / f"recipe-b-seed{seed}.png"
        if dst.exists() and not force:
            print(f"  skip {dst.name}")
            continue
        print(f"  recipe B (qwen-image-edit on mockup 02) seed {seed}")
        dst.write_bytes(post_multipart(
            api("/workflows/qwen-image-edit?sync=true"),
            {"prompt": CAVE_PLAY_PROMPT_B, "seed": str(seed)},
            {"image": str(CONCEPT / "02-find-letter-a.png")}))


def gen_cave_splash(force: bool = False) -> None:
    d = SRC / "cave-splash"
    d.mkdir(parents=True, exist_ok=True)
    for seed in SEEDS:
        dst = d / f"seed{seed}.png"
        if dst.exists() and not force:
            print(f"  skip {dst.name}")
            continue
        print(f"  qwen-image-edit on mockup 01 seed {seed}")
        dst.write_bytes(post_multipart(
            api("/workflows/qwen-image-edit?sync=true"),
            {"prompt": CAVE_SPLASH_PROMPT, "seed": str(seed)},
            {"image": str(CONCEPT / "01-title.png")}))


def gen_flashlight(force: bool = False) -> None:
    d = SRC / "flashlight"
    d.mkdir(parents=True, exist_ok=True)
    for seed in SEEDS:
        raw = d / f"raw-seed{seed}.png"
        if not raw.exists() or force:
            print(f"  raw (krea2-turbo-t2i) seed {seed}")
            raw.write_bytes(post_multipart(
                api("/workflows/krea2-turbo-t2i?sync=true"),
                {"prompt": FLASHLIGHT_PROMPT, "width": "1024", "height": "1024", "seed": str(seed)}))
        cut = d / f"cutout-seed{seed}.png"
        if not cut.exists() or force:
            print(f"  cutout seed {seed}")
            if not cutout_async(raw, cut, FLASHLIGHT_SUBJECT, seed=seed):
                print(f"    !! cutout failed for seed {seed}")


# --- finalize (crop / resize / compress into assets/) -----------------------


def save_jpeg_budget(im: Image.Image, path: Path, budget: int, start_q: int = 92, min_q: int = 40) -> int:
    """Binary-search-ish quality ramp down until under `budget` bytes."""
    q = start_q
    while q >= min_q:
        im.convert("RGB").save(path, "JPEG", quality=q, optimize=True, progressive=True)
        size = path.stat().st_size
        if size <= budget:
            return size
        q -= 6
    return path.stat().st_size


def cover_fit(im: Image.Image, w: int, h: int) -> Image.Image:
    """Resize+centre-crop to exactly w x h, cover-fit (no letterboxing)."""
    src_w, src_h = im.size
    scale = max(w / src_w, h / src_h)
    new_w, new_h = round(src_w * scale), round(src_h * scale)
    im = im.resize((new_w, new_h), Image.LANCZOS)
    left = (new_w - w) // 2
    top = (new_h - h) // 2
    return im.crop((left, top, left + w, top + h))


def finalize_cave_play(source: Path) -> None:
    im = Image.open(source).convert("RGB")
    im = cover_fit(im, 1600, 1200)
    dst = OUT / "cave-play.jpg"
    size = save_jpeg_budget(im, dst, budget=300 * 1024)
    print(f"  wrote {dst} {im.size[0]}x{im.size[1]} {size/1024:.1f} KB (source: {source.name})")


def finalize_cave_splash(source: Path) -> None:
    im = Image.open(source).convert("RGB")
    im = cover_fit(im, 1600, 1200)
    dst = OUT / "cave-splash.jpg"
    size = save_jpeg_budget(im, dst, budget=300 * 1024)
    print(f"  wrote {dst} {im.size[0]}x{im.size[1]} {size/1024:.1f} KB (source: {source.name})")


def finalize_flashlight(source: Path, pad: int = 14, max_dim: int = 420) -> None:
    im = Image.open(source).convert("RGBA")
    alpha = im.getchannel("A").point(lambda v: 0 if v <= 8 else v)
    im.putalpha(alpha)
    box = im.getchannel("A").point(lambda v: 255 if v >= 16 else 0).getbbox()
    if box is None:
        sys.exit(f"!! {source} has no visible alpha above threshold")
    l, t, r, b = box
    l, t = max(0, l - pad), max(0, t - pad)
    r, b = min(im.width, r + pad), min(im.height, b + pad)
    im = im.crop((l, t, r, b))
    scale = min(max_dim / im.width, max_dim / im.height, 1.0)
    if scale < 1.0:
        im = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)

    dst = OUT / "flashlight.png"
    colors = 256
    while colors >= 32:
        q = im.quantize(colors=colors, method=Image.FASTOCTREE)
        q.save(dst, "PNG", optimize=True)
        size = dst.stat().st_size
        if size <= 60 * 1024:
            break
        colors -= 32
    print(f"  wrote {dst} {im.size[0]}x{im.size[1]} {size/1024:.1f} KB colors={colors} (source: {source.name})")


# --- CLI ---------------------------------------------------------------------


def main() -> None:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)

    g = sub.add_parser("gen", help="generate candidates into assets/source/")
    g.add_argument("which", choices=["cave-play", "cave-splash", "flashlight", "all"])
    g.add_argument("--force", action="store_true")

    f = sub.add_parser("finalize", help="crop/resize/compress a chosen candidate into assets/")
    f.add_argument("which", choices=["cave-play", "cave-splash", "flashlight"])
    f.add_argument("--source", type=Path, help="chosen candidate (required for cave-play/cave-splash)")

    args = ap.parse_args()

    if args.cmd == "gen":
        if args.which in ("cave-play", "all"):
            print("=== cave-play ===")
            gen_cave_play(args.force)
        if args.which in ("cave-splash", "all"):
            print("=== cave-splash ===")
            gen_cave_splash(args.force)
        if args.which in ("flashlight", "all"):
            print("=== flashlight ===")
            gen_flashlight(args.force)
    else:
        OUT.mkdir(parents=True, exist_ok=True)
        if args.which == "cave-play":
            if not args.source:
                sys.exit("--source required")
            finalize_cave_play(args.source)
        elif args.which == "cave-splash":
            if not args.source:
                sys.exit("--source required")
            finalize_cave_splash(args.source)
        elif args.which == "flashlight":
            source = args.source or max((SRC / "flashlight").glob("cutout-seed*.png"),
                                         key=lambda p: p.stat().st_mtime, default=None)
            if not source:
                sys.exit("no cutout found; run `gen flashlight` first")
            finalize_flashlight(source)


if __name__ == "__main__":
    main()
