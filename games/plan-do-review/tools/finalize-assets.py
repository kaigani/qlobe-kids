"""Finalize PLAN DO REVIEW raster art into runtime WebP assets.

The cutter produces transparent PNGs, while GPT Image may encode a nearly
opaque alpha channel (254). Normalize that channel before the shared finalizer
so its QA checks measure the real silhouette.
"""
from __future__ import annotations

import hashlib
import json
import subprocess
from pathlib import Path

from PIL import Image, ImageOps

GAME = Path(__file__).resolve().parents[1]
ASSETS = GAME / "assets"
SOURCE = ASSETS / "source"
GPT = SOURCE / "gpt-image-2"
CUTS = SOURCE / "cuts"
FINALIZED = SOURCE / "finalized"
QA = SOURCE / "qa"
FINALIZED.mkdir(parents=True, exist_ok=True)
QA.mkdir(parents=True, exist_ok=True)


def normalize_alpha(src: Path, dst: Path) -> None:
    im = Image.open(src).convert("RGBA")
    a = im.getchannel("A")
    lo, hi = a.getextrema()
    # GPT exports commonly reserve 253/254 for the opaque body, so normalize
    # the high band even when a handful of pixels already reach 255.
    if hi > 0 and hi >= 240:
        lut = [0 if x <= 8 else 255 if x >= 240 else round((x - 8) * 255 / 232) for x in range(256)]
        a = a.point(lut)
        im.putalpha(a)
    dst.parent.mkdir(parents=True, exist_ok=True)
    im.save(dst)


def finalize_cutout(src: Path, name: str, max_size: int = 900) -> dict:
    normalized = FINALIZED / f"{name}.input.png"
    normalize_alpha(src, normalized)
    out = FINALIZED / f"{name}.png"
    magenta = QA / f"{name}-magenta.png"
    cmd = ["python", "tools/pipeline/cutout_finalize.py", "--input", str(normalized),
           "--output", str(out), "--magenta", str(magenta), "--max-size", str(max_size),
           "--pad", "12", "--alpha-floor", "8"]
    result = subprocess.run(cmd, cwd=GAME.parents[1], capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(f"cutout QA failed for {name}: {result.stderr or result.stdout}")
    im = Image.open(out).convert("RGBA")
    runtime = ASSETS / "runtime-placeholder"  # replaced by caller
    return {"name": name, "source": str(src.relative_to(GAME)), "png": str(out.relative_to(GAME)),
            "size": list(im.size), "alpha": list(im.getchannel("A").getextrema()),
            "sha256": hashlib.sha256(out.read_bytes()).hexdigest(), "bytes": out.stat().st_size,
            "_image": im}


def write_runtime(item: dict, folder: str, name: str, quality: int = 88) -> None:
    out = ASSETS / folder / f"{name}.webp"
    out.parent.mkdir(parents=True, exist_ok=True)
    im = item.pop("_image")
    im.save(out, "WEBP", lossless=False, quality=quality, method=6, exact=True)
    item.update({"runtime": str(out.relative_to(GAME)), "runtime_bytes": out.stat().st_size,
                 "runtime_sha256": hashlib.sha256(out.read_bytes()).hexdigest()})


def background(src: Path, name: str) -> dict:
    im = ImageOps.fit(Image.open(src).convert("RGB"), (1440, 1080), method=Image.Resampling.LANCZOS)
    out = ASSETS / "backgrounds" / f"{name}.webp"
    out.parent.mkdir(parents=True, exist_ok=True)
    im.save(out, "WEBP", quality=82, method=6)
    return {"name": name, "source": str(src.relative_to(GAME)), "runtime": str(out.relative_to(GAME)),
            "size": list(im.size), "bytes": out.stat().st_size,
            "sha256": hashlib.sha256(out.read_bytes()).hexdigest()}


def hub_tile(src: Path) -> dict:
    im = ImageOps.fit(Image.open(src).convert("RGB"), (640, 533), method=Image.Resampling.LANCZOS)
    out = GAME.parents[1] / "assets" / "hub" / "tiles" / "plan-do-review.jpg"
    out.parent.mkdir(parents=True, exist_ok=True)
    im.save(out, "JPEG", quality=88, optimize=True, progressive=True)
    return {
        "name": "hub-tile",
        "source": str(src.relative_to(GAME)),
        "runtime": str(out.relative_to(GAME.parents[1])),
        "size": list(im.size),
        "bytes": out.stat().st_size,
        "sha256": hashlib.sha256(out.read_bytes()).hexdigest(),
    }


def main() -> None:
    items: list[dict] = []
    for stem, name in [("plan-room-master", "plan-room"), ("do-room-master", "do-room"), ("review-room-master", "review-room")]:
        items.append(background(GPT / f"{stem}.png", name))
    items.append(hub_tile(GPT / "hub-tile-master.png"))
    title = finalize_cutout(GPT / "title-master.png", "title", 1100)
    write_runtime(title, "ui", "title")
    items.append(title)
    for pose in ("idle", "point", "cheer"):
        item = finalize_cutout(GPT / f"barnaby-{pose}-master.png", f"barnaby-{pose}", 900)
        write_runtime(item, "characters", f"barnaby-{pose}")
        items.append(item)
    ui = ["plan-board", "plan-card", "play-button", "start-button", "prompt-plaque", "play-mat", "piece-tray", "progress-rope", "jar", "star", "sparkle", "action-button"]
    for n in ui:
        item = finalize_cutout(CUTS / "ui-carriers" / f"{n}.png", n, 1100 if n in {"plan-board", "play-mat"} else 700)
        write_runtime(item, "ui", n); items.append(item)
    for n in ["emotion-happy", "emotion-proud", "emotion-challenged", "emotion-calm", "skill-patience", "skill-problem-solving", "skill-creativity"]:
        item = finalize_cutout(CUTS / "reflection-patches" / f"{n}.png", n, 560)
        write_runtime(item, "ui", n); items.append(item)
    for n in ["home", "back", "sound", "sound-off", "replay"]:
        item = finalize_cutout(CUTS / "hud-controls" / f"hud-{n}.png", n, 260)
        write_runtime(item, "ui", n); items.append(item)
    for group, names in [("tower-pieces", ["tower-base", "tower-block", "tower-arch", "tower-roof", "tower-preview"]),
                         ("garden-pieces", ["garden-pot", "garden-stem", "garden-flower", "garden-sun", "garden-preview"]),
                         ("picnic-pieces", ["picnic-basket", "picnic-apple", "picnic-sandwich", "picnic-drink", "picnic-preview"])]:
        for n in names:
            src = CUTS / group / (f"{n}-alpha.png" if group == "picnic-pieces" else f"{n}.png")
            item = finalize_cutout(src, n, 620)
            write_runtime(item, "previews" if n.endswith("preview") else "pieces", n); items.append(item)
    receipt = {"game": "plan-do-review", "model": "gpt-image-2 (Codex built-in)", "pipeline": "cut-asset-sheet.py -> cutout_finalize.py -> WebP", "assets": items}
    (SOURCE / "production-receipt.json").write_text(json.dumps(receipt, indent=2), encoding="utf-8")
    print(json.dumps({"runtime_files": len(items), "receipt": str(SOURCE / "production-receipt.json"), "background_bytes": [x["bytes"] for x in items[:3]], "hub_bytes": items[3]["bytes"]}, indent=2))


if __name__ == "__main__":
    main()
