#!/usr/bin/env python3
"""Build deterministic Story Stones cutouts, thumbnails, and flexible rigs.

The GPT Image source sheets remain committed as provenance.  This script takes
their chroma-keyed alpha derivatives, finds the seven isolated islands, crops
them losslessly, and emits game-local qlobe-puppet-rig manifests.  Re-running
it is safe and keeps the generated pack reproducible.
"""

from __future__ import annotations

import json
from collections import deque
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
GAME = ROOT / "games" / "story-stones"
ACTORS = GAME / "assets" / "actors"
STONES = GAME / "assets" / "stones"
SOURCES = GAME / "assets" / "source" / "actors"

SPECS = {
    "dragon": {
        "label": "Friendly Dragon",
        "rows": [["head", "torso", "wing.L", "wing.R"], ["leg.L", "leg.R", "tail"]],
        "centers": {
            "torso": [512, 590], "head": [490, 350], "wing.L": [380, 520], "wing.R": [650, 520],
            "leg.L": [430, 760], "leg.R": [585, 760], "tail": [655, 690],
        },
        "scale": {"head": .72, "torso": .75, "wing.L": .62, "wing.R": .62,
            "leg.L": .01, "leg.R": .01, "tail": .62},
        "z": {"wing.L": 4, "wing.R": 5, "tail": 6, "leg.L": 9, "leg.R": 10,
              "torso": 20, "head": 30},
    },
    "orange-cat": {
        "label": "Orange Cat",
        "rows": [["head", "torso"], ["front.L", "front.R", "hind.L", "hind.R", "tail"]],
        "centers": {
            "torso": [512, 590], "head": [490, 350], "front.L": [440, 575], "front.R": [580, 575],
            "hind.L": [405, 730], "hind.R": [600, 730], "tail": [670, 590],
        },
        "scale": {"head": .67, "torso": .65, "front.L": .30, "front.R": .30,
                  "hind.L": .01, "hind.R": .01, "tail": .58},
        "z": {"tail": 5, "hind.L": 8, "hind.R": 9, "torso": 18,
              "front.L": 21, "front.R": 22, "head": 30},
    },
    "white-cat": {
        "label": "White Cat",
        "rows": [["head", "torso", "front.L", "front.R"], ["hind.L", "hind.R", "tail"]],
        "centers": {
            "torso": [512, 590], "head": [490, 350], "front.L": [440, 575], "front.R": [580, 575],
            "hind.L": [405, 730], "hind.R": [600, 730], "tail": [670, 590],
        },
        "scale": {"head": .67, "torso": .65, "front.L": .30, "front.R": .30,
                  "hind.L": .01, "hind.R": .01, "tail": .58},
        "z": {"tail": 5, "hind.L": 8, "hind.R": 9, "torso": 18,
              "front.L": 21, "front.R": 22, "head": 30},
    },
    "friendly-monster": {
        "label": "Friendly Monster",
        "rows": [["head", "torso", "arm.L", "arm.R"], ["leg.L", "leg.R", "tail"]],
        "centers": {
            "torso": [512, 600], "head": [512, 350], "arm.L": [390, 560], "arm.R": [635, 560],
            "leg.L": [430, 750], "leg.R": [590, 750], "tail": [650, 650],
        },
        "scale": {"head": .65, "torso": .70, "arm.L": .55, "arm.R": .55,
                  "leg.L": .01, "leg.R": .01, "tail": .48},
        "z": {"tail": 4, "leg.L": 8, "leg.R": 9, "arm.L": 14, "arm.R": 15,
              "torso": 20, "head": 30},
    },
    "owl": {
        "label": "Meadow Owl",
        "rows": [["head", "torso", "wing.L", "wing.R"], ["leg.L", "leg.R", "tail"]],
        "centers": {
            "torso": [512, 590], "head": [512, 350], "wing.L": [390, 560], "wing.R": [635, 560],
            "leg.L": [445, 745], "leg.R": [575, 745], "tail": [512, 690],
        },
        "scale": {"head": .67, "torso": .68, "wing.L": .58, "wing.R": .58,
                  "leg.L": .55, "leg.R": .55, "tail": .50},
        "z": {"tail": 5, "leg.L": 8, "leg.R": 9, "torso": 18,
              "wing.L": 21, "wing.R": 22, "head": 30},
    },
}


def alpha_components(image: Image.Image, threshold: int = 20, min_area: int = 400):
    alpha = image.getchannel("A")
    width, height = image.size
    pixels = alpha.load()
    seen = bytearray(width * height)
    found = []
    for y in range(height):
        for x in range(width):
            start = y * width + x
            if seen[start] or pixels[x, y] <= threshold:
                continue
            seen[start] = 1
            queue = deque([(x, y)])
            area = 0
            min_x = max_x = x
            min_y = max_y = y
            while queue:
                px, py = queue.popleft()
                area += 1
                min_x, max_x = min(min_x, px), max(max_x, px)
                min_y, max_y = min(min_y, py), max(max_y, py)
                for nx, ny in ((px - 1, py), (px + 1, py), (px, py - 1), (px, py + 1)):
                    if nx < 0 or ny < 0 or nx >= width or ny >= height:
                        continue
                    index = ny * width + nx
                    if not seen[index] and pixels[nx, ny] > threshold:
                        seen[index] = 1
                        queue.append((nx, ny))
            if area >= min_area:
                found.append({"box": (min_x, min_y, max_x + 1, max_y + 1), "area": area,
                              "cx": (min_x + max_x) / 2, "cy": (min_y + max_y) / 2})
    return found


def group_rows(components, expected_rows):
    remaining = sorted(components, key=lambda c: c["cy"])
    rows = []
    offset = 0
    for count in expected_rows:
        row = remaining[offset:offset + count]
        rows.append(sorted(row, key=lambda c: c["cx"]))
        offset += count
    return rows


def track(target, prop, values):
    return {"target": target, "prop": prop,
            "keys": [{"t": round(i / (len(values) - 1), 3), "v": value}
                     for i, value in enumerate(values)]}


def clips(spec):
    ids = set(spec["centers"])
    side = next((name for name in ("wing.R", "arm.R", "front.R", "leg.R") if name in ids), "head")
    left = next((name for name in ("wing.L", "arm.L", "front.L", "leg.L") if name in ids), "head")
    return {
        "idle": {"duration": 2600, "loop": True, "tracks": [
            track("$motion", "y", [0, -8, 0]), track("head", "rotation", [-.018, .025, -.018])]},
        "walk": {"duration": 760, "loop": True, "tracks": [
            track("$motion", "y", [0, -20, 0, -14, 0]),
            track(left, "rotation", [-.10, .16, -.10]), track(side, "rotation", [.10, -.16, .10])]},
        "enter": {"duration": 900, "loop": False, "tracks": [
            track("$motion", "scaleX", [.8, 1.06, 1]), track("$motion", "scaleY", [.8, 1.06, 1])]},
        "notice": {"duration": 720, "loop": False, "tracks": [
            track("head", "rotation", [0, -.12, .10, 0]), track("head", "scaleX", [1, 1.08, 1]),
            track("head", "scaleY", [1, 1.08, 1])]},
        "interact": {"duration": 980, "loop": False, "tracks": [
            track(side, "rotation", [0, -.35, .18, 0]), track("head", "rotation", [0, .08, -.04, 0])]},
        "react": {"duration": 850, "loop": False, "tracks": [
            track("$motion", "y", [0, -42, 0]), track("$motion", "scaleX", [1, 1.08, .96, 1]),
            track("$motion", "scaleY", [1, .94, 1.04, 1])]},
        "celebrate": {"duration": 1200, "loop": False, "tracks": [
            track("$motion", "y", [0, -70, 0, -42, 0]), track(left, "rotation", [0, -.45, .20, 0]),
            track(side, "rotation", [0, .45, -.20, 0])]},
    }


def build_actor(actor_id: str, spec: dict):
    source = Image.open(SOURCES / f"{actor_id}-sheet-alpha.png").convert("RGBA")
    components = alpha_components(source)
    expected = [len(row) for row in spec["rows"]]
    if len(components) != sum(expected):
        raise RuntimeError(f"{actor_id}: expected {sum(expected)} alpha islands, found {len(components)}")
    rows = group_rows(components, expected)
    actor_dir = ACTORS / actor_id
    parts_dir = actor_dir / "parts"
    parts_dir.mkdir(parents=True, exist_ok=True)
    boxes = {}
    for labels, row in zip(spec["rows"], rows):
        for label, component in zip(labels, row):
            left, top, right, bottom = component["box"]
            pad = 3
            box = (max(0, left - pad), max(0, top - pad), min(source.width, right + pad), min(source.height, bottom + pad))
            crop = source.crop(box)
            crop.save(parts_dir / f"{label}.png", optimize=True)
            boxes[label] = {"box": list(box), "size": list(crop.size)}

    bones = []
    parts = []
    for label, joint in spec["centers"].items():
        parent = None if label == "torso" else "torso"
        bones.append({"id": label, "parent": parent, "joint": joint, "z": spec["z"][label]})
        parts.append({"bone": label, "z": spec["z"][label], "art": f"parts/{label}.png",
                      "anchor": [.5, .5], "scale": spec["scale"][label]})
    bones.sort(key=lambda bone: 0 if bone["id"] == "torso" else 1)
    rig = {
        "format": "qlobe-puppet-rig", "formatVersion": 2,
        "id": actor_id, "name": spec["label"], "canvas": 1024,
        "anchor": {"x": 512, "y": 520}, "ground": 850,
        "art": "GPT Image 2 separated source sheet; chroma-keyed and cropped by tools/story-stones-assets.py.",
        "bones": bones, "parts": parts, "outfitSlots": [], "clips": clips(spec),
    }
    (actor_dir / "rig.json").write_text(json.dumps(rig, indent=2) + "\n")
    (actor_dir / "build.json").write_text(json.dumps({
        "format": "qlobe-scene-actor-build", "formatVersion": 1, "id": actor_id,
        "label": spec["label"], "source": f"../../source/actors/{actor_id}-sheet-alpha.png",
        "parts": boxes,
    }, indent=2) + "\n")

    head = Image.open(parts_dir / "head.png").convert("RGBA")
    head.thumbnail((300, 300), Image.Resampling.LANCZOS)
    thumb = Image.new("RGBA", (320, 320))
    thumb.alpha_composite(head, ((320 - head.width) // 2, (320 - head.height) // 2))
    thumb.save(STONES / f"{actor_id}.png", optimize=True)


def build_prop_stones():
    for path in (GAME / "assets" / "props").glob("*.png"):
        image = Image.open(path).convert("RGBA")
        bbox = image.getbbox()
        if bbox:
            image = image.crop(bbox)
        image.thumbnail((292, 292), Image.Resampling.LANCZOS)
        thumb = Image.new("RGBA", (320, 320))
        thumb.alpha_composite(image, ((320 - image.width) // 2, (320 - image.height) // 2))
        thumb.save(STONES / path.name, optimize=True)


def build_hub_tile():
    backdrop = Image.open(GAME / "assets" / "backdrops" / "castle-meadow-gpt-image-2.png").convert("RGB")
    target = (640, 533)
    scale = max(target[0] / backdrop.width, target[1] / backdrop.height)
    backdrop = backdrop.resize((round(backdrop.width * scale), round(backdrop.height * scale)), Image.Resampling.LANCZOS)
    left = (backdrop.width - target[0]) // 2
    top = (backdrop.height - target[1]) // 2
    tile = backdrop.crop((left, top, left + target[0], top + target[1])).convert("RGBA")
    for actor_id, size, position in (("dragon", 245, (55, 240)), ("orange-cat", 220, (365, 265))):
        actor = Image.open(STONES / f"{actor_id}.png").convert("RGBA")
        actor.thumbnail((size, size), Image.Resampling.LANCZOS)
        tile.alpha_composite(actor, position)
    tile.convert("RGB").save(ROOT / "assets" / "hub" / "tiles" / "story-stones.jpg", quality=88, optimize=True)


def main():
    ACTORS.mkdir(parents=True, exist_ok=True)
    STONES.mkdir(parents=True, exist_ok=True)
    for actor_id, spec in SPECS.items():
        build_actor(actor_id, spec)
        print(f"built actor: {actor_id}")
    build_prop_stones()
    build_hub_tile()
    print("built seven prop thumbnails")


if __name__ == "__main__":
    main()
