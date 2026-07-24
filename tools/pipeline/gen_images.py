#!/usr/bin/env python3
"""Generate onset/rime tile + object images via the qwen-image-edit ComfyUI
workflow, from a words.json-shaped word list.

Ported from tools/content-pipeline/gen_images.py (predecessor repo, hardcoded
paths + a hardcoded LAN host). This version takes the repo root, API host,
and every content/output path as CLI arguments -- see README.md for the
canonical pipeline lifecycle this fits into.

Proven behaviors preserved:
  - seed ladder [42, 1337, 9001, 7], retried in order until one succeeds
  - skip-existing idempotency (a valid output already on disk -> skip)
  - blank-white-image rejection (grayscale stddev < 6 => treated as blank)
  - minimum-size check (smallest dimension >= 256px)
  - retry-on-failure across the seed ladder

Requires Pillow for image validation (`pip install pillow`); guarded import,
only required when actually generating (not for --help or --dry-run).
Everything else is stdlib.

The API host is NEVER hardcoded: pass --api-url or set QLOBE_QWEN_URL.
--dry-run lists planned work and makes zero network calls; it needs neither.
"""
import argparse
import json
import os
import subprocess
import sys

try:
    from PIL import Image, ImageStat
except ImportError:  # optional; only required for real generation
    Image = None
    ImageStat = None

SEEDS = [42, 1337, 9001, 7]

STYLE = ("in this 3D game asset style. Bright, soft 3D cartoon style with rounded, "
         "simplified forms and cheerful proportions. Features saturated colors, smooth "
         "shading, soft highlights, and a toy-like glossy finish, perfectly matching the "
         "artistic style of the reference image. Isolated on a pure, solid white background "
         "with a soft, subtle drop shadow underneath. Clean and readable silhouette, minimal "
         "detail, zero clutter, {text} and no UI elements. Premium preschool learning app asset.")


def build_parser():
    p = argparse.ArgumentParser(
        description="Generate onset/rime tile + object images from a words.json word list "
                    "via the qwen-image-edit ComfyUI workflow.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    p.add_argument("--root", default=os.getcwd(), help="repo/content root")
    p.add_argument("--api-url", default=os.environ.get("QLOBE_QWEN_URL"),
                   help="ComfyUI wrapper base URL (or QLOBE_QWEN_URL env); host is never committed")
    p.add_argument("--dry-run", action="store_true", help="list planned work; make no network calls")
    p.add_argument("--words-json", default=None,
                   help="word/onset/rime manifest (default <root>/content/words.json); "
                        "expects {onsets:{...}, rimes:{...}, words:[{word,img,allowText?}]}")
    p.add_argument("--ref-onset", default=None,
                   help="reference tile image edited into onset letters (default <root>/reference/asset_b.png)")
    p.add_argument("--ref-rime", default=None,
                   help="reference tile image edited into rime letters (default <root>/reference/asset_us.png)")
    p.add_argument("--ref-obj", default=None,
                   help="reference object image edited into new objects (default <root>/reference/bus.png)")
    p.add_argument("--raw-tiles", default=None,
                   help="output dir for generated raw tile PNGs (default <root>/generated/raw/tiles)")
    p.add_argument("--raw-objects", default=None,
                   help="output dir for generated raw object PNGs (default <root>/generated/raw/objects)")
    p.add_argument("--existing-tiles", default=None,
                   help="optional dir of already-shipped tiles to also skip (unset = no extra skip layer; "
                        "skip-existing on --raw-tiles output already applies)")
    p.add_argument("--existing-objects", default=None,
                   help="optional dir of already-shipped objects to also skip (unset = no extra skip layer)")
    p.add_argument("--max-time", type=int, default=900, help="per-request curl timeout (seconds)")
    return p


def resolve_paths(args):
    root = args.root
    args.words_json = args.words_json or os.path.join(root, "content", "words.json")
    args.ref_onset = args.ref_onset or os.path.join(root, "reference", "asset_b.png")
    args.ref_rime = args.ref_rime or os.path.join(root, "reference", "asset_us.png")
    args.ref_obj = args.ref_obj or os.path.join(root, "reference", "bus.png")
    args.raw_tiles = args.raw_tiles or os.path.join(root, "generated", "raw", "tiles")
    args.raw_objects = args.raw_objects or os.path.join(root, "generated", "raw", "objects")
    return args


def call(api_url, ref, prompt, seed, out, max_time):
    endpoint = f"{api_url.rstrip('/')}/workflows/qwen-image-edit?sync=true"
    try:
        subprocess.run(
            ["curl", "-s", "-X", "POST", endpoint,
             "-F", f"image=@{ref}", "-F", f"seed={seed}", "-F", f"prompt={prompt}",
             "--output", out, "--max-time", str(max_time)],
            capture_output=True, timeout=max_time + 50)
    except subprocess.TimeoutExpired:
        return False
    return os.path.exists(out) and os.path.getsize(out) > 5000


def valid_png(path, need_content=True):
    if Image is None:
        raise RuntimeError("Pillow is required for image validation: pip install pillow")
    try:
        im = Image.open(path)
        im.load()
        if im.size[0] < 256:
            return False
        if need_content:
            # reject near-blank white images (failure mode)
            st = ImageStat.Stat(im.convert("L"))
            if st.stddev[0] < 6:  # almost uniform => blank
                return False
        return True
    except Exception:
        return False


def gen(api_url, ref, prompt, out, max_time, need_content=True):
    if os.path.exists(out) and valid_png(out, need_content):
        return "skip"
    for s in SEEDS:
        if call(api_url, ref, prompt, s, out, max_time) and valid_png(out, need_content):
            return f"ok(seed {s})"
    return "FAIL"


def plan(words_doc, have_t, have_o):
    onsets, rimes, words = words_doc["onsets"], words_doc["rimes"], words_doc["words"]
    tiles = [("tile-onset", o) for o in onsets if o not in have_t]
    tiles += [("tile-rime", rk) for rk in rimes if rk not in have_t]
    objs = [("object", w["word"]) for w in words if w["word"] not in have_o]
    return tiles, objs


def main():
    parser = build_parser()
    args = resolve_paths(parser.parse_args())

    if not args.dry_run and not args.api_url:
        parser.error("no --api-url / QLOBE_QWEN_URL set (generation needs a host; use --dry-run to preview with none)")

    have_t, have_o = set(), set()
    for d, bucket in ((args.existing_tiles, have_t), (args.existing_objects, have_o)):
        if d and os.path.isdir(d):
            bucket.update(os.path.splitext(f)[0] for f in os.listdir(d))

    if not os.path.exists(args.words_json):
        print(f"words manifest not found: {args.words_json}")
        print("Nothing to plan -- pass --words-json to point at a real word list.")
        return 0 if args.dry_run else 1

    with open(args.words_json) as f:
        words_doc = json.load(f)
    tiles, objs = plan(words_doc, have_t, have_o)

    if args.dry_run:
        print(f"[dry-run] words manifest: {args.words_json}")
        print(f"[dry-run] would generate {len(tiles)} tile(s), {len(objs)} object(s)")
        for kind, key in tiles:
            print(f"  TILE {kind:10s} {key:6s} -> {os.path.join(args.raw_tiles, key + '.png')}")
        for kind, key in objs:
            print(f"  OBJ  {key:16s} -> {os.path.join(args.raw_objects, key + '.png')}")
        print("[dry-run] zero network calls made")
        return 0

    if Image is None:
        print("ERROR: Pillow is required to validate generated images: pip install pillow", file=sys.stderr)
        return 2

    os.makedirs(args.raw_tiles, exist_ok=True)
    os.makedirs(args.raw_objects, exist_ok=True)

    words_by_key = {w["word"]: w for w in words_doc["words"]}
    log = []
    for kind, key in tiles:
        if kind == "tile-onset":
            ref, prompt = args.ref_onset, f"Change this to the white lowercase letter '{key}'"
        else:
            ref, prompt = args.ref_rime, f"Change this to the white lowercase letters '{key}'"
        out = os.path.join(args.raw_tiles, f"{key}.png")
        r = gen(args.api_url, ref, prompt, out, args.max_time, need_content=True)
        log.append((kind, key, r))
        print("TILE", key, r, flush=True)

    for kind, key in objs:
        w = words_by_key[key]
        text = "zero clutter," if w.get("allowText") else "zero clutter, no text,"
        prompt = f"Replace the bus with {w['img']} " + STYLE.format(text=text)
        out = os.path.join(args.raw_objects, f"{key}.png")
        r = gen(args.api_url, args.ref_obj, prompt, out, args.max_time, need_content=True)
        log.append(("object", key, r))
        print("OBJ", key, r, flush=True)

    fails = [x for x in log if x[2] == "FAIL"]
    print("\n=== IMAGE GEN DONE ===")
    print("total:", len(log), "fails:", len(fails))
    if fails:
        print("FAILED:", fails)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
