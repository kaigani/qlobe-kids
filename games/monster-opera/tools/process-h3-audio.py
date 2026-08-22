#!/usr/bin/env python3
"""Extract and technically QA MiniMax H3 monster-voice candidates.

This tool is local-only: it never calls the configured authoring service.  It
expects raw videos already downloaded by ``generate-media.py video`` and is a
dry run unless ``--execute`` is supplied.  Outputs remain candidates until the
separate Whisper and human isolation checks are accepted.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any


GAME_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = GAME_ROOT.parents[1]
DEFAULT_MANIFEST = GAME_ROOT / "tools" / "video-jobs.jsonl"
RAW_DIR = GAME_ROOT / "assets" / "source" / "video-raw"
OUTPUT_DIR = GAME_ROOT / "assets" / "source" / "audio-h3"
QA_DIR = GAME_ROOT / "assets" / "source" / "qa" / "h3-audio"
CONFIG_PATH = GAME_ROOT / "config.json"
CREATED = "2026-08-18"


def repo_relative(path: Path) -> str:
    return path.resolve().relative_to(REPO_ROOT).as_posix()


def read_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text("utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise SystemExit(f"cannot read {repo_relative(path)}: {exc}") from exc


def read_manifest(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    try:
        lines = path.read_text("utf-8").splitlines()
    except OSError as exc:
        raise SystemExit(f"cannot read manifest {path}: {exc}") from exc
    for line_number, line in enumerate(lines, 1):
        if not line.strip():
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError as exc:
            raise SystemExit(f"manifest line {line_number}: {exc}") from exc
        key = str(row.get("id", ""))
        if not re.fullmatch(r"[a-z0-9][a-z0-9-]*-voice", key):
            raise SystemExit(f"manifest line {line_number}: unsafe voice id {key!r}")
        rows.append(row)
    if not rows:
        raise SystemExit("manifest has no jobs")
    return rows


def command_exists(name: str) -> None:
    if shutil.which(name) is None:
        raise SystemExit(f"required command is unavailable: {name}")


def run(command: list[str], *, capture: bool = False) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(
            command,
            check=True,
            text=True,
            stdout=subprocess.PIPE if capture else subprocess.DEVNULL,
            stderr=subprocess.PIPE if capture else None,
        )
    except subprocess.CalledProcessError as exc:
        detail = (exc.stderr or exc.stdout or "").strip()
        if detail:
            detail = f"\n{detail[-3000:]}"
        raise SystemExit(f"command failed ({' '.join(command[:3])} ...){detail}") from exc


def atomic_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.tmp")
    temporary.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", "utf-8")
    os.replace(temporary, path)


def replace_output(temporary: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    os.replace(temporary, destination)


def ffprobe(path: Path) -> dict[str, Any]:
    completed = run(
        [
            "ffprobe", "-v", "error", "-select_streams", "a:0",
            "-show_entries", "stream=codec_name,sample_rate,channels,channel_layout:format=duration,size",
            "-of", "json", str(path),
        ],
        capture=True,
    )
    payload = json.loads(completed.stdout)
    stream = (payload.get("streams") or [{}])[0]
    fmt = payload.get("format") or {}
    return {
        "codec": stream.get("codec_name"),
        "sampleRate": int(stream.get("sample_rate") or 0),
        "channels": int(stream.get("channels") or 0),
        "channelLayout": stream.get("channel_layout"),
        "durationSeconds": round(float(fmt.get("duration") or 0), 4),
        "bytes": int(fmt.get("size") or path.stat().st_size),
    }


def volume_metrics(path: Path) -> dict[str, float | None]:
    completed = run(
        [
            "ffmpeg", "-hide_banner", "-nostats", "-i", str(path),
            "-af", "volumedetect", "-f", "null", "-",
        ],
        capture=True,
    )
    metrics: dict[str, float | None] = {"meanVolumeDb": None, "maxVolumeDb": None}
    for key, label in (("meanVolumeDb", "mean_volume"), ("maxVolumeDb", "max_volume")):
        matches = re.findall(rf"{label}:\s*(-?(?:inf|\d+(?:\.\d+)?))\s*dB", completed.stderr)
        if matches and matches[-1] != "-inf":
            metrics[key] = float(matches[-1])
    return metrics


def render_qa_images(wav: Path, waveform: Path, spectrogram: Path) -> None:
    waveform_tmp = waveform.with_name(f".{waveform.stem}.tmp.png")
    spectrogram_tmp = spectrogram.with_name(f".{spectrogram.stem}.tmp.png")
    waveform.parent.mkdir(parents=True, exist_ok=True)
    run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(wav),
        "-filter_complex", "showwavespic=s=1600x320:colors=0x6BD6BC", "-frames:v", "1",
        str(waveform_tmp),
    ])
    run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(wav),
        "-lavfi", "showspectrumpic=s=1600x640:legend=1:color=fiery", "-frames:v", "1",
        str(spectrogram_tmp),
    ])
    replace_output(waveform_tmp, waveform)
    replace_output(spectrogram_tmp, spectrogram)


def process_one(
    row: dict[str, Any],
    syllables: dict[str, str],
    *,
    execute: bool,
    overwrite: bool,
) -> dict[str, Any]:
    job_id = str(row["id"])
    monster_id = job_id.removesuffix("-voice")
    if monster_id not in syllables:
        raise SystemExit(f"manifest id {job_id!r} has no cast entry in config.json")
    max_duration = 3.4 if monster_id == "coral" else 1.6
    expected_phrase = "bop bop bop" if monster_id == "coral" else syllables[monster_id]
    raw = RAW_DIR / f"{job_id}-raw.mp4"
    wav = OUTPUT_DIR / f"{monster_id}.wav"
    mp3 = OUTPUT_DIR / f"{monster_id}.candidate.mp3"
    waveform = QA_DIR / f"{monster_id}.waveform.png"
    spectrogram = QA_DIR / f"{monster_id}.spectrogram.png"
    qa_path = QA_DIR / f"{monster_id}.audio.qa.json"
    recipe_path = mp3.with_name(f"{mp3.name}.recipe.json")

    result: dict[str, Any] = {
        "id": monster_id,
        "source": repo_relative(raw),
        "sourceExists": raw.is_file(),
        "outputs": {
            "wav": repo_relative(wav),
            "candidateMp3": repo_relative(mp3),
            "waveform": repo_relative(waveform),
            "spectrogram": repo_relative(spectrogram),
            "qa": repo_relative(qa_path),
            "recipe": repo_relative(recipe_path),
        },
        "maxDurationSeconds": max_duration,
        "expectedSyllable": expected_phrase,
    }
    if not execute:
        return result
    if not raw.is_file():
        raise SystemExit(f"raw H3 video does not exist: {repo_relative(raw)}")

    should_process = overwrite or not (wav.is_file() and mp3.is_file())
    if should_process:
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        wav_tmp = OUTPUT_DIR / f".{monster_id}.tmp.wav"
        mp3_tmp = OUTPUT_DIR / f".{monster_id}.candidate.tmp.mp3"
        # Drop leading/trailing near-silence, retain the useful authoring window,
        # soften both cut edges, and normalize to the runtime sample target.
        audio_filter = (
            "silenceremove=start_periods=1:start_silence=0.02:start_threshold=-45dB:"
            "stop_periods=1:stop_silence=0.06:stop_threshold=-45dB,"
            f"atrim=start=0:end={max_duration:.3f},asetpts=N/SR/TB,"
            "highpass=f=90,lowpass=f=8500,"
            "afade=t=in:st=0:d=0.018,areverse,afade=t=in:st=0:d=0.035,areverse,"
            "loudnorm=I=-20:LRA=7:TP=-2"
        )
        run([
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(raw),
            "-map", "0:a:0", "-vn", "-af", audio_filter,
            "-ar", "44100", "-ac", "1", "-c:a", "pcm_s16le", str(wav_tmp),
        ])
        run([
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(wav_tmp),
            "-ar", "44100", "-ac", "1", "-c:a", "libmp3lame", "-b:a", "96k",
            str(mp3_tmp),
        ])
        replace_output(wav_tmp, wav)
        replace_output(mp3_tmp, mp3)

    wav_probe = ffprobe(wav)
    mp3_probe = ffprobe(mp3)
    volumes = volume_metrics(wav)
    max_volume = volumes["maxVolumeDb"]
    mean_volume = volumes["meanVolumeDb"]
    checks = {
        "duration": 0.25 <= wav_probe["durationSeconds"] <= max_duration + 0.12,
        "mono": wav_probe["channels"] == 1 and mp3_probe["channels"] == 1,
        "sampleRate": wav_probe["sampleRate"] == 44100 and mp3_probe["sampleRate"] == 44100,
        "nonEmpty": mean_volume is not None and mean_volume > -55,
        "notClipped": max_volume is not None and max_volume <= -0.2,
    }
    automated_pass = all(checks.values())
    render_qa_images(wav, waveform, spectrogram)
    qa = {
        "format": "monster-opera-audio-qa",
        "formatVersion": 1,
        "id": monster_id,
        "source": repo_relative(raw),
        "candidate": repo_relative(mp3),
        "expectedSyllable": expected_phrase,
        "technicalGate": {
            "status": "passed" if automated_pass else "failed",
            "checks": checks,
            "wav": wav_probe,
            "mp3": mp3_probe,
            "levels": volumes,
        },
        "artifacts": {
            "waveform": repo_relative(waveform),
            "spectrogram": repo_relative(spectrogram),
        },
        "whisper": {
            "status": "pending",
            "command": (
                "python3 games/monster-opera/tools/generate-media.py --execute transcribe "
                f"{repo_relative(mp3)} --expected '{expected_phrase}'"
            ),
        },
        "manualIsolationReview": "pending",
        "productionAcceptance": "pending-whisper-and-manual-review",
        "created": CREATED,
    }
    recipe = {
        "format": "qlobe-recipe",
        "formatVersion": 1,
        "id": f"monster-opera-h3-{monster_id}",
        "kind": "voice",
        "asset": mp3.name,
        "steps": [
            {
                "workflow": "minimax-h3-r2v",
                "prompt": str(row.get("prompt", "")),
                "seed": int(row.get("seed", 42)),
                "width": int(row.get("width", 832)),
                "height": int(row.get("height", 480)),
                "duration": float(row.get("duration", 5)),
                "referenceImage": str(row.get("reference_image", "")),
                "output": repo_relative(raw),
            },
            {
                "op": "extract-normalize",
                "source": repo_relative(raw),
                "output": repo_relative(wav),
                "tool": "tools/process-h3-audio.py",
                "mono": True,
                "sampleRate": 44100,
                "trimmedMaximumSeconds": max_duration,
                "filters": ["silenceremove -45 dB", "highpass 90 Hz", "lowpass 8.5 kHz", "loudnorm -20 LUFS / -2 dBTP"],
            },
            {
                "op": "encode",
                "source": repo_relative(wav),
                "output": repo_relative(mp3),
                "codec": "libmp3lame",
                "bitrate": "96k",
            },
        ],
        "refs": {
            "promptManifest": repo_relative(DEFAULT_MANIFEST),
            "referenceImage": str(row.get("reference_image", "")),
            "expectedSyllable": expected_phrase,
            "qa": repo_relative(qa_path),
        },
        "derivedFrom": repo_relative(raw),
        "qa": {
            "status": "review" if automated_pass else "rejected",
            "technicalGate": "passed" if automated_pass else "failed",
            "whisper": "pending",
            "manualIsolationReview": "pending",
        },
        "created": CREATED,
    }
    atomic_json(qa_path, qa)
    atomic_json(recipe_path, recipe)
    result.update({"processed": should_process, "automatedPass": automated_pass, "checks": checks})
    return result


def parser() -> argparse.ArgumentParser:
    value = argparse.ArgumentParser(description=__doc__)
    value.add_argument("manifest", nargs="?", type=Path, default=DEFAULT_MANIFEST)
    value.add_argument("--monster", action="append", default=[], help="limit to a monster id; repeatable")
    value.add_argument("--execute", action="store_true", help="run local FFmpeg processing")
    value.add_argument("--overwrite", action="store_true", help="rebuild candidate WAV and MP3 files")
    return value


def main() -> None:
    args = parser().parse_args()
    manifest = args.manifest.resolve()
    if args.execute:
        command_exists("ffmpeg")
        command_exists("ffprobe")
    config = read_json(CONFIG_PATH)
    syllables = {str(item["id"]): str(item["syllable"]) for item in config.get("cast", [])}
    wanted = set(args.monster)
    unknown = wanted - set(syllables)
    if unknown:
        raise SystemExit(f"unknown monster id(s): {', '.join(sorted(unknown))}")
    rows = [
        row for row in read_manifest(manifest)
        if not wanted or str(row["id"]).removesuffix("-voice") in wanted
    ]
    if not rows:
        raise SystemExit("no matching manifest rows")
    results = [
        process_one(row, syllables, execute=args.execute, overwrite=args.overwrite)
        for row in rows
    ]
    payload = {
        "dryRun": not args.execute,
        "count": len(results),
        "allAutomatedPass": all(item.get("automatedPass", False) for item in results) if args.execute else None,
        "results": results,
    }
    print(json.dumps(payload, indent=2, sort_keys=True))
    if args.execute and not payload["allAutomatedPass"]:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
