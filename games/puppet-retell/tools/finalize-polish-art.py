#!/usr/bin/env python3
"""Deterministically crop the GPT Image 2 polish sheets into runtime assets."""

from __future__ import annotations

from pathlib import Path

from PIL import Image

GAME = Path(__file__).resolve().parents[1]
SOURCE = GAME / "assets" / "source" / "gpt-image-2-polish"
STORY_OUT = GAME / "assets" / "story"
UI_OUT = GAME / "assets" / "ui"

STORIES = (
    ("forest-rescue", 0, 0, 0.57),
    ("moon-surprise", 1, 0, 0.49),
    ("royal-picnic", 2, 0, 0.54),
    ("three-little-pigs", 0, 1, 0.56),
    ("goldilocks", 1, 1, 0.53),
    ("little-red", 2, 1, 0.51),
)
MODE_ACTIONS = (
    ("mode-story-starters", 0, 0),
    ("mode-free-show", 1, 0),
    ("mode-my-shows", 2, 0),
    ("action-wave", 0, 1),
    ("action-jump", 1, 1),
    ("action-talk", 2, 1),
    ("action-think", 0, 2),
    ("action-hug", 1, 2),
    ("action-cheer", 2, 2),
)
UTILITIES = (
    ("no-prop", 0, 0),
    ("privacy-lock", 1, 0),
    ("delete", 2, 0),
    ("curtain-loading", 0, 1),
    ("show-saved", 1, 1),
    ("replay", 2, 1),
)


def grid_cell(image: Image.Image, columns: int, rows: int, column: int, row: int, inset: int = 8) -> Image.Image:
    width = image.width / columns
    height = image.height / rows
    left = round(column * width) + inset
    top = round(row * height) + inset
    right = round((column + 1) * width) - inset
    bottom = round((row + 1) * height) - inset
    return image.crop((left, top, right, bottom))


def story_cards() -> None:
    image = Image.open(SOURCE / "story-cards-sheet.png").convert("RGB")
    STORY_OUT.mkdir(parents=True, exist_ok=True)
    for name, column, row, focus_y in STORIES:
        cell = grid_cell(image, 3, 2, column, row, inset=7)
        target_ratio = 1.6
        crop_height = round(cell.width / target_ratio)
        center = round(cell.height * focus_y)
        top = max(0, min(cell.height - crop_height, center - crop_height // 2))
        cell = cell.crop((0, top, cell.width, top + crop_height))
        cell = cell.resize((640, 400), Image.Resampling.LANCZOS)
        destination = STORY_OUT / f"{name}.jpg"
        cell.save(destination, "JPEG", quality=88, optimize=True, progressive=True)
        print(f"{destination.relative_to(GAME)} {destination.stat().st_size // 1024}KB")


def alpha_icons(source_name: str, entries: tuple, columns: int, rows: int) -> None:
    image = Image.open(SOURCE / source_name).convert("RGBA")
    UI_OUT.mkdir(parents=True, exist_ok=True)
    for name, column, row in entries:
        cell = grid_cell(image, columns, rows, column, row, inset=5)
        alpha = cell.getchannel("A")
        bbox = alpha.point(lambda value: 255 if value >= 10 else 0).getbbox()
        if not bbox:
            raise RuntimeError(f"{name}: no visible pixels")
        left, top, right, bottom = bbox
        padding = 10
        cell = cell.crop((
            max(0, left - padding), max(0, top - padding),
            min(cell.width, right + padding), min(cell.height, bottom + padding),
        ))
        scale = min(292 / cell.width, 292 / cell.height)
        cell = cell.resize(
            (max(1, round(cell.width * scale)), max(1, round(cell.height * scale))),
            Image.Resampling.LANCZOS,
        )
        canvas = Image.new("RGBA", (320, 320), (0, 0, 0, 0))
        canvas.alpha_composite(cell, ((320 - cell.width) // 2, (320 - cell.height) // 2))
        destination = UI_OUT / f"{name}.png"
        canvas.save(destination, "PNG", optimize=True)
        print(f"{destination.relative_to(GAME)} {destination.stat().st_size // 1024}KB")


def main() -> None:
    story_cards()
    alpha_icons("mode-action-icons-alpha.png", MODE_ACTIONS, 3, 3)
    alpha_icons("utility-icons-alpha.png", UTILITIES, 3, 2)


if __name__ == "__main__":
    main()
