#!/usr/bin/env python3
"""Bake Natural Earth rings into the globe's static papercraft raster texture."""

import json
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets/map/natural-earth-110m.json"
OUTPUT = ROOT / "assets/map/world-paper-map.webp"
WIDTH, HEIGHT = 2048, 1024


def normalize_lon(value: float) -> float:
    return ((value + 540) % 360) - 180


def land_color(lon: float, lat: float) -> tuple[int, int, int, int]:
    lon = normalize_lon(lon)
    if lat < -65:
        return (232, 225, 208, 255)
    if lon < -25 and lat >= 18:
        return (120, 167, 73, 255)
    if lon < -25:
        return (199, 94, 61, 255)
    if lon > 112 and lat < 0:
        return (217, 111, 78, 255)
    if lon > 35 and lat >= 0:
        return (228, 179, 51, 255)
    if lat > 34:
        return (154, 127, 192, 255)
    return (223, 147, 54, 255)


def ring_points(ring: list[list[float]], copy: int) -> tuple[list[tuple[float, float]], float, float]:
    points = []
    previous = float(ring[0][0])
    offset = 0.0
    raw = []
    for raw_lon, raw_lat in ring:
        lon, lat = float(raw_lon), float(raw_lat)
        delta = lon - previous
        if delta > 180:
            offset -= 360
        elif delta < -180:
            offset += 360
        raw.append((lon + offset, lat))
        previous = lon
    mean_lon = sum(point[0] for point in raw) / len(raw)
    mean_lat = sum(point[1] for point in raw) / len(raw)
    for lon, lat in raw:
        x = ((lon + copy + 90) / 360) * WIDTH
        y = ((90 - lat) / 180) * HEIGHT
        points.append((x, y))
    return points, mean_lon, mean_lat


def main() -> None:
    data = json.loads(SOURCE.read_text())
    image = Image.new("RGBA", (WIDTH, HEIGHT), (20, 132, 181, 255))
    draw = ImageDraw.Draw(image, "RGBA")

    # Static painted ocean bands and graticule become pixels in the shipped
    # texture; the browser never constructs these graphics.
    for y in range(HEIGHT):
        t = y / (HEIGHT - 1)
        color = (
            round(29 + (13 - 29) * t),
            round(141 + (111 - 141) * t),
            round(188 + (158 - 188) * t),
            255,
        )
        draw.line((0, y, WIDTH, y), fill=color)
    for lon in range(-150, 151, 30):
        x = ((lon + 90) / 360) * WIDTH
        draw.line((x, 0, x, HEIGHT), fill=(212, 241, 241, 42), width=2)
    for lat in range(-60, 61, 30):
        y = ((90 - lat) / 180) * HEIGHT
        draw.line((0, y, WIDTH, y), fill=(212, 241, 241, 42), width=2)

    shadow = Image.new("RGBA", image.size, (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow, "RGBA")
    land = Image.new("RGBA", image.size, (0, 0, 0, 0))
    land_draw = ImageDraw.Draw(land, "RGBA")
    for ring in data["rings"]:
        if len(ring) < 4:
            continue
        for copy in (-360, 0, 360):
            points, mean_lon, mean_lat = ring_points(ring, copy)
            shadow_draw.polygon([(x + 3, y + 4) for x, y in points], fill=(20, 38, 25, 105))
            land_draw.polygon(points, fill=land_color(mean_lon, mean_lat), outline=(248, 238, 178, 155), width=2)
    image.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(6)))
    image.alpha_composite(land)

    rng = random.Random(246813579)
    texture = Image.new("RGBA", image.size, (0, 0, 0, 0))
    texture_draw = ImageDraw.Draw(texture, "RGBA")
    for _ in range(18000):
        light = rng.random() > 0.5
        alpha = round((0.02 + rng.random() * 0.045) * 255)
        color = (255, 255, 255, alpha) if light else (20, 45, 55, alpha)
        x, y = rng.randrange(WIDTH), rng.randrange(HEIGHT)
        length = 1 + rng.randrange(3)
        texture_draw.line((x, y, x + length, y), fill=color, width=1)
    image = Image.alpha_composite(image, texture).convert("RGB")
    image.save(OUTPUT, "WEBP", quality=86, method=6)
    print(f"Wrote {OUTPUT.relative_to(ROOT)} ({WIDTH}x{HEIGHT})")


if __name__ == "__main__":
    main()
