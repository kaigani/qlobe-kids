#!/usr/bin/env python3
"""Extract the twenty Name Puzzle character masters with qwen-image-layered."""
from __future__ import annotations

import argparse, concurrent.futures, json, os, subprocess, sys, time, urllib.request
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw

GAME = Path(__file__).resolve().parents[1]
SOURCE = GAME / "assets" / "source"
MASTERS = SOURCE / "gpt-image-2"
LAYERED = SOURCE / "layered"
QA = SOURCE / "qa"
RUNTIME = GAME / "assets" / "characters"
API_ENV = "QLOBE_QWEN_URL"
SEED = 42
CANVAS = (640, 720)
NAMES = [
    "belle", "emma", "luna", "sofia", "aria", "hazel", "nora", "lily", "ellie", "lucy",
    "liam", "noah", "james", "henry", "lucas", "mateo", "levi", "jack", "owen", "ezra",
]
JOBS_FILE = SOURCE / "qwen-jobs.json"

def submit(name: str, api: str) -> tuple[str, str]:
    source = MASTERS / f"{name}-master.png"
    prompt = ("Background layer: the single flat dark-charcoal background. Top layer: the exact complete "
              f"illustrated character {name} from the input on true transparency. Preserve silhouette, colors, "
              "facial features, clothing, texture, and lighting; do not redesign, crop, or add objects.")
    proc = subprocess.run(["curl", "-s", "-X", "POST", f"{api}/workflows/qwen-image-layered",
                           "-F", f"image=@{source}", "-F", f"prompt={prompt}", "-F", "layers=2",
                           "-F", f"seed={SEED}", "--max-time", "180"], capture_output=True, text=True, check=False)
    try: payload = json.loads(proc.stdout or "{}")
    except json.JSONDecodeError as exc: raise RuntimeError(f"{name}: invalid submission response") from exc
    job = payload.get("job_id") or payload.get("id")
    if not job: raise RuntimeError(f"{name}: submission failed: {proc.stdout[:300]}")
    return name, str(job)

def download(api: str, job: str, output: Path) -> None:
    with urllib.request.urlopen(f"{api}/jobs/{job}/result?output=layer_2", timeout=180) as r:
        output.write_bytes(r.read())

def repair(layer: Image.Image, source_path: Path) -> Image.Image:
    src = Image.open(source_path).convert("RGB")
    if src.size != layer.size: src = src.resize(layer.size, Image.Resampling.LANCZOS)
    flooded = src.copy(); marker = (1, 254, 1)
    for xy in ((0, 0), (flooded.width-1, 0), (0, flooded.height-1), (flooded.width-1, flooded.height-1)):
        ImageDraw.floodfill(flooded, xy, marker, thresh=12)
    silhouette = ImageChops.difference(flooded, Image.new("RGB", flooded.size, marker)).convert("L")
    silhouette = silhouette.point(lambda v: 0 if v == 0 else 255)
    alpha = ImageChops.lighter(layer.convert("RGBA").getchannel("A"), silhouette)
    src.putalpha(alpha); return src

def finalize(name: str, layer_path: Path) -> dict:
    image = repair(Image.open(layer_path), MASTERS / f"{name}-master.png")
    bbox = image.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    if not bbox: raise RuntimeError(f"{name}: empty alpha extraction")
    crop = image.crop(bbox)
    scale = min(CANVAS[0] / crop.width, CANVAS[1] / crop.height)
    size = (max(1, round(crop.width*scale)), max(1, round(crop.height*scale)))
    crop = crop.resize(size, Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", CANVAS, (0, 0, 0, 0)); canvas.alpha_composite(crop, ((CANVAS[0]-size[0])//2, (CANVAS[1]-size[1])//2))
    canvas.save(RUNTIME / f"{name}.webp", "WEBP", quality=90, method=6)
    qa = Image.new("RGBA", CANVAS, (255, 0, 255, 255)); qa.alpha_composite(canvas); qa.convert("RGB").save(QA / f"{name}-magenta.png")
    hist = canvas.getchannel("A").histogram(); total = CANVAS[0]*CANVAS[1]
    return {"name": name, "size": list(CANVAS), "alpha": {"transparentPct": round(100*sum(hist[:10])/total,3), "opaquePct": round(100*sum(hist[246:])/total,3), "partialPct": round(100*(total-sum(hist[:10])-sum(hist[246:]))/total,3)}}

def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__); ap.add_argument("--dry-run", action="store_true", help="list masters without contacting Qwen"); args = ap.parse_args()
    print("\n".join(NAMES))
    if args.dry_run: return
    api = os.environ.get(API_ENV, "").rstrip("/")
    if not api: raise RuntimeError(f"{API_ENV} is required (set it to the Qwen service URL)")
    for d in (LAYERED, QA, RUNTIME): d.mkdir(parents=True, exist_ok=True)
    try: jobs = json.loads(JOBS_FILE.read_text())
    except (FileNotFoundError, json.JSONDecodeError): jobs = {}
    valid = lambda n: (LAYERED / f"{n}.layer2.png").exists() and (LAYERED / f"{n}.layer2.png").stat().st_size > 20_000
    pending = {n: jobs[n] for n in NAMES if not valid(n) and n in jobs}
    fresh = [n for n in NAMES if not valid(n) and n not in jobs]
    with concurrent.futures.ThreadPoolExecutor(max_workers=20) as ex:
        for n, jid in ex.map(lambda x: submit(x, api), fresh): pending[n] = jid; jobs[n] = jid
    JOBS_FILE.write_text(json.dumps(jobs, indent=2) + "\n")
    deadline = time.time() + 3600
    while pending and time.time() < deadline:
        for n, jid in list(pending.items()):
            with urllib.request.urlopen(f"{api}/jobs/{jid}", timeout=30) as r: state = json.load(r).get("status")
            if state == "completed": download(api, jid, LAYERED / f"{n}.layer2.png"); del pending[n]
            elif state in {"failed", "error"}: raise RuntimeError(f"{n}: qwen job {state}")
        if pending: time.sleep(10)
    if pending: raise TimeoutError(f"timed out: {sorted(pending)}")
    report = [finalize(n, LAYERED / f"{n}.layer2.png") for n in NAMES]
    (QA / "alpha-report.json").write_text(json.dumps(report, indent=2) + "\n")

if __name__ == "__main__":
    try: main()
    except Exception as exc: print(f"ERROR: {exc}", file=sys.stderr); raise
