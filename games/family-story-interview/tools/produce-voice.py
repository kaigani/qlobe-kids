#!/usr/bin/env python3
"""Produce transcript-approved, teacher-voice narration on the local LAN API.

The endpoint and approved reference path are injected with environment
variables and are never written to provenance. Candidate takes are retained so
the run is resumable; only Whisper-approved AAC files enter the runtime folder.
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
AUDIO = GAME / "assets" / "audio"
SOURCE = GAME / "assets" / "source" / "voice-clone"
LINES_PATH = AUDIO / "lines.json"
QA_PATH = AUDIO / "qa.json"
MANIFEST_PATH = AUDIO / "manifest.json"
SEEDS = (7, 8, 9)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def text_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def run(command: list[str], timeout: int = 930) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, capture_output=True, text=True, timeout=timeout)


def duration(path: Path) -> float:
    result = run([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", str(path),
    ], 30)
    try:
        return round(float(result.stdout.strip()), 3)
    except (TypeError, ValueError):
        return 0.0


def mean_volume(path: Path) -> float | None:
    result = run([
        "ffmpeg", "-hide_banner", "-nostats", "-i", str(path),
        "-af", "volumedetect", "-f", "null", "-",
    ], 60)
    match = re.search(r"mean_volume:\s*(-?[0-9.]+) dB", result.stderr)
    return round(float(match.group(1)), 1) if match else None


def normalize(text: str) -> str:
    return " ".join(re.findall(r"[a-z0-9]+", text.lower()))


def transcript_score(expected: str, heard: str) -> tuple[bool, float, float]:
    want, got = normalize(expected), normalize(heard)
    ratio = difflib.SequenceMatcher(None, want, got).ratio()
    expected_words, heard_words = want.split(), got.split()
    coverage = sum(word in heard_words for word in expected_words) / max(1, len(expected_words))
    accepted = want == got or (ratio >= 0.92 and coverage >= 0.95)
    return accepted, round(ratio, 3), round(coverage, 3)


def candidate_paths(key: str, seed: int) -> tuple[Path, Path]:
    stem = f"{key}-seed{seed}"
    return SOURCE / f"{stem}.m4a", SOURCE / f"{stem}.json"


def clone(api: str, voice_ref: Path, text: str, seed: int, destination: Path) -> dict:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="family-story-voice-") as folder:
        raw = Path(folder) / "take.flac"
        response = run([
            "curl", "-sS", "-X", "POST",
            f"{api}/workflows/qwen3-tts-voiceclone?sync=true",
            "-F", f"voice=@{voice_ref}", "-F", f"text={text}",
            "-F", f"seed={seed}", "--output", str(raw), "--max-time", "900",
        ])
        if response.returncode or not raw.is_file() or raw.stat().st_size < 2_000:
            return {"generated": False, "seed": seed, "error": "voice clone request failed"}
        encoded = run([
            "ffmpeg", "-y", "-loglevel", "error", "-i", str(raw),
            "-af", "silenceremove=start_periods=1:start_silence=0.04:start_threshold=-45dB,"
            "areverse,silenceremove=start_periods=1:start_silence=0.10:"
            "start_threshold=-45dB,areverse,loudnorm=I=-18:TP=-2:LRA=9",
            "-c:a", "aac", "-b:a", "96k", "-ar", "24000", "-ac", "1",
            "-movflags", "+faststart", str(destination),
        ], 90)
    seconds = duration(destination) if destination.exists() else 0.0
    if encoded.returncode or not destination.exists() or destination.stat().st_size < 2_000 or seconds < 0.25:
        destination.unlink(missing_ok=True)
        return {"generated": False, "seed": seed, "error": "audio encode failed"}
    return {
        "generated": True,
        "seed": seed,
        "duration": seconds,
        "meanVolumeDb": mean_volume(destination),
        "bytes": destination.stat().st_size,
        "audioSha256": sha256(destination),
    }


def transcribe(api: str, audio: Path, expected: str) -> str:
    response = run([
        "curl", "-sS", "-X", "POST", f"{api}/workflows/whisper-stt?sync=true",
        "-F", f"audio=@{audio}", "-F", "model_size=base", "-F", "language=en",
        "-F", f"initial_prompt={expected}", "--max-time", "900",
    ])
    if response.returncode:
        return ""
    try:
        payload = json.loads(response.stdout)
    except json.JSONDecodeError:
        return ""
    return str(payload.get("text") or payload.get("transcript") or "").strip()


def valid_cached(key: str, text: str, qa: dict) -> bool:
    entry = qa.get(key, {})
    runtime = AUDIO / f"{key}.m4a"
    return bool(
        entry.get("valid")
        and entry.get("textHash") == text_hash(text)
        and runtime.is_file()
        and duration(runtime) >= 0.25
    )


def write_outputs(lines: dict[str, str], qa: dict) -> tuple[dict, list[str]]:
    manifest = {}
    for key, text in lines.items():
        runtime = AUDIO / f"{key}.m4a"
        entry = qa.get(key, {})
        if entry.get("valid") and entry.get("textHash") == text_hash(text) and runtime.is_file():
            manifest[key] = {
                "file": runtime.name,
                "dur": duration(runtime),
                "textHash": text_hash(text),
            }
    failures = [key for key in lines if key not in manifest]
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    QA_PATH.write_text(json.dumps(qa, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return manifest, failures


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    lines = json.loads(LINES_PATH.read_text(encoding="utf-8"))
    qa = json.loads(QA_PATH.read_text(encoding="utf-8")) if QA_PATH.exists() else {}
    pending = [key for key, text in lines.items() if args.force or not valid_cached(key, text, qa)]
    if args.check:
        manifest, failures = write_outputs(lines, qa)
        print(f"complete: accepted={len(manifest)} rejected={len(failures)} failed={failures}")
        return 1 if failures else 0

    api = os.environ.get("QLOBE_QWEN_URL", "").rstrip("/")
    reference_value = os.environ.get("QLOBE_TEACHER_VOICE") or os.environ.get("QLOBE_VOICE_REF") or ""
    reference = Path(reference_value).expanduser()
    if not api or not reference.is_file():
        sys.exit("QLOBE_QWEN_URL and QLOBE_TEACHER_VOICE must reference approved local resources")
    for binary in ("curl", "ffmpeg", "ffprobe"):
        if not shutil.which(binary):
            sys.exit(f"required binary missing: {binary}")

    AUDIO.mkdir(parents=True, exist_ok=True)
    SOURCE.mkdir(parents=True, exist_ok=True)
    reference_hash = sha256(reference)
    for seed in SEEDS:
        if not pending:
            break
        generated: dict[str, dict] = {}
        print(f"TTS seed {seed}: {len(pending)} lines", flush=True)
        for index, key in enumerate(pending, 1):
            text = lines[key]
            candidate, sidecar = candidate_paths(key, seed)
            cached = {}
            if candidate.exists() and sidecar.exists() and not args.force:
                try:
                    cached = json.loads(sidecar.read_text(encoding="utf-8"))
                except json.JSONDecodeError:
                    cached = {}
            if cached.get("generated") and cached.get("textHash") == text_hash(text):
                generated[key] = cached
            else:
                generated[key] = clone(api, reference, text, seed, candidate)
                generated[key].update({
                    "engine": "qwen3-tts-voiceclone",
                    "voice": "approved-teacher-reference",
                    "voiceRefSha256": reference_hash,
                    "sourceText": text,
                    "textHash": text_hash(text),
                })
                sidecar.write_text(json.dumps(generated[key], indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
            print(f"  [{index}/{len(pending)}] {key}: {'ready' if generated[key].get('generated') else 'failed'}", flush=True)

        print(f"Whisper seed {seed}: {len(pending)} lines", flush=True)
        retry = []
        for index, key in enumerate(pending, 1):
            text = lines[key]
            candidate, sidecar = candidate_paths(key, seed)
            prior_attempts = [a for a in qa.get(key, {}).get("attempts", []) if a.get("seed") != seed]
            if not generated[key].get("generated") or not candidate.exists():
                attempt = {"seed": seed, "valid": False, "error": generated[key].get("error", "candidate missing")}
            else:
                heard = transcribe(api, candidate, text)
                match, score, coverage = transcript_score(text, heard)
                seconds = duration(candidate)
                volume = mean_volume(candidate)
                audio_ok = 0.35 <= seconds <= 24 and volume is not None and -36 <= volume <= -5
                attempt = {
                    "seed": seed,
                    "valid": bool(match and audio_ok),
                    "transcript": heard,
                    "score": score,
                    "coverage": coverage,
                    "duration": seconds,
                    "meanVolumeDb": volume,
                    "error": None if match and audio_ok else ("Whisper mismatch" if not match else "audio QA failed"),
                }
            attempts = prior_attempts + [attempt]
            if attempt["valid"]:
                runtime = AUDIO / f"{key}.m4a"
                shutil.copy2(candidate, runtime)
                qa[key] = {
                    "engine": "qwen3-tts-voiceclone",
                    "verifier": "whisper-stt",
                    "voice": "approved-teacher-reference",
                    "voiceRefSha256": reference_hash,
                    "seed": seed,
                    "sourceText": text,
                    "textHash": text_hash(text),
                    "duration": duration(runtime),
                    "meanVolumeDb": attempt["meanVolumeDb"],
                    "bytes": runtime.stat().st_size,
                    "audioSha256": sha256(runtime),
                    "transcript": attempt["transcript"],
                    "score": attempt["score"],
                    "coverage": attempt["coverage"],
                    "valid": True,
                    "attempts": attempts,
                }
                status = "accepted"
            else:
                qa[key] = {
                    "sourceText": text,
                    "textHash": text_hash(text),
                    "valid": False,
                    "error": attempt.get("error"),
                    "attempts": attempts,
                }
                retry.append(key)
                status = "retry"
            candidate_record = dict(generated[key])
            candidate_record.update(attempt)
            sidecar.write_text(json.dumps(candidate_record, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
            print(f"  [{index}/{len(pending)}] {key}: {status}", flush=True)
        pending = retry
        write_outputs(lines, qa)

    manifest, failures = write_outputs(lines, qa)
    print(f"complete: accepted={len(manifest)} rejected={len(failures)} failed={failures}")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
