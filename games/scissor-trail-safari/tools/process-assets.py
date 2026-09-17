#!/usr/bin/env python3
"""Deterministically finish Scissor Trail Safari production art.

The nondeterministic GPT Image 2 sources and the exact-count cutter manifests
stay under assets/source/.  This script performs only repeatable work:

* preserve/clean supplied alpha for the character and celebration sources;
* remove the UI sheet's sampled magenta ground;
* isolate the connected title plaque from its low-contrast preview backdrop;
* run the shared cutout finalizer for every transparent asset;
* encode compact runtime WebP/JPEG files and write a processing receipt.

Run from the repository root:
  python games/scissor-trail-safari/tools/process-assets.py
"""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageFilter


ROOT = Path(__file__).resolve().parents[3]
GAME = ROOT / "games" / "scissor-trail-safari"
ASSETS = GAME / "assets"
SOURCE = ASSETS / "source"
GPT = SOURCE / "gpt-image-2"
CROPS = SOURCE / "crops"
LAYERS = SOURCE / "layers"
QA = SOURCE / "qa"
PNG_FINAL = SOURCE / "final-png"
ART = ASSETS / "art"
ANIMALS = ASSETS / "animals"
WORLD = ASSETS / "world"
HUB = ROOT / "assets" / "hub" / "tiles" / "scissor-trail-safari.jpg"
FINALIZER = ROOT / "tools" / "pipeline" / "cutout_finalize.py"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def ensure_dirs() -> None:
    for folder in (LAYERS, QA, PNG_FINAL, ART, ANIMALS, WORLD, HUB.parent):
        folder.mkdir(parents=True, exist_ok=True)


def chroma_matte(source: Path, destination: Path, neutralize_red_shadow: bool = False) -> None:
    """Soft-key the generated UI sheet's magenta while decontaminating edges."""
    image = Image.open(source).convert("RGBA")
    rgba = np.asarray(image, dtype=np.float32)
    rgb = rgba[:, :, :3]
    # Use the median of all four corners; the generator's nominal #ff00ff has
    # tiny compression/render variation, so a literal key is less stable.
    samples = np.concatenate((
        rgb[:16, :16].reshape(-1, 3), rgb[:16, -16:].reshape(-1, 3),
        rgb[-16:, :16].reshape(-1, 3), rgb[-16:, -16:].reshape(-1, 3),
    ))
    key = np.median(samples, axis=0)
    distance = np.linalg.norm(rgb - key, axis=2)
    alpha = np.clip((distance - 14.0) / (72.0 - 14.0), 0.0, 1.0)

    # Recover foreground colour from a simple foreground-over-key model.  This
    # removes the neon rim instead of merely making it translucent.
    safe = np.maximum(alpha[:, :, None], 0.08)
    recovered = (rgb - (1.0 - alpha[:, :, None]) * key) / safe
    recovered = np.clip(recovered, 0, 255)
    # The generator sometimes interprets the chroma ground as a deliberate
    # fuchsia drop-shadow just inside the silhouette. It is fully opaque, so a
    # normal key cannot remove it. Repaint only unmistakably magenta pixels as
    # a warm stacked-cardstock shadow; red scissors/coral accents do not meet
    # the blue-channel gate and remain untouched.
    red, green, blue = recovered[:, :, 0], recovered[:, :, 1], recovered[:, :, 2]
    magenta_shadow = (
        (red > 155) & (blue > 115)
        & (red > green * 1.35) & (blue > green * 1.25)
        & (alpha > 0.08)
    )
    recovered[magenta_shadow] = np.array([104, 67, 42], dtype=np.float32)
    if neutralize_red_shadow:
        red_shadow = (
            (red > 120) & (red > green * 1.35) & (red > blue * 1.08)
            & (alpha > 0.04)
        )
        recovered[red_shadow] = np.array([104, 67, 42], dtype=np.float32)
    recovered[alpha <= 0.01] = 0
    out = np.dstack((recovered, np.round(alpha * 255.0))).astype(np.uint8)
    Image.fromarray(out).save(destination, "PNG", optimize=True)


def connected_title_matte(source: Path, destination: Path) -> None:
    """Extract the one connected title plaque with a reproducible GrabCut matte."""
    original = cv2.imread(str(source), cv2.IMREAD_UNCHANGED)
    if original is None:
        raise FileNotFoundError(source)
    bgr = original[:, :, :3]
    height, width = bgr.shape[:2]
    alpha_in = original[:, :, 3] if original.shape[2] == 4 else np.full((height, width), 255, np.uint8)

    mask = np.full((height, width), cv2.GC_BGD, np.uint8)
    x0, x1 = round(width * 0.045), round(width * 0.965)
    y0, y1 = round(height * 0.075), round(height * 0.91)
    mask[y0:y1, x0:x1] = cv2.GC_PR_FGD
    mask[alpha_in <= 2] = cv2.GC_BGD

    # Cream paper in the central plaque is an unambiguous foreground seed.
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    central = np.zeros_like(mask, dtype=bool)
    central[round(height * .12):round(height * .87), round(width * .12):round(width * .90)] = True
    cream = central & (hsv[:, :, 1] < 105) & (hsv[:, :, 2] > 135)
    mask[cream] = cv2.GC_FGD

    bg_model = np.zeros((1, 65), np.float64)
    fg_model = np.zeros((1, 65), np.float64)
    cv2.grabCut(bgr, mask, None, bg_model, fg_model, 9, cv2.GC_INIT_WITH_MASK)
    binary = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)

    # Keep the largest connected component.  The art brief intentionally made
    # the plaque, scissors, and leaves touch so this removes stray backdrop.
    count, labels, stats, _ = cv2.connectedComponentsWithStats(binary, 8)
    if count < 2:
        raise RuntimeError("title segmentation produced no foreground")
    largest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    binary = np.where(labels == largest, 255, 0).astype(np.uint8)
    binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    matte = Image.fromarray(binary).filter(ImageFilter.GaussianBlur(0.8))

    rgba = Image.open(source).convert("RGBA")
    rgba.putalpha(matte)
    rgba.save(destination, "PNG", optimize=True)


def preserve_alpha(source: Path, destination: Path) -> None:
    image = Image.open(source).convert("RGBA")
    # Built-in image generation deliberately leaves almost every subject pixel
    # at alpha 254 instead of 255.  Treat its solid core as solid while keeping
    # the genuine antialiased edge band; otherwise the shared QA correctly
    # interprets the entire character as a near-blank partial matte.
    alpha = image.getchannel("A").point(
        lambda value: 0 if value <= 12 else (255 if value >= 224 else value),
    )
    image.putalpha(alpha)
    image.save(destination, "PNG", optimize=True)


def finalize(name: str, source: Path, max_size: int) -> tuple[Path, dict]:
    final_png = PNG_FINAL / f"{name}.png"
    magenta = QA / f"{name}-magenta.png"
    command = [
        sys.executable, str(FINALIZER), "--input", str(source),
        "--output", str(final_png), "--magenta", str(magenta),
        "--max-size", str(max_size), "--pad", "12", "--alpha-floor", "4",
    ]
    run = subprocess.run(command, capture_output=True, text=True, check=False)
    try:
        result = json.loads(run.stdout.strip())
    except json.JSONDecodeError as exc:
        raise RuntimeError(run.stderr.strip() or run.stdout.strip()) from exc
    if run.returncode or not result.get("pass"):
        raise RuntimeError(f"cutout QA failed for {name}: {result}")
    return final_png, result


def encode_webp(source: Path, destination: Path, quality: int = 88) -> None:
    image = Image.open(source)
    destination.parent.mkdir(parents=True, exist_ok=True)
    image.save(destination, "WEBP", quality=quality, method=6, exact=True)


def cover_resize(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    target_w, target_h = size
    scale = max(target_w / image.width, target_h / image.height)
    resized = image.resize((round(image.width * scale), round(image.height * scale)), Image.Resampling.LANCZOS)
    left = max(0, (resized.width - target_w) // 2)
    top = max(0, (resized.height - target_h) // 2)
    return resized.crop((left, top, left + target_w, top + target_h))


def main() -> None:
    ensure_dirs()
    receipt: dict[str, object] = {
        "format": "qlobe-asset-processing-v1",
        "game": "scissor-trail-safari",
        "cutoutFinalizer": str(FINALIZER.relative_to(ROOT)).replace("\\", "/"),
        "assets": {},
    }

    animal_names = ("lion", "zebra", "giraffe", "elephant", "parrot", "snake", "monkey", "tiger")
    for name in animal_names:
        group = "animals-a" if name in animal_names[:4] else "animals-b"
        crop = CROPS / group / f"{name}.png"
        layer = LAYERS / f"{name}.png"
        preserve_alpha(crop, layer)
        final_png, qa = finalize(name, layer, 600)
        runtime = ANIMALS / f"{name}.webp"
        encode_webp(final_png, runtime, 90)
        receipt["assets"][f"animals/{name}.webp"] = {
            "source": str(crop.relative_to(GAME)).replace("\\", "/"),
            "sourceSha256": sha256(crop), "qa": qa,
            "outputBytes": runtime.stat().st_size,
        }

    ui_names = ("card-straight", "card-curvy", "card-spiral", "scissor-medallion", "star-medallion", "button-plaque")
    for name in ui_names:
        crop = CROPS / "ui-kit" / f"{name}.png"
        layer = LAYERS / f"{name}.png"
        chroma_matte(
            crop,
            layer,
            neutralize_red_shadow=name.startswith("card-") or name == "button-plaque",
        )
        target = 720 if name.startswith("card-") else 520
        final_png, qa = finalize(name, layer, target)
        runtime = ART / f"{name}.webp"
        encode_webp(final_png, runtime, 90)
        receipt["assets"][f"art/{name}.webp"] = {
            "source": str(crop.relative_to(GAME)).replace("\\", "/"),
            "sourceSha256": sha256(crop), "qa": qa,
            "outputBytes": runtime.stat().st_size,
        }

    title_layer = LAYERS / "title-lockup.png"
    connected_title_matte(GPT / "title-lockup-source.png", title_layer)
    title_png, title_qa = finalize("title-lockup", title_layer, 980)
    title_runtime = ART / "title-lockup.webp"
    encode_webp(title_png, title_runtime, 91)
    receipt["assets"]["art/title-lockup.webp"] = {
        "source": "assets/source/gpt-image-2/title-lockup-source.png",
        "sourceSha256": sha256(GPT / "title-lockup-source.png"), "qa": title_qa,
        "outputBytes": title_runtime.stat().st_size,
        "processing": "OpenCV GrabCut with connected-component gate; shared cutout finalizer",
    }

    success_layer = LAYERS / "success-tableau.png"
    preserve_alpha(GPT / "success-tableau-source.png", success_layer)
    success_png, success_qa = finalize("success-tableau", success_layer, 920)
    success_runtime = ART / "success-tableau.webp"
    encode_webp(success_png, success_runtime, 90)
    receipt["assets"]["art/success-tableau.webp"] = {
        "source": "assets/source/gpt-image-2/success-tableau-source.png",
        "sourceSha256": sha256(GPT / "success-tableau-source.png"), "qa": success_qa,
        "outputBytes": success_runtime.stat().st_size,
    }

    playfield_layer = LAYERS / "playfield-frame.png"
    preserve_alpha(GPT / "playfield-frame-source.png", playfield_layer)
    playfield_png, playfield_qa = finalize("playfield-frame", playfield_layer, 1000)
    playfield_runtime = ART / "playfield-frame.webp"
    encode_webp(playfield_png, playfield_runtime, 90)
    receipt["assets"]["art/playfield-frame.webp"] = {
        "source": "assets/source/gpt-image-2/playfield-frame-source.png",
        "sourceSha256": sha256(GPT / "playfield-frame-source.png"), "qa": playfield_qa,
        "outputBytes": playfield_runtime.stat().st_size,
    }

    background = cover_resize(Image.open(GPT / "jungle-background.png").convert("RGB"), (1344, 1008))
    background_path = WORLD / "papercraft-jungle.webp"
    background.save(background_path, "WEBP", quality=84, method=6)
    receipt["assets"]["world/papercraft-jungle.webp"] = {
        "source": "assets/source/gpt-image-2/jungle-background.png",
        "sourceSha256": sha256(GPT / "jungle-background.png"),
        "outputBytes": background_path.stat().st_size,
        "size": list(background.size),
    }

    hub = cover_resize(Image.open(GPT / "hub-tile-source.png").convert("RGB"), (640, 533))
    hub.save(HUB, "JPEG", quality=88, optimize=True, progressive=True)
    receipt["assets"]["../../../assets/hub/tiles/scissor-trail-safari.jpg"] = {
        "source": "assets/source/gpt-image-2/hub-tile-source.png",
        "sourceSha256": sha256(GPT / "hub-tile-source.png"),
        "outputBytes": HUB.stat().st_size, "size": list(hub.size),
    }

    receipt_path = SOURCE / "processing.json"
    receipt_path.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "processed": len(receipt["assets"]),
        "receipt": str(receipt_path.relative_to(ROOT)).replace("\\", "/"),
    }))


if __name__ == "__main__":
    main()
