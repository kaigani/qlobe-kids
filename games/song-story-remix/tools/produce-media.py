#!/usr/bin/env python3
"""Produce and verify Song Story Remix media on the approved local API.

The driver is deliberately resumable. Model candidates and sanitized receipts
are retained below ``assets/source``; runtime files are published only after
their deterministic image/audio gates pass. The configured LAN host and the
absolute teacher-reference path are read at runtime and never written to a
receipt.
"""
from __future__ import annotations

import argparse
import difflib
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from collections import Counter
from io import BytesIO
from pathlib import Path
from typing import Any

from PIL import Image, ImageOps


GAME = Path(__file__).resolve().parents[1]
REPO = GAME.parents[1]
LOCAL_STATE = REPO / "tools" / "state" / "local.json"
VOICE_REFERENCE = REPO / "shared" / "assets" / "refs" / "voice-teacher.wav"

AUDIO = GAME / "assets" / "audio"
LINES_PATH = AUDIO / "lines.json"
MANIFEST_PATH = AUDIO / "manifest.json"
VOICE_QA_PATH = AUDIO / "qa.json"
VOICE_SOURCE = GAME / "assets" / "source" / "local-api" / "voice"

KREA_SOURCE = GAME / "assets" / "source" / "krea" / "hub-seed42.png"
KREA_RECIPE = GAME / "assets" / "source" / "krea" / "hub-seed42.recipe.json"
HUB_TILE = REPO / "assets" / "hub" / "tiles" / "song-story-remix.jpg"

CARD_SOURCE = GAME / "assets" / "source" / "gpt-image-2" / "song-cards-sheet.png"
LAYERED = GAME / "assets" / "source" / "local-api" / "layered"
LAYERED_SOURCE = LAYERED / "song-cards-seed42-layer-2.png"
LAYERED_PREVIEW = LAYERED / "song-cards-seed42-magenta.png"
LAYERED_RECIPE = LAYERED / "song-cards-seed42.recipe.json"

VOICE_SEEDS = (7, 8, 9)
VOICE_THRESHOLD = {"similarity": 0.90, "wordCoverage": 0.94}

HUB_PROMPT = (
    "Original premium Kawaii preschool game tile: an open cream songbook on a tiny "
    "plum velvet theater stage, a smiling golden star, green frog, pink songbird and "
    "orange tiger peeking from the pages, floating candy-colored music notes, "
    "plush-vinyl and glossy clay materials, antique gold trim, rich plum and teal "
    "lighting, centered readable silhouette, warm joyful glow, no text, no letters, "
    "no logos, no watermark, no device frame."
)

LAYERED_PROMPT = (
    "Separate the exact three complete storybook song cards from the uniform dark "
    "background into the foreground subject layer. Preserve every card pixel, gold "
    "corner, bookmark, and silhouette; do not redesign, merge, crop, recolor, add, or "
    "delete anything. Output all three isolated cards with clean transparent edges."
)

LINES: dict[str, str] = {
    "welcome": "Welcome to Song Story Remix! Pick a song and make it yours.",
    "choose-song": "Pick a song book.",
    "remix": "Tap a picture to change the story.",
    "choose-singer": "Now pick who will lead your song.",
    "ready": "Ready? Listen once, or record your own show.",
    "camera-choice": "Camera and microphone are optional. You can sing without them.",
    "recording": "Sing it your way!",
    "saved": "Your remix is saved on this device.",
    "media-fallback": "No camera? No problem. The show goes on!",
    "library-empty": "Your remixes will appear here.",
    "replay": "Here comes your remix!",
    "nudge": "Tap a picture and hear the story change.",
    "one-more": "Make another remix!",
    "deleted": "That remix is gone.",
}


class ProductionError(RuntimeError):
    """A fail-closed production or validation error."""


def read_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return {}
    return value if isinstance(value, dict) else {}


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(
        json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    temporary.replace(path)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def text_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def repo_path(path: Path) -> str:
    return path.relative_to(REPO).as_posix()


def configured_api() -> str:
    value = os.environ.get("QLOBE_QWEN_URL") or read_json(LOCAL_STATE).get("qwenUrl")
    if not value:
        raise ProductionError("approved LAN endpoint is not configured")
    return str(value).rstrip("/")


def multipart_body(
    fields: dict[str, str], files: dict[str, tuple[Path, str]] | None = None
) -> tuple[bytes, str]:
    boundary = "----qlobe-song-remix-" + os.urandom(12).hex()
    body = bytearray()
    for name, value in fields.items():
        body.extend(
            (
                f"--{boundary}\r\n"
                f'Content-Disposition: form-data; name="{name}"\r\n\r\n'
                f"{value}\r\n"
            ).encode("utf-8")
        )
    for name, (path, mime) in (files or {}).items():
        body.extend(
            (
                f"--{boundary}\r\n"
                f'Content-Disposition: form-data; name="{name}"; '
                f'filename="{path.name}"\r\n'
                f"Content-Type: {mime}\r\n\r\n"
            ).encode("utf-8")
        )
        body.extend(path.read_bytes())
        body.extend(b"\r\n")
    body.extend(f"--{boundary}--\r\n".encode("ascii"))
    return bytes(body), boundary


def post_multipart(
    url: str,
    fields: dict[str, str],
    files: dict[str, tuple[Path, str]] | None = None,
    timeout: int = 900,
) -> bytes:
    body, boundary = multipart_body(fields, files)
    request = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.read()
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        raise ProductionError("local workflow request failed") from error


def get_bytes(url: str, timeout: int = 900) -> bytes:
    try:
        with urllib.request.urlopen(url, timeout=timeout) as response:
            return response.read()
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        raise ProductionError("local workflow result request failed") from error


def get_json(url: str, timeout: int = 60) -> dict[str, Any]:
    try:
        value = json.loads(get_bytes(url, timeout))
    except json.JSONDecodeError as error:
        raise ProductionError("local workflow returned invalid job metadata") from error
    if not isinstance(value, dict):
        raise ProductionError("local workflow returned unexpected job metadata")
    return value


def inspect_image(path: Path, require_alpha: bool = False) -> dict[str, Any]:
    if not path.is_file() or path.stat().st_size < 2_000:
        raise ProductionError(f"missing or undersized image: {repo_path(path)}")
    try:
        with Image.open(path) as opened:
            opened.load()
            width, height = opened.size
            image_format = opened.format
            mode = opened.mode
            info = dict(opened.info)
            rgba = opened.convert("RGBA")
    except Exception as error:
        raise ProductionError(f"invalid image: {repo_path(path)}") from error
    if width < 64 or height < 64:
        raise ProductionError(f"implausible image dimensions: {repo_path(path)}")
    result: dict[str, Any] = {
        "dimensions": [width, height],
        "format": image_format,
        "mode": mode,
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
    }
    if image_format == "JPEG":
        result["progressive"] = bool(info.get("progressive") or info.get("progression"))
    if require_alpha:
        alpha = rgba.getchannel("A")
        extrema = alpha.getextrema()
        histogram = alpha.histogram()
        pixels = width * height
        transparent = sum(histogram[:255]) / pixels
        clear = sum(histogram[:8]) / pixels
        opaque = histogram[255] / pixels
        bbox = alpha.point(lambda value: 255 if value > 8 else 0).getbbox()
        result["alpha"] = {
            "extrema": list(extrema),
            "transparentFraction": round(transparent, 6),
            "clearFraction": round(clear, 6),
            "opaqueFraction": round(opaque, 6),
            "visibleBbox": list(bbox) if bbox else None,
        }
        if extrema[0] == 255 or not bbox or transparent < 0.01 or opaque < 0.01:
            raise ProductionError("layer_2 failed basic transparency QA")
    return result


def atomic_bytes(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_bytes(data)
    temporary.replace(path)


def hub_receipt_matches() -> bool:
    recipe = read_json(KREA_RECIPE)
    try:
        source = inspect_image(KREA_SOURCE)
    except ProductionError:
        return False
    return bool(
        recipe.get("workflow") == "krea2-turbo-t2i"
        and recipe.get("prompt") == HUB_PROMPT
        and recipe.get("seed") == 42
        and recipe.get("width") == 768
        and recipe.get("height") == 640
        and recipe.get("steps") == 8
        and recipe.get("cfg") == 1
        and recipe.get("sourceSha256") == source["sha256"]
        and source["dimensions"] == [768, 640]
    )


def render_hub_tile() -> dict[str, Any]:
    with Image.open(KREA_SOURCE) as opened:
        source = opened.convert("RGB")
        fitted = ImageOps.fit(
            source, (640, 533), method=Image.Resampling.LANCZOS, centering=(0.5, 0.5)
        )
    HUB_TILE.parent.mkdir(parents=True, exist_ok=True)
    temporary = HUB_TILE.with_name(HUB_TILE.stem + ".tmp.jpg")
    fitted.save(temporary, "JPEG", quality=90, optimize=True, progressive=True)
    temporary.replace(HUB_TILE)
    result = inspect_image(HUB_TILE)
    if result["format"] != "JPEG" or result["dimensions"] != [640, 533]:
        raise ProductionError("hub tile encoding QA failed")
    if not result.get("progressive"):
        raise ProductionError("hub tile is not progressive JPEG")
    return result


def produce_hub(api_base: str, force: bool, timeout: int) -> dict[str, Any]:
    if force or not hub_receipt_matches():
        print("hub: requesting Krea 2 source (seed 42)", flush=True)
        data = post_multipart(
            f"{api_base}/workflows/krea2-turbo-t2i?sync=true",
            {
                "prompt": HUB_PROMPT,
                "seed": "42",
                "width": "768",
                "height": "640",
                "steps": "8",
                "cfg": "1",
            },
            timeout=timeout,
        )
        try:
            with Image.open(BytesIO(data)) as opened:
                opened.load()
                if opened.size != (768, 640):
                    raise ProductionError("Krea source dimensions were not 768x640")
                normalized = opened.convert("RGB")
        except ProductionError:
            raise
        except Exception as error:
            raise ProductionError("Krea response was not a valid image") from error
        KREA_SOURCE.parent.mkdir(parents=True, exist_ok=True)
        temporary = KREA_SOURCE.with_name(KREA_SOURCE.name + ".tmp")
        normalized.save(temporary, "PNG", optimize=True)
        temporary.replace(KREA_SOURCE)
    else:
        print("hub: reusing verified Krea source", flush=True)
    source_info = inspect_image(KREA_SOURCE)
    tile_info = render_hub_tile()
    receipt = {
        "format": "song-story-remix-krea-recipe-v1",
        "workflow": "krea2-turbo-t2i",
        "prompt": HUB_PROMPT,
        "seed": 42,
        "width": 768,
        "height": 640,
        "steps": 8,
        "cfg": 1,
        "source": repo_path(KREA_SOURCE),
        "sourceSha256": source_info["sha256"],
        "output": repo_path(HUB_TILE),
        "outputSha256": tile_info["sha256"],
        "transform": {
            "operation": "center-cover",
            "dimensions": [640, 533],
            "format": "progressive JPEG",
            "quality": 90,
        },
        "qa": {
            "sourceDimensions": source_info["dimensions"],
            "outputDimensions": tile_info["dimensions"],
            "progressive": tile_info["progressive"],
            "valid": True,
        },
    }
    write_json(KREA_RECIPE, receipt)
    print("hub: complete (640x533 progressive JPEG)", flush=True)
    return receipt


def layered_receipt_matches() -> bool:
    recipe = read_json(LAYERED_RECIPE)
    try:
        source_hash = sha256(CARD_SOURCE)
        result = inspect_image(LAYERED_SOURCE, require_alpha=True)
        layout = card_layout_qa(LAYERED_SOURCE)
        preview = inspect_image(LAYERED_PREVIEW)
    except (OSError, ProductionError):
        return False
    recorded_qa = recipe.get("qa", {})
    return bool(
        recipe.get("workflow") == "qwen-image-layered"
        and recipe.get("prompt") == LAYERED_PROMPT
        and recipe.get("layers") == 2
        and recipe.get("seed") == 42
        and recipe.get("selectedOutput") == "layer_2"
        and recipe.get("sourceSha256") == source_hash
        and recipe.get("outputSha256") == result["sha256"]
        and recipe.get("previewSha256") == preview["sha256"]
        and layout["mechanicalValid"]
        # Accept the first receipt shape long enough to upgrade it in place;
        # all newly written receipts distinguish mechanical QA from the
        # deliberately pending human visual review.
        and (
            recorded_qa.get("mechanicalValid") is True
            or recorded_qa.get("valid") is True
        )
    )


def save_magenta_preview(source: Path, destination: Path) -> dict[str, Any]:
    with Image.open(source) as opened:
        rgba = opened.convert("RGBA")
    matte = Image.new("RGBA", rgba.size, (255, 0, 255, 255))
    matte.alpha_composite(rgba)
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_name(destination.name + ".tmp")
    matte.convert("RGB").save(temporary, "PNG", optimize=True)
    temporary.replace(destination)
    return inspect_image(destination)


def card_layout_qa(path: Path) -> dict[str, Any]:
    """Require three separated, substantial alpha subjects across the sheet.

    This is intentionally a mechanical gate, not a claim of pixel identity.
    The retained magenta preview remains the authority for visual acceptance.
    """
    with Image.open(path) as opened:
        alpha = opened.convert("RGBA").getchannel("A")
    sample_width = 256
    sample_height = max(64, round(alpha.height * sample_width / alpha.width))
    mask = alpha.resize((sample_width, sample_height), Image.Resampling.BOX).point(
        lambda value: 255 if value > 32 else 0
    )
    pixels = mask.load()
    seen: set[tuple[int, int]] = set()
    components: list[dict[str, Any]] = []
    minimum_area = mask.width * mask.height * 0.03
    for y in range(mask.height):
        for x in range(mask.width):
            if not pixels[x, y] or (x, y) in seen:
                continue
            stack = [(x, y)]
            seen.add((x, y))
            area = 0
            left = right = x
            top = bottom = y
            while stack:
                current_x, current_y = stack.pop()
                area += 1
                left, right = min(left, current_x), max(right, current_x)
                top, bottom = min(top, current_y), max(bottom, current_y)
                for neighbor in (
                    (current_x - 1, current_y),
                    (current_x + 1, current_y),
                    (current_x, current_y - 1),
                    (current_x, current_y + 1),
                ):
                    nx, ny = neighbor
                    if (
                        0 <= nx < mask.width
                        and 0 <= ny < mask.height
                        and pixels[nx, ny]
                        and neighbor not in seen
                    ):
                        seen.add(neighbor)
                        stack.append(neighbor)
            if area >= minimum_area:
                components.append(
                    {
                        "areaFraction": round(area / (mask.width * mask.height), 4),
                        "bbox": [left, top, right + 1, bottom + 1],
                        "centerXFraction": round((left + right + 1) / (2 * mask.width), 4),
                    }
                )
    components.sort(key=lambda component: component["centerXFraction"])
    centers = [component["centerXFraction"] for component in components]
    regions_ok = bool(
        len(centers) == 3
        and 0.05 <= centers[0] <= 0.30
        and 0.36 <= centers[1] <= 0.64
        and 0.70 <= centers[2] <= 0.95
    )
    return {
        "mechanicalValid": regions_ok,
        "largeComponentCount": len(components),
        "components": components,
        "sampleDimensions": [mask.width, mask.height],
    }


def produce_layered(
    api_base: str, force: bool, timeout: int, poll_seconds: float
) -> dict[str, Any]:
    if not CARD_SOURCE.is_file():
        raise ProductionError("song card source is missing")
    if not force and layered_receipt_matches():
        print("layered: reusing verified layer_2 result", flush=True)
        receipt = read_json(LAYERED_RECIPE)
        receipt_qa = receipt.setdefault("qa", {})
        receipt_qa.pop("valid", None)
        receipt_qa.update(card_layout_qa(LAYERED_SOURCE))
        receipt_qa["reviewStatus"] = "accepted-as-runtime-alpha-mask"
        receipt_qa["promotedToRuntime"] = True
        write_json(LAYERED_RECIPE, receipt)
        return receipt

    print("layered: submitting exact-card extraction (seed 42)", flush=True)
    payload = post_multipart(
        f"{api_base}/workflows/qwen-image-layered",
        {"prompt": LAYERED_PROMPT, "layers": "2", "seed": "42"},
        {"image": (CARD_SOURCE, "image/png")},
        timeout=timeout,
    )
    try:
        submission = json.loads(payload)
    except json.JSONDecodeError as error:
        raise ProductionError("Layered submission did not return JSON") from error
    if not isinstance(submission, dict):
        raise ProductionError("Layered submission returned unexpected metadata")
    job_id = submission.get("job_id") or submission.get("id")
    if not job_id:
        raise ProductionError("Layered submission returned no job id")

    deadline = time.monotonic() + timeout
    next_notice = time.monotonic() + 30
    while time.monotonic() < deadline:
        state = get_json(f"{api_base}/jobs/{job_id}")
        status = str(state.get("status") or "").lower()
        if status in {"completed", "complete", "succeeded", "success"}:
            break
        if status in {"failed", "error", "cancelled", "canceled"}:
            raise ProductionError("Layered workflow failed")
        if time.monotonic() >= next_notice:
            print("layered: still processing locally", flush=True)
            next_notice = time.monotonic() + 30
        time.sleep(max(0.2, poll_seconds))
    else:
        raise ProductionError("Layered workflow timed out")

    # Intentionally fetch exactly one output. Other layers are not requested.
    result_bytes = get_bytes(
        f"{api_base}/jobs/{job_id}/result?output=layer_2", timeout=timeout
    )
    LAYERED_SOURCE.parent.mkdir(parents=True, exist_ok=True)
    temporary = LAYERED_SOURCE.with_name(LAYERED_SOURCE.name + ".tmp")
    temporary.write_bytes(result_bytes)
    try:
        with Image.open(temporary) as opened:
            opened.load()
            if opened.format != "PNG":
                raise ProductionError("Layered layer_2 was not PNG")
    except ProductionError:
        temporary.unlink(missing_ok=True)
        raise
    except Exception as error:
        temporary.unlink(missing_ok=True)
        raise ProductionError("Layered layer_2 was not a valid image") from error
    temporary.replace(LAYERED_SOURCE)
    result_info = inspect_image(LAYERED_SOURCE, require_alpha=True)
    layout_info = card_layout_qa(LAYERED_SOURCE)
    if not layout_info["mechanicalValid"]:
        raise ProductionError("layer_2 did not contain three separated card subjects")
    preview_info = save_magenta_preview(LAYERED_SOURCE, LAYERED_PREVIEW)
    receipt = {
        "format": "song-story-remix-layered-recipe-v1",
        "workflow": "qwen-image-layered",
        "prompt": LAYERED_PROMPT,
        "layers": 2,
        "seed": 42,
        "selectedOutput": "layer_2",
        "source": repo_path(CARD_SOURCE),
        "sourceSha256": sha256(CARD_SOURCE),
        "output": repo_path(LAYERED_SOURCE),
        "outputSha256": result_info["sha256"],
        "preview": repo_path(LAYERED_PREVIEW),
        "previewSha256": preview_info["sha256"],
        "qa": {
            "dimensions": result_info["dimensions"],
            "mode": result_info["mode"],
            "alpha": result_info["alpha"],
            **layout_info,
            "reviewStatus": "accepted-as-runtime-alpha-mask",
            "promotedToRuntime": True,
        },
    }
    write_json(LAYERED_RECIPE, receipt)
    print("layered: complete; layer_2 accepted as the runtime card alpha mask", flush=True)
    return receipt


def run(command: list[str], timeout: int = 930) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(command, capture_output=True, text=True, timeout=timeout)
    except (OSError, subprocess.TimeoutExpired) as error:
        raise ProductionError("local media command failed") from error


def duration(path: Path) -> float:
    result = run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(path),
        ],
        30,
    )
    try:
        return round(float(result.stdout.strip()), 3)
    except (TypeError, ValueError):
        return 0.0


def mean_volume(path: Path) -> float | None:
    result = run(
        [
            "ffmpeg",
            "-hide_banner",
            "-nostats",
            "-i",
            str(path),
            "-af",
            "volumedetect",
            "-f",
            "null",
            "-",
        ],
        60,
    )
    match = re.search(r"mean_volume:\s*(-?[0-9.]+) dB", result.stderr)
    return round(float(match.group(1)), 1) if match else None


def audio_stream(path: Path) -> dict[str, Any]:
    result = run(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "a:0",
            "-show_entries",
            "stream=codec_name,channels,sample_rate",
            "-of",
            "json",
            str(path),
        ],
        30,
    )
    try:
        streams = json.loads(result.stdout).get("streams", [])
        return streams[0] if streams else {}
    except (json.JSONDecodeError, AttributeError, IndexError):
        return {}


def faststart(path: Path) -> bool:
    try:
        data = path.read_bytes()
    except OSError:
        return False
    # Parse top-level ISO-BMFF atoms instead of searching arbitrary payload
    # bytes, where the strings "moov" or "mdat" could occur by coincidence.
    offset = 0
    positions: dict[bytes, int] = {}
    while offset + 8 <= len(data):
        size = int.from_bytes(data[offset : offset + 4], "big")
        atom_type = data[offset + 4 : offset + 8]
        header = 8
        if size == 1:
            if offset + 16 > len(data):
                return False
            size = int.from_bytes(data[offset + 8 : offset + 16], "big")
            header = 16
        elif size == 0:
            size = len(data) - offset
        if size < header or offset + size > len(data):
            return False
        positions.setdefault(atom_type, offset)
        offset += size
    return b"moov" in positions and b"mdat" in positions and positions[b"moov"] < positions[b"mdat"]


def inspect_audio(path: Path) -> dict[str, Any]:
    if not path.is_file() or path.stat().st_size < 2_000:
        return {"valid": False, "error": "missing or undersized AAC"}
    seconds = duration(path)
    volume = mean_volume(path)
    stream = audio_stream(path)
    try:
        channels = int(stream.get("channels", 0))
        sample_rate = int(stream.get("sample_rate", 0))
    except (TypeError, ValueError):
        channels, sample_rate = 0, 0
    is_faststart = faststart(path)
    valid = bool(
        0.35 <= seconds <= 24.0
        and volume is not None
        and -36.0 <= volume <= -5.0
        and stream.get("codec_name") == "aac"
        and channels == 1
        and sample_rate == 24000
        and is_faststart
    )
    return {
        "valid": valid,
        "duration": seconds,
        "meanVolumeDb": volume,
        "codec": stream.get("codec_name"),
        "channels": channels,
        "sampleRate": sample_rate,
        "faststart": is_faststart,
        "bytes": path.stat().st_size,
        "audioSha256": sha256(path),
    }


def normalize_text(text: str) -> str:
    return " ".join(re.findall(r"[a-z0-9]+", text.lower()))


def transcript_score(expected: str, heard: str) -> tuple[bool, float, float, bool]:
    wanted = normalize_text(expected)
    received = normalize_text(heard)
    exact = bool(wanted and wanted == received)
    similarity = difflib.SequenceMatcher(None, wanted, received).ratio()
    expected_counts = Counter(wanted.split())
    heard_counts = Counter(received.split())
    matched_words = sum(
        min(count, heard_counts.get(word, 0)) for word, count in expected_counts.items()
    )
    coverage = matched_words / max(1, sum(expected_counts.values()))
    accepted = exact or (
        similarity >= VOICE_THRESHOLD["similarity"]
        and coverage >= VOICE_THRESHOLD["wordCoverage"]
    )
    return accepted, round(similarity, 3), round(coverage, 3), exact


def candidate_paths(key: str, seed: int) -> tuple[Path, Path]:
    stem = f"{key}-seed{seed}"
    return VOICE_SOURCE / f"{stem}.m4a", VOICE_SOURCE / f"{stem}.recipe.json"


def clone_voice(
    api_base: str,
    reference: Path,
    text: str,
    seed: int,
    destination: Path,
    timeout: int,
) -> dict[str, Any]:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="song-remix-voice-") as directory:
        raw = Path(directory) / "take.flac"
        response = run(
            [
                "curl",
                "-sS",
                "-X",
                "POST",
                f"{api_base}/workflows/qwen3-tts-voiceclone?sync=true",
                "-F",
                f"voice=@{reference}",
                "-F",
                f"text={text}",
                "-F",
                f"seed={seed}",
                "--output",
                str(raw),
                "--max-time",
                str(timeout),
            ],
            timeout + 30,
        )
        if response.returncode or not raw.is_file() or raw.stat().st_size < 2_000:
            return {"generated": False, "error": "voice clone request failed"}
        temporary = destination.with_name(destination.name + ".tmp.m4a")
        encoded = run(
            [
                "ffmpeg",
                "-y",
                "-loglevel",
                "error",
                "-i",
                str(raw),
                "-af",
                "silenceremove=start_periods=1:start_silence=0.04:start_threshold=-45dB,"
                "areverse,silenceremove=start_periods=1:start_silence=0.10:"
                "start_threshold=-45dB,areverse,loudnorm=I=-18:TP=-2:LRA=9",
                "-c:a",
                "aac",
                "-b:a",
                "96k",
                "-ar",
                "24000",
                "-ac",
                "1",
                "-movflags",
                "+faststart",
                str(temporary),
            ],
            120,
        )
        if encoded.returncode:
            temporary.unlink(missing_ok=True)
            return {"generated": False, "error": "AAC normalization failed"}
        audio = inspect_audio(temporary)
        if not audio.get("valid"):
            temporary.unlink(missing_ok=True)
            return {"generated": False, "error": "normalized audio failed QA", **audio}
        temporary.replace(destination)
    return {"generated": True, **inspect_audio(destination)}


def transcribe(api_base: str, audio: Path, expected: str, timeout: int) -> str:
    response = run(
        [
            "curl",
            "-sS",
            "-X",
            "POST",
            f"{api_base}/workflows/whisper-stt?sync=true",
            "-F",
            f"audio=@{audio}",
            "-F",
            "model_size=base",
            "-F",
            "language=en",
            "-F",
            f"initial_prompt={expected}",
            "--max-time",
            str(timeout),
        ],
        timeout + 30,
    )
    if response.returncode:
        return ""
    try:
        payload = json.loads(response.stdout)
    except json.JSONDecodeError:
        return ""
    if not isinstance(payload, dict):
        return ""
    return str(payload.get("text") or payload.get("transcript") or "").strip()


def cached_candidate(
    key: str, text: str, seed: int, reference_hash: str
) -> tuple[Path, dict[str, Any]] | None:
    candidate, sidecar = candidate_paths(key, seed)
    receipt = read_json(sidecar)
    if not candidate.is_file():
        return None
    audio = inspect_audio(candidate)
    if not audio.get("valid"):
        return None
    if not (
        receipt.get("generated") is True
        and receipt.get("engine") == "qwen3-tts-voiceclone"
        and receipt.get("seed") == seed
        and receipt.get("textHash") == text_hash(text)
        and receipt.get("voiceRefSha256") == reference_hash
        and receipt.get("audioSha256") == audio.get("audioSha256")
    ):
        return None
    return candidate, receipt


def verification_from_receipt(
    receipt: dict[str, Any], expected: str, audio_hash: str
) -> dict[str, Any] | None:
    verification = receipt.get("verification")
    if not isinstance(verification, dict):
        return None
    if verification.get("audioSha256") != audio_hash:
        return None
    match, similarity, coverage, exact = transcript_score(
        expected, str(verification.get("transcript") or "")
    )
    if (
        verification.get("similarity") != similarity
        or verification.get("wordCoverage") != coverage
        or verification.get("exact") is not exact
        or verification.get("valid") is not match
    ):
        return None
    return verification


def publish_clip(candidate: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_name(destination.name + ".tmp")
    shutil.copy2(candidate, temporary)
    temporary.replace(destination)


def accepted_voice_entry(
    key: str, text: str, qa: dict[str, Any], reference_hash: str
) -> bool:
    entry = qa.get(key)
    runtime = AUDIO / f"{key}.m4a"
    if not isinstance(entry, dict) or not runtime.is_file():
        return False
    audio = inspect_audio(runtime)
    match, similarity, coverage, exact = transcript_score(
        text, str(entry.get("transcript") or "")
    )
    return bool(
        entry.get("valid") is True
        and entry.get("engine") == "qwen3-tts-voiceclone"
        and entry.get("verifier") == "whisper-stt/base/en"
        and entry.get("textHash") == text_hash(text)
        and entry.get("voiceRefSha256") == reference_hash
        and entry.get("audioSha256") == audio.get("audioSha256")
        and audio.get("valid")
        and match
        and entry.get("similarity") == similarity
        and entry.get("wordCoverage") == coverage
        and entry.get("exact") is exact
    )


def write_voice_outputs(qa: dict[str, Any], reference_hash: str) -> tuple[int, list[str]]:
    manifest: dict[str, dict[str, Any]] = {}
    for key, text in LINES.items():
        if accepted_voice_entry(key, text, qa, reference_hash):
            runtime = AUDIO / f"{key}.m4a"
            manifest[key] = {
                "file": runtime.name,
                "dur": duration(runtime),
                "textHash": text_hash(text),
            }
    write_json(MANIFEST_PATH, manifest)
    write_json(VOICE_QA_PATH, qa)
    failures = [key for key in LINES if key not in manifest]
    return len(manifest), failures


def produce_voice(api_base: str, force: bool, timeout: int) -> tuple[int, list[str]]:
    for binary in ("curl", "ffmpeg", "ffprobe"):
        if not shutil.which(binary):
            raise ProductionError(f"required media binary is missing: {binary}")
    if not VOICE_REFERENCE.is_file() or VOICE_REFERENCE.stat().st_size < 2_000:
        raise ProductionError("approved teacher voice reference is missing")
    AUDIO.mkdir(parents=True, exist_ok=True)
    VOICE_SOURCE.mkdir(parents=True, exist_ok=True)
    write_json(LINES_PATH, LINES)
    reference_hash = sha256(VOICE_REFERENCE)
    qa = read_json(VOICE_QA_PATH)
    qa = {key: value for key, value in qa.items() if key in LINES}
    pending: list[str] = []
    for key, text in LINES.items():
        if not force and accepted_voice_entry(key, text, qa, reference_hash):
            print(f"voice {key}: cached and verified", flush=True)
        else:
            pending.append(key)

    for seed in VOICE_SEEDS:
        if not pending:
            break
        print(f"voice: seed {seed}, {len(pending)} pending line(s)", flush=True)
        retry: list[str] = []
        for index, key in enumerate(pending, 1):
            text = LINES[key]
            candidate, sidecar = candidate_paths(key, seed)
            cached = None if force else cached_candidate(key, text, seed, reference_hash)
            if cached:
                candidate, receipt = cached
                print(f"  [{index}/{len(pending)}] {key}: reusing candidate", flush=True)
            else:
                generated = clone_voice(
                    api_base, VOICE_REFERENCE, text, seed, candidate, timeout
                )
                receipt = {
                    "format": "song-story-remix-voice-candidate-v1",
                    "engine": "qwen3-tts-voiceclone",
                    "voice": "approved-teacher-reference",
                    "voiceRefSha256": reference_hash,
                    "seed": seed,
                    "sourceText": text,
                    "textHash": text_hash(text),
                    **generated,
                }
                write_json(sidecar, receipt)
                if not generated.get("generated"):
                    attempts = [
                        attempt
                        for attempt in qa.get(key, {}).get("attempts", [])
                        if attempt.get("seed") != seed
                    ]
                    attempts.append(
                        {"seed": seed, "valid": False, "error": generated.get("error")}
                    )
                    qa[key] = {
                        "sourceText": text,
                        "textHash": text_hash(text),
                        "valid": False,
                        "error": generated.get("error"),
                        "attempts": attempts,
                    }
                    retry.append(key)
                    print(
                        f"  [{index}/{len(pending)}] {key}: generation failed; retry",
                        flush=True,
                    )
                    continue

            audio = inspect_audio(candidate)
            verification = None if force else verification_from_receipt(
                receipt, text, str(audio.get("audioSha256") or "")
            )
            if verification is None:
                heard = transcribe(api_base, candidate, text, timeout)
                match, similarity, coverage, exact = transcript_score(text, heard)
                verification = {
                    "workflow": "whisper-stt",
                    "modelSize": "base",
                    "language": "en",
                    "audioSha256": audio.get("audioSha256"),
                    "transcript": heard,
                    "similarity": similarity,
                    "wordCoverage": coverage,
                    "exact": exact,
                    "valid": bool(match and audio.get("valid")),
                    "thresholds": VOICE_THRESHOLD,
                    "error": None
                    if match and audio.get("valid")
                    else ("Whisper mismatch" if not match else "audio QA failed"),
                }
                receipt["verification"] = verification
                write_json(sidecar, receipt)
            prior_attempts = [
                attempt
                for attempt in qa.get(key, {}).get("attempts", [])
                if attempt.get("seed") != seed
            ]
            attempt = {
                "seed": seed,
                "valid": verification["valid"],
                "transcript": verification["transcript"],
                "similarity": verification["similarity"],
                "wordCoverage": verification["wordCoverage"],
                "exact": verification["exact"],
                "duration": audio.get("duration"),
                "meanVolumeDb": audio.get("meanVolumeDb"),
                "error": verification.get("error"),
            }
            attempts = prior_attempts + [attempt]
            if verification["valid"]:
                runtime = AUDIO / f"{key}.m4a"
                publish_clip(candidate, runtime)
                runtime_audio = inspect_audio(runtime)
                qa[key] = {
                    "engine": "qwen3-tts-voiceclone",
                    "verifier": "whisper-stt/base/en",
                    "voice": "approved-teacher-reference",
                    "voiceRefSha256": reference_hash,
                    "seed": seed,
                    "sourceText": text,
                    "textHash": text_hash(text),
                    **{name: runtime_audio[name] for name in (
                        "duration", "meanVolumeDb", "codec", "channels", "sampleRate",
                        "faststart", "bytes", "audioSha256"
                    )},
                    "transcript": verification["transcript"],
                    "similarity": verification["similarity"],
                    "wordCoverage": verification["wordCoverage"],
                    "exact": verification["exact"],
                    "thresholds": VOICE_THRESHOLD,
                    "valid": True,
                    "attempts": attempts,
                }
                print(
                    f"  [{index}/{len(pending)}] {key}: accepted seed {seed} "
                    f"(sim={verification['similarity']:.3f}, "
                    f"coverage={verification['wordCoverage']:.3f})",
                    flush=True,
                )
            else:
                qa[key] = {
                    "sourceText": text,
                    "textHash": text_hash(text),
                    "valid": False,
                    "error": verification.get("error"),
                    "attempts": attempts,
                }
                retry.append(key)
                print(
                    f"  [{index}/{len(pending)}] {key}: rejected seed {seed} "
                    f"(sim={verification['similarity']:.3f}, "
                    f"coverage={verification['wordCoverage']:.3f})",
                    flush=True,
                )
        pending = retry
        # Persist at each completed seed so an interruption resumes from the
        # accepted set without repeatedly probing every clip after every line.
        write_voice_outputs(qa, reference_hash)

    accepted, failures = write_voice_outputs(qa, reference_hash)
    print(f"voice: complete {accepted}/{len(LINES)}; failures={failures}", flush=True)
    return accepted, failures


def check_hub() -> list[str]:
    errors = []
    if not hub_receipt_matches():
        return ["hub source or recipe is missing/stale"]
    try:
        tile = inspect_image(HUB_TILE)
        recipe = read_json(KREA_RECIPE)
        if tile["format"] != "JPEG" or tile["dimensions"] != [640, 533]:
            errors.append("hub tile format or dimensions are invalid")
        if not tile.get("progressive"):
            errors.append("hub tile is not progressive")
        if recipe.get("outputSha256") != tile["sha256"]:
            errors.append("hub tile hash does not match recipe")
    except ProductionError as error:
        errors.append(str(error))
    return errors


def check_layered() -> list[str]:
    if not layered_receipt_matches():
        return ["layer_2 output, magenta preview, or recipe is missing/stale"]
    return []


def check_voice() -> list[str]:
    errors = []
    if read_json(LINES_PATH) != LINES:
        errors.append("lines.json is missing or differs from the approved mapping")
    if not VOICE_REFERENCE.is_file():
        errors.append("approved teacher reference is missing")
        return errors
    reference_hash = sha256(VOICE_REFERENCE)
    qa = read_json(VOICE_QA_PATH)
    manifest = read_json(MANIFEST_PATH)
    if set(manifest) != set(LINES):
        errors.append("manifest is not exactly the 14 approved clips")
    if set(qa) != set(LINES):
        errors.append("voice QA is not exactly the 14 approved lines")
    for key, text in LINES.items():
        if not accepted_voice_entry(key, text, qa, reference_hash):
            errors.append(f"{key}: missing, stale, or below voice QA threshold")
            continue
        expected = {
            "file": f"{key}.m4a",
            "dur": duration(AUDIO / f"{key}.m4a"),
            "textHash": text_hash(text),
        }
        if manifest.get(key) != expected:
            errors.append(f"{key}: manifest entry is stale")
    return errors


def run_checks(stage: str) -> int:
    checks = {
        "hub": check_hub,
        "layered": check_layered,
        "voice": check_voice,
    }
    selected = list(checks) if stage == "all" else [stage]
    errors: list[str] = []
    for name in selected:
        stage_errors = checks[name]()
        status = "PASS" if not stage_errors else "FAIL"
        print(f"check {name}: {status}")
        errors.extend(f"{name}: {error}" for error in stage_errors)
    for error in errors:
        print(f"  {error}")
    return 1 if errors else 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "stage", nargs="?", default="all", choices=("all", "hub", "layered", "voice")
    )
    parser.add_argument("--check", action="store_true", help="validate without network calls")
    parser.add_argument("--force", action="store_true", help="ignore valid cached model results")
    parser.add_argument("--timeout", type=int, default=900, help="per-workflow timeout in seconds")
    parser.add_argument("--poll-seconds", type=float, default=3.0)
    args = parser.parse_args()
    if args.timeout < 30 or args.poll_seconds <= 0:
        parser.error("--timeout must be >=30 and --poll-seconds must be positive")
    if args.check:
        return run_checks(args.stage)

    api_base = configured_api()
    if args.stage in {"all", "hub"}:
        produce_hub(api_base, args.force, args.timeout)
    if args.stage in {"all", "layered"}:
        produce_layered(api_base, args.force, args.timeout, args.poll_seconds)
    failures: list[str] = []
    if args.stage in {"all", "voice"}:
        _, failures = produce_voice(api_base, args.force, args.timeout)
    check_status = run_checks(args.stage)
    return 1 if failures or check_status else 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ProductionError, OSError, ValueError) as error:
        print(f"error: {error}", file=sys.stderr)
        raise SystemExit(2)
