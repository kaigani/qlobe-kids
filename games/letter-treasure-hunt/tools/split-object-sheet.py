#!/usr/bin/env python3
"""Split a three-object chroma-key sheet into centered transparent WebP files."""

from __future__ import annotations

import argparse
import colorsys
import sys
from pathlib import Path

from PIL import Image


def parse_color(value: str) -> tuple[int, int, int]:
    value = value.strip().lstrip("#")
    if len(value) != 6:
        raise argparse.ArgumentTypeError("key color must be RRGGBB or #RRGGBB")
    try:
        return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]
    except ValueError as exc:
        raise argparse.ArgumentTypeError("key color must be hexadecimal") from exc


def remove_chroma(image: Image.Image, key: tuple[int, int, int], tolerance: float, cleanup: float,
                  hue_tolerance: float = 0.04, min_saturation: float = 0.18) -> Image.Image:
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    kr, kg, kb = key
    key_hue, _, _ = colorsys.rgb_to_hsv(kr / 255, kg / 255, kb / 255)
    soft = max(0.0, cleanup)
    for y in range(rgba.height):
        for x in range(rgba.width):
            r, g, b, a = pixels[x, y]
            distance = ((r - kr) ** 2 + (g - kg) ** 2 + (b - kb) ** 2) ** 0.5
            hue, saturation, value = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            hue_delta = abs(hue - key_hue)
            hue_delta = min(hue_delta, 1.0 - hue_delta)
            # Hue/chroma matte handles unevenly lit key fields better than RGB distance.
            # A small RGB fallback catches near-gray pixels immediately around the key.
            keyed = saturation >= min_saturation and hue_delta <= hue_tolerance
            keyed = keyed or distance <= tolerance
            if keyed:
                pixels[x, y] = (r, g, b, 0)
            elif soft and saturation >= min_saturation and hue_delta < hue_tolerance + soft / 360.0:
                factor = (hue_delta - hue_tolerance) / (soft / 360.0)
                pixels[x, y] = (r, g, b, round(a * factor))
    return rgba


def component_layers(image: Image.Image, min_area: int) -> list[Image.Image]:
    """Group foreground components around the three dominant left-to-right objects."""
    alpha = image.getchannel("A")
    width, height = alpha.size
    alpha_bytes = alpha.tobytes()
    parents: list[int] = []
    ranks: list[int] = []
    runs: list[tuple[int, int, int, int]] = []

    def make_label() -> int:
        label = len(parents)
        parents.append(label)
        ranks.append(0)
        return label

    def find(label: int) -> int:
        while parents[label] != label:
            parents[label] = parents[parents[label]]
            label = parents[label]
        return label

    def union(a: int, b: int) -> int:
        a, b = find(a), find(b)
        if a == b:
            return a
        if ranks[a] < ranks[b]:
            a, b = b, a
        parents[b] = a
        if ranks[a] == ranks[b]:
            ranks[a] += 1
        return a

    previous: list[tuple[int, int, int]] = []
    for y in range(height):
        row_start = y * width
        spans: list[tuple[int, int]] = []
        x = 0
        while x < width:
            while x < width and alpha_bytes[row_start + x] <= 8:
                x += 1
            start = x
            while x < width and alpha_bytes[row_start + x] > 8:
                x += 1
            if start < x:
                spans.append((start, x))

        current: list[tuple[int, int, int]] = []
        previous_index = 0
        for start, end in spans:
            while previous_index < len(previous) and previous[previous_index][1] < start - 1:
                previous_index += 1
            overlapping: list[int] = []
            scan = previous_index
            while scan < len(previous) and previous[scan][0] <= end:
                p_start, p_end, p_label = previous[scan]
                if p_end >= start - 1:
                    overlapping.append(p_label)
                scan += 1
            label = make_label() if not overlapping else find(overlapping[0])
            for other in overlapping[1:]:
                label = union(label, other)
            current.append((start, end, label))
            runs.append((y, start, end, label))
        previous = current

    components: dict[int, dict[str, int]] = {}
    rooted_runs: list[tuple[int, int, int, int]] = []
    for y, start, end, label in runs:
        root = find(label)
        rooted_runs.append((y, start, end, root))
        area = end - start
        component = components.setdefault(root, {
            "area": 0, "left": width, "top": height, "right": 0, "bottom": 0, "sum_x": 0,
        })
        component["area"] += area
        component["left"] = min(component["left"], start)
        component["top"] = min(component["top"], y)
        component["right"] = max(component["right"], end)
        component["bottom"] = max(component["bottom"], y + 1)
        component["sum_x"] += (start + end - 1) * area // 2

    retained = [(root, data) for root, data in components.items() if data["area"] >= min_area]
    if len(retained) < 3:
        raise ValueError(f"found only {len(retained)} foreground components at minimum area {min_area}")
    seeds = sorted(sorted(retained, key=lambda item: item[1]["area"], reverse=True)[:3],
                   key=lambda item: item[1]["sum_x"] / item[1]["area"])
    if any((seeds[index + 1][1]["sum_x"] / seeds[index + 1][1]["area"])
           - (seeds[index][1]["sum_x"] / seeds[index][1]["area"]) < 100 for index in range(2)):
        raise ValueError("dominant foreground components are not separated into three objects")

    assignments: dict[int, int] = {root: index for index, (root, _) in enumerate(seeds)}
    for root, component in retained:
        if root in assignments:
            continue
        overlapping: list[int] = []
        for index, (_, seed) in enumerate(seeds):
            if (component["right"] >= seed["left"] - 24 and component["left"] <= seed["right"] + 24
                    and component["bottom"] >= seed["top"] - 24 and component["top"] <= seed["bottom"] + 24):
                overlapping.append(index)
        if len(overlapping) == 1:
            assignments[root] = overlapping[0]
        else:
            center_x = component["sum_x"] / component["area"]
            assignments[root] = min(range(3), key=lambda index: abs(
                center_x - seeds[index][1]["sum_x"] / seeds[index][1]["area"]))

    masks = [Image.new("L", (width, height)) for _ in range(3)]
    mask_pixels = [mask.load() for mask in masks]
    for y, start, end, root in rooted_runs:
        group = assignments.get(root)
        if group is not None:
            for x in range(start, end):
                mask_pixels[group][x, y] = 255
    transparent = Image.new("RGBA", image.size)
    return [Image.composite(image, transparent, mask) for mask in masks]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("sheet", type=Path, help="raster sheet containing three left-to-right objects")
    parser.add_argument("outputs", nargs=3, type=Path, metavar=("OUT1", "OUT2", "OUT3"), help="three WebP output paths")
    parser.add_argument("--key-color", type=parse_color, default=(0, 255, 0), help="chroma RGB color (default: 00ff00)")
    parser.add_argument("--tolerance", type=float, default=40.0, help="distance from key treated as transparent")
    parser.add_argument("--edge-cleanup", type=float, default=8.0, help="soft antialias band beyond tolerance")
    parser.add_argument("--hue-tolerance", type=float, default=0.04, help="key hue radius (0..0.5)")
    parser.add_argument("--min-saturation", type=float, default=0.18, help="minimum saturation for hue matte")
    parser.add_argument("--padding", type=int, default=8, help="transparent pixels around trimmed object")
    parser.add_argument("--size", type=int, help="square canvas size (default: largest object + padding)")
    parser.add_argument("--force", action="store_true", help="allow replacing existing outputs")
    parser.add_argument("--min-component-area", type=int, default=64, help="discard chroma remnants below this pixel area")
    args = parser.parse_args()
    if args.tolerance < 0 or args.edge_cleanup < 0 or args.padding < 0 or args.min_component_area < 1 or not 0 <= args.hue_tolerance <= 0.5 or not 0 <= args.min_saturation <= 1:
        parser.error("invalid tolerance, cleanup, padding, hue-tolerance, or min-saturation")
    if not args.sheet.is_file():
        parser.error(f"input sheet not found: {args.sheet}")
    if any(path.exists() for path in args.outputs) and not args.force:
        parser.error("output exists; pass --force to replace it")
    try:
        sheet = Image.open(args.sheet)
        if sheet.width < 3:
            raise ValueError("sheet is too narrow")
        full_keyed = remove_chroma(sheet, args.key_color, args.tolerance, args.edge_cleanup, args.hue_tolerance, args.min_saturation)
        keyed = component_layers(full_keyed, args.min_component_area)
        boxes = [p.getchannel("A").getbbox() for p in keyed]
        if any(box is None for box in boxes):
            raise ValueError("one object contains no non-background pixels")
        max_dim = max(max(box[2] - box[0], box[3] - box[1]) + 2 * args.padding for box in boxes if box)
        canvas_size = args.size or max_dim
        if canvas_size <= 0:
            raise ValueError("canvas size must be positive")
        for out, piece in zip(args.outputs, keyed):
            out.parent.mkdir(parents=True, exist_ok=True)
            # Piece is already keyed; process trimming/centering without reapplying matte.
            bbox = piece.getchannel("A").getbbox()
            if bbox is None: raise ValueError("one segment contains no foreground")
            cropped = piece.crop(bbox)
            if args.padding:
                p = Image.new("RGBA", (cropped.width + 2*args.padding, cropped.height + 2*args.padding)); p.alpha_composite(cropped, (args.padding,args.padding)); cropped = p
            canvas = Image.new("RGBA", (canvas_size, canvas_size)); canvas.alpha_composite(cropped, ((canvas_size-cropped.width)//2, (canvas_size-cropped.height)//2))
            canvas.save(out, "WEBP", lossless=True, method=6)
    except (OSError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
