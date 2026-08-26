#!/usr/bin/env python3
"""Finalize and compose the two approved Shape Detective title-word layers."""
from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image

GAME = Path(__file__).resolve().parents[1]
ROOT = GAME.parents[1]
SOURCE = GAME / "assets/source/layer2/title"
WORK = GAME / "assets/source/finalized/title"
QA = GAME / "assets/source/qa/title"
PIPE = ROOT / "tools/pipeline/cutout_finalize.py"
OUTPUT = GAME / "assets/title.webp"
WORDS = ("shape", "detective")


def relative(path: Path) -> str:
    return str(path.relative_to(ROOT))


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def normalize_alpha(source: Path, output: Path) -> None:
    image = Image.open(source).convert("RGBA")
    alpha = image.getchannel("A").point(
        lambda value: 0 if value <= 16 else 255 if value >= 244 else value
    )
    image.putalpha(alpha)
    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output, "PNG", optimize=True)


def canonical_finalize(source: Path, output: Path, magenta: Path) -> dict:
    command = [
        sys.executable,
        str(PIPE),
        "--input", str(source),
        "--output", str(output),
        "--magenta", str(magenta),
        "--max-size", "1000",
        "--pad", "14",
        "--alpha-floor", "16",
    ]
    result = subprocess.run(command, capture_output=True, text=True)
    try:
        report = json.loads(result.stdout.strip().splitlines()[-1])
    except (IndexError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"canonical title finalizer returned no report: {result.stderr}") from exc
    if result.returncode or report.get("pass") is not True or not output.is_file():
        raise RuntimeError(f"canonical title finalizer rejected {source.name}: {report}")
    return report


def compose(parts: list[Image.Image]) -> Image.Image:
    widest = max(part.width for part in parts)
    target_width = min(1000, widest)
    scale = target_width / max(widest, 1)
    scaled = [
        part.resize(
            (max(1, round(part.width * scale)), max(1, round(part.height * scale))),
            Image.Resampling.LANCZOS,
        )
        for part in parts
    ]
    gap = 2
    canvas = Image.new("RGBA", (target_width, sum(part.height for part in scaled) + gap), (0, 0, 0, 0))
    y = 0
    for part in scaled:
        canvas.alpha_composite(part, ((target_width - part.width) // 2, y))
        y += part.height + gap
    return canvas


def main() -> None:
    WORK.mkdir(parents=True, exist_ok=True)
    QA.mkdir(parents=True, exist_ok=True)
    reports = {}
    parts = []
    sources = []
    for word in WORDS:
        source = SOURCE / f"{word}-seed42.png"
        if not source.is_file():
            raise SystemExit(f"missing title layer: {source}")
        normalized = WORK / f"{word}-alpha-normalized.png"
        final = WORK / f"{word}-final.png"
        magenta = QA / f"{word}-magenta.png"
        normalize_alpha(source, normalized)
        reports[word] = canonical_finalize(normalized, final, magenta)
        parts.append(Image.open(final).convert("RGBA"))
        sources.append(source)

    title = compose(parts)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    title.save(OUTPUT, "WEBP", quality=94, method=6)
    qa = Image.new("RGBA", title.size, (255, 0, 255, 255))
    qa.alpha_composite(title)
    qa.convert("RGB").save(QA / "title-magenta.png", "PNG", optimize=True)

    record = {
        "workflow": "qwen-image-layered layer_2 + alpha normalization + canonical cutout finalization + deterministic vertical composition",
        "sources": [
            {"path": relative(path), "sha256": sha256(path)} for path in sources
        ],
        "alphaNormalization": {"floorAtOrBelow": 16, "opaqueAtOrAbove": 244},
        "canonicalReports": reports,
        "composition": {"width": title.width, "height": title.height, "gapPx": 2, "alignment": "center"},
        "runtime": relative(OUTPUT),
        "runtimeSha256": sha256(OUTPUT),
        "magentaQa": relative(QA / "title-magenta.png"),
    }
    (QA / "processing.json").write_text(json.dumps(record, indent=2) + "\n")
    print(json.dumps(record, indent=2))


if __name__ == "__main__":
    main()
