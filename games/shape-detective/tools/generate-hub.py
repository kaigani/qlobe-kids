#!/usr/bin/env python3
"""Generate the Shape Detective Krea menu tile (authoring-time only)."""
from __future__ import annotations
import argparse, datetime, hashlib, json, os, time, urllib.request
from io import BytesIO
from pathlib import Path
from PIL import Image, ImageOps

GAME = Path(__file__).resolve().parents[1]; ROOT = GAME.parents[1]
SOURCE = GAME / "assets/source/local-api/hub"
FINAL = ROOT / "assets/hub/tiles/shape-detective.jpg"
PROMPT = "QLOBE Kids menu game tile, Toy art world rendered as tactile rough colored classroom chalk on a real dark slate board with a warm oak edge. A large brass-and-wood magnifying glass reveals a turquoise circle while a yellow triangle, coral square, sky-blue rectangle, and green hexagon sit like chunky handmade chalk tokens around it; tiny chalk sparkles and one playful clue card, centered heroic object cluster, bright readable color, premium children’s editorial object photography, warm upper-left light, generous crop-safe margin. No words, no letters, no numbers, no logo, no UI screenshot, no child, no character, no gradients, no vector style."

def base_url() -> str:
    value = os.getenv("QLOBE_QWEN_URL")
    if value: return value.rstrip("/")
    try: return str(json.loads((ROOT / "tools/state/local.json").read_text()).get("qwenUrl", "")).rstrip("/")
    except (OSError, json.JSONDecodeError): return ""

def get(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=900) as response: return response.read()

def post(url: str, fields: dict[str, object]) -> dict:
    boundary = "----qlobe-shape-hub"; body = bytearray()
    for key, value in fields.items(): body += f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n'.encode()
    body += f"--{boundary}--\r\n".encode()
    req = urllib.request.Request(url, bytes(body), {"Content-Type": f"multipart/form-data; boundary={boundary}"})
    with urllib.request.urlopen(req, timeout=900) as response: return json.loads(response.read())

def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()

def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, indent=2) + "\n")
    temporary.replace(path)

def validate_candidate(path: Path) -> None:
    if not path.is_file() or path.stat().st_size < 2_000:
        raise SystemExit("Krea candidate is missing or implausibly small")
    with Image.open(path) as image:
        image.load()
        if image.format != "PNG" or image.size != (768, 640):
            raise SystemExit(f"unexpected Krea candidate {image.format} {image.size}")

def install_candidate(raw: Path) -> str:
    validate_candidate(raw)
    FINAL.parent.mkdir(parents=True, exist_ok=True)
    temporary = FINAL.with_suffix(".jpg.tmp")
    with Image.open(raw) as image:
        ImageOps.fit(
            image.convert("RGB"), (640, 533), method=Image.Resampling.LANCZOS
        ).save(temporary, "JPEG", quality=91, optimize=True)
    temporary.replace(FINAL)
    return sha256(FINAL)

def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__); ap.add_argument("--seed", type=int, default=42); ap.add_argument("--force", action="store_true"); ap.add_argument("--accept", action="store_true", help="mark this candidate human-accepted"); ap.add_argument("--install", action="store_true", help="publish an accepted candidate"); args = ap.parse_args()
    raw = SOURCE / f"shape-detective-krea2-seed-{args.seed}.png"; recipe = SOURCE / f"shape-detective-krea2-seed-{args.seed}.recipe.json"
    if raw.is_file() or recipe.is_file():
        if args.force:
            if args.accept or args.install:
                raise SystemExit("generate a forced candidate first, inspect it, then accept/install in a second command")
        else:
            if not raw.is_file() or not recipe.is_file():
                raise SystemExit("candidate/recipe pair is incomplete; use --force to regenerate it")
            validate_candidate(raw)
            try: prior = json.loads(recipe.read_text())
            except (OSError, json.JSONDecodeError) as exc: raise SystemExit(f"invalid hub recipe: {exc}")
            source_hash = sha256(raw)
            if prior.get("sourceSha256") != source_hash:
                raise SystemExit("candidate hash does not match its recipe; use --force to regenerate")
            if args.accept:
                prior.setdefault("qa", {})["status"] = "accepted"
                prior["qa"]["candidateSha256"] = source_hash
                prior["qa"]["acceptedAt"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
                prior["qa"]["reviewContext"] = "full-size and 320px visual inspection"
                prior["status"] = "accepted"
            if args.install:
                qa = prior.get("qa", {})
                if qa.get("status") != "accepted" or qa.get("candidateSha256") != source_hash:
                    raise SystemExit("candidate requires a hash-bound --accept before --install")
                prior["final"] = str(FINAL.relative_to(ROOT))
                prior["finalSha256"] = install_candidate(raw)
                prior["status"] = "installed"
                prior["installedAt"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
            if args.accept or args.install:
                write_json(recipe, prior)
            elif prior.get("status") == "installed":
                if not FINAL.is_file() or prior.get("finalSha256") != sha256(FINAL):
                    raise SystemExit("installed hub tile no longer matches its recipe")
            print(f"shape-detective: {prior.get('status', 'candidate-reused')}")
            return
    if args.accept or args.install:
        raise SystemExit("generate the candidate first, inspect it, then run --accept --install")
    api = base_url()
    if not api: raise SystemExit("Krea API configuration unavailable")
    submitted = post(f"{api}/workflows/krea2-turbo-t2i", {"prompt": PROMPT, "seed": args.seed, "width": 768, "height": 640, "steps": 8, "cfg": 1})
    job = str(submitted.get("job_id") or submitted.get("id") or "");
    if not job: raise SystemExit("Krea submission returned no job id")
    deadline = time.time() + 1800
    while time.time() < deadline:
        status = json.loads(get(f"{api}/jobs/{job}")); state = status.get("status")
        if state in {"completed", "complete", "success", "succeeded"}:
            data = get(f"{api}/jobs/{job}/result")
            if not data.startswith(b"\x89PNG\r\n\x1a\n"): raise SystemExit("Krea result was not PNG")
            raw.parent.mkdir(parents=True, exist_ok=True); raw.write_bytes(data); break
        if state in {"failed", "error", "cancelled", "canceled"}: raise SystemExit(f"Krea job {state}")
        time.sleep(4)
    else: raise SystemExit("Krea job timed out")
    with Image.open(BytesIO(data)) as image:
        if image.size != (768, 640): raise SystemExit(f"unexpected Krea size {image.size}")
    source_hash = sha256(raw)
    write_json(recipe, {"format":"qlobe-recipe","formatVersion":1,"id":f"shape-detective-hub-seed-{args.seed}","kind":"image","asset":"shape-detective-hub","artDirection":"Toy — rough color-chalk classroom slate","status":"pending-human-review","steps":[{"workflow":"krea2-turbo-t2i","prompt":PROMPT,"seed":args.seed,"width":768,"height":640,"steps":8,"cfg":1}],"source":str(raw.relative_to(ROOT)),"sourceSha256":source_hash,"final":None,"finalSha256":None,"qa":{"status":"pending-human-review","candidateSha256":source_hash,"finalSize":[640,533],"checks":["composition","color-and-contrast","no-words-or-logos","crop-safe-margin"]},"createdAt":datetime.datetime.now(datetime.timezone.utc).isoformat()})
    print("shape-detective: candidate generated; inspect before --accept --install")

if __name__ == "__main__": main()
