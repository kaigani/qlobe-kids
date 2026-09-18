#!/usr/bin/env python3
"""Build the complete teacher narration set and verify it with Whisper.

The approved LAN URL is read only from the ignored tools/state/local.json (or
QLOBE_QWEN_URL). Candidates are produced in seed-wide batches so the host swaps
between TTS and Whisper at most twice per seed. Runtime delivery is all-or-none.
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
from pathlib import Path


GAME = Path(__file__).resolve().parents[1]
ROOT = GAME.parents[1]
LINES_PATH = GAME / "data" / "lines.json"
AUDIO = GAME / "assets" / "audio"
SOURCE = GAME / "assets" / "source" / "local-api" / "voice"
STATE = ROOT / "tools" / "state" / "local.json"
REFERENCE = ROOT / "shared" / "assets" / "refs" / "voice-teacher.wav"
SEEDS = (7, 8, 9)


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def run(command: list[str], timeout: int = 930) -> subprocess.CompletedProcess:
    return subprocess.run(command, capture_output=True, timeout=timeout, check=False)


def duration(path: Path) -> float:
    result = run([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", str(path),
    ], 30)
    try:
        return round(float(result.stdout.decode().strip()), 3)
    except (ValueError, UnicodeDecodeError):
        return 0.0


def mean_volume(path: Path) -> float | None:
    result = run([
        "ffmpeg", "-hide_banner", "-nostats", "-i", str(path),
        "-af", "volumedetect", "-f", "null", "-",
    ], 90)
    match = re.search(r"mean_volume:\s*(-?[0-9.]+) dB", result.stderr.decode(errors="replace"))
    return round(float(match.group(1)), 1) if match else None


def normalized(text: str) -> str:
    return " ".join(re.findall(r"[a-z0-9]+", text.lower()))


def transcript_score(wanted: str, heard: str) -> tuple[bool, float, float]:
    expected = normalized(wanted)
    actual = normalized(heard)
    ratio = difflib.SequenceMatcher(None, expected, actual).ratio()
    words = expected.split()
    heard_words = actual.split()
    coverage = sum(word in heard_words for word in words) / max(1, len(words))
    accepted = actual == expected or (ratio >= 0.92 and coverage >= 0.95)
    return accepted, round(ratio, 3), round(coverage, 3)


def text_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def file_hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def settings() -> tuple[str, Path]:
    try:
        local = json.loads(STATE.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        local = {}
    base = (os.environ.get("QLOBE_QWEN_URL") or local.get("qwenUrl") or "").rstrip("/")
    configured = os.environ.get("QLOBE_VOICE_REF") or local.get("teacherVoicePath") or ""
    reference = Path(configured).expanduser() if configured else REFERENCE
    if not reference.is_file() and REFERENCE.is_file():
        reference = REFERENCE
    if not base or not reference.is_file():
        raise SystemExit("approved local voice API or teacher reference is unavailable")
    return base, reference


def upload(endpoint: str, fields: list[str], output: Path, min_bytes: int) -> bool:
    output.parent.mkdir(parents=True, exist_ok=True)
    command = ["curl", "-sS", "-X", "POST", endpoint]
    for field in fields:
        command.extend(["-F", field])
    command.extend(["--output", str(output), "--max-time", "900"])
    result = run(command)
    return result.returncode == 0 and output.is_file() and output.stat().st_size >= min_bytes


def encode(source: Path, destination: Path) -> bool:
    destination.parent.mkdir(parents=True, exist_ok=True)
    result = run([
        "ffmpeg", "-y", "-loglevel", "error", "-i", str(source), "-vn",
        "-af", "silenceremove=start_periods=1:start_silence=0.04:start_threshold=-45dB,"
        "areverse,silenceremove=start_periods=1:start_silence=0.10:"
        "start_threshold=-45dB,areverse,loudnorm=I=-18:TP=-2:LRA=9",
        "-c:a", "aac", "-b:a", "80k", "-ar", "24000", "-ac", "1",
        "-movflags", "+faststart", str(destination),
    ], 180)
    return result.returncode == 0 and destination.is_file() and duration(destination) >= 0.25


def transcript(path: Path) -> str:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return str(payload.get("text") or payload.get("transcript") or "").strip()
    except (FileNotFoundError, json.JSONDecodeError):
        return ""


def finalize(lines: dict[str, str], qa: dict) -> tuple[dict, list[str]]:
    """Expose clips only when the complete set passed the transcript gate."""
    accepted = []
    manifest = {}
    for key, text in lines.items():
        entry = qa.get(key, {})
        clip = SOURCE / "approved" / f"{key}.m4a"
        if entry.get("accepted") and entry.get("textHash") == text_hash(text) and clip.is_file():
            accepted.append(key)
            manifest[key] = {
                "file": f"{key}.m4a",
                "dur": duration(clip),
                "text": text,
                "textHash": text_hash(text),
                "seed": entry.get("acceptedSeed"),
                "sha256": file_hash(clip),
            }
    complete = len(accepted) == len(lines)
    AUDIO.mkdir(parents=True, exist_ok=True)
    if complete:
        for key in lines:
            shutil.copy2(SOURCE / "approved" / f"{key}.m4a", AUDIO / f"{key}.m4a")
    else:
        for path in AUDIO.glob("*.m4a"):
            path.unlink()
        manifest = {}
    write_json(AUDIO / "manifest.json", manifest)
    return manifest, [key for key in lines if key not in accepted]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    lines = json.loads(LINES_PATH.read_text(encoding="utf-8"))
    try:
        qa = json.loads((SOURCE / "qa-report.json").read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        qa = {}
    manifest, missing = finalize(lines, qa)
    if args.check:
        print(json.dumps({"accepted": len(manifest), "missing": missing}, indent=2))
        return 1 if missing else 0

    base, reference = settings()
    for binary in ("curl", "ffmpeg", "ffprobe"):
        if not shutil.which(binary):
            raise SystemExit(f"required binary missing: {binary}")

    pending = [key for key in lines if args.force or key in missing]
    tts_endpoint = f"{base}/workflows/qwen3-tts-voiceclone?sync=true"
    whisper_endpoint = f"{base}/workflows/whisper-stt?sync=true"

    for seed in SEEDS:
        if not pending:
            break
        print(f"seed {seed}: TTS batch ({len(pending)} lines)", flush=True)
        candidates: dict[str, Path] = {}
        for key in pending:
            raw = SOURCE / "raw" / f"{key}-seed{seed}.flac"
            candidate = SOURCE / "candidates" / f"{key}-seed{seed}.m4a"
            if args.force or not candidate.is_file() or duration(candidate) < 0.25:
                print(f"  TTS {key}", flush=True)
                if (args.force or not raw.is_file() or raw.stat().st_size < 1500) and not upload(
                    tts_endpoint,
                    [f"voice=@{reference}", f"text={lines[key]}", f"seed={seed}"],
                    raw,
                    1500,
                ):
                    continue
                if not encode(raw, candidate):
                    continue
            candidates[key] = candidate

        print(f"seed {seed}: Whisper batch ({len(candidates)} candidates)", flush=True)
        retry = []
        for key in pending:
            candidate = candidates.get(key)
            attempts = [item for item in qa.get(key, {}).get("attempts", []) if item.get("seed") != seed]
            if candidate is None:
                attempts.append({"seed": seed, "accepted": False, "reason": "candidate missing"})
                qa[key] = {"accepted": False, "acceptedSeed": None, "textHash": text_hash(lines[key]), "attempts": attempts}
                retry.append(key)
                continue
            result_path = SOURCE / "transcripts" / f"{key}-seed{seed}.json"
            print(f"  Whisper {key}", flush=True)
            ok = upload(
                whisper_endpoint,
                [f"audio=@{candidate}", "model_size=base", "language=en", f"initial_prompt={lines[key]}"],
                result_path,
                2,
            )
            heard = transcript(result_path) if ok else ""
            accepted, ratio, coverage = transcript_score(lines[key], heard)
            volume = mean_volume(candidate)
            valid = accepted and 0.25 <= duration(candidate) <= 24 and volume is not None and -36 <= volume <= -5
            attempts.append({
                "seed": seed,
                "accepted": valid,
                "score": ratio,
                "coverage": coverage,
                "wanted": lines[key],
                "transcript": heard,
                "duration": duration(candidate),
                "meanVolumeDb": volume,
            })
            qa[key] = {
                "accepted": valid,
                "acceptedSeed": seed if valid else None,
                "textHash": text_hash(lines[key]),
                "engine": "qwen3-tts-voiceclone",
                "verifier": "whisper-stt/base/en",
                "attempts": attempts,
            }
            if valid:
                approved = SOURCE / "approved" / f"{key}.m4a"
                approved.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(candidate, approved)
                print(f"    accepted {ratio:.3f}: {heard}", flush=True)
            else:
                retry.append(key)
                print(f"    retry {ratio:.3f}: {heard}", flush=True)
            write_json(SOURCE / "qa-report.json", qa)
        pending = retry

    write_json(SOURCE / "qa-report.json", qa)
    manifest, missing = finalize(lines, qa)
    write_json(SOURCE / "receipt.json", {
        "workflow": "qwen3-tts-voiceclone → whisper-stt",
        "reference": "shared/assets/refs/voice-teacher.wav",
        "seeds": list(SEEDS),
        "gate": {"normalizedSimilarity": 0.92, "wordCoverage": 0.95},
        "accepted": len(manifest),
        "total": len(lines),
        "runtimeDelivery": "complete" if not missing else "omitted-all-or-none",
    })
    print(f"voice complete: {len(manifest)}/{len(lines)} accepted; missing={missing}", flush=True)
    return 1 if missing else 0


if __name__ == "__main__":
    sys.exit(main())
