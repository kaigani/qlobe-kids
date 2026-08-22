#!/usr/bin/env python3
"""Generate every configured narration clip through Qwen voice clone.

The script keeps candidates and their model metadata under
``assets/source/local-api/voice``, normalizes accepted clips to mono AAC,
Whisper-checks every line, and writes the runtime manifest consumed by
``shared/js/voice-clips.js``. Private endpoint and reference paths are read
from flags, environment, or git-ignored ``tools/state/local.json`` and are
never written to provenance.
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
from pathlib import Path

GAME = Path(__file__).resolve().parents[1]
ROOT = GAME.parents[1]
OUT = GAME / "assets/audio"
CANDIDATES = GAME / "assets/source/local-api/voice"
CONFIG = GAME / "config.json"
LOCAL_STATE = ROOT / "tools/state/local.json"
FALLBACK_REFERENCE = ROOT / "games/color-gradient-cards/assets/audio/welcome.m4a"
SEEDS = (7, 8, 9)


def read_json(path: Path) -> dict:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else {}
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def readable_file(path: Path | None) -> bool:
    if not path:
        return False
    try:
        with path.open("rb") as handle:
            return bool(handle.read(1))
    except OSError:
        return False


def text_hash(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()[:16]


def load_lines() -> dict[str, str]:
    voice = read_json(CONFIG).get("voice")
    if not isinstance(voice, dict):
        raise ValueError("config.json voice must be an object")
    return {str(key): str(value) for key, value in voice.items() if str(value).strip()}


def run(command: list[str], timeout: int) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, capture_output=True, text=True, timeout=timeout)


def duration(path: Path) -> float:
    result = run(
        [
            "ffprobe", "-v", "error", "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1", str(path),
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
            "ffmpeg", "-hide_banner", "-nostats", "-i", str(path),
            "-af", "volumedetect", "-f", "null", "-",
        ],
        60,
    )
    match = re.search(r"mean_volume:\s*(-?[0-9.]+) dB", result.stderr)
    return round(float(match.group(1)), 1) if match else None


def clone(api_base: str, reference: Path, text: str, seed: int, dest: Path) -> None:
    result = run(
        [
            "curl", "-sS", "-X", "POST",
            f"{api_base}/workflows/qwen3-tts-voiceclone?sync=true",
            "-F", f"voice=@{reference}", "-F", f"text={text}",
            "-F", f"seed={seed}", "--output", str(dest), "--max-time", "900",
        ],
        930,
    )
    if result.returncode or not dest.is_file() or dest.stat().st_size < 2_000:
        reason = f"curl exit {result.returncode}" if result.returncode else "empty audio"
        raise RuntimeError(f"voiceclone request failed ({reason})")


def encode(source: Path, destination: Path) -> None:
    result = run(
        [
            "ffmpeg", "-y", "-loglevel", "error", "-i", str(source),
            "-af",
            "silenceremove=start_periods=1:start_silence=0.04:start_threshold=-45dB,"
            "areverse,silenceremove=start_periods=1:start_silence=0.10:"
            "start_threshold=-45dB,areverse,loudnorm=I=-18:TP=-2:LRA=9",
            "-c:a", "aac", "-b:a", "96k", "-ar", "24000", "-ac", "1",
            "-movflags", "+faststart", str(destination),
        ],
        60,
    )
    if result.returncode or not destination.is_file() or destination.stat().st_size < 2_000:
        raise RuntimeError(f"ffmpeg encode failed (exit {result.returncode})")


def transcribe(api_base: str, clip: Path, expected: str) -> str:
    result = run(
        [
            "curl", "-sS", "-X", "POST",
            f"{api_base}/workflows/whisper-stt?sync=true",
            "-F", f"audio=@{clip}", "-F", "model_size=base", "-F", "language=en",
            "-F", f"initial_prompt={expected}", "--max-time", "900",
        ],
        930,
    )
    if result.returncode:
        return ""
    try:
        payload = json.loads(result.stdout)
        return str(payload.get("text") or payload.get("transcript") or "").strip()
    except json.JSONDecodeError:
        return ""


def normalize(text: str) -> str:
    return " ".join(re.findall(r"[a-z0-9]+", text.lower()))


def transcript_score(expected: str, heard: str) -> tuple[bool, float, float]:
    want, got = normalize(expected), normalize(heard)
    ratio = difflib.SequenceMatcher(None, want, got).ratio()
    expected_words, heard_words = want.split(), got.split()
    coverage = sum(word in heard_words for word in expected_words) / max(1, len(expected_words))
    accepted = want == got or (
        len(expected_words) > 1 and ratio >= 0.92 and coverage >= 0.95
    )
    return accepted, round(ratio, 3), round(coverage, 3)


def candidate_paths(key: str, seed: int) -> tuple[Path, Path]:
    stem = f"{key}-seed{seed}"
    return CANDIDATES / f"{stem}.m4a", CANDIDATES / f"{stem}.json"


def generate_candidate(
    api_base: str,
    reference: Path,
    key: str,
    text: str,
    seed: int,
    force: bool,
) -> dict:
    candidate, sidecar = candidate_paths(key, seed)
    cached = read_json(sidecar)
    if (
        not force and candidate.is_file()
        and cached.get("textHash") == text_hash(text)
        and duration(candidate) >= 0.35
    ):
        return {**cached, "generated": True}
    with tempfile.TemporaryDirectory(prefix="reset-voice-") as directory:
        source = Path(directory) / f"{key}.flac"
        try:
            clone(api_base, reference, text, seed, source)
            encode(source, candidate)
        except RuntimeError as error:
            return {"generated": False, "seed": seed, "error": str(error)}
    record = {
        "engine": "qwen3-tts-voiceclone",
        "voice": "voice_teacher",
        "seed": seed,
        "sourceText": text,
        "textHash": text_hash(text),
        "duration": duration(candidate),
        "meanVolumeDb": mean_volume(candidate),
        "bytes": candidate.stat().st_size,
        "generated": True,
    }
    sidecar.write_text(json.dumps(record, indent=2, ensure_ascii=False) + "\n")
    return record


def check_candidate(api_base: str, key: str, expected: str, seed: int) -> dict:
    candidate, sidecar = candidate_paths(key, seed)
    seconds = duration(candidate)
    mean_db = mean_volume(candidate)
    transcript = transcribe(api_base, candidate, expected)
    match, score, coverage = transcript_score(expected, transcript)
    audio_ok = (
        candidate.is_file() and candidate.stat().st_size >= 2_000
        and 0.35 <= seconds <= 20
        and mean_db is not None and -36 <= mean_db <= -5
    )
    valid = bool(audio_ok and match)
    record = {
        **read_json(sidecar),
        "seed": seed,
        "valid": valid,
        "transcript": transcript,
        "score": score,
        "coverage": coverage,
        "duration": seconds,
        "meanVolumeDb": mean_db,
        "error": None if valid else (
            f"Whisper mismatch: {transcript!r}" if not match
            else f"audio QA failed (dur={seconds}s, db={mean_db})"
        ),
    }
    sidecar.write_text(json.dumps(record, indent=2, ensure_ascii=False) + "\n")
    return record


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", action="append", help="restrict to a configured voice key")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--qwen-url")
    parser.add_argument("--voice-ref")
    args = parser.parse_args()

    lines = load_lines()
    state = read_json(LOCAL_STATE)
    api_base = (
        args.qwen_url or os.environ.get("QLOBE_QWEN_URL")
        or state.get("qwenUrl") or ""
    ).rstrip("/")
    voice_ref = (
        args.voice_ref or os.environ.get("QLOBE_VOICE_REF")
        or state.get("teacherVoicePath") or ""
    )
    reference = Path(voice_ref).expanduser() if voice_ref else None

    if not args.check:
        if not api_base:
            sys.exit("approved LAN endpoint is missing")
        if not readable_file(reference):
            if args.voice_ref or not readable_file(FALLBACK_REFERENCE):
                sys.exit("approved teacher-voice reference is missing or unreadable")
            reference = FALLBACK_REFERENCE
            print("configured reference is unreadable; using the approved project voice asset", flush=True)
        for binary in ("curl", "ffmpeg", "ffprobe"):
            if not shutil.which(binary):
                sys.exit(f"required binary is missing: {binary}")

    selected = [
        key for key in lines
        if not args.only or any(key == value for value in args.only)
    ]
    if not selected:
        sys.exit("--only did not match any configured voice key")

    OUT.mkdir(parents=True, exist_ok=True)
    CANDIDATES.mkdir(parents=True, exist_ok=True)
    previous = read_json(OUT / "qa.json")
    qa = {key: value for key, value in previous.items() if key in lines}
    pending = []
    for key in selected:
        prior = qa.get(key, {})
        clip = OUT / f"{key}.m4a"
        fresh = (
            not args.force and clip.is_file() and prior.get("valid")
            and prior.get("engine") == "qwen3-tts-voiceclone"
            and prior.get("textHash") == text_hash(lines[key])
        )
        if fresh:
            print(f"{key}: cached", flush=True)
        else:
            pending.append(key)

    if args.check:
        for key in pending:
            qa[key] = {"valid": False, "error": "missing or stale approved clip"}
    else:
        (OUT / "lines.json").write_text(
            json.dumps(lines, indent=2, ensure_ascii=False) + "\n"
        )
        for seed in SEEDS:
            if not pending:
                break
            generated = {}
            print(f"TTS batch seed {seed}: {len(pending)} line(s)", flush=True)
            for key in pending:
                generated[key] = generate_candidate(
                    api_base, reference, key, lines[key], seed, args.force
                )

            retry = []
            print(f"Whisper batch seed {seed}: {len(pending)} line(s)", flush=True)
            for key in pending:
                old_attempts = [
                    attempt for attempt in qa.get(key, {}).get("attempts", [])
                    if attempt.get("seed") != seed
                ]
                if generated[key].get("generated"):
                    attempt = check_candidate(api_base, key, lines[key], seed)
                else:
                    attempt = {
                        "seed": seed,
                        "valid": False,
                        "error": generated[key].get("error", "generation failed"),
                    }
                attempts = old_attempts + [attempt]
                if attempt.get("valid"):
                    source, _ = candidate_paths(key, seed)
                    destination = OUT / f"{key}.m4a"
                    shutil.copy2(source, destination)
                    qa[key] = {
                        "engine": "qwen3-tts-voiceclone",
                        "voice": "voice_teacher",
                        "seed": seed,
                        "sourceText": lines[key],
                        "textHash": text_hash(lines[key]),
                        "duration": duration(destination),
                        "meanVolumeDb": attempt.get("meanVolumeDb"),
                        "bytes": destination.stat().st_size,
                        "transcript": attempt.get("transcript", ""),
                        "score": attempt.get("score"),
                        "coverage": attempt.get("coverage"),
                        "valid": True,
                        "attempts": attempts,
                    }
                    print(f"{key}: accepted seed {seed} -> {attempt.get('transcript', '')}", flush=True)
                else:
                    qa[key] = {
                        "sourceText": lines[key],
                        "textHash": text_hash(lines[key]),
                        "valid": False,
                        "error": attempt.get("error"),
                        "attempts": attempts,
                    }
                    retry.append(key)
                    print(f"{key}: retry after seed {seed} - {attempt.get('error', '')}", flush=True)
            pending = retry

    manifest = {
        key: {
            "file": f"{key}.m4a",
            "dur": qa[key]["duration"],
            "textHash": text_hash(text),
        }
        for key, text in lines.items()
        if (
            qa.get(key, {}).get("valid")
            and qa[key].get("textHash") == text_hash(text)
            and (OUT / f"{key}.m4a").is_file()
        )
    }
    if not args.check:
        (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
        (OUT / "qa.json").write_text(
            json.dumps(qa, indent=2, ensure_ascii=False) + "\n"
        )
    failures = [key for key in lines if key not in manifest]
    print(f"complete: {len(manifest)}/{len(lines)}; failures={failures}")
    return 1 if any(key in failures for key in selected) else 0


if __name__ == "__main__":
    raise SystemExit(main())
