#!/usr/bin/env python3
"""Generate the Grace & Courtesy Theater Krea2 hub tile."""
import argparse, datetime as dt, hashlib, json, os, time
from pathlib import Path
from urllib.request import Request, urlopen
from PIL import Image, ImageOps

GAME = Path(__file__).resolve().parents[1]
REPO = GAME.parents[1]
OUT = GAME / "assets/source/krea"
RAW = OUT / "hub-tile-seed-{seed}.png"
RECIPE = OUT / "hub-tile-recipe.json"
PREVIEW = OUT / "hub-tile-krea-preview.jpg"
PROMPT = ("premium preschool toy photography of two adorable handmade felt bean puppets on a tiny cranberry-curtain felt theater stage: "
          "Poppy is warm peach with burgundy yarn-loop hair and a small gold star patch, Coco is cocoa brown with two puff buns, teal ties, "
          "and a teal heart patch; both puppets wave together, with a plush heart between them and warm round footlights, centered readable friendly faces, "
          "rich wool and soft felt texture, tactile storybook world, warm theatrical lighting, clear 6:5 menu-tile composition; "
          "no text, letters, numbers, logo, UI, watermark, border, extra characters, photorealistic humans, or clutter")

def base_url(explicit=None):
    if explicit: return explicit.rstrip("/")
    if os.environ.get("QLOBE_QWEN_URL"): return os.environ["QLOBE_QWEN_URL"].rstrip("/")
    return str(json.loads((REPO / "tools/state/local.json").read_text())["qwenUrl"]).rstrip("/")

def generate(base, seed):
    fields = {"prompt": PROMPT, "seed": seed, "width": 768, "height": 640, "steps": 8, "cfg": 1}
    boundary = "----Qlobecourtesy"
    body = b"".join((f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n').encode() for k,v in fields.items()) + f"--{boundary}--\r\n".encode()
    req = Request(base + "/workflows/krea2-turbo-t2i", data=body, method="POST", headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
    with urlopen(req, timeout=60) as r: job = json.load(r)
    jid = job.get("job_id") or job.get("id")
    if not jid: raise RuntimeError("Krea response had no job id")
    for _ in range(int(os.environ.get("QLOBE_QWEN_TIMEOUT", "900"))):
        with urlopen(f"{base}/jobs/{jid}", timeout=60) as r: status = json.load(r)
        state = str(status.get("status", "")).lower()
        if state in {"done", "completed", "complete", "success", "succeeded"}:
            with urlopen(f"{base}/jobs/{jid}/result", timeout=300) as r: return r.read(), jid
        if state in {"failed", "error", "cancelled", "canceled"}: raise RuntimeError(f"Krea failed: {state}")
        time.sleep(1)
    raise TimeoutError("Krea polling timed out")

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--api-url"); ap.add_argument("--seed", type=int, default=42); ap.add_argument("--force", action="store_true"); args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True); raw = OUT / RAW.name.format(seed=args.seed)
    if args.force or not raw.is_file():
        data, jid = generate(base_url(args.api_url), args.seed); raw.write_bytes(data)
    else: jid = "reused"
    with Image.open(raw) as im:
        im.load(); final = ImageOps.fit(im.convert("RGB"), (640, 533), Image.Resampling.LANCZOS)
        PREVIEW.parent.mkdir(parents=True, exist_ok=True); final.save(PREVIEW, "JPEG", quality=92, optimize=True)
    receipt = {"format":"qlobe-recipe", "formatVersion":1, "id":"grace-courtesy-theater-hub-krea2-exploration", "kind":"image", "asset":str(PREVIEW.relative_to(REPO)), "source":str(raw.relative_to(REPO)), "steps":[{"workflow":"krea2-turbo-t2i","prompt":PROMPT,"seed":args.seed,"width":768,"height":640,"steps":8,"cfg":1}], "job":"sanitized-local-job-id", "sourceSha256":hashlib.sha256(raw.read_bytes()).hexdigest(), "previewSha256":hashlib.sha256(PREVIEW.read_bytes()).hexdigest(), "qa":{"status":"retained-as-exploration","finalSize":[640,533],"note":"No text; public tile received an OpenAI cast-consistency edit recorded separately."}, "createdAt":dt.datetime.now(dt.timezone.utc).isoformat()}
    RECIPE.write_text(json.dumps(receipt, indent=2) + "\n")
    print(f"generated {PREVIEW} seed={args.seed} job={jid}")
if __name__ == "__main__": main()
