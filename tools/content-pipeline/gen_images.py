#!/usr/bin/env python3
"""Generate new tile + object images for the Sound Sprouts word expansion.
Idempotent: skips raws that already exist and validate. Retries seeds on
failure or blank-white output. Run with the pillow venv python."""
import json, os, subprocess, sys
from PIL import Image, ImageStat

ROOT = "/Users/kaigani/Documents/PROJECTS/DEVELOPMENT/260612 phonics game"
API = "http://192.168.1.181:8100/workflows/qwen-image-edit?sync=true"
REF_ONSET = f"{ROOT}/01 reference/asset_b.png"
REF_RIME = f"{ROOT}/01 reference/asset_us.png"
REF_OBJ = f"{ROOT}/01 reference/bus.png"
RAW_TILES = f"{ROOT}/02 generated/raw/tiles"
RAW_OBJ = f"{ROOT}/02 generated/raw/objects"
SEEDS = [42, 1337, 9001, 7]
os.makedirs(RAW_TILES, exist_ok=True)
os.makedirs(RAW_OBJ, exist_ok=True)

STYLE = ("in this 3D game asset style. Bright, soft 3D cartoon style with rounded, "
         "simplified forms and cheerful proportions. Features saturated colors, smooth "
         "shading, soft highlights, and a toy-like glossy finish, perfectly matching the "
         "artistic style of the reference image. Isolated on a pure, solid white background "
         "with a soft, subtle drop shadow underneath. Clean and readable silhouette, minimal "
         "detail, zero clutter, {text} and no UI elements. Premium preschool learning app asset.")

def call(ref, prompt, seed, out):
    try:
        r = subprocess.run(
            ["curl", "-s", "-X", "POST", API,
             "-F", f"image=@{ref}", "-F", f"seed={seed}", "-F", f"prompt={prompt}",
             "--output", out, "--max-time", "900"],
            capture_output=True, timeout=950)
    except subprocess.TimeoutExpired:
        return False
    return os.path.exists(out) and os.path.getsize(out) > 5000

def valid_png(path, need_content=True):
    try:
        im = Image.open(path); im.load()
        if im.size[0] < 256: return False
        if need_content:
            # reject near-blank white images (failure mode)
            st = ImageStat.Stat(im.convert("L"))
            if st.stddev[0] < 6:   # almost uniform => blank
                return False
        return True
    except Exception:
        return False

def gen(ref, prompt, out, need_content=True):
    if os.path.exists(out) and valid_png(out, need_content):
        return "skip"
    for s in SEEDS:
        if call(ref, prompt, s, out) and valid_png(out, need_content):
            return f"ok(seed {s})"
    return "FAIL"

def main():
    d = json.load(open(f"{ROOT}/content/words.json"))
    onsets, rimes, words = d["onsets"], d["rimes"], d["words"]
    have_t = set(os.path.splitext(f)[0] for f in os.listdir(f"{ROOT}/sound-sprouts/assets/gen/tiles"))
    have_o = set(os.path.splitext(f)[0] for f in os.listdir(f"{ROOT}/sound-sprouts/assets/gen/objects"))

    log = []
    # --- tiles (only ones not already shipped) ---
    for o in onsets:
        if o in have_t: continue
        p = f"Change this to the white lowercase letter '{o}'"
        r = gen(REF_ONSET, p, f"{RAW_TILES}/{o}.png", need_content=True)
        log.append(("tile-onset", o, r)); print("TILE", o, r, flush=True)
    for rk in rimes:
        if rk in have_t: continue
        p = f"Change this to the white lowercase letters '{rk}'"
        r = gen(REF_RIME, p, f"{RAW_TILES}/{rk}.png", need_content=True)
        log.append(("tile-rime", rk, r)); print("TILE", rk, r, flush=True)

    # --- objects (only new words) ---
    for w in words:
        word = w["word"]
        if word in have_o: continue
        text = "zero clutter," if w.get("allowText") else "zero clutter, no text,"
        prompt = f"Replace the bus with {w['img']} " + STYLE.format(text=text)
        r = gen(REF_OBJ, prompt, f"{RAW_OBJ}/{word}.png", need_content=True)
        log.append(("object", word, r)); print("OBJ", word, r, flush=True)

    fails = [x for x in log if x[2] == "FAIL"]
    print("\n=== IMAGE GEN DONE ===")
    print("total:", len(log), "fails:", len(fails))
    if fails: print("FAILED:", fails)

if __name__ == "__main__":
    main()
