#!/usr/bin/env python3
"""Deterministically remove authoring mattes from Puzzle Explorer UI rasters."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
SOURCE = ASSETS / "source"


def trim_and_pad(image: Image.Image, pad: int = 12) -> Image.Image:
    rgba = image.convert("RGBA")
    box = rgba.getchannel("A").getbbox()
    if box:
        rgba = rgba.crop(box)
    canvas = Image.new("RGBA", (rgba.width + pad * 2, rgba.height + pad * 2), (0, 0, 0, 0))
    canvas.alpha_composite(rgba, (pad, pad))
    return canvas


def save_webp(image: Image.Image, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_name(f".{target.name}.tmp")
    image.save(temporary, "WEBP", lossless=True, method=6)
    temporary.replace(target)


def alpha_prompt() -> tuple[Image.Image, dict]:
    source_path = ASSETS / "ui" / "prompt-ribbon.webp"
    with Image.open(source_path) as source:
        rgba = source.convert("RGBA")
    # The retained ribbon is warm cream/brown; its retired screen matte is blue.
    # A short warm-minus-blue ramp preserves antialiased paper edges while making
    # every cool matte pixel transparent.
    mask = Image.new("L", rgba.size)
    values = []
    pixels = rgba.get_flattened_data() if hasattr(rgba, "get_flattened_data") else rgba.getdata()
    for red, _green, blue, _alpha in pixels:
        score = red - blue
        values.append(max(0, min(255, round((score + 8) * 255 / 28))))
    mask.putdata(values)
    mask = mask.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(0.65))
    mask = mask.point(lambda alpha: 0 if alpha < 12 else alpha)
    rgba.putalpha(mask)
    result = trim_and_pad(rgba, 10)
    return result, {
        "source": str(source_path.relative_to(ROOT)),
        "transform": "warm-vs-blue alpha ramp; 3px edge closure; 0.65px feather; alpha trim; 10px pad",
        "size": list(result.size),
    }


def alpha_tray() -> tuple[Image.Image, dict]:
    source_path = SOURCE / "tray-gpt-image-2.png"
    with Image.open(source_path) as source:
        rgba = source.convert("RGBA")
    # Imagegen returned a neutral checker preview rather than an alpha channel.
    # The tray/leaves are saturated, and its real grounding shadow is darker
    # than the two pale neutral checker values. This mask therefore keeps the
    # authored object and shadow without treating the preview grid as artwork.
    mask = Image.new("L", rgba.size)
    values = []
    pixels = list(rgba.get_flattened_data() if hasattr(rgba, "get_flattened_data") else rgba.getdata())
    for red, green, blue, _alpha in pixels:
        high = max(red, green, blue)
        low = min(red, green, blue)
        saturation = high - low
        luma = (red * 3 + green * 6 + blue) / 10
        saturated_alpha = max(0, min(255, round((saturation - 12) * 255 / 32)))
        shadow_alpha = max(0, min(165, round((218 - luma) * 165 / 70)))
        values.append(max(saturated_alpha, shadow_alpha))
    mask.putdata(values)
    mask = mask.filter(ImageFilter.MaxFilter(7)).filter(ImageFilter.GaussianBlur(0.9))
    cleaned = []
    for (red, green, blue, _alpha), alpha in zip(pixels, mask.get_flattened_data() if hasattr(mask, "get_flattened_data") else mask.getdata()):
        saturation = max(red, green, blue) - min(red, green, blue)
        luma = (red * 3 + green * 6 + blue) / 10
        if alpha < 24 or (saturation < 14 and luma > 224):
            cleaned.append(0)
        else:
            cleaned.append(alpha)
    mask.putdata(cleaned)
    rgba.putalpha(mask)
    result = trim_and_pad(rgba, 14)
    return result, {
        "source": str(source_path.relative_to(ROOT)),
        "transform": "saturation/dark-shadow matte extraction; 7px closure; 0.9px feather; alpha trim; 14px pad",
        "size": list(result.size),
    }


def main() -> None:
    prompt, prompt_record = alpha_prompt()
    tray, tray_record = alpha_tray()
    prompt_target = ASSETS / "ui" / "prompt-ribbon-alpha.webp"
    tray_target = ASSETS / "ui" / "tray-alpha.webp"
    save_webp(prompt, prompt_target)
    save_webp(tray, tray_target)
    report = {
        "version": 1,
        "outputs": [
            {"path": str(prompt_target.relative_to(ROOT)), **prompt_record},
            {"path": str(tray_target.relative_to(ROOT)), **tray_record},
        ],
    }
    report_path = ASSETS / "jigsaw-finalize-report.json"
    temporary = report_path.with_name(f".{report_path.name}.tmp")
    temporary.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    temporary.replace(report_path)
    print(json.dumps(report, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
