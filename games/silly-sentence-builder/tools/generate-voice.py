#!/usr/bin/env python3
"""Build and Whisper-check the complete Silly Sentence Builder voice pack.

The committed game config is the single source of truth. The LAN endpoint and
approved platform narrator reference are supplied at generation time and are
never written to the repository; receipts retain only the reference checksum.
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
import subprocess
import sys
import tempfile
from pathlib import Path


GAME = Path(__file__).resolve().parents[1]
ROOT = GAME.parents[1]
CONFIG = GAME / "config.json"
OUT = GAME / "assets" / "audio"
SOURCE = GAME / "assets" / "source" / "voice"
PLATFORM_VOICE = ROOT / "shared" / "assets" / "refs" / "voice-teacher.wav"
SEEDS = (7, 8, 9)


def run(command: list[str], timeout: int) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(command, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired as error:
        stdout = error.stdout.decode(errors="replace") if isinstance(error.stdout, bytes) else (error.stdout or "")
        stderr = error.stderr.decode(errors="replace") if isinstance(error.stderr, bytes) else (error.stderr or "")
        return subprocess.CompletedProcess(command, 124, stdout, f"{stderr}\ncommand timed out")
    except OSError as error:
        return subprocess.CompletedProcess(command, 127, "", str(error))


def redact(value: str) -> str:
    return re.sub(
        r"(?:https?://)?(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?",
        "[configured LAN endpoint]",
        value,
    )


def normalize(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.lower())


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    digest.update(path.read_bytes())
    return digest.hexdigest()


def text_hash(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()[:16]


def write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    temporary.replace(path)


def lines_from_config() -> dict[str, str]:
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    lines = dict(config["voice"])
    for choices in config["choices"].values():
        for choice in choices:
            lines[choice["voiceKey"]] = choice["say"]
    return lines


def duration(path: Path) -> float:
    result = run([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "csv=p=0", str(path),
    ], 30)
    try:
        return round(float(result.stdout.strip()), 3) if result.returncode == 0 else 0.0
    except ValueError:
        return 0.0


def mean_volume(path: Path) -> float | None:
    result = run([
        "ffmpeg", "-hide_banner", "-nostats", "-i", str(path),
        "-af", "volumedetect", "-f", "null", "-",
    ], 60)
    match = re.search(r"mean_volume:\s*(-?[0-9.]+) dB", result.stderr)
    return round(float(match.group(1)), 1) if match else None


def threshold(key: str) -> float:
    return 0.88 if key in {
        "welcome", "mode-silly", "mode-sillier", "drag-hint", "session-complete"
    } else 0.90


def score(key: str, intended: str, heard: str) -> tuple[bool, float]:
    target = normalize(intended)
    transcript = normalize(heard)
    ratio = difflib.SequenceMatcher(None, target, transcript).ratio()
    return (target == transcript or ratio >= threshold(key)), round(ratio, 3)


def synthesize(
    api: str,
    reference: Path,
    key: str,
    text: str,
    seed: int,
    stage: Path,
) -> tuple[str, Path | None, Path | None, str]:
    raw = stage / f"{key}-{seed}.flac"
    encoded = stage / f"{key}-{seed}.m4a"
    response = run([
        "curl", "-sS", "-X", "POST",
        f"{api}/workflows/qwen3-tts-voiceclone?sync=true",
        "-F", f"voice=@{reference}", "-F", f"text={text}", "-F", f"seed={seed}",
        "--output", str(raw), "--max-time", "900",
    ], 930)
    if response.returncode or not raw.is_file() or raw.stat().st_size < 2_000:
        size = raw.stat().st_size if raw.is_file() else 0
        detail = redact(response.stderr.strip())[:200]
        return key, None, None, f"TTS rc={response.returncode}, bytes={size}, {detail}"
    encoded_result = run([
        "ffmpeg", "-y", "-loglevel", "error", "-i", str(raw),
        "-af", "loudnorm=I=-18:TP=-2:LRA=9", "-ac", "1", "-ar", "48000",
        "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", str(encoded),
    ], 90)
    if encoded_result.returncode or not encoded.is_file() or encoded.stat().st_size < 2_000:
        return key, None, None, "AAC encode failed"
    return key, raw, encoded, ""


def transcribe(
    api: str,
    key: str,
    intended: str,
    seed: int,
    raw: Path,
    encoded: Path,
) -> tuple[str, dict | None, str]:
    response = run([
        "curl", "-sS", "-X", "POST", f"{api}/workflows/whisper-stt?sync=true",
        "-F", f"audio=@{encoded}", "-F", "model_size=base", "-F", "language=en",
        "-F", f"initial_prompt={intended}", "--max-time", "900",
    ], 930)
    try:
        payload = json.loads(response.stdout)
        heard = str(payload.get("text") or payload.get("transcription") or "").strip()
    except (json.JSONDecodeError, AttributeError):
        payload = {}
        heard = ""
    accepted, ratio = score(key, intended, heard)
    seconds = duration(encoded)
    volume = mean_volume(encoded)
    audio_ok = encoded.stat().st_size >= 2_000 and 0.2 <= seconds <= 20 and volume is not None and -36 <= volume <= -5
    if response.returncode or not accepted or not audio_ok:
        detail = redact(response.stderr.strip())[:160]
        return key, None, (
            f"seed {seed}: transcript={heard!r}, ratio={ratio}, duration={seconds}, "
            f"mean={volume}, stderr={detail}"
        )

    destination = OUT / f"{key}.m4a"
    raw_destination = SOURCE / "raw" / f"{key}.flac"
    destination.write_bytes(encoded.read_bytes())
    raw_destination.parent.mkdir(parents=True, exist_ok=True)
    raw_destination.write_bytes(raw.read_bytes())
    transcript_payload = {
        "intended": intended,
        "heard": heard,
        "ratio": ratio,
        "model": "whisper-base",
    }
    write_json(SOURCE / "transcripts" / f"{key}.json", transcript_payload)
    return key, {
        "valid": True,
        "engine": "qwen3-tts-voiceclone",
        "voice": "platform-teacher-narrator",
        "seed": seed,
        "intended": intended,
        "heard": heard,
        "ratio": ratio,
        "duration": duration(destination),
        "meanVolumeDb": volume,
        "bytes": destination.stat().st_size,
        "sha256": sha256(destination),
        "rawSha256": sha256(raw_destination),
        "textHash": text_hash(intended),
        "checkedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }, ""


def generate(args: argparse.Namespace, lines: dict[str, str], api: str, reference: Path) -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    SOURCE.mkdir(parents=True, exist_ok=True)
    write_json(OUT / "lines.json", lines)
    try:
        old_qa = json.loads((OUT / "qa.json").read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        old_qa = {}
    reference_hash = sha256(reference)
    receipts: dict[str, dict] = {}
    pending: dict[str, str] = {}
    failures: dict[str, str] = {}
    for key, text in lines.items():
        path = OUT / f"{key}.m4a"
        prior = old_qa.get(key, {})
        reusable = (
            not args.force and path.is_file() and prior.get("valid") is True
            and prior.get("intended") == text and prior.get("referenceSha256") == reference_hash
            and prior.get("sha256") == sha256(path) and prior.get("ratio", 0) >= threshold(key)
        )
        if reusable:
            receipts[key] = prior
            print(f"{key}: reused", flush=True)
        else:
            pending[key] = text

    workers = max(1, min(args.workers, 3))
    with tempfile.TemporaryDirectory(prefix="qlobe-silly-voice-") as folder:
        stage = Path(folder)
        for seed in SEEDS:
            if not pending:
                break
            batch = list(pending.items())
            print(f"seed {seed}: TTS batch {len(batch)}", flush=True)
            candidates: dict[str, tuple[Path, Path]] = {}
            with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
                jobs = ((api, reference, key, text, seed, stage) for key, text in batch)
                for key, raw, encoded, error in pool.map(lambda values: synthesize(*values), jobs):
                    if raw and encoded:
                        candidates[key] = (raw, encoded)
                    else:
                        failures[key] = error
            print(f"seed {seed}: Whisper batch {len(candidates)}", flush=True)
            with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
                jobs = (
                    (api, key, pending[key], seed, raw, encoded)
                    for key, (raw, encoded) in candidates.items()
                )
                for key, receipt, error in pool.map(lambda values: transcribe(*values), jobs):
                    if receipt:
                        receipt["referenceSha256"] = reference_hash
                        receipts[key] = receipt
                        pending.pop(key, None)
                        failures.pop(key, None)
                        print(f"{key}: passed seed {seed}", flush=True)
                    else:
                        failures[key] = error

    for key, text in pending.items():
        receipts[key] = {
            "valid": False,
            "intended": text,
            "textHash": text_hash(text),
            "error": failures.get(key, "no successful attempt"),
            "checkedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        }
    manifest = {
        key: {
            "file": f"{key}.m4a",
            "dur": receipt["duration"],
            "sha256": receipt["sha256"],
            "textHash": text_hash(lines[key]),
        }
        for key, receipt in receipts.items() if receipt.get("valid") is True
    }
    missing = [key for key in lines if key not in manifest]
    write_json(OUT / "qa.json", receipts)
    write_json(OUT / "manifest.json", manifest if not missing else {})
    write_json(SOURCE / "recipe.json", {
        "engine": "qwen3-tts-voiceclone",
        "reference": "shared/assets/refs/voice-teacher.wav",
        "referenceSha256": reference_hash,
        "seedSchedule": list(SEEDS),
        "acceptedSeedCounts": {
            str(seed): sum(1 for receipt in receipts.values() if receipt.get("valid") and receipt.get("seed") == seed)
            for seed in SEEDS
        },
        "runtimeFormat": "AAC-LC, mono, 48 kHz, 96 kbps, -18 LUFS target",
        "transcriptionQa": "whisper-base, English, per-line similarity threshold",
        "lineCount": len(lines),
        "passed": len(manifest),
    })
    print(f"complete: {len(manifest)}/{len(lines)}; failures={missing}", flush=True)
    return 1 if missing else 0


def check(lines: dict[str, str]) -> int:
    try:
        manifest = json.loads((OUT / "manifest.json").read_text(encoding="utf-8"))
        qa = json.loads((OUT / "qa.json").read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError) as error:
        print(f"voice check failed: {error}", file=sys.stderr)
        return 1
    failures: list[str] = []
    if set(manifest) != set(lines) or set(qa) != set(lines):
        failures.append("key-set")
    for key, intended in lines.items():
        receipt = qa.get(key, {})
        entry = manifest.get(key, {})
        path = OUT / str(entry.get("file", ""))
        valid = (
            receipt.get("valid") is True and receipt.get("intended") == intended
            and receipt.get("ratio", 0) >= threshold(key)
            and re.fullmatch(r"[0-9a-f]{64}", str(receipt.get("referenceSha256", "")))
            and path.is_file() and path.stat().st_size > 2_000
            and entry.get("sha256") == sha256(path) and 0.2 <= duration(path) <= 20
        )
        if not valid:
            failures.append(key)
    print(f"voice check: {len(lines) - len(failures)}/{len(lines)}; failures={failures}")
    return 1 if failures else 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--qwen-url")
    parser.add_argument("--voice-ref")
    parser.add_argument("--workers", type=int, default=2)
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    lines = lines_from_config()
    if args.check:
        return check(lines)
    api = (args.qwen_url or os.getenv("QLOBE_QWEN_URL") or "").rstrip("/")
    reference = Path(args.voice_ref or os.getenv("QLOBE_TEACHER_VOICE") or PLATFORM_VOICE)
    if not api or not reference.is_file():
        print("generation requires QLOBE_QWEN_URL and an approved narrator reference", file=sys.stderr)
        return 2
    return generate(args, lines, api, reference)


if __name__ == "__main__":
    raise SystemExit(main())
