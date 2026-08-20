#!/usr/bin/env python3
"""Render the Puzzle Explorer continent art and exact runtime hit mask.

Natural Earth's ``ne_110m_land`` source deliberately contains coastlines rather
than country/continent attributes.  The renderer therefore draws the accurate
land geometry first, then classifies *land pixels* with stable geographic
boundaries.  This avoids generated geography and avoids pretending an entire
connected Afro-Eurasian polygon is one continent.
"""
from __future__ import annotations

import argparse
import json
import random
import struct
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

WIDTH, HEIGHT = 1400, 700
SOURCE_NAME = "Natural Earth ne_110m_land v5.1.2"

# Runtime id, child-facing name, material fill, exact non-antialiased hit color.
CONTINENTS = (
    ("north-america", "North America", "#67A89E", "#23675F"),
    ("south-america", "South America", "#E06F70", "#9D2736"),
    ("europe", "Europe", "#F0B83F", "#996900"),
    ("africa", "Africa", "#EE8F35", "#A94F0E"),
    ("asia", "Asia", "#8EB35A", "#456D1A"),
    ("australia", "Australia", "#E76743", "#9E2F18"),
)


def rgb(value: str) -> tuple[int, int, int]:
    return tuple(int(value[index:index + 2], 16) for index in (1, 3, 5))


def shape_records(data: bytes):
    offset = 100
    while offset + 8 <= len(data):
        _, words = struct.unpack_from(">ii", data, offset)
        offset += 8
        size = words * 2
        if offset + size > len(data):
            raise ValueError("truncated SHP record")
        yield data[offset:offset + size]
        offset += size


def polygon_rings(record: bytes):
    shape_type = struct.unpack_from("<i", record, 0)[0]
    if shape_type == 0:
        return []
    if shape_type != 5:
        raise ValueError(f"expected Polygon record, found {shape_type}")
    part_count, point_count = struct.unpack_from("<ii", record, 36)
    part_offset = 44
    point_offset = part_offset + part_count * 4
    starts = list(struct.unpack_from(f"<{part_count}i", record, part_offset)) + [point_count]
    points = [
        struct.unpack_from("<dd", record, point_offset + index * 16)
        for index in range(point_count)
    ]
    return [points[starts[index]:starts[index + 1]] for index in range(part_count)]


def project(lon: float, lat: float) -> tuple[float, float]:
    """A centered, Robinson-like compromise projection with a calm oval read."""
    latitude = max(-90.0, min(90.0, float(lat)))
    longitude = max(-180.0, min(180.0, float(lon)))
    width_scale = 0.86 + 0.14 * (1.0 - (abs(latitude) / 90.0) ** 1.7)
    x = WIDTH / 2 + (longitude / 180.0) * (WIDTH / 2) * width_scale
    y = (90.0 - latitude) / 180.0 * HEIGHT
    return x, y


def inverse_project(x: int, y: int) -> tuple[float, float]:
    lat = 90.0 - (y / (HEIGHT - 1)) * 180.0
    width_scale = 0.86 + 0.14 * (1.0 - (abs(lat) / 90.0) ** 1.7)
    lon = ((x - WIDTH / 2) / ((WIDTH / 2) * width_scale)) * 180.0
    return max(-180.0, min(180.0, lon)), lat


def continent_for(lon: float, lat: float) -> str:
    """Classify a land coordinate into the six child-facing target regions.

    The broad boundaries intentionally follow familiar physical separations at
    preschool map scale: Panama, Suez, the Caucasus/Urals, and the seas north of
    Australia.  Coastline pixels remain the Natural Earth authority.
    """
    if lon < -25:
        return "north-america" if lat >= 9 else "south-america"
    if lon >= 105 and lat < -10:
        return "australia"
    # Africa includes Madagascar but not the Arabian Peninsula.
    if lat < 37 and lon < 52 and not (lon > 35 and lat > 12):
        return "africa"
    # A simple Urals/Caucasus boundary is far clearer than a country-boundary
    # seam at this scale, and keeps the tiny Europe target generous.
    europe_east = min(60.0, 40.0 + max(0.0, lat - 35.0) * 0.36)
    if lat >= 35 and lon < europe_east:
        return "europe"
    return "asia"


def render_land(records: list[bytes]) -> Image.Image:
    land = Image.new("L", (WIDTH, HEIGHT), 0)
    draw = ImageDraw.Draw(land)
    for record in records:
        for ring in polygon_rings(record):
            if len(ring) >= 3:
                draw.polygon([project(lon, lat) for lon, lat in ring], fill=255)
    return land


def classify_land(land: Image.Image) -> dict[str, Image.Image]:
    masks = {item[0]: Image.new("L", (WIDTH, HEIGHT), 0) for item in CONTINENTS}
    mask_pixels = {key: value.load() for key, value in masks.items()}
    land_pixels = land.load()
    for y in range(HEIGHT):
        for x in range(WIDTH):
            if land_pixels[x, y]:
                lon, lat = inverse_project(x, y)
                if lat > -60:  # Antarctica is intentionally outside this game.
                    mask_pixels[continent_for(lon, lat)][x, y] = 255
    return masks


def paste_paper(art: Image.Image, region: Image.Image, fill: str, seed: int) -> None:
    # Soft offset shadow, then a cream cut-paper rim, then the colored stock.
    shifted = Image.new("L", region.size, 0)
    shifted.paste(region, (4, 6))
    shadow_alpha = shifted.filter(ImageFilter.GaussianBlur(7)).point(lambda value: int(value * 0.42))
    shadow = Image.new("RGBA", region.size, (27, 34, 31, 0))
    shadow.putalpha(shadow_alpha)
    art.alpha_composite(shadow)

    expanded = region.filter(ImageFilter.MaxFilter(7))
    rim = ImageChops.subtract(expanded, region)
    cream = Image.new("RGBA", region.size, (255, 242, 204, 0))
    cream.putalpha(rim)
    art.alpha_composite(cream)

    stock = Image.new("RGBA", region.size, rgb(fill) + (0,))
    stock.putalpha(region)
    art.alpha_composite(stock)

    # Deterministic fibers are raster pixels clipped to this continent mask.
    fibers = Image.new("RGBA", region.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(fibers, "RGBA")
    rng = random.Random(seed)
    for _ in range(2300):
        x = rng.randrange(WIDTH)
        y = rng.randrange(HEIGHT)
        length = 1 + rng.randrange(5)
        if rng.random() < 0.58:
            color = (255, 255, 235, 24 + rng.randrange(24))
        else:
            color = (62, 42, 27, 13 + rng.randrange(20))
        draw.line((x, y, x + length, y + rng.choice((-1, 0, 1))), fill=color, width=1)
    fibers.putalpha(ImageChops.multiply(fibers.getchannel("A"), region))
    art.alpha_composite(fibers)


def closest_mask_point(mask: Image.Image) -> tuple[float, float]:
    pixels = mask.load()
    coords = [
        (x, y)
        for y in range(HEIGHT)
        for x in range(WIDTH)
        if pixels[x, y]
    ]
    if not coords:
        raise ValueError("continent mask is empty")
    mean_x = sum(point[0] for point in coords) / len(coords)
    mean_y = sum(point[1] for point in coords) / len(coords)
    x, y = min(coords, key=lambda point: (point[0] - mean_x) ** 2 + (point[1] - mean_y) ** 2)
    return round(x / WIDTH, 4), round(y / HEIGHT, 4)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    here = Path(__file__).resolve()
    game = here.parents[1]
    default_source = game.parent.parent / "games/globe-spin-stories/assets/source/ne_110m_land"
    parser.add_argument("--source-dir", type=Path, default=default_source)
    parser.add_argument("--out-dir", type=Path, default=game / "assets/map")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    shp = args.source_dir / "ne_110m_land.shp"
    if not shp.is_file():
        raise ValueError(f"missing Natural Earth source: {shp}")
    data = shp.read_bytes()
    if len(data) < 100 or struct.unpack_from(">i", data, 0)[0] != 9994:
        raise ValueError("malformed Natural Earth SHP")
    records = list(shape_records(data))
    if not records:
        raise ValueError("Natural Earth SHP contains no polygon records")
    if args.dry_run:
        print(f"ok: {len(records)} Natural Earth records -> {WIDTH}x{HEIGHT} raster set")
        return 0

    args.out_dir.mkdir(parents=True, exist_ok=True)
    land = render_land(records)
    masks = classify_land(land)

    art = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    hit = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    meta = {
        "schemaVersion": 1,
        "dimensions": {"width": WIDTH, "height": HEIGHT},
        "source": SOURCE_NAME,
        "license": "public-domain",
        "continents": {},
    }
    for index, (runtime_id, display_name, visual_color, mask_color) in enumerate(CONTINENTS):
        region = masks[runtime_id]
        paste_paper(art, region, visual_color, seed=24681357 + index * 101)
        color_plate = Image.new("RGBA", region.size, rgb(mask_color) + (0,))
        color_plate.putalpha(region)
        hit.alpha_composite(color_plate)
        hint_x, hint_y = closest_mask_point(region)
        meta["continents"][runtime_id] = {
            "displayName": display_name,
            "maskColor": mask_color.upper(),
            "visualColor": visual_color.upper(),
            "hint": {"x": hint_x, "y": hint_y},
        }

    art.save(args.out_dir / "continents.webp", "WEBP", lossless=True, method=6)
    hit.save(args.out_dir / "continent-mask.png", "PNG", optimize=True)
    (args.out_dir / "continents.json").write_text(
        json.dumps(meta, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    print(f"wrote {args.out_dir / 'continents.webp'}")
    print(f"wrote {args.out_dir / 'continent-mask.png'}")
    print(f"wrote {args.out_dir / 'continents.json'}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, struct.error) as exc:
        print(f"error: {exc}", file=sys.stderr)
        raise SystemExit(2)
