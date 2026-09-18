"""Build Line Walking Challenge runtime art from committed source masters.

The source generations and cutter manifests are provenance. This script is the
deterministic, resumable finalization stage: cover-crop opaque plates, normalize
Fia's poses, clean transparent UI cutouts, write magenta QA composites, and
curate the separate 6:5 hub tile.
"""

from __future__ import annotations

import os
from pathlib import Path

from PIL import Image


HERE = Path(__file__).resolve().parents[1]
SOURCE = HERE / "assets" / "source"
MASTERS = SOURCE / "gpt-image-2"
CUTS = SOURCE / "cuts"
OUT = HERE / "assets" / "art"
QA = SOURCE / "qa"
HUB = HERE.parents[1] / "assets" / "hub" / "tiles" / "line-walking-challenge.jpg"

BACKGROUNDS = (
    "select-backdrop",
    "forest-stage",
    "river-stage",
    "rainbow-stage",
    "complete-stage",
)
PORTRAIT_BACKGROUNDS = (
    "forest-stage-portrait",
    "river-stage-portrait",
    "rainbow-stage-portrait",
)
FOX_POSES = ("ready", "left-step", "right-step", "pause", "bloom", "celebrate")
UI_ASSETS = ("action-button", "flower-bud", "flower-bloom", "finish-flag", "badge")


def require(path: Path) -> Image.Image:
    if not path.is_file() or path.stat().st_size == 0:
        raise FileNotFoundError(path)
    with Image.open(path) as image:
        image.load()
        return image.copy()


def atomic_webp(image: Image.Image, path: Path, **options: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    image.save(temporary, format="WEBP", **options)
    os.replace(temporary, path)


def alpha_clean(image: Image.Image, floor: int = 10) -> Image.Image:
    image = image.convert("RGBA")
    red, green, blue, alpha = image.split()
    alpha = alpha.point(lambda value: 0 if value <= floor else value)
    if alpha.getbbox() is None:
        raise ValueError("transparent source has no visible pixels")
    return Image.merge("RGBA", (red, green, blue, alpha))


def trim_pad(image: Image.Image, padding: int = 10) -> Image.Image:
    image = alpha_clean(image)
    bounds = image.getchannel("A").getbbox()
    if bounds is None:
        raise ValueError("cannot trim an empty image")
    image = image.crop(bounds)
    output = Image.new("RGBA", (image.width + padding * 2, image.height + padding * 2))
    output.alpha_composite(image, (padding, padding))
    return output


def cover_crop(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    image = image.convert("RGB")
    scale = max(size[0] / image.width, size[1] / image.height)
    image = image.resize(
        (round(image.width * scale), round(image.height * scale)),
        Image.Resampling.LANCZOS,
    )
    left = (image.width - size[0]) // 2
    top = (image.height - size[1]) // 2
    return image.crop((left, top, left + size[0], top + size[1]))


def flatten(image: Image.Image, color: tuple[int, int, int]) -> Image.Image:
    if "A" not in image.getbands():
        return image.convert("RGB")
    rgba = image.convert("RGBA")
    matte = Image.new("RGBA", rgba.size, (*color, 255))
    matte.alpha_composite(rgba)
    return matte.convert("RGB")


def write_magenta(image: Image.Image, name: str) -> None:
    image = image.convert("RGBA")
    matte = Image.new("RGBA", image.size, (255, 0, 180, 255))
    matte.alpha_composite(image)
    matte.convert("RGB").save(QA / f"final-{name}.jpg", quality=90, optimize=True)


def build_backgrounds(report: list[tuple[str, Path]]) -> None:
    for name in BACKGROUNDS:
        output = OUT / f"{name}.webp"
        image = cover_crop(require(MASTERS / f"{name}-master.png"), (1448, 1086))
        atomic_webp(image, output, quality=80, method=4)
        report.append((name, output))
    for name in PORTRAIT_BACKGROUNDS:
        output = OUT / f"{name}.webp"
        image = cover_crop(require(MASTERS / f"{name}-master.png"), (1024, 1536))
        atomic_webp(image, output, quality=80, method=4)
        report.append((name, output))


def build_title(report: list[tuple[str, Path]]) -> None:
    image = trim_pad(require(MASTERS / "title-lockup-master.png"), 12)
    if image.width > 1180:
        image = image.resize((1180, round(image.height * 1180 / image.width)), Image.Resampling.LANCZOS)
    output = OUT / "title-lockup.webp"
    atomic_webp(image, output, quality=91, method=4)
    write_magenta(image, "title-lockup")
    report.append(("title-lockup", output))


def build_fox(report: list[tuple[str, Path]]) -> None:
    for name in FOX_POSES:
        image = trim_pad(require(CUTS / "fox" / f"{name}.png"), 8)
        scale = min(1.0, 600 / image.height, 490 / image.width)
        if scale < 1:
            image = image.resize(
                (round(image.width * scale), round(image.height * scale)),
                Image.Resampling.LANCZOS,
            )
        normalized = Image.new("RGBA", (520, 640))
        normalized.alpha_composite(image, ((520 - image.width) // 2, 632 - image.height))
        output = OUT / f"fox-{name}.webp"
        atomic_webp(normalized, output, quality=91, method=4)
        write_magenta(normalized, f"fox-{name}")
        report.append((f"fox-{name}", output))


def build_ui(report: list[tuple[str, Path]]) -> None:
    for name in UI_ASSETS:
        image = trim_pad(require(CUTS / "ui" / f"{name}.png"), 8)
        maximum = 720 if name == "action-button" else 460
        scale = min(1.0, maximum / max(image.size))
        if scale < 1:
            image = image.resize(
                (round(image.width * scale), round(image.height * scale)),
                Image.Resampling.LANCZOS,
            )
        output = OUT / f"{name}.webp"
        atomic_webp(image, output, quality=91, method=4)
        write_magenta(image, name)
        report.append((name, output))


def build_hub() -> None:
    local_api = SOURCE / "local-api" / "hub-tile-master.png"
    fallback = MASTERS / "hub-tile-master.png"
    source = local_api if local_api.is_file() and local_api.stat().st_size > 5000 else fallback
    image = flatten(require(source), (219, 241, 248))
    image = cover_crop(image, (640, 533))
    HUB.parent.mkdir(parents=True, exist_ok=True)
    image.save(HUB, format="JPEG", quality=90, optimize=True, progressive=True)


def validate(report: list[tuple[str, Path]]) -> None:
    transparent_names = {"title-lockup", *[f"fox-{name}" for name in FOX_POSES], *UI_ASSETS}
    for name, path in report:
        with Image.open(path) as image:
            image.load()
            if image.width < 2 or image.height < 2:
                raise ValueError(f"{name}: invalid dimensions")
            if name in transparent_names:
                if image.mode != "RGBA":
                    raise ValueError(f"{name}: alpha was lost")
                if image.getpixel((0, 0))[3] != 0:
                    raise ValueError(f"{name}: transparent safety corner is opaque")
    for name in FOX_POSES:
        if require(OUT / f"fox-{name}.webp").size != (520, 640):
            raise ValueError(f"fox-{name}: normalized canvas changed")
    with Image.open(HUB) as image:
        image.load()
        if image.size != (640, 533) or image.mode != "RGB":
            raise ValueError("hub tile did not finalize to opaque 640x533 RGB")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    QA.mkdir(parents=True, exist_ok=True)
    report: list[tuple[str, Path]] = []
    build_backgrounds(report)
    build_title(report)
    build_fox(report)
    build_ui(report)
    build_hub()
    validate(report)
    print(f"built {len(report)} runtime assets + hub tile")
    for name, path in report:
        print(f"{name:22} {path.stat().st_size:8} bytes")
    print(f"{'hub-tile':22} {HUB.stat().st_size:8} bytes")


if __name__ == "__main__":
    main()
