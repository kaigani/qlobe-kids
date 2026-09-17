#!/usr/bin/env python3
"""Generate and Whisper-QA Snack Addition Stories' teacher voice pack.

``config.json`` is the source of truth for every spoken line. Private LAN and
voice-reference paths come from CLI flags, environment, or the git-ignored
``tools/state/local.json``; they are never written to a committed manifest.
TTS is fully batched before Whisper so the authoring host does not thrash
between models.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import difflib
import hashlib
import json
import os
import re
import shutil
import subprocess
from pathlib import Path


HERE = Path(__file__).resolve().parent
GAME = HERE.parent
ROOT = GAME.parents[1]
OUT = GAME / "assets" / "audio"
RAW = GAME / "assets" / "source" / "audio" / "raw"
LOCAL_CONFIG = ROOT / "tools" / "state" / "local.json"
DEFAULT_VOICE = ROOT / "shared" / "assets" / "refs" / "voice-teacher.wav"
SEEDS = (7, 8, 9)


def load_lines() -> dict[str, str]:
    config = json.loads((GAME / "config.json").read_text(encoding="utf-8"))
    lines = config.get("voice")
    if not isinstance(lines, dict) or not lines:
        raise SystemExit("config.json must contain a non-empty voice map")
    invalid = [key for key, value in lines.items() if not isinstance(value, str) or not value.strip()]
    if invalid:
        raise SystemExit("invalid voice entries: " + ", ".join(invalid))
    return lines


def normalized(text: str) -> str:
    number_tokens = {
        "zero": "0", "one": "1", "two": "2", "three": "3",
        "four": "4", "five": "5", "six": "6",
    }
    return " ".join(number_tokens.get(token, token) for token in re.findall(r"[a-z0-9]+", text.lower()))


def duration(path: Path) -> float:
    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        return 0.0
    run = subprocess.run(
        [ffprobe, "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
        capture_output=True,
        text=True,
    )
    try:
        return round(float(run.stdout.strip()), 3)
    except ValueError:
        return 0.0


def curl_asset(endpoint: str, fields: list[str], destination: Path, min_bytes: int = 1000) -> bool:
    command = ["curl", "-fSs", "-X", "POST", endpoint]
    for field in fields:
        command.extend(["-F", field])
    command.extend(["--output", str(destination), "--max-time", "900"])
    try:
        run = subprocess.run(command, capture_output=True, timeout=930)
    except subprocess.TimeoutExpired:
        return False
    return run.returncode == 0 and destination.exists() and destination.stat().st_size >= min_bytes


def synthesize(base: str, voice: Path, key: str, text: str, seed: int) -> tuple[str, int, bool]:
    raw = RAW / f"{key}.flac"
    endpoint = f"{base}/workflows/qwen3-tts-voiceclone?sync=true"
    ok = curl_asset(endpoint, [f"voice=@{voice}", f"text={text}", f"seed={seed}"], raw)
    if not ok:
        return key, seed, False
    encoded = OUT / f"{key}.m4a"
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        return key, seed, False
    run = subprocess.run(
        [
            ffmpeg, "-y", "-loglevel", "error", "-i", str(raw), "-vn",
            "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-c:a", "aac",
            "-b:a", "96k", "-movflags", "+faststart", str(encoded),
        ],
        capture_output=True,
        timeout=180,
    )
    valid = run.returncode == 0 and encoded.exists() and 0.25 < duration(encoded) < 28
    return key, seed, valid


def transcribe(base: str, key: str) -> tuple[str, str]:
    clip = OUT / f"{key}.m4a"
    result = RAW / f"{key}.whisper.json"
    endpoint = f"{base}/workflows/whisper-stt?sync=true"
    ok = curl_asset(endpoint, [f"audio=@{clip}", "model_size=base", "language=en"], result, min_bytes=2)
    if not ok:
        return key, ""
    try:
        payload = json.loads(result.read_text(encoding="utf-8"))
        transcript = str(payload.get("text") or "").strip()
    except (OSError, ValueError):
        transcript = ""
    result.unlink(missing_ok=True)
    return key, transcript


def transcript_ratio(intended: str, heard: str) -> float:
    return round(difflib.SequenceMatcher(None, normalized(intended), normalized(heard)).ratio(), 3)


def transcript_passes(key: str, intended: str, heard: str) -> bool:
    """Keep high aggregate similarity from hiding a misheard game title."""
    if transcript_ratio(intended, heard) < 0.72:
        return False
    required_tokens = {
        "welcome": {"snack", "adding", "stories"},
    }
    heard_tokens = set(normalized(heard).split())
    return required_tokens.get(key, set()).issubset(heard_tokens)


def settings(args: argparse.Namespace) -> tuple[str, Path]:
    local: dict = {}
    if LOCAL_CONFIG.exists():
        local = json.loads(LOCAL_CONFIG.read_text(encoding="utf-8"))
    base = str(args.api_url or os.environ.get("QLOBE_QWEN_URL") or local.get("qwenUrl") or "").rstrip("/")
    candidates = [args.voice, os.environ.get("QLOBE_TEACHER_VOICE"), local.get("teacherVoicePath"), str(DEFAULT_VOICE)]
    voice = next((Path(value) for value in candidates if value and Path(value).is_file()), None)
    if not base:
        raise SystemExit("no API URL; use --api-url, QLOBE_QWEN_URL, or tools/state/local.json")
    if not voice:
        raise SystemExit("no readable approved voice reference")
    return base, voice


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--api-url")
    parser.add_argument("--voice")
    parser.add_argument("--workers", type=int, default=3)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    lines = load_lines()
    base, voice = settings(args)
    OUT.mkdir(parents=True, exist_ok=True)
    RAW.mkdir(parents=True, exist_ok=True)

    previous: dict[str, str] = {}
    if (OUT / "lines.json").exists():
        previous = json.loads((OUT / "lines.json").read_text(encoding="utf-8"))
    todo = []
    for key, text in lines.items():
        clip = OUT / f"{key}.m4a"
        reusable = clip.exists() and 0.25 < duration(clip) < 28 and previous.get(key) == text
        if args.force or not reusable:
            todo.append((key, text))

    synth_seeds: dict[str, int] = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
        futures = [pool.submit(synthesize, base, voice, key, text, SEEDS[0]) for key, text in todo]
        for future in concurrent.futures.as_completed(futures):
            key, seed, ok = future.result()
            if ok:
                synth_seeds[key] = seed
            print(f"tts {key}: {'ok' if ok else 'failed'}", flush=True)

    transcripts: dict[str, str] = {}
    valid_keys = [key for key in lines if (OUT / f"{key}.m4a").exists()]
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
        futures = [pool.submit(transcribe, base, key) for key in valid_keys]
        for future in concurrent.futures.as_completed(futures):
            key, heard = future.result()
            transcripts[key] = heard
            print(f"whisper {key}: {transcript_ratio(lines[key], heard):.3f}", flush=True)

    for key in valid_keys:
        ratio = transcript_ratio(lines[key], transcripts.get(key, ""))
        if transcript_passes(key, lines[key], transcripts.get(key, "")):
            continue
        for seed in SEEDS[1:]:
            _, _, ok = synthesize(base, voice, key, lines[key], seed)
            if not ok:
                continue
            _, heard = transcribe(base, key)
            transcripts[key] = heard
            synth_seeds[key] = seed
            ratio = transcript_ratio(lines[key], heard)
            print(f"retry {key} seed {seed}: {ratio:.3f}", flush=True)
            if transcript_passes(key, lines[key], heard):
                break

    manifest: dict[str, dict] = {}
    qa: dict[str, dict] = {}
    failures: list[str] = []
    for key, text in lines.items():
        clip = OUT / f"{key}.m4a"
        heard = transcripts.get(key, "")
        ratio = transcript_ratio(text, heard)
        clip_duration = duration(clip) if clip.exists() else 0.0
        passed = clip.exists() and 0.25 < clip_duration < 28 and transcript_passes(key, text, heard)
        qa[key] = {
            "intended": text,
            "transcript": heard,
            "similarity": ratio,
            "pass": passed,
            "duration": clip_duration,
            "ttsWorkflow": "qwen3-tts-voiceclone",
            "qaWorkflow": "whisper-stt",
            "seed": synth_seeds.get(key, SEEDS[0]),
            "voiceReference": "approved-project-teacher-reference",
        }
        if passed:
            manifest[key] = {
                "file": clip.name,
                "dur": clip_duration,
                "textHash": hashlib.sha256(text.encode("utf-8")).hexdigest()[:16],
            }
        else:
            failures.append(key)
            clip.unlink(missing_ok=True)

    (OUT / "lines.json").write_text(json.dumps(lines, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    (OUT / "qa.json").write_text(json.dumps(qa, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"complete: {len(manifest)}/{len(lines)} Whisper-approved clips", flush=True)
    if failures:
        print("omitted for device-speech fallback: " + ", ".join(failures), flush=True)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
