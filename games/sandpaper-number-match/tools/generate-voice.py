#!/usr/bin/env python3
"""Generate and transcript-QA Sandpaper Number Match teacher narration.

The authoring-only LAN endpoint may be supplied with ``--api`` or
``QLOBE_QWEN_URL``. The approved voice reference may be supplied with
``--reference`` or defaults to the committed platform teacher reference. No
host name or machine-local path is written to a receipt. Publication is
fail-closed: the runtime manifest is empty unless every configured line passes.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import datetime
import difflib
import hashlib
import json
import os
import re
import shutil
import subprocess
from pathlib import Path


GAME = Path(__file__).resolve().parents[1]
ROOT = GAME.parents[1]
CONFIG = GAME / "config.json"
OUT = GAME / "assets" / "audio"
RAW = GAME / "assets" / "source" / "local-api" / "voice"
DEFAULT_REF = ROOT / "shared" / "assets" / "refs" / "voice-teacher.wav"
SEEDS = (7, 8, 9)


def run(command: list[str], timeout: int = 930) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(command, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        return subprocess.CompletedProcess(command, 124, "", f"timeout after {timeout}s")


def normalized(text: str) -> str:
    return " ".join(re.findall(r"[a-z0-9]+", text.lower()))


def transcript_score(expected: str, heard: str) -> tuple[bool, float, float]:
    wanted = normalized(expected)
    got = normalized(heard)
    ratio = round(difflib.SequenceMatcher(None, wanted, got).ratio(), 3)
    wanted_words = wanted.split()
    got_words = got.split()
    coverage = round(sum(1 for word in wanted_words if word in got_words) / max(1, len(wanted_words)), 3)
    accepted = coverage == 1 and ratio >= 0.78 if len(wanted_words) <= 2 else ratio >= 0.86 and coverage >= 0.86
    return accepted, ratio, coverage


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def text_hash(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()[:16]


def duration(path: Path) -> float:
    result = run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)], 30)
    try:
        return round(float(result.stdout.strip()), 3)
    except (TypeError, ValueError):
        return 0.0


def mean_volume(path: Path) -> float | None:
    result = run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-af", "volumedetect", "-f", "null", "-"], 60)
    match = re.search(r"mean_volume:\s*(-?[0-9.]+) dB", result.stderr)
    return round(float(match.group(1)), 1) if match else None


def write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    temporary.replace(path)


def synthesize(api: str, reference: Path, key: str, text: str, seed: int) -> tuple[str, Path | None, str]:
    raw = RAW / f"{key}-seed{seed}.flac"
    candidate = RAW / f"{key}-seed{seed}.m4a"
    if candidate.is_file() and duration(candidate) >= 0.3:
        return key, candidate, ""
    request = run([
        "curl", "-sS", "-X", "POST", f"{api}/workflows/qwen3-tts-voiceclone?sync=true",
        "-F", f"voice=@{reference}", "-F", f"text={text}", "-F", f"seed={seed}",
        "--output", str(raw), "--max-time", "900",
    ])
    if request.returncode or not raw.exists() or raw.stat().st_size < 2_000:
        size = raw.stat().st_size if raw.exists() else 0
        return key, None, f"seed {seed}: TTS failed rc={request.returncode}, bytes={size}"
    encode = run([
        "ffmpeg", "-y", "-loglevel", "error", "-i", str(raw), "-vn",
        "-af", "silenceremove=start_periods=1:start_silence=0.04:start_threshold=-45dB,"
        "areverse,silenceremove=start_periods=1:start_silence=0.10:start_threshold=-45dB,"
        "areverse,loudnorm=I=-18:TP=-2:LRA=9",
        "-ac", "1", "-ar", "44100", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", str(candidate),
    ], 180)
    if encode.returncode or not candidate.exists() or candidate.stat().st_size < 2_000:
        return key, None, f"seed {seed}: encode failed"
    return key, candidate, ""


def transcribe(api: str, key: str, text: str, seed: int, clip: Path) -> tuple[str, dict | None, str]:
    transcript_path = RAW / f"{key}-seed{seed}-transcript.json"
    request = run([
        "curl", "-sS", "-X", "POST", f"{api}/workflows/whisper-stt?sync=true",
        "-F", f"audio=@{clip}", "-F", "model_size=base", "-F", "language=en",
        "-F", f"initial_prompt={text}", "--output", str(transcript_path), "--max-time", "900",
    ])
    try:
        payload = json.loads(transcript_path.read_text(encoding="utf-8"))
        heard = str(payload.get("text") or payload.get("transcript") or "").strip()
    except (FileNotFoundError, json.JSONDecodeError):
        heard = ""
    accepted, ratio, coverage = transcript_score(text, heard)
    seconds, volume = duration(clip), mean_volume(clip)
    audio_ok = 0.3 <= seconds <= 20 and volume is not None and -38 <= volume <= -4
    if request.returncode or not accepted or not audio_ok:
        detail = f"heard={heard!r}, ratio={ratio}, coverage={coverage}, duration={seconds}, meanVolumeDb={volume}"
        return key, None, f"seed {seed}: {detail}"
    return key, {
        "valid": True, "engine": "qwen3-tts-voiceclone", "verifier": "whisper-stt/base/en",
        "voice": "platform-teacher-narrator", "seed": seed, "intended": text, "heard": heard,
        "ratio": ratio, "coverage": coverage, "duration": seconds, "meanVolumeDb": volume,
        "bytes": clip.stat().st_size, "sha256": digest(clip), "textHash": text_hash(text),
        "checkedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }, ""


def read_json(path: Path, fallback: object) -> object:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return fallback


def retained_receipts(lines: dict[str, str]) -> dict[str, dict]:
    report = read_json(OUT / "qa-report.json", {})
    entries = report.get("entries", {}) if isinstance(report, dict) else {}
    manifest = read_json(OUT / "manifest.json", {})
    retained = {}
    for key, text in lines.items():
        receipt = entries.get(key, {}) if isinstance(entries, dict) else {}
        entry = manifest.get(key, {}) if isinstance(manifest, dict) else {}
        clip = OUT / str(entry.get("file", ""))
        if (receipt.get("valid") is True and receipt.get("intended") == text
                and receipt.get("textHash") == text_hash(text) and clip.is_file()
                and clip.stat().st_size > 2_000 and receipt.get("sha256") == digest(clip)):
            retained[key] = receipt
    return retained


def generate(args: argparse.Namespace, lines: dict[str, str]) -> int:
    api = (args.api or os.environ.get("QLOBE_QWEN_URL") or "").rstrip("/")
    reference = Path(args.reference).expanduser() if args.reference else DEFAULT_REF
    if not api:
        raise RuntimeError("pass --api or set QLOBE_QWEN_URL")
    if not reference.is_file():
        raise RuntimeError("approved teacher voice reference is missing")
    for binary in ("curl", "ffmpeg", "ffprobe"):
        if not shutil.which(binary):
            raise RuntimeError(f"required binary is missing: {binary}")
    OUT.mkdir(parents=True, exist_ok=True)
    RAW.mkdir(parents=True, exist_ok=True)
    receipts = {} if args.force else retained_receipts(lines)
    pending = {key: text for key, text in lines.items() if key not in receipts}
    failures: dict[str, str] = {}
    workers = max(1, min(3, args.workers))
    if receipts:
        print(f"retained {len(receipts)} transcript-approved clip(s)", flush=True)

    for seed in SEEDS:
        if not pending:
            break
        batch = list(pending.items())
        print(f"seed {seed}: generating {len(batch)} candidate(s)", flush=True)
        jobs = [(api, reference, key, text, seed) for key, text in batch]
        candidates: dict[str, Path] = {}
        with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
            for key, clip, error in pool.map(lambda values: synthesize(*values), jobs):
                if clip:
                    candidates[key] = clip
                else:
                    failures[key] = error
        print(f"seed {seed}: Whisper-checking {len(candidates)} candidate(s)", flush=True)
        checks = [(api, key, pending[key], seed, clip) for key, clip in candidates.items()]
        with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
            for key, receipt, error in pool.map(lambda values: transcribe(*values), checks):
                if not receipt:
                    failures[key] = error
                    print(f"{key}: retry ({error})", flush=True)
                    continue
                destination = OUT / f"{key}.m4a"
                shutil.copy2(candidates[key], destination)
                receipt.update({"bytes": destination.stat().st_size, "sha256": digest(destination)})
                receipts[key] = receipt
                pending.pop(key, None)
                failures.pop(key, None)
                write_json(OUT / f"{key}.m4a.recipe.json", {
                    "recipeVersion": "qlobe-recipe-v1", "file": destination.name,
                    "workflow": "qwen3-tts-voiceclone", "text": lines[key],
                    "textHash": text_hash(lines[key]), "seed": seed,
                    "encoding": {"codec": "aac", "container": "m4a", "sampleRate": 44100, "channels": 1, "bitrate": 96000},
                    "whisper": {"workflow": "whisper-stt", "model": "base", "language": "en", "score": receipt["ratio"], "coverage": receipt["coverage"], "transcript": receipt["heard"]},
                    "teacherReference": "shared/assets/refs/voice-teacher.wav",
                })
                print(f"{key}: accepted seed {seed}", flush=True)

    reference_hash = digest(reference)
    for receipt in receipts.values():
        receipt["referenceSha256"] = reference_hash
    for key, text in pending.items():
        receipts[key] = {"valid": False, "intended": text, "textHash": text_hash(text), "error": failures.get(key, "no successful candidate")}
    manifest = {
        key: {"file": f"{key}.m4a", "dur": receipt["duration"], "sha256": receipt["sha256"],
              "textHash": text_hash(lines[key]), "seed": receipt["seed"]}
        for key, receipt in receipts.items() if receipt.get("valid") is True
    }
    report = {
        "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "engine": "qwen3-tts-voiceclone", "verifier": "whisper-stt/base/en",
        "voiceReferenceSha256": reference_hash, "entries": receipts,
    }
    write_json(OUT / "qa-report.json", report)
    write_json(OUT / "manifest.json", manifest if not pending else {})
    print(f"complete: {len(manifest)}/{len(lines)}; failures={list(pending)}", flush=True)
    return 1 if pending else 0


def check(lines: dict[str, str]) -> int:
    manifest = read_json(OUT / "manifest.json", {})
    report = read_json(OUT / "qa-report.json", {})
    entries = report.get("entries", {}) if isinstance(report, dict) else {}
    failures = []
    for key, text in lines.items():
        entry = manifest.get(key, {}) if isinstance(manifest, dict) else {}
        receipt = entries.get(key, {}) if isinstance(entries, dict) else {}
        clip = OUT / str(entry.get("file", ""))
        valid = (receipt.get("valid") is True and receipt.get("intended") == text
                 and receipt.get("textHash") == text_hash(text) and entry.get("textHash") == text_hash(text)
                 and clip.is_file() and clip.stat().st_size > 2_000 and entry.get("sha256") == digest(clip)
                 and receipt.get("sha256") == digest(clip) and 0.3 <= duration(clip) <= 20)
        if not valid:
            failures.append(key)
    print(f"voice check: {len(lines) - len(failures)}/{len(lines)}; failures={failures}")
    return 1 if failures else 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--api", help="approved LAN wrapper base URL")
    parser.add_argument("--reference", help="approved teacher-voice reference WAV")
    parser.add_argument("--workers", type=int, default=2)
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    lines = json.loads(CONFIG.read_text(encoding="utf-8"))["voice"]
    write_json(OUT / "lines.json", lines)
    if args.check:
        return check(lines)
    try:
        return generate(args, lines)
    except Exception as error:
        write_json(OUT / "manifest.json", {})
        print(f"generation failed closed: {error}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
