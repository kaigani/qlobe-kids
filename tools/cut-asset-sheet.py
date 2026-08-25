#!/usr/bin/env python3
"""Detect separated assets on a plain sheet and crop their bounding boxes.

The source pixels are copied verbatim. This tool detects crop coordinates; it
does not attempt to manufacture transparency or redraw soft edges.

Typical use:
    python3 tools/cut-asset-sheet.py sheet.png assets/source/crops \
      --names rabbit squirrel turtle fox duck bear --expected-count 6

Pillow is the only non-stdlib dependency (``python3 -m pip install pillow``).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from collections import deque
from pathlib import Path
from statistics import median

try:
    from PIL import Image, ImageFilter
except ImportError as exc:  # Keep --help and a useful error available without Pillow.
    Image = None  # type: ignore[assignment]
    ImageFilter = None  # type: ignore[assignment]
    PIL_IMPORT_ERROR = exc
else:
    PIL_IMPORT_ERROR = None


Box = tuple[int, int, int, int]
RGB = tuple[int, int, int]


def parse_color(value: str) -> RGB:
    candidate = value.strip().lstrip("#")
    if len(candidate) != 6:
        raise argparse.ArgumentTypeError(
            "background color must be RRGGBB or #RRGGBB"
        )
    try:
        return tuple(
            int(candidate[index : index + 2], 16) for index in (0, 2, 4)
        )  # type: ignore[return-value]
    except ValueError as exc:
        raise argparse.ArgumentTypeError(
            "background color must be hexadecimal"
        ) from exc


def sample_background(image, band: int | None = None) -> RGB:
    """Return the per-channel median of a thin strip around the sheet edge."""
    rgb = image.convert("RGB")
    width, height = rgb.size
    band = band or max(1, min(width, height) // 64)
    band = min(band, max(1, min(width, height) // 2))
    pixels = rgb.load()
    samples = [
        pixels[x, y]
        for y in range(height)
        for x in range(width)
        if x < band or x >= width - band or y < band or y >= height - band
    ]
    return tuple(
        round(median(pixel[channel] for pixel in samples)) for channel in range(3)
    )  # type: ignore[return-value]


def alpha_has_transparency(image, alpha_threshold: int) -> bool:
    if "A" not in image.getbands():
        return False
    alpha = image.getchannel("A")
    minimum, _ = alpha.getextrema()
    if minimum > alpha_threshold:
        return False
    histogram = alpha.histogram()
    transparent = sum(histogram[: alpha_threshold + 1])
    # Ignore isolated transparent metadata/noise on an otherwise opaque sheet.
    return transparent >= max(1, image.width * image.height // 1000)


def foreground_mask(
    image,
    *,
    background: RGB | None,
    distance_threshold: int,
    chroma_threshold: int,
    alpha_threshold: int,
    close_radius: int,
):
    """Build a binary foreground mask from alpha or a near-uniform background."""
    width, height = image.size
    if alpha_has_transparency(image, alpha_threshold):
        alpha = image.getchannel("A")
        mask = alpha.point(lambda value: 255 if value > alpha_threshold else 0)
    else:
        rgb = image.convert("RGB")
        pixels = rgb.load()
        background = background or sample_background(rgb)
        data = bytearray(width * height)
        for y in range(height):
            for x in range(width):
                pixel = pixels[x, y]
                distance = max(
                    abs(pixel[channel] - background[channel])
                    for channel in range(3)
                )
                residual = tuple(
                    pixel[channel] - background[channel] for channel in range(3)
                )
                relative_chroma = max(residual) - min(residual)
                if distance >= distance_threshold or (
                    chroma_threshold and relative_chroma >= chroma_threshold
                ):
                    data[y * width + x] = 255
        mask = Image.frombytes("L", (width, height), bytes(data))

    if close_radius:
        kernel = close_radius * 2 + 1
        mask = mask.filter(ImageFilter.MaxFilter(kernel))
        mask = mask.filter(ImageFilter.MinFilter(kernel))
    return mask


def component_boxes(mask, min_area: int) -> list[tuple[int, Box]]:
    """Find 8-connected mask components and return ``(area, bbox)`` pairs."""
    width, height = mask.size
    data = mask.tobytes()
    seen = bytearray(width * height)
    components: list[tuple[int, Box]] = []

    for y in range(height):
        for x in range(width):
            offset = y * width + x
            if seen[offset] or not data[offset]:
                continue
            seen[offset] = 1
            queue = deque([(x, y)])
            area = 0
            left = right = x
            top = bottom = y
            while queue:
                px, py = queue.popleft()
                area += 1
                left = min(left, px)
                right = max(right, px)
                top = min(top, py)
                bottom = max(bottom, py)
                for ny in range(max(0, py - 1), min(height, py + 2)):
                    for nx in range(max(0, px - 1), min(width, px + 2)):
                        neighbor = ny * width + nx
                        if not seen[neighbor] and data[neighbor]:
                            seen[neighbor] = 1
                            queue.append((nx, ny))
            if area >= min_area:
                components.append((area, (left, top, right + 1, bottom + 1)))
    return components


def sort_reading_order(components: list[tuple[int, Box]]) -> list[tuple[int, Box]]:
    """Group similarly centered objects into rows, then sort each row by x."""
    if not components:
        return []
    typical_height = median(box[3] - box[1] for _, box in components)
    row_tolerance = max(1.0, typical_height * 0.5)
    rows: list[list[tuple[int, Box]]] = []
    row_centers: list[float] = []
    for component in sorted(components, key=lambda item: (item[1][1] + item[1][3]) / 2):
        center_y = (component[1][1] + component[1][3]) / 2
        if not rows or abs(center_y - row_centers[-1]) > row_tolerance:
            rows.append([component])
            row_centers.append(center_y)
        else:
            rows[-1].append(component)
            row_centers[-1] = sum(
                (item[1][1] + item[1][3]) / 2 for item in rows[-1]
            ) / len(rows[-1])
    return [
        item
        for row in rows
        for item in sorted(row, key=lambda value: value[1][0])
    ]


def ordered_components(
    components: list[tuple[int, Box]], order: str
) -> list[tuple[int, Box]]:
    if order == "reading":
        return sort_reading_order(components)
    if order == "x":
        return sorted(components, key=lambda item: (item[1][0], item[1][1]))
    if order == "y":
        return sorted(components, key=lambda item: (item[1][1], item[1][0]))
    return sorted(components, key=lambda item: item[0], reverse=True)


def padded_box(box: Box, padding: int, size: tuple[int, int]) -> Box:
    left, top, right, bottom = box
    width, height = size
    return (
        max(0, left - padding),
        max(0, top - padding),
        min(width, right + padding),
        min(height, bottom + padding),
    )


def normalized_box(box: Box, size: tuple[int, int]) -> list[float]:
    width, height = size
    left, top, right, bottom = box
    return [
        round(left / width, 6),
        round(top / height, 6),
        round(right / width, 6),
        round(bottom / height, 6),
    ]


def safe_name(value: str) -> str:
    name = re.sub(r"[^a-zA-Z0-9._-]+", "-", value.strip()).strip("-.")
    if not name or name in {".", ".."}:
        raise ValueError(f"invalid asset name: {value!r}")
    return name


def path_key(path: Path) -> str:
    """Normalize a planned write path, including case-insensitive collisions."""
    return path.resolve().as_posix().casefold()


def validate_write_paths(
    source: Path, destinations: list[tuple[str, Path]]
) -> None:
    """Reject writes to the source and collisions among planned outputs."""
    source_key = path_key(source)
    seen: dict[str, tuple[str, Path]] = {}
    for label, destination in destinations:
        key = path_key(destination)
        if key == source_key:
            raise ValueError(f"{label} would overwrite input sheet: {source}")
        if key in seen:
            other_label, other_path = seen[key]
            raise ValueError(
                f"planned outputs collide: {other_label} {other_path} and "
                f"{label} {destination}"
            )
        seen[key] = (label, destination)


def refuse_existing(
    destinations: list[tuple[str, Path]], *, force: bool
) -> None:
    if force:
        return
    for _, destination in destinations:
        if destination.exists():
            raise ValueError(
                f"output exists (pass --force to replace): {destination}"
            )


def write_debug_mask(mask, destination: Path, source: Path, force: bool) -> None:
    planned = [("debug mask", destination)]
    validate_write_paths(source, planned)
    refuse_existing(planned, force=force)
    destination.parent.mkdir(parents=True, exist_ok=True)
    mask.save(destination, "PNG", optimize=True)


def build_manifest(
    *,
    source: Path,
    size: tuple[int, int],
    background: RGB | None,
    uses_alpha: bool,
    components: list[tuple[int, Box]],
    names: list[str],
    padding: int,
    extension: str,
) -> dict:
    assets = []
    for index, ((area, foreground), name) in enumerate(zip(components, names), start=1):
        crop = padded_box(foreground, padding, size)
        assets.append(
            {
                "index": index,
                "name": name,
                "file": f"{name}.{extension}",
                "componentArea": area,
                "foregroundBbox": list(foreground),
                "cropBbox": list(crop),
                "cropXywh": [crop[0], crop[1], crop[2] - crop[0], crop[3] - crop[1]],
                "normalizedCropBbox": normalized_box(crop, size),
            }
        )
    return {
        "source": source.name if source.is_absolute() else source.as_posix(),
        "sourceSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        "sourceSize": list(size),
        "detection": "alpha" if uses_alpha else "background-threshold",
        "sampledBackgroundRgb": None if uses_alpha else list(background or ()),
        "padding": padding,
        "bboxFormat": "[x_min, y_min, x_max_exclusive, y_max_exclusive]",
        "assets": assets,
    }


def save_crop(image, box: Box, destination: Path, extension: str) -> None:
    crop = image.crop(box)
    if extension == "png":
        crop.save(destination, "PNG", optimize=True)
    else:
        crop.save(destination, "WEBP", lossless=True, method=6)


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description=__doc__)
    result.add_argument("sheet", type=Path, help="input asset sheet")
    result.add_argument(
        "output_dir", type=Path, help="directory for crops and boxes.json"
    )
    result.add_argument("--names", nargs="+", help="output basenames in reading order")
    result.add_argument(
        "--expected-count", type=int, help="fail unless exactly this many assets are found"
    )
    result.add_argument(
        "--padding",
        type=int,
        default=12,
        help="pixels outside each detected box (default: 12)",
    )
    result.add_argument(
        "--min-area",
        type=int,
        help="minimum component pixels (default: 0.05%% of sheet)",
    )
    result.add_argument(
        "--background-color",
        type=parse_color,
        help="override the background sampled from the border",
    )
    result.add_argument(
        "--distance-threshold",
        type=int,
        default=30,
        help="maximum-channel distance from background (default: 30)",
    )
    result.add_argument(
        "--chroma-threshold",
        type=int,
        default=18,
        help=(
            "also retain pixels with this relative RGB channel range; "
            "0 disables (default: 18)"
        ),
    )
    result.add_argument(
        "--alpha-threshold",
        type=int,
        default=8,
        help="foreground alpha cutoff for transparent sheets (default: 8)",
    )
    result.add_argument(
        "--close-radius",
        type=int,
        default=2,
        help="mask closing radius used to bridge small gaps (default: 2)",
    )
    result.add_argument(
        "--order", choices=("reading", "x", "y", "area"), default="reading"
    )
    result.add_argument(
        "--format",
        choices=("png", "webp"),
        default="png",
        dest="extension",
    )
    result.add_argument(
        "--manifest",
        default="boxes.json",
        help="manifest filename inside output_dir (default: boxes.json)",
    )
    result.add_argument(
        "--debug-mask", type=Path, help="optional path for the detected binary mask"
    )
    result.add_argument(
        "--dry-run",
        action="store_true",
        help="print coordinates without writing files",
    )
    result.add_argument(
        "--force",
        action="store_true",
        help="replace existing crop/manifest/debug files",
    )
    return result


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    if PIL_IMPORT_ERROR is not None:
        print(f"error: Pillow is required: {PIL_IMPORT_ERROR}", file=sys.stderr)
        return 2
    if not args.sheet.is_file():
        print(f"error: input sheet not found: {args.sheet}", file=sys.stderr)
        return 2
    for value, label, lower, upper in (
        (args.padding, "padding", 0, None),
        (args.min_area, "min-area", 1, None),
        (args.distance_threshold, "distance-threshold", 1, 255),
        (args.chroma_threshold, "chroma-threshold", 0, 255),
        (args.alpha_threshold, "alpha-threshold", 0, 254),
        (args.close_radius, "close-radius", 0, 10),
        (args.expected_count, "expected-count", 1, None),
    ):
        if value is not None and (
            value < lower or (upper is not None and value > upper)
        ):
            print(
                f"error: --{label} must be between {lower} and {upper or 'infinity'}",
                file=sys.stderr,
            )
            return 2

    try:
        with Image.open(args.sheet) as opened:
            image = opened.convert("RGBA" if "A" in opened.getbands() else "RGB")
        uses_alpha = alpha_has_transparency(image, args.alpha_threshold)
        background = (
            None
            if uses_alpha
            else (args.background_color or sample_background(image))
        )
        mask = foreground_mask(
            image,
            background=background,
            distance_threshold=args.distance_threshold,
            chroma_threshold=args.chroma_threshold,
            alpha_threshold=args.alpha_threshold,
            close_radius=args.close_radius,
        )
        min_area = args.min_area or max(64, round(image.width * image.height * 0.0005))
        components = ordered_components(component_boxes(mask, min_area), args.order)
        expected = args.expected_count or (len(args.names) if args.names else None)
        if expected is not None and len(components) != expected:
            if args.debug_mask and not args.dry_run:
                write_debug_mask(mask, args.debug_mask, args.sheet, args.force)
            raise ValueError(
                f"found {len(components)} assets, expected {expected}; inspect --debug-mask "
                "and tune thresholds/min-area rather than accepting a bad cut"
            )
        if not components:
            raise ValueError("found no foreground assets")
        if args.names and len(args.names) != len(components):
            raise ValueError(
                f"received {len(args.names)} names for {len(components)} assets"
            )
        names = [safe_name(value) for value in (args.names or [])]
        if not names:
            names = [f"asset-{index:02d}" for index in range(1, len(components) + 1)]
        if len({name.casefold() for name in names}) != len(names):
            raise ValueError("asset names must be unique")
        if Path(args.manifest).name != args.manifest:
            raise ValueError("--manifest must be a filename, not a path")
        manifest = build_manifest(
            source=args.sheet,
            size=image.size,
            background=background,
            uses_alpha=uses_alpha,
            components=components,
            names=names,
            padding=args.padding,
            extension=args.extension,
        )
        manifest["parameters"] = {
            "distanceThreshold": args.distance_threshold,
            "chromaThreshold": args.chroma_threshold,
            "alphaThreshold": args.alpha_threshold,
            "closeRadius": args.close_radius,
            "minArea": min_area,
            "order": args.order,
        }

        payload = json.dumps(manifest, indent=2) + "\n"
        if args.dry_run:
            print(payload, end="")
            return 0

        destinations = [
            args.output_dir / asset["file"] for asset in manifest["assets"]
        ]
        manifest_path = args.output_dir / args.manifest
        planned_writes = [
            (f"crop {asset['name']!r}", destination)
            for asset, destination in zip(manifest["assets"], destinations)
        ]
        planned_writes.append(("manifest", manifest_path))
        if args.debug_mask:
            planned_writes.append(("debug mask", args.debug_mask))
        validate_write_paths(args.sheet, planned_writes)
        refuse_existing(planned_writes, force=args.force)

        args.output_dir.mkdir(parents=True, exist_ok=True)
        for asset, destination in zip(manifest["assets"], destinations):
            save_crop(image, tuple(asset["cropBbox"]), destination, args.extension)
        manifest_path.write_text(payload)
        if args.debug_mask:
            args.debug_mask.parent.mkdir(parents=True, exist_ok=True)
            mask.save(args.debug_mask, "PNG", optimize=True)
        print(payload, end="")
        return 0
    except (OSError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
