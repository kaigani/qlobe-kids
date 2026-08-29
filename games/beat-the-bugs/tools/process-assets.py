#!/usr/bin/env python3
"""Resumable Qwen layered extraction and deterministic asset finalization driver."""
from __future__ import annotations
import argparse, json, os, subprocess, time, urllib.parse, urllib.request
from pathlib import Path

from PIL import Image, ImageFilter

GAME = Path(__file__).resolve().parents[1]
ROOT = GAME.parents[1]
SEEDS = (42, 1337)

def safe_path(value: str, *, default_dir: str | None = None) -> Path:
    p = Path(value)
    if not p.is_absolute(): p = GAME / p
    p = p.resolve()
    if p != GAME and GAME not in p.parents:
        raise ValueError(f"path escapes beat-the-bugs: {value}")
    return p

def api_url(value: str | None) -> str:
    state = {}
    try: state = json.loads((ROOT / "tools/state/local.json").read_text())
    except (OSError, ValueError): pass
    return (value or os.environ.get("QLOBE_QWEN_URL") or state.get("qwenUrl") or "").rstrip("/")

def request(url: str, data=None, headers=None):
    req = urllib.request.Request(url, data=data, headers=headers or {})
    with urllib.request.urlopen(req, timeout=300) as r: return r.read()

def submit(base: str, source: Path, prompt: str, seed: int) -> dict:
    boundary = "----qlobe-beat-bugs"
    body = bytearray()
    layered_prompt = (
        "Background layer: plain flat dark charcoal background.\n"
        f"Top layer: {prompt}"
    )
    for k, v in (("prompt", layered_prompt), ("layers", "2"), ("seed", str(seed))):
        body += f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n".encode()
    body += f"--{boundary}\r\nContent-Disposition: form-data; name=\"image\"; filename=\"{source.name}\"\r\nContent-Type: image/png\r\n\r\n".encode()
    body += source.read_bytes() + f"\r\n--{boundary}--\r\n".encode()
    payload = json.loads(request(base + "/workflows/qwen-image-layered", body, {"Content-Type": f"multipart/form-data; boundary={boundary}"}))
    job = payload.get("job_id") or payload.get("id")
    if not job: raise RuntimeError(f"Qwen did not return a job id: {payload}")
    for _ in range(450):
        status = json.loads(request(f"{base}/jobs/{urllib.parse.quote(str(job))}"))
        state = status.get("status")
        if state == "completed":
            outputs = {}
            for output in ("layer_2", "layer_1"):
                try:
                    data = request(
                        f"{base}/jobs/{urllib.parse.quote(str(job))}/result?output={output}"
                    )
                    if data.startswith(b"\x89PNG"):
                        outputs[output] = data
                except Exception:
                    pass
            if not outputs:
                raise RuntimeError("Qwen returned no PNG layer roles")
            return {"jobIdRedacted": bool(job), "status": state, "outputs": outputs}
        if state in {"failed", "error", "cancelled", "canceled"}: raise RuntimeError(f"Qwen job failed: {state}")
        time.sleep(4)
    raise TimeoutError(str(job))

def finalize(raw: Path, png: Path, magenta: Path, maximum: int) -> dict:
    cmd = ["python3", str(ROOT / "tools/pipeline/cutout_finalize.py"), "--input", str(raw), "--output", str(png), "--magenta", str(magenta), "--max-size", str(maximum), "--pad", "12", "--alpha-floor", "4"]
    proc = subprocess.run(cmd, text=True, capture_output=True)
    try: result = json.loads(proc.stdout)
    except ValueError: raise RuntimeError(proc.stderr or proc.stdout or "finalizer failed")
    return result


def contiguous_ground_key(source: Path, destination: Path, threshold: int = 80) -> dict:
    """Remove only flat ground connected to an image edge; never redraw the subject."""
    image = Image.open(source).convert("RGBA")
    rgb = image.convert("RGB")
    width, height = image.size
    pixels = rgb.load()
    corners = (pixels[0, 0], pixels[width - 1, 0], pixels[0, height - 1], pixels[width - 1, height - 1])
    ground = tuple(round(sum(sample[channel] for sample in corners) / len(corners)) for channel in range(3))
    threshold_sq = threshold * threshold
    alpha = Image.new("L", (width, height), 255)
    alpha_pixels = alpha.load()
    seen = bytearray(width * height)
    stack = [*((x, 0) for x in range(width)), *((x, height - 1) for x in range(width)),
             *((0, y) for y in range(height)), *((width - 1, y) for y in range(height))]
    while stack:
        x, y = stack.pop()
        index = y * width + x
        if seen[index]:
            continue
        seen[index] = 1
        color = pixels[x, y]
        if sum((color[channel] - ground[channel]) ** 2 for channel in range(3)) > threshold_sq:
            continue
        alpha_pixels[x, y] = 0
        if x:
            stack.append((x - 1, y))
        if x + 1 < width:
            stack.append((x + 1, y))
        if y:
            stack.append((x, y - 1))
        if y + 1 < height:
            stack.append((x, y + 1))
    alpha = alpha.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.55))
    image.putalpha(alpha)
    destination.parent.mkdir(parents=True, exist_ok=True)
    image.save(destination, "PNG", optimize=True)
    return {"method": "edge-connected RGB-distance key", "sampledGround": list(ground), "distanceThreshold": threshold}


def global_ground_key(source: Path, destination: Path, inner: int = 30, outer: int = 70) -> dict:
    """Remove a uniform ground everywhere, including enclosed holes in simple ring-like art."""
    image = Image.open(source).convert("RGBA")
    rgb = image.convert("RGB")
    width, height = image.size
    pixels = rgb.load()
    corners = (pixels[0, 0], pixels[width - 1, 0], pixels[0, height - 1], pixels[width - 1, height - 1])
    ground = tuple(round(sum(sample[channel] for sample in corners) / len(corners)) for channel in range(3))
    low, high = max(0, int(inner)), max(int(inner) + 1, int(outer))
    alpha = Image.new("L", (width, height), 0)
    alpha_pixels = alpha.load()
    for y in range(height):
        for x in range(width):
            color = pixels[x, y]
            distance = sum((color[channel] - ground[channel]) ** 2 for channel in range(3)) ** 0.5
            alpha_pixels[x, y] = 0 if distance <= low else 255 if distance >= high else round(255 * (distance - low) / (high - low))
    alpha = alpha.filter(ImageFilter.GaussianBlur(0.35))
    image.putalpha(alpha)
    destination.parent.mkdir(parents=True, exist_ok=True)
    image.save(destination, "PNG", optimize=True)
    return {"method": "global RGB-distance key", "sampledGround": list(ground), "innerDistance": low, "outerDistance": high}

def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--plan", required=True, help="JSON plan array or file containing {entries:[...]}")
    ap.add_argument("--api-url", help="LAN Qwen URL (or QLOBE_QWEN_URL/local state)")
    ap.add_argument("--receipt", help="receipt JSON path (defaults to assets/source/processing.json)")
    ap.add_argument("--only", nargs="+", help="process only these plan entry names")
    ap.add_argument(
        "--source-key-only",
        action="store_true",
        help="skip Qwen and preserve the cutter crop with deterministic edge-connected background removal",
    )
    ap.add_argument("--force", action="store_true"); ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    plan_path = Path(args.plan)
    raw_plan = json.loads(plan_path.read_text() if plan_path.is_file() else args.plan)
    entries = raw_plan.get("entries", raw_plan) if isinstance(raw_plan, dict) else raw_plan
    if not isinstance(entries, list): raise SystemExit("plan must be a JSON array (or {entries:[...]})")
    plan_order = [entry.get("name") for entry in entries]
    if args.only:
        wanted = set(args.only)
        entries = [entry for entry in entries if entry.get("name") in wanted]
        missing = sorted(wanted - {entry.get("name") for entry in entries})
        if missing:
            raise SystemExit(f"unknown --only entries: {', '.join(missing)}")
    receipt = safe_path(args.receipt or "assets/source/processing.json")
    if args.dry_run:
        for e in entries: safe_path(e["source"]); safe_path(e["final"])
        print(json.dumps({"dryRun": True, "entries": [e.get("name") for e in entries]})); return
    base = "" if args.source_key_only else api_url(args.api_url)
    if not args.source_key_only and not base:
        raise SystemExit("--api-url/QLOBE_QWEN_URL/local qwenUrl is required unless --source-key-only is used")
    try:
        prior_payload = json.loads(receipt.read_text())
        prior_records = {item.get("name"): item for item in prior_payload.get("objects", []) if isinstance(item, dict) and item.get("name")}
    except (OSError, ValueError):
        prior_records = {}
    records = dict(prior_records)

    def save_receipt() -> None:
        ordered = [records[name] for name in plan_order if name in records]
        extras = [record for name, record in records.items() if name not in plan_order]
        receipt.parent.mkdir(parents=True, exist_ok=True)
        receipt.write_text(json.dumps({"format": "beat-the-bugs-processing", "objects": ordered + extras}, indent=2) + "\n")

    total_entries = len(entries)
    for index, e in enumerate(entries, 1):
        name, source, final = e["name"], safe_path(e["source"]), safe_path(e["final"])
        maximum = int(e.get("maxSize", 640)); final.parent.mkdir(parents=True, exist_ok=True)
        if final.exists() and final.stat().st_size > 100 and not args.force:
            if name not in records:
                records[name] = {"name": name, "final": str(final.relative_to(GAME)), "status": "unreceipted-existing"}
                save_receipt()
            print(f"ART {index}/{total_entries} {name}: retained", flush=True)
            continue
        layered = safe_path(e.get("layered", f"assets/source/layered/{name}.accepted.png")); layered.parent.mkdir(parents=True, exist_ok=True)
        accepted = None
        attempts = []
        if not args.source_key_only:
            for seed in SEEDS:
                response = submit(base, source, e.get("prompt", "the complete subject on a transparent background; preserve all details; no background"), seed)
                checked_roles = 0
                for output, data in response["outputs"].items():
                    checked_roles += 1
                    raw = layered.with_name(f"{name}.seed-{seed}.{output}.png")
                    raw.write_bytes(data)
                    for method in ("direct-alpha", "edge-connected-key"):
                        candidate = raw
                        key_meta = None
                        if method == "edge-connected-key":
                            candidate = raw.with_name(raw.stem + ".keyed.png")
                            key_meta = contiguous_ground_key(raw, candidate)
                        png = raw.with_name(raw.stem + f".{method}.final.png")
                        magenta = raw.with_name(raw.stem + f".{method}.magenta.png")
                        qa = finalize(candidate, png, magenta, maximum)
                        attempts.append({"seed": seed, "output": output, "method": method, "qa": qa})
                        if qa.get("pass"):
                            layered.write_bytes(candidate.read_bytes())
                            accepted = {"seed": seed, "output": output, "method": method, "qa": qa,
                                        "png": png, "key": key_meta, "response": {"status": response["status"], "jobIdRedacted": response["jobIdRedacted"]}}
                            break
                    if accepted:
                        break
                if accepted or checked_roles >= 2:
                    break
        if not accepted:
            keyed = layered.with_name(f"{name}.source-keyed.png")
            if e.get("keyMode") == "global-ground":
                key_meta = global_ground_key(source, keyed, int(e.get("keyInner", 30)), int(e.get("keyOuter", 70)))
                fallback_method = "deterministic-global-ground-key"
            else:
                key_meta = contiguous_ground_key(source, keyed)
                fallback_method = "deterministic-contiguous-ground-key"
            png = keyed.with_name(keyed.stem + ".final.png")
            magenta = keyed.with_name(keyed.stem + ".magenta.png")
            qa = finalize(keyed, png, magenta, maximum)
            attempts.append({"seed": None, "output": "source", "method": fallback_method, "qa": qa})
            if qa.get("pass"):
                layered.write_bytes(keyed.read_bytes())
                accepted = {"seed": None, "output": "source", "method": fallback_method,
                            "qa": qa, "png": png, "key": key_meta,
                            "response": {"status": "local-fallback", "jobIdRedacted": False}}
        if not accepted:
            raise RuntimeError(f"{name}: all layered roles and deterministic fallback failed QA: {attempts}")
        Image.open(accepted["png"]).convert("RGBA").save(
            final, "WEBP", quality=int(e.get("quality", 90)), method=6, exact=True
        )
        records[name] = {"name": name, "source": str(source.relative_to(GAME)), "layered": str(layered.relative_to(GAME)),
                         "final": str(final.relative_to(GAME)), "seed": accepted["seed"], "acceptedOutput": accepted["output"],
                         "method": accepted["method"], "key": accepted["key"], "qa": accepted["qa"],
                         "attempts": attempts, "response": accepted["response"], "status": "processed"}
        save_receipt()
        print(f"ART {index}/{total_entries} {name}: {accepted['output']} {accepted['method']}", flush=True)
    save_receipt()
    print(f"ART RECEIPT {len(records)}/{len(plan_order)}; RUN DONE {len(entries)}/{len(entries)}")
if __name__ == "__main__": main()
