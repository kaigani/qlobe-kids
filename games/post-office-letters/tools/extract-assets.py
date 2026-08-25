#!/usr/bin/env python3
"""Resumable Qwen Image Layered extraction and deterministic cutout finalization."""
from __future__ import annotations
import argparse, io, json, pathlib, subprocess, sys, time, urllib.request
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[3]
GAME = ROOT / "games/post-office-letters"
SOURCE = GAME / "assets/source/gpt-image-2"
LAYERED = GAME / "assets/source/layered"
PRODUCTION = GAME / "assets/production"
QA = PRODUCTION / "qa-magenta"
CONFIG = ROOT / "tools/state/local.json"
SEEDS = (42, 1337, 9001, 7)
ASSETS = {
    "title": (SOURCE / "title.png", GAME / "assets/ui/title.webp", "the complete post office letters title lettering and all painted title ornaments, preserving every letter exactly"),
    "envelope": (SOURCE / "envelope.png", GAME / "assets/props/envelope.webp", "the complete single envelope prop, preserving its shape, colors, outline, and all details exactly"),
    "stamp-heart": (SOURCE / "stamp-heart.png", GAME / "assets/props/stamp-heart.webp", "the complete single heart postage stamp prop, preserving its shape, colors, outline, and details exactly"),
    "stamp-moon": (SOURCE / "stamp-moon.png", GAME / "assets/props/stamp-moon.webp", "the complete single moon postage stamp prop, preserving its shape, colors, outline, and details exactly"),
    "stamp-rainbow": (SOURCE / "stamp-rainbow.png", GAME / "assets/props/stamp-rainbow.webp", "the complete single rainbow postage stamp prop, preserving its shape, colors, outline, and details exactly"),
}
TARGET_WIDTH = {"title": 900, "envelope": 800, "stamp-heart": 420, "stamp-moon": 420, "stamp-rainbow": 420}

def base_url():
    try: value = json.loads(CONFIG.read_text()).get("qwenUrl", "")
    except (OSError, ValueError): value = ""
    if not value: raise SystemExit("qwenUrl is missing from tools/state/local.json")
    return str(value).rstrip("/")

def submit(base, source, prompt, seed):
    boundary = f"----qloeb{time.time_ns()}"; body = io.BytesIO()
    for key, value in (("prompt", prompt), ("layers", "2"), ("seed", str(seed))):
        body.write(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{key}\"\r\n\r\n{value}\r\n".encode())
    body.write(f"--{boundary}\r\nContent-Disposition: form-data; name=\"image\"; filename=\"{source.name}\"\r\nContent-Type: image/png\r\n\r\n".encode())
    body.write(source.read_bytes()); body.write(f"\r\n--{boundary}--\r\n".encode())
    req = urllib.request.Request(base + "/workflows/qwen-image-layered", data=body.getvalue(), headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
    with urllib.request.urlopen(req, timeout=900) as res: payload = json.loads(res.read())
    job = payload.get("job_id") or payload.get("id")
    if not job: raise RuntimeError("workflow returned no job id")
    return str(job)

def poll(base, job, timeout):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        with urllib.request.urlopen(f"{base}/jobs/{job}", timeout=60) as res: state = json.loads(res.read())
        status = str(state.get("status", "")).lower()
        if status in {"completed", "complete", "succeeded", "success"}:
            with urllib.request.urlopen(f"{base}/jobs/{job}/result?output=layer_2", timeout=300) as res: return res.read()
        if status in {"failed", "error", "cancelled", "canceled"}: raise RuntimeError(f"workflow status {status}")
        time.sleep(3)
    raise TimeoutError("workflow timeout")

def alpha_ok(data):
    image = Image.open(io.BytesIO(data)).convert("RGBA"); hist = image.getchannel("A").histogram(); total = image.width * image.height
    transparent = sum(hist[:8]) / total; opaque = sum(hist[248:]) / total
    stats = {"width": image.width, "height": image.height, "transparentPct": round(transparent*100,3), "opaquePct": round(opaque*100,3)}
    if transparent < .05: return False, stats
    if opaque < .01: return False, stats
    return True, stats

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--only", nargs="*", choices=sorted(ASSETS)); ap.add_argument("--force", action="store_true"); ap.add_argument("--timeout", type=int, default=1800); args = ap.parse_args()
    chosen = args.only or list(ASSETS); LAYERED.mkdir(parents=True, exist_ok=True); PRODUCTION.mkdir(parents=True, exist_ok=True); QA.mkdir(parents=True, exist_ok=True)
    base = base_url(); failures = []
    for name in chosen:
        source, output, subject = ASSETS[name]; layer = LAYERED / f"{name}.png"; recipe = LAYERED / f"{name}.recipe.json"; qa = QA / f"{name}-qa-magenta.png"; output.parent.mkdir(parents=True, exist_ok=True)
        if output.exists() and not args.force:
            try:
                im = Image.open(output); assert im.mode == "RGBA" and im.getchannel("A").getbbox() and output.stat().st_size > 1000
                print(f"skip {name}"); continue
            except Exception: pass
        prompt = ("Bottom layer: only the baked checkerboard/charcoal production background, with no foreground.\n" if name == "title" else "Bottom layer: only the perfectly flat dark charcoal background.\n") + f"Top layer: {subject}, isolated on genuine transparency. Keep foreground identical; do not redraw, crop, rearrange, add, remove, or relight."
        accepted = False
        for seed in SEEDS:
            print(f"extract {name}: seed {seed}", flush=True)
            try:
                data = poll(base, submit(base, source, prompt, seed), args.timeout); ok, stats = alpha_ok(data)
                if not ok: print(f"reject {name}: alpha QA", flush=True); continue
                layer.write_bytes(data)
                recipe.write_text(json.dumps({"format":"qlobe-recipe","formatVersion":1,"workflow":"qwen-image-layered","seed":seed,"selectedOutput":"layer_2","source":str(source.relative_to(ROOT)),"qa":stats,"prompt":prompt}, indent=2) + "\n")
                accepted = True; break
            except Exception as exc: print(f"retry {name}: {type(exc).__name__}: {exc}", flush=True)
        if not accepted: failures.append(name); continue
        final_png = PRODUCTION / f"{name}.png"
        cmd = [sys.executable, str(ROOT / "tools/pipeline/cutout_finalize.py"), "--input", str(layer), "--output", str(final_png), "--magenta", str(qa), "--max-size", "1024", "--pad", "16", "--alpha-floor", "8"]
        result = json.loads(subprocess.check_output(cmd, text=True));
        if not result.get("pass"): failures.append(name); continue
        subprocess.run([
            "cwebp", "-quiet", "-q", "84", "-alpha_q", "92", "-m", "6",
            "-resize", str(TARGET_WIDTH[name]), "0", str(final_png), "-o", str(output),
        ], check=True); final_png.unlink()
        recipe.write_text(json.dumps({**json.loads(recipe.read_text()), "finalize": result, "output": str(output.relative_to(ROOT)), "qaMagenta": str(qa.relative_to(ROOT))}, indent=2) + "\n")
    if failures: raise SystemExit("failed: " + ", ".join(failures))

if __name__ == "__main__": main()
