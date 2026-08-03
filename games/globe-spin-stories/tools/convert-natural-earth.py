#!/usr/bin/env python3
"""Convert the public-domain Natural Earth 110m land shapefile to tiny runtime JSON.

The parser intentionally supports only Polygon records (shape type 5), which is
the complete contract of ne_110m_land.shp. It keeps the authoring dependency
surface at zero and makes the checked-in runtime artifact reproducible.
"""

from __future__ import annotations

import json
import math
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets/source/ne_110m_land/ne_110m_land.shp"
OUTPUT = ROOT / "assets/map/natural-earth-110m.json"


def distance_to_segment(point, start, end):
    px, py = point
    ax, ay = start
    bx, by = end
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def simplify(points, tolerance=0.085):
    """Iterative Ramer-Douglas-Peucker, preserving the closed-ring endpoint."""
    if len(points) <= 4:
        return points
    keep = {0, len(points) - 1}
    stack = [(0, len(points) - 1)]
    while stack:
        first, last = stack.pop()
        furthest = -1
        max_dist = tolerance
        for index in range(first + 1, last):
            dist = distance_to_segment(points[index], points[first], points[last])
            if dist > max_dist:
                furthest, max_dist = index, dist
        if furthest >= 0:
            keep.add(furthest)
            stack.extend(((first, furthest), (furthest, last)))
    return [points[index] for index in sorted(keep)]


def records(data):
    offset = 100
    while offset + 8 <= len(data):
        _, words = struct.unpack_from(">ii", data, offset)
        offset += 8
        size = words * 2
        yield data[offset : offset + size]
        offset += size


def polygon_rings(record):
    shape_type = struct.unpack_from("<i", record, 0)[0]
    if shape_type == 0:
        return []
    if shape_type != 5:
        raise ValueError(f"Expected Polygon record, found shape type {shape_type}")
    part_count, point_count = struct.unpack_from("<ii", record, 36)
    part_offset = 44
    point_offset = part_offset + part_count * 4
    starts = list(struct.unpack_from(f"<{part_count}i", record, part_offset)) + [point_count]
    points = [struct.unpack_from("<dd", record, point_offset + index * 16) for index in range(point_count)]
    return [points[starts[index] : starts[index + 1]] for index in range(part_count)]


def main():
    data = SOURCE.read_bytes()
    if struct.unpack_from(">i", data, 0)[0] != 9994:
        raise ValueError("Not an ESRI shapefile")
    output = []
    for record in records(data):
        for ring in polygon_rings(record):
            if len(ring) < 4:
                continue
            if ring[0] != ring[-1]:
                ring.append(ring[0])
            reduced = simplify(ring)
            output.append([[round(lon, 3), round(lat, 3)] for lon, lat in reduced])
    payload = {
        "schemaVersion": 1,
        "source": "Natural Earth ne_110m_land v5.1.2 (public domain)",
        "license": "public-domain",
        "rings": output,
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"wrote {OUTPUT.relative_to(ROOT)}: {len(output)} rings, {OUTPUT.stat().st_size} bytes")


if __name__ == "__main__":
    main()
