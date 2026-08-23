#!/usr/bin/env python3
"""Extract the accepted Shadow Chase GPT Image 2 masters with Qwen Layered.

The source masters use a charcoal production ground. This resumable driver
submits one workflow family at a time, saves the transparent `layer_2` result,
and writes a host-free provenance sidecar. It never prints the configured LAN
host.

Usage:
    python3 games/shadow-chase/tools/generate-layered.py
    python3 games/shadow-chase/tools/generate-layered.py --only toys ui
"""

from __future__ import annotations

import argparse
import io
import json
import pathlib
import sys
import time
import urllib.error
import urllib.request

try:
    from PIL import Image
except ImportError:  # pragma: no cover
    sys.exit("Pillow is required for alpha QA")


ROOT = pathlib.Path(__file__).resolve().parents[3]
GAME = ROOT / "games" / "shadow-chase"
LOCAL_CONFIG = ROOT / "tools" / "state" / "local.json"
SOURCE = GAME / "assets" / "source" / "gpt-image-2"
OUT = GAME / "assets" / "source" / "layered"
SEEDS = (42, 1337, 9001, 7)

ASSETS = {
    "toys": (
        SOURCE / "toy-contact-sheet.png",
        "all six carved wooden animal toys in their exact 3 by 2 positions, "
        "preserving every animal, edge, wood detail, color, scale, and expression",
    ),
    "title": (
        SOURCE / "title-source.png",
        "the complete correctly spelled SHADOW CHASE carved wooden title and its "
        "small flanking ray marks, preserving every letter exactly",
    ),
    "sun-track": (
        SOURCE / "sun-track-source.png",
        "the complete single arched wooden sun rail with all five round stop inlays, "
        "preserving its exact geometry and wood texture",
    ),
}
UI_CELLS = ("sun", "star", "choice-plaque", "button-green", "pedestal", "button-round")
for _index, _name in enumerate(UI_CELLS):
    ASSETS[_name] = (OUT / "ui-inputs" / f"{_name}.png", f"the single carved wooden {_name} interface object")


def api_base() -> str:
    try:
        data = json.loads(LOCAL_CONFIG.read_text())
        value = str(data.get("qwenUrl", "")).rstrip("/")
    except (OSError, ValueError):
        value = ""
    if not value:
        sys.exit("Local workflow URL is not configured in tools/state/local.json")
    return value


def multipart(url: str, fields: dict[str, str], image_path: pathlib.Path) -> bytes:
    boundary = f"----shadowchase{time.time_ns()}"
    body = io.BytesIO()
    for key, value in fields.items():
        body.write(f"--{boundary}\r\n".encode())
        body.write(f'Content-Disposition: form-data; name="{key}"\r\n\r\n'.encode())
        body.write(f"{value}\r\n".encode())
    body.write(f"--{boundary}\r\n".encode())
    body.write(
        f'Content-Disposition: form-data; name="image"; filename="{image_path.name}"\r\n'.encode()
    )
    body.write(b"Content-Type: image/png\r\n\r\n")
    body.write(image_path.read_bytes())
    body.write(b"\r\n")
    body.write(f"--{boundary}--\r\n".encode())
    request = urllib.request.Request(
        url,
        data=body.getvalue(),
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    with urllib.request.urlopen(request, timeout=900) as response:
        return response.read()


def prompt_for(subject: str) -> str:
    return (
        "Background layer: only the perfectly flat uniform dark charcoal background.\n"
        f"Top layer: {subject}, isolated together on a genuinely transparent background.\n"
        "Keep the foreground identical to the input. Do not redraw, restyle, crop, "
        "rearrange, add, remove, or relight anything."
    )


def submit(base: str, source: pathlib.Path, prompt: str, seed: int) -> str:
    raw = multipart(
        f"{base}/workflows/qwen-image-layered",
        {"prompt": prompt, "layers": "2", "seed": str(seed)},
        source,
    )
    payload = json.loads(raw)
    job_id = payload.get("job_id") or payload.get("id")
    if not job_id:
        raise RuntimeError("Layered workflow did not return a job id")
    return str(job_id)


def poll(base: str, job_id: str, timeout: int) -> bytes:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        with urllib.request.urlopen(f"{base}/jobs/{job_id}", timeout=60) as response:
            payload = json.loads(response.read())
        status = str(payload.get("status", "")).lower()
        if status in {"completed", "complete", "succeeded", "success"}:
            with urllib.request.urlopen(
                f"{base}/jobs/{job_id}/result?output=layer_2", timeout=300
            ) as response:
                return response.read()
        if status in {"failed", "error", "cancelled", "canceled"}:
            raise RuntimeError(f"Layered workflow ended with status {status}")
        time.sleep(3)
    raise TimeoutError("Layered workflow exceeded the per-asset timeout")


def alpha_ok(data: bytes) -> tuple[bool, str, dict[str, object]]:
    image = Image.open(io.BytesIO(data)).convert("RGBA")
    histogram = image.getchannel("A").histogram()
    total = image.width * image.height
    transparent = sum(histogram[:8]) / total
    opaque = sum(histogram[248:]) / total
    details = {
        "width": image.width,
        "height": image.height,
        "transparentPct": round(transparent * 100, 3),
        "opaquePct": round(opaque * 100, 3),
    }
    if transparent < 0.05:
        return False, f"background not removed ({transparent:.1%} transparent)", details
    if opaque < 0.01:
        return False, f"near-blank foreground ({opaque:.1%} opaque)", details
    return True, f"{image.width}x{image.height}; {transparent:.1%} transparent", details


def deterministic_charcoal_matte(source: pathlib.Path, output: pathlib.Path, qa_path: pathlib.Path) -> dict[str, object]:
    """Remove the neutral charcoal production ground without inventing pixels."""
    image = Image.open(source).convert("RGBA")
    px = image.load(); w, h = image.size
    # The accepted masters use a near-neutral charcoal matte; estimate it from
    # the corners, then retain walnut edges by using a soft distance ramp.
    corners = [px[0, 0], px[w - 1, 0], px[0, h - 1], px[w - 1, h - 1]]
    matte = tuple(sum(c[i] for c in corners) // 4 for i in range(3))
    # The star master includes a very broad, nearly-neutral production shadow.
    # A tighter distance gate keeps its walnut rim but drops the gray aura.
    cutoff = 15 if source.stem == "star" else 8
    scale = 22 if source.stem == "star" else 18
    for y in range(h):
        for x in range(w):
            r, g, b, _ = px[x, y]
            distance = max(abs(r - matte[0]), abs(g - matte[1]), abs(b - matte[2]))
            alpha = max(0, min(255, (distance - cutoff) * scale))
            if source.stem == "star":
                brightness = max(r, g, b)
                chroma = brightness - min(r, g, b)
                if (brightness < 88 and chroma < 38) or (brightness < 110 and chroma < 24):
                    alpha = 0
                elif brightness < 110 and chroma < 42:
                    alpha = min(alpha, max(0, round(alpha * (chroma - 24) / 18)))
            px[x, y] = (r, g, b, alpha)
    bbox = image.getchannel("A").getbbox()
    if not bbox:
        raise RuntimeError(f"fallback produced empty matte for {source.name}")
    image.save(output, "PNG", optimize=True)
    review = Image.new("RGBA", image.size, (255, 0, 255, 255)); review.alpha_composite(image)
    review.convert("RGB").save(qa_path, "PNG", optimize=True)
    return {"status": "accepted", "workflow": "deterministic-charcoal-matte",
            "reason": "Qwen UI extraction unreliable; neutral charcoal ground removed with soft alpha distance ramp",
            "source": source.relative_to(ROOT).as_posix(),
            "output": output.relative_to(ROOT).as_posix(),
            "bbox": list(bbox), "matte": matte,
            "distanceCutoff": cutoff, "distanceScale": scale}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--only", nargs="*", choices=sorted(ASSETS))
    parser.add_argument("--timeout", type=int, default=1800)
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--fallback-ui", action="store_true", help="use offline charcoal-matte fallback for six UI cells")
    args = parser.parse_args()

    selected = args.only or list(ASSETS)
    # Make immutable per-cell masters from the rejected whole-sheet candidate;
    # never submit or overwrite the whole-sheet result again.
    if any(name in selected for name in UI_CELLS):
        ui_master = SOURCE / "ui-contact-sheet.png"
        image = Image.open(ui_master).convert("RGB")
        (OUT / "ui-inputs").mkdir(parents=True, exist_ok=True)
        w, h = image.size
        for index, name in enumerate(UI_CELLS):
            path = ASSETS[name][0]
            if not path.exists() or args.force:
                image.crop((index % 3 * w // 3, index // 3 * h // 2,
                            (index % 3 + 1) * w // 3, (index // 3 + 1) * h // 2)).save(path, "PNG")
    if args.fallback_ui:
        qa_dir = GAME / "assets/source/qa-magenta"
        qa_dir.mkdir(parents=True, exist_ok=True)
        fallback_names = [name for name in UI_CELLS if name in selected]
        for name in fallback_names:
            source, _ = ASSETS[name]
            target = OUT / f"ui-{name}.png"
            recipe = OUT / f"ui-{name}.png.recipe.json"
            if target.exists() and not args.force:
                print(f"skip fallback {name}: existing output preserved", flush=True)
                continue
            details = deterministic_charcoal_matte(source, target, qa_dir / f"{name}.png")
            recipe.write_text(json.dumps({"format": "qlobe-recipe", "formatVersion": 1, **details}, indent=2) + "\n")
            print(f"accept fallback {name}: deterministic-charcoal-matte", flush=True)
        selected = [name for name in selected if name not in fallback_names]
    missing = [str(ASSETS[name][0]) for name in selected if not ASSETS[name][0].is_file()]
    if missing:
        sys.exit("Missing source masters:\n" + "\n".join(missing))

    OUT.mkdir(parents=True, exist_ok=True)
    base = api_base()
    failures: list[str] = []
    for name in selected:
        source, subject = ASSETS[name]
        target = OUT / (f"ui-{name}.png" if name in UI_CELLS else f"{name}.png")
        recipe_path = OUT / f"{name}.png.recipe.json"
        if target.exists() and not args.force:
            ok, note, _ = alpha_ok(target.read_bytes())
            if ok:
                print(f"skip {name}: {note}", flush=True)
                continue

        prompt = prompt_for(subject)
        for seed in SEEDS:
            print(f"extract {name}: seed {seed}", flush=True)
            try:
                data = poll(base, submit(base, source, prompt, seed), args.timeout)
                ok, note, details = alpha_ok(data)
                if not ok:
                    print(f"reject {name}: {note}", flush=True)
                    continue
                target.write_bytes(data)
                recipe = {
                    "format": "qlobe-recipe",
                    "formatVersion": 1,
                    "workflow": "qwen-image-layered",
                    "seed": seed,
                    "layers": 2,
                    "selectedOutput": "layer_2",
                    "source": source.relative_to(ROOT).as_posix(),
                    "output": target.relative_to(ROOT).as_posix(),
                    "prompt": prompt,
                    "qa": {"status": "needs-human-review", **details},
                }
                recipe_path.write_text(json.dumps(recipe, indent=2) + "\n")
                print(f"accept {name}: {note}", flush=True)
                break
            except (OSError, ValueError, RuntimeError, TimeoutError, urllib.error.URLError) as error:
                print(f"retry {name}: {type(error).__name__}: {error}", flush=True)
        else:
            failures.append(name)

    if failures:
        print("failed: " + ", ".join(failures), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
