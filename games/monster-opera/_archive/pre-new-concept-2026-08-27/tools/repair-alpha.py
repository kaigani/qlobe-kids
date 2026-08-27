#!/usr/bin/env python3
"""Repair interior transparency while preserving a soft outer silhouette.

GPT Image 2's transparent lineup occasionally encoded dark facial details as
low alpha even though they are fully inside the character. A global alpha
multiplier fixes the face but darkens the anti-aliased outer fringe. This tool
flood-fills only the true exterior, preserves two exterior-adjacent alpha
rings, and makes every enclosed/interior pixel opaque.
"""

from __future__ import annotations

import argparse
from collections import deque
from pathlib import Path

from PIL import Image


NEIGHBORS = (
    (-1, -1), (0, -1), (1, -1),
    (-1, 0),           (1, 0),
    (-1, 1),  (0, 1),  (1, 1),
)


def repair_alpha(source: Path, destination: Path, edge_rings: int) -> None:
    image = Image.open(source).convert("RGBA")
    width, height = image.size
    alpha = bytearray(image.getchannel("A").tobytes())
    total = width * height

    outside = bytearray(total)
    queue: deque[int] = deque()

    def seed(x: int, y: int) -> None:
        index = y * width + x
        if alpha[index] <= 1 and not outside[index]:
            outside[index] = 1
            queue.append(index)

    for x in range(width):
        seed(x, 0)
        seed(x, height - 1)
    for y in range(height):
        seed(0, y)
        seed(width - 1, y)

    while queue:
        index = queue.popleft()
        x = index % width
        y = index // width
        for dx, dy in NEIGHBORS:
            nx = x + dx
            ny = y + dy
            if not (0 <= nx < width and 0 <= ny < height):
                continue
            neighbor = ny * width + nx
            if alpha[neighbor] <= 1 and not outside[neighbor]:
                outside[neighbor] = 1
                queue.append(neighbor)

    # Distance only needs to reach one ring beyond the preserved feather.
    limit = edge_rings + 1
    distance = bytearray([255]) * total
    queue.clear()
    for index, is_outside in enumerate(outside):
        if is_outside:
            distance[index] = 0
            queue.append(index)

    while queue:
        index = queue.popleft()
        current = distance[index]
        if current >= limit:
            continue
        x = index % width
        y = index // width
        next_distance = current + 1
        for dx, dy in NEIGHBORS:
            nx = x + dx
            ny = y + dy
            if not (0 <= nx < width and 0 <= ny < height):
                continue
            neighbor = ny * width + nx
            if next_distance < distance[neighbor]:
                distance[neighbor] = next_distance
                queue.append(neighbor)

    repaired = bytearray(total)
    for index, original in enumerate(alpha):
        if outside[index]:
            repaired[index] = 0
        elif distance[index] <= edge_rings:
            repaired[index] = original
        else:
            repaired[index] = 255

    image.putalpha(Image.frombytes("L", (width, height), bytes(repaired)))
    destination.parent.mkdir(parents=True, exist_ok=True)
    image.save(destination, format="PNG", optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    parser.add_argument("--edge-rings", type=int, default=2)
    args = parser.parse_args()
    if args.edge_rings < 1:
        parser.error("--edge-rings must be at least 1")
    repair_alpha(args.source, args.destination, args.edge_rings)


if __name__ == "__main__":
    main()
