#!/usr/bin/env python3
"""Build centered papercraft assets for Color Gradient Cards.

The generated source art stays immutable under ``assets/source/gpt-image-2``.
This script removes the authored chroma plates with the imagegen skill helper,
normalizes every cutout onto a fixed centered canvas, derives exact-color card
sprites from one neutral paper texture, and writes inspectable QA evidence.
"""

from __future__ import annotations

import argparse
import colorsys
import json
import math
import shutil
import subprocess
import sys
from pathlib import Path
from statistics import median
from typing import Iterable

from PIL import Image, ImageDraw, ImageOps


GAME = Path(__file__).resolve().parents[1]
ASSETS = GAME / "assets"
SOURCE = ASSETS / "source"
GENERATED = SOURCE / "gpt-image-2"
LAYERS = SOURCE / "layers"
FINAL_MASTERS = SOURCE / "final"
QA = SOURCE / "qa"
CONFIG = json.loads((GAME / "config.json").read_text(encoding="utf-8"))

CHROMA_HELPER_CANDIDATES = (
    Path.home() / ".codex/skills/.system/imagegen/scripts/remove_chroma_key.py",
)
ALPHA_FLOOR = 5
MIN_EDGE_MARGIN = 8
MAX_CENTER_OFFSET_RATIO = 0.03
MAX_CARD_CHANNEL_DELTA = 2
MIN_FAMILY_LUMA_GAP = 0.07


CUTOUT_SPECS = {
    "title": {
        "source": "title-keyed-source.png",
        "canvas": (900, 500),
        "output": "title.webp",
    },
    "spectrum-rack": {
        "source": "spectrum-rack-keyed-source.png",
        "canvas": (1200, 500),
        "output": "spectrum-rack.webp",
    },
    "card-tray": {
        "source": "card-tray-keyed-source.png",
        "canvas": (1200, 460),
        "output": "card-tray.webp",
    },
    "mixer-press": {
        "source": "mixer-press-keyed-source.png",
        "canvas": (1200, 640),
        "output": "mixer-press.webp",
    },
    "safari-frame": {
        "source": "safari-frame-keyed-source.png",
        "canvas": (720, 900),
        "output": "safari-frame.webp",
    },
    "reward-ribbon": {
        "source": "reward-ribbon-keyed-source.png",
        "canvas": (900, 420),
        "output": "reward-ribbon.webp",
    },
    "mode-spectrum": {
        "source": "mode-spectrum-keyed-source.png",
        "canvas": (520, 440),
        "output": "ui/mode-spectrum.webp",
    },
    "mode-mixer": {
        "source": "mode-mixer-keyed-source.png",
        "canvas": (520, 440),
        "output": "ui/mode-mixer.webp",
    },
    "mode-safari": {
        "source": "mode-safari-keyed-source.png",
        "canvas": (520, 440),
        "output": "ui/mode-safari.webp",
    },
}

HUD_CONTROL_SPECS = {
    "back": (0, 0, 0.5, 0.5),
    "sound": (0.5, 0, 1, 0.5),
    "home": (0, 0.5, 0.5, 1),
    "play": (0.5, 0.5, 1, 1),
}

SAFARI_RECOLOR = {
    "apple": {"hue": (0.92, 0.08), "min_value": 0.28},
    "sunflower": {"hue": (0.07, 0.19), "min_value": 0.52},
    "leaf": {"hue": (0.18, 0.50), "min_value": 0.18},
    "ocean": {"hue": (0.45, 0.72), "min_value": 0.18},
    "berries": {"hue": (0.66, 0.92), "min_value": 0.20},
}

GOLD_PALETTE = ("#fde59a", "#f3d44b", "#c99428")


def ensure_dirs() -> None:
    for directory in (
        LAYERS,
        FINAL_MASTERS,
        QA,
        ASSETS / "cards",
        ASSETS / "ui",
        ASSETS / "safari",
    ):
        directory.mkdir(parents=True, exist_ok=True)


def find_chroma_helper() -> Path:
    for candidate in CHROMA_HELPER_CANDIDATES:
        if candidate.is_file():
            return candidate
    raise FileNotFoundError(
        "imagegen chroma helper not found; expected remove_chroma_key.py "
        "under ~/.codex/skills/.system/imagegen/scripts"
    )


def extract_chroma(source: Path, output: Path) -> Image.Image:
    """Use the imagegen skill's maintained helper for a soft, despilled matte."""
    if not source.is_file():
        raise FileNotFoundError(source)
    output.parent.mkdir(parents=True, exist_ok=True)
    command = [
        sys.executable,
        str(find_chroma_helper()),
        "--input",
        str(source),
        "--out",
        str(output),
        "--auto-key",
        "border",
        "--soft-matte",
        "--transparent-threshold",
        "12",
        "--opaque-threshold",
        "96",
        "--edge-contract",
        "1",
        "--despill",
        "--force",
    ]
    subprocess.run(command, check=True)
    image = Image.open(output).convert("RGBA")
    alpha = image.getchannel("A").point(lambda value: 0 if value <= ALPHA_FLOOR else value)
    image.putalpha(alpha)
    image.save(output)
    return image


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("image has no visible pixels")
    return bbox


def fit_centered(
    image: Image.Image,
    canvas: tuple[int, int],
    name: str,
    *,
    padding: int | None = None,
) -> tuple[Image.Image, dict]:
    """Trim by alpha, scale safely, and center the visible bbox on a fixed canvas."""
    image = image.convert("RGBA")
    cropped = image.crop(alpha_bbox(image))
    width, height = canvas
    safe_padding = padding if padding is not None else max(18, round(min(canvas) * 0.045))
    available = (width - safe_padding * 2, height - safe_padding * 2)
    if available[0] <= 0 or available[1] <= 0:
        raise ValueError(f"{name}: canvas is smaller than its padding")
    scale = min(available[0] / cropped.width, available[1] / cropped.height)
    size = (max(1, round(cropped.width * scale)), max(1, round(cropped.height * scale)))
    resized = cropped.resize(size, Image.Resampling.LANCZOS)
    resized.putalpha(resized.getchannel("A").point(lambda value: 0 if value <= ALPHA_FLOOR else value))

    normalized = Image.new("RGBA", canvas, (0, 0, 0, 0))
    offset = ((width - resized.width) // 2, (height - resized.height) // 2)
    normalized.alpha_composite(resized, offset)
    metrics = validate_centered(normalized, name)
    metrics.update({"canvas": list(canvas), "content_size": list(size), "safe_padding": safe_padding})
    return normalized, metrics


def validate_centered(image: Image.Image, name: str) -> dict:
    width, height = image.size
    left, top, right, bottom = alpha_bbox(image)
    margins = (left, top, width - right, height - bottom)
    bbox_center = ((left + right) / 2, (top + bottom) / 2)
    offset = (bbox_center[0] - width / 2, bbox_center[1] - height / 2)
    alpha = image.getchannel("A")
    alpha_pixels = alpha.load()
    total = 0
    weighted_x = 0
    weighted_y = 0
    for y in range(top, bottom):
        for x in range(left, right):
            value = alpha_pixels[x, y]
            total += value
            weighted_x += x * value
            weighted_y += y * value
    centroid = (
        weighted_x / total if total else width / 2,
        weighted_y / total if total else height / 2,
    )
    centroid_offset = (centroid[0] - width / 2, centroid[1] - height / 2)
    passed = (
        min(margins) >= MIN_EDGE_MARGIN
        and abs(offset[0]) <= width * MAX_CENTER_OFFSET_RATIO
        and abs(offset[1]) <= height * MAX_CENTER_OFFSET_RATIO
    )
    metrics = {
        "alpha_bbox": [left, top, right, bottom],
        "margins": list(margins),
        "bbox_center_offset": [round(offset[0], 3), round(offset[1], 3)],
        "alpha_centroid_offset": [round(centroid_offset[0], 3), round(centroid_offset[1], 3)],
        "pass": passed,
    }
    if not passed:
        raise ValueError(f"{name}: unsafe or off-center alpha bounds: {metrics}")
    return metrics


def magenta_composite(image: Image.Image) -> Image.Image:
    backdrop = Image.new("RGBA", image.size, (255, 0, 255, 255))
    backdrop.alpha_composite(image.convert("RGBA"))
    return backdrop.convert("RGB")


def save_webp(master: Image.Image, master_path: Path, output_path: Path, *, quality: int = 88) -> None:
    master_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    master.save(master_path, "PNG", optimize=True)
    encoder = shutil.which("cwebp")
    if encoder:
        command = [
            encoder,
            "-quiet",
            "-q",
            str(quality),
            "-alpha_q",
            "100",
            "-m",
            "6",
            "-exact",
            str(master_path),
            "-o",
            str(output_path),
        ]
        subprocess.run(command, check=True)
        return
    master.save(output_path, "WEBP", quality=quality, method=6, exact=True)


def record_output(
    records: dict,
    key: str,
    source: Path | str,
    master: Image.Image,
    master_path: Path,
    output_path: Path,
    metrics: dict,
    **extra,
) -> None:
    records[key] = {
        "source": str(source.relative_to(GAME)) if isinstance(source, Path) else source,
        "master": str(master_path.relative_to(GAME)),
        "output": str(output_path.relative_to(GAME)),
        "dimensions": list(master.size),
        "bytes": output_path.stat().st_size,
        **metrics,
        **extra,
    }


def hue_in_range(hue: float, bounds: tuple[float, float]) -> bool:
    start, end = bounds
    if start <= end:
        return start <= hue <= end
    return hue >= start or hue <= end


def recolor_object(image: Image.Image, target_hex: str, settings: dict) -> tuple[Image.Image, dict]:
    """Shift only the object's family-colored paper toward the exact target hue.

    Value and saturation deviations remain, preserving fibers, highlights, and
    layer shadows. Neutral paper, brown stems/centers, and unrelated accent
    colors are deliberately untouched.
    """
    target = tuple(bytes.fromhex(target_hex.removeprefix("#")))
    target_h, target_s, target_v = colorsys.rgb_to_hsv(*(channel / 255 for channel in target))
    pixels = image.load()
    samples: list[tuple[float, float]] = []
    for y in range(image.height):
        for x in range(image.width):
            red, green, blue, alpha = pixels[x, y]
            if alpha <= ALPHA_FLOOR:
                continue
            hue, saturation, value = colorsys.rgb_to_hsv(red / 255, green / 255, blue / 255)
            if saturation >= 0.22 and value >= settings["min_value"] and hue_in_range(hue, settings["hue"]):
                samples.append((saturation, value))
    if not samples:
        raise ValueError(f"no family-color pixels found for target {target_hex}")
    source_s = median(sample[0] for sample in samples)
    source_v = median(sample[1] for sample in samples)
    changed = 0
    for y in range(image.height):
        for x in range(image.width):
            red, green, blue, alpha = pixels[x, y]
            if alpha <= ALPHA_FLOOR:
                continue
            hue, saturation, value = colorsys.rgb_to_hsv(red / 255, green / 255, blue / 255)
            if saturation < 0.22 or value < settings["min_value"] or not hue_in_range(hue, settings["hue"]):
                continue
            out_s = max(0, min(1, target_s + (saturation - source_s) * 0.32))
            ratio = value / max(source_v, 0.01)
            out_v = max(0, min(1, target_v * ratio))
            out_rgb = colorsys.hsv_to_rgb(target_h, out_s, out_v)
            pixels[x, y] = tuple(round(channel * 255) for channel in out_rgb) + (alpha,)
            changed += 1
    return image, {
        "target_hex": target_hex,
        "recolored_pixels": changed,
        "source_median_saturation": round(source_s, 4),
        "source_median_value": round(source_v, 4),
    }


def paper_card(neutral: Image.Image, target_hex: str) -> Image.Image:
    """Color the shared neutral paper while keeping its authored fiber relief."""
    target = tuple(bytes.fromhex(target_hex.removeprefix("#")))
    base = neutral.convert("RGBA")
    alpha = base.getchannel("A")
    luminance = ImageOps.grayscale(base.convert("RGB"))
    luminance_data = luminance.get_flattened_data() if hasattr(luminance, "get_flattened_data") else luminance.getdata()
    alpha_data = alpha.get_flattened_data() if hasattr(alpha, "get_flattened_data") else alpha.getdata()
    values = [
        value
        for value, opacity in zip(luminance_data, alpha_data)
        if opacity >= 220
    ]
    pivot = median(values) if values else 220
    output = Image.new("RGBA", base.size, (0, 0, 0, 0))
    source_pixels = base.load()
    out_pixels = output.load()
    for y in range(base.height):
        for x in range(base.width):
            red, green, blue, opacity = source_pixels[x, y]
            if opacity <= ALPHA_FLOOR:
                continue
            light = (red * 0.2126 + green * 0.7152 + blue * 0.0722)
            detail = max(-1.0, min(1.0, (light - pivot) / 70.0))
            channels = []
            for channel in target:
                if detail >= 0:
                    value = channel + (255 - channel) * detail * 0.10
                else:
                    value = channel * (1 + detail * 0.15)
                channels.append(round(max(0, min(255, value))))
            out_pixels[x, y] = tuple(channels) + (opacity,)
    return output


def encoded_color_metrics(path: Path, target_hex: str) -> dict:
    """Prove the shipped lossy sprite still carries its declared exact color."""
    encoded = Image.open(path).convert("RGBA")
    data = encoded.get_flattened_data() if hasattr(encoded, "get_flattened_data") else encoded.getdata()
    opaque = [(red, green, blue) for red, green, blue, alpha in data if alpha >= 250]
    if not opaque:
        raise ValueError(f"{path.name}: encoded card has no opaque pixels")
    median_rgb = tuple(round(median(pixel[channel] for pixel in opaque)) for channel in range(3))
    target_rgb = tuple(bytes.fromhex(target_hex.removeprefix("#")))
    delta = tuple(median_rgb[channel] - target_rgb[channel] for channel in range(3))
    passed = max(map(abs, delta)) <= MAX_CARD_CHANNEL_DELTA
    if not passed:
        raise ValueError(
            f"{path.name}: encoded median {median_rgb} drifted from {target_hex} by {delta}"
        )
    return {
        "encoded_median_rgb": list(median_rgb),
        "encoded_channel_delta": list(delta),
        "color_pass": True,
    }


def family_lightness_report() -> dict:
    report = {}
    for family_id, family in CONFIG["families"].items():
        luma = []
        for entry in family["palette"]:
            red, green, blue = (channel / 255 for channel in bytes.fromhex(entry["hex"].removeprefix("#")))
            luma.append(red * 0.2126 + green * 0.7152 + blue * 0.0722)
        gaps = [luma[index] - luma[index + 1] for index in range(len(luma) - 1)]
        passed = family_id == "rainbow" or all(gap >= MIN_FAMILY_LUMA_GAP for gap in gaps)
        report[family_id] = {
            "luma": [round(value, 4) for value in luma],
            "adjacent_descending_gaps": [round(value, 4) for value in gaps],
            "rule": "named hue path" if family_id == "rainbow" else f"descending by >= {MIN_FAMILY_LUMA_GAP}",
            "pass": passed,
        }
        if not passed:
            raise ValueError(f"{family_id}: insufficient light-to-dark separation: {gaps}")
    return report


def build_card(
    records: dict,
    neutral: Image.Image,
    name: str,
    target_hex: str,
    source_label: str,
) -> Image.Image:
    card = paper_card(neutral, target_hex)
    metrics = validate_centered(card, name)
    master_path = FINAL_MASTERS / "cards" / f"{name}.png"
    output_path = ASSETS / "cards" / f"{name}.webp"
    save_webp(card, master_path, output_path)
    color_metrics = encoded_color_metrics(output_path, target_hex)
    record_output(
        records,
        f"cards/{name}",
        source_label,
        card,
        master_path,
        output_path,
        metrics,
        target_hex=target_hex,
        **color_metrics,
    )
    return card


def build_family_preview(cards: list[Image.Image], name: str) -> Image.Image:
    canvas = Image.new("RGBA", (520, 360), (0, 0, 0, 0))
    angles = (-9, -4, 0, 4, 9)
    x_positions = (50, 123, 196, 269, 342)
    for card, angle, x in zip(cards, angles, x_positions):
        scaled = card.resize((128, 170), Image.Resampling.LANCZOS)
        rotated = scaled.rotate(angle, Image.Resampling.BICUBIC, expand=True)
        canvas.alpha_composite(rotated, (x, 92 + round(abs(angle) * 0.8)))
    normalized, _ = fit_centered(canvas, canvas.size, f"family-{name}", padding=24)
    return normalized


def build_contact_sheet(items: Iterable[tuple[str, Image.Image]]) -> None:
    items = list(items)
    columns = 4
    tile = (280, 230)
    rows = max(1, math.ceil(len(items) / columns))
    sheet = Image.new("RGB", (columns * tile[0], rows * tile[1]), (249, 242, 222))
    draw = ImageDraw.Draw(sheet)
    for index, (name, image) in enumerate(items):
        x = (index % columns) * tile[0]
        y = (index // columns) * tile[1]
        preview = image.convert("RGBA")
        preview.thumbnail((tile[0] - 28, tile[1] - 50), Image.Resampling.LANCZOS)
        qa_tile = Image.new("RGBA", (tile[0] - 16, tile[1] - 36), (255, 0, 255, 255))
        qa_tile.alpha_composite(
            preview,
            ((qa_tile.width - preview.width) // 2, (qa_tile.height - preview.height) // 2),
        )
        sheet.paste(qa_tile.convert("RGB"), (x + 8, y + 26))
        draw.text((x + 9, y + 7), name[:42], fill=(36, 43, 58))
    sheet.save(QA / "contact-sheet.jpg", "JPEG", quality=90, optimize=True)


def process_cutouts(records: dict, contact_items: list[tuple[str, Image.Image]]) -> None:
    for name, spec in CUTOUT_SPECS.items():
        source_path = GENERATED / spec["source"]
        layer_path = LAYERS / f"{name}-alpha.png"
        extracted = extract_chroma(source_path, layer_path)
        normalized, metrics = fit_centered(extracted, spec["canvas"], name)
        master_path = FINAL_MASTERS / f"{name}.png"
        output_path = ASSETS / spec["output"]
        save_webp(normalized, master_path, output_path)
        magenta_composite(normalized).save(QA / f"{name}-magenta.png")
        record_output(records, name, source_path, normalized, master_path, output_path, metrics)
        contact_items.append((name, normalized))


def process_hud_controls(records: dict, contact_items: list[tuple[str, Image.Image]]) -> None:
    source_path = GENERATED / "hud-controls-source.png"
    cleaned_path = LAYERS / "hud-controls-clean.png"
    command = [
        sys.executable,
        str(find_chroma_helper()),
        "--input", str(source_path),
        "--out", str(cleaned_path),
        "--key-color", "#00ff00",
        "--soft-matte",
        "--transparent-threshold", "12",
        "--opaque-threshold", "96",
        "--despill",
        "--force",
    ]
    subprocess.run(command, check=True)
    sheet = Image.open(cleaned_path).convert("RGBA")
    width, height = sheet.size
    for name, bounds in HUD_CONTROL_SPECS.items():
        left, top, right, bottom = bounds
        quadrant = sheet.crop((round(left * width), round(top * height), round(right * width), round(bottom * height)))
        quadrant.putalpha(quadrant.getchannel("A").point(lambda value: 0 if value <= ALPHA_FLOOR else value))
        normalized, metrics = fit_centered(quadrant, (256, 256), f"ui/btn-{name}", padding=16)
        master_path = FINAL_MASTERS / "ui" / f"btn-{name}.png"
        output_path = ASSETS / "ui" / f"btn-{name}.webp"
        save_webp(normalized, master_path, output_path, quality=90)
        magenta_composite(normalized).save(QA / f"btn-{name}-magenta.png")
        record_output(
            records,
            f"ui/btn-{name}",
            f"assets/source/gpt-image-2/hud-controls-source.png#{name}-quadrant",
            normalized,
            master_path,
            output_path,
            metrics,
        )
        contact_items.append((f"ui/btn-{name}", normalized))


def process_safari(records: dict, contact_items: list[tuple[str, Image.Image]]) -> None:
    for item in CONFIG["safari"]["objects"]:
        name = item["id"]
        source_path = GENERATED / f"safari-{name}-keyed-source.png"
        layer_path = LAYERS / f"safari-{name}-alpha.png"
        extracted = extract_chroma(source_path, layer_path)
        recolored, color_metrics = recolor_object(extracted, item["target"], SAFARI_RECOLOR[name])
        normalized, metrics = fit_centered(recolored, (480, 480), f"safari-{name}")
        master_path = FINAL_MASTERS / "safari" / f"{name}.png"
        output_path = ASSETS / "safari" / f"{name}.webp"
        save_webp(normalized, master_path, output_path)
        magenta_composite(normalized).save(QA / f"safari-{name}-magenta.png")
        record_output(
            records,
            f"safari/{name}",
            source_path,
            normalized,
            master_path,
            output_path,
            metrics,
            **color_metrics,
        )
        contact_items.append((f"safari/{name}", normalized))


def process_backdrop(records: dict, contact_items: list[tuple[str, Image.Image]]) -> None:
    source_path = GENERATED / "atelier-backdrop-source.png"
    backdrop = Image.open(source_path).convert("RGB")
    backdrop = ImageOps.fit(backdrop, (1600, 1200), Image.Resampling.LANCZOS, centering=(0.5, 0.5))
    master_path = FINAL_MASTERS / "atelier-backdrop.png"
    output_path = ASSETS / "atelier-backdrop.webp"
    save_webp(backdrop, master_path, output_path, quality=84)
    records["atelier-backdrop"] = {
        "source": str(source_path.relative_to(GAME)),
        "master": str(master_path.relative_to(GAME)),
        "output": str(output_path.relative_to(GAME)),
        "dimensions": list(backdrop.size),
        "bytes": output_path.stat().st_size,
        "opaque": True,
        "pass": True,
    }
    contact_items.append(("atelier-backdrop", backdrop))


def process_cards(records: dict, contact_items: list[tuple[str, Image.Image]]) -> None:
    neutral_source = GENERATED / "card-neutral-keyed-source.png"
    neutral_layer = extract_chroma(neutral_source, LAYERS / "card-neutral-alpha.png")
    neutral, neutral_metrics = fit_centered(neutral_layer, (256, 340), "card-neutral", padding=12)
    neutral_master = FINAL_MASTERS / "card-neutral.png"
    neutral.save(neutral_master, "PNG", optimize=True)
    magenta_composite(neutral).save(QA / "card-neutral-magenta.png")
    records["source/card-neutral"] = {
        "source": str(neutral_source.relative_to(GAME)),
        "master": str(neutral_master.relative_to(GAME)),
        "dimensions": list(neutral.size),
        **neutral_metrics,
    }

    for family_id, family in CONFIG["families"].items():
        cards: list[Image.Image] = []
        for index, entry in enumerate(family["palette"], start=1):
            cards.append(
                build_card(
                    records,
                    neutral,
                    f"{family_id}-{index}",
                    entry["hex"],
                    "deterministic recolor of assets/source/final/card-neutral.png",
                )
            )
        preview = build_family_preview(cards, family_id)
        preview_metrics = validate_centered(preview, f"family-{family_id}")
        master_path = FINAL_MASTERS / "ui" / f"family-{family_id}.png"
        output_path = ASSETS / "ui" / f"family-{family_id}.webp"
        save_webp(preview, master_path, output_path)
        record_output(
            records,
            f"ui/family-{family_id}",
            "raster composite of the five final family cards",
            preview,
            master_path,
            output_path,
            preview_metrics,
        )
        contact_items.append((f"family/{family_id}", preview))

    for index, target_hex in enumerate(GOLD_PALETTE, start=1):
        build_card(
            records,
            neutral,
            f"gold-{index}",
            target_hex,
            "deterministic recolor of assets/source/final/card-neutral.png",
        )

    for bridge in CONFIG["mixer"]["bridges"]:
        for index, target_hex in enumerate(bridge["palette"], start=1):
            build_card(
                records,
                neutral,
                f"mix-{bridge['id']}-{index}",
                target_hex,
                "deterministic recolor of assets/source/final/card-neutral.png",
            )

    sample_names = ("reds-1", "reds-3", "reds-5", "blues-3", "greens-3", "purples-3", "rainbow-3")
    for name in sample_names:
        contact_items.append((f"card/{name}", Image.open(ASSETS / "cards" / f"{name}.webp").convert("RGBA")))


def main() -> None:
    argparse.ArgumentParser(description=__doc__).parse_args()
    ensure_dirs()
    records: dict[str, dict] = {}
    contact_items: list[tuple[str, Image.Image]] = []
    process_backdrop(records, contact_items)
    process_cutouts(records, contact_items)
    process_hud_controls(records, contact_items)
    process_safari(records, contact_items)
    process_cards(records, contact_items)
    build_contact_sheet(contact_items)
    report = {
        "generator": "OpenAI gpt-image-2 source art plus deterministic Pillow/cwebp finalization",
        "chroma_helper": "~/.codex/skills/.system/imagegen/scripts/remove_chroma_key.py",
        "policy": {
            "alpha_floor": ALPHA_FLOOR,
            "minimum_edge_margin_px": MIN_EDGE_MARGIN,
            "maximum_bbox_center_offset_ratio": MAX_CENTER_OFFSET_RATIO,
            "webp_quality": 88,
            "webp_alpha_quality": 100,
            "maximum_encoded_card_channel_delta": MAX_CARD_CHANNEL_DELTA,
            "minimum_family_luma_gap": MIN_FAMILY_LUMA_GAP,
        },
        "family_lightness": family_lightness_report(),
        "outputs": records,
    }
    (SOURCE / "processing.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    failures = [name for name, record in records.items() if record.get("pass") is False]
    if failures:
        raise SystemExit(f"asset QA failed: {', '.join(failures)}")
    print(f"built {len(records)} validated outputs; QA: {QA / 'contact-sheet.jpg'}")


if __name__ == "__main__":
    main()
