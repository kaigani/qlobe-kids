#!/usr/bin/env python3
"""Convert black-backed animation videos into alpha sprite strips.

Chalk-style concept videos are delivered on a solid black background and were
composited at runtime with ``mix-blend-mode: screen``. This tool turns every
frame of such a video into a real RGBA keyframe so a game can draw the
animation onto any background with a plain canvas ``drawImage`` — no blend
modes, no ``<video>`` elements, no black matte.

Every source frame is kept at the source frame rate. Nothing is resampled in
time, so the sprite version is exactly as smooth as the video it came from.

Per clip the tool:

1. decodes the video with ffmpeg, bakes in the optional CSS-equivalent
   ``contrast()`` / ``saturate()`` look, derives alpha from the brightest
   channel (a black-backed pixel's "screen" contribution), and un-premultiplies
   the colour so the result is a straight-alpha RGBA frame;
2. finds the union bounding box of all frames and crops every frame to it (the
   crop offset is recorded so the frame can be placed back into the original
   frame box);
3. packs the frames, in order, into horizontal WebP strips of
   ``--frames-per-strip`` frames each, so a player can decode and hold only
   the strips it is about to show; and
4. writes one ``manifest.json`` per output directory describing each clip.

Manifest shape (``qlobe-sprite-strips/1``)::

    {
      "format": "qlobe-sprite-strips/1",
      "frameBox": {"width": 480, "height": 480},
      "still": "still.webp",
      "clips": {
        "dance": {
          "fps": 24, "frames": 107, "loop": true,
          "crop": {"x": 0, "y": 44, "width": 432, "height": 362},
          "framesPerStrip": 8, "stored": 104,
          "sequence": [0, 0, 1, 2, ...],   // only when hold frames share storage
          "strips": ["dance-00.webp", "dance-01.webp", ...]
        }
      }
    }

``frames`` is the playback length in source frames; ``stored`` is how many
distinct images the strips hold. By default every frame is stored and the two
are equal. With ``--dedupe`` a ``sequence`` maps every playback frame to its
stored image so exact hold frames can share storage without touching timing.

Typical use::

    python3 tools/video-to-sprite-strips.py \
      --out games/monster-opera/assets/monsters/monster-01/sprites \
      --still assets/monsters/monster-01/still.webp \
      --loop dance \
      dance=assets/monsters/monster-01/dance.mp4 \
      noise-01=assets/monsters/monster-01/noise-01.mp4

Requires ffmpeg/ffprobe on PATH and Pillow (``python3 -m pip install pillow``).
"""

from __future__ import annotations

import argparse
import json
import math
import os
import shutil
import subprocess
import sys
import tempfile
from concurrent.futures import ProcessPoolExecutor
from fractions import Fraction
from pathlib import Path

try:
    from PIL import Image, ImageChops, ImageEnhance, ImageFilter
except ImportError as exc:  # Keep --help useful without Pillow.
    Image = None  # type: ignore[assignment]
    ImageChops = None  # type: ignore[assignment]
    ImageEnhance = None  # type: ignore[assignment]
    ImageFilter = None  # type: ignore[assignment]
    PIL_IMPORT_ERROR = exc
else:
    PIL_IMPORT_ERROR = None

FORMAT = "qlobe-sprite-strips/1"


def parse_clip(value: str) -> tuple[str, Path]:
    if "=" not in value:
        raise argparse.ArgumentTypeError("clips are written as name=path/to/video.mp4")
    name, path = value.split("=", 1)
    name = name.strip()
    if not name or any(ch in name for ch in "/\\ "):
        raise argparse.ArgumentTypeError(f"bad clip name {name!r}")
    source = Path(path).expanduser()
    if not source.is_file():
        raise argparse.ArgumentTypeError(f"missing video: {source}")
    return name, source


def probe(source: Path) -> dict:
    out = subprocess.run(
        [
            "ffprobe", "-v", "error", "-select_streams", "v:0",
            "-show_entries", "stream=width,height,r_frame_rate,avg_frame_rate,nb_frames,duration",
            "-of", "json", str(source),
        ],
        check=True, capture_output=True, text=True,
    ).stdout
    stream = json.loads(out)["streams"][0]
    rate = Fraction(stream.get("avg_frame_rate") or stream["r_frame_rate"])
    if rate <= 0:
        rate = Fraction(stream["r_frame_rate"])
    return {
        "width": int(stream["width"]),
        "height": int(stream["height"]),
        "fps": rate,
        "frames": int(stream.get("nb_frames") or 0),
        "duration": float(stream.get("duration") or 0),
    }


def key_expression(contrast: float) -> str:
    """ffmpeg geq expressions: CSS contrast(), then alpha from the max channel."""
    def channel(expr: str) -> str:
        if contrast == 1:
            return f"clip({expr},0,255)"
        return f"clip(({expr}-127.5)*{contrast}+127.5,0,255)"

    return (
        f"geq=r='{channel('r(X,Y)')}':g='{channel('g(X,Y)')}':b='{channel('b(X,Y)')}'"
        f":a='{channel('max(max(r(X,Y),g(X,Y)),b(X,Y))')}'"
    )


def extract_frames(source: Path, workdir: Path, contrast: float) -> list[Path]:
    pattern = workdir / "frame-%05d.png"
    filters = ",".join([
        "format=rgba",
        key_expression(contrast),
        "unpremultiply=inplace=1",
        "format=rgba",
    ])
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-i", str(source), "-vf", filters, "-vsync", "passthrough", str(pattern)],
        check=True,
    )
    frames = sorted(workdir.glob("frame-*.png"))
    if not frames:
        raise RuntimeError(f"ffmpeg produced no frames for {source}")
    return frames


def finish_frame(image, saturation: float, alpha_floor: int):
    image = image.convert("RGBA")
    if saturation != 1:
        rgb = ImageEnhance.Color(image.convert("RGB")).enhance(saturation)
        image = Image.merge("RGBA", (*rgb.split(), image.getchannel("A")))
    if alpha_floor > 0:
        alpha = image.getchannel("A").point(lambda v: 0 if v < alpha_floor else v)
        image.putalpha(alpha)
    return image


def premultiplied(frame):
    r, g, b, a = frame.split()
    return Image.merge("RGB", [ImageChops.multiply(c, a) for c in (r, g, b)])


def dedupe_frames(frames, threshold: float):
    """Optionally share storage for consecutive frames that are visually identical.

    Off by default (``threshold`` 0): every source frame is stored. When
    enabled, playback timing is still untouched — every source frame keeps its
    slot in the returned ``sequence`` — and a frame only reuses the previous
    stored image when the *composited* (premultiplied) difference, blurred by
    one pixel to ignore codec speckle, nowhere exceeds ``threshold`` levels.
    A localized change such as a blink fails this test, so it is never lost.
    """
    sequence: list[int] = []
    unique = []
    previous = None
    for frame in frames:
        visible = premultiplied(frame)
        if unique and threshold > 0:
            r, g, b = ImageChops.difference(visible, previous).split()
            peak = ImageChops.lighter(ImageChops.lighter(r, g), b).filter(ImageFilter.GaussianBlur(1.0))
            histogram = peak.histogram()
            largest = max(value for value, count in enumerate(histogram) if count)
            if largest <= threshold:
                sequence.append(len(unique) - 1)
                continue
        unique.append(frame)
        previous = visible
        sequence.append(len(unique) - 1)
    return sequence, unique


def union_bbox(frames, pad: int, width: int, height: int) -> tuple[int, int, int, int]:
    left, top, right, bottom = width, height, 0, 0
    for frame in frames:
        box = frame.getchannel("A").getbbox()
        if not box:
            continue
        left, top = min(left, box[0]), min(top, box[1])
        right, bottom = max(right, box[2]), max(bottom, box[3])
    if right <= left or bottom <= top:
        return 0, 0, width, height
    return (
        max(0, left - pad), max(0, top - pad),
        min(width, right + pad), min(height, bottom + pad),
    )


def build_clip(job: dict) -> dict:
    """Worker: convert one video into strips and return its manifest entry."""
    name, source, out = job["name"], Path(job["source"]), Path(job["out"])
    info = probe(source)
    with tempfile.TemporaryDirectory(prefix=f"sprites-{name}-") as tmp:
        paths = extract_frames(source, Path(tmp), job["contrast"])
        frames = [finish_frame(Image.open(path), job["saturation"], job["alpha_floor"]) for path in paths]
    width, height = frames[0].size
    box = union_bbox(frames, job["pad"], width, height)
    crop_w, crop_h = box[2] - box[0], box[3] - box[1]
    per = job["frames_per_strip"]
    sequence, unique = dedupe_frames(frames, job["dedupe"])
    for old in out.glob(f"{name}-[0-9][0-9]*.webp"):
        old.unlink()
    strips = []
    total_bytes = 0
    for index in range(math.ceil(len(unique) / per)):
        chunk = unique[index * per:(index + 1) * per]
        strip = Image.new("RGBA", (crop_w * len(chunk), crop_h), (0, 0, 0, 0))
        for column, frame in enumerate(chunk):
            strip.paste(frame.crop(box), (column * crop_w, 0))
        file = out / f"{name}-{index:02d}.webp"
        strip.save(
            file, "WEBP", quality=job["quality"], alpha_quality=job["alpha_quality"],
            method=job["method"], exact=False,
        )
        strips.append(file.name)
        total_bytes += file.stat().st_size
    fps = info["fps"]
    entry = {
        "fps": float(fps) if fps.denominator != 1 else int(fps),
        "frames": len(frames),
        "duration": round(len(frames) / float(fps), 4),
        "loop": name in job["loop"],
        "crop": {"x": box[0], "y": box[1], "width": crop_w, "height": crop_h},
        "framesPerStrip": per,
        "stored": len(unique),
        "strips": strips,
    }
    if len(unique) < len(frames):
        entry["sequence"] = sequence
    return {
        "name": name,
        "entry": entry,
        "frameBox": {"width": width, "height": height},
        "bytes": total_bytes,
        "sourceBytes": source.stat().st_size,
    }


def build_still(source: Path, out: Path, contrast: float, saturation: float, alpha_floor: int, quality: int, method: int) -> str:
    """Key a black-backed still the same way as the video frames."""
    with tempfile.TemporaryDirectory(prefix="sprites-still-") as tmp:
        png = Path(tmp) / "still.png"
        subprocess.run(
            [
                "ffmpeg", "-v", "error", "-y", "-i", str(source), "-frames:v", "1",
                "-vf", ",".join(["format=rgba", key_expression(contrast), "unpremultiply=inplace=1", "format=rgba"]),
                str(png),
            ],
            check=True,
        )
        image = finish_frame(Image.open(png), saturation, alpha_floor)
    target = out / "still.webp"
    image.save(target, "WEBP", quality=quality, alpha_quality=100, method=method, exact=False)
    return target.name


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("clips", nargs="*", type=parse_clip, help="name=video.mp4 pairs")
    parser.add_argument("--out", required=True, type=Path, help="output directory (receives manifest.json and strips)")
    parser.add_argument("--still", type=Path, help="optional black-backed still to key into still.webp alongside")
    parser.add_argument("--loop", action="append", default=[], help="clip name that should loop (repeatable)")
    parser.add_argument("--frames-per-strip", type=int, default=8)
    parser.add_argument("--quality", type=int, default=90, help="WebP colour quality (0-100)")
    parser.add_argument("--alpha-quality", type=int, default=100, help="WebP alpha quality (100 = lossless alpha)")
    parser.add_argument("--method", type=int, default=4, help="WebP encoder effort (0 fast … 6 slow)")
    parser.add_argument("--contrast", type=float, default=1.0, help="CSS contrast() to bake in before keying")
    parser.add_argument("--saturation", type=float, default=1.0, help="CSS saturate() to bake in")
    parser.add_argument("--alpha-floor", type=int, default=2, help="alpha values below this become fully transparent")
    parser.add_argument("--pad", type=int, default=2, help="padding around the union crop box")
    parser.add_argument(
        "--dedupe", type=float, default=0,
        help="share storage for consecutive frames whose blurred composited difference never exceeds "
             "this many levels (0, the default, stores every frame)",
    )
    parser.add_argument("--jobs", type=int, default=max(1, min(4, (os.cpu_count() or 2) // 2)))
    args = parser.parse_args(argv)

    if PIL_IMPORT_ERROR:
        print(f"Pillow is required: {PIL_IMPORT_ERROR}", file=sys.stderr)
        return 2
    for tool in ("ffmpeg", "ffprobe"):
        if not shutil.which(tool):
            print(f"{tool} is required on PATH", file=sys.stderr)
            return 2
    if not args.clips and not args.still:
        parser.error("give at least one name=video clip or --still")

    out: Path = args.out
    out.mkdir(parents=True, exist_ok=True)
    manifest_path = out / "manifest.json"
    manifest = {"format": FORMAT, "frameBox": None, "clips": {}}
    if manifest_path.is_file():
        try:
            previous = json.loads(manifest_path.read_text())
            if previous.get("format") == FORMAT:
                manifest = previous
        except json.JSONDecodeError:
            pass

    jobs = [
        {
            "name": name, "source": str(source), "out": str(out), "loop": set(args.loop),
            "frames_per_strip": args.frames_per_strip, "quality": args.quality,
            "alpha_quality": args.alpha_quality, "method": args.method,
            "contrast": args.contrast, "saturation": args.saturation,
            "alpha_floor": args.alpha_floor, "pad": args.pad, "dedupe": args.dedupe,
        }
        for name, source in args.clips
    ]
    results = []
    if jobs:
        with ProcessPoolExecutor(max_workers=args.jobs) as pool:
            for result in pool.map(build_clip, jobs):
                results.append(result)
                entry = result["entry"]
                print(
                    f"{result['name']}: {entry['frames']} frames @ {entry['fps']}fps "
                    f"({entry['stored']} stored), crop {entry['crop']['width']}x{entry['crop']['height']}, "
                    f"{len(entry['strips'])} strips, {result['bytes'] / 1024:.0f} KB "
                    f"(video {result['sourceBytes'] / 1024:.0f} KB)"
                )
    for result in results:
        if manifest["frameBox"] and manifest["frameBox"] != result["frameBox"]:
            print(
                f"warning: {result['name']} frame box {result['frameBox']} differs from "
                f"manifest frame box {manifest['frameBox']}", file=sys.stderr,
            )
        manifest["frameBox"] = manifest["frameBox"] or result["frameBox"]
        manifest["clips"][result["name"]] = result["entry"]

    if args.still:
        manifest["still"] = build_still(
            args.still, out, args.contrast, args.saturation, args.alpha_floor, args.quality, args.method,
        )
        print(f"still: {manifest['still']} ({(out / manifest['still']).stat().st_size / 1024:.0f} KB)")

    manifest["look"] = {"contrast": args.contrast, "saturation": args.saturation}
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"wrote {manifest_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
