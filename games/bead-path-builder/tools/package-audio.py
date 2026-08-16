#!/usr/bin/env python3
"""Encode Bead Path Builder voice clips and write runtime audio indexes."""
from __future__ import annotations

import argparse
import json
import math
import os
import subprocess
import tempfile
from pathlib import Path

GAME_ROOT = Path(__file__).resolve().parents[1]


def atomic_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(value, handle, ensure_ascii=False, indent=2, sort_keys=True)
            handle.write("\n")
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def probe(path: Path) -> float:
    command = ["ffprobe", "-v", "error", "-select_streams", "a:0",
               "-show_entries", "stream=codec_name,codec_type,channels,duration",
               "-of", "json", str(path)]
    result = subprocess.run(command, check=False, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(f"ffprobe failed for {path.name}: {result.stderr.strip()}")
    streams = json.loads(result.stdout).get("streams", [])
    if not streams:
        raise RuntimeError(f"{path.name}: no audio stream")
    stream = streams[0]
    duration = float(stream.get("duration", "nan"))
    if (stream.get("codec_name") != "aac" or stream.get("channels") != 1
            or not math.isfinite(duration) or duration <= 0 or path.stat().st_size == 0):
        raise RuntimeError(f"{path.name}: output is not valid mono AAC audio")
    return duration


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--lines", type=Path, default=GAME_ROOT / "tools/voice-lines.jsonl")
    parser.add_argument("--raw-dir", type=Path, default=GAME_ROOT / "assets/source/voice-raw")
    parser.add_argument("--audio-dir", type=Path, default=GAME_ROOT / "assets/audio")
    parser.add_argument("--overwrite", action="store_true")
    parser.add_argument("--dry-run", action="store_true", help="validate inputs without encoding or writing")
    args = parser.parse_args()

    rows = []
    for number, line in enumerate(args.lines.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError as exc:
            raise SystemExit(f"line {number}: invalid JSON ({exc})") from exc
        if not isinstance(row, dict) or not isinstance(row.get("id"), str) or not isinstance(row.get("text"), str):
            raise SystemExit(f"line {number}: expected id and text")
        rows.append(row)
    if not rows:
        raise SystemExit("voice-lines.jsonl is empty")
    for row in rows:
        source = args.raw_dir / f"{row['id']}.flac"
        if not source.is_file():
            raise SystemExit(f"missing raw clip: {source}")

    durations = {}
    for row in rows:
        ident = row["id"]
        output = args.audio_dir / f"{ident}.m4a"
        if output.is_file() and not args.overwrite:
            durations[ident] = probe(output)
            continue
        if args.dry_run:
            continue
        output.parent.mkdir(parents=True, exist_ok=True)
        # Keep the media extension last so ffmpeg can infer the MP4/M4A muxer.
        temporary = output.with_name(f".{output.stem}.tmp{output.suffix}")
        command = ["ffmpeg", "-y", "-i", str(args.raw_dir / f"{ident}.flac"),
                   "-map", "0:a:0", "-ac", "1", "-ar", "44100", "-c:a", "aac",
                   "-profile:a", "aac_low", "-b:a", "96k", "-af",
                   "loudnorm=I=-16:TP=-1.5:LRA=11", "-movflags", "+faststart", str(temporary)]
        try:
            subprocess.run(command, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            durations[ident] = probe(temporary)
            os.replace(temporary, output)
        finally:
            if temporary.exists():
                temporary.unlink()
    if args.dry_run:
        print(f"validated {len(rows)} declared clips")
        return 0
    atomic_json(args.audio_dir / "lines.json", {row["id"]: row["text"] for row in rows})
    atomic_json(args.audio_dir / "manifest.json", {row["id"]: {"file": f"{row['id']}.m4a", "dur": round(durations[row["id"]], 3)} for row in rows})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
