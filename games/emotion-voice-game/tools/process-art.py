#!/usr/bin/env python3
"""Deterministically finalize the approved Emotion Voice Game art sources."""

from pathlib import Path

from collections import deque

from PIL import Image, ImageFilter, ImageChops


GAME = Path(__file__).resolve().parents[1]
ASSETS = GAME / "assets"
SOURCE = ASSETS / "source"
POSES = ("neutral", "happy", "proud", "calm", "silly")
POSE_OVERRIDES = {
    "happy": "bear-happy-v2-alpha.png",
    "silly": "bear-silly-v2-alpha.png",
}
VISEMES = ("a", "o", "e", "wr", "ts", "ln", "uq", "mbp", "fv")
UI_PIECES = ("card-happy", "card-proud", "card-calm", "card-silly", "mic", "star")
UI_BANNERS = ("prompt-banner", "next-button")


def alpha_bbox(image: Image.Image, threshold: int = 8):
    alpha = image.getchannel("A").point(lambda value: 255 if value > threshold else 0)
    return alpha.getbbox()


def padded_crop(image: Image.Image, pad: int = 20):
    bbox = alpha_bbox(image)
    if not bbox:
        raise ValueError("source contains no visible pixels")
    left, top, right, bottom = bbox
    left, top = max(0, left - pad), max(0, top - pad)
    right, bottom = min(image.width, right + pad), min(image.height, bottom + pad)
    return image.crop((left, top, right, bottom))


def keep_largest_component(image: Image.Image, threshold: int = 24):
    """Drop neighboring contact-sheet fragments while retaining soft edges."""
    alpha = image.getchannel("A")
    width, height = image.size
    alpha_values = alpha.get_flattened_data() if hasattr(alpha, "get_flattened_data") else alpha.getdata()
    solid = bytearray(1 if value > threshold else 0 for value in alpha_values)
    seen = bytearray(width * height)
    largest = []
    for start, present in enumerate(solid):
        if not present or seen[start]:
            continue
        component = []
        queue = deque([start])
        seen[start] = 1
        while queue:
            index = queue.pop()
            component.append(index)
            x, y = index % width, index // width
            for neighbor in (index - 1 if x else -1, index + 1 if x + 1 < width else -1,
                             index - width if y else -1, index + width if y + 1 < height else -1):
                if neighbor >= 0 and solid[neighbor] and not seen[neighbor]:
                    seen[neighbor] = 1
                    queue.append(neighbor)
        if len(component) > len(largest):
            largest = component
    keep = Image.new("L", image.size, 0)
    keep_data = bytearray(width * height)
    for index in largest:
        keep_data[index] = 255
    keep.frombytes(bytes(keep_data))
    keep = keep.filter(ImageFilter.MaxFilter(7))
    cleaned = image.copy()
    cleaned.putalpha(ImageChops.multiply(alpha, keep))
    return cleaned


def finalize_stage():
    image = Image.open(SOURCE / "felt-stage-gpt-image-2.png").convert("RGB")
    image.thumbnail((1440, 1080), Image.Resampling.LANCZOS)
    image.save(ASSETS / "felt-stage.webp", "WEBP", quality=82, method=6)


def finalize_title():
    image = padded_crop(Image.open(SOURCE / "title-alpha.png").convert("RGBA"), 24)
    image.thumbnail((980, 440), Image.Resampling.LANCZOS)
    image.save(ASSETS / "title.webp", "WEBP", quality=88, method=6)


def finalize_poses():
    sheet = Image.open(SOURCE / "bear-poses-alpha.png").convert("RGBA")
    edges = [round(sheet.width * index / len(POSES)) for index in range(len(POSES) + 1)]
    out_dir = ASSETS / "characters"
    out_dir.mkdir(parents=True, exist_ok=True)
    for index, name in enumerate(POSES):
        override = SOURCE / POSE_OVERRIDES.get(name, "")
        if name in POSE_OVERRIDES and override.is_file():
            cell = Image.open(override).convert("RGBA")
        else:
            cell = keep_largest_component(sheet.crop((edges[index], 0, edges[index + 1], sheet.height)))
        subject = padded_crop(cell, 14)
        subject.thumbnail((430, 620), Image.Resampling.LANCZOS)
        canvas = Image.new("RGBA", (480, 680), (0, 0, 0, 0))
        x = (canvas.width - subject.width) // 2
        y = canvas.height - subject.height - 16
        canvas.alpha_composite(subject, (x, y))
        canvas.save(out_dir / f"bear-{name}.webp", "WEBP", lossless=True, method=6)
        corner_alpha = [canvas.getpixel(point)[3] for point in ((0, 0), (479, 0), (0, 679), (479, 679))]
        visible = alpha_bbox(canvas)
        print(f"{name}: source={subject.size} bbox={visible} corners={corner_alpha}")


def finalize_visemes():
    """Slice Teddy's registered 3x3 sheet into feathered muzzle overlays.

    The generated sheet keeps the head fixed and changes only the mouth.  A
    soft oval retains Teddy's complete tan muzzle, so every shape covers the
    baked mouth below without introducing a rectangular seam.
    """
    sheet = Image.open(SOURCE / "visemes" / "teddy-visemes-alpha.png").convert("RGBA")
    out_dir = ASSETS / "characters" / "teddy" / "anim"
    out_dir.mkdir(parents=True, exist_ok=True)
    x_edges = [round(sheet.width * index / 3) for index in range(4)]
    y_edges = [round(sheet.height * index / 3) for index in range(4)]
    for index, name in enumerate(VISEMES):
        row, column = divmod(index, 3)
        cell = sheet.crop((x_edges[column], y_edges[row], x_edges[column + 1], y_edges[row + 1]))
        # Registered local head coordinates in each cell. Keep a little room
        # around the muzzle so the feather lands in matching brown face fur.
        patch = cell.crop((155, 235, 305, 365))
        matte = Image.new("L", patch.size, 0)
        ellipse = Image.new("L", patch.size, 0)
        from PIL import ImageDraw
        ImageDraw.Draw(ellipse).ellipse((4, 0, 146, 128), fill=255)
        matte = ellipse.filter(ImageFilter.GaussianBlur(3.2))
        matte = ImageChops.multiply(matte, patch.getchannel("A"))
        patch.putalpha(matte)
        patch.save(out_dir / f"mouth-{name}.png", "PNG", optimize=True)
    # The canonical cue generator emits `rest`; Teddy's T/S head is the
    # neutral closed-mouth drawing, matching the shared puppet convention.
    (out_dir / "mouth-rest.png").write_bytes((out_dir / "mouth-ts.png").read_bytes())
    print(f"visemes: {len(VISEMES)} shapes + rest alias -> {out_dir}")


def finalize_ui():
    sheet = Image.open(SOURCE / "ui-kit-alpha.png").convert("RGBA")
    edges = [round(sheet.width * index / len(UI_PIECES)) for index in range(len(UI_PIECES) + 1)]
    out_dir = ASSETS / "ui"
    out_dir.mkdir(parents=True, exist_ok=True)
    for index, name in enumerate(UI_PIECES):
        cell = keep_largest_component(sheet.crop((edges[index], 0, edges[index + 1], sheet.height)))
        subject = padded_crop(cell, 12)
        subject.thumbnail((420, 500), Image.Resampling.LANCZOS)
        subject.save(out_dir / f"{name}.webp", "WEBP", quality=90, method=6)
        corners = [subject.getpixel(point)[3] for point in ((0, 0), (subject.width - 1, 0), (0, subject.height - 1), (subject.width - 1, subject.height - 1))]
        print(f"ui/{name}: size={subject.size} corners={corners}")


def finalize_banners():
    sheet = Image.open(SOURCE / "ui-banners-alpha.png").convert("RGBA")
    edges = [round(sheet.width * index / len(UI_BANNERS)) for index in range(len(UI_BANNERS) + 1)]
    out_dir = ASSETS / "ui"
    out_dir.mkdir(parents=True, exist_ok=True)
    for index, name in enumerate(UI_BANNERS):
        cell = keep_largest_component(sheet.crop((edges[index], 0, edges[index + 1], sheet.height)))
        subject = padded_crop(cell, 12)
        subject.thumbnail((900, 340), Image.Resampling.LANCZOS)
        subject.save(out_dir / f"{name}.webp", "WEBP", quality=90, method=6)
        print(f"ui/{name}: size={subject.size}")


if __name__ == "__main__":
    finalize_stage()
    finalize_title()
    finalize_poses()
    finalize_visemes()
    finalize_ui()
    finalize_banners()
    print("Emotion Voice Game art finalized.")
